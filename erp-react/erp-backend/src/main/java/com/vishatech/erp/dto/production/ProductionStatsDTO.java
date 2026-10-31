package com.vishatech.erp.dto.production;

import lombok.*;

/**
 * Statistics DTO for production order KPI cards.
 * All values come from database queries.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProductionStatsDTO {
    private long total;
    private long draft;
    private long pendingProductionApproval;
    private long productionApproved;
    private long pendingAdminApproval;
    private long adminApproved;
    private long approved;
    private long pending;
    private long inProgress;
    private long hold;
    private long pendingQC;
    private long completed;
    private long packed;
    private long readyForDispatch;
    private long cancelled;
    private long overdue;
    private long dueToday;
    private long urgent;
    private long highPriority;
}
