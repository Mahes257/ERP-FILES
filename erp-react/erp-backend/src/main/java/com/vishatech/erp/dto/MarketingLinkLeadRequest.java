package com.vishatech.erp.dto;

import jakarta.validation.constraints.NotNull;

public record MarketingLinkLeadRequest(
        @NotNull(message = "A lead must be selected") Long leadId
) {
}
