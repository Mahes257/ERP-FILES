package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.MapLocationResponse;
import com.vishatech.erp.dto.MarketingLocationRequest;
import com.vishatech.erp.service.MarketingMapService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
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
import org.springframework.web.multipart.MultipartFile;

/**
 * REST API for the Marketing Map.
 *
 * <p>Provides aggregated location data from all marketing entities
 * (customers, Q Forms, travel plan stops, marketer positions, and
 * user-created marketing locations).
 *
 * <p>Endpoints:
 *   GET    /marketing/map/locations
 *   POST   /marketing/map/locations
 *   PUT    /marketing/map/locations/:id
 *   DELETE /marketing/map/locations/:id
 *   GET    /marketing/map/locations/:id
 *
 * Controller stays thin: lookup failures throw
 * {@code ResourceNotFoundException} in {@link MarketingMapService} and surface
 * through the shared {@code GlobalExceptionHandler}, matching Purchase and
 * Production.
 */
@RestController
@RequestMapping("/marketing/map")
@PreAuthorize("hasAuthority('MARKETING_VIEW')")
public class MarketingMapController {

    private final MarketingMapService mapService;

    public MarketingMapController(MarketingMapService mapService) {
        this.mapService = mapService;
    }

    /** Returns all map-ready locations from the database. */
    @GetMapping("/locations")
    public ResponseEntity<ApiResponse<List<MapLocationResponse>>> getLocations(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String search) {
        return ResponseEntity.ok(ApiResponse.ok(mapService.getAllLocations(type, search)));
    }

    /** Returns a single marketing location by ID. */
    @GetMapping("/locations/{id}")
    public ResponseEntity<ApiResponse<MapLocationResponse>> getLocation(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(mapService.getMarketingLocation(id)));
    }

    /** Creates a new marketing location. */
    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    @PostMapping("/locations")
    public ResponseEntity<ApiResponse<MapLocationResponse>> createLocation(
            @Valid @RequestBody MarketingLocationRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(mapService.createMarketingLocation(request)));
    }

    /** Updates an existing marketing location. */
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    @PutMapping("/locations/{id}")
    public ResponseEntity<ApiResponse<MapLocationResponse>> updateLocation(
            @PathVariable Long id,
            @Valid @RequestBody MarketingLocationRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(mapService.updateMarketingLocation(id, request)));
    }

    /** Soft-deletes (archives) a marketing location. */
    @PreAuthorize("hasAuthority('MARKETING_DELETE')")
    @DeleteMapping("/locations/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteLocation(@PathVariable Long id) {
        mapService.deleteMarketingLocation(id);
        return ResponseEntity.ok(ApiResponse.ok("Location archived"));
    }

    /** Link a marketing location to an ERP Customer. */
    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    @PutMapping("/locations/{id}/link-customer")
    public ResponseEntity<ApiResponse<MapLocationResponse>> linkCustomer(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(ApiResponse.ok(mapService.linkCustomer(id, body)));
    }

    /**
     * Get visit summary for any map entity (customer, qform, travel_stop, marketing_location).
     * Passes type so the service knows which repository to query.
     */
    @GetMapping("/locations/{id}/summary")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getLocationSummary(
            @PathVariable Long id,
            @RequestParam(defaultValue = "marketing_location") String type) {
        return ResponseEntity.ok(ApiResponse.ok(mapService.getLocationSummary(id, type)));
    }

    /** Get photo attachments for a specific map entity. */
    @GetMapping("/locations/{id}/photos")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getEntityPhotos(
            @PathVariable Long id,
            @RequestParam(defaultValue = "marketing_location") String type) {
        return ResponseEntity.ok(ApiResponse.ok(mapService.getEntityPhotos(id, type)));
    }

    /**
     * Upload a photo attachment for any map entity.
     * type param determines which moduleType is stored in sales_attachments.
     */
    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    @PostMapping("/locations/{id}/photos")
    public ResponseEntity<ApiResponse<Map<String, Object>>> uploadLocationPhoto(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file,
            @RequestParam(defaultValue = "marketing_location") String type) {
        return ResponseEntity.ok(ApiResponse.ok(mapService.uploadLocationPhoto(id, file, type)));
    }

    /** Delete a photo attachment for any map entity type. */
    @PreAuthorize("hasAuthority('MARKETING_DELETE')")
    @DeleteMapping("/locations/{id}/photos/{attachmentId}")
    public ResponseEntity<ApiResponse<Void>> deleteLocationPhoto(
            @PathVariable Long id,
            @PathVariable Long attachmentId,
            @RequestParam(defaultValue = "marketing_location") String type) {
        mapService.deleteLocationPhoto(id, attachmentId, type);
        return ResponseEntity.ok(ApiResponse.ok("Photo deleted"));
    }

    /** Get updates/activity history for a specific map entity. */
    @GetMapping("/locations/{id}/updates")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getEntityUpdates(
            @PathVariable Long id,
            @RequestParam(defaultValue = "marketing_location") String type) {
        return ResponseEntity.ok(ApiResponse.ok(mapService.getEntityUpdates(id, type)));
    }

    /** Get about/full info for a specific map entity. */
    @GetMapping("/locations/{id}/about")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getEntityAbout(
            @PathVariable Long id,
            @RequestParam(defaultValue = "marketing_location") String type) {
        return ResponseEntity.ok(ApiResponse.ok(mapService.getEntityAbout(id, type)));
    }
}
