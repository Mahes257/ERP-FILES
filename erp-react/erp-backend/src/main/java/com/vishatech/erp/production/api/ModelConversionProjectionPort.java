package com.vishatech.erp.production.api;

import java.time.Instant;
import java.util.Objects;

/**
 * The published Production contract the CAD conversion pipeline reports into.
 *
 * <p><b>Why this exists.</b> The pipeline used to write the model projection
 * through {@code cad.CadModelProjection}, which took the Production
 * {@code entity.production.Model} entity (and its
 * {@code ModelConversionStatus} vocabulary) directly — so a class inside the
 * shared CAD engine depended on Production persistence, the coupling the
 * architecture rule {@code outside_does_not_depend_on_production_persistence}
 * forbids. The mapping itself (which column value an outcome produces, which
 * timestamps are stamped or cleared, how a failure reason is bounded) is
 * Production's business, because the {@code models} table is Production's. This
 * interface is that boundary: the pipeline reports <em>what happened</em> in
 * {@link ConversionOutcome} terms, and the projection decides what that means
 * for its own columns.
 *
 * <p>Deliberately narrow and in-process: two primitive-valued accessors and a
 * stage enum. It carries no Production entity, repository, DTO or service type,
 * so the shared CAD engine can depend on it without depending on Production
 * persistence, and no HTTP hop, extra port or extra process is involved.
 *
 * <p>Implemented by {@code entity.production.Model} (the projection owner) and
 * called by the ERP-side conversion service and by the isolated CAD worker
 * process, which loads the same entity through the shared repository.
 */
public interface ModelConversionProjectionPort {

    /**
     * Records one conversion outcome on the projection.
     *
     * <p>The caller owns the transaction and the persistence context: this is a
     * plain in-memory assignment on the entity the caller already holds, so an
     * outcome reported inside a caller's transaction commits or rolls back with
     * it — exactly as before.
     */
    void recordConversionOutcome(ConversionOutcome outcome);

    /**
     * One conversion outcome, in the vocabulary the projection understands.
     *
     * <p>Prefer the named factories: each one fixes the fields that are
     * meaningful for its stage, so an incoherent combination (a failure with a
     * converted file path, say) cannot be constructed by accident.
     *
     * @param stage             what happened; never null
     * @param at                when it happened; never null
     * @param reason            a safe, single-line reason for FAILED / CANCELLED /
     *                          UNSUPPORTED, otherwise null
     * @param convertedFilePath the generated preview file for READY, otherwise null
     */
    record ConversionOutcome(Stage stage, Instant at, String reason, String convertedFilePath) {

        /** The outcomes the pipeline may report. */
        public enum Stage {
            /** Submitted and not started yet. */
            QUEUED,
            /** Claimed by a worker and running. */
            PROCESSING,
            /** Finished: a converted preview file exists. */
            READY,
            /** The conversion failed; {@code reason} explains it. */
            FAILED,
            /** Aborted before it produced anything; {@code reason} explains it. */
            CANCELLED,
            /** Refused up front: no engine on this server can convert the format. */
            UNSUPPORTED
        }

        public ConversionOutcome {
            Objects.requireNonNull(stage, "stage");
            Objects.requireNonNull(at, "at");
        }

        public static ConversionOutcome queued(Instant at) {
            return new ConversionOutcome(Stage.QUEUED, at, null, null);
        }

        public static ConversionOutcome processing(Instant at) {
            return new ConversionOutcome(Stage.PROCESSING, at, null, null);
        }

        public static ConversionOutcome ready(Instant at, String convertedFilePath) {
            return new ConversionOutcome(Stage.READY, at, null, convertedFilePath);
        }

        public static ConversionOutcome failed(Instant at, String reason) {
            return new ConversionOutcome(Stage.FAILED, at, reason, null);
        }

        public static ConversionOutcome cancelled(Instant at, String reason) {
            return new ConversionOutcome(Stage.CANCELLED, at, reason, null);
        }

        public static ConversionOutcome unsupported(Instant at, String reason) {
            return new ConversionOutcome(Stage.UNSUPPORTED, at, reason, null);
        }
    }
}
