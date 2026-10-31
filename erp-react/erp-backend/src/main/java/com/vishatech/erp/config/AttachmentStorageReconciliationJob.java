package com.vishatech.erp.config;

import com.vishatech.erp.service.AttachmentStorageService;
import java.util.logging.Logger;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Keeps the shared attachment storage ledger honest.
 *
 * <p>The ledger total is maintained incrementally (see
 * {@link AttachmentStorageService}), which is exact for every write that goes
 * through the application. This job covers the writes that do not: a row
 * inserted, deleted or edited straight in MySQL, a restore from a partial
 * backup, or a crash between the ledger write and its commit. It recomputes the
 * true total from the eight attachment tables (one statement) and repairs the
 * ledger when the two disagree, logging the drift either way.
 *
 * <p>It runs once per application start (so a stale ledger is corrected before
 * the first upload of the day, and a ledger row that was never seeded is filled
 * in) and then daily on the existing {@code @EnableScheduling} infrastructure —
 * the same convention as {@code PurchasePaymentReminderScheduler}. A failure
 * here never breaks startup or request handling: enforcement falls back to
 * recomputing the total, which is what the service does when the ledger is
 * unavailable.
 */
@Component
public class AttachmentStorageReconciliationJob implements ApplicationRunner {

    private static final Logger log = Logger.getLogger(AttachmentStorageReconciliationJob.class.getName());

    private final AttachmentStorageService attachmentStorageService;

    public AttachmentStorageReconciliationJob(AttachmentStorageService attachmentStorageService) {
        this.attachmentStorageService = attachmentStorageService;
    }

    /** Daily at 03:30 server time. */
    @Scheduled(cron = "${app.attachment.reconcile-cron:0 30 3 * * *}")
    public void reconcileDaily() {
        reconcile("scheduled");
    }

    /** Startup check: correct the ledger before the first upload is accepted. */
    @Override
    public void run(ApplicationArguments args) {
        reconcile("startup");
    }

    private void reconcile(String trigger) {
        try {
            AttachmentStorageService.Reconciliation result = attachmentStorageService.reconcile(true);
            if (result.driftBytes() == 0) {
                log.info(() -> "Attachment storage ledger verified (" + trigger + "): "
                        + result.maintainedBytes() + " bytes across all attachment modules.");
            } else {
                log.warning(() -> "Attachment storage ledger " + (result.repaired() ? "repaired" : "drift")
                        + " (" + trigger + "): recorded " + result.maintainedBytes()
                        + " bytes, attachment tables hold " + result.actualBytes()
                        + " bytes (drift " + result.driftBytes() + ").");
            }
        } catch (Exception e) {
            // Never fail startup or a scheduled run because of the verification.
            log.warning("Attachment storage reconciliation failed (" + trigger + "): " + e.getMessage());
        }
    }
}
