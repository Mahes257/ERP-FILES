package com.vishatech.erp.repository;

import com.vishatech.erp.entity.MarketingTravelPlan;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

public interface MarketingTravelPlanRepository extends JpaRepository<MarketingTravelPlan, Long>,
        JpaSpecificationExecutor<MarketingTravelPlan> {

    List<MarketingTravelPlan> findByMarketerUserIdOrderByCreatedAtDesc(Long marketerUserId);

    List<MarketingTravelPlan> findByStatusOrderByCreatedAtDesc(String status);

    List<MarketingTravelPlan> findAllByOrderByCreatedAtDesc();

    @Query("select count(p) from MarketingTravelPlan p where p.status = :status and p.deleted = false")
    long countByStatus(String status);

    @Query("select count(p) from MarketingTravelPlan p where p.status = :status and p.startDate >= :date and p.deleted = false")
    long countByStatusAndStartDateAfter(String status, LocalDate date);

    long countByDeletedFalse();
    long countByApprovalStatus(String approvalStatus);

    List<MarketingTravelPlan> findByStartDateBetween(LocalDate start, LocalDate end);
}
