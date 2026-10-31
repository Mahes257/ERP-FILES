package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.util.List;

public record CostWorkoutRequest(
        String cwNo,
        String cwDate,
        String status,
        String preparedBy,
        String contactPerson,
        String department,
        String sourceLead,
        String customerName,
        String cprRef,
        Long cprId,
        String phone,
        String email,
        String company,
        String gst,
        String pan,
        String linkedCpr,
        String billingAddress,
        String shippingAddress,
        String remarks,
        BigDecimal profitPct,
        BigDecimal discountPct,
        BigDecimal gstPct,
        List<CostWorkoutItemRequest> items,
        List<CostWorkoutAttachment> attachments,
        String itemColumnsJson
) {
}
