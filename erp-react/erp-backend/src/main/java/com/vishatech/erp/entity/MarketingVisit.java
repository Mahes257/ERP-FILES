package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Offline Marketing visit — the single record behind the Offline Marketing
 * page. Carries the full visit (schedule/appointment, actual entry/exit,
 * meeting person), the Q Form + requirement, the visit discussion, the visit
 * outcome, the CURRENT follow-up snapshot (full history lives in
 * {@link MarketingFollowUp}), the linked Lead snapshot (source is always
 * "Offline Marketing") and the Sales-handover state.
 *
 * Statuses are stored as display strings (mirrors the FollowUp entity style):
 *   appointmentStatus : Fixed / Direct Visit / Pending Confirmation / Rescheduled / Cancelled
 *   visitStatus       : Planned / In Progress / Completed / Rescheduled / Cancelled / No Visit
 *   qFormStatus       : Not Prepared / Draft / Filled & Submitted / Pending / Not Required
 *   followupStatus    : Pending / Completed / Overdue / Rescheduled / Cancelled / No Response
 *   followupMode      : Visit / Phone / WhatsApp / Email / Online Meeting / Other
 *   outcome           : Lead Generated / Existing Customer Opportunity / Existing Order /
 *                       Follow-up Required / No Lead / Not Interested / Lost Opportunity /
 *                       Need Further Discussion / Other
 *   handoverStatus    : Not Ready / Ready for Sales / Handed Over
 */
