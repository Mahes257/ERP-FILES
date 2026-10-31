package com.vishatech.erp.repository.production;

import com.vishatech.erp.entity.production.QualityInspection;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface QualityInspectionRepository
        extends JpaRepository<QualityInspection, String>, JpaSpecificationExecutor<QualityInspection> {

    long countByStatus(String status);

    long countByInspectionDate(LocalDate inspectionDate);

    /**
     * Units accepted across all inspections — the Quality KPI card's value.
     * Summed in SQL so the screen never has to load the inspections to add up
     * their quantities.
     */
    @Query("SELECT COALESCE(SUM(qi.acceptedQuantity), 0) FROM QualityInspection qi")
    long sumAcceptedQuantity();

    /** Units rejected across all inspections (same contract as the accepted sum). */
    @Query("SELECT COALESCE(SUM(qi.rejectedQuantity), 0) FROM QualityInspection qi")
    long sumRejectedQuantity();

    long countByInspectionType(String inspectionType);

    long countByProductionOrderId(String productionOrderId);

    @Query("SELECT qi FROM QualityInspection qi " +
           "WHERE (:search IS NULL OR " +
           "  LOWER(qi.id) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "  OR LOWER(qi.productionOrderId) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "  OR LOWER(qi.workOrder) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "  OR LOWER(qi.product) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "  OR LOWER(qi.inspector) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "  OR LOWER(qi.customer) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "  OR LOWER(qi.remarks) LIKE LOWER(CONCAT('%', :search, '%')) " +
           // Work Order No / CPO No search: the CPO lives on the Work Order, so a
           // match on either the WO number or its sales-order reference selects the
           // inspection. A stored `SO-` reference also matches a typed `CPO-` query.
           "  OR qi.productionOrderId IN (SELECT po.workOrder FROM ProductionOrder po " +
           "     WHERE LOWER(po.workOrder) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "        OR LOWER(po.salesOrderNumber) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "        OR LOWER(CONCAT('CPO-', SUBSTRING(po.salesOrderNumber, 4))) LIKE LOWER(CONCAT('%', :search, '%')))) " +
           "AND (:status IS NULL OR qi.status = :status) " +
           "AND (:department IS NULL OR qi.department = :department) " +
           "AND (:inspectionType IS NULL OR qi.inspectionType = :inspectionType) " +
           "AND (:productionOrder IS NULL OR qi.productionOrderId = :productionOrder)")
    Page<QualityInspection> findAllFiltered(
            @Param("search") String search,
            @Param("status") String status,
            @Param("department") String department,
            @Param("inspectionType") String inspectionType,
            @Param("productionOrder") String productionOrder,
            Pageable pageable);

    List<QualityInspection> findByProductionOrderIdOrderByCreatedAtDesc(String productionOrderId);
}
