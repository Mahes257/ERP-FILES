package com.vishatech.erp.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
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
import org.hibernate.annotations.BatchSize;

@Entity
@Table(name = "sales_orders", indexes = {
        @Index(name = "idx_so_status", columnList = "status"),
        @Index(name = "idx_so_status_revision", columnList = "status, revision"),
        @Index(name = "idx_so_revision_of", columnList = "revision_of")
})
public class SalesOrder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 40, unique = true)
    private String soNo;

    private String customerPo;

    private LocalDateTime orderDate;

    private String leadNo;

    private String scRef;

    private String qtnRef;

    @Column(nullable = false, length = 40)
    private String status = "draft";

    private String currency;
    private String taxType;

    private String hsnView;

    private String priority;

    private Long clientId;

    private String clientName;

    private String contactPerson;

    private String email;

    private String phone;

    private String city;

    private String state;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String billingAddress;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String shippingAddress;

    private String gstin;

    private String pan;

    /** Master-value field (payment_terms) — short selection, also queried
     *  case-insensitively, so it must stay a VARCHAR. */
    @Column(length = 255)
    private String paymentTerms;

    private String salesExecutive;

    private LocalDateTime deliveryDate;

    /** Master-value field (delivery_terms) — short selection, also queried
     *  case-insensitively, so it must stay a VARCHAR. */
    @Column(length = 255)
    private String deliveryTerms;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String terms;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String remarks;

    // ---- Release & Procurement Method ----
    // (null on records created before this section existed — nothing is
    // rewritten for historical rows)

    /** Direct Release | E-Action / Participation | Other supported method. */
    @Column(length = 60)
    private String releaseMethod;

    /** Yes / No — is a release action required against this order. */
    @Column(length = 10)
    private String releaseRequired;

    /** Action Type — Direct Release | E-Auction | Participation | Review ... */
    @Column(length = 60)
    private String actionType;

    private LocalDateTime releaseDate;

    /** Department the order/action was released to (e.g. Purchase). */
    @Column(length = 160)
    private String releaseToDepartment;

    /** Yes / No — does the release require participant participation. */
    @Column(length = 10)
    private String participationRequired;

    /** Person the release action is assigned to. */
    @Column(length = 160)
    private String assignedTo;

    /** Department / Team owning the release action. */
    @Column(length = 160)
    private String departmentTeam;

    private LocalDateTime actionDeadline;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String actionRemarks;

    /**
     * Action / Release Instructions — release, e-auction and participation
     * instructions, buyer requirements, special conditions and procurement
     * instructions supplied with the order. Long text on purpose.
     */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String actionInstructions;

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

    private String convertedToInv;

    private String convertedToDc;

    private String convertedToProforma;

    private String convertedToCn;

    private String convertedToPr;

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

    @OneToMany(mappedBy = "salesOrder", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    @BatchSize(size = 50)
    private List<SalesOrderItem> items = new ArrayList<>();

    @OneToMany(mappedBy = "salesOrder", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<SalesOrderEAction> eActions = new ArrayList<>();

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public void addItem(SalesOrderItem item) {
        item.setSalesOrder(this);
        items.add(item);
    }

    public void addEAction(SalesOrderEAction action) {
        action.setSalesOrder(this);
        eActions.add(action);
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getSoNo() {
        return soNo;
    }

    public void setSoNo(String soNo) {
        this.soNo = soNo;
    }

    public String getCustomerPo() {
        return customerPo;
    }

    public void setCustomerPo(String customerPo) {
        this.customerPo = customerPo;
    }

    public LocalDateTime getOrderDate() {
        return orderDate;
    }

    public void setOrderDate(LocalDateTime orderDate) {
        this.orderDate = orderDate;
    }

    public String getLeadNo() {
        return leadNo;
    }

    public void setLeadNo(String leadNo) {
        this.leadNo = leadNo;
    }

    public String getScRef() {
        return scRef;
    }

    public void setScRef(String scRef) {
        this.scRef = scRef;
    }

    public String getQtnRef() {
        return qtnRef;
    }

    public void setQtnRef(String qtnRef) {
        this.qtnRef = qtnRef;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
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

    public String getPriority() {
        return priority;
    }

    public void setPriority(String priority) {
        this.priority = priority;
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

    public String getBillingAddress() {
        return billingAddress;
    }

    public void setBillingAddress(String billingAddress) {
        this.billingAddress = billingAddress;
    }

    public String getShippingAddress() {
        return shippingAddress;
    }

    public void setShippingAddress(String shippingAddress) {
        this.shippingAddress = shippingAddress;
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

    public String getPaymentTerms() {
        return paymentTerms;
    }

    public void setPaymentTerms(String paymentTerms) {
        this.paymentTerms = paymentTerms;
    }

    public String getSalesExecutive() {
        return salesExecutive;
    }

    public void setSalesExecutive(String salesExecutive) {
        this.salesExecutive = salesExecutive;
    }

    public LocalDateTime getDeliveryDate() {
        return deliveryDate;
    }

    public void setDeliveryDate(LocalDateTime deliveryDate) {
        this.deliveryDate = deliveryDate;
    }

    public String getDeliveryTerms() {
        return deliveryTerms;
    }

    public void setDeliveryTerms(String deliveryTerms) {
        this.deliveryTerms = deliveryTerms;
    }

    public String getTerms() {
        return terms;
    }

    public void setTerms(String terms) {
        this.terms = terms;
    }

    public String getRemarks() {
        return remarks;
    }

    public void setRemarks(String remarks) {
        this.remarks = remarks;
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

    public String getConvertedToInv() {
        return convertedToInv;
    }

    public void setConvertedToInv(String convertedToInv) {
        this.convertedToInv = convertedToInv;
    }

    public String getConvertedToDc() {
        return convertedToDc;
    }

    public void setConvertedToDc(String convertedToDc) {
        this.convertedToDc = convertedToDc;
    }

    public String getConvertedToProforma() {
        return convertedToProforma;
    }

    public void setConvertedToProforma(String convertedToProforma) {
        this.convertedToProforma = convertedToProforma;
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

    public List<SalesOrderItem> getItems() {
        return items;
    }

    public void setItems(List<SalesOrderItem> items) {
        this.items = items;
    }

    public List<SalesOrderEAction> getEActions() {
        return eActions;
    }

    public void setEActions(List<SalesOrderEAction> eActions) {
        this.eActions = eActions;
    }

    public String getReleaseMethod() {
        return releaseMethod;
    }

    public void setReleaseMethod(String releaseMethod) {
        this.releaseMethod = releaseMethod;
    }

    public String getReleaseRequired() {
        return releaseRequired;
    }

    public void setReleaseRequired(String releaseRequired) {
        this.releaseRequired = releaseRequired;
    }

    public String getActionType() {
        return actionType;
    }

    public void setActionType(String actionType) {
        this.actionType = actionType;
    }

    public LocalDateTime getReleaseDate() {
        return releaseDate;
    }

    public void setReleaseDate(LocalDateTime releaseDate) {
        this.releaseDate = releaseDate;
    }

    public String getReleaseToDepartment() {
        return releaseToDepartment;
    }

    public void setReleaseToDepartment(String releaseToDepartment) {
        this.releaseToDepartment = releaseToDepartment;
    }

    public String getParticipationRequired() {
        return participationRequired;
    }

    public void setParticipationRequired(String participationRequired) {
        this.participationRequired = participationRequired;
    }

    public String getAssignedTo() {
        return assignedTo;
    }

    public void setAssignedTo(String assignedTo) {
        this.assignedTo = assignedTo;
    }

    public String getDepartmentTeam() {
        return departmentTeam;
    }

    public void setDepartmentTeam(String departmentTeam) {
        this.departmentTeam = departmentTeam;
    }

    public LocalDateTime getActionDeadline() {
        return actionDeadline;
    }

    public void setActionDeadline(LocalDateTime actionDeadline) {
        this.actionDeadline = actionDeadline;
    }

    public String getActionRemarks() {
        return actionRemarks;
    }

    public void setActionRemarks(String actionRemarks) {
        this.actionRemarks = actionRemarks;
    }

    public String getActionInstructions() {
        return actionInstructions;
    }

    public void setActionInstructions(String actionInstructions) {
        this.actionInstructions = actionInstructions;
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
