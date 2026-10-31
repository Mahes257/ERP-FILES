package com.vishatech.erp.controller.production;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.production.CastingStatsDTO;
import com.vishatech.erp.dto.production.CreateProductionEntryRequest;
import com.vishatech.erp.dto.production.PagedResponse;
import com.vishatech.erp.dto.production.ProductionEntryDTO;
import com.vishatech.erp.service.production.CastingService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;

import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * REST controller for the Casting shop floor module.
 *
 * All Casting jobs are ProductionEntry records with productionType = "Casting".
 * The Casting workflow is:
 *   Shell Preparation → Melting → Pouring → Blasting → Fettling
 *
 * Status transitions (backend-controlled):
 *   Pending → In Progress (Start)
 *   In Progress → Hold (Hold)
 *   Hold → In Progress (Resume)
 *   In Progress/Hold → Completed (Complete)
 *   Pending/In Progress/Hold → Skipped (Skip)
 */
@RestController
@RequestMapping("/castings")
@PreAuthorize("hasAuthority('PRODUCTION_VIEW')")
public class CastingController {

    private final CastingService castingService;

    public CastingController(CastingService castingService) {
        this.castingService = castingService;
    }

    // =====================
    // CRUD ENDPOINTS
    // =====================

    /**
     * GET /api/castings
     * List all Casting jobs with optional search, filters, pagination, and sorting.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<PagedResponse<ProductionEntryDTO>>> getAllCastingJobs(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String stage,
            @RequestParam(required = false, defaultValue = "createdAt") String sortBy,
            @RequestParam(required = false, defaultValue = "desc") String sortDir,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "50") int size) {

        PagedResponse<ProductionEntryDTO> result = castingService.getAllCastingJobs(
            search, status, stage, sortBy, sortDir, page, size);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    /**
     * GET /api/castings/{id}
     * Get a specific Casting job by ID.
     */
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> getCastingJob(@PathVariable Long id) {
        ProductionEntryDTO job = castingService.getCastingJob(id);
        return ResponseEntity.ok(ApiResponse.ok(job));
    }

    /**
     * POST /api/castings
     * Create a new Casting job.
     */
    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> createCastingJob(
            @Valid @RequestBody CreateProductionEntryRequest request) {
        ProductionEntryDTO job = castingService.createCastingJob(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(
            ApiResponse.ok("Casting job created.", job));
    }

    /**
     * PUT /api/castings/{id}
     * Update an existing Casting job.
     */
    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> updateCastingJob(
            @PathVariable Long id,
            @Valid @RequestBody CreateProductionEntryRequest request) {
        ProductionEntryDTO job = castingService.updateCastingJob(id, request);
        return ResponseEntity.ok(ApiResponse.ok("Casting job updated.", job));
    }

    /**
     * DELETE /api/castings/{id}
     * Delete a Casting job.
     */
    @PreAuthorize("hasAuthority('PRODUCTION_DELETE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteCastingJob(@PathVariable Long id) {
        castingService.deleteCastingJob(id);
        return ResponseEntity.ok(ApiResponse.ok("Casting job deleted."));
    }

    // =====================
    // WORK ORDER ENDPOINTS
    // =====================

    /**
     * GET /api/castings/work-order/{workOrderId}
     * Get all Casting jobs for a specific Work Order.
     */
    @GetMapping("/work-order/{workOrderId}")
    public ResponseEntity<ApiResponse<List<ProductionEntryDTO>>> getCastingJobsForOrder(
            @PathVariable String workOrderId) {
        List<ProductionEntryDTO> jobs = castingService.getCastingJobsForOrder(workOrderId);
        return ResponseEntity.ok(ApiResponse.ok(jobs));
    }

    /**
     * DELETE /api/castings/work-order/{workOrderId}
     * Delete all Casting jobs for a Work Order.
     */
    @PreAuthorize("hasAuthority('PRODUCTION_DELETE')")
    @DeleteMapping("/work-order/{workOrderId}")
    public ResponseEntity<ApiResponse<Void>> deleteCastingJobsForOrder(
            @PathVariable String workOrderId) {
        castingService.deleteCastingJobsForOrder(workOrderId);
        return ResponseEntity.ok(ApiResponse.ok("All Casting jobs deleted for order.", null));
    }

    /**
     * GET /api/castings/work-order/{workOrderId}/current-stage
     * Get the current Casting stage for a Work Order.
     */
    @GetMapping("/work-order/{workOrderId}/current-stage")
    public ResponseEntity<ApiResponse<String>> getCurrentStage(@PathVariable String workOrderId) {
        String stage = castingService.getCurrentStage(workOrderId);
        return ResponseEntity.ok(new ApiResponse<>(true, "OK", stage));
    }

    // =====================
    // STATUS TRANSITIONS (backend-controlled)
    // =====================

    /**
     * POST /api/castings/{id}/start
     * Start a Casting job: Pending → In Progress.
     */
    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/start")
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> startJob(@PathVariable Long id) {
        ProductionEntryDTO job = castingService.startJob(id);
        return ResponseEntity.ok(ApiResponse.ok("Casting job started.", job));
    }

    /**
     * POST /api/castings/{id}/hold
     * Hold a Casting job: In Progress → Hold.
     */
    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/hold")
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> holdJob(@PathVariable Long id) {
        ProductionEntryDTO job = castingService.holdJob(id);
        return ResponseEntity.ok(ApiResponse.ok("Casting job put on hold.", job));
    }

    /**
     * POST /api/castings/{id}/resume
     * Resume a Casting job: Hold → In Progress.
     */
    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/resume")
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> resumeJob(@PathVariable Long id) {
        ProductionEntryDTO job = castingService.resumeJob(id);
        return ResponseEntity.ok(ApiResponse.ok("Casting job resumed.", job));
    }

    /**
     * POST /api/castings/{id}/complete
     * Complete a Casting job: In Progress/Hold → Completed.
     */
    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/complete")
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> completeJob(@PathVariable Long id) {
        ProductionEntryDTO job = castingService.completeJob(id);
        return ResponseEntity.ok(ApiResponse.ok("Casting job completed.", job));
    }

    /**
     * POST /api/castings/{id}/skip
     * Skip a Casting job: Pending/In Progress/Hold → Skipped.
     */
    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/skip")
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> skipJob(
            @PathVariable Long id,
            @RequestParam(required = false) String reason,
            @RequestParam(required = false) String remarks) {
        ProductionEntryDTO job = castingService.skipJob(id, reason, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Casting job skipped.", job));
    }

    // =====================
    // STATISTICS / KPI
    // =====================

    /**
     * GET /api/castings/stats
     * Get Casting shop floor KPI statistics from MySQL.
     */
    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<CastingStatsDTO>> getStats() {
        CastingStatsDTO stats = castingService.getStats();
        return ResponseEntity.ok(ApiResponse.ok(stats));
    }
}
