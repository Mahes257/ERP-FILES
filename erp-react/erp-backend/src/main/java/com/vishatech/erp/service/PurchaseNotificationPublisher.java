package com.vishatech.erp.service;

import com.vishatech.erp.dto.NotificationRequest;
import com.vishatech.erp.entity.Notification;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.repository.NotificationRepository;
import com.vishatech.erp.repository.UserRepository;
import com.vishatech.erp.service.PurchaseNotificationRulesService.Rule;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.logging.Logger;
import org.springframework.stereotype.Service;

/**
 * Purchase notification publisher — a thin adapter over the EXISTING
 * {@link NotificationService} (which persists to the notifications table
 * and pushes over the existing STOMP/WebSocket user queue).
 *
 * NOTHING new is invented: no second notification system, no second
 * WebSocket broker. Every Purchase workflow event funnels through
 * NotificationService.create so notifications stay user-targeted,
 * auditable, reminder-capable, and reachable by both the REST
 * NotificationController and the live WebSocket push.
 *
 * <h2>Settings integration</h2>
 *
 * The event → recipient/reminder/escalation decision now comes from
 * Purchase Settings → Notifications ({@link PurchaseNotificationRulesService}),
 * which the settings page mirrors into {@code app_settings}:
 *
 * <ul>
 *   <li><b>Enabled OFF</b> — the event produces no notification at all (and no
 *       reminder). Checked first, before any recipient lookup.</li>
 *   <li><b>Recipient</b> — the rule's role label is resolved to real account
 *       roles (Approver → ADMIN + MANAGER, the roles holding
 *       {@code PURCHASE_APPROVE}; Buyer/Logistics/Quality → those plus USER,
 *       who holds {@code PURCHASE_VIEW}). An unrecognised label falls back to
 *       the event's built-in recipients rather than silently notifying
 *       everybody.</li>
 *   <li><b>Remind After</b> — the notification is created with its first
 *       reminder scheduled that many days out and a reminder budget derived
 *       from Repeat; the shared {@code NotificationScheduler} then delivers
 *       them, and resolving the record clears the schedule (existing
 *       behaviour).</li>
 *   <li><b>Escalate After</b> — recorded on the notification type so
 *       {@link PurchaseNotificationSweepScheduler} can escalate an event that
 *       is still unresolved after that window.</li>
 * </ul>
 *
 * <p>With no stored rules the publisher behaves exactly as before (same
 * recipients, no reminders): the integration can only narrow or redirect, never
 * invent an event.
 */
@Service
public class PurchaseNotificationPublisher {

    /** Event type constants — one per Purchase workflow trigger. */
    public static final String EVENT_PR_SUBMITTED = "PR_SUBMITTED";
    public static final String EVENT_PR_APPROVED = "PR_APPROVED";
    public static final String EVENT_PR_REJECTED = "PR_REJECTED";
    public static final String EVENT_RFQ_CREATED = "RFQ_CREATED";
    public static final String EVENT_RFQ_DEADLINE = "RFQ_DEADLINE";
    public static final String EVENT_QUOTATION_RECEIVED = "QUOTATION_RECEIVED";
    public static final String EVENT_RFQ_AWARDED = "RFQ_AWARDED";
    public static final String EVENT_PO_SUBMITTED = "PO_SUBMITTED";
    public static final String EVENT_PO_APPROVED = "PO_APPROVED";
    public static final String EVENT_PO_REJECTED = "PO_REJECTED";
    public static final String EVENT_PO_RELEASED = "PO_RELEASED";
    public static final String EVENT_SUPPLIER_ACKNOWLEDGEMENT = "SUPPLIER_ACKNOWLEDGEMENT";
    public static final String EVENT_GRN_PENDING = "GRN_PENDING";
    public static final String EVENT_INSPECTION_PENDING = "INSPECTION_PENDING";
    public static final String EVENT_DELIVERY_OVERDUE = "DELIVERY_OVERDUE";
    public static final String EVENT_INVOICE_SUBMITTED = "INVOICE_SUBMITTED";
    public static final String EVENT_INVOICE_MISMATCH = "INVOICE_MISMATCH";
    public static final String EVENT_INVOICE_APPROVAL = "INVOICE_APPROVAL";
    public static final String EVENT_PAYMENT_DUE = "PAYMENT_DUE";
    public static final String EVENT_PAYMENT_OVERDUE = "PAYMENT_OVERDUE";

