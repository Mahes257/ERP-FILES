package com.vishatech.erp.repository;

import com.vishatech.erp.dto.SalesReportRow;
import com.vishatech.erp.entity.SalesContract;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SalesContractRepository extends JpaRepository<SalesContract, Long>, JpaSpecificationExecutor<SalesContract> {

    /** Sales Reports read model — see {@link QuotationRepository#findReportRows}. */
    @Query("SELECT new com.vishatech.erp.dto.SalesReportRow('salesContracts', 'Sales Contracts', c.id, c.scNo, "
            + "c.contractDate, c.createdAt, c.grandTotal, c.status, c.clientName) "
            + "FROM SalesContract c WHERE c.latestRevision = true "
            + "AND COALESCE(LOWER(c.status), '') NOT IN ('archived', 'deleted') "
            + "AND (:status IS NULL OR COALESCE(LOWER(c.status), 'draft') = LOWER(:status)) "
            + "AND (:client IS NULL OR LOWER(c.clientName) LIKE LOWER(CONCAT('%', :client, '%'))) "
            + "AND (:fromTs IS NULL OR COALESCE(c.contractDate, c.createdAt) >= :fromTs) "
            + "AND (:toTs IS NULL OR COALESCE(c.contractDate, c.createdAt) < :toTs)")
    List<SalesReportRow> findReportRows(
            @Param("status") String status,
            @Param("client") String client,
            @Param("fromTs") LocalDateTime fromTs,
            @Param("toTs") LocalDateTime toTs);
    long countByStatus(String status);

    /** CURRENT contracts awaiting approval — the Sales sweep's bounded candidate feed. */
    @Query("SELECT c FROM SalesContract c WHERE c.latestRevision = true "
            + "AND LOWER(TRIM(c.status)) IN :statuses "
            + "AND LOWER(TRIM(c.status)) NOT IN ('archived', 'deleted') "
            + "ORDER BY c.id ASC")
    List<SalesContract> findSweepCandidates(@Param("statuses") Collection<String> statuses,
                                            Pageable pageable);

    /**
     * Every sales-contract number. Sequence generation only needs the identifiers, so this
     * projection avoids hydrating the full aggregate graph (items, attachments, ...).
     */
    @Query("SELECT c.scNo FROM SalesContract c WHERE c.scNo IS NOT NULL")
    List<String> findAllScNos();

    /** Counts rows in the given status that are the CURRENT revision of their chain. */
    @Query("""
            SELECT COUNT(c) FROM SalesContract c
            WHERE c.status = :status
              AND NOT EXISTS (
                SELECT 1 FROM SalesContract newer
                WHERE COALESCE(newer.revisionOf, newer.id) = COALESCE(c.revisionOf, c.id)
                  AND newer.revision > c.revision
              )
            """)
    long countCurrentByStatus(@Param("status") String status);

    boolean existsByScNo(String scNo);

    long countByCurrencyIgnoreCase(String currency);

    long countByPaymentTermsIgnoreCase(String paymentTerms);

    long countByDeliveryTermsIgnoreCase(String deliveryTerms);

    long countBySalesExecutiveIgnoreCase(String salesExecutive);

    long countByDurationIgnoreCase(String duration);

    long countByWarrantyIgnoreCase(String warranty);

    long countByCityIgnoreCase(String city);

    long countByStateIgnoreCase(String state);

    @Query("SELECT COALESCE(SUM(c.grandTotal), 0) FROM SalesContract c WHERE c.status NOT IN :excluded")
    BigDecimal sumGrandTotalExcluding(@Param("excluded") List<String> excluded);

    List<SalesContract> findByRevisionOfOrderByRevisionDesc(Long revisionOf);

    // ---- Sales Dashboard aggregation (read-only) ----------------------------

    /**
     * SUM of grand totals of the CURRENT revisions whose status (normalised to
     * lower-case/trimmed) is in the given set — the dashboard contract value.
     * Returns {@code null} when nothing matches (the dashboard reports 0).
     */
    @Query("SELECT SUM(c.grandTotal) FROM SalesContract c WHERE c.latestRevision = true "
            + "AND c.grandTotal IS NOT NULL AND LOWER(TRIM(c.status)) IN :statuses")
    BigDecimal sumCurrentGrandTotalByStatusIn(@Param("statuses") Collection<String> statuses);
}
