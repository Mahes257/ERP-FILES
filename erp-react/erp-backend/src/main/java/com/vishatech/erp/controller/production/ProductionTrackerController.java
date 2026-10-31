package com.vishatech.erp.controller.production;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.entity.production.ProductionTracker;
import com.vishatech.erp.service.production.ProductionTrackerService;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;

@RestController
@RequestMapping("/production-trackers")
@PreAuthorize("hasAuthority('PRODUCTION_VIEW')")
public class ProductionTrackerController {

    private final ProductionTrackerService service;

    public ProductionTrackerController(ProductionTrackerService service) {
        this.service = service;
    }

    // ============================== CRUD ==============================

    @GetMapping
    public Page<ProductionTracker> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String stageActive,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String sort) {
        return service.list(page, size, search, status, stageActive, dateFrom, dateTo, sort);
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats() {
        return ResponseEntity.ok(ApiResponse.ok(service.stats()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ProductionTracker>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.get(id)));
    }

    @GetMapping("/by-cpo/{cpoNo}")
    public ResponseEntity<ApiResponse<ProductionTracker>> getByCpoNo(@PathVariable String cpoNo) {
        return ResponseEntity.ok(ApiResponse.ok(service.getByCpoNo(cpoNo)));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<ProductionTracker>> create(@RequestBody ProductionTracker input) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(service.create(input)));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<ProductionTracker>> update(
            @PathVariable Long id, @RequestBody ProductionTracker input) {
        return ResponseEntity.ok(ApiResponse.ok(service.update(id, input)));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_DELETE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Production tracker deleted"));
    }
}
