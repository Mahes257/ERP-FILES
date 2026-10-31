package com.vishatech.erp.dto;

import java.math.BigDecimal;

/**
 * Request body for creating or updating a marketing location on the map.
 */
public record MarketingLocationRequest(
        String locationName,
        String address,
        String city,
        String state,
        String pin,
        String contactPerson,
        String phone,
        String marketingVisitReference,
        String remarks,
        String locationType,
        BigDecimal latitude,
        BigDecimal longitude
) {}
