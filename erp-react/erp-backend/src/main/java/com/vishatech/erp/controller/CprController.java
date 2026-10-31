package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.BulkRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import com.vishatech.erp.dto.CprActionRequest;
import com.vishatech.erp.dto.CprAttachmentResponse;
import com.vishatech.erp.dto.CprCommentRequest;
import com.vishatech.erp.dto.CprCommentResponse;
import com.vishatech.erp.dto.CprHistoryResponse;
import com.vishatech.erp.dto.CprNextNumberResponse;
import com.vishatech.erp.dto.CprRequest;
import com.vishatech.erp.dto.CprResponse;
import com.vishatech.erp.dto.CprTimelineResponse;
import com.vishatech.erp.service.CprService;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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

/**
 * CPR HTTP surface: thin routing + authorization only. Validation, numbering,
 * transactions, workflow and audit live in {@link CprService}, matching the
 * Purchase / Production controllers.
 *
 * The class-level CPR_VIEW covers the read endpoints; every mutating endpoint
 * carries the narrowest CPR authority for its operation (CPR_CREATE when it
 * creates a record, CPR_EDIT for edits and state changes, CPR_APPROVE for the
 * approval decisions, CPR_DELETE for permanent deletion).
 */
@RestController
@RequestMapping("/cprs")
@PreAuthorize("hasAuthority('CPR_VIEW')")
public class CprController {

    private final CprService cprService;

    public CprController(CprService cprService) {
        this.cprService = cprService;
    }

