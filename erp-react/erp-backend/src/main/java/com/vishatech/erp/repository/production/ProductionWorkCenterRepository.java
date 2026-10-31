package com.vishatech.erp.repository.production;

import com.vishatech.erp.entity.production.ProductionWorkCenter;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Work center master (Production → Settings → Work Centers). */
@Repository
public interface ProductionWorkCenterRepository extends JpaRepository<ProductionWorkCenter, Long> {

    List<ProductionWorkCenter> findAllByOrderByWorkCenterCodeAsc();

    Optional<ProductionWorkCenter> findByWorkCenterCode(String workCenterCode);

    boolean existsByWorkCenterCode(String workCenterCode);
}
