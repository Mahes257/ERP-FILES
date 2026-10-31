package com.vishatech.erp.repository;

import com.vishatech.erp.dto.SalesReportRow;
import com.vishatech.erp.entity.DeliveryChallan;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DeliveryChallanRepository extends JpaRepository<DeliveryChallan, Long>, JpaSpecificationExecutor<DeliveryChallan> {

    /** Sales Reports read model — see {@link QuotationRepository#findReportRows}. */
    @Query("SELECT new com.vishatech.erp.dto.SalesReportRow('deliveryChallans', 'Delivery Challans', d.id, d.dcNo, "
            + "d.dcDate, d.createdAt, d.grandTotal, d.status, d.clientName) "
            + "FROM DeliveryChallan d WHERE d.latestRevision = true "
            + "AND COALESCE(LOWER(d.status), '') NOT IN ('archived', 'deleted') "
            + "AND (:status IS NULL OR COALESCE(LOWER(d.status), 'draft') = LOWER(:status)) "
            + "AND (:client IS NULL OR LOWER(d.clientName) LIKE LOWER(CONCAT('%', :client, '%'))) "
            + "AND (:fromTs IS NULL OR COALESCE(d.dcDate, d.createdAt) >= :fromTs) "
            + "AND (:toTs IS NULL OR COALESCE(d.dcDate, d.createdAt) < :toTs)")
    List<SalesReportRow> findReportRows(
            @Param("status") String status,
            @Param("client") String client,
            @Param("fromTs") LocalDateTime fromTs,
            @Param("toTs") LocalDateTime toTs);
    long countByStatus(String status);

    /**
     * Every delivery-challan number. Sequence generation only needs the identifiers, so this
     * projection avoids hydrating the full aggregate graph (items, attachments, ...).
     */
    @Query("SELECT d.dcNo FROM DeliveryChallan d WHERE d.dcNo IS NOT NULL")
    List<String> findAllDcNos();

    /** Counts rows in the given status that are the CURRENT revision of their chain. */
    @Query("""
            SELECT COUNT(d) FROM DeliveryChallan d
            WHERE d.status = :status
              AND NOT EXISTS (
                SELECT 1 FROM DeliveryChallan newer
                WHERE COALESCE(newer.revisionOf, newer.id) = COALESCE(d.revisionOf, d.id)
                  AND newer.revision > d.revision
              )
            """)
    long countCurrentByStatus(@Param("status") String status);

    boolean existsByDcNo(String dcNo);

    long countByTransportCompanyIgnoreCase(String transportCompany);

    long countByCityIgnoreCase(String city);

    long countByStateIgnoreCase(String state);

    @Query("SELECT COALESCE(SUM(d.grandTotal), 0) FROM DeliveryChallan d WHERE d.status NOT IN :excluded")
    BigDecimal sumGrandTotalExcluding(@Param("excluded") List<String> excluded);

    List<DeliveryChallan> findByRevisionOfOrderByRevisionDesc(Long revisionOf);

    // ---- Batched linked-document lookups (the Credit Notes list's Dispatch
    // Date column). ONE query per set, never one per row, and always the
    // current (non-superseded, non-deleted) revision of the challan.

    @Query("SELECT d FROM DeliveryChallan d WHERE d.dcNo IN :dcNos "
            + "AND COALESCE(LOWER(d.status), '') <> 'deleted' AND d.latestRevision = true")
    List<DeliveryChallan> findCurrentByDcNoIn(@Param("dcNos") java.util.Collection<String> dcNos);

    @Query("SELECT d FROM DeliveryChallan d WHERE d.convertedToCn IN :cnNos "
            + "AND COALESCE(LOWER(d.status), '') <> 'deleted' AND d.latestRevision = true")
    List<DeliveryChallan> findCurrentByConvertedToCnIn(@Param("cnNos") java.util.Collection<String> cnNos);

    @Query("SELECT d FROM DeliveryChallan d WHERE d.convertedToInvoice IN :invoiceNos "
            + "AND COALESCE(LOWER(d.status), '') <> 'deleted' AND d.latestRevision = true")
    List<DeliveryChallan> findCurrentByConvertedToInvoiceIn(
            @Param("invoiceNos") java.util.Collection<String> invoiceNos);

    /** The current challans that shipped the given CPOs (their own so_ref). */
    @Query("SELECT d FROM DeliveryChallan d WHERE d.soRef IN :soRefs "
            + "AND COALESCE(LOWER(d.status), '') <> 'deleted' AND d.latestRevision = true")
    List<DeliveryChallan> findCurrentBySoRefIn(@Param("soRefs") java.util.Collection<String> soRefs);
}
