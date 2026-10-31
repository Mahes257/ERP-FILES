package com.vishatech.erp.dto.production;

import lombok.*;

/**
 * DTO for Technical Verification history records.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TVHistoryDTO {
    private Long id;
    private Long technicalVerificationId;
    private String action;
    private String fromStatus;
    private String toStatus;
    private String performedBy;
    private String performedAt;
    private String remarks;
}
