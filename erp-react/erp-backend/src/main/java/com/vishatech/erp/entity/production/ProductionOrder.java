package com.vishatech.erp.entity.production;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.BatchSize;
import jakarta.persistence.Index;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Production Order / Work Order — the master record.
 * The work_order (WO-XXXX) is the primary identifier.
 */
@Entity
@Table(name = "production_orders", indexes = {
        @Index(name = "idx_prod_orders_status", columnList = "status"),
        @Index(name = "idx_prod_orders_due_date_status", columnList = "due_date, status"),
        @Index(name = "idx_prod_orders_priority", columnList = "priority"),
        @Index(name = "idx_prod_orders_start_date", columnList = "start_date"),
        @Index(name = "idx_prod_orders_sales_order_number", columnList = "sales_order_number")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProductionOrder extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Work Order number — e.g. WO-0001.
     * Backend-generated, unique, displayed as the primary identifier.
     */
    @Column(name = "work_order", nullable = false, unique = true, length = 20)
    private String workOrder;

    // ========================
    // Sales Order Reference
    // ========================
    @Column(name = "sales_order_id", length = 50)
    private String salesOrderId;

    @Column(name = "sales_order_number", length = 50)
    private String salesOrderNumber;

    @Column(name = "customer", length = 255)
    private String customer;

    @Column(name = "customer_code", length = 50)
    private String customerCode;

    // ========================
    // Dates
    // ========================
    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "due_date")
    private LocalDate dueDate;

    // ========================
    // Priority & Status
    // ========================
    @Enumerated(EnumType.STRING)
    @Column(name = "priority", length = 20, nullable = false)
    private Priority priority = Priority.MEDIUM;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 40, nullable = false)
    private OrderStatus status = OrderStatus.DRAFT;

    // ========================
    // Production Type (from first item, legacy)
    // ========================
    @Enumerated(EnumType.STRING)
    @Column(name = "production_type", length = 30)
    private ProductionType productionType;

    // ========================
    // Current Stage (derived, but stored for quick display)
    // ========================
    @Column(name = "current_stage", length = 100)
    private String currentStage;

    // ========================
    // Progress (derived from entries, stored for quick display)
    // ========================
    @Column(name = "progress")
    private Integer progress = 0;

    // ========================
    // Legacy fields from first item (kept for backward compat)
    // ========================
    @Column(name = "product", length = 255)
    private String product;

    @Column(name = "product_code", length = 100)
    private String productCode;

    @Column(name = "quantity")
    private Integer quantity;

    @Column(name = "department", length = 50)
    private String department;

    @Column(name = "pattern_number", length = 100)
    private String patternNumber;

    @Column(name = "drawing_number", length = 100)
    private String drawingNumber;

    @Column(name = "drawing_revision", length = 50)
    private String drawingRevision;

    @Column(name = "batch_number", length = 50)
    private String batchNumber;

    // ========================
    // Approval data
    // ========================
    @Column(name = "production_approved_by", length = 255)
    private String productionApprovedBy;

    @Column(name = "production_approved_at")
    private Instant productionApprovedAt;

    @Column(name = "admin_approved_by", length = 255)
    private String adminApprovedBy;

    @Column(name = "admin_approved_at")
    private Instant adminApprovedAt;

    // ========================
    // Remarks
    // ========================
    @Column(name = "remarks", columnDefinition = "TEXT")
    private String remarks;

    // ========================
    // Audit
    // ========================
    @Column(name = "created_by", length = 255)
    private String createdBy;

    @Column(name = "updated_by", length = 255)
    private String updatedBy;

    // ========================
    // Relationships
    // ========================
    /**
     * Line items.
     *
     * <p>{@code @BatchSize} matters here: the list endpoint maps every row of a
     * page through {@code OrderMapper}, which walks this collection. Without it, a
     * page of 25 orders cost 25 extra selects (a classic N+1) — or, if the list
     * query tried to avoid that with a fetch join, the whole table because
     * Hibernate cannot LIMIT a collection fetch. Batching loads the items of up to
     * 50 orders in ONE {@code IN (...)} query, so a page costs one extra select and
     * the LIMIT stays in the database.
     */
    @OneToMany(mappedBy = "productionOrder", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @BatchSize(size = 50)
    @Builder.Default
    private List<ProductionOrderItem> items = new ArrayList<>();

    @OneToMany(mappedBy = "productionOrder", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("performedAt DESC")
    @Builder.Default
    private List<ApprovalHistory> approvalHistory = new ArrayList<>();

    @OneToMany(mappedBy = "productionOrder", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("eventTime DESC")
    @Builder.Default
    private List<TimelineEvent> timelineEvents = new ArrayList<>();

    @OneToMany(mappedBy = "productionOrder", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @Builder.Default
    private List<ProductionEntry> productionEntries = new ArrayList<>();

    // ========================
    // Helper methods
    // ========================

    public void addItem(ProductionOrderItem item) {
        items.add(item);
        item.setProductionOrder(this);
    }

    public void removeItem(ProductionOrderItem item) {
        items.remove(item);
        item.setProductionOrder(null);
    }

    /**
     * Populate legacy fields from the first item for backward compatibility.
     */
    public void syncLegacyFieldsFromFirstItem() {
        if (items != null && !items.isEmpty()) {
            ProductionOrderItem first = items.get(0);
            this.product = first.getProductName();
            this.productCode = first.getProductCode();
            this.quantity = first.getQuantity();
            this.productionType = first.getProductionType();
            this.department = first.getProductionType() != null ? first.getProductionType().getDisplayName() : null;
            this.patternNumber = first.getPatternNumber();
            this.drawingNumber = first.getDrawingNumber();
            this.drawingRevision = first.getDrawingRevision();
            this.batchNumber = first.getBatchNumber();
            this.currentStage = first.getCurrentStage();
        }
    }
}
