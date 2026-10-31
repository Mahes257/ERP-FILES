package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.service.PurchaseOrderService;
import com.vishatech.erp.service.PurchaseSupportService;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Comparator;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/purchase/orders")
public class PurchaseOrderController {
    private final PurchaseOrderService service;
    private final PurchaseSupportService support;
    public PurchaseOrderController(PurchaseOrderService service, PurchaseSupportService support) {
        this.service = service; this.support = support;
    }
    @GetMapping
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public Page<Map<String,Object>> list(@RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="10") int size,
                                         @RequestParam(required=false) String search,
                                         @RequestParam(required=false) String status,
                                         @RequestParam(required=false) String sort) {
        List<Map<String,Object>> all=service.list().stream()
                .filter(order -> matches(order, search, status))
                .sorted(comparator(sort))
                .collect(Collectors.toList());
        int safe=Math.max(size,1), from=Math.min(Math.max(page,0)*safe,all.size()), to=Math.min(from+safe,all.size());
        return new PageImpl<>(all.subList(from,to), PageRequest.of(Math.max(page,0),safe), all.size());
    }
    @GetMapping("/stats") @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String,Object>>> stats(){return ResponseEntity.ok(ApiResponse.ok(service.stats()));}
    @GetMapping("/next-number") @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String,Object>>> nextNumber(){return ResponseEntity.ok(ApiResponse.ok(service.nextNumber()));}
    @GetMapping("/{id}") @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String,Object>>> get(@PathVariable Long id){return ResponseEntity.ok(ApiResponse.ok(service.getResponse(id)));}
    @PostMapping @PreAuthorize("hasAuthority('PURCHASE_CREATE')")
    public ResponseEntity<ApiResponse<Map<String,Object>>> create(@RequestBody Map<String,Object> r){return ResponseEntity.ok(ApiResponse.ok(service.create(r)));}
    @PutMapping("/{id}") @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String,Object>>> update(@PathVariable Long id,@RequestBody Map<String,Object> r){return ResponseEntity.ok(ApiResponse.ok(service.update(id,r)));}
    @DeleteMapping("/{id}") @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id){service.delete(id);return ResponseEntity.ok(ApiResponse.ok("Purchase order deleted"));}
    @PostMapping("/{id}/submit") @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String,Object>>> submit(@PathVariable Long id){return ResponseEntity.ok(ApiResponse.ok(service.submit(id)));}
    @PostMapping("/{id}/approve") @PreAuthorize("hasAuthority('PURCHASE_APPROVE')")
    public ResponseEntity<ApiResponse<Map<String,Object>>> approve(@PathVariable Long id,@RequestBody(required=false) Map<String,Object> r){return ResponseEntity.ok(ApiResponse.ok(service.approve(id,note(r))));}
    @PostMapping("/{id}/reject") @PreAuthorize("hasAuthority('PURCHASE_APPROVE')")
    public ResponseEntity<ApiResponse<Map<String,Object>>> reject(@PathVariable Long id,@RequestBody(required=false) Map<String,Object> r){return ResponseEntity.ok(ApiResponse.ok(service.reject(id,note(r))));}
    @PostMapping("/{id}/release") @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String,Object>>> release(@PathVariable Long id){return ResponseEntity.ok(ApiResponse.ok(service.release(id)));}
    @PostMapping("/{id}/acknowledge") @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String,Object>>> acknowledge(@PathVariable Long id,@RequestBody(required=false) Map<String,Object> r){return ResponseEntity.ok(ApiResponse.ok(service.acknowledge(id,r==null?null:String.valueOf(r.get("status")),note(r))));}
    @PostMapping("/{id}/reminder") @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String,Object>>> remind(@PathVariable Long id,@RequestBody(required=false) Map<String,Object> r){return ResponseEntity.ok(ApiResponse.ok(service.remind(id,note(r))));}
    @PatchMapping("/{id}/delivery-status") @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String,Object>>> delivery(@PathVariable Long id,@RequestBody Map<String,Object> r){return ResponseEntity.ok(ApiResponse.ok(service.delivery(id,String.valueOf(r.get("status")))));}
    @GetMapping("/{id}/timeline") @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<List<PurchaseSupportService.PurchaseActivityEntry>>> timeline(@PathVariable Long id){return ResponseEntity.ok(ApiResponse.ok(support.activity(PurchaseSupportService.DOC_PO,service.get(id).getId())));}
    private String note(Map<String,Object> r){return r==null?"":String.valueOf(r.getOrDefault("note",r.getOrDefault("remarks","")));}
    private boolean matches(Map<String,Object> order, String search, String status) {
        if (status != null && !status.isBlank() && !"All".equalsIgnoreCase(status)
                && !status.equalsIgnoreCase(String.valueOf(order.get("status")))) return false;
        if (search == null || search.isBlank()) return true;
        String query = search.toLowerCase(Locale.ROOT);
        return String.valueOf(order.getOrDefault("poNo","")).toLowerCase(Locale.ROOT).contains(query)
                || String.valueOf(order.getOrDefault("title","")).toLowerCase(Locale.ROOT).contains(query)
                || String.valueOf(order.getOrDefault("vendor","")).toLowerCase(Locale.ROOT).contains(query);
    }
    private Comparator<Map<String,Object>> comparator(String sort) {
        boolean descending = sort != null && sort.startsWith("-");
        String field = sort == null || sort.isBlank() ? "orderDate" : (descending ? sort.substring(1) : sort);
        Comparator<Map<String,Object>> comparator = Comparator.comparing(
                row -> String.valueOf(row.getOrDefault(field, "")), String.CASE_INSENSITIVE_ORDER);
        return descending ? comparator.reversed() : comparator;
    }
}
