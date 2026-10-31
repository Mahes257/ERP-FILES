package com.vishatech.erp.dto;

/**
 * Lightweight Sales Order (CPO) projection for pickers and filters.
 *
 * <p>The full {@link SalesOrderResponse} carries line items, attachments,
 * timeline and history, and is assembled per row by
 * {@code SalesOrderService#toResponse}. A CPO dropdown needs none of that —
 * only the identifier, the CPO number, the customer, the order date and how
 * many items the order has. Serving pickers from this projection keeps a
 * dropdown load to ONE query for the rows plus ONE for the item counts,
 * instead of N+1 record assemblies.
 */
public record SalesOrderOptionResponse(
        Long id,
        String soNo,
        Long clientId,
        String clientName,
        String orderDate,
        int itemCount) {
}
