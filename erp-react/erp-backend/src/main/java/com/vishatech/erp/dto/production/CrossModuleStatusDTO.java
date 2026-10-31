package com.vishatech.erp.dto.production;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.*;

/**
 * Cross-module status summary for a Production Order.
 * Shows the status across every integrated module.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CrossModuleStatusDTO {
    private Long orderBackendId;
    private String workOrder;
    private String salesOrderNumber;
    private String customer;
    private String product;
    private Integer quantity;

    // Module statuses
    private String productionOrderStatus;
    private String technicalVerificationStatus;
    private int tvVerifiedCount;
    private int tvTotalCount;
    private String drawingStatus;
    private int drawingCount;
    private String modelStatus;
    private int modelCount;
    private String productionType;
    private String productionStatus;
    private int productionStagesCompleted;
    private int productionStagesTotal;
    private String qualityStatus;
    private String packingStatus;
    private String dispatchStatus;
    private int overallProgress;
}
