package com.vishatech.erp.repository;

import com.vishatech.erp.entity.AttachmentStorageUsage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ledger access for the shared project-wide attachment storage pool.
 *
 * <p>These are the read/seed/repair statements. The per-upload increment is NOT
 * here: it runs from JPA entity callbacks, where an ORM query could re-enter a
 * flush, so {@link com.vishatech.erp.service.AttachmentStorageService} issues it
 * as plain JDBC over the transaction-bound connection instead (still
 * {@code total_bytes = total_bytes + ?}, so it stays atomic and rolls back with
 * the attachment row).
 *
 * {@code @Transactional} is on the interface so a call made outside a service
 * transaction (for example the first read from a controller) still gets one,
 * while a call made inside the upload transaction joins it.
 */
@Repository
@Transactional
public interface AttachmentStorageUsageRepository extends JpaRepository<AttachmentStorageUsage, Long> {

    /**
     * The eight tables that make up the shared 4 GB pool, summed in ONE
     * statement. Used to seed a missing ledger row and to reconcile it; the
     * upload path never runs this.
     */
    String SUM_ALL_ATTACHMENT_TABLES_SQL = "SELECT COALESCE(SUM(total), 0) FROM ("
            + "SELECT COALESCE(SUM(size), 0) AS total FROM sales_attachments"
            + " UNION ALL SELECT COALESCE(SUM(size), 0) FROM lead_attachments"
            + " UNION ALL SELECT COALESCE(SUM(size), 0) FROM cpr_attachments"
            + " UNION ALL SELECT COALESCE(SUM(size), 0) FROM customer_attachments"
            + " UNION ALL SELECT COALESCE(SUM(size), 0) FROM followup_attachments"
            + " UNION ALL SELECT COALESCE(SUM(size), 0) FROM qform_attachments"
            + " UNION ALL SELECT COALESCE(SUM(size), 0) FROM marketing_expense_attachments"
            + " UNION ALL SELECT COALESCE(SUM(size), 0) FROM purchase_attachments"
            + ") pool_totals";

    /** The maintained pool total, or {@code null} when the ledger row is missing. */
    @Query(value = "SELECT total_bytes FROM attachment_storage_usage WHERE id = 1", nativeQuery = true)
    Long findTotalBytes();

    /** Creates the singleton row with the given total (only valid while it is absent). */
    @Modifying
    @Query(value = "INSERT INTO attachment_storage_usage (id, total_bytes, updated_at)"
            + " VALUES (1, :bytes, CURRENT_TIMESTAMP)", nativeQuery = true)
    int seed(@Param("bytes") long bytes);

    /** Overwrites the maintained total (used by reconciliation repair only). */
    @Modifying
    @Query(value = "UPDATE attachment_storage_usage SET total_bytes = :bytes,"
            + " updated_at = CURRENT_TIMESTAMP WHERE id = 1", nativeQuery = true)
    int resetTotal(@Param("bytes") long bytes);

    /** True total across every attachment table — one statement, never eight. */
    @Query(value = SUM_ALL_ATTACHMENT_TABLES_SQL, nativeQuery = true)
    Long sumAllAttachmentTables();
}
