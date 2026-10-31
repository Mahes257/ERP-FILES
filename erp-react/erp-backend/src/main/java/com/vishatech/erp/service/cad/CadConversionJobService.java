package com.vishatech.erp.service.cad;

import com.vishatech.erp.cad.CadConversionEngine;
import com.vishatech.erp.cad.CadFileTypes;
import com.vishatech.erp.cad.CadModelProjection;
import com.vishatech.erp.cad.CadmpegConversionEngine;
import com.vishatech.erp.cad.CadWorkerProperties;
import com.vishatech.erp.cad.ConversionProviderRegistry;
import com.vishatech.erp.cad.FreeCadConversionEngine;
import com.vishatech.erp.cad.SatAcisConversionEngine;
import com.vishatech.erp.cad.SolidWorksDetector;
import com.vishatech.erp.dto.CadConversionJobDTO;
import com.vishatech.erp.entity.CadConversionJob;
import com.vishatech.erp.entity.CadConversionJobStatus;
import com.vishatech.erp.entity.CadWorkerHeartbeat;
import com.vishatech.erp.exception.TooManyRequestsException;
import com.vishatech.erp.production.api.ModelConversionJobPort;
import com.vishatech.erp.production.api.ModelConversionJobPort.ModelFacts;
import com.vishatech.erp.production.api.ModelConversionProjectionPort.ConversionOutcome;
import com.vishatech.erp.repository.CadConversionJobRepository;
import com.vishatech.erp.repository.CadWorkerHeartbeatRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;

/**
 * Submits and tracks server-side CAD conversion jobs (SLDPRT / SLDASM / SAT).
 *
 * <p>The HTTP layer stays fast: submitting only writes a {@code QUEUED} row and
 * updates the model's existing conversion projection. The actual conversion runs
 * in the <b>isolated CAD worker process</b>, which claims the row atomically.
 * Clients poll {@code GET /cad-conversion/{jobId}}.
 *
 * <p>The model's conversion projection is read and written through the published
 * Production contract {@link ModelConversionJobPort} ({@code production.api}), so
 * this class holds no Production entity or repository at all: which file facts a
 * job needs, and what a job state means for the model's columns, is decided by
 * the module that owns them.
 *
 * <p>Honesty rules enforced here:
 * <ul>
 *   <li>A format with no engine on this server is refused <b>before</b> any job
 *       row exists (status {@code UNSUPPORTED}, model projection
 *       {@code UNSUPPORTED}) — no fake queued job that can never run.</li>
 *   <li>An oversized or missing source file is refused with a safe message.</li>
 *   <li>An already-converted model whose GLB is still on disk is served from
 *       that cache instead of converting again (file replacement resets the
 *       projection, so {@code READY} implies the preview matches the current
 *       file).</li>
 *   <li>Submitting twice while a job is in flight returns the SAME job — a
 *       duplicate request never starts a second conversion.</li>
 * </ul>
 */
@Service
public class CadConversionJobService {

    private static final Logger log = LoggerFactory.getLogger(CadConversionJobService.class);

    private final ModelConversionJobPort conversions;
    private final CadConversionJobRepository jobs;
    private final CadWorkerHeartbeatRepository heartbeats;
    private final ConversionProviderRegistry registry;
    private final CadWorkerProperties workerProperties;
    private final ObjectProvider<CadmpegConversionEngine> cadmpegProvider;
    private final ObjectProvider<SatAcisConversionEngine> satProvider;
    private final ObjectProvider<FreeCadConversionEngine> freeCadProvider;
    private final SolidWorksDetector solidWorksDetector;

    @Value("${app.cad-convert.enabled:true}")
    private boolean cadConvertEnabled;

