package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.service.PurchaseVendorService;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/purchase/vendors")
public class PurchaseVendorController {

    private final PurchaseVendorService service;

    public PurchaseVendorController(PurchaseVendorService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public Page<Map<String, Object>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String sort) {
        return service.list(page, size, search, status, category, state, sort);
    }

    @GetMapping("/stats")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats() {
        return ResponseEntity.ok(ApiResponse.ok(service.stats()));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> get(@PathVariable String id) {
        return ResponseEntity.ok(ApiResponse.ok(service.get(id)));
    }

    @PostMapping
    @PreAuthorize("hasAuthority('PURCHASE_CREATE')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> create(@RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(ApiResponse.ok(service.create(body)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> update(
            @PathVariable String id, @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(ApiResponse.ok(service.update(id, body)));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Vendor deleted"));
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> status(
            @PathVariable String id, @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(ApiResponse.ok(service.setStatus(id, String.valueOf(body.get("status")))));
    }

    @PostMapping("/{id}/duplicate")
    @PreAuthorize("hasAuthority('PURCHASE_CREATE')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> duplicate(@PathVariable String id) {
        return ResponseEntity.ok(ApiResponse.ok(service.duplicate(id)));
    }

    @PatchMapping("/{id}/archive")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> archive(@PathVariable String id) {
        return ResponseEntity.ok(ApiResponse.ok(service.archive(id)));
    }

    @PatchMapping("/{id}/restore")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> restore(@PathVariable String id) {
        return ResponseEntity.ok(ApiResponse.ok(service.restore(id)));
    }

    @GetMapping("/{id}/activity")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> activity(@PathVariable String id) {
        return ResponseEntity.ok(ApiResponse.ok(service.activity(id)));
    }

    @PostMapping("/{id}/comments")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> comment(
            @PathVariable String id, @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(ApiResponse.ok(service.activity(id)));
    }

    @GetMapping("/performance")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> performance() {
        return ResponseEntity.ok(ApiResponse.ok(service.performance()));
    }
}
