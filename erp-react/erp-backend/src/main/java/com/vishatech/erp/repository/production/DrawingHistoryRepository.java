package com.vishatech.erp.repository.production;

import com.vishatech.erp.entity.production.DrawingHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DrawingHistoryRepository extends JpaRepository<DrawingHistory, Long> {

    List<DrawingHistory> findByDrawingIdOrderByPerformedAtDesc(Long drawingId);

    void deleteByDrawingId(Long drawingId);
}
