package com.vishatech.erp.production;

import static org.assertj.core.api.Assertions.assertThat;

import com.vishatech.erp.entity.production.Model;
import com.vishatech.erp.entity.production.ModelConversionStatus;
import com.vishatech.erp.production.api.ModelConversionJobPort;
import com.vishatech.erp.production.api.ModelConversionJobPort.ModelFacts;
import com.vishatech.erp.production.api.ModelConversionProjectionPort.ConversionOutcome;
import com.vishatech.erp.repository.production.ModelRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * §14.13 — the published contract the ERP-side CAD job pipeline reads and records
 * through, exercised against a real database row.
 *
 * <p>{@code service.cad.CadConversionJobService} used to hold
 * {@code ModelRepository} and the {@code Model} entity itself. It now asks
 * {@link ModelConversionJobPort} for the facts a job needs and hands back an outcome,
 * and this adapter — the production-owned implementation — is what actually loads the
 * row, applies the projection and persists it. These tests pin the four pieces of that
 * contract that the migration must not change:
 *
 * <ul>
 *   <li>the facts a job is built from (identity, file columns, checksum, and whether a
 *       converted preview is recorded);</li>
 *   <li>a missing model is an empty result, so the pipeline keeps raising its own 404
 *       and the cancel path keeps skipping a deleted row;</li>
 *   <li>an outcome still reaches the same columns, through the same projection the
 *       worker uses;</li>
 *   <li>the refusal word published for a browser-native upload is the column's own
 *       value — they cannot drift apart silently.</li>
 * </ul>
 */
@SpringBootTest
class ModelConversionJobAdapterTests extends AbstractSecurityTest {

    private static final long UNKNOWN_MODEL_ID = 9_000_000_000L;

    @Autowired
    private ModelConversionJobPort conversions;

    @Autowired
    private ModelRepository models;

    private Model seedModel(String fileType, String conversionStatus, String convertedFilePath) {
        Model model = Model.builder()
                .modelNumber("CADJOB-" + UUID.randomUUID().toString().substring(0, 8))
                .workOrderId("WO-CADJOB")
                .fileName("sample." + fileType)
                .fileType("." + fileType)
                .fileSize(2048L)
                .filePath("C:/uploads/sample." + fileType)
                .fileChecksum("checksum-" + UUID.randomUUID())
                .build();
        model.setConversionStatus(conversionStatus);
        model.setConvertedFilePath(convertedFilePath);
        return models.save(model);
    }

    @Test
    void theFactsCarryExactlyWhatAJobNeeds() {
        Model model = seedModel("step", ModelConversionStatus.NOT_CONVERTED, null);

        ModelFacts facts = conversions.find(model.getId()).orElseThrow();

        assertThat(facts.id()).isEqualTo(model.getId());
        assertThat(facts.fileType()).isEqualTo(".step");
        assertThat(facts.fileSize()).isEqualTo(2048L);
        assertThat(facts.fileChecksum()).isEqualTo(model.getFileChecksum());
        assertThat(facts.filePath()).isEqualTo(model.getFilePath());
        assertThat(facts.previewConverted()).isFalse();
        assertThat(facts.convertedFilePath()).isNull();
    }

    @Test
    void aReadyProjectionIsReportedAsAConvertedPreviewAndNothingElseIs() {
        Model ready = seedModel("step", ModelConversionStatus.READY, "C:/previews/ready.glb");
        Model queued = seedModel("step", ModelConversionStatus.QUEUED, null);
        Model failed = seedModel("step", ModelConversionStatus.FAILED, null);

        assertThat(conversions.find(ready.getId()).orElseThrow().previewConverted()).isTrue();
        assertThat(conversions.find(ready.getId()).orElseThrow().convertedFilePath())
                .isEqualTo("C:/previews/ready.glb");
        assertThat(conversions.find(queued.getId()).orElseThrow().previewConverted()).isFalse();
        assertThat(conversions.find(failed.getId()).orElseThrow().previewConverted()).isFalse();
    }

    @Test
    void aMissingModelIsAnEmptyResultRatherThanAnException() {
        assertThat(conversions.find(UNKNOWN_MODEL_ID)).isEmpty();
        assertThat(conversions.find(null)).isEmpty();
    }

    @Test
    void anOutcomeStillReachesTheSameColumnsThroughTheSharedProjection() {
        Model model = seedModel("step", ModelConversionStatus.NOT_CONVERTED, null);

        conversions.recordOutcome(model.getId(), ConversionOutcome.queued(Instant.now()));
        assertThat(models.findById(model.getId()).orElseThrow().getConversionStatus())
                .isEqualTo(ModelConversionStatus.QUEUED);

        conversions.recordOutcome(model.getId(), ConversionOutcome.processing(Instant.now()));
        assertThat(models.findById(model.getId()).orElseThrow().getConversionStatus())
                .isEqualTo(ModelConversionStatus.PROCESSING);

        conversions.recordOutcome(model.getId(),
                ConversionOutcome.ready(Instant.now(), "C:/previews/model.glb"));
        Model ready = models.findById(model.getId()).orElseThrow();
        assertThat(ready.getConversionStatus()).isEqualTo(ModelConversionStatus.READY);
        assertThat(ready.getConvertedFilePath()).isEqualTo("C:/previews/model.glb");

        conversions.recordOutcome(model.getId(), ConversionOutcome.failed(Instant.now(), "engine crashed"));
        Model failed = models.findById(model.getId()).orElseThrow();
        assertThat(failed.getConversionStatus()).isEqualTo(ModelConversionStatus.FAILED);
        assertThat(failed.getConvertedFilePath()).isNull();
        assertThat(failed.getConversionError()).isEqualTo("engine crashed");

        conversions.recordOutcome(model.getId(), ConversionOutcome.cancelled(Instant.now(), "cancelled"));
        assertThat(models.findById(model.getId()).orElseThrow().getConversionStatus())
                .isEqualTo(ModelConversionStatus.NOT_CONVERTED);

        conversions.recordOutcome(model.getId(), ConversionOutcome.unsupported(Instant.now(), "no engine"));
        assertThat(models.findById(model.getId()).orElseThrow().getConversionStatus())
                .isEqualTo(ModelConversionStatus.UNSUPPORTED);
    }

    @Test
    void recordingAnOutcomeForAMissingModelIsANoOp() {
        conversions.recordOutcome(UNKNOWN_MODEL_ID, ConversionOutcome.queued(Instant.now()));
        conversions.recordOutcome(null, ConversionOutcome.queued(Instant.now()));

        // Nothing was created and nothing was thrown: the cancel path's original
        // "model row is gone -> skip" behaviour.
        assertThat(models.findById(UNKNOWN_MODEL_ID)).isEmpty();
    }

    @Test
    void theRefusalWordIsTheColumnsOwnNotRequiredValue() {
        assertThat(ModelConversionJobPort.NOT_REQUIRED)
                .as("the status reported to a browser-native upload must be the column's value")
                .isEqualTo(ModelConversionStatus.NOT_REQUIRED);
    }
}
