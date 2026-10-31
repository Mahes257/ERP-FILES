package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.util.List;

public record CprResponse(
        Long id,
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
        String currentStage,
        String approvalStatus,
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
        BigDecimal costWorkout,
        BigDecimal profitPercent,
        BigDecimal grandTotal,
        String convertedToQtn,
        Long quotationId,
        Long costWorkoutId,
        String costWorkoutCwNo,
        String costWorkoutStatus,
        String submittedBy,
        String submittedAt,
        String approvedBy,
        String approvalDate,
        String rejectedBy,
        String approvalRemarks,
        String date,
        String createdAt,
        String updatedAt,
        String archivedAt,
        List<CprItemResponse> items,
        List<CprAttachmentResponse> attachments,
        List<CprTimelineResponse> timeline,
        List<CprHistoryResponse> history,
        List<CprCommentResponse> comments
,
        Integer revision,
        Long revisionOf,
        Boolean latestRevision,
        String revisionDate,
        List<RevisionInfo> revisions,
        List<CprItemColumn> itemColumns,
        /**
         * Technical-Verification → Admin-Approval → Float workflow. Kept separate
         * from {@link #status} on purpose: the CPR lifecycle, its verification
         * state, the Admin approval state and the float destination are four
         * independent facts and are never blended into one status field.
         */
        String technicalVerificationStatus,
        String technicalVerificationNo,
        Integer technicalVerificationCount,
        /** The GATE — true only when every item-level verification row is verified. */
        Boolean technicalVerificationCompleted,
        /** NOT_READY | PENDING | APPROVED_PR | APPROVED_CW | REJECTED. */
        String adminApprovalState,
        /** Executed destination: "PR", "CW" or null when not floated yet. */
        String floatDestination,
        String floatDestinationLabel,
        /** Purchase Requisition number the CPR was floated as (PR destination only). */
        String floatedPrNo,
        String floatedAt,
        String floatedBy
) {
}
