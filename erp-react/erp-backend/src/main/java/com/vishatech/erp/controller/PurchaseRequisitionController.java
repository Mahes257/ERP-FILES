package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.PurchaseDtos;
import com.vishatech.erp.service.PurchaseRequisitionService;
import com.vishatech.erp.service.PurchaseSupportService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/purchase/requisitions")
public class PurchaseRequisitionController {

    private final PurchaseRequisitionService service;

    public PurchaseRequisitionController(PurchaseRequisitionService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public Page<PurchaseDtos.PurchaseRequisitionResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String requester,
            @RequestParam(required = false) String vendor,
            @RequestParam(required = false) String priority,
            @RequestParam(required = false) String project,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return service.list(page, size, search, sort, state, status, department, requester,
                vendor, priority, project, dateFrom, dateTo);
    }

    /**
     * Technical Specification Review queue — one bounded page of requisitions
     * in the review stage, filtered, searched and sorted in the database.
     * Returns a Spring Page (content + totalElements + totalPages) so the
     * browser never has to load the queue to filter it.
     */
    @GetMapping("/technical-review")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public Page<PurchaseDtos.PurchaseRequisitionResponse> technicalReviewQueue(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String reviewStatus,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String vendor,
            @RequestParam(required = false) String assignedBy,
            @RequestParam(required = false) String priority,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(defaultValue = "false") boolean reviewedToday) {
        return service.technicalReviewQueue(page, size, search, sort, reviewStatus, department, vendor,
                assignedBy, priority, dateFrom, dateTo, reviewedToday);
    }

    /** Review-queue KPI counts and filter options — all counted in the database. */
    @GetMapping("/technical-review/stats")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> technicalReviewStats() {
        return ResponseEntity.ok(ApiResponse.ok(service.technicalReviewQueueStats()));
    }

    @GetMapping("/next-number")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> nextNumber() {
        return ResponseEntity.ok(ApiResponse.ok(service.nextNumber()));
    }

    @GetMapping("/stats")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats() {
        return ResponseEntity.ok(ApiResponse.ok(service.stats()));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<PurchaseDtos.PurchaseRequisitionResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.get(id)));
    }

    @PostMapping
    @PreAuthorize("hasAuthority('PURCHASE_CREATE')")
    public ResponseEntity<ApiResponse<PurchaseDtos.PurchaseRequisitionResponse>> create(
            @Valid @RequestBody PurchaseRequisitionService.PurchaseRequisitionRequestWrapper request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(service.create(request)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<PurchaseDtos.PurchaseRequisitionResponse>> update(
            @PathVariable Long id,
            @Valid @RequestBody PurchaseRequisitionService.PurchaseRequisitionRequestWrapper request) {
        return ResponseEntity.ok(ApiResponse.ok(service.update(id, request)));
    }

    @PatchMapping("/{id}/delete")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Purchase requisition moved to trash"));
    }

    @PatchMapping("/{id}/archive")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Void>> archive(@PathVariable Long id) {
        service.archive(id);
        return ResponseEntity.ok(ApiResponse.ok("Purchase requisition archived"));
    }

    @PatchMapping("/{id}/restore")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<PurchaseDtos.PurchaseRequisitionResponse>> restore(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.restore(id)));
    }

    @PostMapping("/{id}/submit")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<PurchaseDtos.PurchaseRequisitionResponse>> submit(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.submit(id)));
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('PURCHASE_APPROVE')")
    public ResponseEntity<ApiResponse<PurchaseDtos.PurchaseRequisitionResponse>> approve(
            @PathVariable Long id, @RequestBody(required = false) PurchaseDtos.PurchaseActionRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(service.approve(id, remarks(request))));
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('PURCHASE_APPROVE')")
    public ResponseEntity<ApiResponse<PurchaseDtos.PurchaseRequisitionResponse>> reject(
            @PathVariable Long id, @RequestBody(required = false) PurchaseDtos.PurchaseActionRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(service.reject(id, remarks(request))));
    }

    @PostMapping("/{id}/return")
    @PreAuthorize("hasAuthority('PURCHASE_APPROVE')")
    public ResponseEntity<ApiResponse<PurchaseDtos.PurchaseRequisitionResponse>> returnToRequester(
            @PathVariable Long id, @RequestBody(required = false) PurchaseDtos.PurchaseActionRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(service.returnToRequester(id, remarks(request))));
    }

    @PostMapping("/{id}/duplicate")
    @PreAuthorize("hasAuthority('PURCHASE_CREATE')")
    public ResponseEntity<ApiResponse<PurchaseDtos.PurchaseRequisitionResponse>> duplicate(@PathVariable Long id) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(service.duplicate(id)));
    }

    @PostMapping("/convert-to-rfq")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<PurchaseDtos.ConvertResult>> convertToRfq(
            @Valid @RequestBody PurchaseDtos.PurchaseIdsRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(service.convertToRfq(request.ids())));
    }

    @PostMapping("/{id}/convert-to-rfq")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<PurchaseDtos.PurchaseRequisitionResponse>> markConverted(
            @PathVariable Long id, @RequestBody PurchaseDtos.PurchaseRfqNoRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(service.markConvertedToRfq(id, request.rfqNo())));
    }

    @PostMapping("/{id}/technical-review")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<PurchaseDtos.PurchaseRequisitionResponse>> technicalReview(
            @PathVariable Long id, @RequestBody PurchaseDtos.TechnicalReviewRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(service.saveTechnicalReview(id, request)));
    }

    @PostMapping("/{id}/complete-technical-review")
    @PreAuthorize("hasAuthority('PURCHASE_APPROVE')")
    public ResponseEntity<ApiResponse<PurchaseDtos.PurchaseRequisitionResponse>> completeTechnicalReview(
            @PathVariable Long id, @RequestBody(required = false) PurchaseDtos.PurchaseActionRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(service.completeTechnicalReview(id, remarks(request))));
    }

    @GetMapping("/{id}/activity")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<List<PurchaseSupportService.PurchaseActivityEntry>>> activity(
            @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.activity(id)));
    }

    @PostMapping("/{id}/comments")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> comment(
            @PathVariable Long id, @Valid @RequestBody PurchaseDtos.PurchaseCommentRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(service.addComment(id, request.text())));
    }

    @GetMapping("/{id}/attachments")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<List<PurchaseSupportService.PurchaseAttachmentPayload>>> attachments(
            @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.attachments(id)));
    }

    @PostMapping("/{id}/attachments")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<PurchaseSupportService.PurchaseAttachmentPayload>> upload(
            @PathVariable Long id, @RequestPart("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(service.uploadAttachment(id, file)));
    }

    @DeleteMapping("/{id}/attachments/{attachmentId}")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Void>> deleteAttachment(
            @PathVariable Long id, @PathVariable Long attachmentId) {
        service.deleteAttachment(id, attachmentId);
        return ResponseEntity.ok(ApiResponse.ok("Attachment deleted"));
    }

    private String remarks(PurchaseDtos.PurchaseActionRequest request) {
        return request == null ? null
                : (request.remarks() == null ? request.note() : request.remarks());
    }
}
