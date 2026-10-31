package com.vishatech.erp.entity.production;

import jakarta.persistence.*;
import java.time.LocalDate;
import lombok.*;

/**
 * A single item within a multi-item Work Order.
 * Each item has its own production type, quantities, and stage workflow.
 */
@Entity
@Table(name = "production_order_items")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProductionOrderItem extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "production_order_id", nullable = false)
    private ProductionOrder productionOrder;

    @Column(name = "product_name", nullable = false, length = 255)
    private String productName;

    @Column(name = "product_code", length = 100)
    private String productCode;

    @Column(name = "quantity", nullable = false)
    private Integer quantity;

    /**
     * This item's own due date. Independent of the Work Order due date: it is
     * edited per item and is never re-derived when the Work Order date changes.
     * Nullable so Work Orders created before the column existed stay valid.
     */
    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "produced_quantity", nullable = false)
    @Builder.Default
    private Integer producedQuantity = 0;

    @Column(name = "rejected_quantity", nullable = false)
    @Builder.Default
    private Integer rejectedQuantity = 0;

    @Enumerated(EnumType.STRING)
    @Column(name = "production_type", length = 30, nullable = false)
    private ProductionType productionType;

    @Column(name = "department", length = 50)
    private String department;

    @Column(name = "current_stage", length = 100)
    private String currentStage;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 30)
    @Builder.Default
    private OrderStatus status = OrderStatus.PENDING;

    @Column(name = "batch_number", length = 50)
    private String batchNumber;

    @Column(name = "pattern_number", length = 100)
    private String patternNumber;

    @Column(name = "drawing_number", length = 100)
    private String drawingNumber;

    @Column(name = "drawing_revision", length = 50)
    private String drawingRevision;

    @Column(name = "unit", length = 20)
    private String unit;

    // ========================
    // Helper methods
    // ========================

    /**
     * Calculate pending quantity = quantity - producedQuantity - rejectedQuantity
     */
    public int getPendingQuantity() {
        return Math.max(0, (quantity != null ? quantity : 0)
                - (producedQuantity != null ? producedQuantity : 0)
                - (rejectedQuantity != null ? rejectedQuantity : 0));
    }
}
