package com.vishatech.erp;

import com.vishatech.erp.entity.CadConversionJob;
import com.vishatech.erp.entity.CadConversionJobStatus;
import com.vishatech.erp.entity.production.Model;
import com.vishatech.erp.entity.production.ModelConversionStatus;
import com.vishatech.erp.repository.CadConversionJobRepository;
import com.vishatech.erp.repository.production.ModelRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.service.cad.CadConversionJobService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Admission control for the server-side CAD conversion queue.
 *
 * <p>These tests encode the honesty contract of the job API: a browser format
 * is never queued, a format with no engine on this server is refused BEFORE any
 * job row exists, a missing source file is refused with a safe reason, a
 * duplicate submission reuses the in-flight job instead of creating a second
 * one, and health reports the real engine matrix. Nothing here converts a
 * file — conversion runs only in the isolated worker process.
 */
@SpringBootTest
class CadConversionJobServiceTests extends AbstractSecurityTest {

    @Autowired
    private CadConversionJobService service;

    @Autowired
    private ModelRepository models;

    @Autowired
    private CadConversionJobRepository jobs;

    private Model newModel(String fileType, Path file) {
        Model model = Model.builder()
                .modelNumber("CADJOB-" + UUID.randomUUID().toString().substring(0, 8))
                .workOrderId("WO-CADJOB")
                .fileName("sample." + fileType)
                .fileType("." + fileType)
                .fileSize(file != null && Files.exists(file) ? fileSizeQuietly(file) : 0L)
                .filePath(file != null ? file.toString() : null)
                .fileChecksum(UUID.randomUUID().toString().replace("-", ""))
                .build();
        return models.save(model);
    }

    private static long fileSizeQuietly(Path p) {
        try {
            return Files.size(p);
        } catch (Exception e) {
            return 0L;
        }
    }

    @Test
    void browserFormatIsNeverQueued() {
        Model model = newModel("glb", null);
        CadConversionJobService.SubmitResult result = service.submit(model.getId());
        assertThat(result.accepted()).isFalse();
        assertThat(result.status()).isEqualTo(ModelConversionStatus.NOT_REQUIRED);
        assertThat(jobs.countByModelId(model.getId())).isZero();
    }

    @Test
    void satSubmissionMatchesTheRealEngineCapability() throws Exception {
        Path sat = Files.createTempFile("cadjob", ".sat");
        Files.write(sat, new byte[]{0x41, 0x42, 0x43});
        Model model = newModel("sat", sat);
        try {
            CadConversionJobService.SubmitResult result = service.submit(model.getId());
            // Whether SAT is convertible here depends on the machine (cadmpeg, Node
            // and the OpenCascade tessellator helper must all be present), so the
            // contract under test is consistency, not a fixed answer — exactly like
            // the SLDPRT case below. Neither outcome may fake success.
            if (result.accepted()) {
                // A real engine exists: the request is queued with a durable row.
                assertThat(result.job()).isNotNull();
                assertThat(jobs.countByModelId(model.getId())).isPositive();
            } else {
                // No engine here: refused with the real capability gap, and no job
                // row is left behind.
                assertThat(result.status()).isEqualTo(ModelConversionStatus.UNSUPPORTED);
                assertThat(result.message())
                        .as("must state the real capability gap, never fake success")
                        .isNotBlank();
                assertThat(jobs.countByModelId(model.getId())).isZero();
                // The model projection is updated so the viewer can explain it too.
                Model reloaded = models.findById(model.getId()).orElseThrow();
                assertThat(reloaded.getConversionStatus()).isEqualTo(ModelConversionStatus.UNSUPPORTED);
            }
        } finally {
            // Never strand a QUEUED row — a real worker would otherwise claim it.
            jobs.findFirstByModelIdOrderByCreatedAtDesc(model.getId())
                    .ifPresent(job -> jobs.deleteById(job.getId()));
            Files.deleteIfExists(sat);
        }
    }

