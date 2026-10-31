package com.vishatech.erp.repository;

import com.vishatech.erp.entity.SalesAttachment;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SalesAttachmentRepository extends JpaRepository<SalesAttachment, Long> {
    List<SalesAttachment> findByModuleTypeAndModuleIdOrderByUploadedAtAsc(String moduleType, Long moduleId);

    /**
     * Attachments of MANY records in one query, ordered as the single-record variant
     * orders them so a list screen can group the rows by {@code moduleId} and get the
     * same payload without one select per row.
     */
    List<SalesAttachment> findByModuleTypeAndModuleIdInOrderByUploadedAtAsc(String moduleType, Collection<Long> moduleIds);

    void deleteByModuleTypeAndModuleId(String moduleType, Long moduleId);
}
