package com.vishatech.erp.repository.production;

import com.vishatech.erp.entity.production.TVHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TVHistoryRepository extends JpaRepository<TVHistory, Long> {

    List<TVHistory> findByTechnicalVerificationIdOrderByPerformedAtDesc(Long technicalVerificationId);

    void deleteByTechnicalVerificationId(Long technicalVerificationId);
}
