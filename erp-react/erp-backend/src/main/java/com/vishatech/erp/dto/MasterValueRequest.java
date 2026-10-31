package com.vishatech.erp.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record MasterValueRequest(
        @NotBlank(message = "Value is required")
        @Size(max = 120, message = "Value must be 120 characters or less")
        String value) {
}
