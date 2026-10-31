package com.vishatech.erp.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.vishatech.erp.entity.Attachment;
import com.vishatech.erp.entity.AttachmentSized;
import com.vishatech.erp.entity.AttachmentStorageUsage;
import com.vishatech.erp.entity.CprAttachment;
import com.vishatech.erp.crm.entity.CustomerAttachment;
import com.vishatech.erp.crm.entity.FollowUpAttachment;
import com.vishatech.erp.entity.MarketingExpenseAttachment;
import com.vishatech.erp.entity.PurchaseAttachment;
import com.vishatech.erp.entity.QFormAttachment;
import com.vishatech.erp.entity.SalesAttachment;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.repository.MarketingExpenseAttachmentRepository;
import com.vishatech.erp.repository.PurchaseAttachmentRepository;
import com.vishatech.erp.repository.QFormAttachmentRepository;
import com.vishatech.erp.repository.SalesAttachmentRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.service.production.ProductionAttachmentService;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Attachment storage accounting.
 *
 * The shared 4 GB pool used to be recomputed on every upload with eight
 * {@code SELECT COALESCE(SUM(size), 0) FROM <attachment table>} statements. It is
 * now a maintained ledger (one row, atomic increments, same transaction as the
 * attachment row) with reconciliation against the tables.
 *
 * These tests pin the behaviour that must not change while the query count does:
 * the limit is still 4 GB and still enforced, an upload is counted once, a delete
 * gives the bytes back, a failed or rolled back upload changes nothing, a
 * replacement nets out, concurrent uploads all land, and the ledger can be
 * verified and repaired against the attachment tables.
 */
@SpringBootTest
@TestPropertySource(properties = {
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "app.upload.dir=${java.io.tmpdir}/erp-ledger-test-uploads"
})
class AttachmentStorageLedgerTests extends AbstractSecurityTest {

    private static final String MODULE = "LEDGER_TEST";

    @Autowired
    private AttachmentStorageService attachmentStorageService;

    @Autowired
    private ProductionAttachmentService productionAttachmentService;

    @Autowired
    private SalesAttachmentRepository salesAttachments;

    @Autowired
    private MarketingExpenseAttachmentRepository marketingAttachments;

    @Autowired
    private QFormAttachmentRepository qFormAttachments;

    @Autowired
    private PurchaseAttachmentRepository purchaseAttachments;

    @Autowired
    private jakarta.persistence.EntityManagerFactory entityManagerFactory;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @PersistenceContext
    private EntityManager entityManager;

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private static MockMultipartFile file(String name, int bytes) {
        return new MockMultipartFile("file", name, "text/plain", new byte[bytes]);
    }

    private long poolTotal() {
        return attachmentStorageService.getTotalBytes();
    }

    private void assertLedgerMatchesTheTables() {
        AttachmentStorageService.Reconciliation check = attachmentStorageService.reconcile(false);
        assertThat(check.driftBytes())
                .as("maintained total %s vs attachment tables %s",
                        check.maintainedBytes(), check.actualBytes())
                .isZero();
    }

    /** The real upload path: FileStorageService.store (quota check) + attachment row. */
    private long upload(long moduleId, String name, int bytes) {
        return productionAttachmentService.addAttachment(MODULE, moduleId, file(name, bytes)).id();
    }

    private void delete(long moduleId, long attachmentId) {
        productionAttachmentService.deleteAttachment(MODULE, moduleId, attachmentId);
    }

    private Statistics statistics() {
        return entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
    }

    // ------------------------------------------------------------------
    // Counting
    // ------------------------------------------------------------------

    @Test
    void firstUploadIsCountedOnce() {
        long before = poolTotal();

        long id = upload(1_001L, "first.txt", 1024);
        try {
            assertThat(poolTotal()).isEqualTo(before + 1024);
            assertLedgerMatchesTheTables();
        } finally {
            delete(1_001L, id);
        }

        assertThat(poolTotal()).isEqualTo(before);
        assertLedgerMatchesTheTables();
    }

