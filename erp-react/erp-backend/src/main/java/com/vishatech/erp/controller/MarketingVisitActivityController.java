package com.vishatech.erp.controller;

import com.vishatech.erp.dto.MarketingVisitActivityResponse;
import com.vishatech.erp.entity.MarketingVisit;
import com.vishatech.erp.entity.MarketingVisitActivity;
import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.service.MarketingVisitActivityService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * REST API for managing follow-ups and visit extensions.
 *
 * GET    /marketing/activities                     — list ALL follow-ups & extensions (optionally filtered by ?visitId=...)
 * GET    /marketing/activities/{id}                — get single activity
 * POST   /marketing/activities                     — create follow-up or extension
 * PUT    /marketing/activities/{id}                — update existing (never duplicate)
 * DELETE /marketing/activities/{id}                — delete activity
 * GET    /marketing/activities/visit/{visitId}     — get original visit details
 *
 * Controller stays thin: validation, transaction boundaries, audit stamping and
 * "record not found" handling all live in {@link MarketingVisitActivityService}
 * and surface through the shared {@code GlobalExceptionHandler} — the same
 * pattern used by the Purchase and Production modules.
 */
@RestController
@RequestMapping("/marketing/activities")
@PreAuthorize("hasAuthority('MARKETING_VIEW')")
public class MarketingVisitActivityController {

    private final MarketingVisitActivityService service;

    public MarketingVisitActivityController(MarketingVisitActivityService service) {
        this.service = service;
    }

    /**
     * List follow-ups and extensions. Without ?visitId this returns the
     * complete dataset (newest first); with ?visitId it returns only that
     * visit's activities. Rows carry the linked visit reference fields.
     */
    @GetMapping
    public ResponseEntity<List<MarketingVisitActivityResponse>> list(
            @RequestParam(required = false) Long visitId) {
        return ResponseEntity.ok(service.listActivities(visitId));
    }

    /** Get a single activity by ID (404 through the global handler when absent). */
    @GetMapping("/{id}")
    public ResponseEntity<MarketingVisitActivityResponse> get(@PathVariable Long id) {
        return ResponseEntity.ok(service.get(id));
    }

    /** Create a new follow-up or visit extension. */
    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    @PostMapping
    public ResponseEntity<MarketingVisitActivityResponse> create(
            @RequestBody MarketingVisitActivity activity) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(activity));
    }

    /** Update an existing activity — NEVER creates a duplicate. */
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<MarketingVisitActivityResponse> update(
            @PathVariable Long id,
            @RequestBody MarketingVisitActivity updates) {
        return ResponseEntity.ok(service.update(id, updates));
    }

    /** Delete an activity. Unknown id → 404 (via the global handler). */
    @PreAuthorize("hasAuthority('MARKETING_DELETE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Activity deleted"));
    }

    /** Get the original visit details (read-only reference). */
    @GetMapping("/visit/{visitId}")
    public ResponseEntity<MarketingVisit> getOriginalVisit(@PathVariable Long visitId) {
        return ResponseEntity.ok(service.getOriginalVisit(visitId));
    }
}
