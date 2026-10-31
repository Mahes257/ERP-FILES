package com.vishatech.erp.repository;

import com.vishatech.erp.entity.MarketingExpenseAuditLog;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MarketingExpenseAuditLogRepository extends JpaRepository<MarketingExpenseAuditLog, Long> {

    List<MarketingExpenseAuditLog> findByTripIdOrderByPerformedAtAscIdAsc(Long tripId);

    void deleteByTripId(Long tripId);
}