    @GetMapping
    public Page<CprResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String approval,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) BigDecimal minValue,
            @RequestParam(required = false) BigDecimal maxValue) {
        return cprService.list(page, size, search, sort, status, approval, department,
                dateFrom, dateTo, minValue, maxValue);
    }

    @PreAuthorize("hasAuthority('CPR_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<CprResponse>> create(@Valid @RequestBody CprRequest request,
                                                           @RequestParam(defaultValue = "false") boolean draft) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(cprService.create(request, draft)));
    }

    @GetMapping("/next-number")
    public ResponseEntity<ApiResponse<CprNextNumberResponse>> nextNumber() {
        return ResponseEntity.ok(ApiResponse.ok(cprService.getNextNumber()));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats() {
        return ResponseEntity.ok(ApiResponse.ok(cprService.stats()));
    }

    @GetMapping("/reports/summary")
    public ResponseEntity<ApiResponse<Map<String, Object>>> reportsSummary() {
        return ResponseEntity.ok(ApiResponse.ok(cprService.reportsSummary()));
    }

    /** Search CPRs by referencePrNo for the Quotation form autocomplete. */
    @GetMapping("/search-by-reference-pr")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> searchByReferencePr(
            @RequestParam String q) {
        return ResponseEntity.ok(ApiResponse.ok(cprService.searchByReferencePrNo(q)));
    }

    /** Lookup a single CPR by its referencePrNo (exact match). */
    @GetMapping("/by-reference-pr/{referencePrNo}")
    public ResponseEntity<ApiResponse<CprResponse>> getByReferencePrNo(
            @PathVariable String referencePrNo) {
        return ResponseEntity.ok(ApiResponse.ok(cprService.getByReferencePrNo(referencePrNo)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<CprResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(cprService.get(id)));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<CprResponse>> update(@PathVariable Long id,
                                                            @Valid @RequestBody CprRequest request,
                                                            @RequestParam(defaultValue = "false") boolean draft) {
        return ResponseEntity.ok(ApiResponse.ok(cprService.update(id, request, draft)));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        cprService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("CPR moved to trash"));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PatchMapping("/archive/{id}")
    public ResponseEntity<ApiResponse<CprResponse>> archive(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(cprService.archive(id)));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PatchMapping("/restore/{id}")
    public ResponseEntity<ApiResponse<CprResponse>> restore(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(cprService.restore(id)));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PostMapping("/{id}/submit")
    public ResponseEntity<ApiResponse<CprResponse>> submit(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(cprService.submit(id)));
    }

    @PreAuthorize("hasAuthority('CPR_APPROVE')")
    @PostMapping("/{id}/approve")
    public ResponseEntity<ApiResponse<CprResponse>> approve(@PathVariable Long id,
                                                             @RequestBody(required = false) CprActionRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(cprService.approve(id, request == null ? null : request.remarks())));
    }

    /**
     * Admin approval + float: Technical Verification is the gate and the Admin
     * names exactly ONE destination (PR or CW). Guarded by the same authority as
     * the existing CPR approval, so the decision cannot be made from the frontend
     * alone. Idempotent — an already-floated CPR is rejected with its existing
     * reference instead of producing a second PR / Cost Workout.
     */
    @PreAuthorize("hasAuthority('CPR_APPROVE')")
    @PostMapping("/{id}/float")
    public ResponseEntity<ApiResponse<CprResponse>> floatToDestination(
            @PathVariable Long id,
            @RequestBody(required = false) CprActionRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(cprService.floatCpr(id,
                request == null ? null : request.destination(),
                request == null ? null : request.remarks())));
    }

    @PreAuthorize("hasAuthority('CPR_APPROVE')")
    @PostMapping("/{id}/reject")
    public ResponseEntity<ApiResponse<CprResponse>> reject(@PathVariable Long id,
                                                           @RequestBody(required = false) CprActionRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(cprService.reject(id, request == null ? null : request.remarks())));
    }

    @PreAuthorize("hasAuthority('CPR_APPROVE')")
    @PostMapping("/{id}/send-back")
    public ResponseEntity<ApiResponse<CprResponse>> sendBack(@PathVariable Long id,
                                                             @RequestBody(required = false) CprActionRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(cprService.sendBack(id, request == null ? null : request.remarks())));
    }

    @PreAuthorize("hasAuthority('CPR_CREATE')")
    @PostMapping("/{id}/convert-quotation")
    public ResponseEntity<ApiResponse<CprResponse>> convertToQuotation(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(cprService.convertToQuotation(id)));
    }

    /**
     * Convert the CPR into a CRM Client ("Convert to Customer"): links the
     * existing client when the CPR already has one, reuses an existing client
     * by GSTIN/PAN/business name, otherwise creates a real Client through the
     * Client module. Idempotent and transactional — see
     * {@link com.vishatech.erp.service.CprService#convertToCustomer(Long)}.
     */
    @PreAuthorize("hasAuthority('CPR_CREATE')")
    @PostMapping("/{id}/convert-customer")
    public ResponseEntity<ApiResponse<com.vishatech.erp.dto.CprCustomerConversionResponse>> convertToCustomer(
            @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(cprService.convertToCustomer(id)));
    }

    @PreAuthorize("hasAuthority('CPR_CREATE')")
    @PostMapping("/{id}/duplicate")
    public ResponseEntity<ApiResponse<CprResponse>> duplicate(@PathVariable Long id) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(cprService.duplicate(id)));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PostMapping("/bulk-delete")
    public ResponseEntity<ApiResponse<Void>> bulkDelete(@Valid @RequestBody BulkRequest request) {
        int count = cprService.bulkDelete(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Deleted " + count + " CPR(s)"));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PostMapping("/bulk-archive")
    public ResponseEntity<ApiResponse<Void>> bulkArchive(@Valid @RequestBody BulkRequest request) {
        int count = cprService.bulkArchive(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Archived " + count + " CPR(s)"));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PostMapping("/bulk-restore")
    public ResponseEntity<ApiResponse<Void>> bulkRestore(@Valid @RequestBody BulkRequest request) {
        int count = cprService.bulkRestore(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Restored " + count + " CPR(s)"));
    }

    @PreAuthorize("hasAuthority('CPR_DELETE')")
    @PostMapping("/bulk-permanent-delete")
    public ResponseEntity<ApiResponse<Void>> bulkPermanentDelete(@Valid @RequestBody BulkRequest request) {
        int count = cprService.bulkPermanentDelete(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Permanently deleted " + count + " CPR(s)"));
    }

    @PostMapping("/export")
    public ResponseEntity<?> export(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String approval,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) BigDecimal minValue,
            @RequestParam(required = false) BigDecimal maxValue) {
        List<CprResponse> cprs = cprService.export(search, status, approval, department,
                dateFrom, dateTo, minValue, maxValue);
        byte[] bytes = cprService.buildCsv(cprs).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"cprs.csv\"")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(bytes);
    }

    @GetMapping("/{id}/timeline")
    public ResponseEntity<List<CprTimelineResponse>> timeline(@PathVariable Long id) {
        return ResponseEntity.ok(cprService.getTimeline(id));
    }

    @GetMapping("/{id}/history")
    public ResponseEntity<List<CprHistoryResponse>> history(@PathVariable Long id) {
        return ResponseEntity.ok(cprService.getHistory(id));
    }

    @GetMapping("/{id}/attachments")
    public ResponseEntity<List<CprAttachmentResponse>> attachments(@PathVariable Long id) {
        return ResponseEntity.ok(cprService.getAttachments(id));
    }

    @PreAuthorize("hasAuthority('CPR_CREATE')")
    @PostMapping("/{id}/attachments")
    public ResponseEntity<ApiResponse<CprAttachmentResponse>> addAttachment(@PathVariable Long id,
                                                                            @RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(cprService.addAttachment(id, file)));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @DeleteMapping("/{id}/attachments/{attachmentId}")
    public ResponseEntity<ApiResponse<Void>> deleteAttachment(@PathVariable Long id,
                                                              @PathVariable Long attachmentId) {
        cprService.deleteAttachment(id, attachmentId);
        return ResponseEntity.ok(ApiResponse.ok("Attachment deleted"));
    }

    @GetMapping("/{id}/comments")
    public ResponseEntity<List<CprCommentResponse>> comments(@PathVariable Long id) {
        return ResponseEntity.ok(cprService.getComments(id));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PostMapping("/{id}/comments")
    public ResponseEntity<ApiResponse<CprCommentResponse>> addComment(@PathVariable Long id,
                                                                      @Valid @RequestBody CprCommentRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(cprService.addComment(id, request.text())));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PutMapping("/{id}/comments/{commentId}")
    public ResponseEntity<ApiResponse<CprCommentResponse>> updateComment(@PathVariable Long id,
                                                                         @PathVariable Long commentId,
                                                                         @Valid @RequestBody CprCommentRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(cprService.updateComment(id, commentId, request.text())));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @DeleteMapping("/{id}/comments/{commentId}")
    public ResponseEntity<ApiResponse<Void>> deleteComment(@PathVariable Long id,
                                                           @PathVariable Long commentId) {
        cprService.deleteComment(id, commentId);
        return ResponseEntity.ok(ApiResponse.ok("Comment deleted"));
    }
}
