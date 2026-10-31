package com.vishatech.erp.repository;

import com.vishatech.erp.entity.SalesHistory;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SalesHistoryRepository extends JpaRepository<SalesHistory, Long> {
    List<SalesHistory> findByModuleTypeAndModuleIdOrderByCreatedAtAsc(String moduleType, Long moduleId);

    /** History rows of MANY records in one query (same ordering as the single-record variant). */
    List<SalesHistory> findByModuleTypeAndModuleIdInOrderByCreatedAtAsc(String moduleType, Collection<Long> moduleIds);

    void deleteByModuleTypeAndModuleId(String moduleType, Long moduleId);
}
