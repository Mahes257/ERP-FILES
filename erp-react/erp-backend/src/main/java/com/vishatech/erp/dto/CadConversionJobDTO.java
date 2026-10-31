package com.vishatech.erp.dto;

import com.vishatech.erp.entity.CadConversionJob;
import com.vishatech.erp.entity.CadConversionJobStatus;

import java.time.LocalDateTime;

/**
 * Client-facing CAD conversion job state.
 *
 * <p>Deliberately carries no server filesystem path: a COMPLETED job exposes
 * only an authenticated {@code previewUrl} that the JWT-protected model
 * controller serves. {@code message} is a single-line, user-safe reason — never
 * a stack trace, command line or server path.
 */
public class CadConversionJobDTO {

    private String jobId;
    private Long modelId;
    private String status;
    private String fileType;
    private String engine;
    private boolean cacheHit;
    private String message;
    private String previewUrl;
    private LocalDateTime createdAt;
    private LocalDateTime startedAt;
    private LocalDateTime completedAt;

    public static CadConversionJobDTO from(CadConversionJob job) {
        CadConversionJobDTO dto = new CadConversionJobDTO();
        dto.jobId = job.getId();
        dto.modelId = job.getModelId();
        dto.status = job.getStatus();
        dto.fileType = job.getFileType();
        dto.engine = job.getEngine();
        dto.cacheHit = job.isCacheHit();
        dto.message = job.getErrorMessage();
        dto.createdAt = job.getCreatedAt();
        dto.startedAt = job.getStartedAt();
        dto.completedAt = job.getCompletedAt();
        if (CadConversionJobStatus.COMPLETED.equals(job.getStatus())) {
            // Authenticated route; never a filesystem path or absolute URL.
            dto.previewUrl = "/models/" + job.getModelId() + "/3d";
        }
        return dto;
    }

    public String getJobId() { return jobId; }
    public void setJobId(String jobId) { this.jobId = jobId; }

    public Long getModelId() { return modelId; }
    public void setModelId(Long modelId) { this.modelId = modelId; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getFileType() { return fileType; }
    public void setFileType(String fileType) { this.fileType = fileType; }

    public String getEngine() { return engine; }
    public void setEngine(String engine) { this.engine = engine; }

    public boolean isCacheHit() { return cacheHit; }
    public void setCacheHit(boolean cacheHit) { this.cacheHit = cacheHit; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }

    public String getPreviewUrl() { return previewUrl; }
    public void setPreviewUrl(String previewUrl) { this.previewUrl = previewUrl; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(LocalDateTime startedAt) { this.startedAt = startedAt; }

    public LocalDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(LocalDateTime completedAt) { this.completedAt = completedAt; }
}