    public static final String MODULE_PURCHASE = "PURCHASE";

    /**
     * Marker suffix written into {@code notificationType} for events whose rule
     * set an escalation window. {@code EVENT#escalateAfter#reminderAfter} — the
     * sweep reads it back without a new column or migration.
     */
    public static final String TYPE_SEPARATOR = "#";

    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    private static final Logger log = Logger.getLogger(PurchaseNotificationPublisher.class.getName());

    private final NotificationService notificationService;
    private final UserRepository userRepository;
    private final NotificationRepository notificationRepository;
    private final PurchaseNotificationRulesService rulesService;

    public PurchaseNotificationPublisher(NotificationService notificationService,
                                         UserRepository userRepository,
                                         NotificationRepository notificationRepository,
                                         PurchaseNotificationRulesService rulesService) {
        this.notificationService = notificationService;
        this.userRepository = userRepository;
        this.notificationRepository = notificationRepository;
        this.rulesService = rulesService;
    }

    /**
     * Publishes a Purchase notification to every enabled user whose role
     * should act on the event. Sender is resolved inside
     * NotificationService from the SecurityContext (never from input);
     * when no security context exists (scheduler) the notification is
     * persisted as system-generated with senderUserId = null.
     */
    public void publish(String eventType, String title, String message,
                        Long referenceId, String referenceType) {
        publish(eventType, title, message, referenceId, referenceType,
                Notification.Priority.NORMAL);
    }

    public void publish(String eventType, String title, String message,
                        Long referenceId, String referenceType,
                        Notification.Priority priority) {
        Rule rule;
        try {
            rule = rulesService.ruleFor(eventType);
        } catch (Exception e) {
            // A configuration read failure must never swallow a workflow event.
            log.warning("Purchase notification rule lookup failed [event=" + eventType + "]: "
                    + e.getMessage());
            rule = null;
        }
        if (rule != null && !rule.enabled()) {
            // Settings → Notifications: the event is switched OFF. No recipient
            // is notified and no reminder is scheduled.
            return;
        }

        List<User> recipients = recipientsFor(eventType, rule);
        String notificationType = typedEvent(eventType, rule);
        LocalDateTime firstReminderAt = firstReminderAt(rule);
        Integer maxReminders = rule == null ? null : rule.maxReminders();

        for (User recipient : recipients) {
            try {
                /*
                 * Deduplication guard — one notification per
                 * (module, reference, event, recipient). A repeated
                 * submit / transition / resave of the same document never
                 * re-notifies the same user for the same event, and neither does
                 * changing the rule's escalation/reminder window (the match is on
                 * the base event type, so the typed variant a saved rule produces
                 * is recognised as the same event).
                 */
                if (notificationRepository.existsEventForRecipient(
                        MODULE_PURCHASE, referenceId, eventType, recipient.getId())) {
                    continue;
                }
                notificationService.create(new NotificationRequest(
                        recipient.getId(),
                        truncate(title, 200),
                        message,
                        MODULE_PURCHASE,
                        referenceId,
                        referenceType,
                        priority,
                        notificationType,
                        false,
                        maxReminders,
                        firstReminderAt == null ? null : firstReminderAt.format(ISO)));
            } catch (Exception e) {
                // A notification failure must never break the business
                // transaction — same policy as NotificationService's
                // WebSocket push.
                log.warning("Purchase notification skipped [event=" + eventType
                        + " recipient=" + recipient.getId() + "]: " + e.getMessage());
            }
        }
    }

