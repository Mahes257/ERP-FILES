package com.vishatech.erp.repository;

import com.vishatech.erp.entity.MarketingTravelPlanStop;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MarketingTravelPlanStopRepository extends JpaRepository<MarketingTravelPlanStop, Long> {

    List<MarketingTravelPlanStop> findByTravelPlanIdOrderBySequenceAscIdAsc(Long travelPlanId);

    List<MarketingTravelPlanStop> findByTravelPlanIdAndStatusInOrderBySequenceAscIdAsc(
            Long travelPlanId, List<String> statuses);

    long countByTravelPlanIdAndStatus(Long travelPlanId, String status);

    void deleteByTravelPlanId(Long travelPlanId);
}