    @Test
    void sldprtSubmissionMatchesTheRealEngineCapability() throws Exception {
        Path sld = Files.createTempFile("cadjob", ".sldprt");
        Files.write(sld, new byte[]{(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0});
        Model model = newModel("sldprt", sld);
        try {
            CadConversionJobService.SubmitResult result = service.submit(model.getId());
            // Whether SLDPRT is convertible here depends on the machine (the
            // SolidWorks local engine, the cross-platform cadmpeg, or neither),
            // so the contract under test is consistency, not a fixed answer:
            if (result.accepted()) {
                // A real engine exists: the request is queued with a durable row.
                assertThat(result.job()).isNotNull();
                assertThat(jobs.countByModelId(model.getId())).isPositive();
            } else {
                // No engine here: refused with the real capability gap, and no
                // job row is left behind. Never fake success either way.
                assertThat(result.message())
                        .as("must state the real capability gap, never fake success")
                        .containsIgnoringCase("unavailable");
                assertThat(jobs.countByModelId(model.getId())).isZero();
            }
        } finally {
            // Never strand a QUEUED row — a real worker would otherwise claim it.
            jobs.findFirstByModelIdOrderByCreatedAtDesc(model.getId())
                    .ifPresent(job -> jobs.deleteById(job.getId()));
            Files.deleteIfExists(sld);
        }
    }

    @Test
    void missingSourceFileIsRefusedWithASafeReason() {
        Model model = newModel("sldprt", null);
        CadConversionJobService.SubmitResult result = service.submit(model.getId());
        assertThat(result.accepted()).isFalse();
        assertThat(result.status()).isEqualTo("FAILED");
        assertThat(result.message()).contains("not available on the server");
        assertThat(jobs.countByModelId(model.getId())).isZero();
    }

    @Test
    void duplicateSubmissionReturnsTheSameInFlightJob() throws Exception {
        Path sld = Files.createTempFile("cadjob", ".sldprt");
        Files.write(sld, new byte[]{(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0});
        Model model = newModel("sldprt", sld);
        try {
            // Seed an in-flight job exactly as the queue would hold it.
            CadConversionJob seeded = new CadConversionJob();
            seeded.setId(UUID.randomUUID().toString());
            seeded.setModelId(model.getId());
            seeded.setStatus(CadConversionJobStatus.QUEUED);
            seeded.setFileType("sldprt");
            seeded.setSourceHash(model.getFileChecksum());
            seeded.setEngine("test-engine");
            jobs.save(seeded);

            CadConversionJobService.SubmitResult first = service.submit(model.getId());
            CadConversionJobService.SubmitResult second = service.submit(model.getId());

            assertThat(first.accepted()).isTrue();
            assertThat(second.accepted()).isTrue();
            assertThat(first.job().getJobId()).isEqualTo(seeded.getId());
            assertThat(second.job().getJobId()).isEqualTo(seeded.getId());
            assertThat(jobs.countByModelId(model.getId())).isEqualTo(1);
        } finally {
            Files.deleteIfExists(sld);
        }
    }

    @Test
    void unknownJobAndModelAreNotFound() {
        assertThatThrownBy(() -> service.get("no-such-job-id"))
                .isInstanceOf(NoSuchElementException.class);
        assertThatThrownBy(() -> service.submit(99_999_999L))
                .isInstanceOf(NoSuchElementException.class);
    }

    @Test
    void healthReportsLimitsEnginesAndWorkerLiveness() {
        Map<String, Object> health = service.health();
        assertThat(health).containsKeys(
                "pipelineEnabled", "maxQueuedJobs", "maxFileBytes", "timeoutSeconds",
                "queuedJobs", "activeJobs", "workerOnline", "engines", "checkedAt");
        @SuppressWarnings("unchecked")
        Map<String, Object> engines = (Map<String, Object>) health.get("engines");
        assertThat(engines).containsKeys("sldprt", "sldasm", "sat");
        // Engine availability must be reported, not assumed.
        for (String type : List.of("sldprt", "sldasm", "sat")) {
            @SuppressWarnings("unchecked")
            Map<String, Object> entry = (Map<String, Object>) engines.get(type);
            assertThat(entry).containsKey("available");
        }
        // Per-engine auto-detection detail: every engine reports its state.
        assertThat(health).containsKeys("cadmpeg", "sat", "freecad", "solidworks");

        @SuppressWarnings("unchecked")
        Map<String, Object> cadmpeg = (Map<String, Object>) health.get("cadmpeg");
        assertThat(cadmpeg).containsKeys("enabled", "installed", "available", "version", "message");
        // available ⇔ switched on AND binary detected — never a half-enabled engine.
        assertThat(cadmpeg.get("available"))
                .isEqualTo(Boolean.TRUE.equals(cadmpeg.get("enabled"))
                        && Boolean.TRUE.equals(cadmpeg.get("installed")));
        // The version is either a real string from the binary or null — never invented.
        assertThat(cadmpeg.get("version") == null || cadmpeg.get("version") instanceof String).isTrue();

        @SuppressWarnings("unchecked")
        Map<String, Object> sat = (Map<String, Object>) health.get("sat");
        assertThat(sat).containsKeys("enabled", "available", "dependencies", "dependenciesSatisfied", "message");
        @SuppressWarnings("unchecked")
        Map<String, Object> deps = (Map<String, Object>) sat.get("dependencies");
        assertThat(deps).containsKeys("cadmpeg", "node", "tessellatorScript", "occtImportJs");
        // SAT is never partially enabled: available ⇔ enabled AND every link present.
        assertThat(sat.get("available"))
                .isEqualTo(Boolean.TRUE.equals(sat.get("enabled"))
                        && Boolean.TRUE.equals(sat.get("dependenciesSatisfied")));

        @SuppressWarnings("unchecked")
        Map<String, Object> freecad = (Map<String, Object>) health.get("freecad");
        assertThat(freecad).containsKeys("enabled", "installed", "available", "executable", "message");
        assertThat(freecad.get("available"))
                .isEqualTo(Boolean.TRUE.equals(freecad.get("enabled"))
                        && Boolean.TRUE.equals(freecad.get("installed")));

        @SuppressWarnings("unchecked")
        Map<String, Object> solidworks = (Map<String, Object>) health.get("solidworks");
        assertThat(solidworks).containsKeys("installed", "available", "message");
        assertThat(solidworks.get("available")).isEqualTo(solidworks.get("installed"));

        // No server filesystem paths leak through the response — only booleans,
        // file NAMES and messages.
        assertThat(health.toString()).doesNotContain(":\\Users\\");

        // No worker process is running during tests: health must say so.
        assertThat(health.get("workerOnline")).isEqualTo(Boolean.FALSE);
    }
}
