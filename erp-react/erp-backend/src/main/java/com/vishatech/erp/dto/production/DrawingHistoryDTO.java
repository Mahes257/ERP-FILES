package com.vishatech.erp.dto.production;

import lombok.*;

/**
 * DTO for Drawing history records.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DrawingHistoryDTO {
    private Long id;
    private Long drawingId;
    private String action;
    private String fromStatus;
    private String toStatus;
    private String performedBy;
    private String performedAt;
    private String remarks;
}
