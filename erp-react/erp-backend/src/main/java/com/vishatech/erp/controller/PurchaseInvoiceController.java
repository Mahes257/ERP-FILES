package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.service.PurchaseInvoiceService;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/purchase/invoices")
public class PurchaseInvoiceController {
    private final PurchaseInvoiceService service;
    public PurchaseInvoiceController(PurchaseInvoiceService service) { this.service = service; }

    @GetMapping
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Page<Map<String, Object>>>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String sort) {
        return ResponseEntity.ok(ApiResponse.ok(service.list(page, size, search, status, sort)));
    }

    @GetMapping("/next-number")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> nextNumber() {
        return ResponseEntity.ok(ApiResponse.ok(service.nextNumber()));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.get(id)));
    }

    @PostMapping
    @PreAuthorize("hasAuthority('PURCHASE_CREATE')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> create(@RequestBody Map<String, Object> body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(service.create(body)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> update(@PathVariable Long id,
                                                                     @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(ApiResponse.ok(service.update(id, body)));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Purchase invoice deleted"));
    }

    @PostMapping("/{id}/submit")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> submit(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.submit(id)));
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('PURCHASE_APPROVE')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> approve(@PathVariable Long id,
                                                                      @RequestBody(required = false) Map<String, Object> body) {
        return ResponseEntity.ok(ApiResponse.ok(service.approve(id, body == null ? "" : String.valueOf(body.getOrDefault("comments", "")))));
    }

    @PostMapping("/{id}/pay")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> pay(@PathVariable Long id,
                                                                  @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(ApiResponse.ok(service.recordPayment(id, body)));
    }

    @PostMapping("/{id}/advice")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> generateAdvice(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.generateAdvice(id)));
    }

    @PostMapping("/{id}/advice/send")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> sendAdvice(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.sendAdvice(id)));
    }

    @PostMapping("/{id}/payments/{paymentNo}/reverse")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> reversePayment(@PathVariable Long id,
                                                                            @PathVariable String paymentNo,
                                                                            @RequestBody(required = false) Map<String, Object> body) {
        String reason = body == null ? "" : String.valueOf(body.getOrDefault("reason", ""));
        return ResponseEntity.ok(ApiResponse.ok(service.reversePayment(id, paymentNo, reason)));
    }

    @GetMapping("/payment-ledger")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> paymentLedger(
            @RequestParam(required = false) String search) {
        return ResponseEntity.ok(ApiResponse.ok(service.paymentLedger(search)));
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('PURCHASE_APPROVE')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> reject(@PathVariable Long id,
                                                                     @RequestBody(required = false) Map<String, Object> body) {
        return ResponseEntity.ok(ApiResponse.ok(service.reject(id, body == null ? "" : String.valueOf(body.getOrDefault("comments", "")))));
    }

    @GetMapping("/{id}/match")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> match(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.match(id)));
    }

    @GetMapping("/{id}/timeline")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<List<?>>> timeline(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.activity(id)));
    }

    @PostMapping("/{id}/match")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> rematch(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.match(id)));
    }

    @GetMapping("/stats")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats() {
        return ResponseEntity.ok(ApiResponse.ok(service.stats()));
    }
}
