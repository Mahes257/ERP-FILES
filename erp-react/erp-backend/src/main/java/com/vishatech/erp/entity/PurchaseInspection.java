package com.vishatech.erp.entity;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
@Entity @Table(name="purchase_inspections", indexes = {
        @Index(name = "idx_inspection_status", columnList = "status"),
        @Index(name = "idx_inspection_grn_no", columnList = "grnNo")
})
public class PurchaseInspection {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
 @Column(nullable=false,unique=true,length=60) private String inspectionNo;
 @Column(nullable=false,length=60) private String grnNo;
 private LocalDate inspectionDate;
 @Column(length=120) private String inspector;
 @Column(length=40) private String status="Pending";
 @Column(length=500) private String rejectionReason;
 @Column(length=1000) private String remarks;
 @Lob @Column(columnDefinition="TEXT") private String itemsJson;
 private LocalDateTime createdAt;
 @PrePersist void create(){createdAt=LocalDateTime.now();}
 public Long getId(){return id;} public String getInspectionNo(){return inspectionNo;} public void setInspectionNo(String v){inspectionNo=v;}
 public String getGrnNo(){return grnNo;} public void setGrnNo(String v){grnNo=v;} public LocalDate getInspectionDate(){return inspectionDate;} public void setInspectionDate(LocalDate v){inspectionDate=v;}
 public String getInspector(){return inspector;} public void setInspector(String v){inspector=v;} public String getStatus(){return status;} public void setStatus(String v){status=v;}
 public String getRejectionReason(){return rejectionReason;} public void setRejectionReason(String v){rejectionReason=v;} public String getRemarks(){return remarks;} public void setRemarks(String v){remarks=v;}
 public String getItemsJson(){return itemsJson;} public void setItemsJson(String v){itemsJson=v;} public LocalDateTime getCreatedAt(){return createdAt;}
}
