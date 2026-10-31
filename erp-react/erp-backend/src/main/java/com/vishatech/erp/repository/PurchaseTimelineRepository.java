package com.vishatech.erp.repository;

import com.vishatech.erp.entity.PurchaseTimeline;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PurchaseTimelineRepository extends JpaRepository<PurchaseTimeline, Long> {

    List<PurchaseTimeline> findByDocTypeAndDocIdOrderByTimestampAscIdAsc(String docType, Long docId);
}
