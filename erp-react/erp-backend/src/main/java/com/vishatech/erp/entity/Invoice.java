package com.vishatech.erp.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "invoices")
public class Invoice {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Optimistic lock on the invoice header (see Quotation#version). */
    @Version
    @Column(nullable = false)
    private Long version;

    @Column(nullable = false, length = 40, unique = true)
    private String invoiceNo;

    private String companyName;

    private String companyGstin;

    private String companyPan;

    private String companyState;

    private String companyEmail;

    private String companyPhone;

    private String lutArn;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String companyAddress;

    private LocalDateTime invoiceDate;

    private LocalDateTime dueDate;

    private String referenceNo;

    private String invoiceType;

    private String contractNo;

    private LocalDateTime contractDate;

    private String appendixNo;

    private LocalDateTime appendixDate;

    private String exporterRef;

    private String poNo;

    private LocalDateTime poDate;

    private String source;

    private String sourceRef;

    @Column(nullable = false, length = 40)
    private String status = "draft";

    @Column(nullable = false, length = 40)
    private String paymentStatus = "unpaid";

    private String bankName;

    private String bankAccount;

    private String bankIfsc;

    private String bankBranch;

    private String bankType;

    private String bankUpi;

    private String bankSwift;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String bankAddress;

    private Long clientId;

    private String clientName;

    private String contactPerson;

    private String gstin;

    private String pan;

    private String email;

    private String phone;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String billingAddress;

    private boolean shipSameAsBill;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String shippingAddress;

    private String buyerCountry;

    private String consigneeName;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String consigneeAddress;

    private String consigneeCountry;

    private boolean consigneeSameAsBuyer;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String terms;
    private String taxType;

    private String hsnView;

    private String countryOfOrigin;

    private String countryOfFinalDestination;

    private String preCarriageBy;

    private String placeOfReceipt;

    private String vesselFlightNo;

    private String portOfLoading;

    private String portOfDischarge;

    private String portOfDelivery;

    private String hsCode;

    private String commodity;

    private String termsOfDelivery;

    private String paymentTerms;

    private String currency;

    private String taxTreatment;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String packingDetails;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String notes;

    private String authorizedSignatory;

    private String designation;

    private String place;

    private LocalDateTime authorizationDate;

    @Column(precision = 18, scale = 2)
    private BigDecimal subTotal = BigDecimal.ZERO;

    @Column(precision = 18, scale = 2)
    private BigDecimal discount = BigDecimal.ZERO;

    @Column(precision = 8, scale = 2)
    private BigDecimal discountPct = BigDecimal.ZERO;

    @Column(precision = 18, scale = 2)
    private BigDecimal cgstTotal = BigDecimal.ZERO;

    @Column(precision = 18, scale = 2)
    private BigDecimal sgstTotal = BigDecimal.ZERO;

    @Column(precision = 18, scale = 2)
    private BigDecimal taxTotal = BigDecimal.ZERO;

    @Column(precision = 18, scale = 2)
    private BigDecimal charges = BigDecimal.ZERO;

    @Column(precision = 8, scale = 2)
    private BigDecimal roundOff = BigDecimal.ZERO;

    @Column(precision = 18, scale = 2)
    private BigDecimal grandTotal = BigDecimal.ZERO;

    private String convertedToReceipt;

    private String convertedToCreditNote;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    private LocalDateTime archivedAt;

    // ---- Revision chain (every edit creates a new revision row; the
    // previous version is NEVER deleted or overwritten) ----

    /** Id of the chain root (the original document). Null for the original. */
    private Long revisionOf;

    /** 0 = original, 1, 2, 3 ... per edit. */
    @Column(nullable = false)
    private int revision;

    /** When this revision was created. */
    private LocalDateTime revisionDate;

    /** Only the newest revision is editable/current. */
    @Column(nullable = false)
    private boolean latestRevision = true;

    @OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<InvoiceItem> items = new ArrayList<>();

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public void addItem(InvoiceItem item) {
        item.setInvoice(this);
        items.add(item);
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getInvoiceNo() {
        return invoiceNo;
    }

    public void setInvoiceNo(String invoiceNo) {
        this.invoiceNo = invoiceNo;
    }

    public String getCompanyName() {
        return companyName;
    }

    public void setCompanyName(String companyName) {
        this.companyName = companyName;
    }

    public String getCompanyGstin() {
        return companyGstin;
    }

    public void setCompanyGstin(String companyGstin) {
        this.companyGstin = companyGstin;
    }

    public String getCompanyPan() {
        return companyPan;
    }

    public void setCompanyPan(String companyPan) {
        this.companyPan = companyPan;
    }

    public String getCompanyEmail() {
        return companyEmail;
    }

    public void setCompanyEmail(String companyEmail) {
        this.companyEmail = companyEmail;
    }

    public String getCompanyPhone() {
        return companyPhone;
    }

    public void setCompanyPhone(String companyPhone) {
        this.companyPhone = companyPhone;
    }

    public String getLutArn() {
        return lutArn;
    }

    public void setLutArn(String lutArn) {
        this.lutArn = lutArn;
    }

    public String getCompanyState() {
        return companyState;
    }

    public void setCompanyState(String companyState) {
        this.companyState = companyState;
    }

    public String getCompanyAddress() {
        return companyAddress;
    }

    public void setCompanyAddress(String companyAddress) {
        this.companyAddress = companyAddress;
    }

    public LocalDateTime getInvoiceDate() {
        return invoiceDate;
    }

    public void setInvoiceDate(LocalDateTime invoiceDate) {
        this.invoiceDate = invoiceDate;
    }

    public LocalDateTime getDueDate() {
        return dueDate;
    }

    public void setDueDate(LocalDateTime dueDate) {
        this.dueDate = dueDate;
    }

    public String getReferenceNo() {
        return referenceNo;
    }

    public void setReferenceNo(String referenceNo) {
        this.referenceNo = referenceNo;
    }

    public String getInvoiceType() {
        return invoiceType;
    }

    public void setInvoiceType(String invoiceType) {
        this.invoiceType = invoiceType;
    }

    public String getContractNo() {
        return contractNo;
    }

    public void setContractNo(String contractNo) {
        this.contractNo = contractNo;
    }

    public LocalDateTime getContractDate() {
        return contractDate;
    }

    public void setContractDate(LocalDateTime contractDate) {
        this.contractDate = contractDate;
    }

    public String getAppendixNo() {
        return appendixNo;
    }

    public void setAppendixNo(String appendixNo) {
        this.appendixNo = appendixNo;
    }

    public LocalDateTime getAppendixDate() {
        return appendixDate;
    }

    public void setAppendixDate(LocalDateTime appendixDate) {
        this.appendixDate = appendixDate;
    }

    public String getExporterRef() {
        return exporterRef;
    }

    public void setExporterRef(String exporterRef) {
        this.exporterRef = exporterRef;
    }

    public String getPoNo() {
        return poNo;
    }

    public void setPoNo(String poNo) {
        this.poNo = poNo;
    }

    public LocalDateTime getPoDate() {
        return poDate;
    }

    public void setPoDate(LocalDateTime poDate) {
        this.poDate = poDate;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public String getSourceRef() {
        return sourceRef;
    }

    public void setSourceRef(String sourceRef) {
        this.sourceRef = sourceRef;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getPaymentStatus() {
        return paymentStatus;
    }

    public void setPaymentStatus(String paymentStatus) {
        this.paymentStatus = paymentStatus;
    }

    public String getBankName() {
        return bankName;
    }

    public void setBankName(String bankName) {
        this.bankName = bankName;
    }

    public String getBankAccount() {
        return bankAccount;
    }

    public void setBankAccount(String bankAccount) {
        this.bankAccount = bankAccount;
    }

    public String getBankIfsc() {
        return bankIfsc;
    }

    public void setBankIfsc(String bankIfsc) {
        this.bankIfsc = bankIfsc;
    }

    public String getBankBranch() {
        return bankBranch;
    }

    public void setBankBranch(String bankBranch) {
        this.bankBranch = bankBranch;
    }

    public String getBankType() {
        return bankType;
    }

    public void setBankType(String bankType) {
        this.bankType = bankType;
    }

    public String getBankUpi() {
        return bankUpi;
    }

    public void setBankUpi(String bankUpi) {
        this.bankUpi = bankUpi;
    }

    public String getBankSwift() {
        return bankSwift;
    }

    public void setBankSwift(String bankSwift) {
        this.bankSwift = bankSwift;
    }

    public String getBankAddress() {
        return bankAddress;
    }

    public void setBankAddress(String bankAddress) {
        this.bankAddress = bankAddress;
    }

    public Long getClientId() {
        return clientId;
    }

    public void setClientId(Long clientId) {
        this.clientId = clientId;
    }

    public String getClientName() {
        return clientName;
    }

    public void setClientName(String clientName) {
        this.clientName = clientName;
    }

    public String getContactPerson() {
        return contactPerson;
    }

    public void setContactPerson(String contactPerson) {
        this.contactPerson = contactPerson;
    }

    public String getGstin() {
        return gstin;
    }

    public void setGstin(String gstin) {
        this.gstin = gstin;
    }

    public String getPan() {
        return pan;
    }

    public void setPan(String pan) {
        this.pan = pan;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getBillingAddress() {
        return billingAddress;
    }

    public void setBillingAddress(String billingAddress) {
        this.billingAddress = billingAddress;
    }

    public boolean isShipSameAsBill() {
        return shipSameAsBill;
    }

    public void setShipSameAsBill(boolean shipSameAsBill) {
        this.shipSameAsBill = shipSameAsBill;
    }

    public String getShippingAddress() {
        return shippingAddress;
    }

    public void setShippingAddress(String shippingAddress) {
        this.shippingAddress = shippingAddress;
    }

    public String getBuyerCountry() {
        return buyerCountry;
    }

    public void setBuyerCountry(String buyerCountry) {
        this.buyerCountry = buyerCountry;
    }

    public String getConsigneeName() {
        return consigneeName;
    }

    public void setConsigneeName(String consigneeName) {
        this.consigneeName = consigneeName;
    }

    public String getConsigneeAddress() {
        return consigneeAddress;
    }

    public void setConsigneeAddress(String consigneeAddress) {
        this.consigneeAddress = consigneeAddress;
    }

    public String getConsigneeCountry() {
        return consigneeCountry;
    }

    public void setConsigneeCountry(String consigneeCountry) {
        this.consigneeCountry = consigneeCountry;
    }

    public boolean isConsigneeSameAsBuyer() {
        return consigneeSameAsBuyer;
    }

    public void setConsigneeSameAsBuyer(boolean consigneeSameAsBuyer) {
        this.consigneeSameAsBuyer = consigneeSameAsBuyer;
    }

    public String getTerms() {
        return terms;
    }

    public void setTerms(String terms) {
        this.terms = terms;
    }

    public String getTaxType() {
        return taxType;
    }

    public void setTaxType(String taxType) {
        this.taxType = taxType;
    }

    public String getHsnView() {
        return hsnView;
    }

    public void setHsnView(String hsnView) {
        this.hsnView = hsnView;
    }

    public String getCountryOfOrigin() {
        return countryOfOrigin;
    }

    public void setCountryOfOrigin(String countryOfOrigin) {
        this.countryOfOrigin = countryOfOrigin;
    }

    public String getCountryOfFinalDestination() {
        return countryOfFinalDestination;
    }

    public void setCountryOfFinalDestination(String countryOfFinalDestination) {
        this.countryOfFinalDestination = countryOfFinalDestination;
    }

    public String getPreCarriageBy() {
        return preCarriageBy;
    }

    public void setPreCarriageBy(String preCarriageBy) {
        this.preCarriageBy = preCarriageBy;
    }

    public String getPlaceOfReceipt() {
        return placeOfReceipt;
    }

    public void setPlaceOfReceipt(String placeOfReceipt) {
        this.placeOfReceipt = placeOfReceipt;
    }

    public String getVesselFlightNo() {
        return vesselFlightNo;
    }

    public void setVesselFlightNo(String vesselFlightNo) {
        this.vesselFlightNo = vesselFlightNo;
    }

    public String getPortOfLoading() {
        return portOfLoading;
    }

    public void setPortOfLoading(String portOfLoading) {
        this.portOfLoading = portOfLoading;
    }

    public String getPortOfDischarge() {
        return portOfDischarge;
    }

    public void setPortOfDischarge(String portOfDischarge) {
        this.portOfDischarge = portOfDischarge;
    }

    public String getPortOfDelivery() {
        return portOfDelivery;
    }

    public void setPortOfDelivery(String portOfDelivery) {
        this.portOfDelivery = portOfDelivery;
    }

    public String getHsCode() {
        return hsCode;
    }

    public void setHsCode(String hsCode) {
        this.hsCode = hsCode;
    }

    public String getCommodity() {
        return commodity;
    }

    public void setCommodity(String commodity) {
        this.commodity = commodity;
    }

    public String getTermsOfDelivery() {
        return termsOfDelivery;
    }

    public void setTermsOfDelivery(String termsOfDelivery) {
        this.termsOfDelivery = termsOfDelivery;
    }

    public String getPaymentTerms() {
        return paymentTerms;
    }

    public void setPaymentTerms(String paymentTerms) {
        this.paymentTerms = paymentTerms;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public String getTaxTreatment() {
        return taxTreatment;
    }

    public void setTaxTreatment(String taxTreatment) {
        this.taxTreatment = taxTreatment;
    }

    public String getPackingDetails() {
        return packingDetails;
    }

    public void setPackingDetails(String packingDetails) {
        this.packingDetails = packingDetails;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public String getAuthorizedSignatory() {
        return authorizedSignatory;
    }

    public void setAuthorizedSignatory(String authorizedSignatory) {
        this.authorizedSignatory = authorizedSignatory;
    }

    public String getDesignation() {
        return designation;
    }

    public void setDesignation(String designation) {
        this.designation = designation;
    }

    public String getPlace() {
        return place;
    }

    public void setPlace(String place) {
        this.place = place;
    }

    public LocalDateTime getAuthorizationDate() {
        return authorizationDate;
    }

    public void setAuthorizationDate(LocalDateTime authorizationDate) {
        this.authorizationDate = authorizationDate;
    }

    public BigDecimal getSubTotal() {
        return subTotal;
    }

    public void setSubTotal(BigDecimal subTotal) {
        this.subTotal = subTotal;
    }

    public BigDecimal getDiscount() {
        return discount;
    }

    public void setDiscount(BigDecimal discount) {
        this.discount = discount;
    }

    public BigDecimal getDiscountPct() {
        return discountPct;
    }

    public void setDiscountPct(BigDecimal discountPct) {
        this.discountPct = discountPct;
    }

    public BigDecimal getCgstTotal() {
        return cgstTotal;
    }

    public void setCgstTotal(BigDecimal cgstTotal) {
        this.cgstTotal = cgstTotal;
    }

    public BigDecimal getSgstTotal() {
        return sgstTotal;
    }

    public void setSgstTotal(BigDecimal sgstTotal) {
        this.sgstTotal = sgstTotal;
    }

    public BigDecimal getTaxTotal() {
        return taxTotal;
    }

    public void setTaxTotal(BigDecimal taxTotal) {
        this.taxTotal = taxTotal;
    }

    public BigDecimal getCharges() {
        return charges;
    }

    public void setCharges(BigDecimal charges) {
        this.charges = charges;
    }

    public BigDecimal getRoundOff() {
        return roundOff;
    }

    public void setRoundOff(BigDecimal roundOff) {
        this.roundOff = roundOff;
    }

    public BigDecimal getGrandTotal() {
        return grandTotal;
    }

    public void setGrandTotal(BigDecimal grandTotal) {
        this.grandTotal = grandTotal;
    }

    public String getConvertedToReceipt() {
        return convertedToReceipt;
    }

    public void setConvertedToReceipt(String convertedToReceipt) {
        this.convertedToReceipt = convertedToReceipt;
    }

    public String getConvertedToCreditNote() {
        return convertedToCreditNote;
    }

    public void setConvertedToCreditNote(String convertedToCreditNote) {
        this.convertedToCreditNote = convertedToCreditNote;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    public LocalDateTime getArchivedAt() {
        return archivedAt;
    }

    public void setArchivedAt(LocalDateTime archivedAt) {
        this.archivedAt = archivedAt;
    }

    public List<InvoiceItem> getItems() {
        return items;
    }

    public void setItems(List<InvoiceItem> items) {
        this.items = items;
    }

    public Long getRevisionOf() {
        return revisionOf;
    }

    public void setRevisionOf(Long revisionOf) {
        this.revisionOf = revisionOf;
    }

    public int getRevision() {
        return revision;
    }

    public void setRevision(int revision) {
        this.revision = revision;
    }

    public LocalDateTime getRevisionDate() {
        return revisionDate;
    }

    public void setRevisionDate(LocalDateTime revisionDate) {
        this.revisionDate = revisionDate;
    }

    public boolean isLatestRevision() {
        return latestRevision;
    }

    public void setLatestRevision(boolean latestRevision) {
        this.latestRevision = latestRevision;
    }
}
