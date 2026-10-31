package com.vishatech.erp.repository.production;

import com.vishatech.erp.entity.production.EntryStatus;
import com.vishatech.erp.entity.production.ProductionEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Specification support lets the shop-floor KPI screens filter, count and page
 * stage entries in the database (the list endpoints still page in memory, so
 * the KPI screens no longer depend on them).
 */
@Repository
public interface ProductionEntryRepository
        extends JpaRepository<ProductionEntry, Long>, JpaSpecificationExecutor<ProductionEntry> {

    List<ProductionEntry> findByProductionOrderIdOrderByStageAsc(Long productionOrderId);

    Optional<ProductionEntry> findByProductionOrderIdAndWorkOrderItemIdAndStage(
        Long productionOrderId, String workOrderItemId, String stage);

    Optional<ProductionEntry> findByProductionOrderIdAndStage(
        Long productionOrderId, String stage);

    List<ProductionEntry> findByProductionOrderIdAndWorkOrderItemId(
        Long productionOrderId, String workOrderItemId);

    void deleteByProductionOrderId(Long productionOrderId);

    // =====================
    // Casting-specific queries
    // =====================

    /** All entries for a given production type. */
    List<ProductionEntry> findByProductionTypeOrderByCreatedAtDesc(String productionType);

    /** Entries filtered by production type and status. */
    List<ProductionEntry> findByProductionTypeAndStatus(String productionType, EntryStatus status);

    /** Entries for a production type within a specific stage. */
    List<ProductionEntry> findByProductionTypeAndStage(String productionType, String stage);

    /** Count entries by production type and status. */
    long countByProductionTypeAndStatus(String productionType, EntryStatus status);

    /** Count entries by production type. */
    long countByProductionType(String productionType);

    /** Count distinct production order IDs for a production type. */
    @Query("SELECT COUNT(DISTINCT pe.productionOrder.id) FROM ProductionEntry pe WHERE pe.productionType = :productionType")
    long countDistinctProductionOrdersByType(@Param("productionType") String productionType);

    /** Sum of input quantities for a production type. */
    @Query("SELECT COALESCE(SUM(pe.inputQuantity), 0) FROM ProductionEntry pe WHERE pe.productionType = :productionType")
    Integer sumInputQuantityByType(@Param("productionType") String productionType);

    /** Sum of output quantities for a production type. */
    @Query("SELECT COALESCE(SUM(pe.outputQuantity), 0) FROM ProductionEntry pe WHERE pe.productionType = :productionType")
    Integer sumOutputQuantityByType(@Param("productionType") String productionType);

    /** Sum of rejected quantities for a production type. */
    @Query("SELECT COALESCE(SUM(pe.rejectedQuantity), 0) FROM ProductionEntry pe WHERE pe.productionType = :productionType")
    Integer sumRejectedQuantityByType(@Param("productionType") String productionType);

    /** Count entries by production type and stage. */
    @Query("SELECT pe.stage, COUNT(pe) FROM ProductionEntry pe WHERE pe.productionType = :productionType GROUP BY pe.stage")
    List<Object[]> countByProductionTypeAndStageGrouped(@Param("productionType") String productionType);

    /** Search entries by production type with keyword. */
    @Query("SELECT pe FROM ProductionEntry pe WHERE pe.productionType = :productionType AND (" +
           "LOWER(pe.productionOrder.workOrder) LIKE LOWER(CONCAT('%', :query, '%')) OR " +
           "LOWER(pe.productionOrder.product) LIKE LOWER(CONCAT('%', :query, '%')) OR " +
           "LOWER(pe.productionOrder.customer) LIKE LOWER(CONCAT('%', :query, '%')) OR " +
           "LOWER(pe.operator) LIKE LOWER(CONCAT('%', :query, '%')) OR " +
           "LOWER(pe.stage) LIKE LOWER(CONCAT('%', :query, '%')))" +
           " ORDER BY pe.createdAt DESC")
    List<ProductionEntry> searchByProductionType(@Param("productionType") String productionType, @Param("query") String query);

    /** Find entries by production order work order number and type. */
    @Query("SELECT pe FROM ProductionEntry pe WHERE pe.productionType = :productionType AND pe.productionOrder.workOrder = :workOrder ORDER BY pe.createdAt DESC")
    List<ProductionEntry> findByProductionTypeAndWorkOrder(@Param("productionType") String productionType, @Param("workOrder") String workOrder);

    /** Find distinct stages for a production type. */
    @Query("SELECT DISTINCT pe.stage FROM ProductionEntry pe WHERE pe.productionType = :productionType ORDER BY pe.createdAt ASC")
    List<String> findDistinctStagesByProductionType(@Param("productionType") String productionType);
}
