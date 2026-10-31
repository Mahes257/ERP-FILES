package com.vishatech.erp.repository;

import com.vishatech.erp.entity.CadConversionJob;
import com.vishatech.erp.entity.CadConversionJobStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * Queue queries for {@link CadConversionJob}.
 *
 * <p>Every state transition that matters for correctness is an <b>atomic
 * conditional UPDATE</b>, so two workers racing on the same row can never both
 * win. This mirrors the proven pattern used by
 * {@code ProcessingJobRepository#claim}.
 */
public interface CadConversionJobRepository extends JpaRepository<CadConversionJob, String> {

    /** Latest non-terminal job for a model (browser refresh / duplicate submit). */
    Optional<CadConversionJob> findFirstByModelIdAndStatusInOrderByCreatedAtDesc(
            Long modelId, Collection<String> statuses);

    /** Latest job in a given state — used to answer "what happened to this model?". */
    Optional<CadConversionJob> findFirstByModelIdAndStatusOrderByCompletedAtDesc(
            Long modelId, String status);

    /** Most recent job of any state for a model (viewer resume after refresh). */
    Optional<CadConversionJob> findFirstByModelIdOrderByCreatedAtDesc(Long modelId);

    /** Oldest QUEUED rows, the worker's claim candidates. */
    List<CadConversionJob> findByStatusOrderByCreatedAtAsc(String status, Pageable pageable);

    /**
     * Jobs this worker id had claimed. Used once at startup: a freshly started
     * process provably has none of them running, so they are recovered
     * immediately instead of waiting out the stale timeout.
     */
    List<CadConversionJob> findByStatusAndWorkerId(String status, String workerId);

    long countByStatusIn(Collection<String> statuses);

    long countByStatus(String status);

    /** Jobs queued for one model (admission/idempotency assertions). */
    long countByModelId(Long modelId);

    /**
     * Cache probe: a COMPLETED job for this exact model + source content.
     * The caller still verifies that the output file exists on disk.
     */
    Optional<CadConversionJob> findFirstByModelIdAndStatusAndSourceHashOrderByCompletedAtDesc(
            Long modelId, String status, String sourceHash);

    /**
     * QUEUED -> PROCESSING claim. Exactly one caller can observe {@code 1} for a
     * given row; everyone else sees {@code 0} and moves on.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE CadConversionJob j SET j.status = :to, j.workerId = :workerId, "
            + "j.startedAt = :startedAt, j.attempts = j.attempts + 1 "
            + "WHERE j.id = :id AND j.status = :from")
    int claim(@Param("id") String id,
              @Param("from") String from,
              @Param("to") String to,
              @Param("workerId") String workerId,
              @Param("startedAt") LocalDateTime startedAt);

    /** QUEUED -> CANCELLED: only a job nobody has started can be cancelled. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE CadConversionJob j SET j.status = :to, j.completedAt = :now, "
            + "j.errorMessage = :reason WHERE j.id = :id AND j.status = :from")
    int markCancelled(@Param("id") String id,
                      @Param("from") String from,
                      @Param("to") String to,
                      @Param("now") LocalDateTime now,
                      @Param("reason") String reason);

    /**
     * Interrupted-job recovery: PROCESSING rows whose worker died are handed
     * back to the queue while they still have retry budget.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE CadConversionJob j SET j.status = :queued, j.workerId = null, j.startedAt = null "
            + "WHERE j.status = :processing AND j.startedAt < :staleBefore AND j.attempts < j.maxAttempts")
    int requeueStale(@Param("queued") String queued,
                     @Param("processing") String processing,
                     @Param("staleBefore") LocalDateTime staleBefore);

    /** PROCESSING rows past the stale timeout with no retry budget left. */
    @Query("SELECT j FROM CadConversionJob j WHERE j.status = :processing "
            + "AND j.startedAt < :staleBefore AND j.attempts >= j.maxAttempts")
    List<CadConversionJob> findExhaustedStale(@Param("processing") String processing,
                                              @Param("staleBefore") LocalDateTime staleBefore);

    /** Retention: finished jobs older than the cutoff. */
    long deleteByStatusInAndCompletedAtBefore(Collection<String> statuses, LocalDateTime completedBefore);

    /** Convenience: the two states a worker can still act on. */
    default List<CadConversionJob> findClaimCandidates(Pageable pageable) {
        return findByStatusOrderByCreatedAtAsc(CadConversionJobStatus.QUEUED, pageable);
    }
}
