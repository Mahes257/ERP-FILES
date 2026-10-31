package com.vishatech.erp.config;

import com.vishatech.erp.dto.NotificationRequest;
import com.vishatech.erp.entity.Notification;
import com.vishatech.erp.entity.PurchaseOrder;
import com.vishatech.erp.entity.PurchaseRfq;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.repository.NotificationRepository;
import com.vishatech.erp.repository.PurchaseOrderRepository;
import com.vishatech.erp.repository.PurchaseRfqRepository;
import com.vishatech.erp.repository.UserRepository;
import com.vishatech.erp.service.NotificationService;
import com.vishatech.erp.service.PurchaseNotificationPublisher;
import com.vishatech.erp.service.PurchaseNotificationRulesService;
import com.vishatech.erp.service.PurchaseNotificationRulesService.Rule;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Set;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.logging.Logger;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Purchase notification sweep — the three Purchase events that are CONDITIONS
 * rather than transitions, plus escalation.
 *
 * <p>Everything here is driven by Purchase Settings → Notifications and reuses
 * the existing scheduler infrastructure ({@code @EnableScheduling} is declared
 * by {@link NotificationScheduler}) and the existing notification service. No
 * second reminder engine and no new table.
 *
 * <ol>
 *   <li><b>RFQ deadline approaching</b> — an RFQ whose {@code dueDate} falls
 *       inside the rule's Remind After window and is still open.</li>
 *   <li><b>Delivery overdue</b> — a PO past its delivery (or expected) date that
 *       is not Completed/Cancelled.</li>
 *   <li><b>Escalation</b> — a Purchase notification that is still unresolved
 *       after its rule's Escalate After window is re-raised to the ADMIN role,
 *       once, and only while it stays unresolved.</li>
 * </ol>
 *
 * <p>The first two run only when their rule has been configured (and not
 * disabled): {@code ruleFor} returns {@code null} until the administrator saves
 * the rules, so a fresh installation produces no new notifications from this
 * class. Deduplication lives in the publisher (one notification per
 * module/reference/type/recipient), so a daily scan announces each RFQ/PO once
 * while the reminders keep the event alive.
 */
@Component
public class PurchaseNotificationSweepScheduler {

    private static final Logger log =
            Logger.getLogger(PurchaseNotificationSweepScheduler.class.getName());

    /** RFQ statuses in which a due date is still actionable. */
    private static final Set<String> CLOSED_RFQ_STATUSES =
            Set.of("Awarded", "Closed", "Cancelled", "Rejected");

    /** PO statuses in which a passed delivery date is no longer an issue. */
    private static final Set<String> FINISHED_PO_STATUSES = Set.of("Completed", "Cancelled");

    /** Marker prefix for an escalation notification (dedupe: one per original). */
    private static final String ESCALATION_PREFIX = "PURCHASE_ESCALATED_";

    /**
     * Rows handled per query round-trip, and rounds per detector per run. The
     * candidate queries filter in SQL; a backlog drains over later runs.
     */
    private final int batchSize;
    private final int maxBatches;

    private final PurchaseRfqRepository rfqs;
    private final PurchaseOrderRepository orders;
    private final NotificationRepository notifications;
    private final NotificationService notificationService;
    private final PurchaseNotificationPublisher publisher;
    private final PurchaseNotificationRulesService rules;
    private final UserRepository users;

    public PurchaseNotificationSweepScheduler(PurchaseRfqRepository rfqs,
                                              PurchaseOrderRepository orders,
                                              NotificationRepository notifications,
                                              NotificationService notificationService,
                                              PurchaseNotificationPublisher publisher,
                                              PurchaseNotificationRulesService rules,
                                              UserRepository users,
                                              @Value("${app.notification.sweep-batch-size:200}") int batchSize,
                                              @Value("${app.notification.sweep-max-batches:5}") int maxBatches) {
        this.rfqs = rfqs;
        this.orders = orders;
        this.notifications = notifications;
        this.notificationService = notificationService;
        this.publisher = publisher;
        this.rules = rules;
        this.users = users;
        this.batchSize = Math.max(1, batchSize);
        this.maxBatches = Math.max(1, maxBatches);
    }

    /** Hourly; the per-event windows are days, so the cadence only bounds latency. */
    @Scheduled(fixedDelayString = "${app.purchase.notification-sweep-interval-ms:3600000}")
    public void sweep() {
        try {
            sweepRfqDeadlines();
        } catch (Exception e) {
            log.warning("Purchase RFQ deadline sweep failed: " + e.getMessage());
        }
        try {
            sweepDeliveryOverdue();
        } catch (Exception e) {
            log.warning("Purchase delivery overdue sweep failed: " + e.getMessage());
        }
        try {
            sweepEscalations();
        } catch (Exception e) {
            log.warning("Purchase notification escalation sweep failed: " + e.getMessage());
        }
    }

    // ── RFQ deadline ─────────────────────────────────────────────────────

