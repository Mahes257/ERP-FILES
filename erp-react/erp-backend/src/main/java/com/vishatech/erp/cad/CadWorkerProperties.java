package com.vishatech.erp.cad;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Shared CAD conversion worker configuration.
 *
 * <p>Lives in the {@code cad} package so <b>both</b> processes read exactly the
 * same values: the ERP (queue admission, health reporting, limits shown to the
 * client) and the isolated CAD worker (staging, concurrency, timeouts). Every
 * value is configurable through {@code application.properties} with an
 * {@code ERP_*} environment override — nothing here is a production hardcode.
 *
 * <p>Defaults are deliberately conservative for a single server:
 * one conversion at a time, 200 MB input cap, a 420 s job timeout that always
 * exceeds every engine's own timeout (FreeCAD 240 s, SolidWorks 300 s), and
 * staging under the system temp directory keyed by <b>job id</b> — never by a
 * user-supplied file name.
 */
@Component
public class CadWorkerProperties {

    /** Master switch for the whole server-side CAD conversion pipeline. */
    @Value("${app.cad.worker.enabled:true}")
    private boolean enabled;

    /** Hard concurrency ceiling for conversion work (CPU/RAM bound). */
    @Value("${app.cad.worker.max-concurrent-jobs:1}")
    private int maxConcurrentJobs;

    /** Largest source file the worker will accept, in bytes (default 200 MB). */
    @Value("${app.cad.worker.max-file-bytes:209715200}")
    private long maxFileBytes;

    /**
     * Wall-clock limit for one conversion. MUST stay above the slowest engine
     * timeout so the engine fails first with its own precise reason.
     */
    @Value("${app.cad.worker.timeout-seconds:420}")
    private long timeoutSeconds;

    /** Worker poll cadence (also the heartbeat cadence). */
    @Value("${app.cad.worker.poll-interval-ms:2000}")
    private long pollIntervalMs;

    /** A PROCESSING job older than this with a dead worker is re-queued. */
    @Value("${app.cad.worker.stale-timeout-seconds:600}")
    private long staleTimeoutSeconds;

    /** Heartbeat older than this ⇒ the worker is reported unavailable. */
    @Value("${app.cad.worker.heartbeat-stale-seconds:60}")
    private long heartbeatStaleSeconds;

    /** Refuse new submissions when the queue is already this deep. */
    @Value("${app.cad.worker.max-queued-jobs:50}")
    private int maxQueuedJobs;

    /**
     * Staging root. Jobs are isolated in {@code <root>/<jobId>/input|output|metadata}.
     * Blank means {@code ${java.io.tmpdir}/cad-jobs}.
     */
    @Value("${app.cad.worker.temp-root:}")
    private String tempRoot;

    /**
     * Controlled storage for generated previews. Blank means
     * {@code <app.upload.dir>/cad-previews}. Never served as a static path —
     * only through the authenticated {@code /models/{id}/3d} endpoint.
     */
    @Value("${app.cad.worker.preview-dir:}")
    private String previewDir;

    /** Server-side CAD formats the worker will accept. */
    @Value("${app.cad.worker.allowed-file-types:sldprt,sldasm,sat}")
    private String allowedFileTypes;

    /** Unreferenced preview GLBs older than this are deleted. */
    @Value("${app.cad.worker.preview-retention-hours:168}")
    private long previewRetentionHours;

    /** Finished job rows older than this are deleted. */
    @Value("${app.cad.worker.job-retention-days:30}")
    private int jobRetentionDays;

    /** Staging directories left behind by a crashed worker older than this go. */
    @Value("${app.cad.worker.temp-retention-hours:24}")
    private long tempRetentionHours;

    /** Worker identity. Blank means the hostname (stable across restarts). */
    @Value("${app.cad.worker.id:}")
    private String workerId;

    public boolean isEnabled() { return enabled; }

    public int getMaxConcurrentJobs() { return Math.max(1, maxConcurrentJobs); }

    public long getMaxFileBytes() { return maxFileBytes; }

    public long getTimeoutSeconds() { return timeoutSeconds; }

    public long getPollIntervalMs() { return Math.max(250, pollIntervalMs); }

    public long getStaleTimeoutSeconds() { return staleTimeoutSeconds; }

    public long getHeartbeatStaleSeconds() { return heartbeatStaleSeconds; }

    public int getMaxQueuedJobs() { return maxQueuedJobs; }

    public long getPreviewRetentionHours() { return previewRetentionHours; }

    public int getJobRetentionDays() { return jobRetentionDays; }

    public long getTempRetentionHours() { return tempRetentionHours; }

    /** Staging root for job directories — resolved once, never user-supplied. */
    public Path getTempRoot() {
        if (tempRoot != null && !tempRoot.isBlank()) {
            return Paths.get(tempRoot.trim());
        }
        return Paths.get(System.getProperty("java.io.tmpdir"), "cad-jobs");
    }

    /** Controlled preview storage directory (created on demand by the worker). */
    public Path getPreviewDir() {
        if (previewDir != null && !previewDir.isBlank()) {
            return Paths.get(previewDir.trim());
        }
        String uploadRoot = System.getenv().getOrDefault("ERP_UPLOAD_DIR", "uploads");
        return Paths.get(uploadRoot, "cad-previews");
    }

    /** Allowed server-side CAD types, normalised and lower-case. */
    public Set<String> getAllowedFileTypes() {
        String raw = allowedFileTypes == null ? "sldprt,sldasm,sat" : allowedFileTypes;
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .map(s -> s.toLowerCase(Locale.ROOT).replace(".", ""))
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toSet());
    }

    public List<String> getAllowedFileTypeList() {
        return getAllowedFileTypes().stream().sorted().collect(Collectors.toList());
    }

    /** Stable worker identity (hostname unless explicitly configured). */
    public String getWorkerId() {
        if (workerId != null && !workerId.isBlank()) {
            return workerId.trim();
        }
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (Exception e) {
            return "cad-worker";
        }
    }

    // --- setters (used by tests and property post-processing) ---

    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public void setMaxConcurrentJobs(int maxConcurrentJobs) { this.maxConcurrentJobs = maxConcurrentJobs; }
    public void setMaxFileBytes(long maxFileBytes) { this.maxFileBytes = maxFileBytes; }
    public void setTimeoutSeconds(long timeoutSeconds) { this.timeoutSeconds = timeoutSeconds; }
    public void setPollIntervalMs(long pollIntervalMs) { this.pollIntervalMs = pollIntervalMs; }
    public void setStaleTimeoutSeconds(long staleTimeoutSeconds) { this.staleTimeoutSeconds = staleTimeoutSeconds; }
    public void setHeartbeatStaleSeconds(long heartbeatStaleSeconds) { this.heartbeatStaleSeconds = heartbeatStaleSeconds; }
    public void setMaxQueuedJobs(int maxQueuedJobs) { this.maxQueuedJobs = maxQueuedJobs; }
    public void setTempRoot(String tempRoot) { this.tempRoot = tempRoot; }
    public void setPreviewDir(String previewDir) { this.previewDir = previewDir; }
    public void setAllowedFileTypes(String allowedFileTypes) { this.allowedFileTypes = allowedFileTypes; }
    public void setPreviewRetentionHours(long previewRetentionHours) { this.previewRetentionHours = previewRetentionHours; }
    public void setJobRetentionDays(int jobRetentionDays) { this.jobRetentionDays = jobRetentionDays; }
    public void setTempRetentionHours(long tempRetentionHours) { this.tempRetentionHours = tempRetentionHours; }
    public void setWorkerId(String workerId) { this.workerId = workerId; }
}
