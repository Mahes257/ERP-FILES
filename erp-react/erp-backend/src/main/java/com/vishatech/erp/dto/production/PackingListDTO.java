package com.vishatech.erp.dto.production;

import lombok.*;

import java.time.Instant;
import java.time.LocalDate;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PackingListDTO {
    private Long id;
    private String packingListNumber;
    private String workOrderId;
    private String salesOrderNumber;
    private String customer;
    private String product;
    private Integer productionQuantity;
    private Integer packedQuantity;
    private LocalDate packingDate;
    private String status;
    private String remarks;
    private String createdBy;
    private String updatedBy;
    private Instant createdAt;
    private Instant updatedAt;
}
