package com.vishatech.erp.production;

import static org.assertj.core.api.Assertions.assertThat;

import com.vishatech.erp.cad.CadModelProjection;
import com.vishatech.erp.entity.CadConversionJobStatus;
import com.vishatech.erp.entity.production.Model;
import com.vishatech.erp.entity.production.ModelConversionStatus;
import com.vishatech.erp.production.api.ModelConversionProjectionPort;
import com.vishatech.erp.production.api.ModelConversionProjectionPort.ConversionOutcome;
import java.nio.file.Path;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/**
 * The Production side of the conversion projection contract: what each reported outcome
 * means for the {@code models} columns.
 *
 * <p>These are the semantics that used to live in the CAD engine
 * ({@code cad.CadModelProjection} switched on job states and wrote the production status
 * vocabulary into the entity). They belong to the module that owns the table, so they are
 * pinned here, against the entity that implements
 * {@link ModelConversionProjectionPort}.
 *
 * <p>Plain unit tests: no Spring context, no database — the projection is an in-memory
 * assignment on the entity, exactly as it is at runtime inside a caller's transaction.
 */
class ModelConversionProjectionTests {

    private static final Instant AT = Instant.parse("2026-01-02T03:04:05Z");

    private static Model model() {
        return Model.builder().modelNumber("MDL-1").workOrderId("WO-1").build();
    }

    @Test
    void theModelIsTheProjectionImplementation() {
        ModelConversionProjectionPort projection = model();

        assertThat(projection).isInstanceOf(Model.class);
    }

    @Test
    void queuedResetsTheProjectionForAFreshRun() {
        Model model = model();
        model.setConversionStatus(ModelConversionStatus.READY);
        model.setConversionError("old failure");
        model.setConversionCompletedAt(AT.minusSeconds(60));
        model.setConvertedFilePath("old.glb");

        model.recordConversionOutcome(ConversionOutcome.queued(AT));

        assertThat(model.getConversionStatus()).isEqualTo(ModelConversionStatus.QUEUED);
        assertThat(model.getConversionError()).isNull();
        assertThat(model.getConversionStartedAt()).isEqualTo(AT);
        assertThat(model.getConversionCompletedAt()).isNull();
        assertThat(model.getConvertedFilePath()).isNull();
    }

    @Test
    void processingRecordsTheStartAndLeavesCompletionAlone() {
        Model model = model();
        Instant completedEarlier = AT.minusSeconds(30);
        model.setConversionCompletedAt(completedEarlier);
        model.setConversionError("stale");

        model.recordConversionOutcome(ConversionOutcome.processing(AT));

        assertThat(model.getConversionStatus()).isEqualTo(ModelConversionStatus.PROCESSING);
        assertThat(model.getConversionError()).isNull();
        assertThat(model.getConversionStartedAt()).isEqualTo(AT);
        assertThat(model.getConversionCompletedAt()).isEqualTo(completedEarlier);
    }

    @Test
    void readyStoresTheConvertedFileAndClearsTheError() {
        Model model = model();
        model.setConversionError("previous attempt failed");

        model.recordConversionOutcome(ConversionOutcome.ready(AT, "previews/1.glb"));

        assertThat(model.getConversionStatus()).isEqualTo(ModelConversionStatus.READY);
        assertThat(model.getConversionError()).isNull();
        assertThat(model.getConversionCompletedAt()).isEqualTo(AT);
        assertThat(model.getConvertedFilePath()).isEqualTo("previews/1.glb");
    }

    @Test
    void readyWithoutAPathKeepsAnExistingPreviewReference() {
        // A cache-hit completion has no new file to store; dropping the reference the
        // viewer is already using would break the preview it points at.
        Model model = model();
        model.setConvertedFilePath("previews/existing.glb");

        model.recordConversionOutcome(ConversionOutcome.ready(AT, null));

        assertThat(model.getConversionStatus()).isEqualTo(ModelConversionStatus.READY);
        assertThat(model.getConvertedFilePath()).isEqualTo("previews/existing.glb");
    }

    @Test
    void failedStoresTheReasonAndDropsThePreview() {
        Model model = model();
        model.setConvertedFilePath("previews/1.glb");

        model.recordConversionOutcome(ConversionOutcome.failed(AT, "no engine for .sldprt"));

        assertThat(model.getConversionStatus()).isEqualTo(ModelConversionStatus.FAILED);
        assertThat(model.getConversionError()).isEqualTo("no engine for .sldprt");
        assertThat(model.getConversionCompletedAt()).isEqualTo(AT);
        assertThat(model.getConvertedFilePath()).isNull();
    }

    @Test
    void cancelledLeavesTheModelNotConvertedSoItCanBeSubmittedAgain() {
        Model model = model();

        model.recordConversionOutcome(ConversionOutcome.cancelled(AT, "Conversion cancelled."));

        assertThat(model.getConversionStatus()).isEqualTo(ModelConversionStatus.NOT_CONVERTED);
        assertThat(model.getConversionError()).isEqualTo("Conversion cancelled.");
        assertThat(model.getConversionCompletedAt()).isEqualTo(AT);
        assertThat(model.getConvertedFilePath()).isNull();
    }

    @Test
    void unsupportedNamesTheMissingEngine() {
        Model model = model();

        model.recordConversionOutcome(ConversionOutcome.unsupported(AT, "no engine here"));

        assertThat(model.getConversionStatus()).isEqualTo(ModelConversionStatus.UNSUPPORTED);
        assertThat(model.getConversionError()).isEqualTo("no engine here");
    }

    @Test
    void aNullReasonStaysNull() {
        Model model = model();

        model.recordConversionOutcome(ConversionOutcome.failed(AT, null));

        assertThat(model.getConversionStatus()).isEqualTo(ModelConversionStatus.FAILED);
        assertThat(model.getConversionError()).isNull();
    }

    @Test
    void aLongReasonIsBoundedByTheProjection() {
        String longReason = "x".repeat(1000);

        Model model = model();
        model.recordConversionOutcome(ConversionOutcome.failed(AT, longReason));

        assertThat(model.getConversionError()).hasSize(490);
        assertThat(longReason).startsWith(model.getConversionError());
    }

    @Test
    void theCadMapperDrivesTheEntityEndToEnd() {
        // The whole migration in one assertion: the CAD-side mapper reports, the
        // production entity decides what the columns become — no CAD class touches them.
        Model model = model();
        Path output = Path.of("previews", "7.glb");

        CadModelProjection.apply(model, CadConversionJobStatus.COMPLETED, null, output);

        assertThat(model.getConversionStatus()).isEqualTo(ModelConversionStatus.READY);
        assertThat(model.getConvertedFilePath()).isEqualTo(output.toString());
        assertThat(model.getConversionCompletedAt()).isNotNull();
        assertThat(model.getConversionError()).isNull();
    }

    @Test
    void anAdmissionRefusalReachesTheEntityAsUnsupported() {
        Model model = model();

        CadModelProjection.apply(model, ModelConversionStatus.UNSUPPORTED, "no engine", null);

        assertThat(model.getConversionStatus()).isEqualTo(ModelConversionStatus.UNSUPPORTED);
        assertThat(model.getConversionError()).isEqualTo("no engine");
    }
}
