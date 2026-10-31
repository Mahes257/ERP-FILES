package com.vishatech.erp.repository;

import com.vishatech.erp.entity.CprTechnicalVerificationDocument;
import com.vishatech.erp.entity.DocumentVisibility;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface CprTechnicalVerificationDocumentRepository extends JpaRepository<CprTechnicalVerificationDocument, Long> {

    List<CprTechnicalVerificationDocument> findByTechnicalVerificationId(Long technicalVerificationId);

    List<CprTechnicalVerificationDocument> findByTechnicalVerificationIdAndVisibility(
            Long technicalVerificationId, DocumentVisibility visibility);
}
