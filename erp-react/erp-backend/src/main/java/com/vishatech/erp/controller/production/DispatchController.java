package com.vishatech.erp.controller.production;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.production.DispatchDTO;
import com.vishatech.erp.dto.production.DispatchStatsDTO;
import com.vishatech.erp.dto.production.PagedResponse;
import com.vishatech.erp.service.production.DispatchService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;

@RestController
@RequestMapping("/dispatch")
@PreAuthorize("hasAuthority('PRODUCTION_VIEW')")
public class DispatchController {

    private final DispatchService service;

    public DispatchController(DispatchService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<PagedResponse<DispatchDTO>>> getAll(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(defaultValue = "createdAt") String sortBy,
            @RequestParam(defaultValue = "DESC") String sortDir) {
        PagedResponse<DispatchDTO> result = service.getAll(search, status, page, size, sortBy, sortDir);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<DispatchDTO>> getById(@PathVariable Long id) {
        DispatchDTO dto = service.getById(id);
        return ResponseEntity.ok(ApiResponse.ok(dto));
    }

    @GetMapping("/by-number/{dispatchNumber}")
    public ResponseEntity<ApiResponse<DispatchDTO>> getByDispatchNumber(@PathVariable String dispatchNumber) {
        DispatchDTO dto = service.getByDispatchNumber(dispatchNumber);
        return ResponseEntity.ok(ApiResponse.ok(dto));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<DispatchDTO>> create(@RequestBody DispatchDTO request) {
        DispatchDTO dto = service.create(request);
        return ResponseEntity.ok(ApiResponse.ok(dto));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<DispatchDTO>> update(@PathVariable Long id, @RequestBody DispatchDTO request) {
        DispatchDTO dto = service.update(id, request);
        return ResponseEntity.ok(ApiResponse.ok(dto));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Dispatch record deleted"));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<DispatchStatsDTO>> getStatistics() {
        DispatchStatsDTO stats = service.getStatistics();
        return ResponseEntity.ok(ApiResponse.ok(stats));
    }
}
