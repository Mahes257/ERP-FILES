package com.vishatech.erp.service;

import com.vishatech.erp.config.ErpMetrics;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.InsufficientStorageException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.exception.TooManyRequestsException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class FileStorageService {

    private static final org.slf4j.Logger LOG =
            org.slf4j.LoggerFactory.getLogger(FileStorageService.class);

    private final Path rootLocation;
    private final Set<String> allowedExtensions;
    private final long maxFileSizeBytes;

    private final AttachmentStorageService attachmentStorageService;
    private final ErpMetrics metrics;

    /**
     * Hard ceiling on simultaneous attachment writes. A multipart upload holds
     * a spool copy plus its stored copy, so unbounded parallelism can fill the
     * volume before any single-request limit is ever reached.
     */
    private final Semaphore uploadSlots;
    private final long acquireTimeoutMs;
    /** Refuse a write that would leave the upload volume below this many bytes. */
    private final long minFreeBytes;

    public FileStorageService(@Value("${app.upload.dir}") String uploadDir,
                              @Value("${app.upload.allowed-extensions}") String allowedExtensions,
                              @Value("${spring.servlet.multipart.max-file-size:200MB}") String maxFileSize,
                              @Value("${app.upload.max-concurrent:4}") int maxConcurrentUploads,
                              @Value("${app.upload.acquire-timeout-ms:30000}") long acquireTimeoutMs,
                              @Value("${app.upload.min-free-bytes:5368709120}") long minFreeBytes,
                              AttachmentStorageService attachmentStorageService,
                              ErpMetrics metrics) {
        this.attachmentStorageService = attachmentStorageService;
        this.metrics = metrics;
        this.rootLocation = Paths.get(uploadDir).toAbsolutePath().normalize();
        this.allowedExtensions = parseAllowedExtensions(allowedExtensions);
        this.maxFileSizeBytes = parseSize(maxFileSize);
        this.uploadSlots = new Semaphore(Math.max(1, maxConcurrentUploads), true);
        this.acquireTimeoutMs = Math.max(0, acquireTimeoutMs);
        this.minFreeBytes = Math.max(0, minFreeBytes);
        try {
            Files.createDirectories(rootLocation);
        } catch (IOException e) {
            throw new IllegalStateException("Could not create upload directory", e);
        }
        LOG.info("Upload storage ready at {} (max concurrent uploads: {}, minimum free space: {} bytes)",
                rootLocation, Math.max(1, maxConcurrentUploads), this.minFreeBytes);
    }

    /**
     * Stores an uploaded file using a server-generated name.
     *
     * SECURITY:
     *  - the user-controlled filename is NEVER used as a filesystem path
     *  - only the (sanitized, lowercase) extension is taken from it, and only
     *    if it is on the configured allowlist
     *  - the stored name is a random UUID + safe extension
     *  - size is bounded by the multipart limit (checked here too, in case
     *    the limit configuration changes independently)
     */
    public String store(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            metrics.recordUploadFailure();
            throw new BadRequestException("File is empty");
        }
        if (file.getSize() > maxFileSizeBytes) {
            metrics.recordUploadFailure();
            throw new BadRequestException("File size exceeds the allowed limit");
        }

        String original = sanitizeOriginalName(
                file.getOriginalFilename() == null ? "file" : file.getOriginalFilename());
        String extension = extensionOf(original);
        if (extension == null || !allowedExtensions.contains(extension)) {
            metrics.recordUploadFailure();
            throw new BadRequestException(
                    "File type \"" + (extension == null ? "" : extension)
                            + "\" is not allowed. Accepted types: "
                            + String.join(", ", allowedExtensions));
        }

        boolean acquired = false;
        try {
            acquired = uploadSlots.tryAcquire(acquireTimeoutMs, TimeUnit.MILLISECONDS);
            if (!acquired) {
                metrics.recordUploadFailure();
                throw new TooManyRequestsException(
                        "Too many uploads are in progress. Please retry in a moment.");
            }
            // Pool enforcement and the disk preflight run while this request owns
            // a slot, so simultaneous uploads cannot both pass a stale check.
            attachmentStorageService.assertCanUpload(file.getSize());
            assertDiskSpace(file.getSize());

            String storedName = UUID.randomUUID().toString().replace("-", "") + "." + extension;
            Path target = rootLocation.resolve(storedName).normalize();
            if (!target.startsWith(rootLocation)) {
                metrics.recordUploadFailure();
                throw new BadRequestException("Invalid file path");
            }
            Files.copy(file.getInputStream(), target, StandardCopyOption.REPLACE_EXISTING);
            metrics.recordUploadSuccess(file.getSize());
            return storedName;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            metrics.recordUploadFailure();
            throw new TooManyRequestsException("Upload was interrupted while waiting for capacity. Please retry.");
        } catch (IOException e) {
            metrics.recordUploadFailure();
            throw new IllegalStateException("Failed to store file", e);
        } finally {
            if (acquired) {
                uploadSlots.release();
            }
        }
    }

    /**
     * Rejects a write that would take the upload volume below the configured
     * reserve. Checked before the copy so a full disk fails fast with 507
     * instead of leaving a truncated file behind.
     */
    private void assertDiskSpace(long incomingBytes) {
        if (minFreeBytes <= 0) {
            return;
        }
        try {
            long usable = Files.getFileStore(rootLocation).getUsableSpace();
            if (usable - Math.max(0, incomingBytes) < minFreeBytes) {
                LOG.warn("Upload refused: {} bytes usable, {} bytes incoming, {} bytes reserve required",
                        usable, incomingBytes, minFreeBytes);
                throw new InsufficientStorageException(
                        "The upload volume is below its configured free-space reserve. "
                                + "Free space or increase the volume before retrying.");
            }
        } catch (IOException e) {
            // A filesystem that cannot report free space must not block uploads;
            // the attachment pool limit still applies.
            LOG.warn("Could not read free space for {}: {}", rootLocation, e.getMessage());
        }
    }

    /**
     * Stores raw bytes (e.g. a generated PDF) using a server-generated name.
     * Returns the stored file name.
     */
    public String storeBytes(byte[] data, String extension) {
        if (data == null || data.length == 0) {
            throw new BadRequestException("Data is empty");
        }
        assertDiskSpace(data.length);
        String ext = extension != null ? extension.toLowerCase(Locale.ROOT).replaceFirst("^\\.", "") : "pdf";
        String storedName = UUID.randomUUID().toString().replace("-", "") + "." + ext;
        try {
            Path target = rootLocation.resolve(storedName).normalize();
            if (!target.startsWith(rootLocation)) {
                throw new BadRequestException("Invalid file path");
            }
            Files.write(target, data);
            return storedName;
        } catch (IOException e) {
            throw new IllegalStateException("Failed to store generated file", e);
        }
    }

    public Resource loadAsResource(String storedName) {
        if (!isSafeStoredName(storedName)) {
            throw new BadRequestException("Invalid file name");
        }
        try {
            Path file = rootLocation.resolve(storedName).normalize();
            if (!file.startsWith(rootLocation)) {
                throw new BadRequestException("Invalid file path");
            }
            Resource resource = new UrlResource(file.toUri());
            if (resource.exists() && resource.isReadable()) {
                return resource;
            }
            throw new ResourceNotFoundException("File not found: " + storedName);
        } catch (IOException e) {
            throw new ResourceNotFoundException("File not found: " + storedName);
        }
    }

    /**
     * Load a stored file that may live either in the upload root or in one of
     * the CAD sub-directories (drawings/models). Unlike {@link #loadAsResource}
     * this does not require the server-generated UUID name; it is only safe to
     * call with file names that were extracted from trusted document rows.
     */
    public Resource loadDocumentResource(String storedName, String... subdirs) {
        if (storedName == null || storedName.isBlank() || !isAuditableStoredName(storedName)) {
            throw new BadRequestException("Invalid file name");
        }
        List<String> dirs = new java.util.ArrayList<>();
        dirs.add("");
        if (subdirs != null) {
            for (String sub : subdirs) {
                String normalized = normalizeSubdir(sub);
                if (!normalized.isEmpty() && !dirs.contains(normalized)) {
                    dirs.add(normalized);
                }
            }
        }
        for (String dir : dirs) {
            try {
                Path file = dir.isEmpty()
                        ? rootLocation.resolve(storedName)
                        : rootLocation.resolve(dir).resolve(storedName);
                file = file.normalize();
                if (!file.startsWith(rootLocation)) {
                    continue;
                }
                Resource resource = new UrlResource(file.toUri());
                if (resource.exists() && resource.isReadable()) {
                    return resource;
                }
            } catch (IOException e) {
                // try next candidate directory
            }
        }
        throw new ResourceNotFoundException("File not found: " + storedName);
    }

    /** True when the given file name exists in the root or any given CAD sub-directory. */
    public boolean existsOnDisk(String storedName, String... subdirs) {
        if (storedName == null || storedName.isBlank() || !isAuditableStoredName(storedName)) {
            return false;
        }
        List<String> dirs = new java.util.ArrayList<>();
        dirs.add("");
        if (subdirs != null) {
            for (String sub : subdirs) {
                String normalized = normalizeSubdir(sub);
                if (!normalized.isEmpty() && !dirs.contains(normalized)) {
                    dirs.add(normalized);
                }
            }
        }
        for (String dir : dirs) {
            try {
                Path file = (dir.isEmpty()
                        ? rootLocation.resolve(storedName)
                        : rootLocation.resolve(dir).resolve(storedName)).normalize();
                if (file.startsWith(rootLocation) && Files.exists(file)) {
                    return true;
                }
            } catch (Exception e) {
                // try next candidate
            }
        }
        return false;
    }

    /** Size in bytes of a stored file in the root or any CAD sub-directory, or -1 when absent. */
    public long storedSize(String storedName, String... subdirs) {
        if (storedName == null || storedName.isBlank() || !isAuditableStoredName(storedName)) {
            return -1;
        }
        List<String> dirs = new java.util.ArrayList<>();
        dirs.add("");
        if (subdirs != null) {
            for (String sub : subdirs) {
                String normalized = normalizeSubdir(sub);
                if (!normalized.isEmpty() && !dirs.contains(normalized)) {
                    dirs.add(normalized);
                }
            }
        }
        for (String dir : dirs) {
            try {
                Path file = (dir.isEmpty()
                        ? rootLocation.resolve(storedName)
                        : rootLocation.resolve(dir).resolve(storedName)).normalize();
                if (file.startsWith(rootLocation) && Files.isRegularFile(file)) {
                    return Files.size(file);
                }
            } catch (IOException e) {
                // try next candidate
            }
        }
        return -1;
    }

    /** Plain file names present directly in the upload root (not sub-directories). */
    public List<String> listRootFiles() {
        List<String> names = new java.util.ArrayList<>();
        try (java.util.stream.Stream<Path> stream = Files.list(rootLocation)) {
            stream.filter(Files::isRegularFile)
                    .forEach(p -> names.add(p.getFileName().toString()));
        } catch (IOException e) {
            LOG.warn("Could not list upload root: {}", e.getMessage());
        }
        return names;
    }

    /** Lenient single-file-name check (no separators, no traversal, capped length). */
    private boolean isAuditableStoredName(String name) {
        if (name == null || name.isBlank()) {
            return false;
        }
        if (name.contains("/") || name.contains("\\") || name.contains("..") || name.contains("\0")) {
            return false;
        }
        if (".".equals(name) || "..".equals(name)) {
            return false;
        }
        return name.length() <= 255;
    }

    /** Normalize a fixed sub-directory name (e.g. "drawings") into a safe relative path. */
    private String normalizeSubdir(String sub) {
        if (sub == null || sub.isBlank()) {
            return "";
        }
        String s = sub.replace('\\', '/');
        while (s.startsWith("/")) {
            s = s.substring(1);
        }
        while (s.endsWith("/")) {
            s = s.substring(0, s.length() - 1);
        }
        if (s.isEmpty() || s.contains(":") || s.contains("..")) {
            throw new BadRequestException("Invalid subdirectory");
        }
        for (String part : s.split("/")) {
            if (part.isBlank() || ".".equals(part) || "..".equals(part)) {
                throw new BadRequestException("Invalid subdirectory");
            }
        }
        return s;
    }

    /** True for the storage names this service generates: UUID[.safe-ext]. */
    public boolean isSafeStoredName(String name) {
        if (name == null || name.isBlank()) {
            return false;
        }
        if (name.contains("/") || name.contains("\\") || name.contains("..") || name.contains("\0")) {
            return false;
        }
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        if (!base.matches("[0-9a-fA-F]{32}")) {
            return false;
        }
        if (dot > 0) {
            String ext = name.substring(dot + 1).toLowerCase(Locale.ROOT);
            if (!ext.matches("[a-z0-9]{1,10}")) {
                return false;
            }
        }
        return true;
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /** Strips path components and control characters; caps length at 255. */
    private String sanitizeOriginalName(String original) {
        String base = original.replace('\\', '/');
        int slash = base.lastIndexOf('/');
        String name = slash >= 0 ? base.substring(slash + 1) : base;
        name = name.replaceAll("[\\p{Cntrl}\0]", "");
        if (name.isBlank() || ".".equals(name) || "..".equals(name)) {
            return "file";
        }
        if (name.length() > 255) {
            name = name.substring(name.length() - 255);
        }
        return name;
    }

    /** Lowercase extension without the dot, or null when absent/unsafe. */
    private String extensionOf(String name) {
        int dot = name.lastIndexOf('.');
        if (dot <= 0 || dot == name.length() - 1) {
            return null;
        }
        String ext = name.substring(dot + 1).toLowerCase(Locale.ROOT);
        if (!ext.matches("[a-z0-9]{1,10}")) {
            return null;
        }
        return ext;
    }

    private Set<String> parseAllowedExtensions(String csv) {
        Set<String> set = new java.util.HashSet<>();
        if (csv == null) {
            return set;
        }
        for (String token : csv.split(",")) {
            String ext = token.trim().toLowerCase(Locale.ROOT).replace(".", "");
            if (!ext.isBlank() && ext.matches("[a-z0-9]{1,10}")) {
                set.add(ext);
            }
        }
        return set;
    }

    private long parseSize(String value) {
        if (value == null) {
            return 200L * 1024 * 1024;
        }
        String v = value.trim().toUpperCase(Locale.ROOT);
        long multiplier = 1;
        if (v.endsWith("GB")) {
            multiplier = 1024L * 1024 * 1024;
            v = v.substring(0, v.length() - 2);
        } else if (v.endsWith("MB")) {
            multiplier = 1024L * 1024;
            v = v.substring(0, v.length() - 2);
        } else if (v.endsWith("KB")) {
            multiplier = 1024L;
            v = v.substring(0, v.length() - 2);
        } else if (v.endsWith("B")) {
            v = v.substring(0, v.length() - 1);
        }
        try {
            return (long) (Double.parseDouble(v.trim()) * multiplier);
        } catch (NumberFormatException e) {
            return 200L * 1024 * 1024;
        }
    }
}
