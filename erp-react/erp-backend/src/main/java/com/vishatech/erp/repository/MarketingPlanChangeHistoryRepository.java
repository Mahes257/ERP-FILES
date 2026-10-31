package com.vishatech.erp.repository;

import com.vishatech.erp.entity.MarketingPlanChangeHistory;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MarketingPlanChangeHistoryRepository extends JpaRepository<MarketingPlanChangeHistory, Long> {

    List<MarketingPlanChangeHistory> findByTravelPlanIdOrderByPerformedAtAscIdAsc(Long travelPlanId);

    void deleteByTravelPlanId(Long travelPlanId);
}
