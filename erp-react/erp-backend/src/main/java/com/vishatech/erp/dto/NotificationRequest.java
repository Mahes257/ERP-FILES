package com.vishatech.erp.dto;

import com.vishatech.erp.entity.Notification.Priority;

/**
 * Request body for creating a notification.
 *
 * recipientUserId is required — the backend derives the sender from the
 * authenticated SecurityContext, never trusting a frontend-supplied sender.
 */
public record NotificationRequest(
        Long recipientUserId,
        String title,
        String message,
        String module,
        Long referenceId,
        String referenceType,
        Priority priority,
        String notificationType,
        boolean isTest,
        Integer maxReminders,
        /** ISO-8601 datetime string for the first reminder (test only). */
        String firstReminderAt
) {
}