    private void sweepRfqDeadlines() {
        Rule rule = rules.ruleFor(PurchaseNotificationPublisher.EVENT_RFQ_DEADLINE);
        if (rule == null || !rule.enabled()) {
            return; // not configured / switched off: nothing to announce
        }
        LocalDate today = LocalDate.now();
        LocalDate windowEnd = today.plusDays(Math.max(1, rule.reminderAfter()));
        List<String> closed = List.copyOf(CLOSED_RFQ_STATUSES);
        forEachCandidate(
                page -> rfqs.findDeadlineSweepCandidates(closed, page),
                rfq -> {
                    if (rfq.getStatus() == null || CLOSED_RFQ_STATUSES.contains(rfq.getStatus())) {
                        return;
                    }
                    LocalDate due = parseDate(rfq.getDueDate());
                    if (due == null || due.isBefore(today) || due.isAfter(windowEnd)) {
                        return;
                    }
                    publisher.publish(PurchaseNotificationPublisher.EVENT_RFQ_DEADLINE,
                            "RFQ " + rfq.getRfqNo() + " deadline approaching",
                            "RFQ " + rfq.getRfqNo()
                                    + (rfq.getTitle() == null || rfq.getTitle().isBlank()
                                            ? "" : " (" + rfq.getTitle() + ")")
                                    + " is due on " + due + " and is still " + rfq.getStatus() + ".",
                            rfq.getId(), "PurchaseRfq");
                });
    }

    // ── Delivery overdue ─────────────────────────────────────────────────

    private void sweepDeliveryOverdue() {
        Rule rule = rules.ruleFor(PurchaseNotificationPublisher.EVENT_DELIVERY_OVERDUE);
        if (rule == null || !rule.enabled()) {
            return;
        }
        LocalDate today = LocalDate.now();
        // The rule's Remind After is the grace period after the promised date
        // before the delivery counts as overdue.
        LocalDate deadline = today.minusDays(Math.max(0, rule.reminderAfter()));
        List<String> finished = List.copyOf(FINISHED_PO_STATUSES);
        forEachCandidate(
                page -> orders.findDeliverySweepCandidates(finished, page),
                po -> {
                    if (po.getStatus() == null || FINISHED_PO_STATUSES.contains(po.getStatus())) {
                        return;
                    }
                    LocalDate promised = parseDate(po.getDeliveryDate());
                    if (promised == null) {
                        promised = parseDate(po.getExpectedDate());
                    }
                    if (promised == null || !promised.isBefore(deadline)) {
                        return;
                    }
                    publisher.publish(PurchaseNotificationPublisher.EVENT_DELIVERY_OVERDUE,
                            "PO " + po.getPoNo() + " delivery overdue",
                            "Purchase order " + po.getPoNo() + " (" + po.getVendor() + ") was due on "
                                    + promised + " and is still " + po.getStatus() + ".",
                            po.getId(), "PurchaseOrder",
                            parseDate(po.getDeliveryDate()) == null
                                    ? Notification.Priority.NORMAL : Notification.Priority.HIGH);
                });
    }

    // ── Escalation ───────────────────────────────────────────────────────

    /**
     * Re-raises a still-unresolved Purchase notification to ADMIN once its
     * rule's Escalate After window has passed.
     *
     * <p>The window travels on the notification itself
     * ({@code EVENT#escalateAfter#reminderAfter}, written by the publisher), so
     * this needs no new column and no rule lookup per row: changing the setting
     * affects notifications created after the change, exactly like the reminder
     * schedule. Resolved records stop escalating because resolving is what
     * marks the notification RESOLVED and clears its schedule.
     */
    private void sweepEscalations() {
        List<User> admins = users.findByRoleAndEnabledTrue(UserRole.ADMIN);
        if (admins.isEmpty()) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        // The shortest possible escalation window is one day, so a row created
        // more recently than that can never escalate in this run. This is the
        // indexed range bound; the per-row window is still applied below.
        LocalDateTime cutoff = now.minusDays(1);
        forEachCandidate(
                page -> notifications.findEscalationCandidates(
                        PurchaseNotificationPublisher.MODULE_PURCHASE,
                        Notification.Status.RESOLVED, cutoff, page),
                notification -> {
                    int days = PurchaseNotificationPublisher.escalateAfterDays(
                            notification.getNotificationType());
                    if (days <= 0 || notification.getCreatedAt() == null) {
                        return;
                    }
                    if (!notification.getCreatedAt().isBefore(now.minusDays(days))) {
                        return; // still inside its escalation window
                    }
                    String type = ESCALATION_PREFIX + notification.getId();
                    for (User admin : admins) {
                        if (notifications.existsByModuleAndReferenceIdAndNotificationTypeAndRecipientUserId(
                                PurchaseNotificationPublisher.MODULE_PURCHASE,
                                notification.getReferenceId(), type, admin.getId())) {
                            continue;
                        }
                        try {
                            notificationService.create(new NotificationRequest(
                                    admin.getId(),
                                    truncate("Escalation: " + notification.getTitle(), 200),
                                    "Unresolved for " + days + " day(s): " + notification.getMessage(),
                                    PurchaseNotificationPublisher.MODULE_PURCHASE,
                                    notification.getReferenceId(),
                                    notification.getReferenceType(),
                                    Notification.Priority.URGENT,
                                    type,
                                    false,
                                    0,
                                    null));
                        } catch (Exception e) {
                            log.warning("Purchase escalation skipped [notification=" + notification.getId()
                                    + " recipient=" + admin.getId() + "]: " + e.getMessage());
                        }
                    }
                });
    }

    /** Runs a detector over at most {@code batchSize x maxBatches} candidates. */
    private <T> void forEachCandidate(Function<Pageable, List<T>> loader, Consumer<T> action) {
        for (int round = 0; round < maxBatches; round++) {
            List<T> batch = loader.apply(PageRequest.of(round, batchSize));
            for (T row : batch) {
                action.accept(row);
            }
            if (batch.size() < batchSize) {
                return;
            }
        }
    }

    private static String truncate(String value, int max) {
        if (value == null || value.length() <= max) {
            return value;
        }
        return value.substring(0, max);
    }

    /** ISO date, tolerant of an empty/invalid stored value. */
    private static LocalDate parseDate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(value.length() > 10 ? value.substring(0, 10) : value);
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}
