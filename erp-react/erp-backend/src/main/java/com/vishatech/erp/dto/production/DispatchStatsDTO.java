package com.vishatech.erp.dto.production;

import lombok.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DispatchStatsDTO {
    private long total;
    private long draft;
    private long ready;
    private long dispatched;
    private long inTransit;
    private long delivered;
}
