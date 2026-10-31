package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Lob;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * A Reference PR No that the ERP can work with even when no CPR exists yet.
 *
 * WHY THIS EXISTS
 * ---------------
 * A "Reference PR No" (e.g. {@code PR-2026-0156}) is the customer's own enquiry
 * number. Historically the ERP only knew about PR numbers that a CPR carried
 * ({@link Cpr#getReferencePrNo()}), which forced every quotation to be created
 * from a CPR first. That is not how the business works: a quotation can be
 * raised straight from the customer enquiry.
 *
 * This table therefore stores the PR references that were created directly from
 * the Quotation form. CPR-carried PR numbers are NOT duplicated here — they stay
 * owned by {@link Cpr} and are merged into the dropdown at read time (see
 * {@code PrReferenceService#search}), so there is exactly one source of truth
 * per PR number.
 *
 * When a CPR is later raised for a PR number that only existed here, the CPR
 * takes ownership: {@link #source} flips to {@value #SOURCE_CPR} and
 * {@link #cprId}/{@link #cprNo} are filled in ({@code PrReferenceService#linkCpr}).
 * Nothing is deleted and no duplicate PR number rows are created.
 */
@Entity
@Table(name = "pr_references", indexes = {
        @Index(name = "idx_pr_references_cpr", columnList = "cprId")
})
public class PrReference {

    /** The PR No is carried by a real CPR row (the canonical Sales entry point). */
    public static final String SOURCE_CPR = "CPR";

    /** The PR No was created directly from the Quotation form. */
    public static final String SOURCE_DIRECT = "DIRECT";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * The customer's PR number, exactly as entered. Unique across the ERP so the
     * same PR number can never be registered twice. Deliberately a short VARCHAR
     * (not TEXT/CLOB) so case-insensitive equality lookups stay portable.
     */
    @Column(length = 60, nullable = false, unique = true)
    private String referencePrNo;

    /** {@value #SOURCE_CPR} or {@value #SOURCE_DIRECT}. */
    @Column(length = 20, nullable = false)
    private String source = SOURCE_DIRECT;

    /** Numeric id of the owning CPR row, when the PR No comes from a CPR. */
    private Long cprId;

    /** The CPR's own document number (CPR-YYYY-NNNNNN), for display. */
    @Column(length = 40)
    private String cprNo;

    private Long clientId;

    @Column(length = 255)
    private String clientName;

    @Column(length = 255)
    private String project;

    /** Long text — the enquiry description. No arbitrary character limit. */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(length = 255)
    private String requestedBy;

    /** Date printed on the customer's PR (date-only — no timezone shifting). */
    private LocalDate prDate;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String remarks;

    /** Authenticated ERP user who registered it (never "Admin User"/"System"). */
    @Column(length = 255)
    private String createdBy;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
        if (source == null || source.isBlank()) {
            source = SOURCE_DIRECT;
        }
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getReferencePrNo() {
        return referencePrNo;
    }

    public void setReferencePrNo(String referencePrNo) {
        this.referencePrNo = referencePrNo;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public Long getCprId() {
        return cprId;
    }

    public void setCprId(Long cprId) {
        this.cprId = cprId;
    }

    public String getCprNo() {
        return cprNo;
    }

    public void setCprNo(String cprNo) {
        this.cprNo = cprNo;
    }

    public Long getClientId() {
        return clientId;
    }

    public void setClientId(Long clientId) {
        this.clientId = clientId;
    }

    public String getClientName() {
        return clientName;
    }

    public void setClientName(String clientName) {
        this.clientName = clientName;
    }

    public String getProject() {
        return project;
    }

    public void setProject(String project) {
        this.project = project;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getRequestedBy() {
        return requestedBy;
    }

    public void setRequestedBy(String requestedBy) {
        this.requestedBy = requestedBy;
    }

    public LocalDate getPrDate() {
        return prDate;
    }

    public void setPrDate(LocalDate prDate) {
        this.prDate = prDate;
    }

    public String getRemarks() {
        return remarks;
    }

    public void setRemarks(String remarks) {
        this.remarks = remarks;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(String createdBy) {
        this.createdBy = createdBy;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
