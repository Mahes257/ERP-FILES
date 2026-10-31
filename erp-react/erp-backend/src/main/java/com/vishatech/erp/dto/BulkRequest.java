package com.vishatech.erp.dto;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record BulkRequest(
        @NotEmpty(message = "ids must not be empty") List<Long> ids
) {
}
