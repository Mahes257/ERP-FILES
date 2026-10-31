package com.vishatech.erp.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "cpr_technical_verifications")
public class CprTechnicalVerification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "cpr_id", nullable = false)
    private Cpr cpr;

    @Column(nullable = false, length = 40, unique = true)
    private String tvNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private TechnicalVerificationStatus status = TechnicalVerificationStatus.DRAFT;

    private String verifiedBy;

    private String drawingNumber;

    private String itemDescription;

    private Boolean fileExists = false;

    // ---- Item-level verification fields ----
    private Long cprItemId;

    private String itemNo;

    private String division; // TEAM or CUSTOMER

    private String fileStatus; // AVAILABLE, MISSING, PENDING

    private boolean forwardedToCostWorkout = false;

    private LocalDateTime forwardedAt;

    private String forwardedBy;

    private Long costWorkoutId;

    private String costWorkoutCwNo;

    // ---- Purchase Requisition destination (the second target a verified item
    // can be converted into). Kept alongside the CW fields so ONE verification
    // row can hold both destinations independently — converting an item to PR
    // never disturbs a CW raised from the same item, and vice versa. ----

    private boolean forwardedToPurchaseRequisition = false;

    private LocalDateTime forwardedToPrAt;

    private String forwardedToPrBy;

    private Long purchaseRequisitionId;

    private String purchaseRequisitionPrNo;

    private LocalDate verificationDate;

    private LocalDate nextReviewDate;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String technicalRemarks;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String internalRemarks;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String customerRemarks;

    private String createdBy;

    private String approvedBy;

    private String rejectedBy;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    @OneToMany(mappedBy = "technicalVerification", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("uploadedAt ASC")
    private List<CprTechnicalVerificationDocument> documents = new ArrayList<>();

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public void addDocument(CprTechnicalVerificationDocument document) {
        document.setTechnicalVerification(this);
        documents.add(document);
    }

    // ---- Getters and Setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Cpr getCpr() { return cpr; }
    public void setCpr(Cpr cpr) { this.cpr = cpr; }

    public String getTvNo() { return tvNo; }
    public void setTvNo(String tvNo) { this.tvNo = tvNo; }

    public TechnicalVerificationStatus getStatus() { return status; }
    public void setStatus(TechnicalVerificationStatus status) { this.status = status; }

    public String getVerifiedBy() { return verifiedBy; }
    public void setVerifiedBy(String verifiedBy) { this.verifiedBy = verifiedBy; }

    public String getDrawingNumber() { return drawingNumber; }
    public void setDrawingNumber(String drawingNumber) { this.drawingNumber = drawingNumber; }

    public String getItemDescription() { return itemDescription; }
    public void setItemDescription(String itemDescription) { this.itemDescription = itemDescription; }

    public Boolean getFileExists() { return fileExists; }
    public void setFileExists(Boolean fileExists) { this.fileExists = fileExists; }

    public LocalDate getVerificationDate() { return verificationDate; }
    public void setVerificationDate(LocalDate verificationDate) { this.verificationDate = verificationDate; }

    public LocalDate getNextReviewDate() { return nextReviewDate; }
    public void setNextReviewDate(LocalDate nextReviewDate) { this.nextReviewDate = nextReviewDate; }

    public String getTechnicalRemarks() { return technicalRemarks; }
    public void setTechnicalRemarks(String technicalRemarks) { this.technicalRemarks = technicalRemarks; }

    public String getInternalRemarks() { return internalRemarks; }
    public void setInternalRemarks(String internalRemarks) { this.internalRemarks = internalRemarks; }

    public String getCustomerRemarks() { return customerRemarks; }
    public void setCustomerRemarks(String customerRemarks) { this.customerRemarks = customerRemarks; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public String getApprovedBy() { return approvedBy; }
    public void setApprovedBy(String approvedBy) { this.approvedBy = approvedBy; }

    public String getRejectedBy() { return rejectedBy; }
    public void setRejectedBy(String rejectedBy) { this.rejectedBy = rejectedBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public List<CprTechnicalVerificationDocument> getDocuments() { return documents; }    public void setDocuments(List<CprTechnicalVerificationDocument> documents) {
        this.documents = documents;
    }

    // ---- Item-level getters and setters ----

    public Long getCprItemId() { return cprItemId; }
    public void setCprItemId(Long cprItemId) { this.cprItemId = cprItemId; }

    public String getItemNo() { return itemNo; }
    public void setItemNo(String itemNo) { this.itemNo = itemNo; }

    public String getDivision() { return division; }
    public void setDivision(String division) { this.division = division; }

    public String getFileStatus() { return fileStatus; }
    public void setFileStatus(String fileStatus) { this.fileStatus = fileStatus; }

    public boolean isForwardedToCostWorkout() { return forwardedToCostWorkout; }
    public void setForwardedToCostWorkout(boolean forwardedToCostWorkout) { this.forwardedToCostWorkout = forwardedToCostWorkout; }

    public LocalDateTime getForwardedAt() { return forwardedAt; }
    public void setForwardedAt(LocalDateTime forwardedAt) { this.forwardedAt = forwardedAt; }

    public String getForwardedBy() { return forwardedBy; }
    public void setForwardedBy(String forwardedBy) { this.forwardedBy = forwardedBy; }

    public Long getCostWorkoutId() { return costWorkoutId; }
    public void setCostWorkoutId(Long costWorkoutId) { this.costWorkoutId = costWorkoutId; }

    public String getCostWorkoutCwNo() { return costWorkoutCwNo; }
    public void setCostWorkoutCwNo(String costWorkoutCwNo) { this.costWorkoutCwNo = costWorkoutCwNo; }

    // ---- Purchase Requisition destination ----

    public boolean isForwardedToPurchaseRequisition() { return forwardedToPurchaseRequisition; }
    public void setForwardedToPurchaseRequisition(boolean forwardedToPurchaseRequisition) { this.forwardedToPurchaseRequisition = forwardedToPurchaseRequisition; }

    public LocalDateTime getForwardedToPrAt() { return forwardedToPrAt; }
    public void setForwardedToPrAt(LocalDateTime forwardedToPrAt) { this.forwardedToPrAt = forwardedToPrAt; }

    public String getForwardedToPrBy() { return forwardedToPrBy; }
    public void setForwardedToPrBy(String forwardedToPrBy) { this.forwardedToPrBy = forwardedToPrBy; }

    public Long getPurchaseRequisitionId() { return purchaseRequisitionId; }
    public void setPurchaseRequisitionId(Long purchaseRequisitionId) { this.purchaseRequisitionId = purchaseRequisitionId; }

    public String getPurchaseRequisitionPrNo() { return purchaseRequisitionPrNo; }
    public void setPurchaseRequisitionPrNo(String purchaseRequisitionPrNo) { this.purchaseRequisitionPrNo = purchaseRequisitionPrNo; }
}
