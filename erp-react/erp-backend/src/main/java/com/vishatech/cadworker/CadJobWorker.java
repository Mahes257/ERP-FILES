package com.vishatech.cadworker;

import com.vishatech.erp.cad.CadConversionEngine;
import com.vishatech.erp.cad.CadConversionResult;
import com.vishatech.erp.cad.CadWorkerProperties;
import com.vishatech.erp.cad.ConversionProviderRegistry;
import com.vishatech.erp.entity.CadConversionJob;
import com.vishatech.erp.entity.CadConversionJobStatus;
import com.vishatech.erp.entity.production.Model;
import com.vishatech.erp.repository.production.ModelRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * The isolated CAD conversion worker.
 *
 * <p>Runs in its OWN process (see {@link CadWorkerApplication}) with its own
 * bounded thread pools, so a slow or crashing CAD engine can never block or
 * take down the Spring Boot ERP:
 *
 * <pre>
 *   claim (atomic)  ->  stage input in /tmp/cad-jobs/{jobId}/input
 *                    ->  engine.convert(...)   (worker timeout enforced)
 *                    ->  validate the GLB      (magic, length, meshes, data)
 *                    ->  publish to controlled preview storage
 *                    ->  COMPLETED + model READY   (or FAILED + safe reason)
 *                    ->  delete the staging directory (always)
 * </pre>
 *
 * <p>Security posture:
 * <ul>
 *   <li>Input is staged under a <b>job-id</b> directory — a user-supplied file
 *       name never reaches a path or a command line.</li>
 *   <li>Engines are executed by {@link java.lang.ProcessBuilder} with an
 *       argument array (inside the engine classes), never by building a shell
 *       string.</li>
 *   <li>Every job has a hard wall-clock timeout, a size cap, and a type
 *       allow-list; staging is removed on success, failure and timeout.</li>
 *   <li>The worker opens no network port.</li>
 * </ul>
 */
@Component
public class CadJobWorker {

    private static final Logger log = LoggerFactory.getLogger(CadJobWorker.class);

    private final CadJobStore store;
    private final ModelRepository models;
    private final ConversionProviderRegistry registry;
    private final CadWorkerProperties properties;
    private final GlbOutputValidator validator = new GlbOutputValidator();

    private final ExecutorService jobPool;
    private final ExecutorService enginePool;
    private final AtomicInteger inFlight = new AtomicInteger();
    private final String workerId;

    public CadJobWorker(CadJobStore store,
                        ModelRepository models,
                        ConversionProviderRegistry registry,
                        CadWorkerProperties properties) {
        this.store = store;
        this.models = models;
        this.registry = registry;
        this.properties = properties;
        this.workerId = properties.getWorkerId();
        this.jobPool = Executors.newFixedThreadPool(
                properties.getMaxConcurrentJobs(), namedThreads("cad-job-"));
        this.enginePool = Executors.newFixedThreadPool(
                properties.getMaxConcurrentJobs(), namedThreads("cad-engine-"));
    }

    private static ThreadFactory namedThreads(String prefix) {
        AtomicInteger n = new AtomicInteger();
        return r -> {
            Thread t = new Thread(r, prefix + n.incrementAndGet());
            t.setDaemon(true);
            return t;
        };
    }

    public String getWorkerId() {
        return workerId;
    }

    public int getInFlight() {
        return inFlight.get();
    }

    public CadWorkerProperties getProperties() {
        return properties;
    }

    /** First configured engine that can actually serve an allowed format. */
    public String primaryEngineName() {
        for (String type : properties.getAllowedFileTypeList()) {
            ConversionProviderRegistry.ProviderResolution r = registry.resolve(type);
            if (r.available && r.engine != null) {
                return r.engine.getName();
            }
        }
        return null;
    }

    /**
     * Claim as many jobs as there are free slots. Called on every poll tick;
     * returns the number of jobs started (0 when the queue is idle).
     */
    public int dispatch() {
        if (!properties.isEnabled()) {
            return 0;
        }
        int started = 0;
        while (inFlight.get() < properties.getMaxConcurrentJobs()) {
            Optional<CadConversionJob> claimed = store.claimNext(workerId);
            if (claimed.isEmpty()) {
                break;
            }
            String jobId = claimed.get().getId();
            inFlight.incrementAndGet();
            jobPool.submit(() -> {
                try {
                    execute(jobId);
                } catch (Exception e) {
                    log.error("CAD job {} failed unexpectedly", jobId, e);
                    try {
                        store.markFailed(jobId, "CAD conversion failed: " + e.getClass().getSimpleName());
                    } catch (Exception ignored) {
                        // The recovery sweep will finish the job if this write fails.
                    }
                } finally {
                    inFlight.decrementAndGet();
                }
            });
            started++;
        }
        return started;
    }

