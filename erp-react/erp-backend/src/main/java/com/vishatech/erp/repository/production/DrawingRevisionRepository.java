package com.vishatech.erp.repository.production;

import com.vishatech.erp.entity.production.DrawingRevision;
import com.vishatech.erp.entity.production.DrawingRevisionStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DrawingRevisionRepository extends JpaRepository<DrawingRevision, Long> {

    List<DrawingRevision> findByDrawingIdOrderByRevisionNumberAsc(Long drawingId);

    Optional<DrawingRevision> findByDrawingIdAndRevision(Long drawingId, String revision);

    Optional<DrawingRevision> findByDrawingIdAndStatus(Long drawingId, DrawingRevisionStatus status);

    long countByDrawingId(Long drawingId);

    long countByDrawingIdAndStatus(Long drawingId, DrawingRevisionStatus status);

    void deleteByDrawingId(Long drawingId);
}
