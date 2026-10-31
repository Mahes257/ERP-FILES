package com.vishatech.erp.entity.production;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Technical Verification record for a Work Order Item.
 * One record per Work Order Item tracking verification status.
 * Stores all production-type-specific technical fields from the frontend.
 */
@Entity
@Table(name = "technical_verifications",
       uniqueConstraints = @UniqueConstraint(
           columnNames = {"work_order_id", "item_id"}
       ),
       indexes = {
           @Index(name = "idx_tech_verif_status_type", columnList = "verification_status, production_type"),
           @Index(name = "idx_tech_verif_work_order_id", columnList = "work_order_id")
       })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TechnicalVerification extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ========================
    // Work Order Reference
    // ========================
    @Column(name = "work_order_id", nullable = false, length = 20)
    private String workOrderId;

    @Column(name = "item_id", length = 100)
    private String itemId;

    @Column(name = "work_order_number", length = 20)
    private String workOrderNumber;

    @Column(name = "production_order_number", length = 50)
    private String productionOrderNumber;

    // ========================
    // Item Information
    // ========================
    @Column(name = "item_product", length = 255)
    private String itemProduct;

    @Column(name = "item_code", length = 100)
    private String itemCode;

    @Column(name = "production_type", length = 30)
    private String productionType;

    @Column(name = "required_quantity")
    private Integer requiredQuantity;

    // ========================
    // Drawing / Pattern (Auto-filled from Work Order)
    // ========================
    @Column(name = "drawing_number", length = 100)
    private String drawingNumber;

    @Column(name = "drawing_revision", length = 50)
    private String drawingRevision;

    @Column(name = "pattern_number", length = 100)
    private String patternNumber;

    @Column(name = "pattern_revision", length = 50)
    private String patternRevision;

    // ========================
    // Casting-specific fields
    // ========================
    @Column(name = "material_grade", length = 200)
    private String materialGrade;

    @Column(name = "specification", columnDefinition = "TEXT")
    private String specification;

    @Column(name = "casting_weight", length = 50)
    private String castingWeight;

    @Column(name = "dimensions", length = 255)
    private String dimensions;

    @Column(name = "machining_allowance", length = 100)
    private String machiningAllowance;

    // ========================
    // Fabrication-specific fields
    // ========================
    @Column(name = "material_type", length = 100)
    private String materialType;

    @Column(name = "thickness", length = 50)
    private String thickness;

    @Column(name = "length_mm", length = 50)
    private String lengthMm;

    @Column(name = "width", length = 50)
    private String width;

    @Column(name = "diameter", length = 50)
    private String diameter;

    @Column(name = "required_tolerance", length = 100)
    private String requiredTolerance;

    @Column(name = "welding_specification", length = 200)
    private String weldingSpecification;

    @Column(name = "welding_process", length = 100)
    private String weldingProcess;

    @Column(name = "weld_type", length = 100)
    private String weldType;

    @Column(name = "joint_type", length = 100)
    private String jointType;

    @Column(name = "hard_facing_requirement", columnDefinition = "TEXT")
    private String hardFacingRequirement;

    @Column(name = "surface_treatment", length = 200)
    private String surfaceTreatment;

    @Column(name = "heat_treatment_requirement", columnDefinition = "TEXT")
    private String heatTreatmentRequirement;

    // ========================
    // Common fields
    // ========================
    @Column(name = "special_instructions", columnDefinition = "TEXT")
    private String specialInstructions;

    @Column(name = "technical_instructions", columnDefinition = "TEXT")
    private String technicalInstructions;

    // ========================
    // Checklist (stored as JSON string)
    // ========================
    @Column(name = "checklist", columnDefinition = "TEXT")
    @Lob
    private String checklist;

    // ========================
    // Verification Status & Result
    // ========================
    @Enumerated(EnumType.STRING)
    @Column(name = "verification_status", length = 30)
    @Builder.Default
    private TVStatus verificationStatus = TVStatus.PENDING;

    @Column(name = "verified_by", length = 255)
    private String verifiedBy;

    @Column(name = "verification_datetime")
    private Instant verificationDateTime;

    @Column(name = "verification_remarks", columnDefinition = "TEXT")
    private String verificationRemarks;

    // ========================
    // Audit
    // ========================
    @Column(name = "created_by", length = 255)
    private String createdBy;

    @Column(name = "updated_by", length = 255)
    private String updatedBy;

    // ========================
    // History
    // ========================
    @OneToMany(mappedBy = "technicalVerification", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("performedAt DESC")
    @Builder.Default
    private List<TVHistory> history = new ArrayList<>();

    /**
     * Add a history record to this verification.
     */
    public void addHistory(TVHistory h) {
        history.add(h);
        h.setTechnicalVerification(this);
    }
}
