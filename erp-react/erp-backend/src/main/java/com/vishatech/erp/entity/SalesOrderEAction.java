package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * One E-Action / Participation record of a Customer Purchase Order.
 *
 * <p>The CPO's Release &amp; Procurement method can be a DIRECT RELEASE or an
 * E-AUCTION / PARTICIPATION. When it is the latter, the order carries any
 * number of actions (review the quotation, technical review, commercial
 * negotiation, …), each assigned to a participant team with its own status,
 * dates, result and remarks. The table is intentionally generic: the business
 * columns are fixed and user-defined columns keep their per-row values in
 * {@code customFieldsJson} (keyed by the column's stable id), exactly like the
 * CPR item grid — so renaming a custom column never orphans data.
 */
@Entity
@Table(name = "sales_order_e_actions")
public class SalesOrderEAction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * The Customer Purchase Order this action belongs to — optional, because an
     * action may be raised against a CPO that is not a record in this system
     * (see {@link #cpoReference}). Exactly one of the two is set: a linked row
     * carries the order, a manual row carries the typed reference.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = true)
    @JoinColumn(name = "sales_order_id", nullable = true)
    private SalesOrder salesOrder;

    /**
     * The CPO number / reference the user typed when the order is NOT one of
     * the CPO records stored here. It is free text (nothing is created or
     * linked behind the user's back) and is only ever read for display, so an
     * E-Action can still be raised, listed, searched and edited for an order
     * the system does not hold a full CPO record for.
     */
    @Column(name = "cpo_reference", length = 255)
    private String cpoReference;

    /** Participant / Team the action was released to (business column). */
    private String participantTeam;

    /** Assigned Action — what the participant team has to do. */
    @Column(length = 500)
    private String assignedAction;

    /** Assigned To — the person responsible. */
    private String assignedTo;

    /** Pending / In Progress / Completed / Cancelled / On Hold. */
    private String status;

    private LocalDateTime requestedOn;

    private LocalDateTime startedOn;

    private LocalDateTime completedOn;

    /** Result — outcome recorded when the action finishes. */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String result;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String remarks;

    /**
     * Values of the user-defined columns for THIS row, keyed by the column's
     * stable id ({@code {"custom_x":"SS304"}}). Stored per row so the same
     * column can hold a different value on every E-Action, and so a new CPO
     * never inherits another record's values.
     */
    @Lob
    @Column(columnDefinition = "TEXT")
    private String customFieldsJson;

    private LocalDateTime createdAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public SalesOrder getSalesOrder() {
        return salesOrder;
    }

    public void setSalesOrder(SalesOrder salesOrder) {
        this.salesOrder = salesOrder;
    }

    public String getCpoReference() {
        return cpoReference;
    }

    public void setCpoReference(String cpoReference) {
        this.cpoReference = cpoReference;
    }

    public String getParticipantTeam() {
        return participantTeam;
    }

    public void setParticipantTeam(String participantTeam) {
        this.participantTeam = participantTeam;
    }

    public String getAssignedAction() {
        return assignedAction;
    }

    public void setAssignedAction(String assignedAction) {
        this.assignedAction = assignedAction;
    }

    public String getAssignedTo() {
        return assignedTo;
    }

    public void setAssignedTo(String assignedTo) {
        this.assignedTo = assignedTo;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public LocalDateTime getRequestedOn() {
        return requestedOn;
    }

    public void setRequestedOn(LocalDateTime requestedOn) {
        this.requestedOn = requestedOn;
    }

    public LocalDateTime getStartedOn() {
        return startedOn;
    }

    public void setStartedOn(LocalDateTime startedOn) {
        this.startedOn = startedOn;
    }

    public LocalDateTime getCompletedOn() {
        return completedOn;
    }

    public void setCompletedOn(LocalDateTime completedOn) {
        this.completedOn = completedOn;
    }

    public String getResult() {
        return result;
    }

    public void setResult(String result) {
        this.result = result;
    }

    public String getRemarks() {
        return remarks;
    }

    public void setRemarks(String remarks) {
        this.remarks = remarks;
    }

    public String getCustomFieldsJson() {
        return customFieldsJson;
    }

    public void setCustomFieldsJson(String customFieldsJson) {
        this.customFieldsJson = customFieldsJson;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
