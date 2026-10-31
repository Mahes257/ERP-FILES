package com.vishatech.erp.dto;

public record CprCommentResponse(
        Long id,
        String author,
        String text,
        String createdAt,
        String updatedAt
) {
}
