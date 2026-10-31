package com.vishatech.erp.repository;

import com.vishatech.erp.entity.SalesOrderEAction;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Persistence for the E-Action / Participation rows of a Customer Purchase
 * Order. The rows themselves live in {@code sales_order_e_actions} and belong to
 * a CPO; this repository only exists so the standalone E-Actions view can read
 * and write them ACROSS orders without loading whole CPO aggregates.
 *
 * <p>Filtering follows the same JPQL style the Production Tracker uses
 * ({@code :param IS NULL OR …}) so NULL means "no filter".
 *
 * <p>Every read is scoped to the CPO's CURRENT revision
 * ({@code o.latestRevision = true}): editing a CPO creates a new revision that
 * carries its E-Actions forward, so without this the superseded revision's rows
 * would show up as duplicates of the current ones.
 *
 * <p>The order join is a LEFT join: a row raised against a manually entered CPO
 * reference has no CPO record (see {@code SalesOrderEAction.cpoReference}) and
 * must still be listed, filtered, counted and searched — that revision / status
 * scope therefore only applies to rows that DO belong to an order.
 */
@Repository
public interface SalesOrderEActionRepository extends JpaRepository<SalesOrderEAction, Long> {

    Optional<SalesOrderEAction> findByIdAndSalesOrderId(Long id, Long salesOrderId);

    /**
     * E-Action rows of a whole page of CPOs in ONE query (list/export paths),
     * ordered like the per-record {@code getEActions()} collection so the
     * batched payload matches the single-record payload exactly.
     */
    List<SalesOrderEAction> findBySalesOrderIdInOrderByIdAsc(java.util.Collection<Long> salesOrderIds);

    long countBySalesOrderId(Long salesOrderId);

    @Query("""
            SELECT a FROM SalesOrderEAction a
            LEFT JOIN a.salesOrder o
            WHERE (o IS NULL OR (o.status <> 'deleted' AND o.latestRevision = true))
              AND (:search IS NULL OR
                   LOWER(COALESCE(o.soNo, '')) LIKE LOWER(CONCAT('%', :search, '%')) OR
                   LOWER(COALESCE(o.customerPo, '')) LIKE LOWER(CONCAT('%', :search, '%')) OR
                   LOWER(COALESCE(o.clientName, '')) LIKE LOWER(CONCAT('%', :search, '%')) OR
                   LOWER(COALESCE(a.cpoReference, '')) LIKE LOWER(CONCAT('%', :search, '%')) OR
                   LOWER(COALESCE(a.participantTeam, '')) LIKE LOWER(CONCAT('%', :search, '%')) OR
                   LOWER(COALESCE(a.assignedAction, '')) LIKE LOWER(CONCAT('%', :search, '%')) OR
                   LOWER(COALESCE(a.assignedTo, '')) LIKE LOWER(CONCAT('%', :search, '%')))
              AND (:cpoNo IS NULL OR o.soNo = :cpoNo)
              AND (:status IS NULL OR a.status = :status)
              AND (:participantTeam IS NULL OR a.participantTeam = :participantTeam)
              AND (:dateFrom IS NULL OR a.requestedOn >= :dateFrom)
              AND (:dateTo IS NULL OR a.requestedOn <= :dateTo)
            """)
    Page<SalesOrderEAction> findAllFiltered(
            @Param("search") String search,
            @Param("cpoNo") String cpoNo,
            @Param("status") String status,
            @Param("participantTeam") String participantTeam,
            @Param("dateFrom") LocalDateTime dateFrom,
            @Param("dateTo") LocalDateTime dateTo,
            Pageable pageable);

    /** Participant / Team values actually present — the Team filter's options. */
    @Query("""
            SELECT DISTINCT a.participantTeam FROM SalesOrderEAction a
            LEFT JOIN a.salesOrder o
            WHERE (o IS NULL OR (o.status <> 'deleted' AND o.latestRevision = true))
              AND a.participantTeam IS NOT NULL AND a.participantTeam <> ''
            ORDER BY a.participantTeam ASC
            """)
    List<String> findDistinctParticipantTeams();

    /** Status values actually present — the Status filter's options. */
    @Query("""
            SELECT DISTINCT a.status FROM SalesOrderEAction a
            LEFT JOIN a.salesOrder o
            WHERE (o IS NULL OR (o.status <> 'deleted' AND o.latestRevision = true))
              AND a.status IS NOT NULL AND a.status <> ''
            ORDER BY a.status ASC
            """)
    List<String> findDistinctStatuses();

    /** Real per-status counts for the E-Actions summary cards. */
    @Query("""
            SELECT a.status, COUNT(a) FROM SalesOrderEAction a
            LEFT JOIN a.salesOrder o
            WHERE (o IS NULL OR (o.status <> 'deleted' AND o.latestRevision = true))
            GROUP BY a.status
            """)
    List<Object[]> countGroupedByStatus();
}
