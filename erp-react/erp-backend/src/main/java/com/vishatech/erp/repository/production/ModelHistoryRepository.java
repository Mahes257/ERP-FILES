package com.vishatech.erp.repository.production;

import com.vishatech.erp.entity.production.ModelHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ModelHistoryRepository extends JpaRepository<ModelHistory, Long> {

    List<ModelHistory> findByModelIdOrderByPerformedAtDesc(Long modelId);

    void deleteByModelId(Long modelId);
}
