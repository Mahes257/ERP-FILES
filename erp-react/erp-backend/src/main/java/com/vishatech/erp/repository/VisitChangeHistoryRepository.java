package com.vishatech.erp.repository;

import com.vishatech.erp.entity.VisitChangeHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface VisitChangeHistoryRepository extends JpaRepository<VisitChangeHistory, Long> {
    List<VisitChangeHistory> findByVisitIdOrderByChangedAtDesc(Long visitId);
    void deleteByVisitId(Long visitId);
}
