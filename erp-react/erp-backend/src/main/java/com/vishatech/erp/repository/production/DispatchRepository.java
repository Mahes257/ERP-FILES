package com.vishatech.erp.repository.production;

import com.vishatech.erp.entity.production.Dispatch;
import com.vishatech.erp.entity.production.DispatchStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DispatchRepository
        extends JpaRepository<Dispatch, Long>, JpaSpecificationExecutor<Dispatch> {

    Optional<Dispatch> findByDispatchNumber(String dispatchNumber);

    boolean existsByDispatchNumber(String dispatchNumber);

    Page<Dispatch> findByDispatchNumberContainingIgnoreCaseOrWorkOrderIdContainingIgnoreCaseOrProductContainingIgnoreCaseOrCustomerContainingIgnoreCaseOrTransporterContainingIgnoreCase(
            String dispatchNumber, String workOrderId, String product, String customer, String transporter, Pageable pageable);

    long countByStatus(DispatchStatus status);

    Page<Dispatch> findByStatus(DispatchStatus status, Pageable pageable);

    List<Dispatch> findByWorkOrderId(String workOrderId);
}
