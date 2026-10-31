package com.vishatech.erp.service;

import com.vishatech.erp.dto.NotificationRequest;
import com.vishatech.erp.dto.NotificationResponse;
import com.vishatech.erp.entity.Notification;
import com.vishatech.erp.entity.Notification.Status;
import com.vishatech.erp.repository.NotificationRepository;
import com.vishatech.erp.util.AuditContext;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.logging.Logger;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Notification service — CRUD lifecycle, read/resolve actions, reminder
 * scheduling, and WebSocket push.
 *
 * SECURITY: all queries are scoped to the authenticated user via AuditContext.
 * The sender is always derived from the SecurityContext, never from the request.
 */
@Service
public class NotificationService {

    private static final Logger log = Logger.getLogger(NotificationService.class.getName());

    private final NotificationRepository notificationRepo;
    private final AuditContext auditContext;
    private final SimpMessagingTemplate wsTemplate;

    /**
     * Reminders fired per scheduler run. Bounds the rows, the reminder inserts
     * and the WebSocket pushes of a single run; a backlog simply drains over the
     * following runs, oldest due first.
     */
    private final int reminderBatchSize;

    /** Page size used when the caller does not ask for one, and the hard cap. */
    private final int defaultListSize;
    private final int maxListSize;

    public NotificationService(NotificationRepository notificationRepo,
                               AuditContext auditContext,
                               SimpMessagingTemplate wsTemplate,
                               @Value("${app.notification.reminder-batch-size:200}") int reminderBatchSize,
                               @Value("${app.notification.list-default-size:100}") int defaultListSize,
                               @Value("${app.notification.list-max-size:500}") int maxListSize) {
        this.notificationRepo = notificationRepo;
        this.auditContext = auditContext;
        this.wsTemplate = wsTemplate;
        this.reminderBatchSize = Math.max(1, reminderBatchSize);
        this.maxListSize = Math.max(1, maxListSize);
        this.defaultListSize = Math.min(Math.max(1, defaultListSize), this.maxListSize);
    }

    // ---- CREATE ----

    @Transactional
    public NotificationResponse create(NotificationRequest req) {
        Long senderId = auditContext.currentUserId();

        Notification n = new Notification();
        n.setRecipientUserId(req.recipientUserId());
        n.setSenderUserId(senderId);
        n.setTitle(req.title());
        n.setMessage(req.message());
        n.setModule(req.module() != null ? req.module() : "GENERAL");
        n.setReferenceId(req.referenceId());
        n.setReferenceType(req.referenceType());
        n.setPriority(req.priority() != null ? req.priority() : Notification.Priority.NORMAL);
        n.setStatus(Status.UNREAD);
        n.setNotificationType(req.notificationType());
        n.setTest(req.isTest());

        int maxReminders = req.maxReminders() != null ? req.maxReminders() : 0;
        n.setMaxReminders(maxReminders);

        // Schedule first reminder if provided (test mode uses short intervals).
        // A budget of 0 means no reminder can ever fire, so nothing is scheduled:
        // otherwise the row would sit in the scheduler's index range for good.
        if (req.firstReminderAt() != null && !req.firstReminderAt().isBlank()) {
            if (maxReminders <= 0) {
                log.warning("firstReminderAt ignored: maxReminders is 0, so no reminder can fire.");
            } else {
                try {
                    LocalDateTime reminderTime = LocalDateTime.parse(req.firstReminderAt(), DateTimeFormatter.ISO_LOCAL_DATE_TIME);
                    n.setNextReminderAt(reminderTime);
                } catch (DateTimeParseException e) {
                    log.warning("Invalid firstReminderAt format: " + req.firstReminderAt());
                }
            }
        }

        notificationRepo.save(n);
        log.info("Notification created [id=" + n.getId() + "] recipient=" + n.getRecipientUserId()
                + " module=" + n.getModule() + " test=" + n.isTest());

        // Push via WebSocket to the recipient.
        pushToUser(n.getRecipientUserId(), n);

        return NotificationResponse.fromEntity(n);
    }

    // ---- LIST (user-scoped) ----

    /**
     * One bounded page of the authenticated user's inbox, newest first.
     *
     * <p>The response is still a plain array so every existing consumer keeps
     * working; the caller can page with {@code ?page=&size=}. A negative page is
     * clamped to 0 and a size above the configured cap is clamped to it, so a
     * client cannot ask the server to load an unbounded inbox.
     */
    @Transactional(readOnly = true)
    public NotificationPage listForCurrentUser(Integer page, Integer size) {
        Long userId = auditContext.currentUserId();
        int safePage = page == null ? 0 : Math.max(0, page);
        int safeSize = size == null ? defaultListSize : Math.min(Math.max(1, size), maxListSize);
        var result = notificationRepo.findByRecipientUserIdOrderByCreatedAtDesc(
                userId, PageRequest.of(safePage, safeSize));
        List<NotificationResponse> items = result.getContent().stream()
                .map(NotificationResponse::fromEntity)
                .toList();
        return new NotificationPage(items, result.getTotalElements(), safePage, safeSize);
    }

    /** A page of inbox items plus the totals needed by a paging client. */
    public record NotificationPage(List<NotificationResponse> items, long totalElements,
                                   int page, int size) {
    }

    // ---- UNREAD COUNT ----

    @Transactional(readOnly = true)
    public long unreadCount() {
        Long userId = auditContext.currentUserId();
        return notificationRepo.countByRecipientUserIdAndStatus(userId, Status.UNREAD);
    }

    // ---- MARK AS READ ----

