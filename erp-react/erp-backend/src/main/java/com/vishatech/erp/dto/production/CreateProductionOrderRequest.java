package com.vishatech.erp.dto.production;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.*;

import java.time.LocalDate;
import java.util.List;

/**
 * Request body for creating a new Production Order.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreateProductionOrderRequest {

    private String salesOrderId;
    private String salesOrderNumber;
    private String customer;
    private String customerCode;

    @NotNull(message = "Start date is required")
    private LocalDate startDate;

    @NotNull(message = "Due date is required")
    private LocalDate dueDate;

    private String priority;
    private String remarks;

    @NotEmpty(message = "At least one production item is required")
    @Valid
    private List<CreateOrderItemRequest> items;

    /**
     * Request for a single item within the order.
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class CreateOrderItemRequest {

        /**
         * Existing item primary key. The edit form sends it so an update keeps
         * each item's identity (and therefore its attachments, verification and
         * drawings) when items are added or removed. Ignored on create.
         */
        private Long id;

        @NotBlank(message = "Order Description is required")
        private String productName;

        private String productCode;

        @NotBlank(message = "Production Type is required")
        private String productionType;

        @NotNull(message = "Quantity is required")
        @Min(value = 1, message = "Quantity must be greater than zero")
        private Integer quantity;

        /** Item-level due date — independent of the Work Order due date. */
        private LocalDate dueDate;

        private String drawingNumber;
        private String drawingRevision;
        private String patternNumber;
    }
}
