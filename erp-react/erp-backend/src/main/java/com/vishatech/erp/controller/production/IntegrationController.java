package com.vishatech.erp.controller.production;

import com.vishatech.erp.dto.production.*;
import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.service.production.IntegrationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * REST controller for ERP Integration.
 * Provides cross-module orchestration, workflow validation, and traceability.
 */
@RestController
@RequestMapping("/integration")
@PreAuthorize("hasAuthority('PRODUCTION_VIEW')")
public class IntegrationController {

    private final IntegrationService integrationService;

    public IntegrationController(IntegrationService integrationService) {
        this.integrationService = integrationService;
    }

    // ========================
    // End-to-End Traceability
    // ========================

    /**
     * GET /api/integration/orders/{id}/traceability
     * Get complete end-to-end traceability for a Production Order.
     */
    @GetMapping("/orders/{id}/traceability")
    public ResponseEntity<ApiResponse<OrderTraceabilityDTO>> getTraceability(@PathVariable Long id) {
        OrderTraceabilityDTO trace = integrationService.getOrderTraceability(id);
        return ResponseEntity.ok(ApiResponse.ok(trace));
    }

    /**
     * GET /api/integration/orders/work-order/{workOrder}/traceability
     * Get traceability by Work Order number.
     */
    @GetMapping("/orders/work-order/{workOrder}/traceability")
    public ResponseEntity<ApiResponse<OrderTraceabilityDTO>> getTraceabilityByWorkOrder(
            @PathVariable String workOrder) {
        OrderTraceabilityDTO trace = integrationService.getOrderTraceabilityByWorkOrder(workOrder);
        return ResponseEntity.ok(ApiResponse.ok(trace));
    }

    // ========================
    // Cross-Module Status
    // ========================

    /**
     * GET /api/integration/orders/{id}/status
     * Get cross-module status summary for a Production Order.
     */
    @GetMapping("/orders/{id}/status")
    public ResponseEntity<ApiResponse<CrossModuleStatusDTO>> getCrossModuleStatus(@PathVariable Long id) {
        CrossModuleStatusDTO status = integrationService.getCrossModuleStatus(id);
        return ResponseEntity.ok(ApiResponse.ok(status));
    }

    // ========================
    // Quantity Summary
    // ========================

    /**
     * GET /api/integration/orders/work-order/{workOrder}/quantities
     * Get cross-module quantity summary.
     */
    @GetMapping("/orders/work-order/{workOrder}/quantities")
    public ResponseEntity<ApiResponse<QuantitySummaryDTO>> getQuantitySummary(
            @PathVariable String workOrder) {
        QuantitySummaryDTO summary = integrationService.getQuantitySummary(workOrder);
        return ResponseEntity.ok(ApiResponse.ok(summary));
    }

    // ========================
    // Workflow Prerequisite Checks
    // ========================

    /**
     * GET /api/integration/orders/{id}/can-start-tv
     * Check if order is ready for Technical Verification.
     */
    @GetMapping("/orders/{id}/can-start-tv")
    public ResponseEntity<ApiResponse<WorkflowCheckDTO>> canStartTV(@PathVariable Long id) {
        WorkflowCheckDTO check = integrationService.canStartTechnicalVerification(id);
        return ResponseEntity.ok(ApiResponse.ok(check));
    }

    /**
     * GET /api/integration/orders/{id}/can-start-production
     * Check if order is ready for production.
     */
    @GetMapping("/orders/{id}/can-start-production")
    public ResponseEntity<ApiResponse<WorkflowCheckDTO>> canStartProduction(@PathVariable Long id) {
        WorkflowCheckDTO check = integrationService.canStartProduction(id);
        return ResponseEntity.ok(ApiResponse.ok(check));
    }

    /**
     * GET /api/integration/orders/work-order/{workOrder}/can-start-quality
     * Check if work order is ready for Quality.
     */
    @GetMapping("/orders/work-order/{workOrder}/can-start-quality")
    public ResponseEntity<ApiResponse<WorkflowCheckDTO>> canStartQuality(
            @PathVariable String workOrder) {
        WorkflowCheckDTO check = integrationService.canStartQuality(workOrder);
        return ResponseEntity.ok(ApiResponse.ok(check));
    }

    /**
     * GET /api/integration/orders/work-order/{workOrder}/can-start-packing
     * Check if work order is ready for Packing.
     */
    @GetMapping("/orders/work-order/{workOrder}/can-start-packing")
    public ResponseEntity<ApiResponse<WorkflowCheckDTO>> canStartPacking(
            @PathVariable String workOrder) {
        WorkflowCheckDTO check = integrationService.canStartPacking(workOrder);
        return ResponseEntity.ok(ApiResponse.ok(check));
    }

    /**
     * GET /api/integration/orders/work-order/{workOrder}/can-start-dispatch
     * Check if work order is ready for Dispatch.
     */
    @GetMapping("/orders/work-order/{workOrder}/can-start-dispatch")
    public ResponseEntity<ApiResponse<WorkflowCheckDTO>> canStartDispatch(
            @PathVariable String workOrder) {
        WorkflowCheckDTO check = integrationService.canStartDispatch(workOrder);
        return ResponseEntity.ok(ApiResponse.ok(check));
    }

    // ========================
    // Advance to Next Stage
    // ========================

    /**
     * POST /api/integration/orders/{id}/advance
     * Advance a Production Order to its next logical stage.
     */
    @PostMapping("/orders/{id}/advance")
    public ResponseEntity<ApiResponse<CrossModuleStatusDTO>> advanceToNextStage(
            @PathVariable Long id,
            @RequestBody(required = false) StatusTransitionRequest request) {
        String performedBy = request != null && request.getRemarks() != null ? request.getRemarks() : "System";
        CrossModuleStatusDTO status = integrationService.advanceToNextStage(id, performedBy);
        return ResponseEntity.ok(ApiResponse.ok("Advanced to next stage.", status));
    }

    // ========================
    // ERP Dashboard
    // ========================

    /**
     * GET /api/integration/dashboard
     * Get ERP-wide dashboard summary.
     */
    @GetMapping("/dashboard")
    public ResponseEntity<ApiResponse<ERPDashboardDTO>> getDashboard() {
        ERPDashboardDTO dashboard = integrationService.getDashboardSummary();
        return ResponseEntity.ok(ApiResponse.ok(dashboard));
    }
}
