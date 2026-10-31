package com.vishatech.erp.dto.production;

import lombok.*;

/**
 * Statistics DTO for Model KPI cards.
 * All values come from MySQL queries.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ModelStatsDTO {
    private long total;
    private long pending;
    private long verified;
    private long rejected;
}
