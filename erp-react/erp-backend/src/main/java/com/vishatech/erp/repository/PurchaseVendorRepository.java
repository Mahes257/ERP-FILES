package com.vishatech.erp.repository;

import com.vishatech.erp.entity.PurchaseVendor;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PurchaseVendorRepository extends JpaRepository<PurchaseVendor, Long> {

    /** Approved + active vendors — the pool RFQs may invite. */
    java.util.List<PurchaseVendor> findByRecordStateAndStatus(String recordState, String status);

    /** Vendors awaiting approval (work-queue / dashboard count). */
    long countByRecordStateAndStatus(String recordState, String status);

    /** Total active vendors (dashboard). */
    long countByRecordState(String recordState);

    /** Lookup by vendor code (V-0001). */
    Optional<PurchaseVendor> findByVendorCode(String vendorCode);
}
