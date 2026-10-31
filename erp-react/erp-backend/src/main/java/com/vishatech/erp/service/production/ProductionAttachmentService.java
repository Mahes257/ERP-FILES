package com.vishatech.erp.service.production;

import com.vishatech.erp.sales.api.AttachmentStorePort;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Production's attachment service — the single entry point every Production
 * attachment endpoint (work orders, drawings, models) uses.
 *
 * <p><b>What changed (P5) and what did not.</b> The service used to inject
 * {@code SalesAttachmentRepository} and build {@code entity.SalesAttachment} rows
 * itself, which made Production depend on Sales persistence. It now delegates to
 * the Sales-owned, module-facing {@link AttachmentStorePort} and returns that
 * port's neutral {@link AttachmentStorePort.AttachmentRef} contract. Every method
 * keeps its name, its parameters, its ordering, its {@code 404} semantics and its
 * transaction boundary; the wire format of the endpoints above it is unchanged
 * because the ref's components are named and typed exactly like the JSON those
 * endpoints already produced.
 *
 * <p><b>Module types:</b> PRODUCTION_ORDER, DRAWING, MODEL, QUALITY_INSPECTION,
 * PACKING, DISPATCH — the same {@code (moduleType, moduleId)} rows in the shared
 * attachment table, untouched.
 *
 * <p><b>Transactions.</b> These annotations are the ones this class already had.
 * The port implementation carries the same {@code REQUIRED} semantics, so an
 * upload that stores a file and writes its row still commits or rolls back with
 * the caller's transaction as one unit — the port adds no boundary.
 *
 * <p><b>Documents archive.</b> Every upload of a Production-owned attachment also
 * files an independent copy in Documents → Inside ERP through
 * {@link ProductionDocumentArchive} — one call, in the same transaction, after
 * the attachment itself has been stored. The archive neither reads nor writes the
 * attachment's row or its stored file, so the original flow is unchanged and the
 * copy outlives a later removal or replacement of the attachment. Nothing is
 * archived by {@link #deleteAttachment}: removing the attachment from its record
 * must never remove the archived copy.
 */
@Service
public class ProductionAttachmentService {

    private final AttachmentStorePort attachmentStore;
    private final ProductionDocumentArchive documentArchive;

    public ProductionAttachmentService(AttachmentStorePort attachmentStore,
                                       ProductionDocumentArchive documentArchive) {
        this.attachmentStore = attachmentStore;
        this.documentArchive = documentArchive;
    }

    /**
     * List all attachments for a production module record.
     */
    @Transactional(readOnly = true)
    public List<AttachmentStorePort.AttachmentRef> getAttachments(String moduleType, Long moduleId) {
        return attachmentStore.list(moduleType, moduleId);
    }

    /**
     * Upload and attach a file to a production module record, archived against
     * that same record.
     */
    @Transactional
    public AttachmentStorePort.AttachmentRef addAttachment(String moduleType, Long moduleId, MultipartFile file) {
        return addAttachment(moduleType, moduleId, file, moduleId);
    }

    /**
     * Upload and attach a file to a production module record, and file an
     * INDEPENDENT copy of it in Documents → Inside ERP.
     *
     * <p>Both writes belong to the caller's transaction, so the attachment row and
     * the archived document commit or roll back together: a copy the repository
     * could not store fails the request and is never reported as a success, and no
     * archived row is left behind for an upload that did not save.
     *
     * @param moduleType      the shared attachment store's module type
     * @param moduleId        the record the attachment belongs to
     * @param file            the uploaded file
     * @param relatedRecordId the record the archived copy belongs to — the same id
     *                        for every area except a Work Order item, whose files
     *                        belong to the order that owns the item
     */
    @Transactional
    public AttachmentStorePort.AttachmentRef addAttachment(String moduleType, Long moduleId,
                                                           MultipartFile file, Long relatedRecordId) {
        AttachmentStorePort.AttachmentRef attachment = attachmentStore.add(moduleType, moduleId, file);
        documentArchive.archive(moduleType, relatedRecordId, file);
        return attachment;
    }

    /**
     * Delete an attachment, verifying it belongs to the correct module + record.
     */
    @Transactional
    public void deleteAttachment(String moduleType, Long moduleId, Long attachmentId) {
        attachmentStore.delete(moduleType, moduleId, attachmentId);
    }
}
