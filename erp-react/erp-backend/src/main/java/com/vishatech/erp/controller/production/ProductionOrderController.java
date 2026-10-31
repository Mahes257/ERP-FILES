package com.vishatech.erp.controller.production;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.production.*;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.sales.api.AttachmentStorePort;
import com.vishatech.erp.service.production.ProductionAttachmentService;
import com.vishatech.erp.service.production.ProductionOrderService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

/**
 * REST controller for Production Orders / Work Orders.
 * Uses the same authentication as Sales/Marketing — JWT via SecurityConfig.
 */
@RestController
@RequestMapping("/production-orders")
@PreAuthorize("hasAuthority('PRODUCTION_VIEW')")
public class ProductionOrderController {

    private static final String MODULE = "PRODUCTION_ORDER";

    /**
     * Attachment module type for ONE production item of a Work Order. Items are
     * filed in the same shared attachment table under their own primary key, so
     * a file belongs to exactly one item and never to the Work Order as a whole.
     */
    private static final String MODULE_ITEM = "PRODUCTION_ORDER_ITEM";

    private final ProductionOrderService orderService;
    private final ProductionAttachmentService attachmentService;

    public ProductionOrderController(ProductionOrderService orderService,
                                     ProductionAttachmentService attachmentService) {
        this.orderService = orderService;
        this.attachmentService = attachmentService;
    }

    // ========================
    // CRUD
    // ========================

