package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Lob;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * A user-added remark on a Quotation (Quotation Overview → Remarks).
 *
 * Remarks are part of the existing Quotation architecture — they live in their
 * own table so each remark keeps its own author and timestamp, and they are
 * NEVER stored on the quotation row itself (that would make them un-auditable).
 * The quotation's own free-text `remarks` column keeps its existing meaning.
 */
@Entity
@Table(name = "quotation_remarks", indexes = {
        @Index(name = "idx_quotation_remarks_quotation", columnList = "quotationId")
})
public class QuotationRemark {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Owning quotation (never null — remarks are always quotation-scoped). */
    @Column(nullable = false)
    private Long quotationId;

    /** Long text, safely stored as TEXT (no arbitrary 500-char limit). */
    @Lob
    @Column(columnDefinition = "TEXT", nullable = false)
    private String text;

    /** The authenticated ERP user who wrote it (resolved from the JWT). */
    @Column(length = 255)
    private String addedBy;

    private LocalDateTime createdAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getQuotationId() {
        return quotationId;
    }

    public void setQuotationId(Long quotationId) {
        this.quotationId = quotationId;
    }

    public String getText() {
        return text;
    }

    public void setText(String text) {
        this.text = text;
    }

    public String getAddedBy() {
        return addedBy;
    }

    public void setAddedBy(String addedBy) {
        this.addedBy = addedBy;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
