package com.vishatech.erp.crm.dto;

public record CustomerActivityEntry(
        String type,
        String title,
        String detail,
        String createdAt
) {
}
