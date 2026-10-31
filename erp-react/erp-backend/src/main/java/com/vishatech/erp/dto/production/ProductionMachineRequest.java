package com.vishatech.erp.dto.production;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/** Create / update payload for the machine master. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record ProductionMachineRequest(
        String id,
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
