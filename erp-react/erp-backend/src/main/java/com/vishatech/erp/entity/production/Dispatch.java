package com.vishatech.erp.entity.production;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * Dispatch entity — represents a dispatch record
 * linked to a Production Order / Work Order and optionally a Packing List.
 */
@Entity
@Table(name = "dispatches")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Dispatch extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "dispatch_number", nullable = false, unique = true, length = 30)
    private String dispatchNumber;

    @Column(name = "work_order_id", length = 20)
    private String workOrderId;

    @Column(name = "packing_list_id", length = 30)
    private String packingListId;

    @Column(name = "sales_order_number", length = 30)
    private String salesOrderNumber;

    @Column(name = "customer", length = 255)
    private String customer;

    @Column(name = "product", length = 255)
    private String product;

    @Column(name = "quantity")
    private Integer quantity;

    @Column(name = "dispatch_date")
    private LocalDate dispatchDate;

    @Column(name = "expected_delivery_date")
    private LocalDate expectedDeliveryDate;

    @Column(name = "transporter", length = 255)
    private String transporter;

    @Column(name = "vehicle_number", length = 50)
    private String vehicleNumber;

    @Column(name = "lr_tracking_number", length = 100)
    private String lrTrackingNumber;

    @Column(name = "packing_status", length = 50)
    private String packingStatus;

    @Column(name = "package_count")
    private Integer packageCount;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 30)
    @Builder.Default
    private DispatchStatus status = DispatchStatus.DRAFT;

    @Column(name = "remarks", columnDefinition = "TEXT")
    private String remarks;

    @Column(name = "created_by", length = 255)
    private String createdBy;

    @Column(name = "updated_by", length = 255)
    private String updatedBy;
}
