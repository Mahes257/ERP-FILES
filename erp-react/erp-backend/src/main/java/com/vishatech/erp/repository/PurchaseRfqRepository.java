package com.vishatech.erp.repository;

import com.vishatech.erp.entity.PurchaseRfq;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PurchaseRfqRepository
        extends JpaRepository<PurchaseRfq, Long>, JpaSpecificationExecutor<PurchaseRfq> {

    Optional<PurchaseRfq> findByRfqNo(String rfqNo);

    boolean existsByRfqNo(String rfqNo);

    List<PurchaseRfq> findByReference(String prNo);

    // ------------------------------------------------------------------
    // Work queue / dashboard — counted directly in the database.
    // ------------------------------------------------------------------

    /** RFQs in any of the given lifecycle statuses (open / pending set). */
    long countByStatusIn(List<String> statuses);

    /** RFQs in any of the given statuses, newest first. */
    List<PurchaseRfq> findByStatusInOrderByIdDesc(List<String> statuses);

    /** Bounded newest-first RFQs for work-queue item payloads. */
    List<PurchaseRfq> findByStatusInOrderByIdDesc(List<String> statuses, Pageable pageable);

    /** Total RFQ count. */
    long countBy();

    /**
     * Still-open RFQs that carry a due date — the Purchase deadline sweep's
     * bounded candidate feed. Closed statuses and rows without a due date are
     * excluded in SQL; the exact date window is applied in Java because the
     * due date is stored as text and is parsed there (unchanged behaviour).
     */
    @Query("SELECT r FROM PurchaseRfq r WHERE r.dueDate IS NOT NULL "
            + "AND r.status IS NOT NULL AND r.status NOT IN :closedStatuses "
            + "ORDER BY r.id ASC")
    List<PurchaseRfq> findDeadlineSweepCandidates(@Param("closedStatuses") List<String> closedStatuses,
                                                  Pageable pageable);
}
