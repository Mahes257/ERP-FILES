package com.vishatech.erp.repository;

import com.vishatech.erp.entity.MarketingFollowUp;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface MarketingFollowUpRepository extends JpaRepository<MarketingFollowUp, Long>,
        JpaSpecificationExecutor<MarketingFollowUp> {

    /** Full follow-up history for a visit, newest first. */
    List<MarketingFollowUp> findByVisitIdOrderByFollowupDateDescIdDesc(Long visitId);

    /** Full follow-up history for a marketing lead, newest first. */
    List<MarketingFollowUp> findByLeadIdOrderByFollowupDateDescIdDesc(Long leadId);

    void deleteByVisitId(Long visitId);

    long countByStatus(String status);
    long countByStatusAndFollowupDateBefore(String status, java.time.LocalDate date);
    long countByStatusInAndFollowupDateBefore(java.util.Collection<String> statuses, java.time.LocalDate date);
    List<MarketingFollowUp> findByFollowupDateBetween(java.time.LocalDate start, java.time.LocalDate end);
}
