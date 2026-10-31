package com.vishatech.erp.repository.production;

import com.vishatech.erp.entity.production.ApprovalHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ApprovalHistoryRepository extends JpaRepository<ApprovalHistory, Long> {

    List<ApprovalHistory> findByProductionOrderIdOrderByPerformedAtDesc(Long productionOrderId);

    void deleteByProductionOrderId(Long productionOrderId);
}