    public CadConversionJobService(ModelConversionJobPort conversions,
                                   CadConversionJobRepository jobs,
                                   CadWorkerHeartbeatRepository heartbeats,
                                   ConversionProviderRegistry registry,
                                   CadWorkerProperties workerProperties,
                                   ObjectProvider<CadmpegConversionEngine> cadmpegProvider,
                                   ObjectProvider<SatAcisConversionEngine> satProvider,
                                   ObjectProvider<FreeCadConversionEngine> freeCadProvider,
                                   SolidWorksDetector solidWorksDetector) {
        this.conversions = conversions;
        this.jobs = jobs;
        this.heartbeats = heartbeats;
        this.registry = registry;
        this.workerProperties = workerProperties;
        this.cadmpegProvider = cadmpegProvider;
        this.satProvider = satProvider;
        this.freeCadProvider = freeCadProvider;
        this.solidWorksDetector = solidWorksDetector;
    }

    /** Outcome of a submission: accepted (a job exists) or refused (with reason). */
    public record SubmitResult(boolean accepted, String status, String message, CadConversionJobDTO job) {

        public static SubmitResult refused(String status, String message) {
            return new SubmitResult(false, status, message, null);
        }

        public static SubmitResult ok(CadConversionJobDTO job) {
            return new SubmitResult(true, job.getStatus(), null, job);
        }
    }

    /**
     * Queue (or reuse) a conversion for the model's current file.
     *
     * <p>Never blocks on conversion work: the row is written and the method
     * returns while the worker does the heavy lifting.
     */
    @Transactional
    public SubmitResult submit(Long modelId) {
        ModelFacts facts = conversions.find(modelId)
                .orElseThrow(() -> new NoSuchElementException("Model not found with id: " + modelId));

        String ft = CadConversionEngine.normalizeFileType(facts.fileType());
        if (CadFileTypes.isBrowserNative(ft)) {
            return SubmitResult.refused(ModelConversionJobPort.NOT_REQUIRED,
                    "This format is rendered directly in the browser and needs no conversion.");
        }

        // The source must actually exist on this server before we promise anything.
        if (facts.filePath() == null || !Files.isRegularFile(Paths.get(facts.filePath()))) {
            return refuseAndProject(facts, failed("The source CAD file is not available on the server."));
        }

        // Duplicate submission while a job is in flight -> return that job.
        Optional<CadConversionJob> active =
                jobs.findFirstByModelIdAndStatusInOrderByCreatedAtDesc(modelId, CadConversionJobStatus.ACTIVE);
        if (active.isPresent()) {
            CadConversionJob job = active.get();
            // Keep the model projection in step (e.g. after a worker restart left
            // the row QUEUED while the model said PROCESSING).
            applyProjection(facts, job.getStatus(), null, null);
            jobs.save(job);
            return SubmitResult.ok(CadConversionJobDTO.from(job));
        }

        // Bound the queue: a flood of submissions must not grow without limit.
        if (jobs.countByStatus(CadConversionJobStatus.QUEUED) >= workerProperties.getMaxQueuedJobs()) {
            throw new TooManyRequestsException(
                    "The CAD conversion queue is busy. Please try again in a few minutes.");
        }

        if (!cadConvertEnabled) {
            return refuseAndProject(facts, unsupported(
                    "CAD conversion is disabled on this server (app.cad-convert.enabled=false). "
                            + "Upload STEP/STP/IGES/IGS/GLB/STL for browser 3D preview."));
        }

        ConversionProviderRegistry.ProviderResolution resolution = registry.resolve(ft);
        if (!resolution.available || resolution.engine == null) {
            String reason = resolution.unavailableMessage != null
                    ? resolution.unavailableMessage
                    : "No CAD conversion engine is configured for ." + ft + " files on this server.";
            return refuseAndProject(facts, unsupported(reason));
        }

        long size = facts.fileSize() == null ? 0L : facts.fileSize();
        if (size > workerProperties.getMaxFileBytes()) {
            return refuseAndProject(facts, failed(
                    "The file is too large for server-side conversion ("
                            + formatMb(size) + " MB). The limit is "
                            + formatMb(workerProperties.getMaxFileBytes()) + " MB."));
        }

        // Cache: an existing, still-present GLB for this model is reused.
        if (facts.previewConverted()
                && facts.convertedFilePath() != null
                && Files.isRegularFile(Paths.get(facts.convertedFilePath()))) {
            CadConversionJob job = newJob(facts, resolution.engine);
            job.setStatus(CadConversionJobStatus.COMPLETED);
            job.setCacheHit(true);
            job.setOutputPath(facts.convertedFilePath());
            job.setCompletedAt(LocalDateTime.now());
            job.setErrorMessage(null);
            jobs.save(job);
            log.info("CAD conversion cache hit for model {} ({})", modelId, ft);
            return SubmitResult.ok(CadConversionJobDTO.from(job));
        }

        CadConversionJob job = newJob(facts, resolution.engine);
        jobs.save(job);
        applyProjection(facts, job.getStatus(), null, null);
        log.info("CAD conversion queued: job={} model={} type={} engine={}",
                job.getId(), modelId, ft, job.getEngine());
        return SubmitResult.ok(CadConversionJobDTO.from(job));
    }

