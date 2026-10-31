package com.vishatech.erp.repository;

import com.vishatech.erp.entity.MarketingLead;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

public interface MarketingLeadRepository extends JpaRepository<MarketingLead, Long>,
        JpaSpecificationExecutor<MarketingLead> {

    List<MarketingLead> findByVisitIdOrderByCreatedAtDesc(Long visitId);

    List<MarketingLead> findByMarketerUserId(Long marketerUserId);

    List<MarketingLead> findByLeadDateBetweenOrderByLeadDateDesc(
            java.time.LocalDate from, java.time.LocalDate to);

    @Query("select distinct l.marketer from MarketingLead l where l.marketer is not null order by l.marketer")
    List<String> distinctMarketers();

    long count();
}
