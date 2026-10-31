package com.vishatech.erp.repository;

import com.vishatech.erp.entity.ProcessingJob;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Persistence for {@link ProcessingJob}.
 *
 * <p>The claim statement is the concurrency control for the whole pipeline: it
 * flips a row from QUEUED to PROCESSING only if that row is still QUEUED, so of
 * any number of workers racing on the same job exactly one wins and the others
 * get {@code 0} rows updated. Everything else (dispatch, restart recovery,
 * housekeeping) is built on top of it.
 */
public interface ProcessingJobRepository extends JpaRepository<ProcessingJob, Long> {

    /**
     * Atomically claim a queued job. Returns 1 for the single worker that won,
     * 0 for every other caller (already claimed, already finished, or gone).
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update ProcessingJob j set j.status = 'PROCESSING', j.startedAt = :now,"
            + " j.attempts = j.attempts + 1"
            + " where j.id = :id and j.status = 'QUEUED'")
    int claim(@Param("id") Long id, @Param("now") LocalDateTime now);

    /** Release a claimed job back to the queue (e.g. no worker slot, or restart). */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update ProcessingJob j set j.status = 'QUEUED', j.startedAt = null"
            + " where j.id = :id and j.status = 'PROCESSING'")
    int requeue(@Param("id") Long id);

    /** Oldest queued jobs first, so a backlog drains in submission order. */
    @Query("select j.id from ProcessingJob j where j.status = 'QUEUED' order by j.createdAt asc")
    List<Long> findQueuedIds(Pageable pageable);

    /** Jobs stuck in a non-terminal state (used for restart/interruption recovery). */
    List<ProcessingJob> findByStatusAndStartedAtBefore(String status, LocalDateTime cutoff);

    /** Queued jobs that were created before a cutoff (orphaned input detection). */
    List<ProcessingJob> findByStatusIn(Collection<String> statuses);

    /**
     * Most recent job for the same operation + input fingerprint + owner. Used to
     * treat a repeated submission as the same work: an identical batch that is
     * queued, running, or already finished is reused instead of parsed again.
     * Retries are unaffected — FAILED is not in the status set, so re-submitting
     * after a failure starts a fresh job.
     */
    Optional<ProcessingJob> findFirstByJobTypeAndFingerprintAndRequestedByUserIdAndStatusInOrderByCreatedAtDesc(
            String jobType, String fingerprint, Long requestedByUserId, Collection<String> statuses);

    /** Same lookup for submissions with no resolved user (system/test callers). */
    Optional<ProcessingJob> findFirstByJobTypeAndFingerprintAndRequestedByUserIdIsNullAndStatusInOrderByCreatedAtDesc(
            String jobType, String fingerprint, Collection<String> statuses);

    long countByStatus(String status);

    /** Terminal jobs older than the retention cutoff (housekeeping). */
    List<ProcessingJob> findByStatusInAndCompletedAtBefore(Collection<String> statuses, LocalDateTime cutoff);
}
