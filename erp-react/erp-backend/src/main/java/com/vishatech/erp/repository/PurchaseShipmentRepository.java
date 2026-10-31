package com.vishatech.erp.repository;

import com.vishatech.erp.entity.PurchaseShipment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import java.util.Optional;

public interface PurchaseShipmentRepository
        extends JpaRepository<PurchaseShipment, Long>, JpaSpecificationExecutor<PurchaseShipment> {
    Optional<PurchaseShipment> findByShipmentNo(String shipmentNo);
    boolean existsByShipmentNo(String shipmentNo);

    /** Shipments in one status — counted in the database, never by loading rows. */
    long countByStatus(String status);

    /** Total shipments. */
    long countBy();
}
