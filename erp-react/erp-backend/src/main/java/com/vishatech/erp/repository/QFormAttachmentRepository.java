package com.vishatech.erp.repository;

import com.vishatech.erp.entity.QFormAttachment;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QFormAttachmentRepository extends JpaRepository<QFormAttachment, Long> {

    List<QFormAttachment> findByFormIdOrderByUploadedAtDesc(Long formId);

    void deleteByFormId(Long formId);
}
