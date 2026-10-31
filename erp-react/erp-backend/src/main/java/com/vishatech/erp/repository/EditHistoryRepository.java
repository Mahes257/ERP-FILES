package com.vishatech.erp.repository;

import com.vishatech.erp.entity.EditHistory;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EditHistoryRepository extends JpaRepository<EditHistory, Long> {

    List<EditHistory> findByModuleTypeAndRecordIdOrderByVersionAscCreatedAtAsc(String moduleType, Long recordId);

    @Query("SELECT COALESCE(MAX(e.version), 0) FROM EditHistory e WHERE e.moduleType = :moduleType AND e.recordId = :recordId")
    int findMaxVersion(@Param("moduleType") String moduleType, @Param("recordId") Long recordId);

    @Query("SELECT COUNT(DISTINCT e.version) FROM EditHistory e WHERE e.moduleType = :moduleType AND e.recordId = :recordId")
    long countDistinctVersions(@Param("moduleType") String moduleType, @Param("recordId") Long recordId);

    void deleteByModuleTypeAndRecordId(String moduleType, Long recordId);
}