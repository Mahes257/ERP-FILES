package com.vishatech.erp.repository;

import com.vishatech.erp.entity.PurchaseRfqFollowUp;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PurchaseRfqFollowUpRepository extends JpaRepository<PurchaseRfqFollowUp, Long> {
    Optional<PurchaseRfqFollowUp> findByFollowUpNo(String followUpNo);
    boolean existsByFollowUpNo(String followUpNo);
    List<PurchaseRfqFollowUp> findAllByOrderByIdDesc();
    List<PurchaseRfqFollowUp> findByRfqNo(String rfqNo);
}
