package com.vishatech.erp.dto.production;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.*;

import java.util.Map;

/**
 * DTO for audit statistics/KPI.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AuditStatsDTO {
    private long totalAuditLogs;
    private long todayAuditLogs;
    private long thisWeekAuditLogs;
    private long thisMonthAuditLogs;
    private Map<String, Long> byModule;
    private Map<String, Long> byAction;
    private Map<String, Long> byEntityType;
    private long totalUsers;
}
