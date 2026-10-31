package com.vishatech.erp.repository;

import com.vishatech.erp.entity.PurchaseGrn;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PurchaseGrnRepository
        extends JpaRepository<PurchaseGrn, Long>, JpaSpecificationExecutor<PurchaseGrn> {
    Optional<PurchaseGrn> findByGrnNo(String grnNo);
    boolean existsByGrnNo(String grnNo);

    /** Batch lookup so a page of inspections never loads the GRN table. */
    List<PurchaseGrn> findByGrnNoIn(Collection<String> grnNos);

    /**
     * Loads the line items of the given GRNs in ONE query so a page of list
     * rows never turns into one lazy collection load per row (N+1).
     */
    @Query("select distinct g from PurchaseGrn g left join fetch g.items where g.id in :ids")
    List<PurchaseGrn> findAllWithItemsByIds(@Param("ids") Collection<Long> ids);

    // ------------------------------------------------------------------
    // Work queue — counted directly in the database.
    // ------------------------------------------------------------------

    /** GRNs in one status (Expected = awaiting receipt, Pending Inspection = awaiting QC). */
    long countByStatus(String status);

    /** GRNs in one status, newest first. */
    List<PurchaseGrn> findByStatusOrderByIdDesc(String status);

    /** GRNs awaiting receipt (Expected), newest first, limited. */
    List<PurchaseGrn> findByStatusOrderByIdDesc(String status, Pageable pageable);

    /** Total GRN count. */
    long countBy();
}
