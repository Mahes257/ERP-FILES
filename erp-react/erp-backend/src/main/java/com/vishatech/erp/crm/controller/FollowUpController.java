package com.vishatech.erp.crm.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.BulkRequest;
import com.vishatech.erp.crm.dto.FollowUpRequest;
import com.vishatech.erp.crm.dto.FollowUpResponse;
import com.vishatech.erp.crm.service.FollowUpService;
import com.vishatech.erp.crm.dto.AttachmentResponse;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
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
@RequestMapping("/followups")
@PreAuthorize("hasAuthority('CRM_VIEW')")
public class FollowUpController {

    private final FollowUpService followUpService;

    public FollowUpController(FollowUpService followUpService) {
        this.followUpService = followUpService;
    }

    @GetMapping
    public Page<FollowUpResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String priority,
            @RequestParam(required = false) String stage,
            @RequestParam(required = false) LocalDate dateFrom,
            @RequestParam(required = false) LocalDate dateTo,
            // Quotation-scoped view (Quotation Overview → Follow-ups tab):
            // restrict the page to followups.quotationId. Omitted → the general
            // CRM listing is unchanged.
            @RequestParam(required = false) Long quotationId) {
        return followUpService.list(page, size, search, sort, status, priority, stage,
                dateFrom == null ? null : dateFrom.toString(),
                dateTo == null ? null : dateTo.toString(),
                quotationId);
    }

    @GetMapping("/history")
    public ResponseEntity<ApiResponse<List<FollowUpResponse>>> history(
            @RequestParam(required = false) Long leadId,
            @RequestParam(required = false) Long clientId) {
        return ResponseEntity.ok(ApiResponse.ok(followUpService.history(leadId, clientId)));
    }

    @PreAuthorize("hasAuthority('CRM_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<FollowUpResponse>> create(@Valid @RequestBody FollowUpRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(followUpService.create(request)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<FollowUpResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(followUpService.get(id)));
    }

    @PreAuthorize("hasAuthority('CRM_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<FollowUpResponse>> update(@PathVariable Long id,
                                                                @Valid @RequestBody FollowUpRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(followUpService.update(id, request)));
    }

    @PreAuthorize("hasAuthority('CRM_DELETE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        followUpService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Follow-up moved to trash"));
    }

    @PreAuthorize("hasAuthority('CRM_DELETE')")
    @DeleteMapping("/{id}/permanent")
    public ResponseEntity<ApiResponse<Void>> permanentDelete(@PathVariable Long id) {
        followUpService.permanentDelete(id);
        return ResponseEntity.ok(ApiResponse.ok("Follow-up permanently deleted"));
    }

    @PreAuthorize("hasAuthority('CRM_CREATE')")
    @PostMapping("/bulk-delete")
    public ResponseEntity<ApiResponse<Void>> bulkDelete(@Valid @RequestBody BulkRequest request) {
        int count = followUpService.bulkDelete(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Deleted " + count + " follow-up(s)"));
    }

    @PreAuthorize("hasAuthority('CRM_CREATE')")
    @PostMapping("/bulk-restore")
    public ResponseEntity<ApiResponse<Void>> bulkRestore(@Valid @RequestBody BulkRequest request) {
        int count = followUpService.bulkRestore(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Restored " + count + " follow-up(s)"));
    }

    @PreAuthorize("hasAuthority('CRM_CREATE')")
    @PostMapping("/bulk-permanent-delete")
    public ResponseEntity<ApiResponse<Void>> bulkPermanentDelete(@Valid @RequestBody BulkRequest request) {
        int count = followUpService.bulkPermanentDelete(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Permanently deleted " + count + " follow-up(s)"));
    }

    @PreAuthorize("hasAuthority('CRM_EDIT')")
    @PatchMapping("/archive/{id}")
    public ResponseEntity<ApiResponse<FollowUpResponse>> archive(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(followUpService.archive(id)));
    }

    @PreAuthorize("hasAuthority('CRM_EDIT')")
    @PatchMapping("/restore/{id}")
    public ResponseEntity<ApiResponse<FollowUpResponse>> restore(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(followUpService.restore(id)));
    }

    @PreAuthorize("hasAuthority('CRM_CREATE')")
    @PostMapping("/{id}/duplicate")
    public ResponseEntity<ApiResponse<FollowUpResponse>> duplicate(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(followUpService.duplicate(id)));
    }

    @GetMapping("/{id}/attachments")
    public ResponseEntity<List<FollowUpResponse.AttachmentResponse>> attachments(@PathVariable Long id) {
        return ResponseEntity.ok(followUpService.getAttachments(id));
    }

    @PreAuthorize("hasAuthority('CRM_CREATE')")
    @PostMapping("/{id}/attachments")
    public ResponseEntity<ApiResponse<FollowUpResponse.AttachmentResponse>> addAttachment(
            @PathVariable Long id, @RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(followUpService.addAttachment(id, file)));
    }
}
