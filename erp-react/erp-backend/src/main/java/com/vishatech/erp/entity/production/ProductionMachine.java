package com.vishatech.erp.entity.production;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * Machine master record (Production → Settings → Machines).
 *
 * <p>Machines are the reference data behind the Machine Shop module and the
 * Machine Utilization report: the available / running / idle / maintenance
 * hours entered here are what that report divides. The records used to live in
 * browser localStorage, so they vanished on another device and the report could
 * never read them; they are now persisted in {@code production_machines}.
 */
@Entity
@Table(name = "production_machines")
public class ProductionMachine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** User-entered machine id (e.g. {@code MCH-001}) — unique. */
    @Column(name = "machine_code", length = 50, nullable = false, unique = true)
    private String machineCode;

    @Column(length = 150, nullable = false)
    private String name;

    @Column(name = "machine_type", length = 60, nullable = false)
    private String machineType;

    @Column(length = 50, nullable = false)
    private String department;

    @Column(name = "work_center", length = 50)
    private String workCenter;

    @Column(length = 30, nullable = false)
    private String status;

    @Column(name = "available_hours")
    private Integer availableHours;

    @Column(name = "running_hours")
    private Integer runningHours;

    @Column(name = "idle_hours")
    private Integer idleHours;

    @Column(name = "maintenance_hours")
    private Integer maintenanceHours;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getMachineCode() { return machineCode; }
    public void setMachineCode(String machineCode) { this.machineCode = machineCode; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getMachineType() { return machineType; }
    public void setMachineType(String machineType) { this.machineType = machineType; }

    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }

    public String getWorkCenter() { return workCenter; }
    public void setWorkCenter(String workCenter) { this.workCenter = workCenter; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Integer getAvailableHours() { return availableHours; }
    public void setAvailableHours(Integer availableHours) { this.availableHours = availableHours; }

    public Integer getRunningHours() { return runningHours; }
    public void setRunningHours(Integer runningHours) { this.runningHours = runningHours; }

    public Integer getIdleHours() { return idleHours; }
    public void setIdleHours(Integer idleHours) { this.idleHours = idleHours; }

    public Integer getMaintenanceHours() { return maintenanceHours; }
    public void setMaintenanceHours(Integer maintenanceHours) { this.maintenanceHours = maintenanceHours; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
