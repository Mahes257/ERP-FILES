package com.vishatech.erp.repository;

import com.vishatech.erp.entity.PurchaseAttachment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PurchaseAttachmentRepository extends JpaRepository<PurchaseAttachment, Long> {

    List<PurchaseAttachment> findByDocTypeAndDocIdOrderByIdAsc(String docType, Long docId);
}
