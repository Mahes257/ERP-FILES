package com.vishatech.erp.repository;

import com.vishatech.erp.dto.SalesReportRow;
import com.vishatech.erp.entity.PaymentReceipt;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PaymentReceiptRepository extends JpaRepository<PaymentReceipt, Long>, JpaSpecificationExecutor<PaymentReceipt> {

    /**
     * Sales Reports read model — see {@link QuotationRepository#findReportRows}.
     * A receipt's value is its received amount (there is no grand total).
     */
    @Query("SELECT new com.vishatech.erp.dto.SalesReportRow('paymentReceipts', 'Payment Receipts', r.id, r.receiptNo, "
            + "r.paymentDate, r.createdAt, r.amount, r.status, r.clientName) "
            + "FROM PaymentReceipt r WHERE r.latestRevision = true "
            + "AND COALESCE(LOWER(r.status), '') NOT IN ('archived', 'deleted') "
            + "AND (:status IS NULL OR COALESCE(LOWER(r.status), 'draft') = LOWER(:status)) "
            + "AND (:client IS NULL OR LOWER(r.clientName) LIKE LOWER(CONCAT('%', :client, '%'))) "
            + "AND (:fromTs IS NULL OR COALESCE(r.paymentDate, r.createdAt) >= :fromTs) "
            + "AND (:toTs IS NULL OR COALESCE(r.paymentDate, r.createdAt) < :toTs)")
    List<SalesReportRow> findReportRows(
            @Param("status") String status,
            @Param("client") String client,
            @Param("fromTs") LocalDateTime fromTs,
            @Param("toTs") LocalDateTime toTs);
    List<PaymentReceipt> findByClientId(Long clientId);

    long countByStatus(String status);

    /** CURRENT receipts already in status "received" — the Sales sweep's bounded candidate feed. */
    @Query("SELECT p FROM PaymentReceipt p WHERE p.latestRevision = true "
            + "AND LOWER(TRIM(p.status)) = 'received' "
            + "ORDER BY p.id ASC")
    List<PaymentReceipt> findReceivedSweepCandidates(Pageable pageable);

    /**
     * Every payment-receipt number. Sequence generation only needs the identifiers, so this
     * projection avoids hydrating the full aggregate graph (items, attachments, ...).
     */
    @Query("SELECT p.receiptNo FROM PaymentReceipt p WHERE p.receiptNo IS NOT NULL")
    List<String> findAllReceiptNos();

    /** Counts rows in the given status that are the CURRENT revision of their chain. */
    @Query("""
            SELECT COUNT(p) FROM PaymentReceipt p
            WHERE p.status = :status
              AND NOT EXISTS (
                SELECT 1 FROM PaymentReceipt newer
                WHERE COALESCE(newer.revisionOf, newer.id) = COALESCE(p.revisionOf, p.id)
                  AND newer.revision > p.revision
              )
            """)
    long countCurrentByStatus(@Param("status") String status);

    boolean existsByReceiptNo(String receiptNo);

    Optional<PaymentReceipt> findByReceiptNo(String receiptNo);

    long countByPaymentModeIgnoreCase(String paymentMode);

    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM PaymentReceipt p WHERE p.status NOT IN :excluded")
    BigDecimal sumAmountExcluding(@Param("excluded") List<String> excluded);

    List<PaymentReceipt> findByRevisionOfOrderByRevisionDesc(Long revisionOf);

    // ---- Sales Dashboard aggregation (read-only) ----------------------------

    /**
     * SUM of receipt amounts of the CURRENT revisions whose status (normalised
     * to lower-case/trimmed) is in the given set — the dashboard collected
     * value. Returns {@code null} when nothing matches (the dashboard reports 0).
     */
    @Query("SELECT SUM(p.amount) FROM PaymentReceipt p WHERE p.latestRevision = true "
            + "AND p.amount IS NOT NULL AND LOWER(TRIM(p.status)) IN :statuses")
    BigDecimal sumCurrentAmountByStatusIn(@Param("statuses") Collection<String> statuses);

    /**
     * (record date, amount) of the CURRENT revisions in the given statuses, for
     * the dashboard's monthly collection trend. Projected row-by-row instead of
     * summed in SQL because the chart adds per-row rupee values
     * ({@code BigDecimal.longValue()}), which a database SUM would round
     * differently.
     */
    @Query("SELECT COALESCE(p.paymentDate, p.createdAt), p.amount FROM PaymentReceipt p "
            + "WHERE p.latestRevision = true AND p.amount IS NOT NULL "
            + "AND LOWER(TRIM(p.status)) IN :statuses")
    List<Object[]> findCurrentDatesAndAmountsByStatusIn(@Param("statuses") Collection<String> statuses);

    /**
     * (client, amount) of the CURRENT revisions in the given statuses, for the
     * dashboard's top-customer ranking (grouped in the service so the blank
     * client label and the ranking order stay exactly as they were).
     */
    @Query("SELECT p.clientName, p.amount FROM PaymentReceipt p WHERE p.latestRevision = true "
            + "AND p.amount IS NOT NULL AND LOWER(TRIM(p.status)) IN :statuses")
    List<Object[]> findCurrentClientAndAmountsByStatusIn(@Param("statuses") Collection<String> statuses);
}
