package com.vishatech.erp.service.production;

import com.vishatech.erp.entity.production.ProductionOrder;
import com.vishatech.erp.repository.production.ProductionOrderRepository;
import com.vishatech.erp.service.DocumentRepositoryService;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * Archives every Production attachment upload as an INDEPENDENT copy in the
 * shared Documents repository (Documents → Inside ERP).
 *
 * <p><b>Why this exists.</b> A Production attachment lives in the shared
 * attachment store as one {@code sales_attachments} row plus one stored file, and
 * the record that owns it can remove that row and replace that file at any time.
 * The document repository is the ERP's permanent, module-organised record of
 * files, so a copy is filed there on upload — through the EXISTING repository
 * upload path ({@link DocumentRepositoryService#upload}), which stores its own
 * file with its own server-generated name and writes its own
 * {@code document_repository} row. Nothing points at the attachment's row or its
 * file, so deleting or replacing the attachment cannot touch the archived copy,
 * and the same stored bytes are never shared between the two.
 *
 * <p><b>Placement.</b> A row is filed under the module spelling the repository
 * already uses for that Production area, which is exactly what the Documents
 * explorer's Production folders are keyed on, so the copy appears in the
 * corresponding Inside ERP sub-folder with no folder or UI change:
 *
 * <ul>
 *   <li>{@code PRODUCTION_ORDER} / {@code PRODUCTION_ORDER_ITEM} → Production
 *       Orders (a Work Order item's files are the Work Order's files, so they
 *       are filed against the order itself — the one record "Open Related
 *       Record" can resolve);</li>
 *   <li>{@code DRAWING} → Drawings; {@code MODEL} → Models;</li>
 *   <li>{@code QUALITY_INSPECTION} → QC (Quality folder), {@code PACKING} →
 *       Packing List, {@code DISPATCH} → Dispatch — kept for the shared
 *       attachment store's own module types, which the document reconciliation
 *       service maps the same way, so an area that gains an attachment endpoint
 *       later is already covered.</li>
 * </ul>
 *
 * <p><b>Scope.</b> Only these Production attachment module types are ever
 * archived: an unknown module type returns {@code null} and does nothing, so no
 * other module's attachment can be filed by this class, and Local Doc is never
 * involved.
 *
 * <p><b>Failures are explicit, never silent.</b> The archive runs inside the
 * caller's transaction (see {@link ProductionAttachmentService}), so a copy that
 * cannot be stored fails the whole upload request and rolls the attachment row
 * back with it — the caller never receives a success that is missing its
 * archived copy. This is the same inline convention every other module's
 * attachment upload already uses when it registers its document.
 */
@Service
public class ProductionDocumentArchive {

    /**
     * The module spelling each Production attachment module type is filed under.
     * The strings are the repository's own Production module names — the same
     * values {@code DocumentReconciliationService.moduleTypeToModule()} produces
     * for these module types, so a row created by an upload and a row created by
     * a reconciliation run land in the same folder.
     */
    private static final Map<String, String> MODULE_BY_ATTACHMENT_TYPE = Map.of(
            "PRODUCTION_ORDER", "Production Order",
            "PRODUCTION_ORDER_ITEM", "Production Order",
            "DRAWING", "Drawing",
            "MODEL", "Model",
            "QUALITY_INSPECTION", "QC",
            "PACKING", "Packing List",
            "DISPATCH", "Dispatch");

    /**
     * Visibility the archived copy receives: any authenticated internal ERP user
     * may open it, which is the value every attachment-registered document in
     * this repository already carries and the value the repository's live column
     * can store. It can never widen who may read the original attachment's bytes
     * — the copy is a separate file with its own row.
     */
    private static final String ARCHIVE_VISIBILITY = "TEAM_ONLY";

    /** The module spelling whose records carry a batch number worth showing. */
    private static final String PRODUCTION_ORDER_MODULE = "Production Order";

    private final DocumentRepositoryService documentRepositoryService;
    private final ProductionOrderRepository productionOrderRepository;

    public ProductionDocumentArchive(DocumentRepositoryService documentRepositoryService,
                                     ProductionOrderRepository productionOrderRepository) {
        this.documentRepositoryService = documentRepositoryService;
        this.productionOrderRepository = productionOrderRepository;
    }

    /**
     * The record number the Documents listing shows for a production order — its
     * batch number, the same value the reconciliation already files these records
     * under. A record that no longer exists simply contributes nothing: the copy
     * stays valid and keeps its stored file, which is the whole point of the
     * archive.
     */
    private String recordNumberFor(String module, Long relatedRecordId) {
        if (!PRODUCTION_ORDER_MODULE.equals(module) || relatedRecordId == null) {
            return null;
        }
        return productionOrderRepository.findById(relatedRecordId)
                .map(ProductionOrder::getBatchNumber)
                .filter(number -> !number.isBlank())
                .orElse(null);
    }

    /**
     * The document-repository module spelling for a Production attachment module
     * type, or {@code null} when the type is not one of Production's own.
     */
    static String moduleFor(String attachmentModuleType) {
        if (attachmentModuleType == null || attachmentModuleType.isBlank()) {
            return null;
        }
        return MODULE_BY_ATTACHMENT_TYPE.get(attachmentModuleType.trim().toUpperCase(java.util.Locale.ROOT));
    }

    /**
     * File an independent copy of an uploaded Production attachment.
     *
     * <p>The original filename, its content type and its size are carried over by
     * the repository upload itself, so the archived document keeps the name and
     * type the user chose; the uploader and upload date are the authenticated user
     * and the moment of the upload. A name that already exists in the repository
     * is never overwritten — the stored file name is generated server-side per
     * upload, which is what keeps collisions impossible.
     *
     * @param attachmentModuleType the shared attachment store's module type
     * @param relatedRecordId      the Production record the copy belongs to (the
     *                             record "Open Related Record" resolves)
     * @param file                 the file the user just uploaded
     * @return the archived document's id, or {@code null} when this module type is
     *         not Production's own (nothing is filed and nothing changes)
     */
    public Long archive(String attachmentModuleType, Long relatedRecordId, MultipartFile file) {
        String module = moduleFor(attachmentModuleType);
        if (module == null || relatedRecordId == null || file == null || file.isEmpty()) {
            return null;
        }
        return documentRepositoryService.upload(
                file,
                module,
                relatedRecordId,
                recordNumberFor(module, relatedRecordId),
                null,
                null,
                null,
                ARCHIVE_VISIBILITY,
                null,
                null).id();
    }
}
