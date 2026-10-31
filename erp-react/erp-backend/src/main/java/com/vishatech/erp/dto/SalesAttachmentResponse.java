package com.vishatech.erp.dto;

public record SalesAttachmentResponse(
        Long id,
        String name,
        String contentType,
        Long size,
        String url,
        String uploadedAt,
        /** Principal that uploaded the file (null on rows predating the column). */
        String uploadedBy,
        /**
         * The attachment's own category when its module documents one — a Sales
         * Contract labels an E-Sign (digitally signed) file and a Scanned Copy
         * of a signed/physical contract. Null for every other sales module and
         * for rows written before the column existed.
         */
        String attachmentCategory
) {
    /**
     * Backwards-compatible constructor for callers that predate the
     * {@code uploadedBy} field (both extra fields default to null).
     */
    public SalesAttachmentResponse(Long id, String name, String contentType, Long size,
                                   String url, String uploadedAt) {
        this(id, name, contentType, size, url, uploadedAt, null, null);
    }

    /**
     * Backwards-compatible constructor for callers that predate the
     * {@code attachmentCategory} field — the other sales modules keep reporting
     * their attachments unchanged (the category defaults to null).
     */
    public SalesAttachmentResponse(Long id, String name, String contentType, Long size,
                                   String url, String uploadedAt, String uploadedBy) {
        this(id, name, contentType, size, url, uploadedAt, uploadedBy, null);
    }
}
