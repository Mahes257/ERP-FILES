package com.vishatech.erp.dto.production;

import lombok.*;

import java.time.LocalDate;

/**
 * DTO for a single item within a multi-item Work Order.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProductionOrderItemDTO {
    private Long id;
    private String itemNameId; // Frontend local item id (e.g. "item-1234")
    private String productName;
    private String productCode;
    private Integer quantity;
    private LocalDate dueDate;
    private Integer producedQty;
    private Integer rejectedQty;
    private String productionType;
    private String department;
    private String currentStage;
    private String status;
    private String batchNumber;
    private String patternNumber;
    private String drawingNumber;
    private String drawingRevision;
    private String unit;
}