    @Test
    void multipleUploadsAccumulateExactly() {
        long before = poolTotal();
        List<Long> ids = new ArrayList<>();

        ids.add(upload(1_002L, "a.txt", 100));
        ids.add(upload(1_002L, "b.txt", 200));
        ids.add(upload(1_002L, "c.txt", 300));

        assertThat(poolTotal()).isEqualTo(before + 600);
        assertLedgerMatchesTheTables();

        ids.forEach(id -> delete(1_002L, id));
        assertThat(poolTotal()).isEqualTo(before);
        assertLedgerMatchesTheTables();
    }

    /**
     * Documents are deleted in bulk: every module's cleanup calls Spring Data's
     * derived {@code deleteByModuleTypeAndModuleId} (invoice, credit note,
     * delivery challan, payment receipt, proforma …). It must release every
     * removed row, not just the first.
     */
    @Test
    void bulkDerivedDeleteReleasesEveryRow() {
        long before = poolTotal();
        upload(1_010L, "bulk-a.txt", 700);
        upload(1_010L, "bulk-b.txt", 300);
        assertThat(poolTotal()).isEqualTo(before + 1000);

        // Callers are document services, i.e. always inside their own transaction.
        new TransactionTemplate(transactionManager).executeWithoutResult(status ->
                salesAttachments.deleteByModuleTypeAndModuleId(MODULE, 1_010L));

        assertThat(salesAttachments.findByModuleTypeAndModuleIdOrderByUploadedAtAsc(MODULE, 1_010L))
                .isEmpty();
        assertThat(poolTotal()).isEqualTo(before);
        assertLedgerMatchesTheTables();
    }

    @Test
    void deleteReleasesTheBytes() {
        long before = poolTotal();
        long id = upload(1_003L, "delete-me.txt", 4096);

        assertThat(poolTotal()).isEqualTo(before + 4096);

        delete(1_003L, id);

        assertThat(poolTotal()).isEqualTo(before);
        assertLedgerMatchesTheTables();
    }

    /** Replacing a file is a delete of the old row plus an insert of the new one. */
    @Test
    void replacementNetsOutToTheNewFileOnly() {
        long before = poolTotal();
        long oldId = upload(1_004L, "old.txt", 500);
        long newId = upload(1_004L, "new.txt", 700);
        delete(1_004L, oldId);

        try {
            assertThat(poolTotal()).isEqualTo(before + 700);
            assertLedgerMatchesTheTables();
        } finally {
            delete(1_004L, newId);
        }

        assertThat(poolTotal()).isEqualTo(before);
    }

    @Test
    void failedUploadChangesNothing() {
        long before = poolTotal();

        // Rejected extension: never stored, never counted.
        assertThatThrownBy(() -> productionAttachmentService.addAttachment(
                MODULE, 1_005L, file("payload.exe", 2048)))
                .isInstanceOf(BadRequestException.class);

        // Empty file: rejected before anything is written.
        assertThatThrownBy(() -> productionAttachmentService.addAttachment(
                MODULE, 1_005L, file("empty.txt", 0)))
                .isInstanceOf(BadRequestException.class);

        assertThat(poolTotal()).isEqualTo(before);
        assertLedgerMatchesTheTables();
    }

    @Test
    void rolledBackUploadLeavesTheLedgerUntouched() {
        long before = poolTotal();
        TransactionTemplate template = new TransactionTemplate(transactionManager);

        assertThatThrownBy(() -> template.execute(status -> {
            productionAttachmentService.addAttachment(MODULE, 1_006L, file("rollback-a.txt", 1500));
            productionAttachmentService.addAttachment(MODULE, 1_006L, file("rollback-b.txt", 2500));
            throw new IllegalStateException("upload batch abandoned");
        })).isInstanceOf(IllegalStateException.class);

        assertThat(salesAttachments.findByModuleTypeAndModuleIdOrderByUploadedAtAsc(MODULE, 1_006L))
                .isEmpty();
        assertThat(poolTotal()).isEqualTo(before);
        assertLedgerMatchesTheTables();
    }

