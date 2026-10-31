package com.vishatech.erp.notification;

import java.util.List;

/**
 * One workflow event to deliver through the shared notification system.
 *
 * <p>Deliberately free of module entities: a producer describes the event with
 * plain values so no business module has to expose its persistence to the
 * notification implementation (or vice versa).
 *
 * @param module        owning module label stored on the notification, e.g. {@code PRODUCTION}
 * @param referenceId   id of the referenced business record
 * @param referenceType record type label, e.g. {@code ProductionOrder}
 * @param eventType     event discriminator used for deduplication (see
 *                      {@link NotificationPort}); must be unique per occurrence
 *                      when the caller can distinguish occurrences
 * @param title         short title shown in the inbox
 * @param message       message shown in the inbox
 * @param priority      {@code LOW} / {@code NORMAL} / {@code HIGH} / {@code URGENT};
 *                      anything else falls back to {@code NORMAL}
 * @param recipientRoles role names that should receive the event, e.g. {@code ADMIN};
 *                      only enabled users are notified
 */
public record NotificationEvent(
        String module,
        Long referenceId,
        String referenceType,
        String eventType,
        String title,
        String message,
        String priority,
        List<String> recipientRoles
) {
}
