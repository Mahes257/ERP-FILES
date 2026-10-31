package com.vishatech.erp.dto;

import jakarta.validation.constraints.NotBlank;

public record DocumentSettingsRequest(
        @NotBlank(message = "defaultVisibility is required") String defaultVisibility
) {
}
