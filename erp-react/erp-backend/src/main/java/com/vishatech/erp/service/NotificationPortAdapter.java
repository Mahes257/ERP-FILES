package com.vishatech.erp.service;

import com.vishatech.erp.dto.NotificationRequest;
import com.vishatech.erp.entity.Notification;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.notification.NotificationEvent;
import com.vishatech.erp.notification.NotificationPort;
import com.vishatech.erp.repository.NotificationRepository;
import com.vishatech.erp.repository.UserRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.logging.Logger;
import org.springframework.stereotype.Component;

/**
 * Implementation of the shared {@link NotificationPort} on top of the existing
 * notification system: same {@code notifications} table, same
 * {@link NotificationService} (read/unread lifecycle, WebSocket push), same
 * recipient model.
 *
 * <p>It lives in the flat {@code service} package on purpose — it is
 * notification infrastructure shared by every module, not owned by one of them.
 */
@Component
public class NotificationPortAdapter implements NotificationPort {

    private static final Logger log = Logger.getLogger(NotificationPortAdapter.class.getName());

    private final NotificationService notificationService;
    private final UserRepository userRepository;
    private final NotificationRepository notificationRepository;

    public NotificationPortAdapter(NotificationService notificationService,
                                   UserRepository userRepository,
                                   NotificationRepository notificationRepository) {
        this.notificationService = notificationService;
        this.userRepository = userRepository;
        this.notificationRepository = notificationRepository;
    }

    @Override
    public void publish(NotificationEvent event) {
        if (event == null || event.referenceId() == null || event.eventType() == null) {
            return;
        }
        List<UserRole> roles = rolesOf(event.recipientRoles());
        if (roles.isEmpty()) {
            return;
        }
        Notification.Priority priority = priorityOf(event.priority());
        List<User> recipients = userRepository.findByRoleInAndEnabledTrue(roles);
        for (User recipient : recipients) {
            try {
                // One notification per (module, record, event occurrence, recipient):
                // a replayed/retried publish cannot duplicate the inbox entry.
                if (notificationRepository.existsByModuleAndReferenceIdAndNotificationTypeAndRecipientUserId(
                        event.module(), event.referenceId(), event.eventType(), recipient.getId())) {
                    continue;
                }
                notificationService.create(new NotificationRequest(
                        recipient.getId(),
                        event.title(),
                        event.message(),
                        event.module(),
                        event.referenceId(),
                        event.referenceType(),
                        priority,
                        event.eventType(),
                        false,
                        0,
                        null));
            } catch (Exception e) {
                // Best effort: notifying must never fail the business transaction.
                log.warning("Notification skipped [event=" + event.eventType()
                        + " reference=" + event.referenceId() + " recipient=" + recipient.getId()
                        + "]: " + e.getMessage());
            }
        }
    }

    private static List<UserRole> rolesOf(List<String> roleNames) {
        List<UserRole> roles = new ArrayList<>();
        if (roleNames == null) {
            return roles;
        }
        for (String name : roleNames) {
            if (name == null) {
                continue;
            }
            try {
                roles.add(UserRole.valueOf(name.trim().toUpperCase()));
            } catch (IllegalArgumentException e) {
                log.warning("Unknown notification role ignored: " + name);
            }
        }
        return roles;
    }

    private static Notification.Priority priorityOf(String priority) {
        if (priority == null) {
            return Notification.Priority.NORMAL;
        }
        try {
            return Notification.Priority.valueOf(priority.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return Notification.Priority.NORMAL;
        }
    }
}
