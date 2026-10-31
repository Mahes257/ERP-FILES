package com.vishatech.erp.crm.dto;

import jakarta.validation.constraints.NotBlank;

public record ChangeStageRequest(
        @NotBlank(message = "Stage is required") String stage
) {
}
