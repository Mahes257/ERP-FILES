package com.vishatech.erp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * Persisted column configuration of one grid (item table or list table).
 *
 * One row per grid key, e.g. "sales.items.invoice". The value is the exact
 * column array the user configured through Manage Columns: id / key / label /
 * type / required / system / hidden / width / order — including every custom
 * column definition. Custom column VALUES live per row (item.customFieldsJson),
 * never here.
 *
 * Stored as JSON in a single LONGTEXT column so a new user column never
 * requires a database schema change (no dynamic ALTER TABLE). Same architecture
 * the CPR item grid uses per document (Cpr.itemColumnsJson).
 */
@Entity
@Table(name = "grid_configs")
public class GridConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Stable grid identifier, e.g. "sales.items.invoice" or "crm.leads". */
    @Column(name = "grid_key", nullable = false, length = 150, unique = true)
    private String gridKey;

    @Lob
    @Column(name = "config_json", columnDefinition = "LONGTEXT")
    private String configJson;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    public GridConfig() {
    }

    public GridConfig(String gridKey, String configJson) {
        this.gridKey = gridKey;
        this.configJson = configJson;
    }

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public String getGridKey() {
        return gridKey;
    }

    public void setGridKey(String gridKey) {
        this.gridKey = gridKey;
    }

    public String getConfigJson() {
        return configJson;
    }

    public void setConfigJson(String configJson) {
        this.configJson = configJson;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
