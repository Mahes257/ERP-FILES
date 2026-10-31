package com.vishatech.erp.dto.production;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.*;

import java.util.Map;

/**
 * Cross-module quantity summary for a Work Order.
 * Tracks how quantities flow through the ERP.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class QuantitySummaryDTO {
    private String workOrder;
    private int orderQuantity;
    private int productionInput;
    private int productionOutput;
    private int productionRejected;
    private int productionAccepted;
    private int productionBalance;
    private Map<String, Integer> stageOutput;
}