    @Test
    void concurrentUploadsAllLandAndNothingIsLost() throws Exception {
        long before = poolTotal();
        int threads = 5;
        int payload = 1000;
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        List<Future<Long>> results = new ArrayList<>();

        for (int i = 0; i < threads; i++) {
            int index = i;
            results.add(pool.submit(() -> {
                start.await();
                return productionAttachmentService
                        .addAttachment(MODULE, 1_007L, file("concurrent-" + index + ".txt", payload))
                        .id();
            }));
        }
        start.countDown();

        List<Long> ids = new ArrayList<>();
        for (Future<Long> result : results) {
            ids.add(result.get(30, TimeUnit.SECONDS));
        }
        pool.shutdown();

        assertThat(ids).hasSize(threads);
        assertThat(poolTotal()).isEqualTo(before + (long) threads * payload);
        assertLedgerMatchesTheTables();

        ids.forEach(id -> delete(1_007L, id));
        assertThat(poolTotal()).isEqualTo(before);
        assertLedgerMatchesTheTables();
    }

    // ------------------------------------------------------------------
    // Other attachment tables share the same pool
    // ------------------------------------------------------------------

    @Test
    void everyAttachmentTableFeedsTheOnePool() {
        long before = poolTotal();

        Long marketingId = null;
        Long qFormId = null;
        Long purchaseId = null;
        try {
            MarketingExpenseAttachment marketing = new MarketingExpenseAttachment();
            marketing.setExpenseId(9L);
            marketing.setTripId(9L);
            marketing.setName("expense.pdf");
            marketing.setStoredName("expense.pdf");
            marketing.setSize(111L);
            marketingId = marketingAttachments.save(marketing).getId();

            QFormAttachment form = new QFormAttachment();
            form.setFormId(9L);
            form.setName("form.pdf");
            form.setStoredName("form.pdf");
            form.setSize(222L);
            qFormId = qFormAttachments.save(form).getId();

            PurchaseAttachment purchase = new PurchaseAttachment();
            purchase.setDocType("RFQ");
            purchase.setDocId(9L);
            purchase.setName("rfq.pdf");
            purchase.setStoredName("rfq.pdf");
            purchase.setSize(333L);
            purchaseId = purchaseAttachments.save(purchase).getId();

            assertThat(poolTotal()).isEqualTo(before + 111 + 222 + 333);
            assertLedgerMatchesTheTables();
        } finally {
            if (marketingId != null) {
                marketingAttachments.deleteById(marketingId);
            }
            if (qFormId != null) {
                qFormAttachments.deleteById(qFormId);
            }
            if (purchaseId != null) {
                purchaseAttachments.deleteById(purchaseId);
            }
        }

        assertThat(poolTotal()).isEqualTo(before);
        assertLedgerMatchesTheTables();
    }

    /** Every pooled entity must actually carry the maintenance hook. */
    @Test
    void allEightAttachmentEntitiesAreWiredToTheLedger() {
        List<Class<?>> pooled = List.of(
                SalesAttachment.class,
                Attachment.class,
                CprAttachment.class,
                CustomerAttachment.class,
                FollowUpAttachment.class,
                QFormAttachment.class,
                MarketingExpenseAttachment.class,
                PurchaseAttachment.class);

        assertThat(pooled).hasSize(8);
        for (Class<?> type : pooled) {
            assertThat(AttachmentSized.class.isAssignableFrom(type))
                    .as("%s must be part of the shared pool", type.getSimpleName())
                    .isTrue();
            EntityListeners listeners = type.getAnnotation(EntityListeners.class);
            assertThat(listeners)
                    .as("%s must declare the storage ledger listener", type.getSimpleName())
                    .isNotNull();
            assertThat(listeners.value())
                    .as("%s listener", type.getSimpleName())
                    .contains(AttachmentStorageLedgerListener.class);
        }
    }

    // ------------------------------------------------------------------
    // Quota enforcement (unchanged limit, unchanged behaviour)
    // ------------------------------------------------------------------

