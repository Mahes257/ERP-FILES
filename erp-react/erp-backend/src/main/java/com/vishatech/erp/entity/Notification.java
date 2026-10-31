package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * In-app notification entity.
 *
 * Supports:
 *  - user targeting (recipientUserId)
 *  - module/reference linkage (SALES + SalesOrder id)
 *  - priority levels
 *  - read/resolved lifecycle
 *  - scheduled reminders with escalation
 *  - test flag (isTest) for proof-of-concept testing without mixing with
 *    real business notifications
 */
@Entity
@Table(name = "notifications", indexes = {
        @Index(name = "idx_notif_recipient", columnList = "recipientUserId"),
        @Index(name = "idx_notif_status", columnList = "status"),
        @Index(name = "idx_notif_reminder", columnList = "nextReminderAt"),
        @Index(name = "idx_notif_recipient_status", columnList = "recipientUserId, status")
})
public class Notification {

    public enum Priority { LOW, NORMAL, HIGH, URGENT }
    public enum Status { UNREAD, READ, RESOLVED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** User who should receive this notification. */
    @Column(nullable = false)
    private Long recipientUserId;

    /** User who triggered it (null for system-generated). */
    private Long senderUserId;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, length = 2000)
    private String message;

    /** Module that generated this notification (SALES, MARKETING, etc.). */
    @Column(nullable = false, length = 40)
    private String module;

    /** ID of the referenced record in the module. */
    private Long referenceId;

    /** Type of the referenced record (SalesOrder, Quotation, etc.). */
    @Column(length = 60)
    private String referenceType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Priority priority = Priority.NORMAL;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.UNREAD;

    /** When the recipient read the notification (null while unread). */
    private LocalDateTime readAt;

    /** When the notification was resolved/dismissed. */
    private LocalDateTime resolvedAt;

    /** When the next reminder should fire (null if no reminder scheduled). */
    private LocalDateTime nextReminderAt;

    /** How many reminders have been sent so far. */
    @Column(nullable = false)
    private int reminderCount = 0;

    /** Max reminders before escalation (0 = no reminders). */
    @Column(nullable = false)
    private int maxReminders = 3;

    /** TEST_SALES for PoC; null for real notifications. */
    @Column(length = 40)
    private String notificationType;

    /** True for proof-of-concept test notifications. */
    @Column(nullable = false)
    private boolean isTest = false;

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

    // --- Getters & Setters ---

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getRecipientUserId() { return recipientUserId; }
    public void setRecipientUserId(Long recipientUserId) { this.recipientUserId = recipientUserId; }

    public Long getSenderUserId() { return senderUserId; }
    public void setSenderUserId(Long senderUserId) { this.senderUserId = senderUserId; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }

    public String getModule() { return module; }
    public void setModule(String module) { this.module = module; }

    public Long getReferenceId() { return referenceId; }
    public void setReferenceId(Long referenceId) { this.referenceId = referenceId; }

    public String getReferenceType() { return referenceType; }
    public void setReferenceType(String referenceType) { this.referenceType = referenceType; }

    public Priority getPriority() { return priority; }
    public void setPriority(Priority priority) { this.priority = priority; }

    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }

    public LocalDateTime getReadAt() { return readAt; }
    public void setReadAt(LocalDateTime readAt) { this.readAt = readAt; }

    public LocalDateTime getResolvedAt() { return resolvedAt; }
    public void setResolvedAt(LocalDateTime resolvedAt) { this.resolvedAt = resolvedAt; }

    public LocalDateTime getNextReminderAt() { return nextReminderAt; }
    public void setNextReminderAt(LocalDateTime nextReminderAt) { this.nextReminderAt = nextReminderAt; }

    public int getReminderCount() { return reminderCount; }
    public void setReminderCount(int reminderCount) { this.reminderCount = reminderCount; }

    public int getMaxReminders() { return maxReminders; }
    public void setMaxReminders(int maxReminders) { this.maxReminders = maxReminders; }

    public String getNotificationType() { return notificationType; }
    public void setNotificationType(String notificationType) { this.notificationType = notificationType; }

    public boolean isTest() { return isTest; }
    public void setTest(boolean test) { isTest = test; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
