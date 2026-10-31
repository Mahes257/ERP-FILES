package com.vishatech.erp.service.production;

import com.vishatech.erp.entity.production.OrderStatus;
import com.vishatech.erp.entity.production.ProductionOrder;
import com.vishatech.erp.notification.NotificationEvent;
import com.vishatech.erp.notification.NotificationPort;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;
import org.springframework.stereotype.Component;

/**
 * Production notification publisher — the Production module's adapter over the
 * EXISTING global notification system ({@link NotificationPort}: same
 * {@code notifications} table, same inbox, same WebSocket push, same
 * read/unread lifecycle).
 *
 * <p>Nothing is stored twice and no second notification mechanism exists: this
 * class only decides <em>whether</em> an event is delivered and <em>to whom</em>.
 *
 * <h2>Preferences</h2>
 *
 * Every event below is answered by one toggle on
 * Production Settings → Notifications, persisted through
 * {@link ProductionSettingsService#isNotificationEnabled(String)}. A toggle that
 * is OFF means the event produces no notification at all; already-delivered
 * notifications stay in the inbox. An event with no toggle would be always-on —
 * there is none, because every key in
 * {@link ProductionSettingsService#NOTIFICATION_DEFAULTS} has a real workflow
 * transition behind it.
 *
 * <h2>Events</h2>
 *
 * The keys are stable, short discriminators (the {@code notificationType}
 * column is 40 characters) and are the deduplication identity of the event:
 *
 * <pre>
 *   Work order   WO_SUBMITTED · WO_ADMIN_SUBMITTED · WO_APPROVED · WO_REJECTED
 *                WO_RELEASED · WO_STARTED · WO_HOLD · WO_QC · WO_COMPLETED
 *                WO_FAILED · WO_CANCELLED
 *   Verification TV_PENDING · TV_APPROVED · TV_REJECTED
 *   Drawings     DWG_PENDING · DWG_APPROVED · DWG_REJECTED
 *   Models       MDL_PENDING · MDL_APPROVED · MDL_REJECTED
 *   Quality      QC_PENDING · QC_PASSED · QC_FAILED · QC_HOLD
 *   Packing      PACK_PENDING · PACK_COMPLETED
 *   Dispatch     DISP_PENDING · DISP_COMPLETED
 * </pre>
 *
 * <h2>Deduplication</h2>
 *
 * One notification per (module, record, event <em>occurrence</em>, recipient).
 * Where the workflow can legitimately repeat an event on the same record (a work
 * order re-submitted after rejection, a verification re-done after a rejection)
 * the caller passes an {@code occurrence} discriminator — the id of the history
 * row it just wrote, or the transition timestamp — so a replayed publish is
 * suppressed while a genuinely new occurrence still notifies.
 *
 * <h2>Recipients</h2>
 *
 * Approval-stage events go to the roles that actually hold
 * {@code PRODUCTION_APPROVE} (ADMIN, MANAGER — see {@code RolePermissions}), so a
 * notification never asks someone who cannot act on it. Progress events go to
 * every role that holds {@code PRODUCTION_VIEW}. Recipients are never taken from
 * request input.
 *
 * <p>Publishing is best effort and never fails the business transition.
 */
@Component
public class ProductionNotificationPublisher {

    private static final Logger log = Logger.getLogger(ProductionNotificationPublisher.class.getName());

    public static final String MODULE = "PRODUCTION";

    /** Reference types — must match the click-through routes in the inbox. */
    public static final String REF_ORDER = "ProductionOrder";
    public static final String REF_TV = "TechnicalVerification";
    public static final String REF_DRAWING = "Drawing";
    public static final String REF_MODEL = "Model";
    public static final String REF_QUALITY = "QualityInspection";
    public static final String REF_PACKING = "PackingList";
    public static final String REF_DISPATCH = "Dispatch";

