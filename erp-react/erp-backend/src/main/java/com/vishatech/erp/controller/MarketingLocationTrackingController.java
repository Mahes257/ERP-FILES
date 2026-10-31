package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.LocationTrackingRequest;
import com.vishatech.erp.dto.LocationTrackingResponse;
import com.vishatech.erp.service.MarketingLocationTrackingService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;

@RestController
@RequestMapping("/marketing/location-tracking")
@PreAuthorize("hasAuthority('MARKETING_VIEW')")
public class MarketingLocationTrackingController {

    private final MarketingLocationTrackingService trackingService;

    public MarketingLocationTrackingController(MarketingLocationTrackingService trackingService) {
        this.trackingService = trackingService;
    }

    /** Submit a GPS location update for an active trip. */
    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<LocationTrackingResponse>> submitLocation(
            @Valid @RequestBody LocationTrackingRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(trackingService.submitLocation(request)));
    }

    /** Get latest location for each active trip (for the Marketing Map). */
    @GetMapping("/active")
    public ResponseEntity<ApiResponse<List<LocationTrackingResponse>>> getActiveLocations() {
        return ResponseEntity.ok(ApiResponse.ok(trackingService.getActiveLocations()));
    }

    /** Get latest location for a specific travel plan. */
    @GetMapping("/plan/{planId}/latest")
    public ResponseEntity<ApiResponse<LocationTrackingResponse>> getLatestLocation(@PathVariable Long planId) {
        LocationTrackingResponse loc = trackingService.getLatestLocation(planId);
        return ResponseEntity.ok(ApiResponse.ok(loc));
    }

    /** Get location history for a travel plan (route trail). */
    @GetMapping("/plan/{planId}/history")
    public ResponseEntity<ApiResponse<List<LocationTrackingResponse>>> getLocationHistory(@PathVariable Long planId) {
        return ResponseEntity.ok(ApiResponse.ok(trackingService.getLocationHistory(planId)));
    }
}
