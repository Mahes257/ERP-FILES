package com.vishatech.erp.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.vishatech.erp.entity.AppSetting;
import com.vishatech.erp.entity.SettingsAuditLog;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.repository.AppSettingRepository;
import com.vishatech.erp.repository.SettingsAuditLogRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.logging.Logger;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Purchase Settings → Notifications rules, persisted server-side.
 *
 * <h2>Why the rules live in the backend</h2>
 *
 * The rest of the Purchase settings document is a browser-local draft
 * ({@code src/purchase/services/settings.js} writes localStorage). Notification
 * rules cannot stay there: they decide whether the SERVER creates a
 * notification, who receives it and when it is reminded/escalated, and every
 * Purchase notification is produced inside a backend transaction. The
 * Purchase Settings page therefore mirrors its rules here on save (and reads
 * them back on load), so the page and the enforcement can never disagree.
 *
 * <p>The document is one JSON array under the {@code purchase_notification_rules}
 * key of {@code app_settings} — the same open-schema store Marketing Settings
 * and the Access Management scopes use, so no migration is needed. Every write
 * appends a {@link SettingsAuditLog} row.
 *
 * <h2>Event names</h2>
 *
 * The stored {@code event} is exactly the label shown in the Purchase Settings
 * grid (e.g. {@code "PR approval pending"}); {@link #ruleFor(String)} maps a
 * backend event type (see {@link PurchaseNotificationPublisher}) onto it. An
 * event with no switch in the UI (approvals, releases, mismatch…) has no rule
 * and therefore keeps its previous always-on behaviour.
 *
 * <h2>Defaults</h2>
 *
 * No stored rules at all ⇒ {@link #ruleFor} returns {@code null} ⇒ the publisher
 * behaves exactly as it did before this integration (same recipients, no
 * reminders). Rules are only able to narrow or redirect what the workflow
 * already produced; they never invent an event.
 */
@Service
public class PurchaseNotificationRulesService {

    /** app_settings key holding the rule array. */
    public static final String SETTING_KEY = "purchase_notification_rules";

    /**
     * The event labels the Purchase Settings grid configures. Kept in sync with
     * {@code settings.js} seed and the grid itself; anything else is rejected on
     * save so a typo cannot silently switch an event off.
     */
    public static final List<String> RULE_EVENTS = List.of(
            "PR approval pending",
            "RFQ deadline approaching",
            "Quotation received",
            "Negotiation pending",
            "PO approval pending",
            "Supplier acknowledgement pending",
            "Delivery overdue",
            "Quality inspection pending",
            "Invoice pending verification",
            "Payment overdue");

    /** Repeat choices offered by the grid. */
    private static final Set<String> REPEAT_INTERVALS =
            Set.of("once", "daily", "every 2 days", "weekly");

    /**
     * Backend event type → the rule label that governs it. Events absent here
     * have no switch in the UI and stay always-on.
     */
    private static final Map<String, String> EVENT_RULES = Map.ofEntries(
            Map.entry(PurchaseNotificationPublisher.EVENT_PR_SUBMITTED, "PR approval pending"),
            Map.entry(PurchaseNotificationPublisher.EVENT_RFQ_DEADLINE, "RFQ deadline approaching"),
            Map.entry(PurchaseNotificationPublisher.EVENT_QUOTATION_RECEIVED, "Quotation received"),
            Map.entry(PurchaseNotificationPublisher.EVENT_PO_SUBMITTED, "PO approval pending"),
            Map.entry(PurchaseNotificationPublisher.EVENT_SUPPLIER_ACKNOWLEDGEMENT,
                    "Supplier acknowledgement pending"),
            Map.entry(PurchaseNotificationPublisher.EVENT_DELIVERY_OVERDUE, "Delivery overdue"),
            Map.entry(PurchaseNotificationPublisher.EVENT_INSPECTION_PENDING, "Quality inspection pending"),
            Map.entry(PurchaseNotificationPublisher.EVENT_INVOICE_SUBMITTED,
                    "Invoice pending verification"),
            Map.entry(PurchaseNotificationPublisher.EVENT_PAYMENT_OVERDUE, "Payment overdue"),
            Map.entry(PurchaseNotificationPublisher.EVENT_PAYMENT_DUE, "Payment overdue"));

    /**
     * Recipient labels in the grid → the roles that actually hold the work.
     * Approver-class work needs {@code PURCHASE_APPROVE} (ADMIN, MANAGER);
     * buyer/logistics/finance work needs {@code PURCHASE_VIEW} (all three).
     */
    private static final Map<String, List<UserRole>> RECIPIENT_ROLES = Map.ofEntries(
            Map.entry("approver", List.of(UserRole.ADMIN, UserRole.MANAGER)),
            Map.entry("manager", List.of(UserRole.ADMIN, UserRole.MANAGER)),
            Map.entry("administrator", List.of(UserRole.ADMIN, UserRole.MANAGER)),
            Map.entry("admin", List.of(UserRole.ADMIN, UserRole.MANAGER)),
            Map.entry("buyer", List.of(UserRole.ADMIN, UserRole.MANAGER, UserRole.USER)),
            Map.entry("purchaser", List.of(UserRole.ADMIN, UserRole.MANAGER, UserRole.USER)),
            Map.entry("procurement", List.of(UserRole.ADMIN, UserRole.MANAGER, UserRole.USER)),
            Map.entry("logistics", List.of(UserRole.ADMIN, UserRole.MANAGER, UserRole.USER)),
            Map.entry("quality", List.of(UserRole.ADMIN, UserRole.MANAGER, UserRole.USER)),
            Map.entry("warehouse", List.of(UserRole.ADMIN, UserRole.MANAGER, UserRole.USER)),
            Map.entry("finance", List.of(UserRole.ADMIN, UserRole.MANAGER)),
            Map.entry("accountant", List.of(UserRole.ADMIN, UserRole.MANAGER)));

    private static final Logger log = Logger.getLogger(PurchaseNotificationRulesService.class.getName());

    private final AppSettingRepository appSettingRepository;
    private final SettingsAuditLogRepository auditRepository;
    private final ObjectMapper objectMapper;

    public PurchaseNotificationRulesService(AppSettingRepository appSettingRepository,
                                            SettingsAuditLogRepository auditRepository,
                                            ObjectMapper objectMapper) {
        this.appSettingRepository = appSettingRepository;
        this.auditRepository = auditRepository;
        this.objectMapper = objectMapper;
    }

    // ── Read ─────────────────────────────────────────────────────────────

    /** The stored rules, or an empty array when never configured. */
    @Transactional(readOnly = true)
    public JsonNode getRules() {
        return appSettingRepository.findBySettingKey(SETTING_KEY)
                .map(AppSetting::getSettingValue)
                .map(this::parse)
                .orElseGet(objectMapper::createArrayNode);
    }

    /**
     * The rule governing one backend event type, or {@code null} when the event
     * has no switch in the UI or the rules were never saved.
     */
    @Transactional(readOnly = true)
    public Rule ruleFor(String eventType) {
        String label = EVENT_RULES.get(eventType);
        if (label == null) {
            return null;
        }
        for (Rule rule : rules()) {
            if (label.equals(rule.event())) {
                return rule;
            }
        }
        return null;
    }

    /** The stored rules as typed rows (invalid rows are skipped). */
    @Transactional(readOnly = true)
    public List<Rule> rules() {
        JsonNode node = getRules();
        if (!node.isArray()) {
            return List.of();
        }
        List<Rule> rows = new ArrayList<>();
        for (JsonNode row : node) {
            Rule rule = toRule(row);
            if (rule != null) {
                rows.add(rule);
            }
        }
        return rows;
    }

    /**
     * True when an event that carries a UI switch must be skipped because its
     * rule is switched off. Events without a rule are never skipped here.
     */
    public boolean isSuppressed(String eventType) {
        Rule rule = ruleFor(eventType);
        return rule != null && !rule.enabled();
    }

    // ── Write ────────────────────────────────────────────────────────────

    /**
     * Replace the rule set. Rejects an unknown event label or repeat value
     * instead of dropping it, so a saved configuration always means what the
     * administrator saw.
     *
     * @return the persisted array
     */
    @Transactional
    public JsonNode update(JsonNode body) {
        JsonNode candidate = body != null && body.has("rules") ? body.get("rules") : body;
        if (candidate == null || !candidate.isArray()) {
            throw new IllegalArgumentException("Purchase notification rules must be a JSON array");
        }
        ArrayNode sanitized = objectMapper.createArrayNode();
        Map<String, Boolean> seen = new LinkedHashMap<>();
        for (JsonNode row : candidate) {
            if (!row.isObject()) {
                throw new IllegalArgumentException("Each notification rule must be an object");
            }
            String event = text(row, "event");
            if (event.isBlank() || !RULE_EVENTS.contains(event)) {
                throw new IllegalArgumentException("Unknown Purchase notification event: " + event);
            }
            if (seen.put(event, Boolean.TRUE) != null) {
                throw new IllegalArgumentException("Duplicate Purchase notification event: " + event);
            }
            String repeat = text(row, "repeatInterval");
            if (!repeat.isBlank() && !REPEAT_INTERVALS.contains(repeat)) {
                throw new IllegalArgumentException("Unknown repeat interval: " + repeat);
            }
            ObjectNode next = objectMapper.createObjectNode();
            next.put("id", text(row, "id").isBlank() ? event : text(row, "id"));
            next.put("event", event);
            next.put("enabled", !row.has("enabled") || row.get("enabled").asBoolean(true));
            next.put("recipientRole", truncate(text(row, "recipientRole"), 40));
            next.put("reminderAfter", clampInt(row, "reminderAfter", 0, 30));
            next.put("escalateAfter", clampInt(row, "escalateAfter", 0, 60));
            next.put("repeatInterval", repeat.isBlank() ? "once" : repeat);
            sanitized.add(next);
        }

        String previous = appSettingRepository.findBySettingKey(SETTING_KEY)
                .map(AppSetting::getSettingValue)
                .orElse(null);
        try {
            String serialized = objectMapper.writeValueAsString(sanitized);
            appSettingRepository.upsert(SETTING_KEY, serialized);
            auditRepository.save(new SettingsAuditLog(
                    SETTING_KEY, null, null, previous, serialized, currentUsername()));
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Purchase notification rules could not be serialized",
                    exception);
        }
        log.info("Purchase notification rules saved (" + sanitized.size() + " event(s))");
        return sanitized;
    }

    // ── Rule model ───────────────────────────────────────────────────────

    /**
     * One configured rule.
     *
     * @param event          the UI event label (see {@link #RULE_EVENTS})
     * @param enabled        false ⇒ the publisher produces nothing for it
     * @param recipientRole  the grid's role label; resolved via {@link #recipientRoles}
     * @param reminderAfter  days before the first reminder (0 = no reminder)
     * @param escalateAfter  days before the unresolved event is escalated to an ADMIN
     * @param repeatInterval how many reminders the cadence earns (see {@link #maxReminders})
     */
    public record Rule(String id, String event, boolean enabled, String recipientRole,
                       int reminderAfter, int escalateAfter, String repeatInterval) {

        /**
         * Reminder budget for this rule.
         *
         * <p>The delivery cadence belongs to the shared reminder scheduler
         * ({@code NotificationService.processReminders}, 2 hours for real work);
         * Repeat expresses HOW MANY reminders the event earns before it is left
         * to escalation — {@code once} = one reminder, the others fill the
         * escalation window at their own step (daily/every 2 days/weekly), capped
         * at 10 so a long window cannot flood the inbox.
         */
        public int maxReminders() {
            if (reminderAfter <= 0) {
                return 0;
            }
            if ("once".equals(repeatInterval)) {
                return 1;
            }
            int window = escalateAfter > 0 ? escalateAfter - reminderAfter : 2;
            if (window <= 0) {
                return 1;
            }
            int step = switch (repeatInterval) {
                case "daily" -> 1;
                case "every 2 days" -> 2;
                case "weekly" -> 7;
                default -> 1;
            };
            int count = (int) Math.ceil((double) window / step);
            return Math.max(1, Math.min(10, count));
        }

        /** Roles that should receive the event, or {@code null} to use the event default. */
        public List<UserRole> roles() {
            return recipientRoles(recipientRole);
        }
    }

    /** Recipient roles for a grid label; {@code null} when the label is unrecognised. */
    public static List<UserRole> recipientRoles(String label) {
        if (label == null || label.isBlank()) {
            return null;
        }
        return RECIPIENT_ROLES.get(label.trim().toLowerCase());
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private Rule toRule(JsonNode row) {
        if (row == null || !row.isObject()) {
            return null;
        }
        String event = text(row, "event");
        if (event.isBlank() || !RULE_EVENTS.contains(event)) {
            return null;
        }
        String repeat = text(row, "repeatInterval");
        return new Rule(
                text(row, "id").isBlank() ? event : text(row, "id"),
                event,
                !row.has("enabled") || row.get("enabled").asBoolean(true),
                truncate(text(row, "recipientRole"), 40),
                clampInt(row, "reminderAfter", 0, 30),
                clampInt(row, "escalateAfter", 0, 60),
                REPEAT_INTERVALS.contains(repeat) ? repeat : "once");
    }

    private JsonNode parse(String value) {
        try {
            JsonNode node = objectMapper.readTree(value);
            return node != null && node.isArray() ? node : objectMapper.createArrayNode();
        } catch (JsonProcessingException exception) {
            // Fail safe: unreadable configuration must never mean "notify everyone".
            log.warning("Stored Purchase notification rules are invalid JSON — ignoring them");
            return objectMapper.createArrayNode();
        }
    }

    private static String text(JsonNode row, String field) {
        JsonNode node = row.get(field);
        return node == null || node.isNull() ? "" : node.asText("").trim();
    }

    private static int clampInt(JsonNode row, String field, int min, int max) {
        JsonNode node = row.get(field);
        int value = node == null || node.isNull() ? 0 : node.asInt(0);
        return Math.max(min, Math.min(max, value));
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return "";
        }
        return value.length() <= max ? value : value.substring(0, max);
    }

    private static String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            return "system";
        }
        return auth.getName();
    }

    /** The rule labels, for the settings page's own validation. */
    public static Set<String> eventLabels() {
        return new LinkedHashSet<>(RULE_EVENTS);
    }
}
