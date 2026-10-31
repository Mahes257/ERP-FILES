package com.vishatech.erp.entity.production;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * Packing List entity — represents a packing record
 * linked to a Production Order / Work Order.
 */
@Entity
@Table(name = "packing_lists")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PackingList extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "packing_list_number", nullable = false, unique = true, length = 30)
    private String packingListNumber;

    @Column(name = "work_order_id", length = 20)
    private String workOrderId;

    @Column(name = "sales_order_number", length = 30)
    private String salesOrderNumber;

    @Column(name = "customer", length = 255)
    private String customer;

    @Column(name = "product", length = 255)
    private String product;

    @Column(name = "production_quantity")
    private Integer productionQuantity;

    @Column(name = "packed_quantity")
    @Builder.Default
    private Integer packedQuantity = 0;

    @Column(name = "packing_date")
    private LocalDate packingDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 30)
    @Builder.Default
    private PackingStatus status = PackingStatus.PENDING;

    @Column(name = "remarks", columnDefinition = "TEXT")
    private String remarks;

    @Column(name = "created_by", length = 255)
    private String createdBy;

    @Column(name = "updated_by", length = 255)
    private String updatedBy;
}
