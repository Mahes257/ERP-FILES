package com.vishatech.erp.dto.production;

import lombok.*;

import java.time.LocalDate;

/**
 * DTO for a production stage entry.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProductionEntryDTO {
    private Long id;
    private String workOrderId;
    private String workOrderItemId;
    private String productionType;
    private String stage;
    private Integer inputQuantity;
    private Integer outputQuantity;
    private Integer rejectedQuantity;
    private String operator;
    /** Machine id from the persisted machine master, or null when unassigned. */
    private String machineCode;
    private LocalDate entryDate;
    private String status;
    private String remarks;
    private Integer pendingQuantity;
    private String createdAt;
    private String updatedAt;
}
