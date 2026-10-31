package com.vishatech.erp.repository;

import com.vishatech.erp.entity.PurchaseInspection;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.Optional;

public interface PurchaseInspectionRepository
        extends JpaRepository<PurchaseInspection, Long>, JpaSpecificationExecutor<PurchaseInspection> {
    Optional<PurchaseInspection> findByInspectionNo(String no);

    // ------------------------------------------------------------------
    // Work queue — counted directly in the database.
    // ------------------------------------------------------------------

    /** Inspections in one status (Pending = awaiting pass/fail decision). */
    long countByStatus(String status);

    /** Inspections in one status, newest first. */
    List<PurchaseInspection> findByStatusOrderByIdDesc(String status);

    /** Inspections in one status, newest first, limited. */
    List<PurchaseInspection> findByStatusOrderByIdDesc(String status, Pageable pageable);

    /** Total inspection count. */
    long countBy();
}
