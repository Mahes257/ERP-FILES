package com.vishatech.erp.crm.dto;

public record NoteResponse(
        Long id,
        String text,
        String author,
        String date
) {
}
