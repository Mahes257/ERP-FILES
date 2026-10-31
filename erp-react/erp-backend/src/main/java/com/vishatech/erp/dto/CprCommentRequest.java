package com.vishatech.erp.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CprCommentRequest(
        @NotBlank(message = "Comment text is required")
        @Size(max = 100000, message = "Comment cannot exceed 100000 characters")
        String text
) {
}
