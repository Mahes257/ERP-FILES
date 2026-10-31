package com.vishatech.erp.dto.production;

import lombok.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PackingStatsDTO {
    private long total;
    private long pending;
    private long inProgress;
    private long completed;
    private long readyForDispatch;
}