    /**
     * The stored notification type for an event.
     *
     * <p>Plain event type when the rule sets no escalation window (so the
     * existing dedup semantics are unchanged); otherwise
     * {@code EVENT#escalateAfter#reminderAfter}, which the sweep parses. The
     * value stays well inside the 40-character column (longest event type is 25).
     */
    public static String typedEvent(String eventType, Rule rule) {
        if (rule == null || rule.escalateAfter() <= 0) {
            return eventType;
        }
        return eventType + TYPE_SEPARATOR + rule.escalateAfter() + TYPE_SEPARATOR + rule.reminderAfter();
    }

    /** The event type without its escalation marker. */
    public static String baseEvent(String notificationType) {
        if (notificationType == null) {
            return null;
        }
        int at = notificationType.indexOf(TYPE_SEPARATOR);
        return at < 0 ? notificationType : notificationType.substring(0, at);
    }

    /** Escalation window in days for a stored notification type (0 = none). */
    public static int escalateAfterDays(String notificationType) {
        if (notificationType == null) {
            return 0;
        }
        String[] parts = notificationType.split(TYPE_SEPARATOR);
        if (parts.length < 2) {
            return 0;
        }
        try {
            return Integer.parseInt(parts[1]);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /** First reminder time for a rule (null when the rule sets none). */
    private static LocalDateTime firstReminderAt(Rule rule) {
        if (rule == null || rule.maxReminders() <= 0) {
            return null;
        }
        return LocalDateTime.now().plusDays(rule.reminderAfter());
    }

    /** Recipients for an event: the rule's roles when known, else the event default. */
    private List<User> recipientsFor(String eventType, Rule rule) {
        List<UserRole> ruleRoles = rule == null ? null : rule.roles();
        if (ruleRoles != null && !ruleRoles.isEmpty()) {
            return userRepository.findByRoleInAndEnabledTrue(ruleRoles);
        }
        return defaultRecipients(eventType);
    }

    /** Recipients for an event, by role. Empty list = nobody to notify. */
    private List<User> defaultRecipients(String eventType) {
        UserRole approverRole = switch (eventType) {
            case EVENT_PR_SUBMITTED, EVENT_PR_APPROVED, EVENT_PR_REJECTED,
                 EVENT_RFQ_CREATED, EVENT_RFQ_DEADLINE, EVENT_QUOTATION_RECEIVED, EVENT_RFQ_AWARDED,
                 EVENT_PO_SUBMITTED, EVENT_PO_APPROVED, EVENT_PO_REJECTED, EVENT_PO_RELEASED,
                 EVENT_DELIVERY_OVERDUE, EVENT_INVOICE_SUBMITTED, EVENT_INVOICE_MISMATCH,
                 EVENT_INVOICE_APPROVAL, EVENT_PAYMENT_DUE, EVENT_PAYMENT_OVERDUE -> UserRole.ADMIN;
            // Supplier acknowledgement, goods receipt and inspection are
            // operations work: the Purchase roles handle them.
            case EVENT_SUPPLIER_ACKNOWLEDGEMENT, EVENT_GRN_PENDING, EVENT_INSPECTION_PENDING -> null;
            default -> UserRole.ADMIN;
        };
        if (approverRole != null) {
            return userRepository.findByRoleAndEnabledTrue(approverRole);
        }
        /* Logistics-facing events go to the Purchase operations roles
           (ADMIN + MANAGER — the roles holding PURCHASE_VIEW/APPROVE),
           never to every user in the system. */
        return userRepository.findByRoleInAndEnabledTrue(List.of(UserRole.ADMIN, UserRole.MANAGER));
    }

    private String truncate(String value, int max) {
        if (value == null || value.length() <= max) {
            return value;
        }
        return value.substring(0, max);
    }
}
