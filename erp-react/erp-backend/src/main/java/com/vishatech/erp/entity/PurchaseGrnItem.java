package com.vishatech.erp.entity;
import jakarta.persistence.*;
import java.math.BigDecimal;
@Entity @Table(name="purchase_grn_items")
public class PurchaseGrnItem {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
 @ManyToOne(fetch=FetchType.LAZY, optional=false) @JoinColumn(name="grn_id",nullable=false) private PurchaseGrn grn;
 @Column(nullable=false,length=255) private String product;
 @Column(length=60) private String poItemCode;
 @Column(precision=14,scale=3) private BigDecimal orderedQty=BigDecimal.ZERO;
 @Column(precision=14,scale=3) private BigDecimal previouslyReceivedQty=BigDecimal.ZERO;
 @Column(precision=14,scale=3) private BigDecimal receivedQty=BigDecimal.ZERO;
 @Column(precision=14,scale=3) private BigDecimal acceptedQty=BigDecimal.ZERO;
 @Column(precision=14,scale=3) private BigDecimal rejectedQty=BigDecimal.ZERO;
 @Column(precision=14,scale=3) private BigDecimal pendingQty=BigDecimal.ZERO;
 @Column(length=120) private String batchSerial;
 @Column(length=500) private String remarks;
 public Long getId(){return id;} public PurchaseGrn getGrn(){return grn;} public void setGrn(PurchaseGrn v){grn=v;}
 public String getProduct(){return product;} public void setProduct(String v){product=v;} public String getPoItemCode(){return poItemCode;} public void setPoItemCode(String v){poItemCode=v;}
 public BigDecimal getOrderedQty(){return orderedQty;} public void setOrderedQty(BigDecimal v){orderedQty=v;} public BigDecimal getPreviouslyReceivedQty(){return previouslyReceivedQty;} public void setPreviouslyReceivedQty(BigDecimal v){previouslyReceivedQty=v;}
 public BigDecimal getReceivedQty(){return receivedQty;} public void setReceivedQty(BigDecimal v){receivedQty=v;} public BigDecimal getAcceptedQty(){return acceptedQty;} public void setAcceptedQty(BigDecimal v){acceptedQty=v;}
 public BigDecimal getRejectedQty(){return rejectedQty;} public void setRejectedQty(BigDecimal v){rejectedQty=v;} public BigDecimal getPendingQty(){return pendingQty;} public void setPendingQty(BigDecimal v){pendingQty=v;}
 public String getBatchSerial(){return batchSerial;} public void setBatchSerial(String v){batchSerial=v;} public String getRemarks(){return remarks;} public void setRemarks(String v){remarks=v;}
}
