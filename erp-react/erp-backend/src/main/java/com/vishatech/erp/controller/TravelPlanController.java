package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.TravelPlanListResponse;
import com.vishatech.erp.dto.TravelPlanRequest;
import com.vishatech.erp.dto.TravelPlanResponse;
import com.vishatech.erp.sales.api.AttachmentStorePort;
import com.vishatech.erp.service.TravelPlanService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.multipart.MultipartFile;

/**
 * REST API for the Marketing Travel Planner.
 *
 * <p>Endpoints follow the project's naming conventions:
 *   /marketing/travel-plans/**
 *
 * <p>Authorization is the module's own: every endpoint requires the matching
 * Marketing authority (the same {@code MARKETING_VIEW/CREATE/EDIT/DELETE}
 * authorities the rest of {@code /marketing/**} gates on, all derived
 * server-side from the caller's role), and the per-record rule (the plan's own
 * marketer, or ADMIN/MANAGER) lives in {@link TravelPlanService}. A registry is
 * therefore never readable or changeable just by presenting its id.
 *
 * <p>Completely independent from Sales.
 */
@RestController
@RequestMapping("/marketing/travel-plans")
@PreAuthorize("hasAuthority('MARKETING_VIEW')")
public class TravelPlanController {

    private final TravelPlanService travelPlanService;

    public TravelPlanController(TravelPlanService travelPlanService) {
        this.travelPlanService = travelPlanService;
    }

    // ============================== Summary ================================

    @GetMapping("/summary")
    public ResponseEntity<ApiResponse<TravelPlanService.PlanSummary>> getSummary() {
        return ResponseEntity.ok(ApiResponse.ok(travelPlanService.getSummary()));
    }

    // ============================== Map ====================================

    @GetMapping("/map/journeys")
    public ResponseEntity<ApiResponse<List<TravelPlanResponse>>> mapJourneys(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String marketer) {
        return ResponseEntity.ok(ApiResponse.ok(travelPlanService.mapJourneys(status, marketer)));
    }

    // ============================== CRUD ====================================

