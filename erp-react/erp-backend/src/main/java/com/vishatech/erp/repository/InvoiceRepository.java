package com.vishatech.erp.repository;

import com.vishatech.erp.dto.SalesReportRow;
import com.vishatech.erp.entity.Invoice;
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

public interface InvoiceRepository extends JpaRepository<Invoice, Long>, JpaSpecificationExecutor<Invoice> {

    /** Sales Reports read model — see {@link QuotationRepository#findReportRows}. */
    @Query("SELECT new com.vishatech.erp.dto.SalesReportRow('invoices', 'Invoices', i.id, i.invoiceNo, "
            + "i.invoiceDate, i.createdAt, i.grandTotal, i.status, i.clientName) "
            + "FROM Invoice i WHERE i.latestRevision = true "
            + "AND COALESCE(LOWER(i.status), '') NOT IN ('archived', 'deleted') "
            + "AND (:status IS NULL OR COALESCE(LOWER(i.status), 'draft') = LOWER(:status)) "
            + "AND (:client IS NULL OR LOWER(i.clientName) LIKE LOWER(CONCAT('%', :client, '%'))) "
            + "AND (:fromTs IS NULL OR COALESCE(i.invoiceDate, i.createdAt) >= :fromTs) "
            + "AND (:toTs IS NULL OR COALESCE(i.invoiceDate, i.createdAt) < :toTs)")
    List<SalesReportRow> findReportRows(
            @Param("status") String status,
            @Param("client") String client,
            @Param("fromTs") LocalDateTime fromTs,
            @Param("toTs") LocalDateTime toTs);
    List<Invoice> findByClientId(Long clientId);

    long countByStatus(String status);

    /**
     * CURRENT invoices that are overdue by the given instant — the Sales sweeps
     * bounded candidate feed. The settled statuses are excluded in SQL, so paid,
     * cancelled, archived and deleted invoices are never loaded at all.
     */
    @Query("SELECT i FROM Invoice i WHERE i.latestRevision = true "
            + "AND i.dueDate IS NOT NULL AND i.dueDate < :before "
            + "AND LOWER(TRIM(i.status)) NOT IN ('paid', 'cancelled', 'deleted', 'archived') "
            + "ORDER BY i.id ASC")
    List<Invoice> findOverdueSweepCandidates(@Param("before") LocalDateTime before,
                                             Pageable pageable);

    /**
     * Every invoice number. Sequence generation only needs the identifiers, so this
     * projection avoids hydrating the full aggregate graph (items, attachments, ...).
     */
    @Query("SELECT i.invoiceNo FROM Invoice i WHERE i.invoiceNo IS NOT NULL")
    List<String> findAllInvoiceNos();

    /** Counts rows in the given status that are the CURRENT revision of their chain. */
    @Query("""
            SELECT COUNT(i) FROM Invoice i
            WHERE i.status = :status
              AND NOT EXISTS (
                SELECT 1 FROM Invoice newer
                WHERE COALESCE(newer.revisionOf, newer.id) = COALESCE(i.revisionOf, i.id)
                  AND newer.revision > i.revision
              )
            """)
    long countCurrentByStatus(@Param("status") String status);

    boolean existsByInvoiceNo(String invoiceNo);

    Optional<Invoice> findByInvoiceNo(String invoiceNo);

    /**
     * Current (non-deleted, non-superseded) invoices for a whole set of invoice
     * numbers, in ONE query — the linked-document lookups behind the Credit
     * Notes list (due date / CPO chain) resolve a page, not a row at a time.
     */
    @Query("SELECT i FROM Invoice i WHERE i.invoiceNo IN :invoiceNos "
            + "AND COALESCE(LOWER(i.status), '') <> 'deleted' AND i.latestRevision = true")
    List<Invoice> findCurrentByInvoiceNoIn(@Param("invoiceNos") Collection<String> invoiceNos);

    long countByBankTypeIgnoreCase(String bankType);

    @Query("SELECT COALESCE(SUM(i.grandTotal), 0) FROM Invoice i WHERE i.status NOT IN :excluded")
    BigDecimal sumGrandTotalExcluding(@Param("excluded") List<String> excluded);

    List<Invoice> findByRevisionOfOrderByRevisionDesc(Long revisionOf);

    // Location-master delete protection: how many invoices reference a location.
    long countByBuyerCountryIgnoreCase(String buyerCountry);

    long countByCompanyStateIgnoreCase(String companyState);

    // ---- Sales Dashboard aggregation (read-only) ----------------------------

    /**
     * SUM of grand totals of the CURRENT revisions whose status (normalised to
     * lower-case/trimmed) is in the given set — the dashboard invoiced value.
     * Returns {@code null} when nothing matches (the dashboard reports 0).
     */
    @Query("SELECT SUM(i.grandTotal) FROM Invoice i WHERE i.latestRevision = true "
            + "AND i.grandTotal IS NOT NULL AND LOWER(TRIM(i.status)) IN :statuses")
    BigDecimal sumCurrentGrandTotalByStatusIn(@Param("statuses") Collection<String> statuses);

    /**
     * (record date, grand total) of the CURRENT revisions in the given statuses,
     * for the dashboard's monthly trend. Projected row-by-row instead of summed
     * in SQL because the chart adds per-row rupee values
     * ({@code BigDecimal.longValue()}), which a database SUM would round
     * differently.
     */
    @Query("SELECT COALESCE(i.invoiceDate, i.createdAt), i.grandTotal FROM Invoice i "
            + "WHERE i.latestRevision = true AND i.grandTotal IS NOT NULL "
            + "AND LOWER(TRIM(i.status)) IN :statuses")
    List<Object[]> findCurrentDatesAndTotalsByStatusIn(@Param("statuses") Collection<String> statuses);

    /**
     * (client, grand total) of the CURRENT revisions in the given statuses, for
     * the dashboard's top-customer ranking (grouped in the service so the blank
     * client label and the ranking order stay exactly as they were).
     */
    @Query("SELECT i.clientName, i.grandTotal FROM Invoice i WHERE i.latestRevision = true "
            + "AND i.grandTotal IS NOT NULL AND LOWER(TRIM(i.status)) IN :statuses")
    List<Object[]> findCurrentClientAndTotalsByStatusIn(@Param("statuses") Collection<String> statuses);
}
