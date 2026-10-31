package com.vishatech.erp.repository;

import com.vishatech.erp.dto.SalesReportRow;
import com.vishatech.erp.entity.SalesOrder;
import com.vishatech.erp.crm.entity.Customer;
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

public interface SalesOrderRepository extends JpaRepository<SalesOrder, Long>, JpaSpecificationExecutor<SalesOrder> {

    /** Sales Reports read model — see {@link QuotationRepository#findReportRows}. */
    @Query("SELECT new com.vishatech.erp.dto.SalesReportRow('salesOrders', 'Customer Purchase Orders', o.id, o.soNo, "
            + "o.orderDate, o.createdAt, o.grandTotal, o.status, o.clientName) "
            + "FROM SalesOrder o WHERE o.latestRevision = true "
            + "AND COALESCE(LOWER(o.status), '') NOT IN ('archived', 'deleted') "
            + "AND (:status IS NULL OR COALESCE(LOWER(o.status), 'draft') = LOWER(:status)) "
            + "AND (:client IS NULL OR LOWER(o.clientName) LIKE LOWER(CONCAT('%', :client, '%'))) "
            + "AND (:fromTs IS NULL OR COALESCE(o.orderDate, o.createdAt) >= :fromTs) "
            + "AND (:toTs IS NULL OR COALESCE(o.orderDate, o.createdAt) < :toTs)")
    List<SalesReportRow> findReportRows(
            @Param("status") String status,
            @Param("client") String client,
            @Param("fromTs") LocalDateTime fromTs,
            @Param("toTs") LocalDateTime toTs);
    long countByStatus(String status);

    /** CURRENT customer POs awaiting approval — the Sales sweep's bounded candidate feed. */
    @Query("SELECT o FROM SalesOrder o WHERE o.latestRevision = true "
            + "AND LOWER(TRIM(o.status)) IN :statuses "
            + "AND LOWER(TRIM(o.status)) NOT IN ('archived', 'deleted') "
            + "ORDER BY o.id ASC")
    List<SalesOrder> findSweepCandidates(@Param("statuses") Collection<String> statuses,
                                         Pageable pageable);

    /**
     * Every sales-order number. Sequence generation only needs the identifiers, so this
     * projection avoids hydrating the full aggregate graph (items, attachments, ...).
     */
    @Query("SELECT o.soNo FROM SalesOrder o WHERE o.soNo IS NOT NULL")
    List<String> findAllSoNos();

    /** Look up a Sales Order (CPO) by its canonical SO/CPO number. */
    Optional<SalesOrder> findBySoNo(String soNo);

    /** Counts rows in the given status that are the CURRENT revision of their chain. */
    @Query("""
            SELECT COUNT(o) FROM SalesOrder o
            WHERE o.status = :status
              AND NOT EXISTS (
                SELECT 1 FROM SalesOrder newer
                WHERE COALESCE(newer.revisionOf, newer.id) = COALESCE(o.revisionOf, o.id)
                  AND newer.revision > o.revision
              )
            """)
    long countCurrentByStatus(@Param("status") String status);

    boolean existsBySoNo(String soNo);

    long countByCurrencyIgnoreCase(String currency);

    long countByPaymentTermsIgnoreCase(String paymentTerms);

    long countByDeliveryTermsIgnoreCase(String deliveryTerms);

    long countBySalesExecutiveIgnoreCase(String salesExecutive);

    long countByCityIgnoreCase(String city);

    long countByStateIgnoreCase(String state);

    @Query("SELECT COALESCE(SUM(o.grandTotal), 0) FROM SalesOrder o WHERE o.status NOT IN :excluded")
    BigDecimal sumGrandTotalExcluding(@Param("excluded") List<String> excluded);

    List<SalesOrder> findByRevisionOfOrderByRevisionDesc(Long revisionOf);

    // Current (non-deleted, non-superseded) Customer Purchase Orders for a
    // whole page of quotation numbers — the Quotation list resolves PO Status
    // with ONE query per page instead of one query per row.
    @Query("SELECT o FROM SalesOrder o WHERE o.qtnRef IN :qtnRefs AND o.status <> 'deleted' "
            + "AND o.latestRevision = true")
    List<SalesOrder> findCurrentByQtnRefIn(@Param("qtnRefs") java.util.Collection<String> qtnRefs);

    // ---- Batched linked-document lookups (Credit Notes' CPO / due-date
    // columns). One query per document set for a whole page, never one query
    // per row. Every method keeps the "current, non-deleted" rule the list
    // pages use, so a superseded revision can never answer for a live link.

    @Query("SELECT o FROM SalesOrder o WHERE o.soNo IN :soNos AND o.status <> 'deleted' "
            + "AND o.latestRevision = true")
    List<SalesOrder> findCurrentBySoNoIn(@Param("soNos") java.util.Collection<String> soNos);

