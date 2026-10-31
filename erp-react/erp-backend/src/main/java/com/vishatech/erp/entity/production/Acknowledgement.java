package com.vishatech.erp.entity.production;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * Acknowledgement record for a Work Order.
 * One record per Work Order tracking acknowledgement status.
 */
@Entity
@Table(name = "acknowledgements")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Acknowledgement extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "work_order_id", nullable = false, length = 20)
    private String workOrderId;

    @Column(name = "work_order_number", length = 20)
    private String workOrderNumber;

    @Column(name = "production_order_number", length = 50)
    private String productionOrderNumber;

    @Column(name = "acknowledged_by", length = 255)
    private String acknowledgedBy;

    @Column(name = "acknowledgement_datetime")
    private Instant acknowledgementDateTime;

    @Column(name = "status", length = 30)
    @Builder.Default
    private String status = "Pending";

    @Column(name = "remarks", columnDefinition = "TEXT")
    private String remarks;
}
