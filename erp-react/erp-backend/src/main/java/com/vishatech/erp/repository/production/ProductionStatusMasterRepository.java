package com.vishatech.erp.repository.production;

import com.vishatech.erp.entity.production.ProductionStatusMaster;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Status master (Production → Settings → Status Masters). */
@Repository
public interface ProductionStatusMasterRepository extends JpaRepository<ProductionStatusMaster, Long> {

    List<ProductionStatusMaster> findAllByOrderByCategoryAscDisplayOrderAscStatusNameAsc();

    List<ProductionStatusMaster> findByCategoryOrderByDisplayOrderAscStatusNameAsc(String category);

    boolean existsByStatusNameAndCategory(String statusName, String category);

    boolean existsByStatusNameAndCategoryAndIdNot(String statusName, String category, Long id);

    long countByCategory(String category);
}