@Entity
@Table(name = "marketing_visits")
public class MarketingVisit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ---- Basic information -------------------------------------------------
    // Marketer is a snapshot of the authenticated user who created the visit;
    // marketerUserId drives record-level access control (marketers see their
    // own visits; ADMIN/MANAGER see everything).
    private String marketer;

    private Long marketerUserId;

    private LocalDate scheduleDate;

    // Company / Plant name (from the Excel workflow) — free text, or filled
    // from the selected customer/lead when one is chosen.
    private String companyName;

    // Optional link to an existing Customer (reused — never duplicated).
    private Long customerId;

    private String customerName;

    // Optional link to an existing Lead (a visit does NOT auto-create a lead).
    private Long leadId;

    private String location;

    private String appointmentStatus;

    private LocalDate appointmentDate;

    private String appointmentTime;

    private String contactPerson;

    private String designation;

    private String phone;

    private String email;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String appointmentRemarks;

    // ---- Actual visit ------------------------------------------------------
    private LocalDateTime entryDateTime;

    private LocalDateTime exitDateTime;

    private String meetingPerson;

    private String meetingDesignation;

    private String visitStatus = "Planned";

    // ---- Q Form / Requirement ---------------------------------------------
    private String qFormStatus = "Not Prepared";

    @Lob
    @Column(columnDefinition = "TEXT")
    private String qFormDetails;

    private LocalDateTime qFormSubmittedAt;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String qFormRemarks;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String requirement;

    private String productService;

    private String quantity;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String technicalRequirement;

    private String expectedPurchaseTimeline;

    private String budget;

    private String requirementPriority;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String technicalRemarks;

    // ---- Visit discussion --------------------------------------------------
    @Lob
    @Column(columnDefinition = "TEXT")
    private String visitDescription;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String discussion;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String customerResponse;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String customerFeedback;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String technicalDiscussion;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String remarks;

    // ---- Outcome -----------------------------------------------------------
    private String outcome;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String noLeadReason;

    // ---- Lead snapshot (copied from the real lead at create/link time) -----
    private String leadNo;

    private String leadStage;

    private String leadStatus;

    private String leadPriority;

    @Column(precision = 18, scale = 2)
    private BigDecimal estimatedValue;

    private LocalDateTime leadCreatedAt;

    // ---- Current follow-up snapshot (history rows in MarketingFollowUp) ----
    private String nextAction;

    private LocalDate followupDate;

    private String followupMode;

    private String followupStatus;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String followupCustomerResponse;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String followupRemarks;

    // ---- Sales handover ----------------------------------------------------
    private String handoverStatus = "Not Ready";

    private LocalDateTime handoverAt;

    private String handoverTo;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String handoverRemarks;

    // ---- Location / Coordinates -------------------------------------------
    private java.math.BigDecimal latitude;

    private java.math.BigDecimal longitude;

    @Column(columnDefinition = "TEXT")
    private String address;

    // ---- Visit Number (auto-generated) -------------------------------------
    private String visitNo;

    // ---- Audit -------------------------------------------------------------
    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    // ---- Soft delete (ERP convention: history is never destroyed) -----------
    @Column(nullable = false)
    private boolean deleted = false;

    private LocalDateTime archivedAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public java.math.BigDecimal getLatitude() { return latitude; }
    public void setLatitude(java.math.BigDecimal v) { this.latitude = v; }

    public java.math.BigDecimal getLongitude() { return longitude; }
    public void setLongitude(java.math.BigDecimal v) { this.longitude = v; }

    public String getAddress() { return address; }
    public void setAddress(String v) { this.address = v; }

    public String getVisitNo() { return visitNo; }
    public void setVisitNo(String v) { this.visitNo = v; }

    public boolean isDeleted() {
        return deleted;
    }

    public void setDeleted(boolean deleted) {
        this.deleted = deleted;
    }

    public LocalDateTime getArchivedAt() {
        return archivedAt;
    }

    public void setArchivedAt(LocalDateTime archivedAt) {
        this.archivedAt = archivedAt;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getMarketer() {
        return marketer;
    }

    public void setMarketer(String marketer) {
        this.marketer = marketer;
    }

    public Long getMarketerUserId() {
        return marketerUserId;
    }

    public void setMarketerUserId(Long marketerUserId) {
        this.marketerUserId = marketerUserId;
    }

    public LocalDate getScheduleDate() {
        return scheduleDate;
    }

    public void setScheduleDate(LocalDate scheduleDate) {
        this.scheduleDate = scheduleDate;
    }

    public String getCompanyName() {
        return companyName;
    }

    public void setCompanyName(String companyName) {
        this.companyName = companyName;
    }

    public Long getCustomerId() {
        return customerId;
    }

    public void setCustomerId(Long customerId) {
        this.customerId = customerId;
    }

    public String getCustomerName() {
        return customerName;
    }

    public void setCustomerName(String customerName) {
        this.customerName = customerName;
    }

    public Long getLeadId() {
        return leadId;
    }

    public void setLeadId(Long leadId) {
        this.leadId = leadId;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public String getAppointmentStatus() {
        return appointmentStatus;
    }

    public void setAppointmentStatus(String appointmentStatus) {
        this.appointmentStatus = appointmentStatus;
    }

    public LocalDate getAppointmentDate() {
        return appointmentDate;
    }

    public void setAppointmentDate(LocalDate appointmentDate) {
        this.appointmentDate = appointmentDate;
    }

    public String getAppointmentTime() {
        return appointmentTime;
    }

    public void setAppointmentTime(String appointmentTime) {
        this.appointmentTime = appointmentTime;
    }

    public String getContactPerson() {
        return contactPerson;
    }

    public void setContactPerson(String contactPerson) {
        this.contactPerson = contactPerson;
    }

    public String getDesignation() {
        return designation;
    }

    public void setDesignation(String designation) {
        this.designation = designation;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getAppointmentRemarks() {
        return appointmentRemarks;
    }

    public void setAppointmentRemarks(String appointmentRemarks) {
        this.appointmentRemarks = appointmentRemarks;
    }

    public LocalDateTime getEntryDateTime() {
        return entryDateTime;
    }

    public void setEntryDateTime(LocalDateTime entryDateTime) {
        this.entryDateTime = entryDateTime;
    }

    public LocalDateTime getExitDateTime() {
        return exitDateTime;
    }

    public void setExitDateTime(LocalDateTime exitDateTime) {
        this.exitDateTime = exitDateTime;
    }

    public String getMeetingPerson() {
        return meetingPerson;
    }

    public void setMeetingPerson(String meetingPerson) {
        this.meetingPerson = meetingPerson;
    }

    public String getMeetingDesignation() {
        return meetingDesignation;
    }

    public void setMeetingDesignation(String meetingDesignation) {
        this.meetingDesignation = meetingDesignation;
    }

    public String getVisitStatus() {
        return visitStatus;
    }

    public void setVisitStatus(String visitStatus) {
        this.visitStatus = visitStatus;
    }

    public String getQFormStatus() {
        return qFormStatus;
    }

    public void setQFormStatus(String qFormStatus) {
        this.qFormStatus = qFormStatus;
    }

    public String getQFormDetails() {
        return qFormDetails;
    }

    public void setQFormDetails(String qFormDetails) {
        this.qFormDetails = qFormDetails;
    }

    public LocalDateTime getQFormSubmittedAt() {
        return qFormSubmittedAt;
    }

    public void setQFormSubmittedAt(LocalDateTime qFormSubmittedAt) {
        this.qFormSubmittedAt = qFormSubmittedAt;
    }

    public String getQFormRemarks() {
        return qFormRemarks;
    }

    public void setQFormRemarks(String qFormRemarks) {
        this.qFormRemarks = qFormRemarks;
    }

    public String getRequirement() {
        return requirement;
    }

    public void setRequirement(String requirement) {
        this.requirement = requirement;
    }

    public String getProductService() {
        return productService;
    }

    public void setProductService(String productService) {
        this.productService = productService;
    }

    public String getQuantity() {
        return quantity;
    }

    public void setQuantity(String quantity) {
        this.quantity = quantity;
    }

    public String getTechnicalRequirement() {
        return technicalRequirement;
    }

    public void setTechnicalRequirement(String technicalRequirement) {
        this.technicalRequirement = technicalRequirement;
    }

    public String getExpectedPurchaseTimeline() {
        return expectedPurchaseTimeline;
    }

    public void setExpectedPurchaseTimeline(String expectedPurchaseTimeline) {
        this.expectedPurchaseTimeline = expectedPurchaseTimeline;
    }

    public String getBudget() {
        return budget;
    }

    public void setBudget(String budget) {
        this.budget = budget;
    }

    public String getRequirementPriority() {
        return requirementPriority;
    }

    public void setRequirementPriority(String requirementPriority) {
        this.requirementPriority = requirementPriority;
    }

    public String getTechnicalRemarks() {
        return technicalRemarks;
    }

    public void setTechnicalRemarks(String technicalRemarks) {
        this.technicalRemarks = technicalRemarks;
    }

    public String getVisitDescription() {
        return visitDescription;
    }

    public void setVisitDescription(String visitDescription) {
        this.visitDescription = visitDescription;
    }

    public String getDiscussion() {
        return discussion;
    }

    public void setDiscussion(String discussion) {
        this.discussion = discussion;
    }

    public String getCustomerResponse() {
        return customerResponse;
    }

    public void setCustomerResponse(String customerResponse) {
        this.customerResponse = customerResponse;
    }

    public String getCustomerFeedback() {
        return customerFeedback;
    }

    public void setCustomerFeedback(String customerFeedback) {
        this.customerFeedback = customerFeedback;
    }

    public String getTechnicalDiscussion() {
        return technicalDiscussion;
    }

    public void setTechnicalDiscussion(String technicalDiscussion) {
        this.technicalDiscussion = technicalDiscussion;
    }

    public String getRemarks() {
        return remarks;
    }

    public void setRemarks(String remarks) {
        this.remarks = remarks;
    }

    public String getOutcome() {
        return outcome;
    }

    public void setOutcome(String outcome) {
        this.outcome = outcome;
    }

    public String getNoLeadReason() {
        return noLeadReason;
    }

    public void setNoLeadReason(String noLeadReason) {
        this.noLeadReason = noLeadReason;
    }

    public String getLeadNo() {
        return leadNo;
    }

    public void setLeadNo(String leadNo) {
        this.leadNo = leadNo;
    }

    public String getLeadStage() {
        return leadStage;
    }

    public void setLeadStage(String leadStage) {
        this.leadStage = leadStage;
    }

    public String getLeadStatus() {
        return leadStatus;
    }

    public void setLeadStatus(String leadStatus) {
        this.leadStatus = leadStatus;
    }

    public String getLeadPriority() {
        return leadPriority;
    }

    public void setLeadPriority(String leadPriority) {
        this.leadPriority = leadPriority;
    }

    public BigDecimal getEstimatedValue() {
        return estimatedValue;
    }

    public void setEstimatedValue(BigDecimal estimatedValue) {
        this.estimatedValue = estimatedValue;
    }

    public LocalDateTime getLeadCreatedAt() {
        return leadCreatedAt;
    }

    public void setLeadCreatedAt(LocalDateTime leadCreatedAt) {
        this.leadCreatedAt = leadCreatedAt;
    }

    public String getNextAction() {
        return nextAction;
    }

    public void setNextAction(String nextAction) {
        this.nextAction = nextAction;
    }

    public LocalDate getFollowupDate() {
        return followupDate;
    }

    public void setFollowupDate(LocalDate followupDate) {
        this.followupDate = followupDate;
    }

    public String getFollowupMode() {
        return followupMode;
    }

    public void setFollowupMode(String followupMode) {
        this.followupMode = followupMode;
    }

    public String getFollowupStatus() {
        return followupStatus;
    }

    public void setFollowupStatus(String followupStatus) {
        this.followupStatus = followupStatus;
    }

    public String getFollowupCustomerResponse() {
        return followupCustomerResponse;
    }

    public void setFollowupCustomerResponse(String followupCustomerResponse) {
        this.followupCustomerResponse = followupCustomerResponse;
    }

    public String getFollowupRemarks() {
        return followupRemarks;
    }

    public void setFollowupRemarks(String followupRemarks) {
        this.followupRemarks = followupRemarks;
    }

    public String getHandoverStatus() {
        return handoverStatus;
    }

    public void setHandoverStatus(String handoverStatus) {
        this.handoverStatus = handoverStatus;
    }

    public LocalDateTime getHandoverAt() {
        return handoverAt;
    }

    public void setHandoverAt(LocalDateTime handoverAt) {
        this.handoverAt = handoverAt;
    }

    public String getHandoverTo() {
        return handoverTo;
    }

    public void setHandoverTo(String handoverTo) {
        this.handoverTo = handoverTo;
    }

    public String getHandoverRemarks() {
        return handoverRemarks;
    }

    public void setHandoverRemarks(String handoverRemarks) {
        this.handoverRemarks = handoverRemarks;
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
