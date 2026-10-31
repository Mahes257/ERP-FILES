package com.vishatech.erp.crm.dto;

import jakarta.validation.constraints.NotBlank;

public record ChangePriorityRequest(
        @NotBlank(message = "Priority is required") String priority
) {
}