    /**
     * Full pipeline for one claimed job. Package-private so tests can drive it
     * deterministically without starting the scheduler.
     */
    void execute(String jobId) {
        long startedAt = System.currentTimeMillis();
        String outcome = CadConversionJobStatus.FAILED;
        Path jobDir = properties.getTempRoot().resolve(jobId);
        try {
            Optional<CadConversionJob> loaded = store.reload(jobId);
            if (loaded.isEmpty()) {
                log.warn("CAD job {} no longer exists", jobId);
                return;
            }
            CadConversionJob job = loaded.get();
            if (!CadConversionJobStatus.PROCESSING.equals(job.getStatus())) {
                log.info("CAD job {} was {} while starting — skipped", jobId, job.getStatus());
                return;
            }

            String ft = CadConversionEngine.normalizeFileType(job.getFileType());
            if (!properties.getAllowedFileTypes().contains(ft)) {
                store.markFailed(jobId, "File type ." + ft + " is not accepted for server-side conversion.");
                return;
            }

            Model model = models.findById(job.getModelId()).orElse(null);
            if (model == null) {
                store.markFailed(jobId, "The model no longer exists.");
                return;
            }

            if (model.getFilePath() == null) {
                store.markFailed(jobId, "The source CAD file is not available on the server.");
                return;
            }
            Path source = Paths.get(model.getFilePath());
            if (!Files.isRegularFile(source)) {
                store.markFailed(jobId, "The source CAD file is not available on the server.");
                return;
            }
            long size = Files.size(source);
            if (size > properties.getMaxFileBytes()) {
                store.markFailed(jobId, "The file is too large for server-side conversion.");
                return;
            }
            if (size == 0) {
                store.markFailed(jobId, "The source file is empty.");
                return;
            }

            ConversionProviderRegistry.ProviderResolution resolution = registry.resolve(ft);
            if (!resolution.available || resolution.engine == null) {
                store.markFailed(jobId, resolution.unavailableMessage != null
                        ? resolution.unavailableMessage
                        : "No CAD conversion engine is available for ." + ft + " files.");
                return;
            }

            // Isolated staging: <tempRoot>/<jobId>/{input,output,metadata}
            Path inputDir = jobDir.resolve("input");
            Path outputDir = jobDir.resolve("output");
            Files.createDirectories(inputDir);
            Files.createDirectories(outputDir);
            Path stagedInput = inputDir.resolve("source." + ft);
            Files.copy(source, stagedInput, StandardCopyOption.REPLACE_EXISTING);

            CadConversionResult result = runEngine(resolution.engine, stagedInput, outputDir, ft);
            if (result == null || !result.isSuccess()) {
                store.markFailed(jobId, result != null ? result.getError() : "The conversion engine returned no result.");
                return;
            }

            Path produced = Paths.get(result.getConvertedFilePath());
            GlbOutputValidator.Result check = validator.validate(produced);
            if (!check.valid()) {
                store.markFailed(jobId, "The conversion produced an invalid 3D file: " + check.reason() + ".");
                return;
            }

            Path published = publish(produced, model);
            store.markCompleted(jobId, published);
            outcome = CadConversionJobStatus.COMPLETED;
        } catch (TimeoutException te) {
            store.markFailed(jobId, "Conversion timed out after " + properties.getTimeoutSeconds() + "s.");
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            store.markFailed(jobId, "Conversion was interrupted.");
        } catch (Exception e) {
            log.error("CAD job {} error", jobId, e);
            store.markFailed(jobId, "CAD conversion failed: " + e.getClass().getSimpleName());
        } finally {
            deleteRecursively(jobDir);
            log.info("CAD job {} {} in {} ms (worker {})",
                    jobId, outcome, System.currentTimeMillis() - startedAt, workerId);
        }
    }

    /**
     * Run the engine with a hard wall-clock limit. The engine's own timeout is
     * expected to fire first with a precise reason; this is the worker-level
     * guarantee that a job can never hang forever.
     */
    private CadConversionResult runEngine(CadConversionEngine engine, Path input, Path outputDir, String ft)
            throws TimeoutException, InterruptedException {
        Future<CadConversionResult> future =
                enginePool.submit(() -> engine.convert(input, "preview", outputDir, ft));
        try {
            return future.get(properties.getTimeoutSeconds(), TimeUnit.SECONDS);
        } catch (TimeoutException te) {
            future.cancel(true);
            throw te;
        } catch (ExecutionException ee) {
            Throwable cause = ee.getCause() != null ? ee.getCause() : ee;
            return CadConversionResult.failed("The conversion engine failed: " + cause.getClass().getSimpleName());
        }
    }