    @Query("SELECT o FROM SalesOrder o WHERE o.convertedToInv IN :invoiceNos AND o.status <> 'deleted' "
            + "AND o.latestRevision = true")
    List<SalesOrder> findCurrentByConvertedToInvIn(
            @Param("invoiceNos") java.util.Collection<String> invoiceNos);

    @Query("SELECT o FROM SalesOrder o WHERE o.convertedToCn IN :cnNos AND o.status <> 'deleted' "
            + "AND o.latestRevision = true")
    List<SalesOrder> findCurrentByConvertedToCnIn(@Param("cnNos") java.util.Collection<String> cnNos);

    @Query("SELECT o FROM SalesOrder o WHERE o.scRef IN :scRefs AND o.status <> 'deleted' "
            + "AND o.latestRevision = true")
    List<SalesOrder> findCurrentByScRefIn(@Param("scRefs") java.util.Collection<String> scRefs);

    @Query("SELECT o FROM SalesOrder o WHERE o.soNo LIKE 'SO-%'")
    List<SalesOrder> findWithSoPrefix();

    /**
     * Item count per Sales Order for a set of ids, in ONE query.
     *
     * <p>Used by the CPO option feed: mapping N options through
     * {@code getItems().size()} would issue N lazy collection loads.
     * Returns {@code [id, itemCount]} rows; orders with no items are simply
     * absent from the result and default to 0.
     */
    @Query("""
            SELECT o.id, COUNT(i)
            FROM SalesOrder o
            LEFT JOIN o.items i
            WHERE o.id IN :ids
            GROUP BY o.id
            """)
    List<Object[]> countItemsByOrderIds(@Param("ids") java.util.Collection<Long> ids);

    // Current (non-deleted, non-superseded) Customer Purchase Orders for the
    // E-Actions view's CPO picker / filter — the same records the CPO list
    // shows, so nothing new is invented.
    @Query("SELECT o FROM SalesOrder o WHERE o.status <> 'deleted' AND o.latestRevision = true "
            + "ORDER BY o.soNo ASC")
    List<SalesOrder> findCurrentForOptions(org.springframework.data.domain.Pageable pageable);

    // ---- Sales Dashboard aggregation (read-only) ----------------------------
    // The dashboard never loads a table to aggregate it: every metric below is
    // filtered in SQL, so its cost does not grow with the table size.

    /**
     * SUM of grand totals of the CURRENT revisions whose status (normalised to
     * lower-case/trimmed) is in the given set — the dashboard CPO value.
     * Returns {@code null} when nothing matches (the dashboard reports 0).
     */
    @Query("SELECT SUM(o.grandTotal) FROM SalesOrder o WHERE o.latestRevision = true "
            + "AND o.grandTotal IS NOT NULL AND LOWER(TRIM(o.status)) IN :statuses")
    BigDecimal sumCurrentGrandTotalByStatusIn(@Param("statuses") Collection<String> statuses);

    /**
     * (record date, grand total) of the CURRENT revisions in the given statuses,
     * for the dashboard's monthly trend. Projected row-by-row instead of summed
     * in SQL because the chart adds per-row rupee values
     * ({@code BigDecimal.longValue()}), which a database SUM would round
     * differently.
     */
    @Query("SELECT COALESCE(o.orderDate, o.createdAt), o.grandTotal FROM SalesOrder o "
            + "WHERE o.latestRevision = true AND o.grandTotal IS NOT NULL "
            + "AND LOWER(TRIM(o.status)) IN :statuses")
    List<Object[]> findCurrentDatesAndTotalsByStatusIn(@Param("statuses") Collection<String> statuses);

    /**
     * (client, grand total) of the CURRENT revisions in the given statuses, for
     * the dashboard's top-customer ranking (grouped in the service so the blank
     * client label and the ranking order stay exactly as they were).
     */
    @Query("SELECT o.clientName, o.grandTotal FROM SalesOrder o WHERE o.latestRevision = true "
            + "AND o.grandTotal IS NOT NULL AND LOWER(TRIM(o.status)) IN :statuses")
    List<Object[]> findCurrentClientAndTotalsByStatusIn(@Param("statuses") Collection<String> statuses);

    /**
     * Newest CURRENT, non-archived/non-deleted CPOs, newest record date first —
     * the dashboard's Recent CPOs list, bounded by the page size.
     */
    @Query("SELECT o FROM SalesOrder o WHERE o.latestRevision = true "
            + "AND LOWER(TRIM(o.status)) NOT IN ('archived', 'deleted') "
            + "ORDER BY COALESCE(o.orderDate, o.createdAt) DESC")
    List<SalesOrder> findDashboardRecent(Pageable pageable);
}
