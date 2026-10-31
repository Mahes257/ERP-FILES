package com.vishatech.erp.controller.production;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.production.PagedResponse;
import com.vishatech.erp.dto.production.ProductionEntryDTO;
import com.vishatech.erp.dto.production.CreateProductionEntryRequest;
import com.vishatech.erp.service.production.ProductionEntryService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;

import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * REST controller for the Machine Shop module.
 *
 * Machine Shop jobs are ProductionEntry records with productionType = "Machine Shop".
 * This is a flexible shop floor module with no fixed workflow sequence.
 *
 * Status transitions:
 *   Pending → In Progress (Start)
 *   In Progress → Hold (Hold)
 *   Hold → In Progress (Resume)
 *   In Progress → Completed (Complete)
 */
@RestController
@RequestMapping("/machine-shop")
@PreAuthorize("hasAuthority('PRODUCTION_VIEW')")
public class MachineShopController {

    private final ProductionEntryService entryService;

    public MachineShopController(ProductionEntryService entryService) {
        this.entryService = entryService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<PagedResponse<ProductionEntryDTO>>> getAllMachineShopJobs(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String stage,
            @RequestParam(required = false, defaultValue = "createdAt") String sortBy,
            @RequestParam(required = false, defaultValue = "desc") String sortDir,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "50") int size) {

        List<ProductionEntryDTO> allJobs = entryService.getEntriesByProductionType("Machine Shop");
        PagedResponse<ProductionEntryDTO> result = entryService.paginateAndFilter(
            allJobs, search, status, stage, sortBy, sortDir, page, size);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> getMachineShopJob(@PathVariable Long id) {
        ProductionEntryDTO job = entryService.getEntryById(id);
        return ResponseEntity.ok(ApiResponse.ok(job));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> createMachineShopJob(
            @RequestBody CreateProductionEntryRequest request) {
        request.setProductionType("Machine Shop");
        ProductionEntryDTO job = entryService.saveEntry(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(
            ApiResponse.ok("Machine Shop job created.", job));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> updateMachineShopJob(
            @PathVariable Long id,
            @RequestBody CreateProductionEntryRequest request) {
        ProductionEntryDTO job = entryService.updateEntry(id, request);
        return ResponseEntity.ok(ApiResponse.ok("Machine Shop job updated.", job));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_DELETE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteMachineShopJob(@PathVariable Long id) {
        entryService.deleteEntry(id);
        return ResponseEntity.ok(ApiResponse.ok("Machine Shop job deleted."));
    }

    @GetMapping("/work-order/{workOrderId}")
    public ResponseEntity<ApiResponse<List<ProductionEntryDTO>>> getMachineShopJobsForOrder(
            @PathVariable String workOrderId) {
        List<ProductionEntryDTO> jobs = entryService.getEntriesByWorkOrderAndType(workOrderId, "Machine Shop");
        return ResponseEntity.ok(ApiResponse.ok(jobs));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/start")
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> startJob(@PathVariable Long id) {
        ProductionEntryDTO job = entryService.startJob(id);
        return ResponseEntity.ok(ApiResponse.ok("Machine Shop job started.", job));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/hold")
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> holdJob(@PathVariable Long id) {
        ProductionEntryDTO job = entryService.holdJob(id);
        return ResponseEntity.ok(ApiResponse.ok("Machine Shop job put on hold.", job));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/resume")
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> resumeJob(@PathVariable Long id) {
        ProductionEntryDTO job = entryService.resumeJob(id);
        return ResponseEntity.ok(ApiResponse.ok("Machine Shop job resumed.", job));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/complete")
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> completeJob(@PathVariable Long id) {
        ProductionEntryDTO job = entryService.completeJob(id);
        return ResponseEntity.ok(ApiResponse.ok("Machine Shop job completed.", job));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<com.vishatech.erp.dto.production.CastingStatsDTO>> getStats() {
        var stats = entryService.getStatsByProductionType("Machine Shop");
        return ResponseEntity.ok(ApiResponse.ok(stats));
    }
}
