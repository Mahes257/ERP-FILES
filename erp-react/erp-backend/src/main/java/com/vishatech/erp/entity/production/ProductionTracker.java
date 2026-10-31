package com.vishatech.erp.entity.production;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "production_trackers")
public class ProductionTracker {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Reference to the Sales Order (CPO) this tracker belongs to, stored in the
     * {@code sales_order_id} column exactly as before.
     *
     * <p>Mapped as the raw id rather than a {@code @ManyToOne SalesOrder}: a tracker
     * only ever needs the id (the CPO number and customer are denormalised into
     * {@link #cpoNo} / {@link #customer}), and holding the Sales entity made
     * Production's own persistence layer depend on a Sales module internal — the
     * coupling the architecture rule
     * {@code production_services_do_not_depend_on_sales_internals} forbids. Production
     * resolves the id through {@code sales.api.SalesOrderLookupPort} when it needs the
     * number, customer or order date. The column, its values, its nullability and its
     * existing constraint are unchanged; no migration is involved.
     *
     * <p>{@code @JsonIgnore} is kept deliberately. The association was never part of
     * the tracker payload — it was neither serialised nor bound from the request (the
     * write path reads nothing from it beyond the id) — so ignoring the id field keeps
     * the request and response format byte-for-byte the same.
     */
    @JsonIgnore
    @Column(name = "sales_order_id")
    private Long salesOrderId;

    /** CPO number for display and search (denormalised from SalesOrder.soNo). */
    @Column(name = "cpo_no", length = 50, nullable = false)
    private String cpoNo;

    /** Customer name (denormalised from SalesOrder.clientName). */
    @Column(name = "customer", length = 200)
    private String customer;

    /** Date the CPO was placed. */
    @Column(name = "order_date")
    private LocalDate orderDate;

    /** Date by which dispatch is expected. */
    @Column(name = "due_date")
    private LocalDate dueDate;

    // ===== Stage progress (0–100 %) =====

    @Column(name = "casting_pct")
    private Integer castingPct = 0;

    @Column(name = "fabrication_pct")
    private Integer fabricationPct = 0;

    @Column(name = "assembly_pct")
    private Integer assemblyPct = 0;

    @Column(name = "qc_pct")
    private Integer qcPct = 0;

    @Column(name = "packing_pct")
    private Integer packingPct = 0;

    @Column(name = "dispatch_pct")
    private Integer dispatchPct = 0;

    // ===== Stage dates =====

    @Column(name = "casting_start")
    private LocalDate castingStart;

    @Column(name = "casting_end")
    private LocalDate castingEnd;

    @Column(name = "fabrication_start")
    private LocalDate fabricationStart;

    @Column(name = "fabrication_end")
    private LocalDate fabricationEnd;

    @Column(name = "assembly_start")
    private LocalDate assemblyStart;

    @Column(name = "assembly_end")
    private LocalDate assemblyEnd;

    @Column(name = "qc_start")
    private LocalDate qcStart;

    @Column(name = "qc_end")
    private LocalDate qcEnd;

    @Column(name = "packing_start")
    private LocalDate packingStart;

    @Column(name = "packing_end")
    private LocalDate packingEnd;

    @Column(name = "dispatch_start")
    private LocalDate dispatchStart;

    @Column(name = "dispatch_end")
    private LocalDate dispatchEnd;

    // ===== Overall status =====

    /** Derived or stored overall status: NOT_STARTED, IN_PROGRESS, COMPLETED, DELAYED */
    @Column(name = "current_status", length = 30)
    private String currentStatus = "NOT_STARTED";

    @Column(name = "remarks", columnDefinition = "TEXT")
    private String remarks;

    @Column(name = "created_by", length = 100)
    private String createdBy;

    @Column(name = "updated_by", length = 100)
    private String updatedBy;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // ===== Getters and Setters =====

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getSalesOrderId() { return salesOrderId; }
    public void setSalesOrderId(Long salesOrderId) { this.salesOrderId = salesOrderId; }

    public String getCpoNo() { return cpoNo; }
    public void setCpoNo(String cpoNo) { this.cpoNo = cpoNo; }

    public String getCustomer() { return customer; }
    public void setCustomer(String customer) { this.customer = customer; }

    public LocalDate getOrderDate() { return orderDate; }
    public void setOrderDate(LocalDate orderDate) { this.orderDate = orderDate; }

    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate dueDate) { this.dueDate = dueDate; }

    public Integer getCastingPct() { return castingPct; }
    public void setCastingPct(Integer castingPct) { this.castingPct = castingPct; }

    public Integer getFabricationPct() { return fabricationPct; }
    public void setFabricationPct(Integer fabricationPct) { this.fabricationPct = fabricationPct; }

    public Integer getAssemblyPct() { return assemblyPct; }
    public void setAssemblyPct(Integer assemblyPct) { this.assemblyPct = assemblyPct; }

    public Integer getQcPct() { return qcPct; }
    public void setQcPct(Integer qcPct) { this.qcPct = qcPct; }

    public Integer getPackingPct() { return packingPct; }
    public void setPackingPct(Integer packingPct) { this.packingPct = packingPct; }

    public Integer getDispatchPct() { return dispatchPct; }
    public void setDispatchPct(Integer dispatchPct) { this.dispatchPct = dispatchPct; }

    public LocalDate getCastingStart() { return castingStart; }
    public void setCastingStart(LocalDate castingStart) { this.castingStart = castingStart; }

    public LocalDate getCastingEnd() { return castingEnd; }
    public void setCastingEnd(LocalDate castingEnd) { this.castingEnd = castingEnd; }

    public LocalDate getFabricationStart() { return fabricationStart; }
    public void setFabricationStart(LocalDate fabricationStart) { this.fabricationStart = fabricationStart; }

    public LocalDate getFabricationEnd() { return fabricationEnd; }
    public void setFabricationEnd(LocalDate fabricationEnd) { this.fabricationEnd = fabricationEnd; }

    public LocalDate getAssemblyStart() { return assemblyStart; }
    public void setAssemblyStart(LocalDate assemblyStart) { this.assemblyStart = assemblyStart; }

    public LocalDate getAssemblyEnd() { return assemblyEnd; }
    public void setAssemblyEnd(LocalDate assemblyEnd) { this.assemblyEnd = assemblyEnd; }

    public LocalDate getQcStart() { return qcStart; }
    public void setQcStart(LocalDate qcStart) { this.qcStart = qcStart; }

    public LocalDate getQcEnd() { return qcEnd; }
    public void setQcEnd(LocalDate qcEnd) { this.qcEnd = qcEnd; }

    public LocalDate getPackingStart() { return packingStart; }
    public void setPackingStart(LocalDate packingStart) { this.packingStart = packingStart; }

    public LocalDate getPackingEnd() { return packingEnd; }
    public void setPackingEnd(LocalDate packingEnd) { this.packingEnd = packingEnd; }

    public LocalDate getDispatchStart() { return dispatchStart; }
    public void setDispatchStart(LocalDate dispatchStart) { this.dispatchStart = dispatchStart; }

    public LocalDate getDispatchEnd() { return dispatchEnd; }
    public void setDispatchEnd(LocalDate dispatchEnd) { this.dispatchEnd = dispatchEnd; }

    public String getCurrentStatus() { return currentStatus; }
    public void setCurrentStatus(String currentStatus) { this.currentStatus = currentStatus; }

    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
