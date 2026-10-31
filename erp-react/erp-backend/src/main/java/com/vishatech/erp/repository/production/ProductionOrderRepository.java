package com.vishatech.erp.repository.production;

import com.vishatech.erp.entity.production.OrderStatus;
import com.vishatech.erp.entity.production.ProductionType;
import com.vishatech.erp.entity.production.Priority;
import com.vishatech.erp.entity.production.ProductionOrder;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * Specification support is what lets the Production KPI screens filter, count
 * and page production orders in the database instead of in the browser.
 */
@Repository
public interface ProductionOrderRepository
        extends JpaRepository<ProductionOrder, Long>, JpaSpecificationExecutor<ProductionOrder> {

    Optional<ProductionOrder> findByWorkOrder(String workOrder);

    /**
     * Work Orders by number — used to resolve the CPO reference of a whole page
     * of records (e.g. QC inspections) with one query.
     */
    List<ProductionOrder> findAllByWorkOrderIn(java.util.Collection<String> workOrders);

    boolean existsByWorkOrder(String workOrder);

    /**
     * Work orders currently sitting in one of the approval queues, earliest due
     * date first. Used by the ERP-wide Pending Approvals page so it only ever
     * lists records an approval decision can actually be taken on.
     */
    List<ProductionOrder> findByStatusInOrderByDueDateAsc(java.util.Collection<OrderStatus> statuses);

    void deleteByWorkOrder(String workOrder);

    // ========================
    // Search
    // ========================

    /**
     * Paged list for the Production Orders screen.
     *
     * <p>No {@code JOIN FETCH} on {@code items}: Hibernate cannot apply a SQL
     * LIMIT to a query that fetches a collection, so a fetch join here made every
     * request load the WHOLE matching table and then paginate it in memory (and
     * log {@code HHH90003004}). The items of the returned page are instead loaded
     * by {@code @BatchSize} on {@link ProductionOrder#getItems()} — one extra
     * query per page — so the LIMIT stays in the database.
     */
    @Query("""
        SELECT po FROM ProductionOrder po
        WHERE (:search IS NULL OR :search = '' OR
            LOWER(po.workOrder) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(po.salesOrderNumber) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(po.product) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(po.customer) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(po.customerCode) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(po.batchNumber) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(po.department) LIKE LOWER(CONCAT('%', :search, '%'))
        )
    """)
    Page<ProductionOrder> searchOrders(@Param("search") String search, Pageable pageable);

    // ========================
    // Filtered search
    // ========================

    /** Filtered variant of {@link #searchOrders(String, Pageable)} — same reasoning. */
    @Query("""
        SELECT DISTINCT po FROM ProductionOrder po
        WHERE (:search IS NULL OR :search = '' OR
            LOWER(po.workOrder) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(po.salesOrderNumber) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(po.product) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(po.customer) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(po.customerCode) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(po.batchNumber) LIKE LOWER(CONCAT('%', :search, '%'))
        )
        AND (:status IS NULL OR po.status = :status)
        AND (:productionType IS NULL OR po.productionType = :productionType)
        AND (:priority IS NULL OR po.priority = :priority)
        AND (:currentStage IS NULL OR po.currentStage = :currentStage)
        AND (:salesOrder IS NULL OR po.salesOrderNumber = :salesOrder)
        AND (:startDateFrom IS NULL OR po.startDate >= :startDateFrom)
        AND (:startDateTo IS NULL OR po.startDate <= :startDateTo)
        AND (:dueDateFrom IS NULL OR po.dueDate >= :dueDateFrom)
        AND (:dueDateTo IS NULL OR po.dueDate <= :dueDateTo)
    """)
    Page<ProductionOrder> findFiltered(
        @Param("search") String search,
        @Param("status") OrderStatus status,
        @Param("productionType") ProductionType productionType,
        @Param("priority") Priority priority,
        @Param("currentStage") String currentStage,
        @Param("salesOrder") String salesOrder,
        @Param("startDateFrom") LocalDate startDateFrom,
        @Param("startDateTo") LocalDate startDateTo,
        @Param("dueDateFrom") LocalDate dueDateFrom,
        @Param("dueDateTo") LocalDate dueDateTo,
        Pageable pageable
    );

    // ========================
    // Statistics
    // ========================

    @Query("SELECT po.status FROM ProductionOrder po GROUP BY po.status")
    List<Object[]> countByStatus();

    @Query("SELECT COUNT(po) FROM ProductionOrder po WHERE po.status = :status")
    long countByStatus(@Param("status") OrderStatus status);

    @Query("SELECT COUNT(po) FROM ProductionOrder po WHERE po.dueDate < :date AND po.status NOT IN (com.vishatech.erp.entity.production.OrderStatus.COMPLETED, com.vishatech.erp.entity.production.OrderStatus.PACKED, com.vishatech.erp.entity.production.OrderStatus.READY_FOR_DISPATCH, com.vishatech.erp.entity.production.OrderStatus.DISPATCHED, com.vishatech.erp.entity.production.OrderStatus.CANCELLED)")
    long countOverdue(@Param("date") LocalDate date);

    @Query("SELECT COUNT(po) FROM ProductionOrder po WHERE po.dueDate = :date AND po.status NOT IN (com.vishatech.erp.entity.production.OrderStatus.COMPLETED, com.vishatech.erp.entity.production.OrderStatus.PACKED, com.vishatech.erp.entity.production.OrderStatus.READY_FOR_DISPATCH, com.vishatech.erp.entity.production.OrderStatus.DISPATCHED, com.vishatech.erp.entity.production.OrderStatus.CANCELLED)")
    long countDueToday(@Param("date") LocalDate date);

    @Query("SELECT COUNT(po) FROM ProductionOrder po WHERE po.priority = 'Urgent' OR po.priority = 'High'")
    long countUrgentAndHighPriority();

    @Query("SELECT COUNT(po) FROM ProductionOrder po WHERE po.productionType = :productionType AND po.status NOT IN (com.vishatech.erp.entity.production.OrderStatus.CANCELLED, com.vishatech.erp.entity.production.OrderStatus.COMPLETED, com.vishatech.erp.entity.production.OrderStatus.DISPATCHED)")
    long countByProductionTypeActive(@Param("productionType") ProductionType productionType);

    @Query("SELECT COALESCE(AVG(po.progress), 0) FROM ProductionOrder po")
    Double avgProgress();

    // ========================
    // Next number generation
    // ========================

    /**
     * Every existing Work Order number — the input for next-number generation.
     *
     * This used to be a single-row lookup (`ORDER BY po.id DESC LIMIT 1`) which
     * returned the most recently INSERTED work order. That is not necessarily a
     * `WO-nnnn` (imported/seeded orders such as `TEST-PO-010` sit on top), and
     * whenever it was not, the generator fell back to `WO-0001` and collided
     * with the existing WO-0001 — so every Work Order create answered 409.
     * Taking the maximum over the numbers the generator can parse is what makes
     * the next number unique.
     */
    @Query("SELECT po.workOrder FROM ProductionOrder po WHERE po.workOrder IS NOT NULL")
    List<String> findAllWorkOrderNumbers();

    @Query("SELECT pe.batchNumber FROM ProductionOrderItem pe WHERE pe.batchNumber IS NOT NULL AND pe.batchNumber LIKE CONCAT(:prefix, '%')")
    List<String> findBatchNumbersByPrefix(@Param("prefix") String prefix);
}
