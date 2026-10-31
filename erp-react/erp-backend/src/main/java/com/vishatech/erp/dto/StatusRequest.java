package com.vishatech.erp.dto;

import jakarta.validation.constraints.NotBlank;

public record StatusRequest(
        @NotBlank(message = "status must not be blank") String status,
        String remarks
) {
}
