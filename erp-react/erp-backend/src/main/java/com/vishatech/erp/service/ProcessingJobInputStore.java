package com.vishatech.erp.service;

import com.vishatech.erp.exception.BadRequestException;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.logging.Logger;
import java.util.stream.Stream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * Disk-backed staging area for the inputs of a background processing job.
 *
 * <p>A background job cannot read the HTTP request's multipart files after the
 * response is sent, and holding them in JVM heap until a worker picks the job up
 * is exactly what the old synchronous path did (it read each upload fully into a
 * {@code byte[]}). So the request streams each upload to a job-scoped directory
 * and the job row only references it. Files are deleted the moment the job
 * reaches a terminal state, and any directory left behind by a crash is removed
 * by the housekeeping sweep — nothing here is a permanent document store.
 *
 * <h2>Path safety</h2>
 * Suffix/prefix checks are not enough on their own, so the reference is an
 * opaque 32-hex-character name (whitelisted by regex) and the resolved path is
 * verified to stay inside the staging root. The uploaded filename is never used
 * as a path: stored names are server-generated, and the original name is kept
 * only as a display string in the job manifest.
 */
@Service
public class ProcessingJobInputStore {

    private static final Logger log = Logger.getLogger(ProcessingJobInputStore.class.getName());

    /** Prefix used in {@code ProcessingJob.inputRef}. */
    public static final String REF_PREFIX = "processing-jobs/";

    private static final String REF_NAME_PATTERN = "[a-f0-9]{32}";
    private static final int MAX_DISPLAY_NAME_CHARS = 200;

    /** One staged input file. */
    public record StoredInput(String storedName, String originalName, long size) {
    }

    private final Path root;
    private final Path stagingRoot;

    public ProcessingJobInputStore(@Value("${app.upload.dir}") String uploadDir) {
        this.root = Paths.get(uploadDir).toAbsolutePath().normalize();
        this.stagingRoot = root.resolve("processing-jobs").normalize();
        try {
            Files.createDirectories(stagingRoot);
        } catch (IOException e) {
            throw new IllegalStateException("Could not create the processing job staging directory", e);
        }
    }

    /** A fresh, unguessable input reference (the job's staging directory). */
    public String newInputRef() {
        return REF_PREFIX + UUID.randomUUID().toString().replace("-", "");
    }

    /** Stages every uploaded file under the given reference, streaming to disk. */
    public List<StoredInput> store(String inputRef, MultipartFile[] files) throws IOException {
        Path dir = directory(inputRef);
        Files.createDirectories(dir);
        List<StoredInput> stored = new ArrayList<>();
        for (MultipartFile file : files == null ? new MultipartFile[0] : files) {
            String originalName = displayName(file.getOriginalFilename());
            String extension = extensionOf(originalName);
            String storedName = UUID.randomUUID().toString().replace("-", "")
                    + (extension.isEmpty() ? "" : "." + extension);
            Path target = dir.resolve(storedName).normalize();
            if (!target.startsWith(dir)) {
                throw new BadRequestException("Invalid file path");
            }
            Files.copy(file.getInputStream(), target, StandardCopyOption.REPLACE_EXISTING);
            stored.add(new StoredInput(storedName, originalName, file.getSize()));
        }
        return stored;
    }

    /** Resolves one staged file, refusing anything outside the job's directory. */
    public Path resolveInput(String inputRef, String storedName) {
        Path dir = directory(inputRef);
        if (storedName == null || !storedName.matches("[A-Za-z0-9._-]{1,120}")) {
            throw new BadRequestException("Invalid staged file reference");
        }
        Path file = dir.resolve(storedName).normalize();
        if (!file.startsWith(dir)) {
            throw new BadRequestException("Invalid staged file reference");
        }
        return file;
    }

    /** True when the job's staged inputs are still present. */
    public boolean hasInputs(String inputRef) {
        try {
            return Files.isDirectory(directory(inputRef));
        } catch (BadRequestException e) {
            return false;
        }
    }

    /** Deletes the job's staged inputs (best effort — never fails the job). */
    public void deleteInputs(String inputRef) {
        try {
            deleteRecursively(directory(inputRef));
        } catch (Exception e) {
            log.warning("Could not remove processing job inputs " + inputRef + ": " + e.getMessage());
        }
    }

    /**
     * Removes staging directories that belong to no queued/running job and are
     * older than the cutoff (a job that crashed after staging its inputs, or a
     * manual/test run). Returns the number of directories removed.
     */
    public int sweepOrphans(Set<String> liveRefs, LocalDateTime olderThan) {
        Set<String> live = new HashSet<>(liveRefs);
        long cutoffMillis = olderThan.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
        int removed = 0;
        try (Stream<Path> dirs = Files.list(stagingRoot)) {
            for (Path dir : dirs.filter(Files::isDirectory).toList()) {
                String name = dir.getFileName().toString();
                if (live.contains(REF_PREFIX + name)) {
                    continue;
                }
                if (Files.getLastModifiedTime(dir).toMillis() > cutoffMillis) {
                    continue;
                }
                deleteRecursively(dir);
                removed++;
            }
        } catch (IOException e) {
            log.warning("Processing job input sweep failed: " + e.getMessage());
        }
        return removed;
    }

    private Path directory(String inputRef) {
        if (inputRef == null || !inputRef.startsWith(REF_PREFIX)) {
            throw new BadRequestException("Invalid job input reference");
        }
        String name = inputRef.substring(REF_PREFIX.length());
        if (!name.matches(REF_NAME_PATTERN)) {
            throw new BadRequestException("Invalid job input reference");
        }
        Path dir = stagingRoot.resolve(name).normalize();
        if (!dir.startsWith(stagingRoot)) {
            throw new BadRequestException("Invalid job input reference");
        }
        return dir;
    }

    private void deleteRecursively(Path dir) {
        if (!Files.exists(dir)) {
            return;
        }
        try (Stream<Path> walk = Files.walk(dir)) {
            List<Path> entries = walk.sorted(Comparator.reverseOrder()).toList();
            for (Path entry : entries) {
                Files.deleteIfExists(entry);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private String displayName(String original) {
        String name = original == null ? "document" : original.replace('\\', '/');
        int slash = name.lastIndexOf('/');
        if (slash >= 0) {
            name = name.substring(slash + 1);
        }
        name = name.replaceAll("[\\u0000-\\u001F\\u007F]", "").trim();
        if (name.isEmpty()) {
            name = "document";
        }
        return name.length() > MAX_DISPLAY_NAME_CHARS ? name.substring(0, MAX_DISPLAY_NAME_CHARS) : name;
    }

    private String extensionOf(String name) {
        int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }
}