    /** Current state of a job. Unknown ids are a 404 (ids are unguessable UUIDs). */
    @Transactional(readOnly = true)
    public CadConversionJobDTO get(String jobId) {
        CadConversionJob job = jobs.findById(jobId)
                .orElseThrow(() -> new NoSuchElementException("Conversion job not found: " + jobId));
        return CadConversionJobDTO.from(job);
    }

    /**
     * Latest job for a model — lets the viewer resume polling after a browser
     * refresh instead of submitting a second job.
     */
    @Transactional(readOnly = true)
    public Optional<CadConversionJobDTO> findLatestForModel(Long modelId) {
        Optional<CadConversionJob> active =
                jobs.findFirstByModelIdAndStatusInOrderByCreatedAtDesc(modelId, CadConversionJobStatus.ACTIVE);
        if (active.isPresent()) {
            return Optional.of(CadConversionJobDTO.from(active.get()));
        }
        return jobs.findFirstByModelIdOrderByCreatedAtDesc(modelId).map(CadConversionJobDTO::from);
    }

    /**
     * Cancel a job that has not started yet. A job already being processed by
     * the worker cannot be cancelled — its real state is returned unchanged.
     */
    @Transactional
    public CadConversionJobDTO cancel(String jobId) {
        CadConversionJob job = jobs.findById(jobId)
                .orElseThrow(() -> new NoSuchElementException("Conversion job not found: " + jobId));

        int updated = jobs.markCancelled(jobId,
                CadConversionJobStatus.QUEUED,
                CadConversionJobStatus.CANCELLED,
                LocalDateTime.now(),
                "Conversion cancelled before it started.");
        if (updated == 1) {
            // A model row that no longer exists is a no-op, exactly as the original
            // findById(...).orElse(null) skip was.
            conversions.recordOutcome(job.getModelId(),
                    CadModelProjection.outcomeFor(CadConversionJobStatus.CANCELLED,
                            "Conversion cancelled.", null));
            log.info("CAD conversion cancelled: job={} model={}", jobId, job.getModelId());
        }
        return CadConversionJobDTO.from(jobs.findById(jobId).orElse(job));
    }

