package com.vishatech.erp.dto.production;

import jakarta.validation.constraints.*;
import lombok.*;

import java.time.LocalDate;

/**
 * Request body for creating or updating a production stage entry.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreateProductionEntryRequest {

    @NotBlank(message = "Work Order is required")
    private String workOrderId;

    private String workOrderItemId;

    private String productionType;

    @NotBlank(message = "Stage is required")
    private String stage;

    @Min(value = 0, message = "Input quantity cannot be negative")
    private Integer inputQuantity;

    @Min(value = 0, message = "Output quantity cannot be negative")
    private Integer outputQuantity;

    @Min(value = 0, message = "Rejected quantity cannot be negative")
    private Integer rejectedQuantity;

    private String operator;

    /**
     * Machine assigned to the job: the machine id of the persisted machine
     * master (Settings → Machines). Blank/absent means "no machine", which is
     * valid. A non-blank code that is not in the master, or that belongs to a
     * retired ('Inactive') machine, is rejected with 400 by the service.
     */
    private String machineCode;

    private LocalDate entryDate;

    private String status;
    private String remarks;
}