    // ---- Work order events -------------------------------------------------
    public static final String WO_SUBMITTED = "WO_SUBMITTED";
    public static final String WO_ADMIN_SUBMITTED = "WO_ADMIN_SUBMITTED";
    public static final String WO_APPROVED = "WO_APPROVED";
    public static final String WO_REJECTED = "WO_REJECTED";
    public static final String WO_RELEASED = "WO_RELEASED";
    public static final String WO_STARTED = "WO_STARTED";
    public static final String WO_HOLD = "WO_HOLD";
    public static final String WO_QC = "WO_QC";
    public static final String WO_COMPLETED = "WO_COMPLETED";
    public static final String WO_FAILED = "WO_FAILED";
    public static final String WO_CANCELLED = "WO_CANCELLED";

    // ---- Technical verification --------------------------------------------
    public static final String TV_PENDING = "TV_PENDING";
    public static final String TV_APPROVED = "TV_APPROVED";
    public static final String TV_REJECTED = "TV_REJECTED";

    // ---- Drawings -----------------------------------------------------------
    public static final String DWG_PENDING = "DWG_PENDING";
    public static final String DWG_APPROVED = "DWG_APPROVED";
    public static final String DWG_REJECTED = "DWG_REJECTED";

    // ---- Models -------------------------------------------------------------
    public static final String MDL_PENDING = "MDL_PENDING";
    public static final String MDL_APPROVED = "MDL_APPROVED";
    public static final String MDL_REJECTED = "MDL_REJECTED";

    // ---- Quality inspection --------------------------------------------------
    public static final String QC_PENDING = "QC_PENDING";
    public static final String QC_PASSED = "QC_PASSED";
    public static final String QC_FAILED = "QC_FAILED";
    public static final String QC_HOLD = "QC_HOLD";

    // ---- Packing -------------------------------------------------------------
    public static final String PACK_PENDING = "PACK_PENDING";
    public static final String PACK_COMPLETED = "PACK_COMPLETED";

    // ---- Dispatch ------------------------------------------------------------
    public static final String DISP_PENDING = "DISP_PENDING";
    public static final String DISP_COMPLETED = "DISP_COMPLETED";

    /** Event key → the Production Settings toggle that gates it. */
    private static final Map<String, String> PREFERENCES = Map.ofEntries(
            Map.entry(WO_SUBMITTED, "workOrderPendingApproval"),
            Map.entry(WO_ADMIN_SUBMITTED, "workOrderAdminApprovalPending"),
            Map.entry(WO_APPROVED, "workOrderApproved"),
            Map.entry(WO_REJECTED, "workOrderRejected"),
            Map.entry(WO_RELEASED, "workOrderReleased"),
            Map.entry(WO_STARTED, "workOrderStarted"),
            Map.entry(WO_HOLD, "workOrderOnHold"),
            Map.entry(WO_QC, "workOrderSentToQuality"),
            Map.entry(WO_COMPLETED, "workOrderCompleted"),
            Map.entry(WO_FAILED, "workOrderFailed"),
            Map.entry(WO_CANCELLED, "workOrderCancelled"),
            Map.entry(TV_PENDING, "technicalVerificationPending"),
            Map.entry(TV_APPROVED, "technicalVerificationApproved"),
            Map.entry(TV_REJECTED, "technicalVerificationRejected"),
            Map.entry(DWG_PENDING, "drawingPendingApproval"),
            Map.entry(DWG_APPROVED, "drawingApproved"),
            Map.entry(DWG_REJECTED, "drawingRejected"),
            Map.entry(MDL_PENDING, "modelPendingApproval"),
            Map.entry(MDL_APPROVED, "modelApproved"),
            Map.entry(MDL_REJECTED, "modelRejected"),
            Map.entry(QC_PENDING, "qualityInspectionPending"),
            Map.entry(QC_PASSED, "qualityInspectionPassed"),
            Map.entry(QC_FAILED, "qualityInspectionFailed"),
            Map.entry(QC_HOLD, "qualityInspectionOnHold"),
            Map.entry(PACK_PENDING, "packingPending"),
            Map.entry(PACK_COMPLETED, "packingCompleted"),
            Map.entry(DISP_PENDING, "dispatchPending"),
            Map.entry(DISP_COMPLETED, "dispatchCompleted"));

