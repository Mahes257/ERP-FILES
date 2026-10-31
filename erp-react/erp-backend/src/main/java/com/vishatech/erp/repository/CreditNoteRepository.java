package com.vishatech.erp.repository;

import com.vishatech.erp.dto.SalesReportRow;
import com.vishatech.erp.entity.CreditNote;
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

public interface CreditNoteRepository extends JpaRepository<CreditNote, Long>, JpaSpecificationExecutor<CreditNote> {

    /** Sales Reports read model — see {@link QuotationRepository#findReportRows}. */
    @Query("SELECT new com.vishatech.erp.dto.SalesReportRow('creditNotes', 'Credit Notes', c.id, c.cnNo, "
            + "c.cnDate, c.createdAt, c.grandTotal, c.status, c.clientName) "
            + "FROM CreditNote c WHERE c.latestRevision = true "
            + "AND COALESCE(LOWER(c.status), '') NOT IN ('archived', 'deleted') "
            + "AND (:status IS NULL OR COALESCE(LOWER(c.status), 'draft') = LOWER(:status)) "
            + "AND (:client IS NULL OR LOWER(c.clientName) LIKE LOWER(CONCAT('%', :client, '%'))) "
            + "AND (:fromTs IS NULL OR COALESCE(c.cnDate, c.createdAt) >= :fromTs) "
            + "AND (:toTs IS NULL OR COALESCE(c.cnDate, c.createdAt) < :toTs)")
    List<SalesReportRow> findReportRows(
            @Param("status") String status,
            @Param("client") String client,
            @Param("fromTs") LocalDateTime fromTs,
            @Param("toTs") LocalDateTime toTs);
    long countByStatus(String status);

    /** CURRENT credit notes awaiting approval — the Sales sweep's bounded candidate feed. */
    @Query("SELECT c FROM CreditNote c WHERE c.latestRevision = true "
            + "AND LOWER(TRIM(c.status)) IN :statuses "
            + "AND LOWER(TRIM(c.status)) NOT IN ('archived', 'deleted') "
            + "ORDER BY c.id ASC")
    List<CreditNote> findSweepCandidates(@Param("statuses") Collection<String> statuses,
                                         Pageable pageable);

    /**
     * Every credit-note number. Sequence generation only needs the identifiers, so this
     * projection avoids hydrating the full aggregate graph (items, attachments, ...).
     */
    @Query("SELECT c.cnNo FROM CreditNote c WHERE c.cnNo IS NOT NULL")
    List<String> findAllCnNos();

    /** Counts rows in the given status that are the CURRENT revision of their chain. */
    @Query("""
            SELECT COUNT(c) FROM CreditNote c
            WHERE c.status = :status
              AND NOT EXISTS (
                SELECT 1 FROM CreditNote newer
                WHERE COALESCE(newer.revisionOf, newer.id) = COALESCE(c.revisionOf, c.id)
                  AND newer.revision > c.revision
              )
            """)
    long countCurrentByStatus(@Param("status") String status);

    boolean existsByCnNo(String cnNo);

    Optional<CreditNote> findByCnNo(String cnNo);

    long countByReasonIgnoreCase(String reason);

    @Query("SELECT COALESCE(SUM(c.grandTotal), 0) FROM CreditNote c WHERE c.status NOT IN :excluded")
    BigDecimal sumGrandTotalExcluding(@Param("excluded") List<String> excluded);

    List<CreditNote> findByRevisionOfOrderByRevisionDesc(Long revisionOf);
}
