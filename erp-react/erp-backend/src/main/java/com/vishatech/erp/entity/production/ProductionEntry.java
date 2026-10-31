package com.vishatech.erp.entity.production;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/**
 * Production stage entry — one record per (workOrder, item, stage).
 * Records quantities, status, and operator for each production step.
 */
@Entity
@Table(name = "production_entries",
       uniqueConstraints = @UniqueConstraint(
           columnNames = {"production_order_id", "work_order_item_id", "stage"}
       ))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProductionEntry extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "production_order_id", nullable = false)
    private ProductionOrder productionOrder;

    @Column(name = "work_order_item_id", length = 100)
    private String workOrderItemId;

    @Column(name = "production_type", length = 30)
    private String productionType;

    @Column(name = "stage", nullable = false, length = 100)
    private String stage;

    @Column(name = "input_quantity")
    @Builder.Default
    private Integer inputQuantity = 0;

    @Column(name = "output_quantity")
    @Builder.Default
    private Integer outputQuantity = 0;

    @Column(name = "rejected_quantity")
    @Builder.Default
    private Integer rejectedQuantity = 0;

    @Column(name = "operator", length = 255)
    private String operator;

    /**
     * Machine assigned to this job, as the machine id of the persisted
     * machine master (Settings → Machines, {@code production_machines.machine_code}).
     *
     * Nullable and unvalidated at the column level on purpose: machines are
     * optional (a manual/mixed job has none) and every pre-existing entry
     * predates machine assignment, so the column is additive — existing rows
     * keep working with no machine. The service validates that a supplied code
     * exists in the master and is not retired ('Inactive').
     */
    @Column(name = "machine_code", length = 50)
    private String machineCode;

    @Column(name = "entry_date")
    private LocalDate entryDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 30)
    @Builder.Default
    private EntryStatus status = EntryStatus.PENDING;

    @Column(name = "remarks", columnDefinition = "TEXT")
    private String remarks;

    // ========================
    // Helper methods
    // ========================

    /**
     * Calculate pending quantity = input - output - rejected
     */
    public int getPendingQuantity() {
        return Math.max(0,
            (inputQuantity != null ? inputQuantity : 0)
            - (outputQuantity != null ? outputQuantity : 0)
            - (rejectedQuantity != null ? rejectedQuantity : 0));
    }
}
