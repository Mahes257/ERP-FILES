package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record LocationTrackingRequest(
        Long travelPlanId,
        BigDecimal latitude,
        BigDecimal longitude,
        BigDecimal accuracy,
        BigDecimal speed,
        BigDecimal heading,
        Long currentStopId,
        String locationLabel,
        Integer batteryLevel,
        LocalDateTime recordedAt
) {}
