package com.vishatech.erp.repository;

import com.vishatech.erp.entity.MarketingVisit;
import com.vishatech.erp.crm.entity.Lead;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MarketingVisitRepository extends JpaRepository<MarketingVisit, Long>,
        JpaSpecificationExecutor<MarketingVisit> {

    /** All visits for one lead (used for the Visit History section). */
    List<MarketingVisit> findByLeadIdOrderByCreatedAtDesc(Long leadId);

    /** All visits for one customer (used for the Visit History section). */
    List<MarketingVisit> findByCustomerIdOrderByCreatedAtDesc(Long customerId);

    /** Visits linked to a lead, newest first. */
    List<MarketingVisit> findByLeadIdNotNullOrderByCreatedAtDesc();

    /** All visits created by one marketer (ownership scoping). */
    List<MarketingVisit> findByMarketerUserIdOrderByCreatedAtDesc(Long marketerUserId);

    /** Aggregate pipeline value of all leads generated through Offline Marketing. */
    @Query("select coalesce(sum(v.estimatedValue), 0) from MarketingVisit v where v.leadId is not null")
    java.math.BigDecimal sumPipelineValue();

    /** Aggregate pipeline value per marketer (performance panel). */
    @Query("select v.marketer as marketer, coalesce(sum(v.estimatedValue), 0) as pipelineValue "
            + "from MarketingVisit v where v.leadId is not null group by v.marketer")
    List<Object[]> pipelineValueByMarketer();

    /** Per-marketer aggregate rows for the performance panel. */
    @Query("select v.marketer as marketer, "
            + "count(v.id) as totalVisits, "
            + "sum(case when v.visitStatus = 'Completed' then 1 else 0 end) as completedVisits, "
            + "sum(case when v.appointmentStatus = 'Direct Visit' then 1 else 0 end) as directVisits, "
            + "sum(case when v.appointmentStatus = 'Fixed' then 1 else 0 end) as fixedAppointments, "
            + "sum(case when v.leadId is not null then 1 else 0 end) as leadsGenerated, "
            + "sum(case when v.outcome in ('No Lead', 'Not Interested', 'Lost Opportunity') then 1 else 0 end) as noLeadVisits "
            + "from MarketingVisit v group by v.marketer")
    List<Object[]> performanceByMarketer();

    /** Distinct marketer names for the marketer filter dropdown. */
    @Query("select distinct v.marketer from MarketingVisit v where v.marketer is not null order by v.marketer")
    List<String> distinctMarketers();

    long countByDeletedFalse();
    long countByDeletedFalseAndScheduleDate(java.time.LocalDate date);
    long countByDeletedFalseAndScheduleDateAfter(java.time.LocalDate date);
    List<MarketingVisit> findByScheduleDateBetweenAndDeletedFalse(java.time.LocalDate start, java.time.LocalDate end);
    long countByDeletedFalseAndVisitStatus(String status);
    @Query("select count(v) from MarketingVisit v where v.deleted = false and v.handoverStatus = 'Ready for Sales'")
    long countByHandoverReady();
}
