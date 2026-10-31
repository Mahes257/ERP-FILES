package com.vishatech.cadworker;

import static org.assertj.core.api.Assertions.assertThat;

import com.vishatech.erp.entity.CadConversionJob;
import com.vishatech.erp.entity.CadConversionJobStatus;
import com.vishatech.erp.entity.production.Model;
import com.vishatech.erp.entity.production.ModelConversionStatus;
import com.vishatech.erp.repository.CadConversionJobRepository;
import com.vishatech.erp.repository.production.ModelHistoryRepository;
import com.vishatech.erp.repository.production.ModelRepository;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * The <b>worker</b> half of the conversion projection contract.
 *
 * <p>The isolated CAD worker process is the second caller of the projection: it runs from
 * the same jar with a narrower component scan ({@code com.vishatech.erp.cad} +
 * {@code com.vishatech.cadworker}), so it cannot load a Production service bean — which is
 * exactly why the contract is implemented by the model entity itself rather than by an
 * adapter bean. These tests start that real worker context and let
 * {@link CadJobStore} complete and fail a job, asserting that the model projection columns
 * and the conversion timeline entry are written through the contract, with no CAD class
 * touching a production entity or status constant.
 *
 * <p>In-memory H2, same configuration as the worker's persistence-unit test.
 */
@SpringBootTest(
        classes = CadWorkerConfiguration.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE)
class CadWorkerProjectionTests {

    @DynamicPropertySource
    static void h2DataSource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () ->
                "jdbc:h2:mem:cadworkerprojection;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE"
                        + ";INIT=CREATE DOMAIN IF NOT EXISTS \"TEXT\" AS CLOB"
                        + "\\;CREATE DOMAIN IF NOT EXISTS \"LONGTEXT\" AS CLOB"
                        + "\\;CREATE DOMAIN IF NOT EXISTS \"MEDIUMBLOB\" AS BLOB");
    }

    @Autowired
    private CadJobStore store;

    @Autowired
    private ModelRepository models;

    @Autowired
    private CadConversionJobRepository jobs;

    @Autowired
    private ModelHistoryRepository history;

    private Model newModel() {
        return models.save(Model.builder()
                .modelNumber("CADWORK-" + UUID.randomUUID().toString().substring(0, 8))
                .workOrderId("WO-CADWORK")
                .fileName("part.sldprt")
                .fileType(".sldprt")
                .build());
    }

    private CadConversionJob newJob(Model model, String status) {
        CadConversionJob job = new CadConversionJob();
        job.setId(UUID.randomUUID().toString());
        job.setModelId(model.getId());
        job.setStatus(status);
        job.setFileType("sldprt");
        job.setEngine("cadmpeg");
        job.setAttempts(1);
        job.setMaxAttempts(3);
        return jobs.save(job);
    }

    @Test
    void aCompletedJobPublishesThePreviewOnTheModelProjection() {
        Model model = newModel();
        CadConversionJob job = newJob(model, CadConversionJobStatus.PROCESSING);
        Path output = Path.of("target", "cad-worker-test", job.getId() + ".glb");

        store.markCompleted(job.getId(), output);

        Model reloaded = models.findById(model.getId()).orElseThrow();
        assertThat(reloaded.getConversionStatus()).isEqualTo(ModelConversionStatus.READY);
        assertThat(reloaded.getConvertedFilePath()).isEqualTo(output.toString());
        assertThat(reloaded.getConversionCompletedAt()).isNotNull();
        assertThat(reloaded.getConversionError()).isNull();

        CadConversionJob reloadedJob = jobs.findById(job.getId()).orElseThrow();
        assertThat(reloadedJob.getStatus()).isEqualTo(CadConversionJobStatus.COMPLETED);
        assertThat(reloadedJob.getOutputPath()).isEqualTo(output.toString());

        assertThat(history.findByModelIdOrderByPerformedAtDesc(model.getId()))
                .as("the worker still records the conversion timeline entry")
                .anySatisfy(entry -> assertThat(entry.getAction()).isEqualTo("Converted"));
    }

    @Test
    void aFailedJobPublishesOnlyASafeReasonAndNoPreview() {
        Model model = newModel();
        CadConversionJob job = newJob(model, CadConversionJobStatus.PROCESSING);
        String raw = "engine failed at C:\\tools\\cad.exe\nwhile reading /var/lib/erp/model.sldprt";

        store.markFailed(job.getId(), raw);

        Model reloaded = models.findById(model.getId()).orElseThrow();
        assertThat(reloaded.getConversionStatus()).isEqualTo(ModelConversionStatus.FAILED);
        assertThat(reloaded.getConversionError())
                .as("the projection stores the sanitised, single-line reason")
                .doesNotContain("C:\\")
                .doesNotContain("/var/lib")
                .doesNotContain("\n")
                .doesNotContain("\r");
        assertThat(reloaded.getConvertedFilePath()).isNull();
        assertThat(reloaded.getConversionCompletedAt()).isNotNull();

        CadConversionJob reloadedJob = jobs.findById(job.getId()).orElseThrow();
        assertThat(reloadedJob.getStatus()).isEqualTo(CadConversionJobStatus.FAILED);
        assertThat(reloadedJob.getErrorMessage()).isNotBlank();
    }

    @Test
    void aFailedJobForAMissingModelStillFailsTheJobRow() {
        // The projection must never turn a job-state write into a crash: the worker
        // owns the queue row first, the model projection second.
        CadConversionJob orphan = new CadConversionJob();
        orphan.setId(UUID.randomUUID().toString());
        orphan.setModelId(999_999_999L);
        orphan.setStatus(CadConversionJobStatus.PROCESSING);
        orphan.setFileType("sldprt");
        jobs.save(orphan);

        store.markFailed(orphan.getId(), "engine failed");

        assertThat(jobs.findById(orphan.getId()).orElseThrow().getStatus())
                .isEqualTo(CadConversionJobStatus.FAILED);
        assertThat(models.findById(999_999_999L)).isEmpty();
    }
}
