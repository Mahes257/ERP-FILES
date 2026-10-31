package com.vishatech.erp.repository.production;

import com.vishatech.erp.entity.production.ProductionTracker;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface ProductionTrackerRepository extends JpaRepository<ProductionTracker, Long> {

    Optional<ProductionTracker> findByCpoNo(String cpoNo);

    Optional<ProductionTracker> findBySalesOrderId(Long salesOrderId);

    long countByCurrentStatus(String status);

    @Query("SELECT pt FROM ProductionTracker pt " +
           "WHERE (:search IS NULL OR " +
           "  LOWER(pt.cpoNo) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "  OR LOWER(pt.customer) LIKE LOWER(CONCAT('%', :search, '%'))) " +
           "AND (:status IS NULL OR pt.currentStatus = :status) " +
           "AND (:stageActive IS NULL OR " +
           "  (pt.castingPct > 0 AND :stageActive = 'CASTING') OR " +
           "  (pt.fabricationPct > 0 AND :stageActive = 'FABRICATION') OR " +
           "  (pt.assemblyPct > 0 AND :stageActive = 'ASSEMBLY') OR " +
           "  (pt.qcPct > 0 AND :stageActive = 'QC') OR " +
           "  (pt.packingPct > 0 AND :stageActive = 'PACKING') OR " +
           "  (pt.dispatchPct > 0 AND :stageActive = 'DISPATCH')) " +
           "AND (:dateFrom IS NULL OR pt.orderDate >= :dateFrom) " +
           "AND (:dateTo IS NULL OR pt.orderDate <= :dateTo)")
    Page<ProductionTracker> findAllFiltered(
            @Param("search") String search,
            @Param("status") String status,
            @Param("stageActive") String stageActive,
            @Param("dateFrom") java.time.LocalDate dateFrom,
            @Param("dateTo") java.time.LocalDate dateTo,
            Pageable pageable);

    List<ProductionTracker> findByCpoNoOrderByCreatedAtDesc(String cpoNo);

    @Query("SELECT COUNT(pt) FROM ProductionTracker pt WHERE pt.dispatchPct = 100")
    long countCompleted();

    @Query("SELECT COUNT(pt) FROM ProductionTracker pt WHERE pt.currentStatus = 'NOT_STARTED'")
    long countNotStarted();

    @Query("SELECT COUNT(pt) FROM ProductionTracker pt WHERE pt.currentStatus = 'IN_PROGRESS'")
    long countInProgress();

    @Query("SELECT COUNT(pt) FROM ProductionTracker pt WHERE pt.currentStatus = 'DELAYED'")
    long countDelayed();
}
