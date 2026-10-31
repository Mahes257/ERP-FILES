package com.vishatech.erp.crm.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.BulkRequest;
import com.vishatech.erp.crm.dto.CustomerActivityEntry;
import com.vishatech.erp.crm.dto.CustomerDuplicateMatch;
import com.vishatech.erp.crm.dto.CustomerRequest;
import com.vishatech.erp.crm.dto.CustomerResponse;
import com.vishatech.erp.crm.dto.CustomerStatementResponse;
import com.vishatech.erp.crm.dto.CustomerStatusRequest;
import com.vishatech.erp.crm.dto.CustomerTimelineEntry;
import com.vishatech.erp.crm.service.CustomerService;
import com.vishatech.erp.crm.entity.Customer;
import jakarta.validation.Valid;
import java.util.List;
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
@RequestMapping("/customers")
@PreAuthorize("hasAuthority('CRM_VIEW')")
public class CustomerController {

    private final CustomerService customerService;

    public CustomerController(CustomerService customerService) {
        this.customerService = customerService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<CustomerResponse>>> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String status) {
        return ResponseEntity.ok(ApiResponse.ok(customerService.list(q, status)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<CustomerResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(customerService.get(id)));
    }

    /**
     * Check for duplicate clients by business name, GSTIN, or PAN.
     * Returns a list of matching fields so the frontend can display warnings.
     */
    @GetMapping("/check-duplicate")
    public ResponseEntity<ApiResponse<List<CustomerDuplicateMatch>>> checkDuplicate(
            @RequestParam(required = false) String businessName,
            @RequestParam(required = false) String gstin,
            @RequestParam(required = false) String pan,
            @RequestParam(required = false) Long excludeId) {
        return ResponseEntity.ok(ApiResponse.ok(
                customerService.checkDuplicate(businessName, gstin, pan, excludeId)));
    }

    @PreAuthorize("hasAuthority('CRM_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<CustomerResponse>> create(@Valid @RequestBody CustomerRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(customerService.create(request)));
    }

    @PreAuthorize("hasAuthority('CRM_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<CustomerResponse>> update(@PathVariable Long id,
                                                                @Valid @RequestBody CustomerRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(customerService.update(id, request)));
    }

    @PreAuthorize("hasAuthority('CRM_DELETE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        customerService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Customer moved to trash"));
    }

    @PreAuthorize("hasAuthority('CRM_DELETE')")
    @DeleteMapping("/{id}/permanent")
    public ResponseEntity<ApiResponse<Void>> permanentDelete(@PathVariable Long id) {
        customerService.permanentDelete(id);
        return ResponseEntity.ok(ApiResponse.ok("Customer permanently deleted"));
    }

    @PreAuthorize("hasAuthority('CRM_CREATE')")
    @PostMapping("/bulk-delete")
    public ResponseEntity<ApiResponse<Void>> bulkDelete(@Valid @RequestBody BulkRequest request) {
        int count = customerService.bulkDelete(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Deleted " + count + " customer(s)"));
    }

    @PreAuthorize("hasAuthority('CRM_CREATE')")
    @PostMapping("/bulk-restore")
    public ResponseEntity<ApiResponse<Void>> bulkRestore(@Valid @RequestBody BulkRequest request) {
        int count = customerService.bulkRestore(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Restored " + count + " customer(s)"));
    }

    @PreAuthorize("hasAuthority('CRM_CREATE')")
    @PostMapping("/bulk-permanent-delete")
    public ResponseEntity<ApiResponse<Void>> bulkPermanentDelete(@Valid @RequestBody BulkRequest request) {
        int count = customerService.bulkPermanentDelete(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Permanently deleted " + count + " customer(s)"));
    }

    @PreAuthorize("hasAuthority('CRM_EDIT')")
    @PatchMapping("/archive/{id}")
    public ResponseEntity<ApiResponse<CustomerResponse>> archive(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(customerService.archive(id)));
    }

    @PreAuthorize("hasAuthority('CRM_EDIT')")
    @PatchMapping("/restore/{id}")
    public ResponseEntity<ApiResponse<CustomerResponse>> restore(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(customerService.restore(id)));
    }

    @PreAuthorize("hasAuthority('CRM_EDIT')")
    @PatchMapping("/{id}/status")
    public ResponseEntity<ApiResponse<CustomerResponse>> setStatus(@PathVariable Long id,
                                                                  @Valid @RequestBody CustomerStatusRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(customerService.setStatus(id, request.status())));
    }

    @GetMapping("/{id}/timeline")
    public ResponseEntity<List<CustomerTimelineEntry>> timeline(@PathVariable Long id) {
        return ResponseEntity.ok(customerService.getTimeline(id));
    }

    @GetMapping("/{id}/activities")
    public ResponseEntity<List<CustomerActivityEntry>> activities(@PathVariable Long id) {
        return ResponseEntity.ok(customerService.getActivities(id));
    }

    @GetMapping("/{id}/statement")
    public ResponseEntity<CustomerStatementResponse> statement(@PathVariable Long id) {
        return ResponseEntity.ok(customerService.getStatement(id));
    }

    @PreAuthorize("hasAuthority('CRM_CREATE')")
    @PostMapping("/{id}/duplicate")
    public ResponseEntity<ApiResponse<CustomerResponse>> duplicate(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(customerService.duplicate(id)));
    }

    @GetMapping("/{id}/attachments")
    public ResponseEntity<List<CustomerResponse.CustomerAttachmentResponse>> attachments(@PathVariable Long id) {
        return ResponseEntity.ok(customerService.getAttachments(id));
    }

    @PreAuthorize("hasAuthority('CRM_CREATE')")
    @PostMapping("/{id}/attachments")
    public ResponseEntity<ApiResponse<CustomerResponse.CustomerAttachmentResponse>> addAttachment(
            @PathVariable Long id, @RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(customerService.addAttachment(id, file)));
    }
}
