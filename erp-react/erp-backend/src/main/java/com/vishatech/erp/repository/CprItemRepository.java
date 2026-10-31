package com.vishatech.erp.repository;

import com.vishatech.erp.entity.CprItem;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CprItemRepository extends JpaRepository<CprItem, Long> {

    long countByUnitIgnoreCase(String unit);
}
