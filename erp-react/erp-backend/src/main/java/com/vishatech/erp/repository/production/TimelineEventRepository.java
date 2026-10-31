package com.vishatech.erp.repository.production;

import com.vishatech.erp.entity.production.TimelineEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TimelineEventRepository extends JpaRepository<TimelineEvent, Long> {

    List<TimelineEvent> findByProductionOrderIdOrderByEventTimeDesc(Long productionOrderId);

    void deleteByProductionOrderId(Long productionOrderId);
}
