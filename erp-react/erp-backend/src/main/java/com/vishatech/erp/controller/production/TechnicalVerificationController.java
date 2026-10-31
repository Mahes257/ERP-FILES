package com.vishatech.erp.controller.production;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.production.PagedResponse;
import com.vishatech.erp.dto.production.TVHistoryDTO;
import com.vishatech.erp.dto.production.TVStatsDTO;
import com.vishatech.erp.dto.production.TechnicalVerificationDTO;
import com.vishatech.erp.service.production.TechnicalVerificationService;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST controller for Technical Verification records.
 */
@RestController
@RequestMapping("/technical-verifications")
@PreAuthorize("hasAuthority('PRODUCTION_VIEW')")
public class TechnicalVerificationController {

    private final TechnicalVerificationService tvService;

    public TechnicalVerificationController(TechnicalVerificationService tvService) {
        this.tvService = tvService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<PagedResponse<TechnicalVerificationDTO>>> listVerifications(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String productionType,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size,
            @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "desc") String direction) {

        Page<TechnicalVerificationDTO> result = tvService.getAllVerifications(
            search, status, productionType, page, size, sort, direction
        );

        PagedResponse<TechnicalVerificationDTO> pagedResponse = PagedResponse.<TechnicalVerificationDTO>builder()
            .content(result.getContent())
            .page(result.getNumber())
            .size(result.getSize())
            .totalElements(result.getTotalElements())
            .totalPages(result.getTotalPages())
            .first(result.isFirst())
            .last(result.isLast())
            .build();

        return ResponseEntity.ok(ApiResponse.ok(pagedResponse));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<TechnicalVerificationDTO>> getVerification(@PathVariable Long id) {
        TechnicalVerificationDTO result = tvService.getVerification(id);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<TechnicalVerificationDTO>> saveVerification(
            @RequestBody TechnicalVerificationDTO request) {
        TechnicalVerificationDTO result = tvService.saveTechnicalVerification(request);
        return ResponseEntity.ok(ApiResponse.ok("Technical verification saved.", result));
    }

    @GetMapping("/work-order/{workOrderId}")
    public ResponseEntity<ApiResponse<List<TechnicalVerificationDTO>>> getVerificationsForOrder(
            @PathVariable String workOrderId) {
        List<TechnicalVerificationDTO> results = tvService.getTechnicalVerificationsForOrder(workOrderId);
        return ResponseEntity.ok(ApiResponse.ok(results));
    }

    @GetMapping("/work-order/{workOrderId}/item/{itemId}")
    public ResponseEntity<ApiResponse<TechnicalVerificationDTO>> getVerificationForItem(
            @PathVariable String workOrderId, @PathVariable String itemId) {
        TechnicalVerificationDTO result = tvService.getTechnicalVerification(workOrderId, itemId);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_DELETE')")
    @DeleteMapping("/work-order/{workOrderId}")
    public ResponseEntity<ApiResponse<Void>> deleteVerificationsForOrder(
            @PathVariable String workOrderId) {
        tvService.deleteTechnicalVerificationsForOrder(workOrderId);
        return ResponseEntity.ok(ApiResponse.ok("Technical verifications deleted.", null));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PostMapping("/work-order/{workOrderId}/item/{itemId}/verify")
    public ResponseEntity<ApiResponse<TechnicalVerificationDTO>> verifyItem(
            @PathVariable String workOrderId,
            @PathVariable String itemId,
            @RequestBody(required = false) java.util.Map<String, String> body) {
        String performedBy = body != null ? body.get("performedBy") : null;
        String remarks = body != null ? body.get("remarks") : null;
        TechnicalVerificationDTO result = tvService.verify(workOrderId, itemId, performedBy, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Verification completed.", result));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PostMapping("/work-order/{workOrderId}/item/{itemId}/reject")
    public ResponseEntity<ApiResponse<TechnicalVerificationDTO>> rejectItem(
            @PathVariable String workOrderId,
            @PathVariable String itemId,
            @RequestBody(required = false) java.util.Map<String, String> body) {
        String performedBy = body != null ? body.get("performedBy") : null;
        String remarks = body != null ? body.get("remarks") : null;
        TechnicalVerificationDTO result = tvService.reject(workOrderId, itemId, performedBy, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Verification rejected.", result));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PostMapping("/work-order/{workOrderId}/item/{itemId}/resubmit")
    public ResponseEntity<ApiResponse<TechnicalVerificationDTO>> resubmitItem(
            @PathVariable String workOrderId,
            @PathVariable String itemId,
            @RequestBody(required = false) java.util.Map<String, String> body) {
        String performedBy = body != null ? body.get("performedBy") : null;
        TechnicalVerificationDTO result = tvService.resubmit(workOrderId, itemId, performedBy);
        return ResponseEntity.ok(ApiResponse.ok("Verification resubmitted.", result));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<TVStatsDTO>> getStats() {
        TVStatsDTO stats = tvService.getStatistics();
        return ResponseEntity.ok(ApiResponse.ok(stats));
    }

    @GetMapping("/{id}/history")
    public ResponseEntity<ApiResponse<List<TVHistoryDTO>>> getHistory(@PathVariable Long id) {
        List<TVHistoryDTO> history = tvService.getHistory(id);
        return ResponseEntity.ok(ApiResponse.ok(history));
    }

    @GetMapping("/work-order/{workOrderId}/item/{itemId}/history")
    public ResponseEntity<ApiResponse<List<TVHistoryDTO>>> getHistoryByWorkOrder(
            @PathVariable String workOrderId, @PathVariable String itemId) {
        List<TVHistoryDTO> history = tvService.getHistoryByWorkOrder(workOrderId, itemId);
        return ResponseEntity.ok(ApiResponse.ok(history));
    }
}