    /** Events that require an approval/verification decision. */
    private static final List<String> APPROVAL_EVENTS = List.of(
            WO_SUBMITTED, WO_ADMIN_SUBMITTED, TV_PENDING, DWG_PENDING, MDL_PENDING);

    /** Roles holding PRODUCTION_APPROVE / PRODUCTION_VERIFY-style authority. */
    private static final List<String> APPROVER_ROLES = List.of("ADMIN", "MANAGER");

    /** Roles holding PRODUCTION_VIEW — the whole Production team. */
    private static final List<String> TEAM_ROLES = List.of("ADMIN", "MANAGER", "USER");

    private final NotificationPort notificationPort;
    private final ProductionSettingsService settingsService;

    public ProductionNotificationPublisher(NotificationPort notificationPort,
                                          ProductionSettingsService settingsService) {
        this.notificationPort = notificationPort;
        this.settingsService = settingsService;
    }

    /** The preference key behind an event (exposed for the settings screen/tests). */
    public static String preferenceOf(String eventKey) {
        return PREFERENCES.get(eventKey);
    }

    /** Every event key this publisher can raise. */
    public static java.util.Set<String> eventKeys() {
        return PREFERENCES.keySet();
    }

    /** Whether the Production Settings toggle for an event is on. */
    public boolean isEnabled(String eventKey) {
        String preference = PREFERENCES.get(eventKey);
        if (preference == null) {
            return false; // unknown event — nothing to gate it with
        }
        try {
            return settingsService.isNotificationEnabled(preference);
        } catch (Exception e) {
            // A settings read failure must neither swallow the event nor mute it
            // silently: fall back to the documented default.
            log.warning("Production notification preference lookup failed [event=" + eventKey + "]: "
                    + e.getMessage());
            Boolean fallback = ProductionSettingsService.NOTIFICATION_DEFAULTS.get(preference);
            return fallback == null || fallback;
        }
    }

    /**
     * Publishes one workflow event, honouring its Settings toggle.
     *
     * @return true when the event was delivered to at least one recipient, false
     *         when the toggle is off (or there is no one to notify)
     */
    public boolean publish(String eventKey, String referenceType, Long referenceId,
                           String title, String message) {
        return publish(eventKey, referenceType, referenceId, title, message, "NORMAL", null);
    }

    /**
     * @param priority   LOW / NORMAL / HIGH / URGENT
     * @param occurrence discriminator for a repeatable event on the same record
     *                   (history row id, transition timestamp…); null when the
     *                   event can happen at most once per record
     */
    public boolean publish(String eventKey, String referenceType, Long referenceId,
                           String title, String message, String priority, Object occurrence) {
        if (!isEnabled(eventKey)) {
            return false;
        }
        if (referenceId == null) {
            return false;
        }
        String eventType = occurrence == null ? eventKey : eventKey + ":" + occurrence;
        if (eventType.length() > 40) {
            // The notificationType column is 40 characters; keep the discriminator
            // rather than letting the insert fail.
            eventType = eventType.substring(0, 40);
        }
        List<String> roles = APPROVAL_EVENTS.contains(eventKey) ? APPROVER_ROLES : TEAM_ROLES;
        try {
            notificationPort.publish(new NotificationEvent(
                    MODULE,
                    referenceId,
                    referenceType,
                    eventType,
                    truncate(title, 200),
                    truncate(message, 2000),
                    priority,
                    roles));
            return true;
        } catch (Exception e) {
            // Notifications are best effort — never fail the business action.
            log.warning("Production notification skipped [event=" + eventKey
                    + " record=" + referenceId + "]: " + e.getMessage());
            return false;
        }
    }