    @Test
    void theConfiguredLimitIsEnforcedAndDefaultsToFourGigabytes() {
        // The capacity is configuration (ERP_ATTACHMENT_POOL_BYTES); its default
        // keeps the previous behaviour unless a deployment provisions more.
        assertThat(attachmentStorageService.getLimitBytes())
                .isEqualTo(AttachmentStorageService.DEFAULT_LIMIT_BYTES);
        assertThat(attachmentStorageService.getLimitBytes()).isEqualTo(4L * 1024L * 1024L * 1024L);

        long available = attachmentStorageService.getAvailableBytes();
        assertThat(available).isEqualTo(
                attachmentStorageService.getLimitBytes() - attachmentStorageService.getTotalBytes());

        // At the boundary the upload is still allowed …
        attachmentStorageService.assertCanUpload(available);
        // … one byte more is refused, exactly as before.
        assertThatThrownBy(() -> attachmentStorageService.assertCanUpload(available + 1))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("4.00 GB");

        // Nothing to count: no check at all (uploads of zero bytes are rejected
        // earlier by FileStorageService).
        attachmentStorageService.assertCanUpload(0);
        attachmentStorageService.assertCanUpload(-1);
    }

    // ------------------------------------------------------------------
    // Drift: detection and repair
    // ------------------------------------------------------------------

    @Test
    void outOfBandWriteIsDetectedAndRepaired() {
        long before = poolTotal();

        // A DBA-style insert straight into MySQL: the entity listeners never see it.
        new TransactionTemplate(transactionManager).executeWithoutResult(status ->
                entityManager.createNativeQuery("INSERT INTO sales_attachments"
                                + " (module_type, module_id, name, stored_name, size)"
                                + " VALUES ('LEDGER_OUT_OF_BAND', 1, 'manual.txt', 'manual.txt', 1234)")
                        .executeUpdate());

        try {
            AttachmentStorageService.Reconciliation detected = attachmentStorageService.reconcile(false);
            assertThat(detected.driftBytes())
                    .as("the ledger must under-count a row it never saw")
                    .isEqualTo(-1234L);
            assertThat(detected.repaired()).isFalse();
            assertThat(attachmentStorageService.getTotalBytes()).isEqualTo(before);

            AttachmentStorageService.Reconciliation repaired = attachmentStorageService.reconcile(true);
            assertThat(repaired.repaired()).isTrue();
            assertThat(attachmentStorageService.getTotalBytes()).isEqualTo(before + 1234);
            assertLedgerMatchesTheTables();
        } finally {
            new TransactionTemplate(transactionManager).executeWithoutResult(status ->
                    entityManager.createNativeQuery("DELETE FROM sales_attachments"
                                    + " WHERE module_type = 'LEDGER_OUT_OF_BAND'")
                            .executeUpdate());
            attachmentStorageService.reconcile(true);
        }

        assertThat(poolTotal()).isEqualTo(before);
    }

    // ------------------------------------------------------------------
    // Cost of the new path
    // ------------------------------------------------------------------

    /**
     * The whole point: the normal upload path performs no aggregate at all, and
     * reading the pool total costs exactly one primary-key statement (the eight
     * SUM aggregates are gone from the request path).
     */
    @Test
    void uploadRunsNoAggregateAndReadingTheTotalIsOneStatement() {
        long aggregatesBefore = attachmentStorageService.aggregateRuns();
        long id = upload(1_008L, "cost.txt", 512);

        try {
            assertThat(attachmentStorageService.aggregateRuns())
                    .as("an upload must not sum the attachment tables")
                    .isEqualTo(aggregatesBefore);

            Statistics statistics = statistics();
            long statementsBefore = statistics.getPrepareStatementCount();

            // The call FileStorageService.assertCanUpload makes on every upload.
            attachmentStorageService.getTotalBytes();

            assertThat(statistics.getPrepareStatementCount() - statementsBefore)
                    .as("the limit check must be one primary-key lookup, not eight aggregates")
                    .isEqualTo(1);
        } finally {
            delete(1_008L, id);
        }

        assertThat(attachmentStorageService.aggregateRuns()).isEqualTo(aggregatesBefore);
    }

    @Test
    void theLedgerRowIsASingleRowHoldingThePoolTotal() {
        long total = poolTotal();

        Long ledger = new TransactionTemplate(transactionManager).execute(status ->
                (Long) entityManager.createNativeQuery(
                                "SELECT total_bytes FROM attachment_storage_usage WHERE id = 1")
                        .getSingleResult());

        assertThat(ledger).isEqualTo(Math.max(0L, total));
        assertThat(AttachmentStorageUsage.SINGLETON_ID).isEqualTo(1L);
    }
}
