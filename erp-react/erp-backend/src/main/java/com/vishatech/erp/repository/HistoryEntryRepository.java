package com.vishatech.erp.repository;

import com.vishatech.erp.entity.HistoryEntry;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HistoryEntryRepository extends JpaRepository<HistoryEntry, Long> {

    List<HistoryEntry> findByLeadIdOrderByCreatedAtAsc(Long leadId);
}