    /**
     * Publishes the notification for one completed Production Order transition.
     *
     * <p>Called from the single choke point every order status change passes
     * through, so no transition can be missed and no transition notifies twice.
     *
     * @param order        the order AFTER the transition (its new status)
     * @param transitionId ApprovalHistory id — the dedupe discriminator, so a
     *                     re-submission after a rejection notifies again while a
     *                     replayed call does not
     * @param remarks      the transition remarks (rejections carry the reason)
     */
    public void publishTransition(ProductionOrder order, Long transitionId, String remarks) {
        if (order == null || transitionId == null || order.getStatus() == null) {
            return;
        }
        String workOrder = order.getWorkOrder() != null ? order.getWorkOrder() : ("#" + order.getId());
        String customer = order.getCustomer() != null ? (" for " + order.getCustomer()) : "";

        String event;
        String title;
        String message;
        String priority = "NORMAL";
        switch (order.getStatus()) {
            case PENDING_PRODUCTION_APPROVAL -> {
                event = WO_SUBMITTED;
                title = "Production approval required";
                message = "Work order " + workOrder + customer + " was submitted for production approval.";
                priority = "HIGH";
            }
            case PENDING_ADMIN_APPROVAL -> {
                event = WO_ADMIN_SUBMITTED;
                title = "Admin approval required";
                message = "Work order " + workOrder + customer
                        + " passed production approval and needs admin approval.";
                priority = "HIGH";
            }
            case PRODUCTION_APPROVED, ADMIN_APPROVED, APPROVED -> {
                event = WO_APPROVED;
                title = "Work order approved";
                message = "Work order " + workOrder + customer + " was approved ("
                        + order.getStatus().getDisplayName() + ").";
            }
            case PRODUCTION_REJECTED, ADMIN_REJECTED -> {
                event = WO_REJECTED;
                title = "Work order rejected";
                message = "Work order " + workOrder + customer + " was rejected ("
                        + order.getStatus().getDisplayName() + ")" + reasonSuffix(remarks);
                priority = "HIGH";
            }
            case PENDING -> {
                event = WO_RELEASED;
                title = "Work order released";
                message = "Work order " + workOrder + customer + " was released to the shop floor.";
            }
            case IN_PROGRESS -> {
                event = WO_STARTED;
                title = "Production started";
                message = "Work order " + workOrder + customer + " is now in progress.";
            }
            case HOLD -> {
                event = WO_HOLD;
                title = "Production on hold";
                message = "Work order " + workOrder + customer + " was put on hold" + reasonSuffix(remarks);
                priority = "HIGH";
            }
            case PENDING_QC -> {
                event = WO_QC;
                title = "Quality inspection required";
                message = "Work order " + workOrder + customer + " is waiting for quality inspection.";
            }
            case COMPLETED -> {
                event = WO_COMPLETED;
                title = "Production completed";
                message = "Work order " + workOrder + customer + " was completed.";
            }
            case FAILED -> {
                event = WO_FAILED;
                title = "Production failed";
                message = "Work order " + workOrder + customer + " failed quality inspection"
                        + reasonSuffix(remarks);
                priority = "HIGH";
            }
            case CANCELLED -> {
                event = WO_CANCELLED;
                title = "Work order cancelled";
                message = "Work order " + workOrder + customer + " was cancelled" + reasonSuffix(remarks);
            }
            default -> {
                // DRAFT / PACKED / READY_FOR_DISPATCH / DISPATCHED are driven by
                // Packing and Dispatch, whose own events cover them.
                return;
            }
        }

        publish(event, REF_ORDER, order.getId(), title, message, priority, transitionId);
    }

    private static String reasonSuffix(String remarks) {
        if (remarks == null || remarks.isBlank()) {
            return ".";
        }
        String reason = remarks.trim();
        if (reason.length() > 300) {
            reason = reason.substring(0, 300) + "…";
        }
        return ": " + reason;
    }

    private static String truncate(String value, int max) {
        if (value == null || value.length() <= max) {
            return value;
        }
        return value.substring(0, max);
    }
}
