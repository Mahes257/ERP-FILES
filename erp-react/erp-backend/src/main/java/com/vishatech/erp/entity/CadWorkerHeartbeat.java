package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * Liveness record written by the isolated CAD worker process.
 *
 * <p>The worker has no HTTP port (it must never be publicly reachable), so its
 * health is read from this row: the worker upserts its own id every poll cycle,
 * and the ERP reports {@code workerAvailable} when the row is younger than
 * {@code app.cad.worker.heartbeat-stale-seconds}. One row per worker id, so a
 * restart overwrites the same row instead of accumulating rows.
 */
@Entity
@Table(name = "cad_worker_heartbeat")
public class CadWorkerHeartbeat {

    /** Worker id (hostname by default) — also the primary key. */
    @Id
    @Column(name = "id", length = 64, nullable = false)
    private String id;

    /** RUNNING | STOPPED — set by the worker when it shuts down cleanly. */
    @Column(name = "status", length = 20)
    private String status;

    @Column(name = "active_jobs")
    private int activeJobs;

    @Column(name = "max_jobs")
    private int maxJobs;

    @Column(name = "engine", length = 40)
    private String engine;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public int getActiveJobs() { return activeJobs; }
    public void setActiveJobs(int activeJobs) { this.activeJobs = activeJobs; }

    public int getMaxJobs() { return maxJobs; }
    public void setMaxJobs(int maxJobs) { this.maxJobs = maxJobs; }

    public String getEngine() { return engine; }
    public void setEngine(String engine) { this.engine = engine; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
