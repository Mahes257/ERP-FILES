package com.vishatech.erp.dto.production;

/**
 * Machine master row (Production → Settings → Machines).
 *
 * <p>{@code id} is the user-entered machine code (e.g. {@code MCH-001}) because
 * that is what the UI shows, searches and edits; {@code backendId} is the
 * internal numeric primary key. Machine Utilization report rows key off the
 * machine code, so the display identifier and the numeric key are kept clearly
 * apart.
 */
public record ProductionMachineDTO(
        String id,
        Long backendId,
        String name,
        String type,
        String department,
        String workCenter,
        String status,
        Integer availableHours,
        Integer runningHours,
        Integer idleHours,
        Integer maintenanceHours,
        String description
) {
}
