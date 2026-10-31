package com.vishatech.erp.service;

import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.repository.AttachmentStorageUsageRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Project-wide shared attachment storage pool.
 *
 * ALL attachment-enabled modules (leads, CPR, customers, follow-ups and every
 * Sales Execution module: quotation, sales order, sales contract, proforma
 * invoice, delivery challan, invoice, credit note, payment receipt, ...) draw
 * from ONE shared, configurable capacity. This service is the single backend
 * enforcement point.
 *
 * <h2>How the total is known</h2>
 * The pool total used to be recomputed on every upload with eight
 * {@code SELECT COALESCE(SUM(size), 0) FROM <table>} statements — eight
 * full-table aggregates per upload, on the request path.
 *
 * It is now maintained. {@code attachment_storage_usage} holds one row with the
 * running total, and {@link AttachmentStorageLedgerListener} hands every
 * attachment insert/delete to this service, which applies the delta to that row:
 *
 * <ul>
 *   <li>so an upload checks the pool limit with ONE primary-key lookup;</li>
 *   <li>the increment is applied over the SAME connection the attachment row is
 *       being written on, so it commits with it and rolls back with it (failed
 *       upload, validation error, an exception later in the transaction);</li>
 *   <li>the arithmetic is {@code total_bytes = total_bytes + ?} in SQL, never a
 *       read-modify-write, so concurrent uploads cannot lose each other's
 *       update;</li>
 *   <li>it is plain JDBC and therefore touches no JPA-managed state — an
 *       attachment insert or delete reaches this service from a JPA entity
 *       callback, where running an ORM query could re-enter (or force) a flush.</li>
 * </ul>
 *
 * {@link #reconcile(boolean)} is the safety net: it compares the maintained
 * total with the true sum of the attachment tables (one statement) and can
 * repair a drift — which is what a manual SQL insert/delete outside the
 * application would cause. It runs at startup, on a daily schedule (see
 * {@code AttachmentStorageReconciliationJob}) and on demand.
 */
@Service
public class AttachmentStorageService {

    private static final Logger log = LoggerFactory.getLogger(AttachmentStorageService.class);

    /**
     * Default shared attachment capacity when ERP_ATTACHMENT_POOL_BYTES is not
     * set. Kept at the previous 4 GB so an existing deployment behaves exactly
     * as before until it explicitly provisions more. Enforcement always uses
     * the configured value ({@link #getLimitBytes()}), never this constant.
     */
    public static final long DEFAULT_LIMIT_BYTES = 4L * 1024L * 1024L * 1024L;

    /** Configured project-wide capacity in bytes (ERP_ATTACHMENT_POOL_BYTES). */
    private final long limitBytes;

    /**
     * Atomic increment (negative to decrement) — the only way the ledger total
     * is ever changed.
     */
    private static final String APPLY_DELTA_SQL =
            "UPDATE attachment_storage_usage SET total_bytes = total_bytes + ?,"
                    + " updated_at = CURRENT_TIMESTAMP WHERE id = 1";

    /**
     * Every table that stores attachment rows. Used only by the fallback sum and
     * by reconciliation — the normal upload path never touches these tables.
     */
    private static final List<String> ATTACHMENT_TABLES = List.of(
            "sales_attachments",
            "lead_attachments",
            "cpr_attachments",
            "customer_attachments",
            "followup_attachments",
            "qform_attachments",
            "marketing_expense_attachments",
            "purchase_attachments"
    );

    private final AttachmentStorageUsageRepository usageRepository;

    /**
     * Plain JDBC against the transaction-bound connection. Deliberately not the
     * JPA repository: this statement runs from JPA entity callbacks, and it must
     * neither flush nor detach anything that is mid-write in the same
     * persistence context.
     */
    private final JdbcTemplate jdbcTemplate;

    /** How many times the expensive aggregate has run — exposed for monitoring/tests. */
    private final AtomicLong aggregateRuns = new AtomicLong();

    @PersistenceContext
    private EntityManager entityManager;

    public AttachmentStorageService(AttachmentStorageUsageRepository usageRepository,
                                    DataSource dataSource,
                                    @org.springframework.beans.factory.annotation.Value(
                                            "${app.attachments.pool-bytes:" + DEFAULT_LIMIT_BYTES + "}")
                                    long limitBytes) {
        this.usageRepository = usageRepository;
        this.jdbcTemplate = new JdbcTemplate(dataSource);
        // A non-positive setting would make every upload fail; fail at startup
        // with a clear reason instead of silently disabling attachments.
        if (limitBytes <= 0) {
            throw new IllegalStateException(
                    "app.attachments.pool-bytes (ERP_ATTACHMENT_POOL_BYTES) must be greater than zero");
        }
        this.limitBytes = limitBytes;
        log.info("Attachment storage pool configured at {} bytes ({}).",
                limitBytes, humanBytes(limitBytes));
    }

    // ------------------------------------------------------------------
    // Reads (the upload path only ever takes the first branch)
    // ------------------------------------------------------------------

    /**
     * Total bytes currently stored by ALL attachment modules (shared pool).
     *
     * One primary-key lookup against the maintained ledger. When the ledger row
     * does not exist yet it is created from the true total, so the pool is never
     * under-counted on a database where the ledger table was just created.
     */
    public long getTotalBytes() {
        Long maintained = readLedger();
        if (maintained != null) {
            // A negative value could only come from drift; the limit check must
            // never see it. reconcile() reports and repairs the real number.
            return Math.max(0L, maintained);
        }
        long actual = actualTotalBytes();
        seedLedger(actual);
        return actual;
    }

    /** The configured shared project-wide capacity. */
    public long getLimitBytes() {
        return limitBytes;
    }

    /** Remaining capacity: {@code limit - total} (never negative). */
    public long getAvailableBytes() {
        return Math.max(0, limitBytes - getTotalBytes());
    }

    /**
     * Backend enforcement. Throws {@link BadRequestException} when accepting
     * {@code incomingBytes} would push the shared pool over the configured
     * capacity. Callers invoke this BEFORE writing the file to disk / the
     * database, so an over-limit upload is rejected without saving the file.
     *
     * <p>Only the limit source changed — it reads the maintained total instead
     * of recomputing it from eight tables, and the capacity now comes from
     * config instead of a constant.
     */
    public void assertCanUpload(long incomingBytes) {
        if (incomingBytes <= 0) {
            return;
        }
        if (getTotalBytes() + incomingBytes > limitBytes) {
            throw new BadRequestException(
                    "Project-wide attachment storage limit reached (" + humanBytes(limitBytes) + "). "
                            + "This upload would exceed the shared " + humanBytes(limitBytes)
                            + " attachment storage capacity. Free space by deleting unused attachments "
                            + "or raise ERP_ATTACHMENT_POOL_BYTES after provisioning more storage.");
        }
    }

    /** Human-readable byte size for operator-facing messages. */
    public static String humanBytes(long bytes) {
        if (bytes >= 1024L * 1024L * 1024L) {
            return String.format(java.util.Locale.ROOT, "%.2f GB", bytes / (1024.0 * 1024.0 * 1024.0));
        }
        if (bytes >= 1024L * 1024L) {
            return String.format(java.util.Locale.ROOT, "%.1f MB", bytes / (1024.0 * 1024.0));
        }
        if (bytes >= 1024L) {
            return String.format(java.util.Locale.ROOT, "%.1f KB", bytes / 1024.0);
        }
        return bytes + " bytes";
    }

    // ------------------------------------------------------------------
    // Maintenance (called by AttachmentStorageLedgerListener)
    // ------------------------------------------------------------------

    /** An attachment row was inserted: account for its bytes. */
    public void recordAttachmentAdded(long bytes) {
        if (bytes > 0) {
            applyDelta(bytes);
        }
    }

    /** An attachment row was deleted (or replaced): release its bytes. */
    public void recordAttachmentRemoved(long bytes) {
        if (bytes > 0) {
            applyDelta(-bytes);
        }
    }

    private void applyDelta(long delta) {
        try {
            int updated = jdbcTemplate.update(APPLY_DELTA_SQL, delta);
            if (updated == 0) {
                // Ledger row absent — for example the table was created but never
                // seeded. Put the true total in place before the pool is read.
                seedLedger(actualTotalBytes());
            }
        } catch (DataAccessException e) {
            // The ledger is an accelerator, never a gate: if it cannot be
            // written, uploads must still succeed and the total is still derived
            // from the attachment tables (see getTotalBytes()).
            log.warn("Attachment storage ledger not updated ({} bytes): {}. "
                            + "The pool total will be recomputed from the attachment tables.",
                    delta, e.getMostSpecificCause().getMessage());
        }
    }

    // ------------------------------------------------------------------
    // Reconciliation
    // ------------------------------------------------------------------

    /**
     * Compares the maintained total with the true total of the attachment tables
     * (ONE statement) and optionally repairs a drift.
     *
     * @param repair when true, the ledger is overwritten with the true total
     * @return the comparison, including a non-zero {@code driftBytes} when the
     *         two disagree (negative = the ledger under-counts, which is the
     *         direction that would weaken enforcement)
     */
    public Reconciliation reconcile(boolean repair) {
        long actual = actualTotalBytes();
        Long maintained = readLedger();
        if (maintained == null) {
            seedLedger(actual);
            return new Reconciliation(actual, actual, 0L, true);
        }
        long drift = maintained - actual;
        boolean repaired = false;
        if (drift != 0) {
            if (repair) {
                usageRepository.resetTotal(actual);
                repaired = true;
            }
            log.warn("Attachment storage ledger drift detected: maintained={} bytes, actual={} bytes, "
                            + "drift={} bytes{}. {}",
                    maintained, actual, drift,
                    actual > maintained ? " (UNDER-count: the pool was larger than recorded)" : "",
                    repaired ? "Ledger repaired." : "Not repaired (verification only).");
        }
        return new Reconciliation(maintained, actual, drift, repaired);
    }

    /** The true pool total straight from the attachment tables, in one statement. */
    public long actualTotalBytes() {
        aggregateRuns.incrementAndGet();
        try {
            Long total = usageRepository.sumAllAttachmentTables();
            return total == null ? 0L : total;
        } catch (DataAccessException e) {
            // A deployment whose schema predates one of the attachment tables
            // must not lose enforcement: fall back to per-table sums, which
            // tolerate a missing table (that table then contributes 0).
            log.warn("Could not sum all attachment tables in one statement ({}); "
                            + "falling back to per-table sums.",
                    e.getMostSpecificCause().getMessage());
            return sumSizesPerTable();
        }
    }

    /** Times the expensive aggregate has run since startup (observability/tests). */
    public long aggregateRuns() {
        return aggregateRuns.get();
    }

    /** The comparison returned by {@link #reconcile(boolean)}. */
    public record Reconciliation(long maintainedBytes, long actualBytes, long driftBytes, boolean repaired) {
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    /** The maintained total, or null when the ledger table/row is unavailable. */
    private Long readLedger() {
        try {
            return usageRepository.findTotalBytes();
        } catch (DataAccessException e) {
            log.warn("Attachment storage ledger unavailable ({}); the shared pool total will be "
                            + "recomputed from the attachment tables on every upload. "
                            + "Apply docs/attachment_storage_usage.sql to enable the ledger.",
                    e.getMostSpecificCause().getMessage());
            return null;
        }
    }

    private void seedLedger(long actual) {
        try {
            usageRepository.seed(actual);
            log.info("Attachment storage ledger initialised at {} bytes.", actual);
        } catch (DataAccessException e) {
            // Another instance seeded it first, or the table does not exist yet.
            log.debug("Attachment storage ledger not seeded: {}", e.getMostSpecificCause().getMessage());
        }
    }

    /**
     * Last-resort sum used only when the single-statement aggregate is not
     * possible. A table with no rows (or missing in an older schema)
     * contributes 0 bytes instead of failing the check.
     */
    private long sumSizesPerTable() {
        long total = 0;
        for (String table : ATTACHMENT_TABLES) {
            try {
                Object result = entityManager
                        .createNativeQuery("SELECT COALESCE(SUM(size), 0) FROM " + table)
                        .getSingleResult();
                total += ((Number) result).longValue();
            } catch (Exception e) {
                // Table has no rows yet (or is missing in an older schema) → 0 bytes.
            }
        }
        return total;
    }
}
