package com.vishatech.erp.dto.production;

import lombok.*;

/**
 * DTO for sidebar notification badge counts.
 * All counts are derived from MySQL records.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NotificationCountsDTO {
    private long orders;
    private long technicalVerification;
    private long drawings;
    private long models;
    private long casting;
    private long fabrication;
    private long assembly;
    private long quality;
    private long packing;
    private long dispatch;
}
