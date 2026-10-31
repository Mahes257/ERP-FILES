package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record LocationTrackingResponse(
        Long id,
        Long travelPlanId,
        String planNo,
        Long userId,
        String marketerName,
        BigDecimal latitude,
        BigDecimal longitude,
        BigDecimal accuracy,
        BigDecimal speed,
        BigDecimal heading,
        Long currentStopId,
        String currentStopName,
        String locationLabel,
        Integer batteryLevel,
        LocalDateTime recordedAt,
        LocalDateTime receivedAt,
        long ageInSeconds
) {}
