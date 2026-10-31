package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.service.PurchaseWorkQueueService;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Purchase Work Queue endpoints — actionable pending-work counts and
 * records for every procurement category. Every count is derived from
 * real database records; nothing is hardcoded.
 *
 * Access is restricted to users holding PURCHASE_VIEW (admins and
 * managers per RolePermissions; plain USER roles without the permission
 * receive 403 and never see restricted work-queue items).
 */
@RestController
@RequestMapping("/api/purchase/work-queue")
public class PurchaseWorkQueueController {

    private final PurchaseWorkQueueService service;

    public PurchaseWorkQueueController(PurchaseWorkQueueService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> workQueue() {
        return ResponseEntity.ok(ApiResponse.ok(service.workQueue()));
    }

    @GetMapping("/{category}")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> category(@PathVariable String category) {
        return ResponseEntity.ok(ApiResponse.ok(service.categoryByKey(category)));
    }

    @GetMapping("/counts")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> counts() {
        Map<String, Object> counts = new java.util.LinkedHashMap<>();
        for (String key : java.util.List.of(
                "pr-approvals", "rfq-actions", "po-approvals", "po-releases",
                "supplier-acknowledgements", "pending-grns", "pending-inspections",
                "invoice-matching", "invoice-approvals", "payments-due")) {
            counts.put(key, service.countFor(key));
        }
        return ResponseEntity.ok(ApiResponse.ok(counts));
    }
}
