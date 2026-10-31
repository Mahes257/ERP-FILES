package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.LocationDtos.CityRequest;
import com.vishatech.erp.dto.LocationDtos.CityResponse;
import com.vishatech.erp.dto.LocationDtos.CountryRequest;
import com.vishatech.erp.dto.LocationDtos.CountryResponse;
import com.vishatech.erp.dto.LocationDtos.DistrictRequest;
import com.vishatech.erp.dto.LocationDtos.DistrictResponse;
import com.vishatech.erp.dto.LocationDtos.LocationOption;
import com.vishatech.erp.dto.LocationDtos.StateRequest;
import com.vishatech.erp.dto.LocationDtos.StateResponse;
import com.vishatech.erp.dto.LocationDtos.StatusRequest;
import com.vishatech.erp.dto.LocationDtos.ValidationResult;
import com.vishatech.erp.service.LocationMasterService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Centralized Location Master API — ONE reusable API for every module.
 *
 * Reads (any authenticated user — normal users just select locations):
 *   GET /locations/countries
 *   GET /locations/countries/{id}/states
 *   GET /locations/states/{id}/districts
 *   GET /locations/districts/{id}/cities
 *   GET /locations/states/{id}/cities
 *   GET /locations/states/{id}/cities/search?q=&limit=
 *   GET /locations/countries/{id}/cities/search?q=&limit=
 *   GET /locations/admin/countries | /admin/countries/{id}/states
 *       | /admin/states/{id}/districts | /admin/districts/{id}/cities
 *   GET /locations/validate?countryId=&stateId=&districtId=&cityId=
 *
 * Mutations (ADMIN only — enforced here AND in the service):
 *   POST   /locations/countries                    PUT/DELETE /locations/countries/{id}
 *   POST   /locations/countries/{id}/states        PUT/DELETE /locations/states/{id}
 *   POST   /locations/states/{id}/districts        PUT/DELETE /locations/districts/{id}
 *   POST   /locations/districts/{id}/cities        PUT/DELETE /locations/cities/{id}
 *   PUT    /locations/{level}/{id}/status          (activate / deactivate)
 */
@RestController
@RequestMapping("/locations")
public class LocationController {

    private final LocationMasterService locationMasterService;

    public LocationController(LocationMasterService locationMasterService) {
        this.locationMasterService = locationMasterService;
    }

    // ========================= Cascading reads =========================

    @GetMapping("/countries")
    public ResponseEntity<ApiResponse<List<LocationOption>>> countries() {
        return ResponseEntity.ok(ApiResponse.ok(locationMasterService.countries()));
    }

