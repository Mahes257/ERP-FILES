package com.vishatech.erp.repository;

import com.vishatech.erp.entity.DocumentRepositoryEntry;
import com.vishatech.erp.entity.DocumentVersion;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface DocumentVersionRepository extends JpaRepository<DocumentVersion, Long> {

    List<DocumentVersion> findByDocumentIdOrderByVersionNumberDesc(Long documentId);

    int countByDocumentId(Long documentId);

    boolean existsByDocumentIdAndVersionNumber(Long documentId, int versionNumber);

    void deleteByDocumentId(Long documentId);

    /** Parent documents owning a file referenced only by one of their versions. */
    @Query("SELECT DISTINCT v.document FROM DocumentVersion v " +
           "WHERE v.storedName = :name OR v.filePath = :name OR v.filePath LIKE CONCAT('%/', :name)")
    List<DocumentRepositoryEntry> findDocumentsByStoredFileName(@Param("name") String name);
}
