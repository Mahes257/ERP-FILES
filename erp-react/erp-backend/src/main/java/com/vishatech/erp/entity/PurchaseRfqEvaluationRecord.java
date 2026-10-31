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
import java.time.LocalDateTime;

/**
 * Persisted procurement evaluation state for a single RFQ.
 *
 * <p>The evaluation workflow (per-vendor technical scoring, negotiated
 * rounds, the explicit supplier selection and its approval) is one
 * cohesive document per RFQ. It is stored as a JSON payload keyed by the
 * RFQ number so that a page refresh — or a different browser — reloads
 * exactly what was saved, instead of relying on browser-local storage.
 *
 * <p>Negotiation rounds are additionally projected into
 * {@link PurchaseRfqNegotiation} so they stay queryable per vendor.
 */
@Entity
@Table(name = "purchase_rfq_evaluation_records", indexes = {
        @Index(name = "idx_rfq_eval_record_no", columnList = "rfqNo")
})
public class PurchaseRfqEvaluationRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 60)
    private String rfqNo;

    /** Frontend-side reference (id or number) the record was saved under. */
    @Column(length = 60)
    private String rfqRef;

    /** Derived workflow stage (e.g. Technical Evaluation, Supplier Selection). */
    @Column(length = 60)
    private String stage;

    /** The complete evaluation document as JSON. */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String recordJson;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
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

    public String getRfqNo() {
        return rfqNo;
    }

    public void setRfqNo(String rfqNo) {
        this.rfqNo = rfqNo;
    }

    public String getRfqRef() {
        return rfqRef;
    }

    public void setRfqRef(String rfqRef) {
        this.rfqRef = rfqRef;
    }

    public String getStage() {
        return stage;
    }

    public void setStage(String stage) {
        this.stage = stage;
    }

    public String getRecordJson() {
        return recordJson;
    }

    public void setRecordJson(String recordJson) {
        this.recordJson = recordJson;
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
