package com.vishatech.erp.notification;

/**
 * Published contract for writing into the ERP's shared notification system.
 *
 * <p><b>Why this interface exists.</b> The notification table, service and
 * read/unread lifecycle are cross-module infrastructure (module + reference
 * columns, one inbox per user), but a business module that wants to publish an
 * event must not import the flat notification persistence directly. This port is
 * the seam: a module describes the event with {@link NotificationEvent} and the
 * implementation owns recipients, priorities, deduplication and persistence.
 *
 * <p><b>Contract.</b> Implementations must be best effort: a notification
 * failure must never fail the business transaction that produced the event. The
 * caller's transaction is joined when one is active.
 *
 * <p><b>Deduplication.</b> {@link NotificationEvent#eventType()} is the
 * idempotency discriminator. It must identify the EVENT, not just the event
 * class — a caller that can distinguish two occurrences of the same event class
 * (for example by the id of the transition row it just wrote) supplies a value
 * that differs between them, so a replayed occurrence is suppressed while a
 * genuinely new occurrence still notifies.
 */
public interface NotificationPort {

    /** Writes one event into the shared notification system. */
    void publish(NotificationEvent event);
}
