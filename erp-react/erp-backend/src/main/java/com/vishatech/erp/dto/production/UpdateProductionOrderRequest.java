package com.vishatech.erp.dto.production;

import jakarta.validation.Valid;
import lombok.*;

import java.time.LocalDate;
import java.util.List;

/**
 * Request body for updating an existing Production Order.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UpdateProductionOrderRequest {

    private String salesOrderId;
    private String salesOrderNumber;
    private String customer;
    private String customerCode;
    private LocalDate startDate;
    private LocalDate dueDate;
    private String priority;
    private String remarks;

    @Valid
    private List<CreateProductionOrderRequest.CreateOrderItemRequest> items;
}
