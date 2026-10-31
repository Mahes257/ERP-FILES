package com.vishatech.erp.controller.production;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.production.PagedResponse;
import com.vishatech.erp.dto.production.ProductionEntryDTO;
import com.vishatech.erp.service.production.ProductionEntryService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;

import java.util.List;
import java.util.stream.Collectors;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * REST controller for the Fabrication shop floor module.
 *
 * Fabrication jobs are ProductionEntry records with productionType = "Fabrication".
 * The Fabrication workflow is:
 *   Raw Material → Cutting → Bending → Welding → Hard Facing
 *
 * Status transitions (backend-controlled):
 *   Pending → In Progress (Start)
 *   In Progress → Hold (Hold)
 *   Hold → In Progress (Resume)
 *   In Progress/Hold → Completed (Complete)
 */
@RestController
@RequestMapping("/fabrications")
@PreAuthorize("hasAuthority('PRODUCTION_VIEW')")
public class FabricationController {

    private final ProductionEntryService entryService;

    public FabricationController(ProductionEntryService entryService) {
        this.entryService = entryService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<PagedResponse<ProductionEntryDTO>>> getAllFabricationJobs(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String stage,
            @RequestParam(required = false, defaultValue = "createdAt") String sortBy,
            @RequestParam(required = false, defaultValue = "desc") String sortDir,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "50") int size) {

        List<ProductionEntryDTO> allJobs = entryService.getEntriesByProductionType("Fabrication");
        PagedResponse<ProductionEntryDTO> result = entryService.paginateAndFilter(
            allJobs, search, status, stage, sortBy, sortDir, page, size);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> getFabricationJob(@PathVariable Long id) {
        ProductionEntryDTO job = entryService.getEntryById(id);
        return ResponseEntity.ok(ApiResponse.ok(job));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> createFabricationJob(
            @RequestBody com.vishatech.erp.dto.production.CreateProductionEntryRequest request) {
        request.setProductionType("Fabrication");
        ProductionEntryDTO job = entryService.saveEntry(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(
            ApiResponse.ok("Fabrication job created.", job));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> updateFabricationJob(
            @PathVariable Long id,
            @RequestBody com.vishatech.erp.dto.production.CreateProductionEntryRequest request) {
        ProductionEntryDTO job = entryService.updateEntry(id, request);
        return ResponseEntity.ok(ApiResponse.ok("Fabrication job updated.", job));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_DELETE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteFabricationJob(@PathVariable Long id) {
        entryService.deleteEntry(id);
        return ResponseEntity.ok(ApiResponse.ok("Fabrication job deleted."));
    }

    @GetMapping("/work-order/{workOrderId}")
    public ResponseEntity<ApiResponse<List<ProductionEntryDTO>>> getFabricationJobsForOrder(
            @PathVariable String workOrderId) {
        List<ProductionEntryDTO> jobs = entryService.getEntriesByWorkOrderAndType(workOrderId, "Fabrication");
        return ResponseEntity.ok(ApiResponse.ok(jobs));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/start")
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> startJob(@PathVariable Long id) {
        ProductionEntryDTO job = entryService.startJob(id);
        return ResponseEntity.ok(ApiResponse.ok("Fabrication job started.", job));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/hold")
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> holdJob(@PathVariable Long id) {
        ProductionEntryDTO job = entryService.holdJob(id);
        return ResponseEntity.ok(ApiResponse.ok("Fabrication job put on hold.", job));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/resume")
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> resumeJob(@PathVariable Long id) {
        ProductionEntryDTO job = entryService.resumeJob(id);
        return ResponseEntity.ok(ApiResponse.ok("Fabrication job resumed.", job));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/complete")
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> completeJob(@PathVariable Long id) {
        ProductionEntryDTO job = entryService.completeJob(id);
        return ResponseEntity.ok(ApiResponse.ok("Fabrication job completed.", job));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<com.vishatech.erp.dto.production.CastingStatsDTO>> getStats() {
        var stats = entryService.getStatsByProductionType("Fabrication");
        return ResponseEntity.ok(ApiResponse.ok(stats));
    }
}
