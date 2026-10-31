package com.vishatech.erp.crm.dto;

import jakarta.validation.constraints.NotBlank;

/** Status change payload for a contact (Active / Inactive / Archived / Deleted). */
public record ContactStatusRequest(
        @NotBlank(message = "Status is required") String status
) {
}
