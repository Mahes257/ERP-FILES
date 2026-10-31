package com.vishatech.erp.repository;

import com.vishatech.erp.entity.PurchaseRfqEvaluationRecord;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PurchaseRfqEvaluationRecordRepository
        extends JpaRepository<PurchaseRfqEvaluationRecord, Long> {

    Optional<PurchaseRfqEvaluationRecord> findByRfqNo(String rfqNo);

    List<PurchaseRfqEvaluationRecord> findAllByOrderByUpdatedAtDesc();
}
