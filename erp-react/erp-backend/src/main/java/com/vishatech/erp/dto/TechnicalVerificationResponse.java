package com.vishatech.erp.dto;

import java.util.List;

public record TechnicalVerificationResponse(
        Long id,
        Long cprId,
        String tvNo,
        String status,
        String drawingNumber,
        String itemDescription,
        Boolean fileExists,
        String verifiedBy,
        String verificationDate,
        String nextReviewDate,
        String technicalRemarks,
        String internalRemarks,
        String customerRemarks,
        String createdBy,
        String approvedBy,
        String rejectedBy,
        String createdAt,
        String updatedAt,
        // CPR information
        String cprPrNo,
        String cprReferencePrNo,
        String cprClientName,
        String cprSourceLead,
        String cprProject,
        String cprDepartment,
        String cprPrDate,
        String cprRequiredDate,
        String cprStatus,
        String cprPriority,
        // Item-level fields
        Long cprItemId,
        String itemNo,
        String division,
        String fileStatus,
        boolean forwardedToCostWorkout,
        String forwardedAt,
        String forwardedBy,
        Long costWorkoutId,
        String costWorkoutCwNo,
        // Purchase Requisition destination (independent of the CW destination)
        boolean forwardedToPurchaseRequisition,
        String forwardedToPrAt,
        String forwardedToPrBy,
        Long purchaseRequisitionId,
        String purchaseRequisitionPrNo,
        // Documents
        List<TechnicalVerificationDocumentResponse> documents
) {
}
