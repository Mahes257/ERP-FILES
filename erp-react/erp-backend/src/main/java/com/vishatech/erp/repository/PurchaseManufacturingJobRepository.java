package com.vishatech.erp.repository;

import com.vishatech.erp.entity.PurchaseManufacturingJob;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import java.util.Optional;

public interface PurchaseManufacturingJobRepository
        extends JpaRepository<PurchaseManufacturingJob, Long>, JpaSpecificationExecutor<PurchaseManufacturingJob> {
    Optional<PurchaseManufacturingJob> findByMfrNo(String mfrNo);
    boolean existsByMfrNo(String mfrNo);
    boolean existsByPoNo(String poNo);

    /** Packing jobs in one status — counted in the database, never by loading rows. */
    long countByStatus(String status);

    /** Total packing jobs. */
    long countBy();
}
