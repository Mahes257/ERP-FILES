package com.vishatech.erp.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.vishatech.erp.entity.ProcessingJob;
import java.time.LocalDateTime;

/**
 * Status of a background processing job, as polled by the client.
 *
 * <p>Flat and deliberately small: the client only needs to know whether to keep
 * polling and, once the job is COMPLETED, the payload the synchronous endpoint
 * used to return in its body. {@code results} is null until then.
 */
public record ProcessingJobResponse(
        Long jobId,
        String jobType,
        String status,
        int itemCount,
        int attempts,
        LocalDateTime createdAt,
        LocalDateTime startedAt,
        LocalDateTime completedAt,
        String error,
        JsonNode results
) {

    /** Job state without a result payload (QUEUED / PROCESSING / FAILED). */
    public static ProcessingJobResponse of(ProcessingJob job, JsonNode results) {
        return new ProcessingJobResponse(
                job.getId(),
                job.getJobType(),
                job.getStatus(),
                job.getItemCount(),
                job.getAttempts(),
                job.getCreatedAt(),
                job.getStartedAt(),
                job.getCompletedAt(),
                job.getErrorMessage(),
                results);
    }
}