    @PostMapping
    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    public ResponseEntity<ApiResponse<TravelPlanResponse>> create(
            @Valid @RequestBody TravelPlanRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(travelPlanService.create(request)));
    }

    @GetMapping
    public Page<TravelPlanListResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String marketer,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return travelPlanService.list(page, size, search, sort, status, marketer, dateFrom, dateTo);
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<TravelPlanResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(travelPlanService.get(id)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelPlanResponse>> update(
            @PathVariable Long id,
            @Valid @RequestBody TravelPlanRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(travelPlanService.update(id, request)));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('MARKETING_DELETE')")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        travelPlanService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Travel plan deleted"));
    }

    // ============================== Draft / Submit ===========================

    @PutMapping("/{id}/draft")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelPlanResponse>> saveDraft(
            @PathVariable Long id,
            @Valid @RequestBody TravelPlanRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(travelPlanService.saveDraft(id, request)));
    }

    @PostMapping("/{id}/submit")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelPlanResponse>> submit(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(travelPlanService.submit(id)));
    }

    // ============================== Approval ================================

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelPlanResponse>> approve(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(travelPlanService.approve(id)));
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelPlanResponse>> reject(
            @PathVariable Long id,
            @Valid @RequestBody TravelPlanRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(travelPlanService.reject(id, request)));
    }

    @PostMapping("/{id}/revision")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelPlanResponse>> requestRevision(
            @PathVariable Long id,
            @Valid @RequestBody TravelPlanRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(travelPlanService.requestRevision(id, request)));
    }

    // ============================== Trip Execution ===========================

    private static final TravelPlanRequest EMPTY_REQUEST = new TravelPlanRequest(
            null, null, null, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null, null, null,
            null, null, null, null, null);

    @PostMapping("/{id}/start")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelPlanResponse>> startTrip(
            @PathVariable Long id,
            @Valid @RequestBody(required = false) TravelPlanRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(
                travelPlanService.startTrip(id, request != null ? request : EMPTY_REQUEST)));
    }

    @PostMapping("/{id}/end")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelPlanResponse>> endTrip(
            @PathVariable Long id,
            @Valid @RequestBody(required = false) TravelPlanRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(
                travelPlanService.endTrip(id, request != null ? request : EMPTY_REQUEST)));
    }

    // ============================== Stop Operations ==========================

    @PostMapping("/{id}/stops")
    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    public ResponseEntity<ApiResponse<TravelPlanResponse>> addStop(
            @PathVariable Long id,
            @Valid @RequestBody TravelPlanRequest.StopDto stop) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(travelPlanService.addStop(id, stop)));
    }

    @PutMapping("/{planId}/stops/{stopId}")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelPlanResponse>> updateStop(
            @PathVariable Long planId,
            @PathVariable Long stopId,
            @Valid @RequestBody TravelPlanRequest.StopDto stop) {
        return ResponseEntity.ok(ApiResponse.ok(travelPlanService.updateStop(planId, stopId, stop)));
    }

    @PostMapping("/{planId}/stops/{stopId}/cancel")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelPlanResponse>> cancelStop(
            @PathVariable Long planId,
            @PathVariable Long stopId,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(ApiResponse.ok(
                travelPlanService.cancelStop(planId, stopId, body.get("reason"))));
    }

    @PostMapping("/{planId}/stops/{stopId}/reschedule")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelPlanResponse>> rescheduleStop(
            @PathVariable Long planId,
            @PathVariable Long stopId,
            @Valid @RequestBody TravelPlanRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(travelPlanService.rescheduleStop(planId, stopId, request)));
    }

    @PostMapping("/{planId}/stops/{stopId}/checkin")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelPlanResponse>> checkIn(
            @PathVariable Long planId,
            @PathVariable Long stopId,
            @Valid @RequestBody(required = false) TravelPlanRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(
                travelPlanService.checkIn(planId, stopId, request != null ? request : EMPTY_REQUEST)));
    }

    @PostMapping("/{planId}/stops/{stopId}/checkout")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelPlanResponse>> checkOut(
            @PathVariable Long planId,
            @PathVariable Long stopId,
            @Valid @RequestBody(required = false) TravelPlanRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(
                travelPlanService.checkOut(planId, stopId, request != null ? request : EMPTY_REQUEST)));
    }

    @PostMapping("/{planId}/stops/{stopId}/reached")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelPlanResponse>> markStopReached(
            @PathVariable Long planId,
            @PathVariable Long stopId) {
        return ResponseEntity.ok(ApiResponse.ok(
                travelPlanService.markStopReached(planId, stopId)));
    }

    @PostMapping("/{planId}/stops/{stopId}/skipped")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelPlanResponse>> markStopSkipped(
            @PathVariable Long planId,
            @PathVariable Long stopId) {
        return ResponseEntity.ok(ApiResponse.ok(
                travelPlanService.markStopSkipped(planId, stopId)));
    }

    @PutMapping("/{id}/reorder")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelPlanResponse>> reorderStops(
            @PathVariable Long id,
            @RequestBody List<Long> orderedStopIds) {
        return ResponseEntity.ok(ApiResponse.ok(travelPlanService.reorderStops(id, orderedStopIds)));
    }

    // ============================== Route ====================================

    @PostMapping("/{id}/recalculate")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelPlanResponse>> recalculateRoute(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(travelPlanService.recalculateRoute(id)));
    }

    // ============================== Attachments ==============================

    /**
     * Attachments of one Travel Registry, stored in the shared attachment store
     * under {@link TravelPlanService#ATTACHMENT_MODULE} and returned in the same
     * contract the Production attachment endpoints publish.
     *
     * <p>Authorization is the controller's usual {@code isAuthenticated()} plus the
     * service's existing registry-level rule (owner, or ADMIN/MANAGER), so an
     * attachment is never readable or deletable outside the registry it belongs to.
     */
    @GetMapping("/{id}/attachments")
    public ResponseEntity<List<AttachmentStorePort.AttachmentRef>> attachments(@PathVariable Long id) {
        return ResponseEntity.ok(travelPlanService.getAttachments(id));
    }

    @PostMapping("/{id}/attachments")
    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    public ResponseEntity<ApiResponse<AttachmentStorePort.AttachmentRef>> addAttachment(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(travelPlanService.addAttachment(id, file)));
    }

    @DeleteMapping("/{id}/attachments/{attachmentId}")
    @PreAuthorize("hasAuthority('MARKETING_DELETE')")
    public ResponseEntity<ApiResponse<Void>> deleteAttachment(
            @PathVariable Long id,
            @PathVariable Long attachmentId) {
        travelPlanService.deleteAttachment(id, attachmentId);
        return ResponseEntity.ok(ApiResponse.ok("Attachment deleted"));
    }
}
