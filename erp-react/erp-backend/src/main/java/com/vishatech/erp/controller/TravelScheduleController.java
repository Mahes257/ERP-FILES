package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.TravelScheduleListResponse;
import com.vishatech.erp.dto.TravelScheduleRequest;
import com.vishatech.erp.dto.TravelScheduleResponse;
import com.vishatech.erp.sales.api.AttachmentStorePort;
import com.vishatech.erp.service.TravelScheduleService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/**
 * REST API for the Marketing Travel Scheduler.
 *
 * <p>Endpoints follow the module's naming convention
 * ({@code /marketing/travel-schedules/**}) and mirror the Travel Registry
 * controller: the same response envelopes, the same workflow sub-resources, the
 * same attachment contract. Travel Scheduler and Travel Registry are separate
 * features with separate tables — nothing here reads or writes a registry
 * record.
 *
 * <p>Authorization is the module's own: every endpoint requires the caller to
 * hold the matching Marketing authority (the same
 * {@code MARKETING_VIEW/CREATE/EDIT/DELETE} authorities the rest of
 * {@code /marketing/**} gates on, all derived server-side from the caller's
 * role), and the per-record rule (ADMIN/MANAGER, or assigned/requesting user)
 * lives in {@link TravelScheduleService}, matching how the registry scopes
 * access. A schedule is therefore never readable or changeable just by
 * presenting its id.
 */
@RestController
@RequestMapping("/marketing/travel-schedules")
@PreAuthorize("hasAuthority('MARKETING_VIEW')")
public class TravelScheduleController {

    private final TravelScheduleService scheduleService;

    public TravelScheduleController(TravelScheduleService scheduleService) {
        this.scheduleService = scheduleService;
    }

    // ============================== Options ================================

    /** Purpose / priority / travel-mode lists the form renders. */
    @GetMapping("/options")
    public ResponseEntity<ApiResponse<TravelScheduleService.ScheduleOptions>> options() {
        return ResponseEntity.ok(ApiResponse.ok(scheduleService.getOptions()));
    }

    // ============================== CRUD ===================================

    @PostMapping
    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    public ResponseEntity<ApiResponse<TravelScheduleResponse>> create(
            @Valid @RequestBody TravelScheduleRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(scheduleService.create(request)));
    }

    @GetMapping
    public Page<TravelScheduleListResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long assignedUserId,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String destination) {
        return scheduleService.list(page, size, search, sort, status, assignedUserId,
                dateFrom, dateTo, destination);
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<TravelScheduleResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(scheduleService.get(id)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelScheduleResponse>> update(
            @PathVariable Long id,
            @Valid @RequestBody TravelScheduleRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(scheduleService.update(id, request)));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('MARKETING_DELETE')")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        scheduleService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Travel schedule deleted"));
    }

    // ============================== Approval ===============================

    @PostMapping("/{id}/submit")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelScheduleResponse>> submit(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(scheduleService.submit(id)));
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelScheduleResponse>> approve(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(scheduleService.approve(id)));
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelScheduleResponse>> reject(
            @PathVariable Long id,
            @Valid @RequestBody TravelScheduleRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(scheduleService.reject(id, request)));
    }

    @PostMapping("/{id}/revision")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelScheduleResponse>> requestRevision(
            @PathVariable Long id,
            @Valid @RequestBody TravelScheduleRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(scheduleService.requestRevision(id, request)));
    }

    @PostMapping("/{id}/complete")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelScheduleResponse>> complete(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(scheduleService.complete(id)));
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    public ResponseEntity<ApiResponse<TravelScheduleResponse>> cancel(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(ApiResponse.ok(scheduleService.cancel(id, body.get("reason"))));
    }

    // ============================== Attachments =============================

    /**
     * Supporting documents of one schedule, stored in the shared attachment
     * store under {@link TravelScheduleService#ATTACHMENT_MODULE} and returned in
     * the same contract the Travel Registry and Production endpoints publish.
     */
    @GetMapping("/{id}/attachments")
    public ResponseEntity<List<AttachmentStorePort.AttachmentRef>> attachments(@PathVariable Long id) {
        return ResponseEntity.ok(scheduleService.getAttachments(id));
    }

    @PostMapping("/{id}/attachments")
    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    public ResponseEntity<ApiResponse<AttachmentStorePort.AttachmentRef>> addAttachment(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(scheduleService.addAttachment(id, file)));
    }

    @DeleteMapping("/{id}/attachments/{attachmentId}")
    @PreAuthorize("hasAuthority('MARKETING_DELETE')")
    public ResponseEntity<ApiResponse<Void>> deleteAttachment(
            @PathVariable Long id,
            @PathVariable Long attachmentId) {
        scheduleService.deleteAttachment(id, attachmentId);
        return ResponseEntity.ok(ApiResponse.ok("Attachment deleted"));
    }
}
