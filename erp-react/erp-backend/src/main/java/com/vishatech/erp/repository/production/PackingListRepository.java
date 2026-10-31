package com.vishatech.erp.repository.production;

import com.vishatech.erp.entity.production.PackingList;
import com.vishatech.erp.entity.production.PackingStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PackingListRepository
        extends JpaRepository<PackingList, Long>, JpaSpecificationExecutor<PackingList> {

    Optional<PackingList> findByPackingListNumber(String packingListNumber);

    boolean existsByPackingListNumber(String packingListNumber);

    Page<PackingList> findByPackingListNumberContainingIgnoreCaseOrWorkOrderIdContainingIgnoreCaseOrProductContainingIgnoreCaseOrCustomerContainingIgnoreCase(
            String packingListNumber, String workOrderId, String product, String customer, Pageable pageable);

    long countByStatus(PackingStatus status);

    Page<PackingList> findByStatus(PackingStatus status, Pageable pageable);

    /**
     * Status tab + search together. The plain derived queries can only express
     * one condition at a time, which made a search inside a status tab silently
     * drop the tab's status filter.
     */
    @Query("SELECT p FROM PackingList p " +
           "WHERE p.status = :status " +
           "AND (LOWER(p.packingListNumber) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "  OR LOWER(p.workOrderId) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "  OR LOWER(p.salesOrderNumber) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "  OR LOWER(p.product) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "  OR LOWER(p.customer) LIKE LOWER(CONCAT('%', :search, '%'))) ")
    Page<PackingList> searchByStatus(@org.springframework.data.repository.query.Param("status") PackingStatus status,
                                     @org.springframework.data.repository.query.Param("search") String search,
                                     Pageable pageable);

    List<PackingList> findByWorkOrderId(String workOrderId);
}
