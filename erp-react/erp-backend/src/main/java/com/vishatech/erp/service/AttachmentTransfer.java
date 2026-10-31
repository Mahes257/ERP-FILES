package com.vishatech.erp.service;

import com.vishatech.erp.entity.SalesAttachment;
import com.vishatech.erp.repository.SalesAttachmentRepository;

/**
 * Carries attachment references from a source document to a converted
 * destination document. Only the reference rows are copied (module, file
 * name, stored path, URL) — the underlying file is NOT duplicated, which
 * matches the existing document-storage architecture. The source document
 * keeps its original attachments untouched.
 */
public final class AttachmentTransfer {

    private AttachmentTransfer() {
    }

    public static void copyReferences(SalesAttachmentRepository repository,
                                      String sourceModule, Long sourceId,
                                      String destinationModule, Long destinationId) {
        if (sourceId == null || destinationId == null) {
            return;
        }
        for (SalesAttachment attachment : repository.findByModuleTypeAndModuleIdOrderByUploadedAtAsc(sourceModule, sourceId)) {
            SalesAttachment copy = new SalesAttachment();
            copy.setModuleType(destinationModule);
            copy.setModuleId(destinationId);
            copy.setName(attachment.getName());
            copy.setStoredName(attachment.getStoredName());
            copy.setContentType(attachment.getContentType());
            copy.setSize(attachment.getSize());
            copy.setUrl(attachment.getUrl());
            // The category describes the FILE (an E-Sign or Scanned Copy of the
            // contract), so it travels with the reference — a converted document
            // does not silently lose the label its attachment was filed under.
            copy.setAttachmentCategory(attachment.getAttachmentCategory());
            copy.setUploadedAt(attachment.getUploadedAt());
            repository.save(copy);
        }
    }
}
