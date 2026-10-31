package com.vishatech.erp.entity.production;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "quality_inspections")
public class QualityInspection {

    @Id
    @Column(length = 20)
    private String id; // QI-001 format

    @Column(name = "inspection_id", length = 20, nullable = true)
    private String inspectionId; // legacy field — may exist in DB from prior schema

    @Column(name = "production_order_id", length = 50)
    private String productionOrderId; // CPO number

    @Column(name = "work_order", length = 50)
    private String workOrder;

    @Column(name = "work_order_item_id")
    private Long workOrderItemId;

    @Column(length = 200)
    private String product;

    @Column(length = 200)
    private String customer;

    @Column(length = 100)
    private String department;

    @Column(name = "inspection_type", length = 50)
    private String inspectionType = "Final";

    @Column(name = "inspection_date")
    private LocalDate inspectionDate;

    @Column(length = 100)
    private String inspector;

    @Column(name = "quantity_inspected")
    private Integer quantityInspected = 0;

    @Column(name = "accepted_quantity")
    private Integer acceptedQuantity = 0;

    @Column(name = "rejected_quantity")
    private Integer rejectedQuantity = 0;

    @Column(length = 30)
    private String status = "Pending";

    @Column(columnDefinition = "TEXT")
    private String remarks;

    @Lob
    @Column(columnDefinition = "JSON")
    private String checklist; // JSON array of checklist items

    @Lob
    @Column(columnDefinition = "JSON")
    private String inspectionReport; // JSON

    @Lob
    @Column(columnDefinition = "JSON")
    private String dimensionalInspection; // JSON

    @Lob
    @Column(columnDefinition = "JSON")
    private String materialTestCertificate; // JSON

    @Lob
    @Column(columnDefinition = "JSON")
    private String finalQcInfo; // JSON

    @Lob
    @Column(columnDefinition = "JSON")
    private String history; // JSON array of history entries

    @Column(name = "created_by", length = 100)
    private String createdBy;

    @Column(name = "updated_by", length = 100)
    private String updatedBy;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "qc_updated_at")
    private LocalDateTime qcUpdatedAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getInspectionId() { return inspectionId; }
    public void setInspectionId(String inspectionId) { this.inspectionId = inspectionId; }

    public String getProductionOrderId() { return productionOrderId; }
    @JsonProperty("productionOrderId")
    @JsonAlias("productionOrder")
    public void setProductionOrderId(String productionOrderId) { this.productionOrderId = productionOrderId; }

    public String getWorkOrder() { return workOrder; }
    public void setWorkOrder(String workOrder) { this.workOrder = workOrder; }

    public Long getWorkOrderItemId() { return workOrderItemId; }
    public void setWorkOrderItemId(Long workOrderItemId) { this.workOrderItemId = workOrderItemId; }

    public String getProduct() { return product; }
    public void setProduct(String product) { this.product = product; }

    public String getCustomer() { return customer; }
    public void setCustomer(String customer) { this.customer = customer; }

    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }

    public String getInspectionType() { return inspectionType; }
    public void setInspectionType(String inspectionType) { this.inspectionType = inspectionType; }

    public LocalDate getInspectionDate() { return inspectionDate; }
    public void setInspectionDate(LocalDate inspectionDate) { this.inspectionDate = inspectionDate; }

    public String getInspector() { return inspector; }
    public void setInspector(String inspector) { this.inspector = inspector; }

    public Integer getQuantityInspected() { return quantityInspected; }
    public void setQuantityInspected(Integer quantityInspected) { this.quantityInspected = quantityInspected; }

    public Integer getAcceptedQuantity() { return acceptedQuantity; }
    public void setAcceptedQuantity(Integer acceptedQuantity) { this.acceptedQuantity = acceptedQuantity; }

    public Integer getRejectedQuantity() { return rejectedQuantity; }
    public void setRejectedQuantity(Integer rejectedQuantity) { this.rejectedQuantity = rejectedQuantity; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }

    public String getChecklist() { return checklist; }
    public void setChecklist(String checklist) { this.checklist = checklist; }

    public String getInspectionReport() { return inspectionReport; }
    public void setInspectionReport(String inspectionReport) { this.inspectionReport = inspectionReport; }

    public String getDimensionalInspection() { return dimensionalInspection; }
    public void setDimensionalInspection(String dimensionalInspection) { this.dimensionalInspection = dimensionalInspection; }

    public String getMaterialTestCertificate() { return materialTestCertificate; }
    public void setMaterialTestCertificate(String materialTestCertificate) { this.materialTestCertificate = materialTestCertificate; }

    public String getFinalQcInfo() { return finalQcInfo; }
    public void setFinalQcInfo(String finalQcInfo) { this.finalQcInfo = finalQcInfo; }

    public String getHistory() { return history; }
    public void setHistory(String history) { this.history = history; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public LocalDateTime getQcUpdatedAt() { return qcUpdatedAt; }
    public void setQcUpdatedAt(LocalDateTime qcUpdatedAt) { this.qcUpdatedAt = qcUpdatedAt; }
}
