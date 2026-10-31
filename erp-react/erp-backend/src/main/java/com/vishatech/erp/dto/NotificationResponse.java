package com.vishatech.erp.dto;

import com.vishatech.erp.entity.Notification;
import java.time.LocalDateTime;

/**
 * Compact notification response. Never exposes sender credentials,
 * internal reminder scheduling details, or test flags to the general
 * notification list (isTest is included for PoC debugging only).
 */
public record NotificationResponse(
        Long id,
        Long recipientUserId,
        Long senderUserId,
        String title,
        String message,
        String module,
        Long referenceId,
        String referenceType,
        Notification.Priority priority,
        Notification.Status status,
        LocalDateTime readAt,
        LocalDateTime resolvedAt,
        int reminderCount,
        String notificationType,
        boolean isTest,
        LocalDateTime createdAt
) {
    public static NotificationResponse fromEntity(Notification n) {
        return new NotificationResponse(
                n.getId(),
                n.getRecipientUserId(),
                n.getSenderUserId(),
                n.getTitle(),
                n.getMessage(),
                n.getModule(),
                n.getReferenceId(),
                n.getReferenceType(),
                n.getPriority(),
                n.getStatus(),
                n.getReadAt(),
                n.getResolvedAt(),
                n.getReminderCount(),
                n.getNotificationType(),
                n.isTest(),
                n.getCreatedAt()
        );
    }
}
