package com.vishatech.erp.notification;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.vishatech.erp.dto.NotificationRequest;
import com.vishatech.erp.entity.Notification;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.repository.NotificationRepository;
import com.vishatech.erp.repository.UserRepository;
import com.vishatech.erp.service.NotificationService;
import com.vishatech.erp.service.PurchaseNotificationPublisher;
import com.vishatech.erp.service.PurchaseNotificationRulesService;
import com.vishatech.erp.service.PurchaseNotificationRulesService.Rule;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * Purchase Settings → Notifications integration: the rule math and the
 * publisher's use of it.
 *
 * <p>These are the behaviours the settings grid controls and that no HTTP
 * request can show directly: an event must produce NOTHING when its rule is
 * switched off, the reminder budget must follow Remind After + Repeat, and the
 * escalation window must travel on the notification so the sweep can act on it
 * without a new column.
 */
class PurchaseNotificationRulesTest {

    private static Rule rule(boolean enabled, String recipient, int reminderAfter, int escalateAfter,
                             String repeat) {
        return new Rule("id", "PR approval pending", enabled, recipient, reminderAfter, escalateAfter,
                repeat);
    }

    // ── Reminder budget ──────────────────────────────────────────────────

    @Test
    @DisplayName("Remind After 0 schedules no reminder at all")
    void noReminderWhenRemindAfterIsZero() {
        assertEquals(0, rule(true, "Approver", 0, 3, "daily").maxReminders());
    }

    @Test
    @DisplayName("Repeat=once earns exactly one reminder")
    void onceMeansOneReminder() {
        assertEquals(1, rule(true, "Approver", 1, 5, "once").maxReminders());
    }

    @Test
    @DisplayName("Repeat fills the escalation window at its own step")
    void repeatFillsEscalationWindow() {
        // 1 → 5 days, daily ⇒ one reminder per day in the window.
        assertEquals(4, rule(true, "Approver", 1, 5, "daily").maxReminders());
        // every 2 days over the same window ⇒ half as many.
        assertEquals(2, rule(true, "Approver", 1, 5, "every 2 days").maxReminders());
        // weekly over a 5-day window ⇒ a single reminder.
        assertEquals(1, rule(true, "Approver", 1, 5, "weekly").maxReminders());
    }

    @Test
    @DisplayName("The reminder budget is bounded so a long window cannot flood the inbox")
    void reminderBudgetIsCapped() {
        assertTrue(rule(true, "Approver", 1, 60, "daily").maxReminders() <= 10);
    }

    // ── Recipient roles ──────────────────────────────────────────────────

    @Test
    @DisplayName("Approver reaches the roles that can actually approve")
    void approverRoles() {
        assertEquals(List.of(UserRole.ADMIN, UserRole.MANAGER),
                PurchaseNotificationRulesService.recipientRoles("Approver"));
    }

    @Test
    @DisplayName("Buyer work reaches every Purchase role, including USER")
    void buyerRoles() {
        assertEquals(List.of(UserRole.ADMIN, UserRole.MANAGER, UserRole.USER),
                PurchaseNotificationRulesService.recipientRoles("Buyer"));
    }

    @Test
    @DisplayName("An unknown recipient label falls back instead of guessing")
    void unknownRecipientFallsBack() {
        assertNull(PurchaseNotificationRulesService.recipientRoles("Some New Role"));
        assertNull(PurchaseNotificationRulesService.recipientRoles(""));
    }

    // ── Escalation marker ────────────────────────────────────────────────

    @Test
    @DisplayName("An escalation window travels on the notification type")
    void escalationWindowIsCarriedByType() {
        String type = PurchaseNotificationPublisher.typedEvent(
                PurchaseNotificationPublisher.EVENT_PR_SUBMITTED,
                rule(true, "Approver", 1, 3, "daily"));
        assertEquals("PR_SUBMITTED#3#1", type);
        assertEquals("PR_SUBMITTED", PurchaseNotificationPublisher.baseEvent(type));
        assertEquals(3, PurchaseNotificationPublisher.escalateAfterDays(type));
    }

    @Test
    @DisplayName("No escalation window leaves the event type exactly as before")
    void noEscalationKeepsPlainType() {
        String type = PurchaseNotificationPublisher.typedEvent(
                PurchaseNotificationPublisher.EVENT_PR_SUBMITTED,
                rule(true, "Approver", 0, 0, "once"));
        assertEquals("PR_SUBMITTED", type);
        assertEquals(0, PurchaseNotificationPublisher.escalateAfterDays(type));
        assertEquals("PR_SUBMITTED", PurchaseNotificationPublisher.baseEvent("PR_SUBMITTED"));
    }

    // ── Publisher behaviour ──────────────────────────────────────────────

