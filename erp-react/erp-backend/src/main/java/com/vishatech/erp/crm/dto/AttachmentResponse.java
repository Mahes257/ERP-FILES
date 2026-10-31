package com.vishatech.erp.crm.dto;

public record AttachmentResponse(
        Long id,
        String name,
        String type,
        long size,
        String url,
        String date
) {
}
