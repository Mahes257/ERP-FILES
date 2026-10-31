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
@Table(name = "quotations")
public class Quotation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Optimistic lock for the quotation HEADER. Two users saving the same
     * quotation from stale forms no longer overwrite each other silently: the
     * second save fails at commit and the API returns 409 instead. The revision
     * chain remains the mechanism for deliberate "edit creates a revision"
     * saves; this only protects the row being written.
     */
    @Version
    @Column(nullable = false)
    private Long version;

    @Column(nullable = false, length = 40, unique = true)
    private String quotationNo;

    private String reference;

    private LocalDateTime quotationDate;

    private LocalDateTime validUntil;

    private String leadNo;

    private String sourceCw;

    private String sourceCpr;

    /**
     * The customer's Reference PR No. Optional: a quotation can be raised
     * straight from a customer enquiry without any CPR / PR reference.
     */
    private String referencePrNo;

    /**
     * Numeric id of the source CPR row (cpr.id) — Quotation → Open CPR.
     * Null when the quotation was started independently of a CPR.
     */
    private Long cprId;

    /**
     * Id of the owning pr_references row when the PR No was registered directly
     * from Quotations (no CPR involved). Null for CPR-carried PR numbers.
     */
    private Long prReferenceId;

    /**
     * Where {@link #referencePrNo} came from: {@code CPR} or {@code DIRECT}.
     * Drives the "CPR Reference" / "Direct PR Reference" indicator and keeps
     * the two entry points distinguishable in lists, previews and the PDF.
     */
    @Column(length = 20)
    private String referencePrSource;

    private String fromCompany;

    private String fromName;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String fromAddress;

    private String fromGstin;

    private String fromPan;

    private String fromEmail;

    private String fromPhone;

    private Long clientId;

    private String clientName;

    private String contactPerson;

    private String email;

    private String phone;

    private String address;

    private String city;

    private String state;

    private String pin;

    private String country;

    private String gstin;

    private String pan;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String billingAddress;

    private String billingCity;

    private String billingState;

    private String billingPin;

    private boolean shipSameAsBill;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String shippingAddress;

    private String shippingCity;

    private String shippingState;

    private String shippingPin;

    private String taxType;

    private String currency;

    /** Exchange rate of {@link #currency} per 1 unit of {@link #baseCurrency}, at save time. */
    @Column(precision = 24, scale = 10)
    private BigDecimal exchangeRate;

    /** Base currency the stored exchange rate is relative to (default INR). */
    @Column(length = 10)
    private String baseCurrency;

    private String numberFormat;

    @Column(nullable = false, length = 40)
    private String status = "draft";

    private String salesPerson;

    private String paymentTerms;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String remarks;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String terms;

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

    private String deliveryTerms;

    @Column(precision = 18, scale = 2)
    private BigDecimal freight = BigDecimal.ZERO;

    @Column(precision = 18, scale = 2)
    private BigDecimal insurance = BigDecimal.ZERO;

    private String signatureType;

    private String signatureLabel;

    private String hsnView;

    private String displayUnit;

    private Boolean taxSummary;

    private Boolean hidePlace;

    private Boolean hsnSummary;

    private Boolean originalImages;

    private Boolean thumbnails;

    private Boolean descFull;

    private Boolean hideSubtotal;

    private Boolean showSku;

    private Boolean serial;

    private Boolean batch;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String additionalInfo;

    private String contactEmail;

    private String contactPhone;

    /** User-defined custom fields for this quotation, stored as a JSON array string. */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String customFields;

    @Column(precision = 18, scale = 2)
    private BigDecimal grandTotal = BigDecimal.ZERO;

    private String convertedToSo;

    private String convertedToPi;

    private String convertedToInvoice;

    private String convertedToCn;

    private String convertedToPr;

    private String convertedToSc;

    private String convertedToDc;

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

    @OneToMany(mappedBy = "quotation", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<QuotationItem> items = new ArrayList<>();

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public void addItem(QuotationItem item) {
        item.setQuotation(this);
        items.add(item);
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getQuotationNo() {
        return quotationNo;
    }

    public void setQuotationNo(String quotationNo) {
        this.quotationNo = quotationNo;
    }

    public String getReference() {
        return reference;
    }

    public void setReference(String reference) {
        this.reference = reference;
    }

    public LocalDateTime getQuotationDate() {
        return quotationDate;
    }

    public void setQuotationDate(LocalDateTime quotationDate) {
        this.quotationDate = quotationDate;
    }

    public LocalDateTime getValidUntil() {
        return validUntil;
    }

    public void setValidUntil(LocalDateTime validUntil) {
        this.validUntil = validUntil;
    }

    public String getLeadNo() {
        return leadNo;
    }

    public void setLeadNo(String leadNo) {
        this.leadNo = leadNo;
    }

    public String getSourceCw() {
        return sourceCw;
    }

    public void setSourceCw(String sourceCw) {
        this.sourceCw = sourceCw;
    }

    public String getSourceCpr() {
        return sourceCpr;
    }

    public void setSourceCpr(String sourceCpr) {
        this.sourceCpr = sourceCpr;
    }

    public String getReferencePrNo() { return referencePrNo; }
    public void setReferencePrNo(String referencePrNo) { this.referencePrNo = referencePrNo; }

    public Long getCprId() { return cprId; }
    public void setCprId(Long cprId) { this.cprId = cprId; }

    public Long getPrReferenceId() { return prReferenceId; }
    public void setPrReferenceId(Long prReferenceId) { this.prReferenceId = prReferenceId; }

    public String getReferencePrSource() { return referencePrSource; }
    public void setReferencePrSource(String referencePrSource) { this.referencePrSource = referencePrSource; }

    public String getFromCompany() {
        return fromCompany;
    }

    public void setFromCompany(String fromCompany) {
        this.fromCompany = fromCompany;
    }

    public String getFromName() {
        return fromName;
    }

    public void setFromName(String fromName) {
        this.fromName = fromName;
    }

    public String getFromAddress() {
        return fromAddress;
    }

    public void setFromAddress(String fromAddress) {
        this.fromAddress = fromAddress;
    }

    public String getFromGstin() {
        return fromGstin;
    }

    public void setFromGstin(String fromGstin) {
        this.fromGstin = fromGstin;
    }

    public String getFromPan() {
        return fromPan;
    }

    public void setFromPan(String fromPan) {
        this.fromPan = fromPan;
    }

    public String getFromEmail() {
        return fromEmail;
    }

    public void setFromEmail(String fromEmail) {
        this.fromEmail = fromEmail;
    }

    public String getFromPhone() {
        return fromPhone;
    }

    public void setFromPhone(String fromPhone) {
        this.fromPhone = fromPhone;
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

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public String getCity() {
        return city;
    }

    public void setCity(String city) {
        this.city = city;
    }

    public String getState() {
        return state;
    }

    public void setState(String state) {
        this.state = state;
    }

    public String getPin() {
        return pin;
    }

    public void setPin(String pin) {
        this.pin = pin;
    }

    public String getCountry() {
        return country;
    }

    public void setCountry(String country) {
        this.country = country;
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

    public String getBillingAddress() {
        return billingAddress;
    }

    public void setBillingAddress(String billingAddress) {
        this.billingAddress = billingAddress;
    }

    public String getBillingCity() {
        return billingCity;
    }

    public void setBillingCity(String billingCity) {
        this.billingCity = billingCity;
    }

    public String getBillingState() {
        return billingState;
    }

    public void setBillingState(String billingState) {
        this.billingState = billingState;
    }

    public String getBillingPin() {
        return billingPin;
    }

    public void setBillingPin(String billingPin) {
        this.billingPin = billingPin;
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

    public String getShippingCity() {
        return shippingCity;
    }

    public void setShippingCity(String shippingCity) {
        this.shippingCity = shippingCity;
    }

    public String getShippingState() {
        return shippingState;
    }

    public void setShippingState(String shippingState) {
        this.shippingState = shippingState;
    }

    public String getShippingPin() {
        return shippingPin;
    }

    public void setShippingPin(String shippingPin) {
        this.shippingPin = shippingPin;
    }

    public String getTaxType() {
        return taxType;
    }

    public void setTaxType(String taxType) {
        this.taxType = taxType;
    }

    public BigDecimal getExchangeRate() {
        return exchangeRate;
    }

    public void setExchangeRate(BigDecimal exchangeRate) {
        this.exchangeRate = exchangeRate;
    }

    public String getBaseCurrency() {
        return baseCurrency;
    }

    public void setBaseCurrency(String baseCurrency) {
        this.baseCurrency = baseCurrency;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public String getNumberFormat() {
        return numberFormat;
    }

    public void setNumberFormat(String numberFormat) {
        this.numberFormat = numberFormat;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getSalesPerson() {
        return salesPerson;
    }

    public void setSalesPerson(String salesPerson) {
        this.salesPerson = salesPerson;
    }

    public String getPaymentTerms() {
        return paymentTerms;
    }

    public void setPaymentTerms(String paymentTerms) {
        this.paymentTerms = paymentTerms;
    }

    public String getRemarks() {
        return remarks;
    }

    public void setRemarks(String remarks) {
        this.remarks = remarks;
    }

    public String getTerms() {
        return terms;
    }

    public void setTerms(String terms) {
        this.terms = terms;
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

    public String getConvertedToSo() {
        return convertedToSo;
    }

    public void setConvertedToSo(String convertedToSo) {
        this.convertedToSo = convertedToSo;
    }

    public String getConvertedToPi() {
        return convertedToPi;
    }

    public void setConvertedToPi(String convertedToPi) {
        this.convertedToPi = convertedToPi;
    }

    public String getConvertedToInvoice() {
        return convertedToInvoice;
    }

    public void setConvertedToInvoice(String convertedToInvoice) {
        this.convertedToInvoice = convertedToInvoice;
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

    public String getConvertedToDc() {
        return convertedToDc;
    }

    public void setConvertedToDc(String convertedToDc) {
        this.convertedToDc = convertedToDc;
    }

    public String getConvertedToSc() {
        return convertedToSc;
    }

    public void setConvertedToSc(String convertedToSc) {
        this.convertedToSc = convertedToSc;
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

    public List<QuotationItem> getItems() {
        return items;
    }

    public void setItems(List<QuotationItem> items) {
        this.items = items;
    }

    public String getDeliveryTerms() {
        return deliveryTerms;
    }

    public void setDeliveryTerms(String deliveryTerms) {
        this.deliveryTerms = deliveryTerms;
    }

    public BigDecimal getFreight() {
        return freight;
    }

    public void setFreight(BigDecimal freight) {
        this.freight = freight;
    }

    public BigDecimal getInsurance() {
        return insurance;
    }

    public void setInsurance(BigDecimal insurance) {
        this.insurance = insurance;
    }

    public String getSignatureType() {
        return signatureType;
    }

    public void setSignatureType(String signatureType) {
        this.signatureType = signatureType;
    }

    public String getSignatureLabel() {
        return signatureLabel;
    }

    public void setSignatureLabel(String signatureLabel) {
        this.signatureLabel = signatureLabel;
    }

    public String getHsnView() {
        return hsnView;
    }

    public void setHsnView(String hsnView) {
        this.hsnView = hsnView;
    }

    public String getDisplayUnit() {
        return displayUnit;
    }

    public void setDisplayUnit(String displayUnit) {
        this.displayUnit = displayUnit;
    }

    public Boolean getTaxSummary() {
        return taxSummary;
    }

    public void setTaxSummary(Boolean taxSummary) {
        this.taxSummary = taxSummary;
    }

    public Boolean getHidePlace() {
        return hidePlace;
    }

    public void setHidePlace(Boolean hidePlace) {
        this.hidePlace = hidePlace;
    }

    public Boolean getHsnSummary() {
        return hsnSummary;
    }

    public void setHsnSummary(Boolean hsnSummary) {
        this.hsnSummary = hsnSummary;
    }

    public Boolean getOriginalImages() {
        return originalImages;
    }

    public void setOriginalImages(Boolean originalImages) {
        this.originalImages = originalImages;
    }

    public Boolean getThumbnails() {
        return thumbnails;
    }

    public void setThumbnails(Boolean thumbnails) {
        this.thumbnails = thumbnails;
    }

    public Boolean getDescFull() {
        return descFull;
    }

    public void setDescFull(Boolean descFull) {
        this.descFull = descFull;
    }

    public Boolean getHideSubtotal() {
        return hideSubtotal;
    }

    public void setHideSubtotal(Boolean hideSubtotal) {
        this.hideSubtotal = hideSubtotal;
    }

    public Boolean getShowSku() {
        return showSku;
    }

    public void setShowSku(Boolean showSku) {
        this.showSku = showSku;
    }

    public Boolean getSerial() {
        return serial;
    }

    public void setSerial(Boolean serial) {
        this.serial = serial;
    }

    public Boolean getBatch() {
        return batch;
    }

    public void setBatch(Boolean batch) {
        this.batch = batch;
    }

    public String getAdditionalInfo() {
        return additionalInfo;
    }

    public void setAdditionalInfo(String additionalInfo) {
        this.additionalInfo = additionalInfo;
    }

    public String getContactEmail() {
        return contactEmail;
    }

    public void setContactEmail(String contactEmail) {
        this.contactEmail = contactEmail;
    }

    public String getContactPhone() {
        return contactPhone;
    }

    public void setContactPhone(String contactPhone) {
        this.contactPhone = contactPhone;
    }

    public String getCustomFields() {
        return customFields;
    }

    public void setCustomFields(String customFields) {
        this.customFields = customFields;
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
