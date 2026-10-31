package com.vishatech.erp.dto;

public record TechnicalVerificationRequest(
        Long cprId,
        Long cprItemId,
        String itemNo,
        String drawingNumber,
        String itemDescription,
        Boolean fileExists,
        String division,
        String status,
        String verifiedBy,
        String verificationDate,
        String nextReviewDate,
        String technicalRemarks,
        String internalRemarks,
        String customerRemarks
) {
}
