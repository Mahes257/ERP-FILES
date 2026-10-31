package com.vishatech.erp.repository;

import com.vishatech.erp.entity.PlantOemDetail;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlantOemDetailRepository extends JpaRepository<PlantOemDetail, Long> {

    List<PlantOemDetail> findByFormIdOrderBySortOrderAscIdAsc(Long formId);

    List<PlantOemDetail> findByFormIdAndSectionOrderBySortOrderAscIdAsc(Long formId, String section);

    void deleteByFormId(Long formId);
}
