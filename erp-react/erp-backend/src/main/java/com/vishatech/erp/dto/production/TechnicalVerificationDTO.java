package com.vishatech.erp.dto.production;

import lombok.*;

/**
 * DTO for Technical Verification records.
 * Contains all fields used by the frontend.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TechnicalVerificationDTO {
    private Long id;
    private String workOrderId;
    private String itemId;
    private String workOrderNumber;
    private String productionOrderNumber;

    // Item Information
    private String itemProduct;
    private String itemCode;
    private String productionType;
    private Integer requiredQuantity;

    // Drawing / Pattern
    private String drawingNumber;
    private String drawingRevision;
    private String patternNumber;
    private String patternRevision;

    // Casting-specific
    private String materialGrade;
    private String specification;
    private String castingWeight;
    private String dimensions;
    private String machiningAllowance;

    // Fabrication-specific
    private String materialType;
    private String thickness;
    private String lengthMm;
    private String width;
    private String diameter;
    private String requiredTolerance;
    private String weldingSpecification;
    private String weldingProcess;
    private String weldType;
    private String jointType;
    private String hardFacingRequirement;
    private String surfaceTreatment;
    private String heatTreatmentRequirement;

    // Common
    private String specialInstructions;
    private String technicalInstructions;

    // Checklist (JSON string)
    private String checklist;

    // Verification
    private String verificationStatus;
    private String verifiedBy;
    private String verificationDateTime;
    private String verificationRemarks;

    // Audit
    private String createdBy;
    private String updatedBy;
    private String createdAt;
    private String updatedAt;
}
