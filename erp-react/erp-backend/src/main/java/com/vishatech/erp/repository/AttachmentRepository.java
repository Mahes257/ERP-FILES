package com.vishatech.erp.repository;

import com.vishatech.erp.entity.Attachment;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AttachmentRepository extends JpaRepository<Attachment, Long> {

    List<Attachment> findByLeadIdOrderByUploadedAtAsc(Long leadId);
}
