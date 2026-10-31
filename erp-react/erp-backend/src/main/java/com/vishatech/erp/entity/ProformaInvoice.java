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
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "proforma_invoices")
public class ProformaInvoice {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 40, unique = true)
    private String piNo;

    private LocalDateTime piDate;

    private String referenceNo;

    private LocalDateTime validTill;

    private String source;

    private String sourceRef;

    @Column(nullable = false, length = 40)
    private String status = "draft";

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

    private String bankName;

    /** Account holder name (Bank Details card). */
    private String bankAcctName;

    private String bankAccount;

    private String bankIfsc;

    private String bankBranch;

    private String bankType;

    private String bankUpi;

    /** SWIFT / BIC code for international export payments. */
    private String bankSwift;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String bankAddress;

    /** Consignee block — auto-filled from the selected customer / contract. */
    private String consigneeName;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String consigneeAddress;

    private String consigneeCountry;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String terms;
    private String taxType;

    private String hsnView;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String notes;

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

    @Column(precision = 18, scale = 2)
    private BigDecimal grandTotal = BigDecimal.ZERO;

    private String convertedToInvoice;

    private String convertedToSo;

    private String convertedToDc;

    private String convertedToCn;

    private String convertedToPr;

    /** Linked Sales Contract (SC number) selected on the form — drives the customer auto-fill. */
    private String contractNo;

    private LocalDateTime contractDate;

    /** Appendix / PO reference kept with the Proforma Invoice (editable free text). */
    private String appendixPoNo;

    private LocalDateTime appendixDate;

    /** Exporter's Reference (document reference block of the proforma). */
    private String exporterRef;

    /** Exporter / Manufacturer block — pre-filled with the ERP company default, editable. */
    private String exporterName;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String exporterAddress;

    private String exporterEmail;

    private String exporterPhone;

    private String exporterGstin;

    private String exporterPan;

    private String exporterState;

    /** Buyer block — auto-filled from the selected customer / contract. */
    private String buyerName;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String buyerAddress;

    private String buyerCountry;

    /** "Same as Consignee" toggle on the BUYER card: when set, the buyer uses
        the consignee information. */
    private boolean buyerSameAsConsignee;

    // ---- Shipping / Export Details ----

    private String countryOfOrigin;

    private String countryOfFinalDestination;

    private String preCarriageBy;

    private String placeOfReceipt;

    private String vesselFlightNo;

    private String portOfLoading;

    private String portOfDischarge;

    private String placeOfDelivery;

    private String termsOfDelivery;

    private String paymentTerms;

    private String hsCode;

    private String commodity;

    private String currency;

    private String taxTreatment;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String packingDetails;

    private String authorizedSignatory;

    private String designation;

    private String place;

    private LocalDateTime authorizationDate;

    /** Company stamp / seal — stored as an uploaded image data URL. */
    @Lob
    @Column(columnDefinition = "LONGTEXT")
    private String companyStamp;

    // ---- Packing List fields (packing-list documents share the Proforma
    // Invoice record type; these fields are only populated for packing lists) ----

    /** Invoice No. & Date (packing list reference rows). */
    private String invoiceNo;

    private LocalDateTime invoiceDate;

    /** Buyer's Order No. & Date (packing list reference rows). */
    private String buyersOrderNo;

    private LocalDateTime buyersOrderDate;

    /** Package Details card. */
    private String packageMarksNos;

    private String packageNoKindPkgs;

    private String packageDimensions;

    @Column(precision = 18, scale = 3)
    private BigDecimal totalPackages = BigDecimal.ZERO;

    @Column(precision = 18, scale = 3)
    private BigDecimal totalQty = BigDecimal.ZERO;

    @Column(precision = 18, scale = 3)
    private BigDecimal netWeight = BigDecimal.ZERO;

    @Column(precision = 18, scale = 3)
    private BigDecimal grossWeight = BigDecimal.ZERO;

    /** Packing list declaration text. */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String declaration;

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

    @OneToMany(mappedBy = "proformaInvoice", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<ProformaInvoiceItem> items = new ArrayList<>();

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public void addItem(ProformaInvoiceItem item) {
        item.setProformaInvoice(this);
        items.add(item);
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getPiNo() {
        return piNo;
    }

    public void setPiNo(String piNo) {
        this.piNo = piNo;
    }

    public LocalDateTime getPiDate() {
        return piDate;
    }

    public void setPiDate(LocalDateTime piDate) {
        this.piDate = piDate;
    }

    public String getReferenceNo() {
        return referenceNo;
    }

    public void setReferenceNo(String referenceNo) {
        this.referenceNo = referenceNo;
    }

    public LocalDateTime getValidTill() {
        return validTill;
    }

    public void setValidTill(LocalDateTime validTill) {
        this.validTill = validTill;
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

    public String getBankName() {
        return bankName;
    }

    public void setBankName(String bankName) {
        this.bankName = bankName;
    }

    public String getBankAcctName() {
        return bankAcctName;
    }

    public void setBankAcctName(String bankAcctName) {
        this.bankAcctName = bankAcctName;
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

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
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

    public BigDecimal getGrandTotal() {
        return grandTotal;
    }

    public void setGrandTotal(BigDecimal grandTotal) {
        this.grandTotal = grandTotal;
    }

    public String getConvertedToInvoice() {
        return convertedToInvoice;
    }

    public void setConvertedToInvoice(String convertedToInvoice) {
        this.convertedToInvoice = convertedToInvoice;
    }

    public String getConvertedToSo() {
        return convertedToSo;
    }

    public void setConvertedToSo(String convertedToSo) {
        this.convertedToSo = convertedToSo;
    }

    public String getConvertedToDc() {
        return convertedToDc;
    }

    public void setConvertedToDc(String convertedToDc) {
        this.convertedToDc = convertedToDc;
    }

    public String getConvertedToCn() {
        return convertedToCn;
    }

    public void setConvertedToCn(String convertedToCn) {
        this.convertedToCn = convertedToCn;
    }

    public String getConvertedToPr() {
        return convertedToPr;
    }

    public void setConvertedToPr(String convertedToPr) {
        this.convertedToPr = convertedToPr;
    }

    public String getContractNo() {
        return contractNo;
    }

    public void setContractNo(String contractNo) {
        this.contractNo = contractNo;
    }

    public String getAppendixPoNo() {
        return appendixPoNo;
    }

    public void setAppendixPoNo(String appendixPoNo) {
        this.appendixPoNo = appendixPoNo;
    }

    public LocalDateTime getContractDate() {
        return contractDate;
    }

    public void setContractDate(LocalDateTime contractDate) {
        this.contractDate = contractDate;
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

    public String getExporterName() {
        return exporterName;
    }

    public void setExporterName(String exporterName) {
        this.exporterName = exporterName;
    }

    public String getExporterAddress() {
        return exporterAddress;
    }

    public void setExporterAddress(String exporterAddress) {
        this.exporterAddress = exporterAddress;
    }

    public String getExporterEmail() {
        return exporterEmail;
    }

    public void setExporterEmail(String exporterEmail) {
        this.exporterEmail = exporterEmail;
    }

    public String getExporterPhone() {
        return exporterPhone;
    }

    public void setExporterPhone(String exporterPhone) {
        this.exporterPhone = exporterPhone;
    }

    public String getExporterGstin() {
        return exporterGstin;
    }

    public void setExporterGstin(String exporterGstin) {
        this.exporterGstin = exporterGstin;
    }

    public String getExporterPan() {
        return exporterPan;
    }

    public void setExporterPan(String exporterPan) {
        this.exporterPan = exporterPan;
    }

    public String getExporterState() {
        return exporterState;
    }

    public void setExporterState(String exporterState) {
        this.exporterState = exporterState;
    }

    public String getBuyerName() {
        return buyerName;
    }

    public void setBuyerName(String buyerName) {
        this.buyerName = buyerName;
    }

    public String getBuyerAddress() {
        return buyerAddress;
    }

    public void setBuyerAddress(String buyerAddress) {
        this.buyerAddress = buyerAddress;
    }

    public String getBuyerCountry() {
        return buyerCountry;
    }

    public void setBuyerCountry(String buyerCountry) {
        this.buyerCountry = buyerCountry;
    }

    public boolean isBuyerSameAsConsignee() {
        return buyerSameAsConsignee;
    }

    public void setBuyerSameAsConsignee(boolean buyerSameAsConsignee) {
        this.buyerSameAsConsignee = buyerSameAsConsignee;
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

    public String getPlaceOfDelivery() {
        return placeOfDelivery;
    }

    public void setPlaceOfDelivery(String placeOfDelivery) {
        this.placeOfDelivery = placeOfDelivery;
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

    public String getCompanyStamp() {
        return companyStamp;
    }

    public void setCompanyStamp(String companyStamp) {
        this.companyStamp = companyStamp;
    }

    public String getInvoiceNo() {
        return invoiceNo;
    }

    public void setInvoiceNo(String invoiceNo) {
        this.invoiceNo = invoiceNo;
    }

    public LocalDateTime getInvoiceDate() {
        return invoiceDate;
    }

    public void setInvoiceDate(LocalDateTime invoiceDate) {
        this.invoiceDate = invoiceDate;
    }

    public String getBuyersOrderNo() {
        return buyersOrderNo;
    }

    public void setBuyersOrderNo(String buyersOrderNo) {
        this.buyersOrderNo = buyersOrderNo;
    }

    public LocalDateTime getBuyersOrderDate() {
        return buyersOrderDate;
    }

    public void setBuyersOrderDate(LocalDateTime buyersOrderDate) {
        this.buyersOrderDate = buyersOrderDate;
    }

    public String getPackageMarksNos() {
        return packageMarksNos;
    }

    public void setPackageMarksNos(String packageMarksNos) {
        this.packageMarksNos = packageMarksNos;
    }

    public String getPackageNoKindPkgs() {
        return packageNoKindPkgs;
    }

    public void setPackageNoKindPkgs(String packageNoKindPkgs) {
        this.packageNoKindPkgs = packageNoKindPkgs;
    }

    public String getPackageDimensions() {
        return packageDimensions;
    }

    public void setPackageDimensions(String packageDimensions) {
        this.packageDimensions = packageDimensions;
    }

    public BigDecimal getTotalPackages() {
        return totalPackages;
    }

    public void setTotalPackages(BigDecimal totalPackages) {
        this.totalPackages = totalPackages;
    }

    public BigDecimal getTotalQty() {
        return totalQty;
    }

    public void setTotalQty(BigDecimal totalQty) {
        this.totalQty = totalQty;
    }

    public BigDecimal getNetWeight() {
        return netWeight;
    }

    public void setNetWeight(BigDecimal netWeight) {
        this.netWeight = netWeight;
    }

    public BigDecimal getGrossWeight() {
        return grossWeight;
    }

    public void setGrossWeight(BigDecimal grossWeight) {
        this.grossWeight = grossWeight;
    }

    public String getDeclaration() {
        return declaration;
    }

    public void setDeclaration(String declaration) {
        this.declaration = declaration;
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

    public List<ProformaInvoiceItem> getItems() {
        return items;
    }

    public void setItems(List<ProformaInvoiceItem> items) {
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
