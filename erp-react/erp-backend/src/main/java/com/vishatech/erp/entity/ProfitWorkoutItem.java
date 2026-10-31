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
@Table(name = "profit_workout_items")
public class ProfitWorkoutItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "profit_workout_id", nullable = false)
    private ProfitWorkout profitWorkout;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(precision = 18, scale = 3)
    private BigDecimal qty = BigDecimal.ONE;

    /** Category label for the flat item model (single category per item row). */
    private String category;

    private String unit;

    /**
     * Item-level rates for the flat Profit Workout model. When a selling rate is
     * present recalc() uses these authoritative values (cost = rate × qty,
     * selling = sellingRate × qty, profit = selling − cost, margin = profit /
     * selling). Rows created before the flat model (legacy category rows) leave
     * these null and keep the profitPct-based formula.
     */
    @Column(precision = 18, scale = 2)
    private BigDecimal costRate;

    @Column(precision = 18, scale = 2)
    private BigDecimal sellingRate;

    @Column(precision = 18, scale = 2)
    private BigDecimal profitPerUnit;

    /** Item profit margin in percent (profit / selling × 100), 0 when selling is 0. */
    @Column(precision = 10, scale = 2)
    private BigDecimal margin;

    /** Item-level totals, recomputed by recalc() from the rates (or categories + profitPct for legacy rows). */
    @Column(precision = 18, scale = 2)
    private BigDecimal cost = BigDecimal.ZERO;

    @Column(precision = 18, scale = 2)
    private BigDecimal selling = BigDecimal.ZERO;

    @Column(precision = 18, scale = 2)
    private BigDecimal profit = BigDecimal.ZERO;

    @OneToMany(mappedBy = "item", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<ProfitWorkoutCategory> categories = new ArrayList<>();

    private LocalDateTime createdAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
    }

    public void addCategory(ProfitWorkoutCategory category) {
        category.setItem(this);
        categories.add(category);
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public ProfitWorkout getProfitWorkout() {
        return profitWorkout;
    }

    public void setProfitWorkout(ProfitWorkout profitWorkout) {
        this.profitWorkout = profitWorkout;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public BigDecimal getQty() {
        return qty;
    }

    public void setQty(BigDecimal qty) {
        this.qty = qty;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getUnit() {
        return unit;
    }

    public void setUnit(String unit) {
        this.unit = unit;
    }

    public BigDecimal getCostRate() {
        return costRate;
    }

    public void setCostRate(BigDecimal costRate) {
        this.costRate = costRate;
    }

    public BigDecimal getSellingRate() {
        return sellingRate;
    }

    public void setSellingRate(BigDecimal sellingRate) {
        this.sellingRate = sellingRate;
    }

    public BigDecimal getProfitPerUnit() {
        return profitPerUnit;
    }

    public void setProfitPerUnit(BigDecimal profitPerUnit) {
        this.profitPerUnit = profitPerUnit;
    }

    public BigDecimal getMargin() {
        return margin;
    }

    public void setMargin(BigDecimal margin) {
        this.margin = margin;
    }

    public BigDecimal getCost() {
        return cost;
    }

    public void setCost(BigDecimal cost) {
        this.cost = cost;
    }

    public BigDecimal getSelling() {
        return selling;
    }

    public void setSelling(BigDecimal selling) {
        this.selling = selling;
    }

    public BigDecimal getProfit() {
        return profit;
    }

    public void setProfit(BigDecimal profit) {
        this.profit = profit;
    }

    public List<ProfitWorkoutCategory> getCategories() {
        return categories;
    }

    public void setCategories(List<ProfitWorkoutCategory> categories) {
        this.categories = categories;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
