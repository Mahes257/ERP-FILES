package com.vishatech.erp.dto.production;

import lombok.*;

import java.time.Instant;
import java.time.LocalDate;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DispatchDTO {
    private Long id;
    private String dispatchNumber;
    private String workOrderId;
    private String packingListId;
    private String salesOrderNumber;
    private String customer;
    private String product;
    private Integer quantity;
    private LocalDate dispatchDate;
    private LocalDate expectedDeliveryDate;
    private String transporter;
    private String vehicleNumber;
    private String lrTrackingNumber;
    private String packingStatus;
    private Integer packageCount;
    private String status;
    private String remarks;
    private String createdBy;
    private String updatedBy;
    private Instant createdAt;
    private Instant updatedAt;
}
