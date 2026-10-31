package com.vishatech.erp.repository;

import com.vishatech.erp.entity.PurchaseInventoryMovement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

public interface PurchaseInventoryMovementRepository
        extends JpaRepository<PurchaseInventoryMovement, Long>, JpaSpecificationExecutor<PurchaseInventoryMovement> {
    Optional<PurchaseInventoryMovement> findByMovementNo(String movementNo);
    boolean existsByMovementNo(String movementNo);
    List<PurchaseInventoryMovement> findByInspectionNo(String inspectionNo);

    /** Both legs of a transfer share a transferRef. */
    List<PurchaseInventoryMovement> findByTransferRef(String transferRef);

    // ------------------------------------------------------------------
    // Work queue / stats — counted and summed in the database.
    // ------------------------------------------------------------------

    /** Movements of one type (Receipt / Issue / Adjustment / Transfer). */
    long countByType(String type);

    /** Movements of one type with one direction (Transfer legs are stored In + Out). */
    long countByTypeAndDirection(String type, String direction);

    /** Total ledger rows. */
    long countBy();

    /** Net movement across the whole ledger. */
    @Query("select coalesce(sum(m.delta), 0) from PurchaseInventoryMovement m")
    BigDecimal sumDelta();

    /**
     * On-hand quantity for one item, summed in the database. Matches by SKU
     * when one is given, otherwise by product name — the same rule the ledger
     * uses. An empty warehouse means "all warehouses".
     */
    @Query("select coalesce(sum(m.delta), 0) from PurchaseInventoryMovement m "
            + "where ((:sku <> '' and m.sku = :sku) or (:sku = '' and m.product = :product)) "
            + "and (:warehouse = '' or m.warehouse = :warehouse)")
    BigDecimal sumDeltaForItem(@Param("sku") String sku,
                               @Param("product") String product,
                               @Param("warehouse") String warehouse);
}
