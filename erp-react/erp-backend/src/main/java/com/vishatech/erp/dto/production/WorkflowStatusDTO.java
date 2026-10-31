package com.vishatech.erp.dto.production;

import lombok.*;

import java.util.List;
import java.util.Map;

/**
 * Workflow status information for the frontend.
 * Derived from actual backend state (not frontend input).
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WorkflowStatusDTO {
    private String overallStatus;
    private String currentStage;
    private int progress;
    private List<StageProgressDTO> stageProgress;
    private QuantitySummaryDTO quantities;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class StageProgressDTO {
        private String stageName;
        private String status;
        private Integer inputQuantity;
        private Integer outputQuantity;
        private Integer rejectedQuantity;
        private boolean isCurrent;
        private boolean isDone;
        private boolean isSkipped;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class QuantitySummaryDTO {
        private int totalInput;
        private int totalOutput;
        private int totalRejected;
        private int balance;
        private int wip;
    }
}
