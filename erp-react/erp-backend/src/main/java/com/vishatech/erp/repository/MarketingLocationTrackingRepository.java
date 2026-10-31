package com.vishatech.erp.repository;

import com.vishatech.erp.entity.MarketingLocationTracking;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MarketingLocationTrackingRepository extends JpaRepository<MarketingLocationTracking, Long> {

    /** Latest location for each active trip (one row per trip). */
    @Query("SELECT l FROM MarketingLocationTracking l WHERE l.id IN (" +
           "SELECT MAX(l2.id) FROM MarketingLocationTracking l2 GROUP BY l2.travelPlanId)")
    List<MarketingLocationTracking> findLatestPerTrip();

    /** Latest location for a specific travel plan. */
    Optional<MarketingLocationTracking> findFirstByTravelPlanIdOrderByRecordedAtDesc(Long travelPlanId);

    /** Latest location for a specific user. */
    Optional<MarketingLocationTracking> findFirstByUserIdOrderByRecordedAtDesc(Long userId);

    /** Location history for a travel plan, ordered by time. */
    List<MarketingLocationTracking> findByTravelPlanIdOrderByRecordedAtAsc(Long travelPlanId);

    /** Location history for a travel plan within a time range. */
    List<MarketingLocationTracking> findByTravelPlanIdAndRecordedAtBetweenOrderByRecordedAtAsc(
            Long travelPlanId, LocalDateTime from, LocalDateTime to);

    /** Recent locations (last N minutes) for all active trips. */
    @Query("SELECT l FROM MarketingLocationTracking l WHERE l.recordedAt >= :since ORDER BY l.recordedAt DESC")
    List<MarketingLocationTracking> findRecentLocations(@Param("since") LocalDateTime since);

    /** Delete old location records (cleanup). */
    void deleteByRecordedAtBefore(LocalDateTime cutoff);
}
