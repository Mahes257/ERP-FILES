package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.DocumentRepositoryRequest;
import com.vishatech.erp.dto.DocumentRepositoryResponse;
import com.vishatech.erp.dto.DocumentVersionResponse;
import com.vishatech.erp.dto.DocumentVisibilityRequest;
import java.util.List;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.security.access.prepost.PreAuthorize;

@RestController
@RequestMapping("/documents")
@PreAuthorize("hasAuthority('DOCUMENT_VIEW')")
public class DocumentRepositoryController {

    private final com.vishatech.erp.service.DocumentRepositoryService service;
    private final com.vishatech.erp.service.DocumentBackfillService backfillService;
    private final com.vishatech.erp.service.DocumentReconciliationService reconciliationService;

    public DocumentRepositoryController(
            com.vishatech.erp.service.DocumentRepositoryService service,
            com.vishatech.erp.service.DocumentBackfillService backfillService,
            com.vishatech.erp.service.DocumentReconciliationService reconciliationService) {
        this.service = service;
        this.backfillService = backfillService;
        this.reconciliationService = reconciliationService;
    }

    /**
     * @param scope optional ERP-area filter ({@code sales}) that restricts the
     *              whole query — search, filters, total and sort — to that
     *              area's modules via
     *              {@link com.vishatech.erp.service.DocumentModuleScope};
     *              omit it (or pass {@code all}) for the unscoped repository
     */
    @GetMapping
    public Page<DocumentRepositoryResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String module,
            @RequestParam(required = false) String documentType,
            @RequestParam(required = false) Long customerId,
            @RequestParam(required = false) String uploadedBy,
            @RequestParam(required = false) String visibility,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String scope,
            @RequestParam(required = false, defaultValue = "false") boolean reusable) {
        return service.list(page, size, search, sort, module, documentType,
                customerId, uploadedBy, visibility, status, dateFrom, dateTo, scope, reusable);
    }

    /**
     * Documents owned by ONE source record (e.g. Quotation Overview → Documents):
     * `GET /documents/by-record?module=Quotation&relatedRecordId=244`.
     * Declared before `/{id}` so the path variable never swallows it.
     */
    @GetMapping("/by-record")
    public ResponseEntity<ApiResponse<java.util.List<DocumentRepositoryResponse>>> listForRecord(
            @RequestParam String module,
            @RequestParam Long relatedRecordId) {
        return ResponseEntity.ok(ApiResponse.ok(service.listForRecord(module, relatedRecordId)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<DocumentRepositoryResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.get(id)));
    }

    @PreAuthorize("hasAuthority('DOCUMENT_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<DocumentRepositoryResponse>> create(
            @Valid @RequestBody DocumentRepositoryRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(service.create(request)));
    }

    @PreAuthorize("hasAuthority('DOCUMENT_CREATE')")
    @PostMapping("/upload")
    public ResponseEntity<ApiResponse<DocumentRepositoryResponse>> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) String module,
            @RequestParam(required = false) Long relatedRecordId,
            @RequestParam(required = false) String recordNumber,
            @RequestParam(required = false) Long customerId,
            @RequestParam(required = false) String customerName,
            @RequestParam(required = false) String documentType,
            @RequestParam(required = false) String visibility,
            @RequestParam(required = false) String description,
            @RequestParam(required = false) String uploadedBy) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(service.upload(file, module, relatedRecordId,
                        recordNumber, customerId, customerName, documentType,
                        visibility, description, uploadedBy)));
    }

    /**
     * "Inside ERP": add a document that ALREADY exists in the repository to a
     * repository context by REFERENCING its stored file — no second copy on
     * disk and no second upload of the same file
     * (see {@link com.vishatech.erp.service.DocumentRepositoryService#referenceExisting}).
     *
     * Same authority as every other way a document enters the repository
     * ({@code DOCUMENT_CREATE}); the service additionally requires that the
     * caller may READ the source document.
     */
    @PreAuthorize("hasAuthority('DOCUMENT_CREATE')")
    @PostMapping("/{id}/reference")
    public ResponseEntity<ApiResponse<DocumentRepositoryResponse>> referenceExisting(
            @PathVariable Long id,
            @RequestBody(required = false) com.vishatech.erp.dto.DocumentReferenceRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(service.referenceExisting(id, body != null ? body.module() : null)));
    }

    @PreAuthorize("hasAuthority('DOCUMENT_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<DocumentRepositoryResponse>> update(
            @PathVariable Long id,
            @Valid @RequestBody DocumentRepositoryRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(service.updateMetadata(id, request)));
    }

    /**
     * Re-scope one document. Row-level access is decided by
     * {@link com.vishatech.erp.service.DocumentPermissionService} inside the
     * service (the caller must be able to see it), so — like archive/restore —
     * this action keeps the class-level DOCUMENT_VIEW gate the module's own
     * capability model is built on.
     */
    @PatchMapping("/{id}/visibility")
    public ResponseEntity<ApiResponse<DocumentRepositoryResponse>> changeVisibility(
            @PathVariable Long id,
            @Valid @RequestBody DocumentVisibilityRequest body) {
        return ResponseEntity.ok(ApiResponse.ok(service.changeVisibility(id, body.visibility())));
    }

    @PatchMapping("/archive/{id}")
    public ResponseEntity<ApiResponse<DocumentRepositoryResponse>> archive(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.archive(id)));
    }

    @PatchMapping("/restore/{id}")
    public ResponseEntity<ApiResponse<DocumentRepositoryResponse>> restore(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.restore(id)));
    }

    @PreAuthorize("hasAuthority('DOCUMENT_DELETE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Document moved to trash"));
    }

    @PreAuthorize("hasAuthority('DOCUMENT_DELETE')")
    @DeleteMapping("/{id}/permanent")
    public ResponseEntity<ApiResponse<Void>> permanentDelete(@PathVariable Long id) {
        service.permanentDelete(id);
        return ResponseEntity.ok(ApiResponse.ok("Document permanently deleted"));
    }

    @GetMapping("/{id}/audit")
    public ResponseEntity<ApiResponse<List<com.vishatech.erp.dto.DocumentAuditResponse>>> auditTrail(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.getAuditLog(id)));
    }

    /** @param scope same ERP-area filter as {@link #list}; the counters match the listed rows */
    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats(
            @RequestParam(required = false) String scope) {
        return ResponseEntity.ok(ApiResponse.ok(service.stats(scope)));
    }

    // ============================== Backfill ==============================

    @PreAuthorize("hasAuthority('DOCUMENT_CREATE')")
    @PostMapping("/backfill")
    public ResponseEntity<ApiResponse<Map<String, Object>>> backfill() {
        return ResponseEntity.ok(ApiResponse.ok(backfillService.runBackfill()));
    }

    /**
     * Reconcile the entire repository against every ERP module, the attachment
     * tables and the CAD file directories. Idempotent: it normalizes legacy
     * module strings, registers unregistered attachments/CAD files, creates
     * missing record documents, removes duplicates/orphans and returns the
     * final per-module matrix (Source / Docs / Missing / Duplicate / Orphan /
     * Broken).
     */
    @PreAuthorize("hasAuthority('DOCUMENT_CREATE')")
    @PostMapping("/reconcile")
    public ResponseEntity<ApiResponse<Map<String, Object>>> reconcile() {
        return ResponseEntity.ok(ApiResponse.ok(reconciliationService.reconcile()));
    }

    // ============================== Version History ==============================

    @GetMapping("/{id}/versions")
    public ResponseEntity<List<DocumentVersionResponse>> getVersions(@PathVariable Long id) {
        return ResponseEntity.ok(service.getVersions(id));
    }

    @PreAuthorize("hasAuthority('DOCUMENT_CREATE')")
    @PostMapping("/{id}/versions")
    public ResponseEntity<ApiResponse<DocumentRepositoryResponse>> uploadNewVersion(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "changeNotes", required = false) String changeNotes) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(service.uploadNewVersion(id, file, changeNotes)));
    }

    @PreAuthorize("hasAuthority('DOCUMENT_CREATE')")
    @PostMapping("/{id}/regenerate")
    public ResponseEntity<ApiResponse<DocumentRepositoryResponse>> regenerateDocument(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.generatePdf(id)));
    }

    /**
     * One-off repair job: rewrites legacy {@code SO-} numbers to the canonical
     * {@code CPO-} wording across sales orders and their documents. ADMIN only —
     * it renumbers data in another module-, and nothing in the ERP calls it.
     */
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/migrate-cpo-terminology")
    public ResponseEntity<ApiResponse<Map<String, Object>>> migrateCpoTerminology() {
        int updated = service.migrateCpoTerminology();
        return ResponseEntity.ok(ApiResponse.ok("CPO terminology migration complete",
                Map.of("updatedRecords", updated)));
    }

    /**
     * Stream the current version of a stored document. Access is fully
     * permission-checked (authenticated user, document visibility/status and
     * source-record permission) and each access is written to the audit trail.
     *
     * @param mode "inline" renders PDF/images in the browser; "attachment" forces a download
     */
    @GetMapping("/{id}/file")
    public ResponseEntity<org.springframework.core.io.Resource> serveFile(
            @PathVariable Long id,
            @RequestParam(defaultValue = "inline") String mode) {
        com.vishatech.erp.service.DocumentRepositoryService.DocumentFile file = service.loadDocumentFile(id, mode);
        String disposition = file.inline()
                ? "inline; filename=\"" + file.documentName() + "\""
                : "attachment; filename=\"" + file.documentName() + "\"";
        return ResponseEntity.ok()
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION, disposition)
                .header("X-Content-Type-Options", "nosniff")
                .contentType(org.springframework.http.MediaType.parseMediaType(
                        file.contentType() == null || file.contentType().isBlank()
                                ? "application/octet-stream" : file.contentType()))
                .cacheControl(org.springframework.http.CacheControl.noStore())
                .body(file.resource());
    }
}
