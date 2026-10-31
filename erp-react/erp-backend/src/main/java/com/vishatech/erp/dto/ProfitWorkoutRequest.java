package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.util.List;

public record ProfitWorkoutRequest(
        String pwNo,
        String pwDate,
        String status,
        String preparedBy,
        String contactPerson,
        String department,
        String currency,
        String project,
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
        BigDecimal additionalCharges,
        BigDecimal gstPct,
        List<ProfitWorkoutItemRequest> items,
        List<ProfitWorkoutAttachment> attachments,
        /**
         * Source Cost Workout of a conversion-prefilled creation form (see
         * ProfitWorkoutService#create). Null for a manually created Profit
         * Workout; ignored on update, where the stored source is preserved.
         */
        Long sourceCwId
) {
}