    /**
     * Worker availability + queue depth + per-format engine capability, plus
     * per-engine auto-detection detail (cadmpeg / SAT / FreeCAD / SolidWorks):
     * installed vs available vs enabled, dependency-chain status and an
     * actionable message — booleans, file names and property names only, never
     * server paths or secrets. Authenticated like every other ERP endpoint; no
     * worker port is exposed.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> health() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("pipelineEnabled", cadConvertEnabled && workerProperties.isEnabled());
        out.put("maxQueuedJobs", workerProperties.getMaxQueuedJobs());
        out.put("maxFileBytes", workerProperties.getMaxFileBytes());
        out.put("timeoutSeconds", workerProperties.getTimeoutSeconds());
        out.put("allowedFileTypes", workerProperties.getAllowedFileTypeList());
        out.put("queuedJobs", jobs.countByStatus(CadConversionJobStatus.QUEUED));
        out.put("activeJobs", jobs.countByStatusIn(CadConversionJobStatus.ACTIVE));

        boolean workerOnline = false;
        CadWorkerHeartbeat latest = heartbeats.findAll().stream()
                .filter(h -> h.getUpdatedAt() != null)
                .max(java.util.Comparator.comparing(CadWorkerHeartbeat::getUpdatedAt))
                .orElse(null);
        if (latest != null) {
            long ageSeconds = java.time.Duration.between(latest.getUpdatedAt(), LocalDateTime.now()).getSeconds();
            workerOnline = "RUNNING".equals(latest.getStatus())
                    && ageSeconds <= workerProperties.getHeartbeatStaleSeconds();
            out.put("workerId", latest.getId());
            out.put("workerStatus", latest.getStatus());
            out.put("workerHeartbeatAgeSeconds", ageSeconds);
            out.put("workerActiveJobs", latest.getActiveJobs());
            out.put("workerMaxJobs", latest.getMaxJobs());
        }
        out.put("workerOnline", workerOnline);

        Map<String, Object> engines = new LinkedHashMap<>();
        for (String type : workerProperties.getAllowedFileTypeList()) {
            ConversionProviderRegistry.ProviderResolution r = registry.resolve(type);
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("available", r.available && r.engine != null);
            entry.put("engine", r.engine != null ? r.engine.getName() : null);
            entry.put("provider", r.provider != null ? r.provider.name() : null);
            entry.put("message", r.unavailableMessage);
            engines.put(type, entry);
        }
        out.put("engines", engines);

        // Per-engine capability detail. Every entry reports availability and an
        // actionable reason, but never a server path: `executable` is the file
        // NAME only (null while the binary is absent), `pathConfigured` /
        // `installed` are booleans, and messages name properties/env vars rather
        // than directories. Detection runs against configuration + filesystem on
        // every call, so the matrix always reflects the current server state.
        CadmpegConversionEngine cadmpeg = cadmpegProvider.getIfAvailable();
        if (cadmpeg != null) {
            boolean installed = cadmpeg.resolveExecutable() != null;
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("enabled", cadmpeg.isEnabled());
            entry.put("installed", installed);
            // Usable by the pipeline = switched on AND binary present.
            entry.put("available", cadmpeg.isEnabled() && installed);
            entry.put("executable", cadmpeg.getExecutableName());
            entry.put("expectedExecutable", cadmpeg.getExpectedExecutableName());
            entry.put("pathConfigured", !cadmpeg.getConfiguredPath().isEmpty());
            // Probed once: proves the binary executes (e.g. "0.6.0"), null when absent.
            entry.put("version", cadmpeg.getVersion());
            entry.put("timeoutSeconds", cadmpeg.getTimeoutSeconds());
            entry.put("message", cadmpeg.getConfigurationIssue());
            out.put("cadmpeg", entry);
        }

        // SAT engine detail: the complete dependency chain, one boolean per
        // link. SAT is only marked available when EVERY link is usable.
        SatAcisConversionEngine sat = satProvider.getIfAvailable();
        if (sat != null) {
            Map<String, Object> deps = new LinkedHashMap<>();
            deps.put("cadmpeg", sat.resolveCadmpegExecutable() != null);
            deps.put("node", sat.resolveNodeExecutable() != null);
            deps.put("tessellatorScript", sat.resolveTessellatorScript() != null);
            deps.put("occtImportJs", sat.resolveOcctDependency() != null);
            boolean depsOk = deps.values().stream().allMatch(v -> Boolean.TRUE.equals(v));
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("enabled", sat.isEnabled());
            entry.put("available", sat.isAvailable());
            entry.put("dependencies", deps);
            entry.put("dependenciesSatisfied", depsOk);
            entry.put("message", sat.getConfigurationIssue());
            out.put("sat", entry);
        }

        // FreeCAD detail: installed (detected) vs available (enabled AND
        // detected) are reported separately so "present but switched off" is
        // distinguishable from "not installed".
        FreeCadConversionEngine freeCad = freeCadProvider.getIfAvailable();
        if (freeCad != null) {
            File exe = freeCad.resolveExecutable();
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("enabled", freeCad.isEnabled());
            entry.put("installed", exe != null);
            entry.put("available", freeCad.isEnabled() && exe != null);
            entry.put("executable", exe != null ? exe.getName() : null);
            entry.put("pathConfigured", !freeCad.getConfiguredCommand().isEmpty());
            // The precise configuration problem, else the plain fact that no
            // FreeCAD exists here — an unavailable engine always says why.
            String freeCadIssue = freeCad.getConfigurationIssue();
            entry.put("message", freeCadIssue != null ? freeCadIssue
                    : (exe == null ? "FreeCAD is not installed on this server." : null));
            out.put("freecad", entry);
        }

        // SolidWorks (local COM): the existing detector decides — registry /
        // install-directory / COM-ProgID discovery, cached per process.
        boolean swDetected = solidWorksDetector.isAvailable();
        Map<String, Object> swEntry = new LinkedHashMap<>();
        swEntry.put("installed", swDetected);
        swEntry.put("available", swDetected);
        swEntry.put("executable", solidWorksDetector.findExecutable()
                .map(p -> p.getFileName().toString())
                .orElse(null));
        swEntry.put("message", swDetected ? null
                : "SolidWorks is not installed on this server (no local SolidWorks installation detected).");
        out.put("solidworks", swEntry);

        out.put("checkedAt", Instant.now().toString());
        return out;
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    private CadConversionJob newJob(ModelFacts facts, CadConversionEngine engine) {
        CadConversionJob job = new CadConversionJob();
        job.setId(UUID.randomUUID().toString());
        job.setModelId(facts.id());
        job.setStatus(CadConversionJobStatus.QUEUED);
        job.setFileType(CadConversionEngine.normalizeFileType(facts.fileType()));
        job.setSourceHash(facts.fileChecksum());
        job.setEngine(engine.getName());
        job.setRequestedBy(currentActor());
        return job;
    }

    /**
     * Refuse the submission AND leave the model projection honest.
     *
     * <p>The client-facing status is the outcome's own stage name, so the word the
     * caller sees and the value the projection writes can never disagree — for the
     * two refusals of this pipeline that is {@code FAILED} and {@code UNSUPPORTED},
     * exactly the two values the replaced code passed.
     */
    private SubmitResult refuseAndProject(ModelFacts facts, ConversionOutcome outcome) {
        conversions.recordOutcome(facts.id(), outcome);
        String message = outcome.reason();
        log.info("CAD conversion refused for model {} ({}) : {}", facts.id(), outcome.stage().name(), message);
        return SubmitResult.refused(outcome.stage().name(), message);
    }

    /** A refusal the server cannot serve: the source file is missing or too large. */
    private static ConversionOutcome failed(String reason) {
        return ConversionOutcome.failed(Instant.now(), reason);
    }

    /** A refusal because no engine on this server can convert the format. */
    private static ConversionOutcome unsupported(String reason) {
        return ConversionOutcome.unsupported(Instant.now(), reason);
    }

    /**
     * Mirrors a job state onto the pre-existing {@code models} columns the rest
     * of the ERP already reads. Shared with the worker via
     * {@link com.vishatech.erp.cad.CadModelProjection} so the mapping is single
     * sourced, and reported through the published {@link ModelConversionJobPort}
     * so this class never touches the model itself.
     */
    private void applyProjection(ModelFacts facts, String jobStatus, String message, Path outputPath) {
        conversions.recordOutcome(facts.id(),
                CadModelProjection.outcomeFor(jobStatus, message, outputPath));
    }

    private static String currentActor() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getName() == null || auth.getName().isBlank()) {
            return "system";
        }
        return auth.getName();
    }

    private static String formatMb(long bytes) {
        return String.format(java.util.Locale.ROOT, "%.1f", bytes / (1024.0 * 1024.0));
    }
}