    @Test
    @DisplayName("Enabled OFF produces no notification and no reminder")
    void disabledRuleNotifiesNobody() {
        NotificationService notificationService = mock(NotificationService.class);
        UserRepository users = mock(UserRepository.class);
        NotificationRepository notifications = mock(NotificationRepository.class);
        PurchaseNotificationRulesService rules = mock(PurchaseNotificationRulesService.class);
        when(rules.ruleFor(PurchaseNotificationPublisher.EVENT_PR_SUBMITTED))
                .thenReturn(rule(false, "Approver", 1, 3, "daily"));
        when(users.findByRoleInAndEnabledTrue(any())).thenReturn(List.of(user(7L)));

        PurchaseNotificationPublisher publisher =
                new PurchaseNotificationPublisher(notificationService, users, notifications, rules);
        publisher.publish(PurchaseNotificationPublisher.EVENT_PR_SUBMITTED,
                "PR submitted", "PR-1 is awaiting approval", 1L, "PurchaseRequisition");

        verify(notificationService, never()).create(any());
    }

    @Test
    @DisplayName("An enabled rule schedules the reminder and targets its own roles")
    void enabledRuleSchedulesReminderForItsRoles() {
        NotificationService notificationService = mock(NotificationService.class);
        UserRepository users = mock(UserRepository.class);
        NotificationRepository notifications = mock(NotificationRepository.class);
        PurchaseNotificationRulesService rules = mock(PurchaseNotificationRulesService.class);
        when(rules.ruleFor(PurchaseNotificationPublisher.EVENT_PR_SUBMITTED))
                .thenReturn(rule(true, "Approver", 1, 3, "daily"));
        when(users.findByRoleInAndEnabledTrue(List.of(UserRole.ADMIN, UserRole.MANAGER)))
                .thenReturn(List.of(user(7L)));
        when(notifications.existsEventForRecipient(any(), any(), any(), any())).thenReturn(false);

        PurchaseNotificationPublisher publisher =
                new PurchaseNotificationPublisher(notificationService, users, notifications, rules);
        publisher.publish(PurchaseNotificationPublisher.EVENT_PR_SUBMITTED,
                "PR submitted", "PR-1 is awaiting approval", 1L, "PurchaseRequisition");

        ArgumentCaptor<NotificationRequest> captor = ArgumentCaptor.forClass(NotificationRequest.class);
        verify(notificationService).create(captor.capture());
        NotificationRequest request = captor.getValue();
        assertEquals(7L, request.recipientUserId());
        assertEquals("PR_SUBMITTED#3#1", request.notificationType());
        assertEquals(2, request.maxReminders()); // 1 → 3 days, daily ⇒ 2 reminders
        assertNotNull(request.firstReminderAt(), "Remind After must schedule the first reminder");
        assertTrue(request.firstReminderAt().startsWith(
                java.time.LocalDate.now().plusDays(1).toString()));
    }

    @Test
    @DisplayName("An event with no rule keeps its previous recipients and no reminders")
    void unconfiguredEventKeepsPreviousBehaviour() {
        NotificationService notificationService = mock(NotificationService.class);
        UserRepository users = mock(UserRepository.class);
        NotificationRepository notifications = mock(NotificationRepository.class);
        PurchaseNotificationRulesService rules = mock(PurchaseNotificationRulesService.class);
        when(rules.ruleFor(PurchaseNotificationPublisher.EVENT_PO_APPROVED)).thenReturn(null);
        when(users.findByRoleAndEnabledTrue(UserRole.ADMIN)).thenReturn(List.of(user(1L)));
        when(notifications.existsEventForRecipient(any(), any(), any(), any())).thenReturn(false);

        PurchaseNotificationPublisher publisher =
                new PurchaseNotificationPublisher(notificationService, users, notifications, rules);
        publisher.publish(PurchaseNotificationPublisher.EVENT_PO_APPROVED,
                "PO approved", "PO-1 approved", 2L, "PurchaseOrder");

        ArgumentCaptor<NotificationRequest> captor = ArgumentCaptor.forClass(NotificationRequest.class);
        verify(notificationService).create(captor.capture());
        NotificationRequest request = captor.getValue();
        assertEquals("PO_APPROVED", request.notificationType());
        // Null budget: NotificationService normalises it to 0 (no reminder).
        assertNull(request.maxReminders());
        assertNull(request.firstReminderAt());
        assertEquals(PurchaseNotificationPublisher.MODULE_PURCHASE, request.module());
        assertEquals(Notification.Priority.NORMAL, request.priority());
    }

    private static User user(Long id) {
        User user = new User();
        user.setId(id);
        return user;
    }

    @Test
    @DisplayName("The settings grid's event labels are the ones the rules accept")
    void gridLabelsAreTheRuleCatalogue() {
        assertTrue(PurchaseNotificationRulesService.RULE_EVENTS.contains("PR approval pending"));
        assertTrue(PurchaseNotificationRulesService.RULE_EVENTS.contains("Delivery overdue"));
        assertTrue(PurchaseNotificationRulesService.RULE_EVENTS.contains("Invoice pending verification"));
        assertFalse(PurchaseNotificationRulesService.RULE_EVENTS.isEmpty());
    }
}