    @GetMapping
    public ResponseEntity<ApiResponse<PagedResponse<ProductionOrderDTO>>> listOrders(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String productionType,
            @RequestParam(required = false) String priority,
            @RequestParam(required = false) String currentStage,
            @RequestParam(required = false) String salesOrder,
            @RequestParam(required = false) String startDateFrom,
            @RequestParam(required = false) String startDateTo,
            @RequestParam(required = false) String dueDateFrom,
            @RequestParam(required = false) String dueDateTo,
            @RequestParam(defaultValue = "0") int page,
            // Default page size 25, hard-capped at 100 by ProductionOrderService
            // (Math.min(size, 100)) so a caller can never request an unbounded dump.
            @RequestParam(defaultValue = "25") int size,
            @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "desc") String direction) {

        PagedResponse<ProductionOrderDTO> result = orderService.getOrders(
            search, status, productionType, priority, currentStage, salesOrder,
            startDateFrom, startDateTo, dueDateFrom, dueDateTo,
            page, size, sort, direction
        );
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ProductionOrderDTO>> getOrder(@PathVariable Long id) {
        ProductionOrderDTO order = orderService.getOrder(id);
        return ResponseEntity.ok(ApiResponse.ok(order));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<ProductionOrderDTO>> createOrder(
            @Valid @RequestBody CreateProductionOrderRequest request,
            Authentication authentication) {
        String user = authentication != null ? authentication.getName() : "system";
        ProductionOrderDTO order = orderService.createOrder(request, user);
        return ResponseEntity.status(HttpStatus.CREATED).body(
            ApiResponse.ok("Work Order " + order.getWorkOrder() + " created.", order)
        );
    }

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<ProductionOrderDTO>> updateOrder(
            @PathVariable Long id,
            @Valid @RequestBody UpdateProductionOrderRequest request) {
        ProductionOrderDTO order = orderService.updateOrder(id, request);
        return ResponseEntity.ok(ApiResponse.ok("Work Order updated.", order));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_DELETE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteOrder(@PathVariable Long id) {
        orderService.deleteOrder(id);
        return ResponseEntity.ok(ApiResponse.ok("Work Order deleted"));
    }

    // ========================
    // Status Transitions — use authenticated user
    // ========================

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PostMapping("/{id}/submit-production-approval")
    public ResponseEntity<ApiResponse<ProductionOrderDTO>> submitProductionApproval(
            @PathVariable Long id,
            @RequestBody(required = false) StatusTransitionRequest request,
            Authentication authentication) {
        String user = authentication != null ? authentication.getName() : "system";
        String remarks = request != null ? request.getRemarks() : null;
        ProductionOrderDTO order = orderService.submitProductionApproval(id, user, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Submitted for Production Approval.", order));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_APPROVE')")
    @PostMapping("/{id}/approve-production")
    public ResponseEntity<ApiResponse<ProductionOrderDTO>> approveProduction(
            @PathVariable Long id,
            @RequestBody(required = false) StatusTransitionRequest request,
            Authentication authentication) {
        String user = authentication != null ? authentication.getName() : "system";
        String remarks = request != null ? request.getRemarks() : null;
        ProductionOrderDTO order = orderService.approveProduction(id, user, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Production Approved.", order));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PostMapping("/{id}/submit-admin-approval")
    public ResponseEntity<ApiResponse<ProductionOrderDTO>> submitAdminApproval(
            @PathVariable Long id,
            @RequestBody(required = false) StatusTransitionRequest request,
            Authentication authentication) {
        String user = authentication != null ? authentication.getName() : "system";
        String remarks = request != null ? request.getRemarks() : null;
        ProductionOrderDTO order = orderService.submitAdminApproval(id, user, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Submitted for Admin Approval.", order));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_APPROVE')")
    @PostMapping("/{id}/approve-admin")
    public ResponseEntity<ApiResponse<ProductionOrderDTO>> approveAdmin(
            @PathVariable Long id,
            @RequestBody(required = false) StatusTransitionRequest request,
            Authentication authentication) {
        String user = authentication != null ? authentication.getName() : "system";
        String remarks = request != null ? request.getRemarks() : null;
        ProductionOrderDTO order = orderService.approveAdmin(id, user, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Admin Approved.", order));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_APPROVE')")
    @PostMapping("/{id}/final-approve")
    public ResponseEntity<ApiResponse<ProductionOrderDTO>> finalApprove(
            @PathVariable Long id,
            @RequestBody(required = false) StatusTransitionRequest request,
            Authentication authentication) {
        String user = authentication != null ? authentication.getName() : "system";
        String remarks = request != null ? request.getRemarks() : null;
        ProductionOrderDTO order = orderService.finalApprove(id, user, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Final Approved.", order));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PostMapping("/{id}/start-production")
    public ResponseEntity<ApiResponse<ProductionOrderDTO>> startProduction(
            @PathVariable Long id,
            @RequestBody(required = false) StatusTransitionRequest request,
            Authentication authentication) {
        String user = authentication != null ? authentication.getName() : "system";
        String remarks = request != null ? request.getRemarks() : null;
        ProductionOrderDTO order = orderService.startProduction(id, user, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Production Started.", order));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PostMapping("/{id}/pending-qc")
    public ResponseEntity<ApiResponse<ProductionOrderDTO>> sendToQuality(
            @PathVariable Long id,
            @RequestBody(required = false) StatusTransitionRequest request,
            Authentication authentication) {
        String user = authentication != null ? authentication.getName() : "system";
        String remarks = request != null ? request.getRemarks() : null;
        ProductionOrderDTO order = orderService.sendToQuality(id, user, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Sent to Quality.", order));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PostMapping("/{id}/packed")
    public ResponseEntity<ApiResponse<ProductionOrderDTO>> markPacked(
            @PathVariable Long id,
            @RequestBody(required = false) StatusTransitionRequest request,
            Authentication authentication) {
        String user = authentication != null ? authentication.getName() : "system";
        String remarks = request != null ? request.getRemarks() : null;
        ProductionOrderDTO order = orderService.markPacked(id, user, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Work Order Packed.", order));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_DISPATCH')")
    @PostMapping("/{id}/ready-for-dispatch")
    public ResponseEntity<ApiResponse<ProductionOrderDTO>> markReadyForDispatch(
            @PathVariable Long id,
            @RequestBody(required = false) StatusTransitionRequest request,
            Authentication authentication) {
        String user = authentication != null ? authentication.getName() : "system";
        String remarks = request != null ? request.getRemarks() : null;
        ProductionOrderDTO order = orderService.markReadyForDispatch(id, user, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Work Order Ready for Dispatch.", order));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PostMapping("/{id}/hold")
    public ResponseEntity<ApiResponse<ProductionOrderDTO>> holdProduction(
            @PathVariable Long id,
            @RequestBody(required = false) StatusTransitionRequest request,
            Authentication authentication) {
        String user = authentication != null ? authentication.getName() : "system";
        String remarks = request != null ? request.getRemarks() : null;
        ProductionOrderDTO order = orderService.holdProduction(id, user, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Production on Hold.", order));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PostMapping("/{id}/resume")
    public ResponseEntity<ApiResponse<ProductionOrderDTO>> resumeProduction(
            @PathVariable Long id,
            @RequestBody(required = false) StatusTransitionRequest request,
            Authentication authentication) {
        String user = authentication != null ? authentication.getName() : "system";
        String remarks = request != null ? request.getRemarks() : null;
        ProductionOrderDTO order = orderService.resumeProduction(id, user, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Production Resumed.", order));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PostMapping("/{id}/complete")
    public ResponseEntity<ApiResponse<ProductionOrderDTO>> completeProduction(
            @PathVariable Long id,
            @RequestBody(required = false) StatusTransitionRequest request,
            Authentication authentication) {
        String user = authentication != null ? authentication.getName() : "system";
        String remarks = request != null ? request.getRemarks() : null;
        ProductionOrderDTO order = orderService.completeProduction(id, user, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Production Completed.", order));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PostMapping("/{id}/cancel")
    public ResponseEntity<ApiResponse<ProductionOrderDTO>> cancelOrder(
            @PathVariable Long id,
            @RequestBody(required = false) StatusTransitionRequest request,
            Authentication authentication) {
        String user = authentication != null ? authentication.getName() : "system";
        String remarks = request != null ? request.getRemarks() : null;
        ProductionOrderDTO order = orderService.cancelOrder(id, user, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Work Order Cancelled.", order));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_APPROVE')")
    @PostMapping("/{id}/reject-production")
    public ResponseEntity<ApiResponse<ProductionOrderDTO>> rejectProduction(
            @PathVariable Long id,
            @RequestBody(required = false) StatusTransitionRequest request,
            Authentication authentication) {
        String user = authentication != null ? authentication.getName() : "system";
        String remarks = request != null ? request.getRemarks() : null;
        ProductionOrderDTO order = orderService.rejectProduction(id, user, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Production Approval Rejected.", order));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_APPROVE')")
    @PostMapping("/{id}/reject-admin")
    public ResponseEntity<ApiResponse<ProductionOrderDTO>> rejectAdmin(
            @PathVariable Long id,
            @RequestBody(required = false) StatusTransitionRequest request,
            Authentication authentication) {
        String user = authentication != null ? authentication.getName() : "system";
        String remarks = request != null ? request.getRemarks() : null;
        ProductionOrderDTO order = orderService.rejectAdmin(id, user, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Admin Approval Rejected.", order));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PostMapping("/{id}/return-to-draft")
    public ResponseEntity<ApiResponse<ProductionOrderDTO>> returnToDraft(
            @PathVariable Long id,
            @RequestBody(required = false) StatusTransitionRequest request,
            Authentication authentication) {
        String user = authentication != null ? authentication.getName() : "system";
        String remarks = request != null ? request.getRemarks() : null;
        ProductionOrderDTO order = orderService.returnToDraft(id, user, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Returned to Draft.", order));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PostMapping("/{id}/resubmit-to-production")
    public ResponseEntity<ApiResponse<ProductionOrderDTO>> resubmitToProduction(
            @PathVariable Long id,
            @RequestBody(required = false) StatusTransitionRequest request,
            Authentication authentication) {
        String user = authentication != null ? authentication.getName() : "system";
        String remarks = request != null ? request.getRemarks() : null;
        ProductionOrderDTO order = orderService.resubmitToProduction(id, user, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Resubmitted to Production.", order));
    }

    // ========================
    // Statistics
    // ========================

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<ProductionStatsDTO>> getStats() {
        ProductionStatsDTO stats = orderService.getStatistics();
        return ResponseEntity.ok(ApiResponse.ok(stats));
    }

    // ========================
    // Workflow Status
    // ========================

    @GetMapping("/{id}/workflow-status")
    public ResponseEntity<ApiResponse<WorkflowStatusDTO>> getWorkflowStatus(@PathVariable Long id) {
        WorkflowStatusDTO status = orderService.getWorkflowStatus(id);
        return ResponseEntity.ok(ApiResponse.ok(status));
    }

    // ========================
    // Timeline & History
    // ========================

    @GetMapping("/{id}/timeline")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getTimeline(@PathVariable Long id) {
        List<Map<String, Object>> timeline = orderService.getTimeline(id);
        return ResponseEntity.ok(ApiResponse.ok(timeline));
    }

    @GetMapping("/{id}/approval-history")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getApprovalHistory(@PathVariable Long id) {
        List<Map<String, Object>> history = orderService.getApprovalHistory(id);
        return ResponseEntity.ok(ApiResponse.ok(history));
    }

    // ========================
    // Attachments (stored through the Sales-owned attachment port)
    // ========================

    @GetMapping("/{id}/attachments")
    public ResponseEntity<List<AttachmentStorePort.AttachmentRef>> attachments(@PathVariable Long id) {
        return ResponseEntity.ok(attachmentService.getAttachments(MODULE, id));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/attachments")
    public ResponseEntity<ApiResponse<AttachmentStorePort.AttachmentRef>> addAttachment(
            @PathVariable Long id, @RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(attachmentService.addAttachment(MODULE, id, file)));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_DELETE')")
    @DeleteMapping("/{id}/attachments/{attachmentId}")
    public ResponseEntity<ApiResponse<Void>> deleteAttachment(
            @PathVariable Long id, @PathVariable Long attachmentId) {
        attachmentService.deleteAttachment(MODULE, id, attachmentId);
        return ResponseEntity.ok(ApiResponse.ok("Attachment deleted"));
    }

    // ========================
    // Item-wise Attachments
    // ========================

    @GetMapping("/{id}/items/{itemId}/attachments")
    public ResponseEntity<List<AttachmentStorePort.AttachmentRef>> itemAttachments(
            @PathVariable Long id, @PathVariable Long itemId) {
        requireItemOfOrder(id, itemId);
        return ResponseEntity.ok(attachmentService.getAttachments(MODULE_ITEM, itemId));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/items/{itemId}/attachments")
    public ResponseEntity<ApiResponse<AttachmentStorePort.AttachmentRef>> addItemAttachment(
            @PathVariable Long id, @PathVariable Long itemId, @RequestParam("file") MultipartFile file) {
        requireItemOfOrder(id, itemId);
        // The archived Documents copy is filed against the Work Order that owns
        // this item (the record "Open Related Record" can resolve), not the item id.
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(attachmentService.addAttachment(MODULE_ITEM, itemId, file, id)));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_DELETE')")
    @DeleteMapping("/{id}/items/{itemId}/attachments/{attachmentId}")
    public ResponseEntity<ApiResponse<Void>> deleteItemAttachment(
            @PathVariable Long id, @PathVariable Long itemId, @PathVariable Long attachmentId) {
        requireItemOfOrder(id, itemId);
        attachmentService.deleteAttachment(MODULE_ITEM, itemId, attachmentId);
        return ResponseEntity.ok(ApiResponse.ok("Attachment deleted"));
    }

    /**
     * An item attachment route only addresses an item that really belongs to the
     * Work Order in its path, so an id pair from two different orders can never
     * read, add to, or delete another order's item files.
     */
    private void requireItemOfOrder(Long id, Long itemId) {
        ProductionOrderDTO order = orderService.getOrder(id);
        boolean belongs = order != null && order.getItems() != null
                && order.getItems().stream()
                    .anyMatch(item -> itemId.equals(item.getId()));
        if (!belongs) {
            throw new ResourceNotFoundException(
                    "Work Order item " + itemId + " does not belong to Work Order " + id);
        }
    }
}
