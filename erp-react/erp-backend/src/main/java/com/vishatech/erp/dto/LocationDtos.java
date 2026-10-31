package com.vishatech.erp.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * DTOs for the centralized Location Master (Country / State / District / City).
 * Kept in one file because every record is a tiny projection.
 */
public final class LocationDtos {

    private LocationDtos() {
    }

    // ===== Requests =====

    public record CountryRequest(
            @NotBlank(message = "Country name is required")
            @Size(max = 120, message = "Country name must be 120 characters or less")
            String name,
            String code,
            String isoCode,
            String status) {
    }

    public record StateRequest(
            @NotBlank(message = "State name is required")
            @Size(max = 120, message = "State name must be 120 characters or less")
            String name,
            String code,
            String status) {
    }

    public record DistrictRequest(
            @NotBlank(message = "District name is required")
            @Size(max = 120, message = "District name must be 120 characters or less")
            String name,
            String code,
            String aliases,
            String status) {
    }

    public record CityRequest(
            @NotBlank(message = "City name is required")
            @Size(max = 120, message = "City name must be 120 characters or less")
            String name,
            String code,
            String status) {
    }

    /** Simple activate / deactivate toggle body. */
    public record StatusRequest(@NotBlank(message = "status is required") String status) {
    }

    // ===== Responses =====

    /** Slim option row used by the cascading dropdowns. */
    public record LocationOption(Long id, String name, String status) {
    }

    public record CountryResponse(Long id, String name, String code, String isoCode,
                                  String status, String createdBy, String createdAt,
                                  String updatedBy, String updatedAt) {
    }

    public record StateResponse(Long id, Long countryId, String countryName,
                                String name, String code, String status,
                                String createdBy, String createdAt,
                                String updatedBy, String updatedAt) {
    }

    public record DistrictResponse(Long id, Long stateId, String stateName,
                                   String name, String code, String aliases, String status,
                                   String createdBy, String createdAt,
                                   String updatedBy, String updatedAt) {
    }

    public record CityResponse(Long id, Long districtId, String districtName,
                               String stateName, String countryName,
                               String name, String code, String status,
                               String createdBy, String createdAt,
                               String updatedBy, String updatedAt) {
    }

    /** Flat validation result used by /locations/validate. */
    public record ValidationResult(boolean valid, String message) {
    }
}
