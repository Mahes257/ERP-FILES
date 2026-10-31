package com.vishatech.erp.dto.production;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.*;

/**
 * ERP-wide dashboard summary across all modules.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ERPDashboardDTO {
    private ModuleCountDTO productionOrders;
    private ModuleCountDTO technicalVerifications;
    private ModuleCountDTO drawings;
    private ModuleCountDTO models;
    private ProductionCountDTO production;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ModuleCountDTO {
        private long total;
        private long draft;
        private long pending;
        private long inProgress;
        private long approved;
        private long verified;
        private long completed;
        private long rejected;
        private long dispatched;
        private long cancelled;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ProductionCountDTO {
        private long castingJobs;
        private long fabricationJobs;
        private long assemblyJobs;
    }
}
