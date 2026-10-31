package com.vishatech.erp.sales.api;

import java.util.List;
import org.springframework.web.multipart.MultipartFile;

/**
 * Sales-owned, module-facing attachment contract: the only surface another module
 * may use to store, list or delete a file that lives in the shared
 * {@code sales_attachments} table.
 *
 * <p><b>Why this port exists.</b> Production's attachment service used to inject
 * {@code SalesAttachmentRepository}, build {@code entity.SalesAttachment} rows and
 * return {@code dto.SalesAttachmentResponse} — i.e. Production depended on Sales
 * <em>persistence</em>, not on a Sales <em>capability</em>. The architecture rule
 * {@code production_services_do_not_depend_on_sales_internals} froze exactly those
 * three edges. Production now depends on this interface and on the neutral
 * {@link AttachmentRef} contract it publishes; nothing about Sales' entity,
 * repository or DTOs crosses the boundary.
 *
 * <p><b>Ownership.</b> The attachment rows and their table stay Sales-owned, so
 * the implementation lives on the Sales side
 * ({@code service.SalesAttachmentStoreAdapter}) and only this published package is
 * exempt from the Sales-internals predicate. The adapter is an internal Sales
 * class — another module can inject this interface but cannot reference the
 * adapter by type.
 *
 * <p><b>Addressing.</b> Rows are addressed by the shared
 * {@code (moduleType, moduleId)} pair the table has always used, so Production's
 * module types ({@code PRODUCTION_ORDER}, {@code DRAWING}, {@code MODEL}, …) keep
 * their existing rows, ids and ordering untouched.
 *
 * <p><b>Response contract.</b> {@link AttachmentRef}'s components are named and
 * typed exactly like the JSON Production's attachment endpoints already returned
 * — {@code id}, {@code name}, {@code contentType}, {@code size}, {@code url},
 * {@code uploadedAt} — so the wire format of
 * {@code GET/POST /production-orders/{id}/attachments} (and the Drawing/Model
 * equivalents) is unchanged. {@code uploadedBy} deliberately stays out: the
 * Production flow never populated it and the application omits nulls
 * ({@code spring.jackson.default-property-inclusion=non_null}), so it was never
 * part of that payload.
 *
 * <p><b>Transactions.</b> The implementation methods carry the same
 * {@code @Transactional} annotations the Production service used to carry, with
 * the default {@code REQUIRED} propagation. A call made from inside a caller's
 * transaction therefore <b>joins</b> it — exactly as before this port existed — so
 * the attachment row and the caller's own work still commit or roll back together.
 * No new transaction boundary, no asynchronous work and no HTTP hop is introduced.
 */
public interface AttachmentStorePort {

    /**
     * One stored attachment, expressed without any Sales-internal type.
     *
     * @param id          attachment row id (the id Production's delete endpoint takes)
     * @param name        original file name as uploaded
     * @param contentType MIME type recorded for the file
     * @param size        file size in bytes
     * @param url         absolute download URL of the stored file
     * @param uploadedAt  upload timestamp as text, or {@code null} when unknown
     */
    record AttachmentRef(
            Long id,
            String name,
            String contentType,
            Long size,
            String url,
            String uploadedAt) {
    }

    /**
     * Every attachment filed under one {@code (moduleType, moduleId)} record, oldest
     * first — the order the attachment table and the existing endpoints use.
     */
    List<AttachmentRef> list(String moduleType, Long moduleId);

    /**
     * Stores the uploaded file and files it against the record.
     *
     * <p>Storage and row creation behave exactly as the Production-side service did:
     * the bytes are written through the shared {@code FileStorageService} first, the
     * row then records the original name, MIME type and size, and the returned
     * {@code url} points at the stored file.
     *
     * @return the created attachment, in the published contract
     */
    AttachmentRef add(String moduleType, Long moduleId, MultipartFile file);

    /**
     * Deletes one attachment, but only when it really belongs to the given record:
     * a missing id, or an id filed under a different {@code (moduleType, moduleId)},
     * raises {@code ResourceNotFoundException} — the same 404 semantics Production's
     * delete endpoint has always had.
     */
    void delete(String moduleType, Long moduleId, Long attachmentId);
}
