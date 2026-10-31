package com.vishatech.erp.dto;

public record SalesOrderNextNumberResponse(
        String soNo,
        long nextNumber
) {
}
