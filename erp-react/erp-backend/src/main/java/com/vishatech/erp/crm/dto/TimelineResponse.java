package com.vishatech.erp.crm.dto;

public record TimelineResponse(
        Long id,
        String type,
        String title,
        String detail,
        String date
) {
}
