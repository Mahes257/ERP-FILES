package com.vishatech.erp.controller.production;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.production.PackingListDTO;
import com.vishatech.erp.dto.production.PackingStatsDTO;
import com.vishatech.erp.dto.production.PagedResponse;
import com.vishatech.erp.service.production.PackingListService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;

@RestController
@RequestMapping("/packing")
@PreAuthorize("hasAuthority('PRODUCTION_VIEW')")
public class PackingListController {

    private final PackingListService service;

    public PackingListController(PackingListService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<PagedResponse<PackingListDTO>>> getAll(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(defaultValue = "createdAt") String sortBy,
            @RequestParam(defaultValue = "DESC") String sortDir) {
        PagedResponse<PackingListDTO> result = service.getAll(search, status, page, size, sortBy, sortDir);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<PackingListDTO>> getById(@PathVariable Long id) {
        PackingListDTO dto = service.getById(id);
        return ResponseEntity.ok(ApiResponse.ok(dto));
    }

    @GetMapping("/by-number/{packingListNumber}")
    public ResponseEntity<ApiResponse<PackingListDTO>> getByPackingListNumber(@PathVariable String packingListNumber) {
        PackingListDTO dto = service.getByPackingListNumber(packingListNumber);
        return ResponseEntity.ok(ApiResponse.ok(dto));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<PackingListDTO>> create(@RequestBody PackingListDTO request) {
        PackingListDTO dto = service.create(request);
        return ResponseEntity.ok(ApiResponse.ok(dto));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<PackingListDTO>> update(@PathVariable Long id, @RequestBody PackingListDTO request) {
        PackingListDTO dto = service.update(id, request);
        return ResponseEntity.ok(ApiResponse.ok(dto));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Packing list deleted"));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<PackingStatsDTO>> getStatistics() {
        PackingStatsDTO stats = service.getStatistics();
        return ResponseEntity.ok(ApiResponse.ok(stats));
    }
}
