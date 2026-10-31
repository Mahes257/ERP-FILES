package com.vishatech.erp.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "marketing_expense_audit_logs")
public class MarketingExpenseAuditLog {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false) private Long tripId;
    private Long expenseId;
    @Column(nullable = false, length = 40) private String action;
    @Lob @Column(columnDefinition = "TEXT") private String description;
    private String performedBy;
    private Long performedByUserId;
    private LocalDateTime performedAt;

    @PrePersist void onCreate() { performedAt = LocalDateTime.now(); }

    public Long getId() { return id; } public void setId(Long id) { this.id = id; }
    public Long getTripId() { return tripId; } public void setTripId(Long v) { this.tripId = v; }
    public Long getExpenseId() { return expenseId; } public void setExpenseId(Long v) { this.expenseId = v; }
    public String getAction() { return action; } public void setAction(String v) { this.action = v; }
    public String getDescription() { return description; } public void setDescription(String v) { this.description = v; }
    public String getPerformedBy() { return performedBy; } public void setPerformedBy(String v) { this.performedBy = v; }
    public Long getPerformedByUserId() { return performedByUserId; } public void setPerformedByUserId(Long v) { this.performedByUserId = v; }
    public LocalDateTime getPerformedAt() { return performedAt; } public void setPerformedAt(LocalDateTime v) { this.performedAt = v; }
}
