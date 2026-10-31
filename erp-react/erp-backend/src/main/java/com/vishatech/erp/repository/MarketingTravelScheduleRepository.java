package com.vishatech.erp.repository;

import com.vishatech.erp.entity.MarketingTravelSchedule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

/**
 * Travel Schedule persistence. Reads go through
 * {@link JpaSpecificationExecutor} (search/filter/paging) exactly like the
 * Travel Registry repository; the two count helpers below back the list page's
 * own status tally.
 */
public interface MarketingTravelScheduleRepository extends JpaRepository<MarketingTravelSchedule, Long>,
        JpaSpecificationExecutor<MarketingTravelSchedule> {

    long countByDeletedFalse();

    long countByStatusAndDeletedFalse(String status);
}
