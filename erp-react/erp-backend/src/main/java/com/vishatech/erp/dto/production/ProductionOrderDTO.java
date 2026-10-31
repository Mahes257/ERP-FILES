package com.vishatech.erp.dto.production;

import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Production Order DTO — the main response/request object.
 * Contains both master fields and the items array.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProductionOrderDTO {
    // Frontend id = workOrder string
    private String id;
    private Long backendId;
    private String workOrder;
    private String salesOrderId;
    private String salesOrderNumber;
    private String customer;
    private String customerCode;
    private LocalDate startDate;
    private LocalDate dueDate;
    private String priority;
    private String status;
    private String productionType;
    private String currentStage;
    private Integer progress;
    private String remarks;

    // Legacy fields from first item
    private String product;
    private String productCode;
    private Integer quantity;
    private String department;
    private String patternNumber;
    private String drawingNumber;
    private String drawingRevision;
    private String batchNumber;

    // Approval
    private String productionApprovedBy;
    private String productionApprovedAt;
    private String adminApprovedBy;
    private String adminApprovedAt;

    // Items
    private List<ProductionOrderItemDTO> items;

    // Audit
    private String createdBy;
    private String updatedBy;
    private String createdAt;
    private String updatedAt;
}
