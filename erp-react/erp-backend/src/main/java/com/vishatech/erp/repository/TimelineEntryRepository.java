package com.vishatech.erp.repository;

import com.vishatech.erp.entity.TimelineEntry;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TimelineEntryRepository extends JpaRepository<TimelineEntry, Long> {

    List<TimelineEntry> findByLeadIdOrderByCreatedAtAsc(Long leadId);
}
