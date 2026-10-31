package com.vishatech.erp.repository;

import com.vishatech.erp.entity.PlantContact;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlantContactRepository extends JpaRepository<PlantContact, Long> {

    List<PlantContact> findByFormIdOrderBySortOrderAscIdAsc(Long formId);

    void deleteByFormId(Long formId);
}
