package com.vishatech.erp.crm.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * A real contact PERSON captured by the CRM (table {@code contacts}).
 *
 * The Lead form captures two people — a primary and a secondary contact — and
 * stores them as columns on the lead row. Those columns cannot be listed,
 * opened, edited or linked on their own, so every captured person is mirrored
 * here as its own row, keyed by {@code (lead_id, contact_type)}:
 *
 *   * {@code contactType} is PRIMARY or SECONDARY — two different people are
 *     never merged into one record.
 *   * {@code lead} is the lead the contact was captured from (nullable, so a
 *     contact may also be created or linked on its own).
 *   * {@code client} is set when the lead is converted to a client, or when the
 *     contact is linked to an existing client. A converted contact therefore
 *     carries BOTH references — the lead it came from and the client it became
 *     associated with — which is the distinction the module must preserve.
 *   * {@code status} uses the same values as the other CRM lists (Active /
 *     Inactive / Archived / Deleted); archive, restore and delete are status
 *     changes, so nothing is dropped implicitly.
 *
 * The lead/client relationships are read-only from this side: deleting a lead or
 * a client sets the reference to NULL (see docs/contacts_migration.sql) and
 * never deletes contact rows, and no contact operation deletes a lead, a client
 * or their data.
 */
@Entity
@Table(name = "contacts")
public class Contact {

    /** Contact type for the person the Lead form calls the "Contact Person". */
    public static final String TYPE_PRIMARY = "Primary";
    /** Contact type for the person the Lead form calls the "Secondary Contact". */
    public static final String TYPE_SECONDARY = "Secondary";

    /** Status values shared with the other CRM lists. */
    public static final String STATUS_ACTIVE = "Active";
    public static final String STATUS_INACTIVE = "Inactive";
    public static final String STATUS_ARCHIVED = "Archived";
    public static final String STATUS_DELETED = "Deleted";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 190)
    private String name;

    private String designation;

    private String phone;

    private String email;

    @Column(name = "contact_type", nullable = false, length = 40)
    private String contactType = TYPE_PRIMARY;

    @Column(name = "business_name")
    private String businessName;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lead_id")
    private Lead lead;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "client_id")
    private Customer client;

    @Column(nullable = false, length = 40)
    private String status = STATUS_ACTIVE;

    @Column(length = 60)
    private String source;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDesignation() {
        return designation;
    }

    public void setDesignation(String designation) {
        this.designation = designation;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getContactType() {
        return contactType;
    }

    public void setContactType(String contactType) {
        this.contactType = contactType;
    }

    public String getBusinessName() {
        return businessName;
    }

    public void setBusinessName(String businessName) {
        this.businessName = businessName;
    }

    public Lead getLead() {
        return lead;
    }

    public void setLead(Lead lead) {
        this.lead = lead;
    }

    public Customer getClient() {
        return client;
    }

    public void setClient(Customer client) {
        this.client = client;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
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
}
