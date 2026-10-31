package com.vishatech.erp.dto.production;

import lombok.*;

/**
 * DTO for Acknowledgement records.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AcknowledgementDTO {
    private Long id;
    private String workOrderId;
    private String workOrderNumber;
    private String productionOrderNumber;
    private String createdDate;
    private String acknowledgedBy;
    private String acknowledgementDateTime;
    private String status;
    private String remarks;
    private String createdAt;
    private String updatedAt;
}
