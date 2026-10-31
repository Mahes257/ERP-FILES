package com.vishatech.erp.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * A follow-up or visit extension linked to an original marketing visit.
 *
 * activityType = "followup" | "extension"
 *
 * Each record has its own unique ID. Editing updates the existing row;
 * creating a new follow-up/extension inserts a new row (history is append-only).
 */
@Entity
@Table(name = "marketing_visit_activities")
public class MarketingVisitActivity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** The original visit this follow-up/extension is linked to. */
    @Column(nullable = false)
    private Long visitId;

    /** "followup" or "extension". */
    @Column(nullable = false, length = 20)
    private String activityType;

    // ---- Activity date/time ----
    private LocalDate activityDate;
    private String activityTime;

    // ---- Business / Contact ----
    private String companyName;
    private String contactName;
    private String contactDesignation;
    private String contactDepartment;
    private String contactPhone;
    private String contactWhatsApp;
    private String contactEmail;

    // ---- Follow-up specific ----
    private String followupType; // Phone Call / WhatsApp / Email / Meeting etc.

    // ---- Discussion / Outcome ----
    @Column(columnDefinition = "TEXT")
    private String discussion;
    @Column(columnDefinition = "TEXT")
    private String customerResponse;
    private String status; // Pending / Scheduled / Completed / etc.
    private String outcome; // Interested / Not Interested / Converted etc.

    // ---- Customer Requirement (extension only) ----
    @Column(columnDefinition = "TEXT")
    private String customerRequirement;

    // ---- Next follow-up ----
    private String nextAction;
    private LocalDate nextFollowupDate;
    private String nextFollowupTime;

    // ---- Assignment ----
    private String assignedEmployee;

    // ---- Remarks ----
    @Column(columnDefinition = "TEXT")
    private String remarks;

    // ---- Group ----
    private String groupName;

    // ---- Attachment reference (comma-separated file paths) ----
    @Column(columnDefinition = "TEXT")
    private String attachmentPaths;

    // ---- Audit ----
    private String createdBy;
    private Long createdByUserId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // ---- Getters & Setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getVisitId() { return visitId; }
    public void setVisitId(Long visitId) { this.visitId = visitId; }

    public String getActivityType() { return activityType; }
    public void setActivityType(String activityType) { this.activityType = activityType; }

    public LocalDate getActivityDate() { return activityDate; }
    public void setActivityDate(LocalDate activityDate) { this.activityDate = activityDate; }

    public String getActivityTime() { return activityTime; }
    public void setActivityTime(String activityTime) { this.activityTime = activityTime; }

    public String getCompanyName() { return companyName; }
    public void setCompanyName(String companyName) { this.companyName = companyName; }

    public String getContactName() { return contactName; }
    public void setContactName(String contactName) { this.contactName = contactName; }

    public String getContactDesignation() { return contactDesignation; }
    public void setContactDesignation(String contactDesignation) { this.contactDesignation = contactDesignation; }

    public String getContactDepartment() { return contactDepartment; }
    public void setContactDepartment(String contactDepartment) { this.contactDepartment = contactDepartment; }

    public String getContactPhone() { return contactPhone; }
    public void setContactPhone(String contactPhone) { this.contactPhone = contactPhone; }

    public String getContactWhatsApp() { return contactWhatsApp; }
    public void setContactWhatsApp(String contactWhatsApp) { this.contactWhatsApp = contactWhatsApp; }

    public String getContactEmail() { return contactEmail; }
    public void setContactEmail(String contactEmail) { this.contactEmail = contactEmail; }

    public String getFollowupType() { return followupType; }
    public void setFollowupType(String followupType) { this.followupType = followupType; }

    public String getDiscussion() { return discussion; }
    public void setDiscussion(String discussion) { this.discussion = discussion; }

    public String getCustomerResponse() { return customerResponse; }
    public void setCustomerResponse(String customerResponse) { this.customerResponse = customerResponse; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getOutcome() { return outcome; }
    public void setOutcome(String outcome) { this.outcome = outcome; }

    public String getCustomerRequirement() { return customerRequirement; }
    public void setCustomerRequirement(String customerRequirement) { this.customerRequirement = customerRequirement; }

    public String getNextAction() { return nextAction; }
    public void setNextAction(String nextAction) { this.nextAction = nextAction; }

    public LocalDate getNextFollowupDate() { return nextFollowupDate; }
    public void setNextFollowupDate(LocalDate nextFollowupDate) { this.nextFollowupDate = nextFollowupDate; }

    public String getNextFollowupTime() { return nextFollowupTime; }
    public void setNextFollowupTime(String nextFollowupTime) { this.nextFollowupTime = nextFollowupTime; }

    public String getAssignedEmployee() { return assignedEmployee; }
    public void setAssignedEmployee(String assignedEmployee) { this.assignedEmployee = assignedEmployee; }

    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }

    public String getGroupName() { return groupName; }
    public void setGroupName(String groupName) { this.groupName = groupName; }

    public String getAttachmentPaths() { return attachmentPaths; }
    public void setAttachmentPaths(String attachmentPaths) { this.attachmentPaths = attachmentPaths; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public Long getCreatedByUserId() { return createdByUserId; }
    public void setCreatedByUserId(Long createdByUserId) { this.createdByUserId = createdByUserId; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
