package com.vishatech.erp.production.api;

import com.vishatech.erp.pdf.DocumentView;
import java.util.Optional;

/**
 * The published Production contract for the production documents the shared
 * reporting pipeline prints: the production tracker, the quality inspection and
 * the packing list.
 *
 * <p><b>Why this exists.</b> {@code service.PdfGenerationService} used to read
 * {@code repository.ProductionTrackerRepository},
 * {@code repository.QualityInspectionRepository} and
 * {@code repository.production.PackingListRepository} itself in order to build
 * those three documents, which is why the shared reporting service sat in the
 * {@code outside_does_not_depend_on_production_persistence} allow-list. Those
 * reads are Production's business: the tracker and inspection tables, their
 * columns, their labels and the meaning of a missing record all belong to the
 * module that owns them. This interface is that boundary — the module answers
 * "what does this document say" as a {@link DocumentView}, and the shared
 * pipeline renders it.
 *
 * <p>Deliberately narrow and in-process. It carries no Production entity,
 * repository, DTO or service type — the document is described as labels and
 * already-rendered values — so the shared reporting layer can depend on it
 * without depending on Production persistence, and no HTTP hop, extra port or
 * extra process is involved. The content is the <em>same content the documents
 * always printed</em>: the row order, the labels, the humanised complete-record
 * details and the missing-record behaviour are all preserved, because the rows
 * were moved, not rewritten.
 *
 * <p>Implemented by {@code service.production.ProductionDocumentService}, which
 * is the production-owned reader. Unlike
 * {@link ModelConversionProjectionPort}, this contract is <em>not</em> used by
 * the isolated CAD worker process (whose narrow component scan loads no
 * Production services), so a bean implementation is the right shape here.
 */
public interface ProductionDocumentPort {

    /**
     * The production tracker document for a tracker id.
     *
     * @return the document, or {@link Optional#empty()} when no such tracker
     *         exists — which the pipeline reports as "no document", exactly as
     *         before
     */
    Optional<DocumentView> productionTracker(Long id);

    /**
     * The quality inspection document for an inspection id (the inspection table
     * has a String primary key).
     *
     * @return the document, or empty when no such inspection exists
     */
    Optional<DocumentView> qualityInspection(String id);

    /**
     * The packing list document for a packing-list id.
     *
     * @return the document, or empty when no such packing list exists
     */
    Optional<DocumentView> packingList(Long id);
}
