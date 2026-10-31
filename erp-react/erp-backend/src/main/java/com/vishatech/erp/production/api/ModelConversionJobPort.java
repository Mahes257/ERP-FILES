package com.vishatech.erp.production.api;

import com.vishatech.erp.production.api.ModelConversionProjectionPort.ConversionOutcome;
import java.util.Optional;

/**
 * The published Production contract the ERP-side CAD conversion job pipeline
 * reads model facts from and records conversion outcomes into.
 *
 * <p><b>Why this exists.</b> {@code service.cad.CadConversionJobService} — which
 * admits, refuses and cancels conversion jobs — used to inject {@code
 * repository.production.ModelRepository} and work with the {@code
 * entity.production.Model} entity directly, which is why it sat in the
 * {@code outside_does_not_depend_on_production_persistence} allow-list. The
 * {@code models} table is Production's, and so is the decision of what a
 * conversion state means for its columns, so the CAD pipeline now asks the module
 * for the facts it needs and hands back an outcome it has already reported
 * through {@link ModelConversionProjectionPort}'s vocabulary.
 *
 * <p>Deliberately narrow and in-process: two methods and one primitive-valued
 * record. It carries no Production entity, repository, DTO or service type, so a
 * class outside Production can depend on it without depending on Production
 * persistence, and no HTTP hop, extra port or extra process is involved.
 *
 * <p><b>Implemented as a bean</b> ({@code
 * service.production.ModelConversionJobAdapter}) because reading facts and
 * recording an outcome need the repository — unlike
 * {@link ModelConversionProjectionPort}, which is implemented by the model entity
 * itself so the isolated CAD worker process, whose narrow component scan loads no
 * Production services, can keep using it. The worker keeps its own store
 * ({@code cadworker.CadJobStore}) and therefore needs nothing from this contract.
 *
 * <p><b>Transactions are the caller's.</b> Both methods join the caller's
 * transaction (the job pipeline's {@code submit}/{@code cancel}), so a refused
 * submission, a queued job and its projection still commit or roll back together,
 * exactly as before.
 */
public interface ModelConversionJobPort {

    /**
     * The projection's value for a format that needs no server-side conversion:
     * the browser renders it directly, so the pipeline refuses the submission with
     * this status and records no outcome at all (the upload already left the model
     * in this state). Published here — rather than spelled out in the caller — so
     * the client-facing word and the column's vocabulary can only change together;
     * {@code production.ModelConversionJobAdapterTests} pins that it equals
     * {@code entity.production.ModelConversionStatus.NOT_REQUIRED}.
     */
    String NOT_REQUIRED = "NOT_REQUIRED";

    /**
     * The conversion-relevant facts about a model.
     *
     * @return the facts, or {@link Optional#empty()} when no such model exists —
     *         the caller turns that into the 404 it has always thrown, and the
     *         cancel path treats it as "nothing to update", exactly as before
     */
    Optional<ModelFacts> find(Long modelId);

    /**
     * Records one conversion outcome on a model's projection.
     *
     * <p>A no-op when the model no longer exists — the original cancel path looked
     * the model up and silently skipped a missing row. The projection decides what
     * the outcome means for the columns (see {@link ModelConversionProjectionPort}),
     * so the caller only has to name what happened.
     */
    void recordOutcome(Long modelId, ConversionOutcome outcome);

    /**
     * The facts a conversion job needs, and nothing else: the file it will convert,
     * the identity used for the job row, and whether a usable converted preview is
     * already recorded.
     *
     * @param id                 the model's primary key (the job's {@code modelId})
     * @param fileType           the stored file type as uploaded; the CAD engine
     *                           normalises it before any decision
     * @param fileSize           the stored size in bytes, {@code null} when unknown
     * @param fileChecksum       the stored checksum, used as the job's source hash
     *                           so a job is bound to the file it was queued for
     * @param filePath           the source path on this server, {@code null} when
     *                           the upload stored no file
     * @param previewConverted   true when the projection says a converted preview
     *                           exists ({@code conversionStatus} is
     *                           {@code READY}); whether that preview is still on
     *                           disk is the caller's check against
     *                           {@code convertedFilePath}, because only the server
     *                           that runs the conversion knows its own filesystem
     * @param convertedFilePath  the recorded preview path, {@code null} when the
     *                           projection has none
     */
    record ModelFacts(Long id, String fileType, Long fileSize, String fileChecksum, String filePath,
                      boolean previewConverted, String convertedFilePath) {
    }
}
