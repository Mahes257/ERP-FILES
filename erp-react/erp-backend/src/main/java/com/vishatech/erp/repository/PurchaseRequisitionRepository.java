package com.vishatech.erp.repository;

import com.vishatech.erp.entity.PurchaseRequisition;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface PurchaseRequisitionRepository
        extends JpaRepository<PurchaseRequisition, Long>, JpaSpecificationExecutor<PurchaseRequisition> {

    Optional<PurchaseRequisition> findByPrNo(String prNo);

    boolean existsByPrNo(String prNo);

    List<PurchaseRequisition> findByRecordState(String recordState);

    List<PurchaseRequisition> findByStatusInAndRecordState(List<String> statuses, String recordState);

    // ------------------------------------------------------------------
    // Work queue / dashboard — counted directly in the database (COUNT
    // queries, never full-table loads).
    // ------------------------------------------------------------------

    /** Total requisitions in a record state (active pool for the dashboard). */
    long countByRecordState(String recordState);

    /** Requisitions in one lifecycle status within a record state. */
    long countByStatusAndRecordState(String status, String recordState);

    /** Newest-first requisitions of one status within a record state. */
    List<PurchaseRequisition> findByStatusAndRecordStateOrderByIdDesc(String status, String recordState);

    /** Bounded newest-first requisitions for work-queue item payloads. */
    List<PurchaseRequisition> findByStatusAndRecordStateOrderByIdDesc(
            String status, String recordState, Pageable pageable);

    // ------------------------------------------------------------------
    // Technical Specification Review queue — filter options are read from
    // the database so the queue screens never derive them from the page
    // of rows that happens to be loaded.
    // ------------------------------------------------------------------

    /** Distinct departments present in the review stage. */
    @Query("select distinct pr.department from PurchaseRequisition pr "
            + "where pr.recordState = :recordState and pr.status = :status "
            + "and pr.department is not null and pr.department <> '' order by pr.department")
    List<String> distinctDepartments(String recordState, String status);

    /** Distinct vendors present in the review stage. */
    @Query("select distinct pr.vendor from PurchaseRequisition pr "
            + "where pr.recordState = :recordState and pr.status = :status "
            + "and pr.vendor is not null and pr.vendor <> '' order by pr.vendor")
    List<String> distinctVendors(String recordState, String status);

    /** Distinct buyers (the queue's "Assigned By" column) in the review stage. */
    @Query("select distinct pr.buyer from PurchaseRequisition pr "
            + "where pr.recordState = :recordState and pr.status = :status "
            + "and pr.buyer is not null and pr.buyer <> '' order by pr.buyer")
    List<String> distinctBuyers(String recordState, String status);
}