    @Transactional
    public NotificationResponse markAsRead(Long notificationId) {
        Long userId = auditContext.currentUserId();
        Notification n = notificationRepo.findById(notificationId)
                .orElseThrow(() -> new IllegalArgumentException("Notification not found: " + notificationId));

        if (!n.getRecipientUserId().equals(userId)) {
            throw new AccessDeniedException("Cannot read another user's notification");
        }

        if (n.getStatus() == Status.UNREAD) {
            n.setStatus(Status.READ);
            n.setReadAt(LocalDateTime.now());
            notificationRepo.save(n);
            log.info("Notification marked read [id=" + n.getId() + "] user=" + userId);
        }

        return NotificationResponse.fromEntity(n);
    }

    // ---- RESOLVE ----

    @Transactional
    public NotificationResponse resolve(Long notificationId) {
        Long userId = auditContext.currentUserId();
        Notification n = notificationRepo.findById(notificationId)
                .orElseThrow(() -> new IllegalArgumentException("Notification not found: " + notificationId));

        if (!n.getRecipientUserId().equals(userId)) {
            throw new AccessDeniedException("Cannot resolve another user's notification");
        }

        n.setStatus(Status.RESOLVED);
        n.setResolvedAt(LocalDateTime.now());
        n.setNextReminderAt(null); // Cancel pending reminders.
        notificationRepo.save(n);
        log.info("Notification resolved [id=" + n.getId() + "] user=" + userId);

        return NotificationResponse.fromEntity(n);
    }

    // ---- REMINDERS (called by scheduler) ----

    /**
     * Fires every reminder that is due right now.
     *
     * <p>Bounded work per run: only the oldest-due reminders (up to
     * {@code app.notification.reminder-batch-size}) are considered, and each one
     * is CLAIMED atomically before anything is created, so a reminder can never
     * be fired twice — not by a repeated run, and not by a second application
     * instance evaluating the same candidate list.
     *
     * <p>Reminder semantics are unchanged: the same eligibility rule
     * ({@code status <> RESOLVED}, a schedule in the past, and a remaining
     * reminder budget), the same reminder notification contents, the same
     * per-reminder interval (30s for test reminders, 2 hours otherwise) and the
     * same WebSocket push. The only added behaviour is that the schedule is
     * cleared once a notification can no longer fire, so exhausted notifications
     * leave the scheduler's index range instead of being re-filtered forever.
     *
     * @return how many reminders were fired by this run
     */
    @Transactional
    public int processReminders() {
        LocalDateTime now = LocalDateTime.now();
        List<Long> due = notificationRepo.findDueReminderIds(now, PageRequest.of(0, reminderBatchSize));
        int fired = 0;

        for (Long id : due) {
            // Claim first: 0 rows means resolved / budget spent / already fired
            // by another run or instance, so this candidate is skipped.
            if (notificationRepo.claimReminder(id, now) == 0) {
                continue;
            }

            Notification n = notificationRepo.findById(id).orElse(null);
            if (n == null) {
                continue;
            }

            // Create a reminder notification (linked to the original).
            Notification reminder = new Notification();
            reminder.setRecipientUserId(n.getRecipientUserId());
            reminder.setSenderUserId(null); // System-generated.
            reminder.setTitle("Reminder: " + n.getTitle());
            reminder.setMessage("Reminder #" + n.getReminderCount() + " — " + n.getMessage());
            reminder.setModule(n.getModule());
            reminder.setReferenceId(n.getReferenceId());
            reminder.setReferenceType(n.getReferenceType());
            reminder.setPriority(n.getPriority());
            reminder.setStatus(Status.UNREAD);
            reminder.setNotificationType(n.getNotificationType());
            reminder.setTest(n.isTest());
            notificationRepo.save(reminder);

            // Schedule the next reminder (30 seconds for test, 2 hours for
            // production) — or clear the schedule when the budget is spent, so
            // the scheduler stops scanning a notification that cannot fire again.
            boolean isTestReminder = "TEST_SALES".equals(n.getNotificationType()) || n.isTest();
            int intervalSeconds = isTestReminder ? 30 : 7200;
            n.setNextReminderAt(n.getReminderCount() >= n.getMaxReminders()
                    ? null
                    : now.plusSeconds(intervalSeconds));

            notificationRepo.save(n);

            log.info("Reminder sent [originalId=" + n.getId() + " reminderId=" + reminder.getId()
                    + " count=" + n.getReminderCount() + "]");

            // Push the reminder via WebSocket.
            pushToUser(reminder.getRecipientUserId(), reminder);
            fired++;
        }

        return fired;
    }

    // ---- CLEANUP (test only) ----

    @Transactional
    public int cleanupTestNotifications() {
        List<Notification> tests = notificationRepo.findByIsTestTrue();
        int count = tests.size();
        notificationRepo.deleteAll(tests);
        log.info("Cleaned up " + count + " test notifications");
        return count;
    }

    // ---- WEBSOCKET PUSH ----

    private void pushToUser(Long userId, Notification notification) {
        try {
            // The destination part must carry the broker prefix: Spring resolves
            // convertAndSendToUser(user, "/queue/notifications", …) to
            // "/queue/notifications-user{sessionId}", which is exactly what the
            // client's "/user/queue/notifications" subscription maps to and what
            // the simple broker ("/queue", "/topic") routes. Without the
            // "/queue" segment the resolver targets "/notifications-user{sessionId}",
            // which matches no subscription and no broker prefix, so the push was
            // silently dropped even though the push itself succeeded.
            wsTemplate.convertAndSendToUser(
                    String.valueOf(userId),
                    "/queue/notifications",
                    NotificationResponse.fromEntity(notification)
            );
        } catch (Exception e) {
            // WebSocket may not be connected — that's OK for REST-only testing.
            log.fine("WebSocket push skipped (user may not be connected): " + e.getMessage());
        }
    }
}
