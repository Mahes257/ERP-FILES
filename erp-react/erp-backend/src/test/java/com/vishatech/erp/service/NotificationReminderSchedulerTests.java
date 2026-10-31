package com.vishatech.erp.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.vishatech.erp.config.NotificationScheduler;
import com.vishatech.erp.entity.Notification;
import com.vishatech.erp.entity.Notification.Status;
import com.vishatech.erp.repository.NotificationRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Integration tests for the notification reminder scheduler against a REAL
 * database (H2 in MySQL mode, real JPA entities and repositories, no mocks).
 *
 * <p>They pin the two things the audit asked for:
 *
 * <ol>
 *   <li><b>Polling cost</b> — the interval comes from
 *       {@code app.notification.reminder-interval-ms} with a 5-minute code and
 *       configuration default (the old 30-second value was the test/POC rate),
 *       the candidate query returns only rows that genuinely need evaluation,
 *       and a run is bounded by {@code app.notification.reminder-batch-size}.</li>
 *   <li><b>Reminder semantics</b> — eligibility, reminder contents, cadence and
 *       budget escalation are unchanged, and the same reminder is never fired
 *       twice (repeated run, or a second instance that had already listed the
 *       candidate).</li>
 * </ol>
 *
 * <p>The suite parks the ambient poller (a day-long interval) and drives
 * {@link NotificationService#processReminders()} by hand, so every run under
 * assertion is the one the test made. Recipients are unique per test, so a
 * background run can never influence an assertion.
 */
@SpringBootTest
@TestPropertySource(properties = {
        "app.notification.reminder-batch-size=3",
        // Parks the real @Scheduled poller while the tests drive the runs
        // by hand; also proves the interval is read from configuration.
        "app.notification.reminder-interval-ms=86400000"
})
class NotificationReminderSchedulerTests extends AbstractSecurityTest {

    /** Reminder cadence for non-test notifications, mirrored from the service. */
    private static final long PRODUCTION_REMINDER_INTERVAL_SECONDS = 7200L;

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private Environment environment;

    @Autowired
    private PlatformTransactionManager transactionManager;

    // ---- schedule configuration ----

    @Test
    void pollIntervalIsFiveMinutesByDefaultAndEnvironmentConfigurable() throws Exception {
        Method method = NotificationScheduler.class.getMethod("processReminders");
        Scheduled scheduled = method.getAnnotation(Scheduled.class);
        assertThat(scheduled).isNotNull();

        // The annotation has no hardcoded rate — it reads a property, and the
        // default it falls back to is 5 minutes.
        assertThat(scheduled.fixedDelayString()).isEqualTo("${app.notification.reminder-interval-ms:300000}");
        assertThat(scheduled.cron()).isEmpty(); // real fixed delay, not a cron
        String fallback = scheduled.fixedDelayString()
                .substring(scheduled.fixedDelayString().indexOf(':') + 1,
                        scheduled.fixedDelayString().lastIndexOf('}'));
        assertThat(Long.parseLong(fallback)).isEqualTo(300_000L);       // 5 minutes
        assertThat(Long.parseLong(fallback)).isNotEqualTo(30_000L);     // the old test/PoC poll rate

        // ...and the configured value is what the scheduler actually uses:
        // this suite set it to a day, and that is what resolves.
        assertThat(Long.parseLong(environment.resolvePlaceholders(scheduled.fixedDelayString()).trim()))
                .isEqualTo(86_400_000L);

        // The production default lives in configuration (not in code), overridable
        // from the environment without a rebuild.
        String properties = Files.readString(Path.of("src/main/resources/application.properties"));
        assertThat(properties)
                .contains("app.notification.reminder-interval-ms=${ERP_NOTIFICATION_REMINDER_INTERVAL_MS:300000}")
                .contains("app.notification.reminder-batch-size=${ERP_NOTIFICATION_REMINDER_BATCH_SIZE:200}");

        // @EnableScheduling is declared by this component and is relied upon by the
        // other schedulers in the same package.
        assertThat(NotificationScheduler.class.getAnnotation(EnableScheduling.class)).isNotNull();
    }

    // ---- candidate selection ----

    @Test
    void theSchedulerQueryReturnsOnlyRowsThatNeedEvaluation() {
        long recipient = 9_011L;
        LocalDateTime now = LocalDateTime.now();

        Notification due = save(recipient, "GENERAL", 3, now.minusMinutes(1), false);
        Notification notDueYet = save(recipient, "GENERAL", 3, now.plusMinutes(1), false);
        Notification unscheduled = save(recipient, "GENERAL", 3, null, false);
        Notification noBudgetLeft = save(recipient, "GENERAL", 0, now.minusMinutes(1), false);
        Notification resolved = save(recipient, "GENERAL", 3, now.minusMinutes(1), false);
        resolved.setStatus(Status.RESOLVED);
        resolved.setResolvedAt(now);
        notificationRepository.save(resolved);

        List<Long> candidates = notificationRepository.findDueReminderIds(now, PageRequest.of(0, 50));

        assertThat(candidates).contains(due.getId());
        assertThat(candidates).doesNotContain(
                notDueYet.getId(),   // schedule still in the future
                unscheduled.getId(), // no schedule at all
                noBudgetLeft.getId(),// reminder budget already spent
                resolved.getId());   // resolved notifications never remind
    }

    // ---- eligible reminder ----

    @Test
    void dueReminderIsFiredOnceAndRescheduled() {
        long recipient = 9_012L;
        LocalDateTime now = LocalDateTime.now();
        Notification original = save(recipient, "GENERAL", 3, now.minusSeconds(5), false);

        int fired = notificationService.processReminders();
        assertThat(fired).isGreaterThanOrEqualTo(1);
        assertThat(reminders(recipient)).hasSize(1);

        Notification reloaded = notificationRepository.findById(original.getId()).orElseThrow();
        assertThat(reloaded.getReminderCount()).isEqualTo(1);
        assertThat(reloaded.getNextReminderAt()).isNotNull().isAfter(now);

        Notification reminder = reminders(recipient).get(0);
        assertThat(reminder.getTitle()).isEqualTo("Reminder: " + reloaded.getTitle());
        assertThat(reminder.getMessage()).isEqualTo("Reminder #1 — " + reloaded.getMessage());
        assertThat(reminder.getStatus()).isEqualTo(Status.UNREAD);
        assertThat(reminder.getSenderUserId()).isNull(); // system-generated
        assertThat(reminder.getModule()).isEqualTo(reloaded.getModule());
        assertThat(reminder.getReferenceId()).isEqualTo(reloaded.getReferenceId());
        assertThat(reminder.getNotificationType()).isEqualTo(reloaded.getNotificationType());
        assertThat(reminder.isTest()).isEqualTo(reloaded.isTest());
    }

    // ---- already-processed reminder ----

    @Test
    void alreadyProcessedReminderIsNotFiredAgain() {
        long recipient = 9_013L;
        Notification original = save(recipient, "GENERAL", 3, LocalDateTime.now().minusSeconds(5), false);

        notificationService.processReminders();
        assertThat(reminders(recipient)).hasSize(1);

        // A repeated run (or another instance evaluating the same candidates) must
        // not fire it a second time while the interval has not elapsed.
        notificationService.processReminders();
        notificationService.processReminders();

        assertThat(reminders(recipient)).hasSize(1);
        assertThat(notificationRepository.findById(original.getId()).orElseThrow().getReminderCount())
                .isEqualTo(1);
    }

    @Test
    void resolvedAndExhaustedNotificationsAreNeverReminded() {
        long resolvedRecipient = 9_014L;
        long exhaustedRecipient = 9_015L;

        Notification resolved = save(resolvedRecipient, "GENERAL", 3, LocalDateTime.now().minusMinutes(1), false);
        resolved.setStatus(Status.RESOLVED);
        resolved.setResolvedAt(LocalDateTime.now());
        notificationRepository.save(resolved);

        // Budget of 1: a single reminder is all this notification may ever get.
        Notification exhausted = save(exhaustedRecipient, "GENERAL", 1, LocalDateTime.now().minusMinutes(1), false);

        notificationService.processReminders();

        assertThat(reminders(resolvedRecipient)).isEmpty();
        assertThat(reminders(exhaustedRecipient)).hasSize(1);

        Notification spent = notificationRepository.findById(exhausted.getId()).orElseThrow();
        assertThat(spent.getReminderCount()).isEqualTo(1);
        // The schedule is cleared once nothing more can fire, so an exhausted
        // notification leaves the scheduler's index range instead of being
        // re-filtered on every future run.
        assertThat(spent.getNextReminderAt()).isNull();

        notificationService.processReminders();
        assertThat(reminders(exhaustedRecipient)).hasSize(1);
        assertThat(reminders(resolvedRecipient)).isEmpty();
    }

    // ---- no eligible records ----

    @Test
    void runWithNoEligibleRecordsIsANoOp() {
        long recipient = 9_016L;
        Notification notDueYet = save(recipient, "GENERAL", 3, LocalDateTime.now().plusHours(3), false);
        Notification unscheduled = save(recipient, "GENERAL", 3, null, false);
        Notification noBudget = save(recipient, "GENERAL", 0, LocalDateTime.now().minusMinutes(1), false);

        int fired = notificationService.processReminders();

        assertThat(reminders(recipient)).isEmpty();
        assertThat(fired).isZero();
        assertThat(notificationRepository.findById(notDueYet.getId()).orElseThrow().getReminderCount()).isZero();
        assertThat(notificationRepository.findById(unscheduled.getId()).orElseThrow().getReminderCount()).isZero();
        assertThat(notificationRepository.findById(noBudget.getId()).orElseThrow().getReminderCount()).isZero();
    }

    // ---- repeated scheduler execution ----

    @Test
    void repeatedRunsFireEachReminderExactlyOncePerInterval() {
        long recipient = 9_017L;
        Notification original = save(recipient, "GENERAL", 3, LocalDateTime.now().minusSeconds(5), false);

        for (int run = 0; run < 5; run++) {
            notificationService.processReminders(); // scheduler firing far more often than the cadence
        }
        assertThat(reminders(recipient)).hasSize(1);
        assertThat(notificationRepository.findById(original.getId()).orElseThrow().getReminderCount()).isEqualTo(1);

        // The cadence (2 hours for non-test reminders) is preserved: only once it
        // is due again does the next reminder fire, up to the budget.
        forceDue(original.getId());
        notificationService.processReminders();
        assertThat(reminders(recipient)).hasSize(2);

        forceDue(original.getId());
        notificationService.processReminders();
        assertThat(reminders(recipient)).hasSize(3); // budget = maxReminders = 3

        Notification spent = notificationRepository.findById(original.getId()).orElseThrow();
        assertThat(spent.getReminderCount()).isEqualTo(3);
        assertThat(spent.getNextReminderAt()).isNull();
        assertThat(notificationRepository.findDueReminderIds(LocalDateTime.now(), PageRequest.of(0, 50)))
                .doesNotContain(original.getId());

        // Even a forcibly re-due exhausted notification stays quiet.
        forceDue(original.getId());
        notificationService.processReminders();
        assertThat(reminders(recipient)).hasSize(3);
    }

    // ---- duplicate processing / multiple instances ----

    @Test
    void aSecondInstanceCannotFireTheReminderItHadListed() {
        long recipient = 9_018L;
        LocalDateTime now = LocalDateTime.now();
        Notification original = save(recipient, "GENERAL", 2, now.minusSeconds(5), false);

        // Instance A reads its candidate list...
        assertThat(notificationRepository.findDueReminderIds(now, PageRequest.of(0, 50)))
                .contains(original.getId());

        // ...instance B claims and fires it (claim + reschedule commit together)...
        notificationService.processReminders();
        assertThat(reminders(recipient)).hasSize(1);

        // ...and A's claim on the row it had listed yields nothing, so A skips it
        // instead of firing a duplicate.
        assertThat(inTransaction(() -> notificationRepository.claimReminder(original.getId(), now))).isZero();
        assertThat(reminders(recipient)).hasSize(1);

        // The claim itself is atomic: for a fresh due row the first claim wins and
        // a concurrent one on the same row loses (budget of 1).
        Notification once = save(recipient, "GENERAL", 1, LocalDateTime.now().minusSeconds(1), false);
        assertThat(inTransaction(() -> notificationRepository.claimReminder(once.getId(), LocalDateTime.now())))
                .isEqualTo(1);
        assertThat(inTransaction(() -> notificationRepository.claimReminder(once.getId(), LocalDateTime.now())))
                .isZero();
        assertThat(notificationRepository.findById(once.getId()).orElseThrow().getReminderCount()).isEqualTo(1);
    }

    // ---- bounded work per run ----

    @Test
    void oneRunIsBoundedByTheBatchSizeAndABacklogDrainsOverFollowingRuns() {
        long recipient = 9_019L;
        LocalDateTime oldest = LocalDateTime.now().minusDays(5);
        Map<Long, String> titlesById = new LinkedHashMap<>();
        for (int i = 0; i < 8; i++) {
            Notification n = save(recipient, "GENERAL", 2, oldest.plusSeconds(i), false);
            titlesById.put(n.getId(), n.getTitle());
        }

        int firstRun = notificationService.processReminders();

        assertThat(firstRun).isEqualTo(3); // app.notification.reminder-batch-size=3
        assertThat(reminders(recipient)).hasSize(3);

        // Oldest-due-first: exactly the three oldest candidates were the ones fired.
        Set<String> expected = titlesById.values().stream().limit(3)
                .map(title -> "Reminder: " + title)
                .collect(Collectors.toSet());
        assertThat(reminders(recipient).stream().map(Notification::getTitle).collect(Collectors.toSet()))
                .isEqualTo(expected);

        // The backlog is not lost — it drains over the following runs.
        for (int run = 0; run < 6 && reminders(recipient).size() < 8; run++) {
            notificationService.processReminders();
        }
        assertThat(reminders(recipient)).hasSize(8);
        assertThat(reminders(recipient).size()).isLessThanOrEqualTo(titlesById.size());
    }

    // ---- helpers ----

    private Notification save(long recipient, String notificationType, int maxReminders,
                              LocalDateTime nextReminderAt, boolean test) {
        Notification n = new Notification();
        n.setRecipientUserId(recipient);
        n.setTitle("Scheduler test " + recipient + " " + UUID.randomUUID());
        n.setMessage("Body for " + recipient);
        n.setModule("GENERAL");
        n.setReferenceType("SalesOrder");
        n.setStatus(Status.UNREAD);
        n.setNotificationType(notificationType);
        n.setTest(test);
        n.setMaxReminders(maxReminders);
        n.setNextReminderAt(nextReminderAt);
        return notificationRepository.save(n);
    }

    /** Reminder notifications delivered to a recipient, oldest first. */
    private List<Notification> reminders(long recipient) {
        List<Notification> all = new ArrayList<>(
                notificationRepository.findByRecipientUserIdOrderByCreatedAtDesc(recipient));
        all.removeIf(n -> !n.getTitle().startsWith("Reminder: "));
        return all;
    }

    /** Moves a notification's schedule into the past, simulating elapsed time. */
    private void forceDue(Long id) {
        Notification n = notificationRepository.findById(id).orElseThrow();
        n.setNextReminderAt(LocalDateTime.now().minusSeconds(1));
        notificationRepository.save(n);
    }

    private <T> T inTransaction(Supplier<T> action) {
        return new TransactionTemplate(transactionManager).execute(status -> action.get());
    }
}
