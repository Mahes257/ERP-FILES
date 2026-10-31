package com.vishatech.erp.repository;

import com.vishatech.erp.entity.PurchaseOrder;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PurchaseOrderRepository
        extends JpaRepository<PurchaseOrder, Long>, JpaSpecificationExecutor<PurchaseOrder> {

    Optional<PurchaseOrder> findByPoNo(String poNo);

    boolean existsByPoNo(String poNo);

    // ------------------------------------------------------------------
    // Work queue / dashboard — counted directly in the database.
    // ------------------------------------------------------------------

    /** Count of POs in one lifecycle stage. */
    long countByStatus(String status);

    /** Count of POs in any of the given stages (e.g. released stages). */
    long countByStatusIn(List<String> statuses);

    /** POs in one stage, newest first. */
    List<PurchaseOrder> findByStatusOrderByIdDesc(String status);

    /** Bounded newest-first POs for work-queue item payloads. */
    List<PurchaseOrder> findByStatusOrderByIdDesc(String status, Pageable pageable);

    /** POs in any of the given stages, newest first. */
    List<PurchaseOrder> findByStatusInOrderByIdDesc(List<String> statuses);

    /**
     * Released-stage POs still awaiting supplier acknowledgement —
     * filtered at the database level (no acknowledgement timestamp yet),
     * mirroring the frontend's isPoReleased + isAckPending predicate.
     */
    @Query("""
            SELECT o FROM PurchaseOrder o
            WHERE o.status IN :releasedStages
              AND o.acknowledgedAt IS NULL
            ORDER BY o.id DESC
            """)
    List<PurchaseOrder> findPendingAcknowledgements(@Param("releasedStages") List<String> releasedStages,
                                                    Pageable pageable);

    @Query("""
            SELECT COUNT(o) FROM PurchaseOrder o
            WHERE o.status IN :releasedStages
              AND o.acknowledgedAt IS NULL
            """)
    long countPendingAcknowledgements(@Param("releasedStages") List<String> releasedStages);

    /** Total PO count. */
    long countBy();

    /**
     * Open POs that carry a promised or expected delivery date — the Purchase
     * overdue sweep's bounded candidate feed. Completed/cancelled POs and rows
     * with no date at all are excluded in SQL; the grace period is applied in
     * Java because the dates are stored as text (unchanged behaviour).
     */
    @Query("SELECT o FROM PurchaseOrder o WHERE o.status IS NOT NULL "
            + "AND o.status NOT IN :finishedStatuses "
            + "AND (o.deliveryDate IS NOT NULL OR o.expectedDate IS NOT NULL) "
            + "ORDER BY o.id ASC")
    List<PurchaseOrder> findDeliverySweepCandidates(@Param("finishedStatuses") List<String> finishedStatuses,
                                                   Pageable pageable);
}
