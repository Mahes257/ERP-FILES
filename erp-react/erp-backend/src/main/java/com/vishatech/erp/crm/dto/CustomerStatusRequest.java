package com.vishatech.erp.crm.dto;

import jakarta.validation.constraints.NotBlank;

public record CustomerStatusRequest(
        @NotBlank(message = "Status is required") String status
) {
}
