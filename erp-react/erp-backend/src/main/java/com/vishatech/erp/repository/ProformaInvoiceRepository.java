package com.vishatech.erp.repository;

import com.vishatech.erp.dto.SalesReportRow;
import com.vishatech.erp.entity.ProformaInvoice;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProformaInvoiceRepository extends JpaRepository<ProformaInvoice, Long>, JpaSpecificationExecutor<ProformaInvoice> {

    /**
     * Current proforma invoices for a whole set of numbers, in ONE query — the
     * Credit Notes list walks this hop to reach the CPO / invoice behind it.
     */
    @Query("SELECT p FROM ProformaInvoice p WHERE p.piNo IN :piNos "
            + "AND COALESCE(LOWER(p.status), '') <> 'deleted' AND p.latestRevision = true")
    List<ProformaInvoice> findCurrentByPiNoIn(@Param("piNos") java.util.Collection<String> piNos);

    /** Sales Reports read model — see {@link QuotationRepository#findReportRows}. */
    @Query("SELECT new com.vishatech.erp.dto.SalesReportRow('proformaInvoices', 'Proforma Invoices', p.id, p.piNo, "
            + "p.piDate, p.createdAt, p.grandTotal, p.status, p.clientName) "
            + "FROM ProformaInvoice p WHERE p.latestRevision = true "
            + "AND COALESCE(LOWER(p.status), '') NOT IN ('archived', 'deleted') "
            + "AND (:status IS NULL OR COALESCE(LOWER(p.status), 'draft') = LOWER(:status)) "
            + "AND (:client IS NULL OR LOWER(p.clientName) LIKE LOWER(CONCAT('%', :client, '%'))) "
            + "AND (:fromTs IS NULL OR COALESCE(p.piDate, p.createdAt) >= :fromTs) "
            + "AND (:toTs IS NULL OR COALESCE(p.piDate, p.createdAt) < :toTs)")
    List<SalesReportRow> findReportRows(
            @Param("status") String status,
            @Param("client") String client,
            @Param("fromTs") LocalDateTime fromTs,
            @Param("toTs") LocalDateTime toTs);
    long countByStatus(String status);

    /**
     * Every proforma-invoice number. Sequence generation only needs the identifiers, so this
     * projection avoids hydrating the full aggregate graph (items, attachments, ...).
     */
    @Query("SELECT p.piNo FROM ProformaInvoice p WHERE p.piNo IS NOT NULL")
    List<String> findAllPiNos();

    /** Counts rows in the given status that are the CURRENT revision of their chain. */
    @Query("""
            SELECT COUNT(p) FROM ProformaInvoice p
            WHERE p.status = :status
              AND NOT EXISTS (
                SELECT 1 FROM ProformaInvoice newer
                WHERE COALESCE(newer.revisionOf, newer.id) = COALESCE(p.revisionOf, p.id)
                  AND newer.revision > p.revision
              )
            """)
    long countCurrentByStatus(@Param("status") String status);

    boolean existsByPiNo(String piNo);

    long countByBankTypeIgnoreCase(String bankType);

    @Query("SELECT COALESCE(SUM(p.grandTotal), 0) FROM ProformaInvoice p WHERE p.status NOT IN :excluded")
    BigDecimal sumGrandTotalExcluding(@Param("excluded") List<String> excluded);

    List<ProformaInvoice> findByRevisionOfOrderByRevisionDesc(Long revisionOf);
}
