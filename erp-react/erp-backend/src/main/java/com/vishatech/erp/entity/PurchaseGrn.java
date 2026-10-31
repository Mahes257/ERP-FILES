package com.vishatech.erp.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "purchase_grns", indexes = {
        @Index(name = "idx_grn_no", columnList = "grnNo"),
        @Index(name = "idx_grn_po", columnList = "poNo"),
        @Index(name = "idx_grn_status", columnList = "status")
})
public class PurchaseGrn {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable=false, unique=true, length=60) private String grnNo;
    @Column(nullable=false, length=60) private String poNo;
    @Column(nullable=false, length=160) private String supplier;
    private LocalDate receiptDate;
    @Column(length=120) private String warehouse;
    @Column(length=120) private String receivedBy;
    @Column(length=40) private String status = "Expected";
    @Column(length=500) private String notes;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    @OneToMany(mappedBy="grn", cascade=CascadeType.ALL, orphanRemoval=true)
    private List<PurchaseGrnItem> items = new ArrayList<>();
    @PrePersist void create(){ createdAt=LocalDateTime.now(); updatedAt=createdAt; }
    @PreUpdate void update(){ updatedAt=LocalDateTime.now(); }
    public Long getId(){return id;} public String getGrnNo(){return grnNo;} public void setGrnNo(String v){grnNo=v;}
    public String getPoNo(){return poNo;} public void setPoNo(String v){poNo=v;} public String getSupplier(){return supplier;} public void setSupplier(String v){supplier=v;}
    public LocalDate getReceiptDate(){return receiptDate;} public void setReceiptDate(LocalDate v){receiptDate=v;} public String getWarehouse(){return warehouse;} public void setWarehouse(String v){warehouse=v;}
    public String getReceivedBy(){return receivedBy;} public void setReceivedBy(String v){receivedBy=v;} public String getStatus(){return status;} public void setStatus(String v){status=v;}
    public String getNotes(){return notes;} public void setNotes(String v){notes=v;} public LocalDateTime getCreatedAt(){return createdAt;} public List<PurchaseGrnItem> getItems(){return items;}
}
