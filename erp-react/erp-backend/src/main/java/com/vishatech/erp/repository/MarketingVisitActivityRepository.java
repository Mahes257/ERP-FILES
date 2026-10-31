package com.vishatech.erp.repository;

import com.vishatech.erp.entity.MarketingVisitActivity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.time.LocalDate;
import java.util.List;

public interface MarketingVisitActivityRepository extends JpaRepository<MarketingVisitActivity, Long>,
        JpaSpecificationExecutor<MarketingVisitActivity> {

    /** All activities for a given original visit, ordered chronologically. */
    List<MarketingVisitActivity> findByVisitIdOrderByActivityDateAscIdAsc(Long visitId);

    /** All activities for a given visit and type. */
    List<MarketingVisitActivity> findByVisitIdAndActivityTypeOrderByActivityDateAscIdAsc(Long visitId, String activityType);

    /** Activities whose next follow-up date falls in a range (for calendar integration). */
    List<MarketingVisitActivity> findByNextFollowupDateBetween(LocalDate start, LocalDate end);

    /** Activities by creator user. */
    List<MarketingVisitActivity> findByCreatedByUserIdOrderByActivityDateDescIdDesc(Long userId);

    /** Activities within a date range (for calendar). */
    List<MarketingVisitActivity> findByActivityDateBetweenOrderByActivityDateAscIdAsc(LocalDate start, LocalDate end);
}
