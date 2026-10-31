package com.vishatech.erp.dto;

import com.vishatech.erp.entity.DocumentVisibility;
import jakarta.validation.constraints.NotBlank;

public record DocumentRepositoryRequest(
        @NotBlank String documentName,
        @NotBlank String documentType,
        @NotBlank String module,
        Long relatedRecordId,
        String recordNumber,
        Long customerId,
        String customerName,
        DocumentVisibility visibility,
        String description,
        // Editable non-terminal lifecycle status (generated / uploaded / pending).
        // Null means "leave unchanged".
        String status
) {}
