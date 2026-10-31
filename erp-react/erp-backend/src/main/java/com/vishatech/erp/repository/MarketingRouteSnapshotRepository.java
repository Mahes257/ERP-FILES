package com.vishatech.erp.repository;

import com.vishatech.erp.entity.MarketingRouteSnapshot;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MarketingRouteSnapshotRepository extends JpaRepository<MarketingRouteSnapshot, Long> {

    List<MarketingRouteSnapshot> findByTravelPlanIdOrderByCalculatedAtDesc(Long travelPlanId);

    void deleteByTravelPlanId(Long travelPlanId);
}
