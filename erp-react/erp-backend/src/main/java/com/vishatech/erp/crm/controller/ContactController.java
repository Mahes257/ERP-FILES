package com.vishatech.erp.crm.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.BulkRequest;
import com.vishatech.erp.crm.dto.ContactRequest;
import com.vishatech.erp.crm.dto.ContactResponse;
import com.vishatech.erp.crm.dto.ContactStatusRequest;
import com.vishatech.erp.crm.service.ContactService;
import com.vishatech.erp.crm.entity.Contact;
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
import org.springframework.web.bind.annotation.RestController;

/**
 * CRM Contacts API.
 *
 * Endpoint shapes, authority names, envelope and status codes follow the other
 * CRM controllers (Lead/Customer): reads need CRM_VIEW, creates CRM_CREATE,
 * mutations CRM_EDIT, destructive operations CRM_DELETE. The list is paged and
 * filtered server-side — the UI never filters a downloaded array.
 */
@RestController
@RequestMapping("/contacts")
@PreAuthorize("hasAuthority('CRM_VIEW')")
public class ContactController {

    private final ContactService contactService;

    public ContactController(ContactService contactService) {
        this.contactService = contactService;
    }

    @GetMapping
    public Page<ContactResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String contactType,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long leadId,
            @RequestParam(required = false) Long clientId,
            @RequestParam(required = false) String association) {
        return contactService.list(page, size, search, sort, contactType, status, leadId, clientId, association);
    }

    /** KPI counts (Active / Inactive / Primary / Secondary / lead- and client-linked). */
    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats() {
        return ResponseEntity.ok(ApiResponse.ok(contactService.stats()));
    }

    /** The contacts captured for one lead — its primary and secondary person. */
    @GetMapping("/lead/{leadId}")
    public ResponseEntity<ApiResponse<List<ContactResponse>>> forLead(@PathVariable Long leadId) {
        return ResponseEntity.ok(ApiResponse.ok(contactService.forLead(leadId)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ContactResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(contactService.get(id)));
    }

    @PreAuthorize("hasAuthority('CRM_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<ContactResponse>> create(@Valid @RequestBody ContactRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(contactService.create(request)));
    }

    @PreAuthorize("hasAuthority('CRM_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<ContactResponse>> update(@PathVariable Long id,
                                                              @Valid @RequestBody ContactRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(contactService.update(id, request)));
    }

    @PreAuthorize("hasAuthority('CRM_EDIT')")
    @PatchMapping("/archive/{id}")
    public ResponseEntity<ApiResponse<ContactResponse>> archive(@PathVariable Long id) {
        contactService.archive(id);
        return ResponseEntity.ok(ApiResponse.ok(contactService.get(id)));
    }

    @PreAuthorize("hasAuthority('CRM_EDIT')")
    @PatchMapping("/restore/{id}")
    public ResponseEntity<ApiResponse<ContactResponse>> restore(@PathVariable Long id) {
        contactService.restore(id);
        return ResponseEntity.ok(ApiResponse.ok(contactService.get(id)));
    }

    @PreAuthorize("hasAuthority('CRM_EDIT')")
    @PatchMapping("/{id}/status")
    public ResponseEntity<ApiResponse<ContactResponse>> setStatus(@PathVariable Long id,
                                                                 @Valid @RequestBody ContactStatusRequest request) {
        contactService.setStatus(id, request.status());
        return ResponseEntity.ok(ApiResponse.ok(contactService.get(id)));
    }

    @PreAuthorize("hasAuthority('CRM_DELETE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        contactService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Contact moved to trash"));
    }

    @PreAuthorize("hasAuthority('CRM_DELETE')")
    @DeleteMapping("/{id}/permanent")
    public ResponseEntity<ApiResponse<Void>> permanentDelete(@PathVariable Long id) {
        contactService.permanentDelete(id);
        return ResponseEntity.ok(ApiResponse.ok("Contact permanently deleted"));
    }

    @PreAuthorize("hasAuthority('CRM_EDIT')")
    @PostMapping("/bulk-archive")
    public ResponseEntity<ApiResponse<Void>> bulkArchive(@Valid @RequestBody BulkRequest request) {
        int count = contactService.bulkStatus(request.ids(), Contact.STATUS_ARCHIVED).size();
        return ResponseEntity.ok(ApiResponse.ok("Archived " + count + " contact(s)"));
    }

    @PreAuthorize("hasAuthority('CRM_EDIT')")
    @PostMapping("/bulk-restore")
    public ResponseEntity<ApiResponse<Void>> bulkRestore(@Valid @RequestBody BulkRequest request) {
        int count = contactService.bulkStatus(request.ids(), Contact.STATUS_ACTIVE).size();
        return ResponseEntity.ok(ApiResponse.ok("Restored " + count + " contact(s)"));
    }

    /** Trash (soft delete) — same wording and behaviour as the other CRM lists. */
    @PreAuthorize("hasAuthority('CRM_DELETE')")
    @PostMapping("/bulk-delete")
    public ResponseEntity<ApiResponse<Void>> bulkDelete(@Valid @RequestBody BulkRequest request) {
        int count = contactService.bulkStatus(request.ids(), Contact.STATUS_DELETED).size();
        return ResponseEntity.ok(ApiResponse.ok("Moved " + count + " contact(s) to trash"));
    }

    @PreAuthorize("hasAuthority('CRM_DELETE')")
    @PostMapping("/bulk-permanent-delete")
    public ResponseEntity<ApiResponse<Void>> bulkPermanentDelete(@Valid @RequestBody BulkRequest request) {
        int count = contactService.bulkPermanentDelete(request.ids()).size();
        return ResponseEntity.ok(ApiResponse.ok("Permanently deleted " + count + " contact(s)"));
    }

    /**
     * Re-run the idempotent contact backfill (additive; creates only the missing
     * mirrors of leads that already carry contact details). Safe to call at any
     * time — nothing is deleted and a second run changes nothing.
     */
    @PreAuthorize("hasAuthority('CRM_EDIT')")
    @PostMapping("/backfill")
    public ResponseEntity<ApiResponse<Map<String, Object>>> backfill() {
        int changed = contactService.backfillFromLeads();
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "synced", changed,
                "total", contactService.stats().get("total"))));
    }
}
