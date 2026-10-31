package com.vishatech.erp.repository.production;

import com.vishatech.erp.entity.production.ProductionOrderItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProductionOrderItemRepository extends JpaRepository<ProductionOrderItem, Long> {

    List<ProductionOrderItem> findByProductionOrderId(Long productionOrderId);

    Optional<ProductionOrderItem> findByIdAndProductionOrderId(Long id, Long productionOrderId);

    void deleteByProductionOrderId(Long productionOrderId);
}
