package com.vishatech.erp.dto;

/**
 * Immutable summary of one revision in a document's revision chain.
 * <p>
 * The chain root (the original document) carries {@code revision == 0} and a
 * plain number (e.g. {@code INV-00001}); every edit produces a new revision
 * row numbered {@code INV-00001(1)}, {@code INV-00001(2)}, ... Each revision
 * is permanently preserved in MySQL — an edit never deletes or overwrites a
 * previous version.
 */
public record RevisionInfo(
        Long id,
        String number,
        int revision,
        String status,
        String revisionDate,
        boolean latestRevision
) {
}
