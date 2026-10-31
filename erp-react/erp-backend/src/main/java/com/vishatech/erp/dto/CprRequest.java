package com.vishatech.erp.dto;

import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public record CprRequest(
        String prNo,
        String referencePrNo,
        String prDate,
        String department,
        String requestedBy,
        String requiredDate,
        String quotationDeadline,
        String extendedDeadline,
        String priority,
        String status,
        String sourceLead,
        Long clientId,
        String clientName,
        String contactPerson,
        String phone,
        String email,
        String company,
        String gst,
        String project,
        String leadNo,
        String pan,
        String vendor,
        String billingAddress,
        String shippingAddress,
        String remarks,
        String description,
        String currentStage,
        String approvalStatus,
        BigDecimal costWorkout,
        BigDecimal profitPercent,
        String convertedToQtn,
        List<CprItemRequest> items,
        List<CprItemColumn> itemColumns
) {
}
