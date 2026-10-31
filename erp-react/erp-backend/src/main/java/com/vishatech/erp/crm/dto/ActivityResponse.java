package com.vishatech.erp.crm.dto;

public record ActivityResponse(
        Long id,
        String type,
        String title,
        String detail,
        String owner,
        String date
) {
}
