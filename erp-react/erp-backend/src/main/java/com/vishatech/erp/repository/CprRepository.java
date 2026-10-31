package com.vishatech.erp.repository;

import com.vishatech.erp.entity.Cpr;
import com.vishatech.erp.entity.CprStatus;
import jakarta.persistence.LockModeType;
import java.math.BigDecimal;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CprRepository extends JpaRepository<Cpr, Long>, JpaSpecificationExecutor<Cpr> {
    long countByStatus(CprStatus status);

    /**
     * Counts rows in the given status that are the CURRENT revision of their
     * chain. Revision history lives as sibling rows in the same table, so a
     * superseded revision (still carrying its old status) must never inflate a
     * live pending-approval count.
     */
    @Query("""
            SELECT COUNT(c) FROM Cpr c
            WHERE c.status = :status
              AND NOT EXISTS (
                SELECT 1 FROM Cpr newer
                WHERE COALESCE(newer.revisionOf, newer.id) = COALESCE(c.revisionOf, c.id)
                  AND newer.revision > c.revision
              )
            """)
    long countCurrentByStatus(@Param("status") CprStatus status);

    long countByDepartmentIgnoreCase(String department);

    long countByPriorityIgnoreCase(String priority);

    long countByRequestedByIgnoreCase(String requestedBy);

    boolean existsByPrNo(String prNo);

    /**
     * The pr_no values starting with the given year prefix. A scalar projection,
     * not an entity query: CPR numbering reads one column instead of loading
     * every aggregate (with its items, attachments and history) in the table.
     */
    @Query("SELECT c.prNo FROM Cpr c WHERE c.prNo IS NOT NULL AND c.prNo LIKE concat(:prefix, '%')")
    java.util.List<String> findPrNosWithPrefix(@Param("prefix") String prefix);

    java.util.Optional<Cpr> findByPrNo(String prNo);

    /**
     * Every CURRENT, non-archived/non-deleted CPR reduced to the report's
     * scalar columns. One query, no entity graph and no lazy collections — the
     * report summary aggregates these rows in memory exactly as before.
     */
    @Query("""
            SELECT new com.vishatech.erp.dto.CprReportRow(
                c.id, c.status, c.grandTotal, c.department, c.vendor, c.createdAt, c.convertedToQtn)
            FROM Cpr c
            WHERE c.status NOT IN (com.vishatech.erp.entity.CprStatus.ARCHIVED,
                                   com.vishatech.erp.entity.CprStatus.DELETED)
              AND NOT EXISTS (
                SELECT 1 FROM Cpr newer
                WHERE COALESCE(newer.revisionOf, newer.id) = COALESCE(c.revisionOf, c.id)
                  AND newer.revision > c.revision
              )
            """)
    java.util.List<com.vishatech.erp.dto.CprReportRow> findReportRows();

    /**
     * CURRENT pending CPRs (pending approval or floated to a Cost Workout).
     * The report's pending table used to be filtered out of the whole table in
     * Java; this loads only the rows that table can contain.
     */
    @Query("""
            SELECT c FROM Cpr c
            WHERE c.status IN (com.vishatech.erp.entity.CprStatus.PENDING_APPROVAL,
                               com.vishatech.erp.entity.CprStatus.COST_WORKOUT)
              AND NOT EXISTS (
                SELECT 1 FROM Cpr newer
                WHERE COALESCE(newer.revisionOf, newer.id) = COALESCE(c.revisionOf, c.id)
                  AND newer.revision > c.revision
              )
            ORDER BY c.createdAt DESC
            """)
    java.util.List<Cpr> findCurrentReportPending();

    /** CURRENT approved CPRs for the report's approved table. */
    @Query("""
            SELECT c FROM Cpr c
            WHERE c.status = com.vishatech.erp.entity.CprStatus.APPROVED
              AND NOT EXISTS (
                SELECT 1 FROM Cpr newer
                WHERE COALESCE(newer.revisionOf, newer.id) = COALESCE(c.revisionOf, c.id)
                  AND newer.revision > c.revision
              )
            ORDER BY c.createdAt DESC
            """)
    java.util.List<Cpr> findCurrentReportApproved();

    /** CURRENT CPRs converted to a quotation (any live status). */
    @Query("""
            SELECT c FROM Cpr c
            WHERE c.status NOT IN (com.vishatech.erp.entity.CprStatus.ARCHIVED,
                                   com.vishatech.erp.entity.CprStatus.DELETED)
              AND c.convertedToQtn IS NOT NULL AND TRIM(c.convertedToQtn) <> ''
              AND NOT EXISTS (
                SELECT 1 FROM Cpr newer
                WHERE COALESCE(newer.revisionOf, newer.id) = COALESCE(c.revisionOf, c.id)
                  AND newer.revision > c.revision
              )
            ORDER BY c.createdAt DESC
            """)
    java.util.List<Cpr> findCurrentReportConverted();

    @Query("SELECT COALESCE(SUM(c.grandTotal), 0) FROM Cpr c WHERE c.status NOT IN :excluded")
    BigDecimal sumGrandTotalExcluding(@Param("excluded") java.util.Collection<CprStatus> excluded);

    @Query("SELECT COUNT(c) FROM Cpr c WHERE c.quotationDeadline IS NOT NULL AND c.status NOT IN :excluded")
    long countQuotationDeadlineExcluding(@Param("excluded") java.util.Collection<CprStatus> excluded);

    java.util.List<Cpr> findByRevisionOfOrderByRevisionDesc(Long revisionOf);

    /**
     * Loads a CPR under a row lock. Used by the edit path so two concurrent
     * saves of the same record serialize instead of racing when they compute
     * the next revision number (which would otherwise produce duplicate
     * revisions). The lock is taken as the FIRST statement of the update
     * transaction so the second caller sees the committed state of the first.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM Cpr c WHERE c.id = :id")
    Optional<Cpr> findByIdForUpdate(@Param("id") Long id);

    /**
     * Find the latest-revision CPR whose referencePrNo matches (case-insensitive).
     * Trashed (DELETED) CPRs are excluded — a Reference PR lookup must never
     * resolve to a record sitting in the trash.
     */
    @Query("SELECT c FROM Cpr c WHERE lower(c.referencePrNo) = lower(:refPrNo) " +
            "AND c.latestRevision = true AND c.status <> com.vishatech.erp.entity.CprStatus.DELETED " +
            "ORDER BY c.revision DESC")
    java.util.List<Cpr> findLatestByReferencePrNo(@Param("refPrNo") String refPrNo);

    /**
     * Search CPRs by referencePrNo containing the query (for autocomplete).
     * Trashed (DELETED) CPRs are excluded.
     */
    @Query("SELECT c FROM Cpr c WHERE c.referencePrNo IS NOT NULL AND c.referencePrNo != '' " +
            "AND lower(c.referencePrNo) LIKE lower(concat('%', :q, '%')) " +
            "AND c.latestRevision = true AND c.status <> com.vishatech.erp.entity.CprStatus.DELETED " +
            "ORDER BY c.referencePrNo ASC")
    java.util.List<Cpr> searchByReferencePrNo(@Param("q") String q);
}
