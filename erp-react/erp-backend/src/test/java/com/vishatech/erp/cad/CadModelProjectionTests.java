package com.vishatech.erp.cad;

import static org.assertj.core.api.Assertions.assertThat;

import com.vishatech.erp.entity.CadConversionJobStatus;
import com.vishatech.erp.production.api.ModelConversionProjectionPort;
import com.vishatech.erp.production.api.ModelConversionProjectionPort.ConversionOutcome;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The CAD side of the conversion projection contract: the shared mapper turns a job
 * state into the neutral {@link ConversionOutcome} the model projection understands,
 * and reports it through {@link ModelConversionProjectionPort} — and nothing else.
 *
 * <p>The projection is a recording stub here, which is the point: the mapper needs no
 * model entity, no repository and no production status vocabulary to state what
 * happened. What an outcome then means for the {@code models} columns is asserted
 * separately, on the projection itself
 * ({@code production.ModelConversionProjectionTests}).
 */
class CadModelProjectionTests {

    /** Records what the mapper reported; implements the contract only. */
    private static final class RecordingProjection implements ModelConversionProjectionPort {

        private final List<ConversionOutcome> outcomes = new ArrayList<>();

        @Override
        public void recordConversionOutcome(ConversionOutcome outcome) {
            outcomes.add(outcome);
        }
    }

    private final RecordingProjection projection = new RecordingProjection();

    private ConversionOutcome only() {
        assertThat(projection.outcomes).as("exactly one outcome per reported state").hasSize(1);
        return projection.outcomes.get(0);
    }

    @Test
    void queuedAndProcessingKeepTheirOwnStages() {
        CadModelProjection.apply(projection, CadConversionJobStatus.QUEUED, null, null);
        assertThat(only().stage()).isEqualTo(ConversionOutcome.Stage.QUEUED);
        assertThat(only().reason()).isNull();
        assertThat(only().convertedFilePath()).isNull();

        RecordingProjection second = new RecordingProjection();
        CadModelProjection.apply(second, CadConversionJobStatus.PROCESSING, null, null);
        assertThat(second.outcomes.get(0).stage()).isEqualTo(ConversionOutcome.Stage.PROCESSING);
    }

    @Test
    void aCompletedJobReportsReadyWithTheGeneratedPreviewPath() {
        Path output = Path.of("target", "previews", "model-7.glb");

        CadModelProjection.apply(projection, CadConversionJobStatus.COMPLETED, null, output);

        assertThat(only().stage()).isEqualTo(ConversionOutcome.Stage.READY);
        assertThat(only().convertedFilePath()).isEqualTo(output.toString());
    }

    @Test
    void aCompletedJobWithoutAPathReportsReadyWithoutOne() {
        CadModelProjection.apply(projection, CadConversionJobStatus.COMPLETED, null, null);

        assertThat(only().stage()).isEqualTo(ConversionOutcome.Stage.READY);
        assertThat(only().convertedFilePath()).isNull();
    }

    @Test
    void failedAndCancelledCarryTheirReasonAndNoPreview() {
        CadModelProjection.apply(projection, CadConversionJobStatus.FAILED, "engine crashed", null);
        assertThat(only().stage()).isEqualTo(ConversionOutcome.Stage.FAILED);
        assertThat(only().reason()).isEqualTo("engine crashed");
        assertThat(only().convertedFilePath()).isNull();

        RecordingProjection cancelled = new RecordingProjection();
        CadModelProjection.apply(cancelled, CadConversionJobStatus.CANCELLED, "cancelled", null);
        assertThat(cancelled.outcomes.get(0).stage()).isEqualTo(ConversionOutcome.Stage.CANCELLED);
        assertThat(cancelled.outcomes.get(0).reason()).isEqualTo("cancelled");
    }

    @Test
    void anAdmissionRefusalIsReportedAsUnsupported() {
        // The ERP refuses a submission when no engine on this server can convert the
        // format; that state is not a job status, and it must not be mistaken for a
        // successful outcome.
        CadModelProjection.apply(projection, "UNSUPPORTED", "no engine for this format", null);

        assertThat(only().stage()).isEqualTo(ConversionOutcome.Stage.UNSUPPORTED);
        assertThat(only().reason()).isEqualTo("no engine for this format");
        assertThat(only().convertedFilePath()).isNull();
    }

    @Test
    void anyUnrecognisedStateIsTreatedAsAnUnsupportedRefusal() {
        ConversionOutcome outcome = CadModelProjection.outcomeFor("SOMETHING_NEW", "why", null);

        assertThat(outcome.stage())
                .as("an unknown state must never be reported as a successful conversion")
                .isEqualTo(ConversionOutcome.Stage.UNSUPPORTED);
    }

    @Test
    void theOutcomeCarriesTheTimeOfTheReport() {
        Instant before = Instant.now();

        CadModelProjection.apply(projection, CadConversionJobStatus.QUEUED, null, null);

        assertThat(only().at()).isNotNull().isAfterOrEqualTo(before);
    }

    @Test
    void theMapperReportsThroughTheContractOnlyOncePerState() {
        // Two states in a row -> two independent reports, no state carried over.
        CadModelProjection.apply(projection, CadConversionJobStatus.QUEUED, null, null);
        CadModelProjection.apply(projection, CadConversionJobStatus.COMPLETED, null, Path.of("a.glb"));

        assertThat(projection.outcomes).hasSize(2);
        assertThat(projection.outcomes.get(0).stage()).isEqualTo(ConversionOutcome.Stage.QUEUED);
        assertThat(projection.outcomes.get(0).convertedFilePath()).isNull();
        assertThat(projection.outcomes.get(1).stage()).isEqualTo(ConversionOutcome.Stage.READY);
        assertThat(projection.outcomes.get(1).convertedFilePath()).isEqualTo("a.glb");
    }
}
