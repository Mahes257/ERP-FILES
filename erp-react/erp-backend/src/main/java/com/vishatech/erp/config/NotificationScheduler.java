package com.vishatech.erp.config;

import com.vishatech.erp.service.NotificationService;
import java.util.logging.Logger;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Spring Scheduler that polls for pending notification reminders.
 *
 * <h2>Interval</h2>
 * Configured by {@code app.notification.reminder-interval-ms}
 * ({@code ERP_NOTIFICATION_REMINDER_INTERVAL_MS} in the environment) and
 * defaulting to <b>5 minutes</b>. It is a poll interval only: a due reminder is
 * delivered on the first run after its scheduled time, and the per-reminder
 * cadence (30 seconds for test reminders, 2 hours otherwise — see
 * {@code NotificationService.processReminders}) is unchanged.
 *
 * <p>The previous 30-second default existed so the test/proof-of-concept
 * reminder cycle (create → remind → remind → escalate) completed in about two
 * minutes. It is not a business requirement — it meant each instance polled the
 * notification table 120 times an hour (2 880 times a day), almost every run
 * finding nothing to do. The 5-minute default polls 12 times an hour (288 times
 * a day). A deployment that wants the old cadence back sets
 * {@code ERP_NOTIFICATION_REMINDER_INTERVAL_MS=30000} without a rebuild.
 *
 * <h2>Cost of a run</h2>
 * One bounded, oldest-due-first id query against {@code idx_notif_reminder};
 * each returned notification is then claimed atomically before a reminder is
 * created (see {@code NotificationService.processReminders}). The previous query
 * fetched the pending reminder <em>entities</em> (every column) unbounded and in
 * no particular order, and a notification that had spent its reminder budget kept
 * its last (past) schedule, so it sat at the front of the index range and was
 * re-read as a full row on every run forever. Notifications that can no longer
 * fire — resolved, or out of budget — now have their schedule cleared, so they
 * leave that range instead of being re-filtered on every run.
 *
 * <h2>Multiple instances</h2>
 * The claim is what keeps a reminder from firing twice: a second instance (or a
 * second overlapping run) evaluating the same candidate gets 0 rows from the
 * conditional claim and skips it, because the claim and the reschedule commit
 * together and the row lock is held until then. What is <em>not</em> coordinated
 * across instances is the work split — both instances poll, so a large backlog
 * is drained by whichever instance claims a row first, and the batch size is per
 * instance, not per cluster. There is no distributed scheduler lock (and none is
 * needed while notifications are single-instance); if a cluster-wide
 * "only one instance polls" guarantee is ever required, it needs a real lock
 * (e.g. a leased row or a scheduler built for clustering) rather than another
 * in-process guard.
 *
 * <p>{@code @EnableScheduling} is declared here and is relied upon by the other
 * schedulers in this package.
 */
@Component
@EnableScheduling
public class NotificationScheduler {

    private static final Logger log = Logger.getLogger(NotificationScheduler.class.getName());

    private final NotificationService notificationService;

    public NotificationScheduler(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    /** Polls for due reminders every {@code app.notification.reminder-interval-ms} (default 5 minutes). */
    @Scheduled(fixedDelayString = "${app.notification.reminder-interval-ms:300000}")
    public void processReminders() {
        try {
            int fired = notificationService.processReminders();
            if (fired > 0) {
                log.info("Notification reminder run fired " + fired + " reminder(s)");
            }
        } catch (Exception e) {
            log.warning("Notification reminder processing failed: " + e.getMessage());
        }
    }
}
