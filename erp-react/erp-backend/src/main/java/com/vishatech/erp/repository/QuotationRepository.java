package com.vishatech.erp.repository;

import com.vishatech.erp.dto.SalesReportRow;
import com.vishatech.erp.entity.Quotation;
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

public interface QuotationRepository extends JpaRepository<Quotation, Long>, JpaSpecificationExecutor<Quotation> {

    /**
     * Sales Reports read model: latest-revision, non-archived quotations,
     * filtered in SQL and returned as a projection (no entity hydration).
     */
    @Query("SELECT new com.vishatech.erp.dto.SalesReportRow('quotations', 'Quotations', q.id, q.quotationNo, "
            + "q.quotationDate, q.createdAt, q.grandTotal, q.status, q.clientName) "
            + "FROM Quotation q WHERE q.latestRevision = true "
            + "AND COALESCE(LOWER(q.status), '') NOT IN ('archived', 'deleted') "
            + "AND (:status IS NULL OR COALESCE(LOWER(q.status), 'draft') = LOWER(:status)) "
            + "AND (:client IS NULL OR LOWER(q.clientName) LIKE LOWER(CONCAT('%', :client, '%'))) "
            + "AND (:fromTs IS NULL OR COALESCE(q.quotationDate, q.createdAt) >= :fromTs) "
            + "AND (:toTs IS NULL OR COALESCE(q.quotationDate, q.createdAt) < :toTs)")
    List<SalesReportRow> findReportRows(
            @Param("status") String status,
            @Param("client") String client,
            @Param("fromTs") LocalDateTime fromTs,
            @Param("toTs") LocalDateTime toTs);
    long countByStatus(String status);

    /**
     * Every quotation number. Sequence generation only needs the identifiers, so this
     * projection avoids hydrating the full aggregate graph (items, attachments, ...).
     */
    @Query("SELECT q.quotationNo FROM Quotation q WHERE q.quotationNo IS NOT NULL")
    List<String> findAllQuotationNos();

    boolean existsByQuotationNo(String quotationNo);

    Optional<Quotation> findFirstByReference(String reference);

    /**
     * Every NON-deleted quotation created from the given Cost Workout number
     * (one Cost Workout → at most one quotation). The whole revision chain of a
     * converted quotation keeps the source reference, so this returns several
     * rows for one conversion; the caller only needs the first.
     *
     * <p>A "deleted" quotation is the existing soft-delete state (rows are never
     * physically removed, see {@code QuotationService#delete}), so it no longer
     * blocks a fresh conversion.
     */
    @Query("SELECT q FROM Quotation q WHERE q.sourceCw IS NOT NULL "
            + "AND LOWER(q.sourceCw) = LOWER(:cwNo) "
            + "AND COALESCE(LOWER(q.status), '') <> 'deleted' ORDER BY q.id ASC")
    List<Quotation> findLiveBySourceCw(@Param("cwNo") String cwNo);

    /**
     * Every NON-deleted quotation carrying the given reference. Used for the
     * Profit Workout → Quotation link ({@code reference} = "Generated from Profit
     * Workout <pwNo>"): a trashed quotation no longer blocks a fresh conversion.
     */
    @Query("SELECT q FROM Quotation q WHERE q.reference = :reference "
            + "AND COALESCE(LOWER(q.status), '') <> 'deleted' ORDER BY q.id ASC")
    List<Quotation> findLiveByReference(@Param("reference") String reference);

    List<Quotation> findByReferenceStartingWith(String reference);

    long countByCurrencyIgnoreCase(String currency);

    long countByPaymentTermsIgnoreCase(String paymentTerms);

    long countByDeliveryTermsIgnoreCase(String deliveryTerms);

    long countByCityIgnoreCase(String city);

    long countByStateIgnoreCase(String state);

    long countByFromCompanyIgnoreCase(String fromCompany);

    @Query("SELECT COALESCE(SUM(q.grandTotal), 0) FROM Quotation q WHERE q.status NOT IN :excluded")
    BigDecimal sumGrandTotalExcluding(@Param("excluded") List<String> excluded);

    List<Quotation> findByRevisionOfOrderByRevisionDesc(Long revisionOf);

    /**
     * Every revision row of the given chain originals, in ONE query.
     *
     * <p>A revision row stores a suffixed number ({@code QTN-2026-000002(1)}),
     * and a Customer Purchase Order converted from a revision used to record that
     * suffixed value in {@code sales_orders.qtn_ref}. The quotation list keys each
     * row by its chain original, so it resolves the sibling revision numbers here
     * to keep such a CPO matched to its quotation — batched per page, never per
     * row.
     */
    List<Quotation> findByRevisionOfIn(Collection<Long> revisionOfs);

    // Location-master delete protection: how many quotations reference a country.
    long countByCountryIgnoreCase(String country);

    // ---- Sales Dashboard aggregation (read-only) ----------------------------
    // The dashboard never loads a table to aggregate it: every metric below is
    // filtered in SQL, so its cost does not grow with the table size.

    /**
     * SUM of grand totals of the CURRENT revisions whose status (normalised to
     * lower-case/trimmed) is in the given set — the dashboard pipeline value.
     * Returns {@code null} when nothing matches (the dashboard reports 0).
     */
    @Query("SELECT SUM(q.grandTotal) FROM Quotation q WHERE q.latestRevision = true "
            + "AND q.grandTotal IS NOT NULL AND LOWER(TRIM(q.status)) IN :statuses")
    BigDecimal sumCurrentGrandTotalByStatusIn(@Param("statuses") Collection<String> statuses);

    /**
     * (record date, grand total) of the CURRENT revisions in the given statuses,
     * for the dashboard's monthly trend. Projected row-by-row instead of summed
     * in SQL because the chart adds per-row rupee values
     * ({@code BigDecimal.longValue()}), which a database SUM would round
     * differently.
     */
    @Query("SELECT COALESCE(q.quotationDate, q.createdAt), q.grandTotal FROM Quotation q "
            + "WHERE q.latestRevision = true AND q.grandTotal IS NOT NULL "
            + "AND LOWER(TRIM(q.status)) IN :statuses")
    List<Object[]> findCurrentDatesAndTotalsByStatusIn(@Param("statuses") Collection<String> statuses);

    /**
     * CURRENT quotations in the given workflow statuses — the Sales notification
     * sweep's candidate feed. Filtered in SQL (status + latest revision) and
     * paged, so a sweep never loads the quotation table and never scans closed
     * documents. Ordering by id keeps the pagination stable.
     */
    @Query("SELECT q FROM Quotation q WHERE q.latestRevision = true "
            + "AND LOWER(TRIM(q.status)) IN :statuses "
            + "AND LOWER(TRIM(q.status)) NOT IN ('archived', 'deleted') "
            + "ORDER BY q.id ASC")
    List<Quotation> findSweepCandidates(@Param("statuses") Collection<String> statuses,
                                        Pageable pageable);

    /**
     * Newest CURRENT, non-archived/non-deleted quotations, newest record date
     * first — the dashboard's Recent Quotations list, bounded by the page size.
     */
    @Query("SELECT q FROM Quotation q WHERE q.latestRevision = true "
            + "AND LOWER(TRIM(q.status)) NOT IN ('archived', 'deleted') "
            + "ORDER BY COALESCE(q.quotationDate, q.createdAt) DESC")
    List<Quotation> findDashboardRecent(Pageable pageable);
}
