package com.vishatech.erp.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.vishatech.erp.dto.NotificationRequest;
import com.vishatech.erp.entity.Notification;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.repository.NotificationRepository;
import com.vishatech.erp.repository.UserRepository;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;
import org.springframework.stereotype.Service;

/**
 * Sales notification publisher — the Sales module's adapter over the EXISTING
 * global notification system ({@link NotificationService}: persistence, REST
 * inbox, STOMP push, reminders).
 *
 * <h2>Preferences</h2>
 *
 * The gates are the toggles the Sales Settings page already had
 * ({@code sales_settings.notifications.*}, stored server-side through
 * {@code /settings/sales}, so no new preference store and no new key names):
 *
 * <ul>
 *   <li>{@code quotationPendingApproval} — a quotation is awaiting approval</li>
 *   <li>{@code quotationExpiring} — a sent/submitted quotation is near its
 *       validity date</li>
 *   <li>{@code quotationAccepted} — a quotation was accepted</li>
 *   <li>{@code salesContractPendingApproval} — a contract is awaiting approval</li>
 *   <li>{@code salesOrderPendingApproval} — a customer purchase order is awaiting
 *       approval</li>
 *   <li>{@code invoiceOverdue} — an invoice is past its due date and unpaid</li>
 *   <li>{@code paymentReceived} — a payment receipt was recorded</li>
 *   <li>{@code creditNotePendingApproval} — a credit note is awaiting approval</li>
 * </ul>
 *
 * A toggle that is OFF means the event produces no notification at all; the
 * inbox keeps whatever was already delivered. When the settings document (or a
 * single key) has never been saved, the built-in default of the Settings page is
 * used, so an unconfigured installation behaves exactly like the page shows.
 *
 * <p>{@code emailNotifications} and {@code browserNotifications} are deliberately
 * NOT consulted here: the ERP has no mail transport and no browser Push API
 * subscription — the in-app inbox plus the WebSocket push <em>is</em> the
 * supported delivery channel, and silencing it from a preference would delete
 * the event from the inbox rather than change how it is delivered.
 *
 * <h2>Recipients</h2>
 *
 * Sales work is actioned by the roles holding the Sales authorities —
 * {@code SALES_APPROVE} for approvals and {@code SALES_VIEW} for the
 * informational events — which in this ERP is ADMIN and MANAGER. Recipients are
 * never taken from request input.
 *
 * <h2>Deduplication</h2>
 *
 * One notification per (module, reference, event, recipient). Re-detecting the
 * same pending record on a later sweep never re-notifies the same user, and a
 * resolved record simply stops being detected.
 */
@Service
public class SalesNotificationPublisher {

    /** Stable event discriminators — also the notificationType stored on the row. */
    public static final String EVENT_QUOTATION_PENDING = "QUOTATION_PENDING_APPROVAL";
    public static final String EVENT_QUOTATION_EXPIRING = "QUOTATION_EXPIRING";
    public static final String EVENT_QUOTATION_ACCEPTED = "QUOTATION_ACCEPTED";
    public static final String EVENT_CONTRACT_PENDING = "SALES_CONTRACT_PENDING_APPROVAL";
    public static final String EVENT_ORDER_PENDING = "CPO_PENDING_APPROVAL";
    public static final String EVENT_INVOICE_OVERDUE = "INVOICE_OVERDUE";
    public static final String EVENT_PAYMENT_RECEIVED = "PAYMENT_RECEIVED";
    public static final String EVENT_CREDIT_NOTE_PENDING = "CREDIT_NOTE_PENDING_APPROVAL";

    public static final String MODULE_SALES = "SALES";