    /**
     * Move the validated GLB into controlled preview storage under a
     * server-generated name (model number + source hash) — never the user's
     * file name, and never inside a public web directory.
     */
    private Path publish(Path produced, Model model) throws Exception {
        Path previewDir = properties.getPreviewDir();
        Files.createDirectories(previewDir);
        String base = sanitize(model.getModelNumber());
        String hash = model.getFileChecksum() != null && model.getFileChecksum().length() >= 8
                ? model.getFileChecksum().substring(0, 8)
                : sanitize(model.getId() != null ? String.valueOf(model.getId()) : "model");
        Path target = previewDir.resolve(base + "_" + hash + ".glb");
        if (Files.exists(target)) {
            Files.delete(target);
        }
        try {
            Files.move(produced, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (java.nio.file.AtomicMoveNotSupportedException e) {
            Files.move(produced, target, StandardCopyOption.REPLACE_EXISTING);
        }
        return target;
    }

    /**
     * Server-generated, traversal-proof file-name token: only
     * {@code [A-Za-z0-9._-]} survives, leading/trailing dots and underscores
     * are stripped (so ".." and ".hidden" cannot become a directory or a dot
     * file), and the result is length-bounded.
     */
    static String sanitize(String token) {
        if (token == null) {
            return "model";
        }
        String cleaned = token.trim()
                .replaceAll("[^A-Za-z0-9._-]+", "_")
                .replaceAll("^[._]+", "")
                .replaceAll("[._]+$", "")
                .replaceAll("_{2,}", "_");
        if (cleaned.isBlank()) {
            return "model";
        }
        return cleaned.length() > 80 ? cleaned.substring(0, 80) : cleaned;
    }

    /** Best-effort recursive delete of a job staging directory. */
    static void deleteRecursively(Path root) {
        if (root == null || !Files.exists(root)) {
            return;
        }
        try (java.util.stream.Stream<Path> walk = Files.walk(root)) {
            walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (Exception ignored) {
                    // The retention sweep retries orphaned directories later.
                }
            });
        } catch (Exception e) {
            log.debug("Staging cleanup incomplete for {}: {}", root, e.getMessage());
        }
    }

    /** Remove staging directories abandoned by a crashed worker. */
    public int cleanOrphanedStaging() {
        Path root = properties.getTempRoot();
        if (!Files.isDirectory(root)) {
            return 0;
        }
        long cutoff = System.currentTimeMillis()
                - Duration.ofHours(properties.getTempRetentionHours()).toMillis();
        int removed = 0;
        try (java.util.stream.Stream<Path> dirs = Files.list(root)) {
            for (Path dir : (Iterable<Path>) dirs::iterator) {
                if (!Files.isDirectory(dir)) {
                    continue;
                }
                if (dir.getFileName().toString().equals(workerId)) {
                    continue;
                }
                if (inFlightDirectory(dir)) {
                    continue;
                }
                if (Files.getLastModifiedTime(dir).toMillis() < cutoff) {
                    deleteRecursively(dir);
                    removed++;
                }
            }
        } catch (Exception e) {
            log.debug("Staging housekeeping skipped: {}", e.getMessage());
        }
        return removed;
    }

    private boolean inFlightDirectory(Path dir) {
        // Live jobs have a fresh directory; anything under <tempRoot>/<job id>
        // whose job is currently PROCESSING is owned and must not be touched.
        String name = dir.getFileName().toString();
        return inFlight.get() > 0 && name.length() == 36 && name.chars().filter(c -> c == '-').count() == 4;
    }

    /** Remove preview GLBs that no model references any more. */
    public int cleanUnreferencedPreviews() {
        Path previewDir = properties.getPreviewDir();
        if (!Files.isDirectory(previewDir)) {
            return 0;
        }
        long cutoff = System.currentTimeMillis()
                - Duration.ofHours(properties.getPreviewRetentionHours()).toMillis();
        int removed = 0;
        try (java.util.stream.Stream<Path> files = Files.list(previewDir)) {
            for (Path file : (Iterable<Path>) files::iterator) {
                String name = file.getFileName().toString().toLowerCase(Locale.ROOT);
                if (!name.endsWith(".glb") || !Files.isRegularFile(file)) {
                    continue;
                }
                if (Files.getLastModifiedTime(file).toMillis() >= cutoff) {
                    continue;
                }
                if (!store.isPreviewReferenced(file.toAbsolutePath().toString())) {
                    Files.deleteIfExists(file);
                    removed++;
                }
            }
        } catch (Exception e) {
            log.debug("Preview housekeeping skipped: {}", e.getMessage());
        }
        return removed;
    }

    @PreDestroy
    public void shutdown() {
        try {
            store.markStopped(workerId);
        } catch (Exception e) {
            log.debug("Could not persist STOPPED heartbeat: {}", e.getMessage());
        }
        enginePool.shutdownNow();
        jobPool.shutdownNow();
        try {
            jobPool.awaitTermination(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
