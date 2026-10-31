package com.vishatech.erp.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * PATCH /documents/{id}/visibility — re-scopes one stored document.
 *
 * <p>A typed request body (instead of a raw {@code Map}) so the payload is
 * validated and documented like every other Documents/ERP write: the value is
 * still the same {@code {"visibility": "..."}} JSON the frontend already sends,
 * and the enum itself is checked in {@code DocumentRepositoryService}.
 */
public record DocumentVisibilityRequest(
        @NotBlank(message = "visibility is required") String visibility
) {
}
