package com.vishatech.erp.dashboard.dto;

/**
 * Counters for the sales document chain, exactly as the ERP dashboard already
 * reports them. Each number comes from the owning document's own stats
 * document (revision-aware, matching the list screens), so the values are
 * unchanged; only their transport changed.
 *
 * <p>Field names mirror the payload keys the dashboard renders
 * ({@code totalQuotations}, {@code pendingQuotations}, …) so the mapping stays
 * reviewable. {@code pendingApproval*} corresponds to the document's own
 * "pending approval" bucket (the contracts' {@code underreview} and the orders'
 * {@code pendingreview} are named after their own statuses, as before).
 */
public record SalesCounts(
        long totalQuotations,
        long draftQuotations,
        long pendingApprovalQuotations,
        long approvedQuotations,
        long rejectedQuotations,
        long convertedQuotations,
        long totalSalesContracts,
        long draftSalesContracts,
        long underReviewSalesContracts,
        long submittedSalesContracts,
        long approvedSalesContracts,
        long activeSalesContracts,
        long completedSalesContracts,
        long cancelledSalesContracts,
        long totalSalesOrders,
        long draftSalesOrders,
        long pendingReviewSalesOrders,
        long approvedSalesOrders,
        long inProgressSalesOrders,
        long completedSalesOrders,
        long cancelledSalesOrders,
        long totalCreditNotes,
        long draftCreditNotes,
        long pendingApprovalCreditNotes,
        long approvedCreditNotes,
        long totalInvoices,
        long overdueInvoices,
        long partialInvoices,
        long paidInvoices,
        long pendingApprovalInvoices,
        long approvedInvoices,
        long totalDeliveryChallans,
        long pendingApprovalDeliveryChallans,
        long approvedDeliveryChallans,
        long totalProformaInvoices,
        long pendingApprovalProformaInvoices,
        long approvedProformaInvoices,
        long totalPaymentReceipts,
        long pendingApprovalPaymentReceipts,
        long receivedPaymentReceipts,
        long partialPaymentReceipts,
        long cancelledPaymentReceipts) {
}
