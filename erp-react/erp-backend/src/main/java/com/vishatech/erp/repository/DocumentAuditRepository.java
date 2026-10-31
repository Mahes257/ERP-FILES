package com.vishatech.erp.repository;

import com.vishatech.erp.entity.DocumentAudit;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface DocumentAuditRepository extends JpaRepository<DocumentAudit, Long> {

    List<DocumentAudit> findByDocumentIdOrderByIdAsc(Long documentId);

    long countByDocumentId(Long documentId);

    void deleteByDocumentId(Long documentId);
}