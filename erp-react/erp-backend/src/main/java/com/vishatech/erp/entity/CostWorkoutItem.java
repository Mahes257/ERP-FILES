package com.vishatech.erp.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "cost_workout_items")
public class CostWorkoutItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "cost_workout_id", nullable = false)
    private CostWorkout costWorkout;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String description;

    /**
     * Short, brief CPR-facing description of this item — separate from
     * {@link #description}, which stays the full costing description. Only this
     * value is shown in the Cost Workout list's Description column.
     * Optional and nullable: Cost Workouts created before this field exist simply
     * have no CPR description.
     */
    @Lob
    @Column(name = "cpr_description", columnDefinition = "TEXT")
    private String cprDescription;

    @Column(precision = 18, scale = 3)
    private BigDecimal qty = BigDecimal.ONE;

    private String unit;

    @OneToMany(mappedBy = "item", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<CostWorkoutCategory> categories = new ArrayList<>();

    @Lob
    @Column(columnDefinition = "TEXT")
    private String customFieldsJson;

    /**
     * Documents attached to THIS item only, stored in the same embedded JSON
     * shape the Cost Workout uses for its own attachments
     * ({name, size, type, data(base64)}). Item-scoped, so removing a different
     * item (or reordering items) can never move a file to another item.
     * Nullable: items created before this column simply have no documents.
     */
    @Lob
    @Column(name = "attachments_json", columnDefinition = "TEXT")
    private String attachmentsJson;

    private LocalDateTime createdAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
    }

    public void addCategory(CostWorkoutCategory category) {
        category.setItem(this);
        categories.add(category);
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public CostWorkout getCostWorkout() {
        return costWorkout;
    }

    public void setCostWorkout(CostWorkout costWorkout) {
        this.costWorkout = costWorkout;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getCprDescription() {
        return cprDescription;
    }

    public void setCprDescription(String cprDescription) {
        this.cprDescription = cprDescription;
    }

    public BigDecimal getQty() {
        return qty;
    }

    public void setQty(BigDecimal qty) {
        this.qty = qty;
    }

    public String getUnit() {
        return unit;
    }

    public void setUnit(String unit) {
        this.unit = unit;
    }

    public String getCustomFieldsJson() {
        return customFieldsJson;
    }

    public void setCustomFieldsJson(String customFieldsJson) {
        this.customFieldsJson = customFieldsJson;
    }

    public String getAttachmentsJson() {
        return attachmentsJson;
    }

    public void setAttachmentsJson(String attachmentsJson) {
        this.attachmentsJson = attachmentsJson;
    }

    public List<CostWorkoutCategory> getCategories() {
        return categories;
    }

    public void setCategories(List<CostWorkoutCategory> categories) {
        this.categories = categories;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
