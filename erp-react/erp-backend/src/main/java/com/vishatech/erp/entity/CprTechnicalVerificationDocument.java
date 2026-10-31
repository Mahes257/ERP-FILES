package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "cpr_technical_verification_documents")
public class CprTechnicalVerificationDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "technical_verification_id", nullable = false)
    private CprTechnicalVerification technicalVerification;

    @Column(nullable = false, length = 255)
    private String name;

    @Column(nullable = false, length = 255)
    private String storedName;

    private String contentType;

    private long size;

    private String url;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DocumentVisibility visibility = DocumentVisibility.TEAM_ONLY;

    @Column(length = 20)
    private String documentCategory; // TEAM or CUSTOMER

    private boolean sentToCostWorkout = false;

    private Long costWorkoutId;

    private String costWorkoutCwNo;

    private LocalDateTime sentAt;

    private String sentBy;

    private String uploadedBy;

    private LocalDateTime uploadedAt;

    @PrePersist
    void onCreate() {
        uploadedAt = LocalDateTime.now();
    }

    // ---- Getters and Setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public CprTechnicalVerification getTechnicalVerification() { return technicalVerification; }
    public void setTechnicalVerification(CprTechnicalVerification technicalVerification) { this.technicalVerification = technicalVerification; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getStoredName() { return storedName; }
    public void setStoredName(String storedName) { this.storedName = storedName; }

    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }

    public long getSize() { return size; }
    public void setSize(long size) { this.size = size; }

    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }

    public DocumentVisibility getVisibility() { return visibility; }
    public void setVisibility(DocumentVisibility visibility) { this.visibility = visibility; }

    public String getUploadedBy() { return uploadedBy; }
    public void setUploadedBy(String uploadedBy) { this.uploadedBy = uploadedBy; }

    public LocalDateTime getUploadedAt() { return uploadedAt; }
    public void setUploadedAt(LocalDateTime uploadedAt) { this.uploadedAt = uploadedAt; }

    public String getDocumentCategory() { return documentCategory; }
    public void setDocumentCategory(String documentCategory) { this.documentCategory = documentCategory; }

    public boolean isSentToCostWorkout() { return sentToCostWorkout; }
    public void setSentToCostWorkout(boolean sentToCostWorkout) { this.sentToCostWorkout = sentToCostWorkout; }

    public Long getCostWorkoutId() { return costWorkoutId; }
    public void setCostWorkoutId(Long costWorkoutId) { this.costWorkoutId = costWorkoutId; }

    public String getCostWorkoutCwNo() { return costWorkoutCwNo; }
    public void setCostWorkoutCwNo(String costWorkoutCwNo) { this.costWorkoutCwNo = costWorkoutCwNo; }

    public LocalDateTime getSentAt() { return sentAt; }
    public void setSentAt(LocalDateTime sentAt) { this.sentAt = sentAt; }

    public String getSentBy() { return sentBy; }
    public void setSentBy(String sentBy) { this.sentBy = sentBy; }
}
