package com.vishatech.erp.repository;

import com.vishatech.erp.entity.RecordRevision;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RecordRevisionRepository extends JpaRepository<RecordRevision, Long> {

    List<RecordRevision> findByModuleTypeAndRecordIdOrderByVersionAsc(String moduleType, Long recordId);

    @Query("SELECT COALESCE(MAX(r.version), 0) FROM RecordRevision r WHERE r.moduleType = :moduleType AND r.recordId = :recordId")
    int findMaxVersion(@Param("moduleType") String moduleType, @Param("recordId") Long recordId);

    /** Purges revision snapshots when a record is permanently deleted (never called for soft deletes). */
    void deleteByModuleTypeAndRecordId(String moduleType, Long recordId);
}
