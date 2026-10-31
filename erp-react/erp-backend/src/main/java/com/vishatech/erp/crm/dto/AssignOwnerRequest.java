package com.vishatech.erp.crm.dto;

import jakarta.validation.constraints.NotBlank;

public record AssignOwnerRequest(
        @NotBlank(message = "Owner is required") String owner
) {
}
