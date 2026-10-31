package com.vishatech.erp.repository;

import com.vishatech.erp.entity.SalesTimeline;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SalesTimelineRepository extends JpaRepository<SalesTimeline, Long> {
    List<SalesTimeline> findByModuleTypeAndModuleIdOrderByCreatedAtAsc(String moduleType, Long moduleId);

    /** Timeline rows of MANY records in one query (same ordering as the single-record variant). */
    List<SalesTimeline> findByModuleTypeAndModuleIdInOrderByCreatedAtAsc(String moduleType, Collection<Long> moduleIds);

    void deleteByModuleTypeAndModuleId(String moduleType, Long moduleId);
}
