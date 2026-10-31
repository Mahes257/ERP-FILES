package com.vishatech.erp.dto.production;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/** Create / update payload for the work center master. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record ProductionWorkCenterRequest(
        String id,
        String name,
        String department,
        String location,
        String supervisor,
        String status,
        String description
) {
}
