package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.entity.DocumentRepositoryEntry;
import com.vishatech.erp.exception.ForbiddenException;
import com.vishatech.erp.repository.DocumentRepositoryEntryRepository;
import com.vishatech.erp.repository.DocumentVersionRepository;
import com.vishatech.erp.service.AttachmentStorageService;
import com.vishatech.erp.service.DocumentPermissionService;
import com.vishatech.erp.service.FileStorageService;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * Authenticated file serving (see SecurityConfig — /files/** is no longer
 * public). Files are only served to logged-in ERP users; the frontend fetches
 * them through the authenticated Axios client and never via bare URLs.
 *
 * When the requested file is owned by a document-repository entry, the owner's
 * document visibility is also enforced (403 when the caller cannot view it) —
 * otherwise /files/{name} would bypass every visibility restriction.
 */
@RestController
@RequestMapping("/files")
@PreAuthorize("isAuthenticated()")
public class FileController {

    /**
     * Types that are safe to render inline in the browser. Everything else is
     * forced to Content-Disposition: attachment so uploaded content (even a
     * hostile HTML/SVG) can never execute same-origin.
     */
    private static final Set<String> INLINE_TYPES = Set.of(
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/gif",
            "image/webp"
    );

    private final FileStorageService fileStorageService;
    private final AttachmentStorageService attachmentStorageService;
    private final DocumentRepositoryEntryRepository documentRepository;
    private final DocumentVersionRepository versionRepository;
    private final DocumentPermissionService documentPermissionService;

    public FileController(FileStorageService fileStorageService,
                          AttachmentStorageService attachmentStorageService,
                          DocumentRepositoryEntryRepository documentRepository,
                          DocumentVersionRepository versionRepository,
                          DocumentPermissionService documentPermissionService) {
        this.fileStorageService = fileStorageService;
        this.attachmentStorageService = attachmentStorageService;
        this.documentRepository = documentRepository;
        this.versionRepository = versionRepository;
        this.documentPermissionService = documentPermissionService;
    }

    @GetMapping("/{filename}")
    public ResponseEntity<Resource> serve(@PathVariable String filename) {
        // Defense in depth: only accept the server-generated UUID[.ext] names.
        if (!fileStorageService.isSafeStoredName(filename)) {
            return ResponseEntity.badRequest().build();
        }
        enforceDocumentVisibility(filename);
        Resource resource = fileStorageService.loadAsResource(filename);
        String contentType = "application/octet-stream";
        try {
            String probed = Files.probeContentType(Paths.get(filename));
            if (probed != null) {
                contentType = probed;
            }
        } catch (IOException ignored) {
            // fall back to octet-stream
        }

        String disposition = INLINE_TYPES.contains(contentType)
                ? "inline; filename=\"" + filename + "\""
                : "attachment; filename=\"" + filename + "\"";

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                // Never render a guessed type as HTML/script in the origin.
                .header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.parseMediaType(contentType))
                .cacheControl(CacheControl.noStore())
                .body(resource);
    }

    /**
     * If this stored file belongs to any document-repository entry, at least
     * one owner must be viewable by the caller — otherwise 403. Files that are
     * not document-repository assets (module attachments, exports, ...) are
     * left to the existing authenticated-only rule.
     */
    private void enforceDocumentVisibility(String filename) {
        List<DocumentRepositoryEntry> owners = new ArrayList<>();
        owners.addAll(documentRepository.findByFilePathName(filename));
        owners.addAll(versionRepository.findDocumentsByStoredFileName(filename));
        if (owners.isEmpty()) {
            return;
        }
        boolean allowed = owners.stream().anyMatch(documentPermissionService::canView);
        if (!allowed) {
            throw new ForbiddenException("You do not have permission to access this file");
        }
    }

    /**
     * Project-wide attachment storage usage (shared 4 GB pool across all
     * attachment-enabled modules). Used by the UI to display remaining
     * capacity and to reject an over-limit upload batch before sending it.
     */
    @GetMapping("/storage")
    public ResponseEntity<ApiResponse<Map<String, Long>>> storage() {
        Map<String, Long> usage = Map.of(
                "limitBytes", attachmentStorageService.getLimitBytes(),
                "totalBytes", attachmentStorageService.getTotalBytes(),
                "availableBytes", attachmentStorageService.getAvailableBytes());
        return ResponseEntity.ok(ApiResponse.ok(usage));
    }
}
