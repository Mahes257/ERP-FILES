package com.vishatech.erp.entity;

/**
 * Implemented by every attachment entity whose rows are counted against the
 * shared project-wide attachment storage pool (see
 * {@link com.vishatech.erp.service.AttachmentStorageService}).
 *
 * The ledger maintenance hook needs exactly one thing from an attachment row —
 * the stored size — so this interface exists instead of eight {@code instanceof}
 * branches in the listener. All eight attachment entities already expose
 * {@code getSize()}; implementing this makes the pool membership explicit.
 */
public interface AttachmentSized {

    /** Stored file size in bytes (0 when unknown). */
    long getSize();
}
