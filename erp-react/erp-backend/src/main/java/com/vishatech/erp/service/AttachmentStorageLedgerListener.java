package com.vishatech.erp.service;

import com.vishatech.erp.config.SpringContext;
import com.vishatech.erp.entity.AttachmentSized;
import jakarta.persistence.PostPersist;
import jakarta.persistence.PostRemove;

/**
 * Keeps {@code attachment_storage_usage} in step with the eight attachment
 * tables.
 *
 * <p>Registered on every attachment entity via {@code @EntityListeners}, so it
 * sees each row that enters or leaves the shared 4 GB pool no matter which
 * service performed the write — the ~15 upload/delete call sites across CRM,
 * CPR, Sales Execution, Purchase and Production all go through the JPA
 * repositories, and Spring Data's derived {@code deleteBy…} methods remove the
 * entities one by one, so the callbacks fire for those too.
 *
 * <p>Both callbacks run inside the transaction that is writing the attachment
 * row, and
 * {@link AttachmentStorageService#recordAttachmentAdded(long) recordAttachmentAdded}
 * / {@link AttachmentStorageService#recordAttachmentRemoved(long) recordAttachmentRemoved}
 * apply the delta to the ledger in that same transaction. A failed or rolled
 * back upload therefore cannot leave the pool total changed.
 *
 * <p>Only inserts and deletes move the total: an attachment row's {@code size} is
 * written once when the row is created and never updated (replacing a file
 * deletes the old row and inserts a new one). If a size were ever changed in
 * place — or a row written straight into MySQL — the total would no longer match
 * the tables, which is exactly what
 * {@link AttachmentStorageService#reconcile(boolean)} detects and repairs.
 *
 * <p>The parameter type is {@code Object} because the JPA spec resolves listener
 * methods by the entity type or {@code Object}; the instance check then keeps a
 * non-pooled entity harmless.
 */
public final class AttachmentStorageLedgerListener {

    @PostPersist
    public void onInsert(Object attachment) {
        long size = sizeOf(attachment);
        if (size > 0) {
            service().recordAttachmentAdded(size);
        }
    }

    @PostRemove
    public void onDelete(Object attachment) {
        long size = sizeOf(attachment);
        if (size > 0) {
            service().recordAttachmentRemoved(size);
        }
    }

    private static long sizeOf(Object attachment) {
        return attachment instanceof AttachmentSized sized ? sized.getSize() : 0L;
    }

    private static AttachmentStorageService service() {
        return SpringContext.getBean(AttachmentStorageService.class);
    }
}
