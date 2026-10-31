package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "purchase_rfq_followups")
public class PurchaseRfqFollowUp {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 60)
    private String followUpNo;
    @Column(nullable = false, length = 60)
    private String rfqNo;
    @Column(length = 160)
    private String vendor;
    @Column(nullable = false, length = 120)
    private String type;
    @Column(nullable = false, length = 30)
    private String workflowStatus = "Pending";
    @Column(nullable = false)
    private LocalDate followUpDate;
    @Column(length = 10)
    private String followUpTime;
    @Column(length = 30)
    private String priority;
    @Column(length = 120)
    private String assignedTo;
    @Column(columnDefinition = "TEXT")
    private String notes;
    private Boolean reminder;
    @Column(nullable = false, length = 20)
    private String recordState = "active";
    private LocalDate lastContact;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() { updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public String getFollowUpNo() { return followUpNo; }
    public void setFollowUpNo(String value) { followUpNo = value; }
    public String getRfqNo() { return rfqNo; }
    public void setRfqNo(String value) { rfqNo = value; }
    public String getVendor() { return vendor; }
    public void setVendor(String value) { vendor = value; }
    public String getType() { return type; }
    public void setType(String value) { type = value; }
    public String getWorkflowStatus() { return workflowStatus; }
    public void setWorkflowStatus(String value) { workflowStatus = value; }
    public LocalDate getFollowUpDate() { return followUpDate; }
    public void setFollowUpDate(LocalDate value) { followUpDate = value; }
    public String getFollowUpTime() { return followUpTime; }
    public void setFollowUpTime(String value) { followUpTime = value; }
    public String getPriority() { return priority; }
    public void setPriority(String value) { priority = value; }
    public String getAssignedTo() { return assignedTo; }
    public void setAssignedTo(String value) { assignedTo = value; }
    public String getNotes() { return notes; }
    public void setNotes(String value) { notes = value; }
    public Boolean getReminder() { return reminder; }
    public void setReminder(Boolean value) { reminder = value; }
    public String getRecordState() { return recordState; }
    public void setRecordState(String value) { recordState = value; }
    public LocalDate getLastContact() { return lastContact; }
    public void setLastContact(LocalDate value) { lastContact = value; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
