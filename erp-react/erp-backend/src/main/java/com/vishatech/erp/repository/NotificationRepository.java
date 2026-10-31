package com.vishatech.erp.repository;

import com.vishatech.erp.entity.Notification;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    /** Count unread notifications for a user. */
    long countByRecipientUserIdAndStatus(Long recipientUserId, Notification.Status status);

    /** List notifications for a user, newest first. */
    List<Notification> findByRecipientUserIdOrderByCreatedAtDesc(Long recipientUserId);

    /**
     * One page of a user's inbox, newest first. Served by
     * {@code idx_notif_recipient_created} (recipient_user_id, created_at) so the
     * query does not sort the user's whole inbox on every poll.
     */
    org.springframework.data.domain.Page<Notification> findByRecipientUserIdOrderByCreatedAtDesc(
            Long recipientUserId, Pageable pageable);

    /** Total inbox rows for a user (the pagination total). */
    long countByRecipientUserId(Long recipientUserId);

    /**
     * Ids of the notifications that may be due for a reminder right now.
     *
     * <p>Deliberately returns ids, not entities: the caller only needs to know
     * which rows to try, and it re-reads each one after claiming it, so no stale
     * entity can be written back over the claim.
     *
     * <p>The range is served by {@code idx_notif_reminder} (nextReminderAt) and
     * is kept small by two invariants: the schedule is cleared once a
     * notification can no longer fire (resolved, or its reminder budget spent —
     * see {@code NotificationService}), so an exhausted notification never
     * re-enters this range. Rows are ordered oldest-due-first so a backlog is
     * drained fairly, and the caller bounds the work per run with the page size.
     */
    @Query("""
            SELECT n.id FROM Notification n
            WHERE n.nextReminderAt IS NOT NULL
              AND n.nextReminderAt <= :now
              AND n.status <> 'RESOLVED'
              AND n.reminderCount < n.maxReminders
            ORDER BY n.nextReminderAt ASC
            """)
    List<Long> findDueReminderIds(@Param("now") LocalDateTime now, Pageable pageable);

    /**
     * Claims one due reminder by spending a reminder from its budget.
     *
     * <p>Returns 1 when this caller owns the reminder and 0 when it does not —
     * the notification was resolved, its budget is spent, or another scheduler
     * instance already claimed it (the row lock is held until that transaction
     * commits, after which the re-evaluated predicate no longer matches because
     * {@code nextReminderAt} has moved on). The claim is what prevents the same
     * reminder from being fired twice.
     *
     * <p>The caller must not have a managed {@code Notification} for {@code id}
     * loaded before calling this (the bulk update bypasses the persistence
     * context); {@code flushAutomatically}/{@code clearAutomatically} keep the
     * context from holding stale state around it.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            UPDATE Notification n
               SET n.reminderCount = n.reminderCount + 1
             WHERE n.id = :id
               AND n.nextReminderAt IS NOT NULL
               AND n.nextReminderAt <= :now
               AND n.status <> 'RESOLVED'
               AND n.reminderCount < n.maxReminders
            """)
    int claimReminder(@Param("id") Long id, @Param("now") LocalDateTime now);

    /** Find all test notifications (for cleanup — includes resolved reminders). */
    List<Notification> findByIsTestTrue();

    /**
     * Open notifications of one module created before a cutoff, oldest first and
     * paged — the escalation sweep's bounded candidate feed. The cutoff is the
     * shortest configured escalation window, so a page never contains a row
     * that cannot escalate yet.
     */
    @Query("SELECT n FROM Notification n "
            + "WHERE n.module = :module AND n.status <> :status AND n.createdAt < :before "
            + "ORDER BY n.createdAt ASC")
    List<Notification> findEscalationCandidates(@Param("module") String module,
                                                @Param("status") Notification.Status status,
                                                @Param("before") LocalDateTime before,
                                                Pageable pageable);

    /**
     * Deduplication guard for workflow event notifications: true when a
     * notification for this (module, reference, type, recipient) already
     * exists, so repeated workflow operations never duplicate them.
     */
    boolean existsByModuleAndReferenceIdAndNotificationTypeAndRecipientUserId(
            String module, Long referenceId, String notificationType, Long recipientUserId);

    /**
     * Deduplication guard keyed on the BASE event type.
     *
     * <p>The escalation window travels on the stored type
     * ({@code EVENT#escalateAfter#reminderAfter}, see
     * {@code PurchaseNotificationPublisher}), so a plain exact-type match would
     * treat the same event as new after an administrator changed Escalate After
     * and notify the recipient twice. This matches the base type and every typed
     * variant of it, so a settings change never re-announces an event that was
     * already announced — and changing the window still applies to the events
     * created afterwards.
     */
    @Query("""
            SELECT COUNT(n) > 0 FROM Notification n
            WHERE n.module = :module
              AND n.referenceId = :referenceId
              AND n.recipientUserId = :recipientUserId
              AND (n.notificationType = :eventType
                   OR n.notificationType LIKE CONCAT(:eventType, '#%'))
            """)
    boolean existsEventForRecipient(@Param("module") String module,
                                    @Param("referenceId") Long referenceId,
                                    @Param("eventType") String eventType,
                                    @Param("recipientUserId") Long recipientUserId);
}
