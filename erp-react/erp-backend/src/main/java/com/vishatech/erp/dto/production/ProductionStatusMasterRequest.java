package com.vishatech.erp.dto.production;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/** Create / update payload for the status master. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record ProductionStatusMasterRequest(
        String name,
        String category,
        String description,
        Boolean active,
        Integer displayOrder
) {
}
