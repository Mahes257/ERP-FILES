package com.vishatech.erp.dashboard.dto;

/**
 * Customer totals for the dashboard.
 *
 * @param totalCustomers  the raw customer row count (deleted customers included)
 * @param clientsTotal    customers excluding the ones marked deleted, floored at zero
 * @param clientsActive   customers whose status is active
 */
public record ClientCounts(long totalCustomers, long clientsTotal, long clientsActive) {
}
