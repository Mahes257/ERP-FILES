package com.vishatech.erp.notification;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.vishatech.erp.dto.NotificationRequest;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.repository.NotificationRepository;
import com.vishatech.erp.repository.UserRepository;
import com.vishatech.erp.service.NotificationService;
import com.vishatech.erp.service.SalesNotificationPublisher;
import com.vishatech.erp.service.SalesSettingsService;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * Sales Settings → Notifications: each toggle must actually gate whether a Sales
 * event reaches the global inbox.
 *
 * <p>The preferences live in the existing {@code sales_settings} document, so
 * these tests pin the reading rules (saved value wins, the page default applies
 * until something is saved, a failed read does not mute the event) and the
 * delivery shape (module SALES, stable event type, no reminder budget).
 */
class SalesNotificationPublisherTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private ObjectNode settingsWith(Object... keysAndValues) {
        ObjectNode root = mapper.createObjectNode();
        ObjectNode notifications = root.putObject("notifications");
        for (int i = 0; i < keysAndValues.length; i += 2) {
            notifications.put((String) keysAndValues[i], (Boolean) keysAndValues[i + 1]);
        }
        return root;
    }

    private SalesNotificationPublisher publisherWith(SalesSettingsService settings,
                                                     NotificationService notificationService,
                                                     UserRepository users,
                                                     NotificationRepository notifications) {
        return new SalesNotificationPublisher(notificationService, notifications, users, settings);
    }

    @Test
    @DisplayName("A disabled toggle produces no notification at all")
    void disabledToggleNotifiesNobody() {
        SalesSettingsService settings = mock(SalesSettingsService.class);
        when(settings.getSettings()).thenReturn(settingsWith("quotationPendingApproval", false));
        NotificationService notificationService = mock(NotificationService.class);

        SalesNotificationPublisher publisher = publisherWith(settings, notificationService,
                mock(UserRepository.class), mock(NotificationRepository.class));
        boolean created = publisher.publish(SalesNotificationPublisher.EVENT_QUOTATION_PENDING,
                "Quotation QT-1 awaiting approval", "Quotation QT-1 is awaiting approval",
                1L, "Quotation");

        assertFalse(created);
        verify(notificationService, never()).create(any());
    }

    @Test
    @DisplayName("An enabled toggle delivers to the Sales roles with the stable event type")
    void enabledToggleDelivers() {
        SalesSettingsService settings = mock(SalesSettingsService.class);
        when(settings.getSettings()).thenReturn(settingsWith("quotationPendingApproval", true));
        NotificationService notificationService = mock(NotificationService.class);
        UserRepository users = mock(UserRepository.class);
        User admin = new User();
        admin.setId(3L);
        when(users.findByRoleInAndEnabledTrue(List.of(UserRole.ADMIN, UserRole.MANAGER)))
                .thenReturn(List.of(admin));
        NotificationRepository notifications = mock(NotificationRepository.class);
        when(notifications.existsByModuleAndReferenceIdAndNotificationTypeAndRecipientUserId(
                any(), any(), any(), any())).thenReturn(false);

        SalesNotificationPublisher publisher = publisherWith(settings, notificationService, users,
                notifications);
        boolean created = publisher.publish(SalesNotificationPublisher.EVENT_QUOTATION_PENDING,
                "Quotation QT-1 awaiting approval", "Quotation QT-1 is awaiting approval",
                1L, "Quotation");

        assertTrue(created);
        ArgumentCaptor<NotificationRequest> captor = ArgumentCaptor.forClass(NotificationRequest.class);
        verify(notificationService).create(captor.capture());
        NotificationRequest request = captor.getValue();
        assertEquals(SalesNotificationPublisher.MODULE_SALES, request.module());
        assertEquals(SalesNotificationPublisher.EVENT_QUOTATION_PENDING, request.notificationType());
        assertEquals("Quotation", request.referenceType());
        assertEquals(1L, request.referenceId());
        assertEquals(3L, request.recipientUserId());
    }

    @Test
    @DisplayName("The same record and event never notifies the same user twice")
    void duplicatesAreSuppressed() {
        SalesSettingsService settings = mock(SalesSettingsService.class);
        when(settings.getSettings()).thenReturn(settingsWith("invoiceOverdue", true));
        NotificationService notificationService = mock(NotificationService.class);
        UserRepository users = mock(UserRepository.class);
        User admin = new User();
        admin.setId(3L);
        when(users.findByRoleInAndEnabledTrue(any())).thenReturn(List.of(admin));
        NotificationRepository notifications = mock(NotificationRepository.class);
        when(notifications.existsByModuleAndReferenceIdAndNotificationTypeAndRecipientUserId(
                any(), any(), any(), any())).thenReturn(true);

        SalesNotificationPublisher publisher = publisherWith(settings, notificationService, users,
                notifications);
        boolean created = publisher.publish(SalesNotificationPublisher.EVENT_INVOICE_OVERDUE,
                "Invoice INV-1 overdue", "Invoice INV-1 is overdue", 5L, "Invoice");

        assertFalse(created);
        verify(notificationService, never()).create(any());
    }

    @Test
    @DisplayName("Before anything is saved the page defaults apply (CPO approval starts OFF)")
    void pageDefaultsApplyUntilSaved() {
        SalesSettingsService settings = mock(SalesSettingsService.class);
        when(settings.getSettings()).thenReturn(mapper.createObjectNode());

        SalesNotificationPublisher publisher = publisherWith(settings,
                mock(NotificationService.class), mock(UserRepository.class),
                mock(NotificationRepository.class));

        // Sales Settings seeds salesOrderPendingApproval = false and the rest = true.
        assertFalse(publisher.isEnabled(SalesNotificationPublisher.EVENT_ORDER_PENDING));
        assertTrue(publisher.isEnabled(SalesNotificationPublisher.EVENT_QUOTATION_PENDING));
        assertTrue(publisher.isEnabled(SalesNotificationPublisher.EVENT_CREDIT_NOTE_PENDING));
        assertTrue(publisher.isEnabled(SalesNotificationPublisher.EVENT_PAYMENT_RECEIVED));
    }

    @Test
    @DisplayName("A saved value wins, for every event the page configures")
    void savedValuesWin() {
        SalesSettingsService settings = mock(SalesSettingsService.class);
        when(settings.getSettings()).thenReturn(settingsWith(
                "quotationPendingApproval", false,
                "quotationExpiring", false,
                "quotationAccepted", false,
                "salesContractPendingApproval", false,
                "salesOrderPendingApproval", true,
                "invoiceOverdue", false,
                "paymentReceived", false,
                "creditNotePendingApproval", false));

        SalesNotificationPublisher publisher = publisherWith(settings,
                mock(NotificationService.class), mock(UserRepository.class),
                mock(NotificationRepository.class));

        assertFalse(publisher.isEnabled(SalesNotificationPublisher.EVENT_QUOTATION_PENDING));
        assertFalse(publisher.isEnabled(SalesNotificationPublisher.EVENT_QUOTATION_EXPIRING));
        assertFalse(publisher.isEnabled(SalesNotificationPublisher.EVENT_QUOTATION_ACCEPTED));
        assertFalse(publisher.isEnabled(SalesNotificationPublisher.EVENT_CONTRACT_PENDING));
        assertTrue(publisher.isEnabled(SalesNotificationPublisher.EVENT_ORDER_PENDING));
        assertFalse(publisher.isEnabled(SalesNotificationPublisher.EVENT_INVOICE_OVERDUE));
        assertFalse(publisher.isEnabled(SalesNotificationPublisher.EVENT_PAYMENT_RECEIVED));
        assertFalse(publisher.isEnabled(SalesNotificationPublisher.EVENT_CREDIT_NOTE_PENDING));
    }

    @Test
    @DisplayName("An unreadable settings document falls back to the default, never to silent mute")
    void unreadableSettingsFallBackToDefault() {
        SalesSettingsService settings = mock(SalesSettingsService.class);
        when(settings.getSettings()).thenThrow(new IllegalStateException("stored JSON is invalid"));

        SalesNotificationPublisher publisher = publisherWith(settings,
                mock(NotificationService.class), mock(UserRepository.class),
                mock(NotificationRepository.class));

        assertTrue(publisher.isEnabled(SalesNotificationPublisher.EVENT_QUOTATION_PENDING));
        assertFalse(publisher.isEnabled(SalesNotificationPublisher.EVENT_ORDER_PENDING));
    }
}