    @GetMapping("/countries/{id}/states")
    public ResponseEntity<ApiResponse<List<LocationOption>>> states(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(locationMasterService.states(id)));
    }

    @GetMapping("/states/{id}/districts")
    public ResponseEntity<ApiResponse<List<LocationOption>>> districts(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(locationMasterService.districts(id)));
    }

    @GetMapping("/districts/{id}/cities")
    public ResponseEntity<ApiResponse<List<LocationOption>>> cities(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(locationMasterService.cities(id)));
    }

    /**
     * Every city/town of one STATE (all districts merged) — the complete master
     * the Country → State → City/Town dropdown loads for the selected state.
     */
    @GetMapping("/states/{id}/cities")
    public ResponseEntity<ApiResponse<List<LocationOption>>> citiesByState(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(locationMasterService.citiesByState(id)));
    }

    /** Server-side city search inside one state (type-ahead for large masters). */
    @GetMapping("/states/{id}/cities/search")
    public ResponseEntity<ApiResponse<List<LocationOption>>> searchCitiesByState(
            @PathVariable Long id,
            @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "50") int limit) {
        return ResponseEntity.ok(ApiResponse.ok(locationMasterService.searchCitiesByState(id, q, limit)));
    }

    @GetMapping("/countries/{id}/cities/search")
    public ResponseEntity<ApiResponse<List<LocationOption>>> searchCities(
            @PathVariable Long id,
            @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "50") int limit) {
        return ResponseEntity.ok(ApiResponse.ok(locationMasterService.searchCities(id, q, limit)));
    }

    /** Backend relationship validation for a full Country→State→District→City chain. */
    @GetMapping("/validate")
    public ResponseEntity<ApiResponse<ValidationResult>> validate(
            @RequestParam(required = false) Long countryId,
            @RequestParam(required = false) Long stateId,
            @RequestParam(required = false) Long districtId,
            @RequestParam(required = false) Long cityId) {
        return ResponseEntity.ok(ApiResponse.ok(
                locationMasterService.validate(countryId, stateId, districtId, cityId)));
    }

    // ========================= Admin list endpoints =========================

    @GetMapping("/admin/countries")
    public ResponseEntity<ApiResponse<List<CountryResponse>>> adminCountries() {
        return ResponseEntity.ok(ApiResponse.ok(locationMasterService.adminCountries()));
    }

    @GetMapping("/admin/countries/{id}/states")
    public ResponseEntity<ApiResponse<List<StateResponse>>> adminStates(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(locationMasterService.adminStates(id)));
    }

    @GetMapping("/admin/states/{id}/districts")
    public ResponseEntity<ApiResponse<List<DistrictResponse>>> adminDistricts(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(locationMasterService.adminDistricts(id)));
    }

    @GetMapping("/admin/districts/{id}/cities")
    public ResponseEntity<ApiResponse<List<CityResponse>>> adminCities(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(locationMasterService.adminCities(id)));
    }

    // ========================= Country mutations (ADMIN) =========================

    @PostMapping("/countries")
    public ResponseEntity<ApiResponse<CountryResponse>> createCountry(@Valid @RequestBody CountryRequest request) {
        requireAdmin();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(locationMasterService.createCountry(request)));
    }

    @PutMapping("/countries/{id}")
    public ResponseEntity<ApiResponse<CountryResponse>> updateCountry(
            @PathVariable Long id, @Valid @RequestBody CountryRequest request) {
        requireAdmin();
        return ResponseEntity.ok(ApiResponse.ok(locationMasterService.updateCountry(id, request)));
    }

    @PutMapping("/countries/{id}/status")
    public ResponseEntity<ApiResponse<CountryResponse>> setCountryStatus(
            @PathVariable Long id, @Valid @RequestBody StatusRequest request) {
        requireAdmin();
        return ResponseEntity.ok(ApiResponse.ok(locationMasterService.setCountryStatus(id, request.status())));
    }

    @DeleteMapping("/countries/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteCountry(@PathVariable Long id) {
        requireAdmin();
        locationMasterService.deleteCountry(id);
        return ResponseEntity.ok(ApiResponse.ok("Country deleted"));
    }

    // ========================= State mutations (ADMIN) =========================

    @PostMapping("/countries/{id}/states")
    public ResponseEntity<ApiResponse<StateResponse>> createState(
            @PathVariable Long id, @Valid @RequestBody StateRequest request) {
        requireAdmin();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(locationMasterService.createState(id, request)));
    }

    @PutMapping("/states/{id}")
    public ResponseEntity<ApiResponse<StateResponse>> updateState(
            @PathVariable Long id, @Valid @RequestBody StateRequest request) {
        requireAdmin();
        return ResponseEntity.ok(ApiResponse.ok(locationMasterService.updateState(id, request)));
    }

    @PutMapping("/states/{id}/status")
    public ResponseEntity<ApiResponse<StateResponse>> setStateStatus(
            @PathVariable Long id, @Valid @RequestBody StatusRequest request) {
        requireAdmin();
        return ResponseEntity.ok(ApiResponse.ok(locationMasterService.setStateStatus(id, request.status())));
    }

    @DeleteMapping("/states/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteState(@PathVariable Long id) {
        requireAdmin();
        locationMasterService.deleteState(id);
        return ResponseEntity.ok(ApiResponse.ok("State deleted"));
    }

    // ========================= District mutations (ADMIN) =========================

    @PostMapping("/states/{id}/districts")
    public ResponseEntity<ApiResponse<DistrictResponse>> createDistrict(
            @PathVariable Long id, @Valid @RequestBody DistrictRequest request) {
        requireAdmin();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(locationMasterService.createDistrict(id, request)));
    }

    @PutMapping("/districts/{id}")
    public ResponseEntity<ApiResponse<DistrictResponse>> updateDistrict(
            @PathVariable Long id, @Valid @RequestBody DistrictRequest request) {
        requireAdmin();
        return ResponseEntity.ok(ApiResponse.ok(locationMasterService.updateDistrict(id, request)));
    }

    @PutMapping("/districts/{id}/status")
    public ResponseEntity<ApiResponse<DistrictResponse>> setDistrictStatus(
            @PathVariable Long id, @Valid @RequestBody StatusRequest request) {
        requireAdmin();
        return ResponseEntity.ok(ApiResponse.ok(locationMasterService.setDistrictStatus(id, request.status())));
    }

    @DeleteMapping("/districts/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteDistrict(@PathVariable Long id) {
        requireAdmin();
        locationMasterService.deleteDistrict(id);
        return ResponseEntity.ok(ApiResponse.ok("District deleted"));
    }

    // ========================= City mutations (ADMIN) =========================

    @PostMapping("/districts/{id}/cities")
    public ResponseEntity<ApiResponse<CityResponse>> createCity(
            @PathVariable Long id, @Valid @RequestBody CityRequest request) {
        requireAdmin();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(locationMasterService.createCity(id, request)));
    }

    @PutMapping("/cities/{id}")
    public ResponseEntity<ApiResponse<CityResponse>> updateCity(
            @PathVariable Long id, @Valid @RequestBody CityRequest request) {
        requireAdmin();
        return ResponseEntity.ok(ApiResponse.ok(locationMasterService.updateCity(id, request)));
    }

    @PutMapping("/cities/{id}/status")
    public ResponseEntity<ApiResponse<CityResponse>> setCityStatus(
            @PathVariable Long id, @Valid @RequestBody StatusRequest request) {
        requireAdmin();
        return ResponseEntity.ok(ApiResponse.ok(locationMasterService.setCityStatus(id, request.status())));
    }

    @DeleteMapping("/cities/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteCity(@PathVariable Long id) {
        requireAdmin();
        locationMasterService.deleteCity(id);
        return ResponseEntity.ok(ApiResponse.ok("City deleted"));
    }

    // ========================= Helpers =========================

    /**
     * Mutations are restricted to the ADMIN role. Uses the SAME Spring
     * Security role model as the rest of the ERP (no second auth system).
     */
    private void requireAdmin() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        boolean admin = auth != null && auth.isAuthenticated()
                && auth.getAuthorities().stream()
                        .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority())
                                || "ADMIN".equals(a.getAuthority()));
        if (!admin) {
            throw new AccessDeniedException("Only an ADMIN can modify the Location Master");
        }
    }
}