    /**
     * The Sales Settings notification preference each event answers to.
     *
     * <p>An event with no entry here (there is none today) would be always-on,
     * because every event in this class has a real toggle on the page.
     */
    private static final Map<String, String> PREFERENCES = Map.of(
            EVENT_QUOTATION_PENDING, "quotationPendingApproval",
            EVENT_QUOTATION_EXPIRING, "quotationExpiring",
            EVENT_QUOTATION_ACCEPTED, "quotationAccepted",
            EVENT_CONTRACT_PENDING, "salesContractPendingApproval",
            EVENT_ORDER_PENDING, "salesOrderPendingApproval",
            EVENT_INVOICE_OVERDUE, "invoiceOverdue",
            EVENT_PAYMENT_RECEIVED, "paymentReceived",
            EVENT_CREDIT_NOTE_PENDING, "creditNotePendingApproval");

    /** The Settings page defaults, used until the document is saved. */
    private static final Map<String, Boolean> DEFAULTS = Map.of(
            "quotationPendingApproval", true,
            "quotationExpiring", true,
            "quotationAccepted", true,
            "salesContractPendingApproval", true,
            "salesOrderPendingApproval", false,
            "invoiceOverdue", true,
            "paymentReceived", true,
            "creditNotePendingApproval", true);

    private static final Logger log = Logger.getLogger(SalesNotificationPublisher.class.getName());

    private final NotificationService notificationService;
    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final SalesSettingsService salesSettingsService;

    public SalesNotificationPublisher(NotificationService notificationService,
                                      NotificationRepository notificationRepository,
                                      UserRepository userRepository,
                                      SalesSettingsService salesSettingsService) {
        this.notificationService = notificationService;
        this.notificationRepository = notificationRepository;
        this.userRepository = userRepository;
        this.salesSettingsService = salesSettingsService;
    }

    /** Whether the Sales Settings toggle for an event is on. */
    public boolean isEnabled(String eventType) {
        String preference = PREFERENCES.get(eventType);
        if (preference == null) {
            return true;
        }
        Boolean fallback = DEFAULTS.getOrDefault(preference, Boolean.TRUE);
        try {
            JsonNode settings = salesSettingsService.getSettings();
            JsonNode notifications = settings == null ? null : settings.get("notifications");
            if (notifications == null || notifications.isNull()) {
                return fallback;
            }
            JsonNode value = notifications.get(preference);
            return value == null || value.isNull() ? fallback : value.asBoolean(fallback);
        } catch (Exception e) {
            // A settings read failure must never swallow a workflow event, and it
            // must not silently mute it either: fall back to the page default.
            log.warning("Sales notification preference lookup failed [event=" + eventType + "]: "
                    + e.getMessage());
            return fallback;
        }
    }

    /**
     * Publishes an event to the Sales roles when its preference is on.
     *
     * @return true when a notification was actually created for at least one
     *         recipient (used by callers/tests to tell "off" from "delivered")
     */
    public boolean publish(String eventType, String title, String message,
                           Long referenceId, String referenceType) {
        return publish(eventType, title, message, referenceId, referenceType,
                Notification.Priority.NORMAL);
    }

    public boolean publish(String eventType, String title, String message,
                           Long referenceId, String referenceType,
                           Notification.Priority priority) {
        if (!isEnabled(eventType)) {
            return false;
        }
        List<User> recipients = userRepository.findByRoleInAndEnabledTrue(
                List.of(UserRole.ADMIN, UserRole.MANAGER));
        boolean created = false;
        for (User recipient : recipients) {
            try {
                if (notificationRepository.existsByModuleAndReferenceIdAndNotificationTypeAndRecipientUserId(
                        MODULE_SALES, referenceId, eventType, recipient.getId())) {
                    continue;
                }
                notificationService.create(new NotificationRequest(
                        recipient.getId(),
                        truncate(title, 200),
                        truncate(message, 2000),
                        MODULE_SALES,
                        referenceId,
                        referenceType,
                        priority,
                        eventType,
                        false,
                        0,
                        null));
                created = true;
            } catch (Exception e) {
                // Notifications are best effort — never fail the business action.
                log.warning("Sales notification skipped [event=" + eventType
                        + " recipient=" + recipient.getId() + "]: " + e.getMessage());
            }
        }
        return created;
    }

    private static String truncate(String value, int max) {
        if (value == null || value.length() <= max) {
            return value;
        }
        return value.substring(0, max);
    }
}
