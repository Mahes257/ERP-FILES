package com.vishatech.erp.dashboard.dto;

import java.util.Map;

public record DashboardStats(
        long totalExpenses,
        long netProfit,
        long cashBalance,
        long totalCustomers,
        long totalVendors,
        long activeLeads,
        long salesOrders,
        long purchaseOrders,
        long pendingDeliveries,
        long pendingReceipts,
        long pendingPayments,
        long pendingCprs,
        long totalQuotations,
        long totalSalesContracts,
        long totalProformaInvoices,
        long totalInvoices,
        long totalPaymentReceipts,
        long totalCreditNotes,
        long totalDeliveryChallans,
        // Detailed per-module breakdown for dashboard workflow visualization
        long draftQuotations,
        long pendingQuotations,
        long draftSalesContracts,
        long pendingSalesContracts,
        long draftSalesOrders,
        long pendingSalesOrders,
        long draftCreditNotes,
        long pendingCreditNotes,
        long overdueInvoices,
        long partialInvoices,
        long paidInvoices,
        long activeLeadsCount,
        long qualifiedLeads,
        long wonLeads,
        long lostLeads,
        long openFollowups,
        long overdueFollowups,
        long totalFollowups,
        // CPR detailed breakdown
        long totalCprs,
        long draftCprs,
        long approvedCprs,
        long rejectedCprs,
        long convertedCprs,
        // CPR Technical Verification
        long totalCprTvs,
        long draftCprTvs,
        long underVerificationCprTvs,
        long completedCprTvs,
        long approvedCprTvs,
        long rejectedCprTvs,
        // Cost Workout
        long totalCostWorkouts,
        long draftCostWorkouts,
        long pendingCostWorkouts,
        long completedCostWorkouts,
        long approvedCostWorkouts,
        long rejectedCostWorkouts,
        // Profit Workout
        long totalProfitWorkouts,
        long draftProfitWorkouts,
        long pendingProfitWorkouts,
        long completedProfitWorkouts,
        long approvedProfitWorkouts,
        long rejectedProfitWorkouts,
        // Quotation detailed
        long approvedQuotations,
        long rejectedQuotations,
        long convertedQuotations,
        // Sales Contract detailed
        long submittedSalesContracts,
        long approvedSalesContracts,
        long activeSalesContracts,
        long completedSalesContracts,
        long cancelledSalesContracts,
        // CPO detailed
        long approvedSalesOrders,
        long inProgressSalesOrders,
        long completedSalesOrders,
        long cancelledSalesOrders,
        // Delivery Challan detailed
        long pendingDeliveryChallans,
        long approvedDeliveryChallans,
        // Proforma Invoice detailed
        long pendingProformaInvoices,
        long approvedProformaInvoices,
        // Invoice detailed
        long pendingInvoices,
        long approvedInvoices,
        long paidInvoicesCount,
        // Credit Note detailed
        long approvedCreditNotes,
        // Payment Receipt detailed
        long pendingPaymentReceipts,
        long receivedPaymentReceipts,
        long partialPaymentReceipts,
        long cancelledPaymentReceipts
) {
    /**
     * Summary map for the frontend dashboard — all breakdown fields exposed.
     */
    public Map<String, Object> toMap() {
        return Map.ofEntries(
            Map.entry("totalExpenses", totalExpenses),
            Map.entry("netProfit", netProfit),
            Map.entry("cashBalance", cashBalance),
            Map.entry("totalCustomers", totalCustomers),
            Map.entry("totalVendors", totalVendors),
            Map.entry("activeLeads", activeLeads),
            Map.entry("salesOrders", salesOrders),
            Map.entry("purchaseOrders", purchaseOrders),
            Map.entry("pendingDeliveries", pendingDeliveries),
            Map.entry("pendingReceipts", pendingReceipts),
            Map.entry("pendingPayments", pendingPayments),
            Map.entry("pendingCprs", pendingCprs),
            Map.entry("totalQuotations", totalQuotations),
            Map.entry("totalSalesContracts", totalSalesContracts),
            Map.entry("totalProformaInvoices", totalProformaInvoices),
            Map.entry("totalInvoices", totalInvoices),
            Map.entry("totalPaymentReceipts", totalPaymentReceipts),
            Map.entry("totalCreditNotes", totalCreditNotes),
            Map.entry("totalDeliveryChallans", totalDeliveryChallans),
            // Detailed breakdown
            Map.entry("draftQuotations", draftQuotations),
            Map.entry("pendingQuotations", pendingQuotations),
            Map.entry("draftSalesContracts", draftSalesContracts),
            Map.entry("pendingSalesContracts", pendingSalesContracts),
            Map.entry("draftSalesOrders", draftSalesOrders),
            Map.entry("pendingSalesOrders", pendingSalesOrders),
            Map.entry("draftCreditNotes", draftCreditNotes),
            Map.entry("pendingCreditNotes", pendingCreditNotes),
            Map.entry("overdueInvoices", overdueInvoices),
            Map.entry("partialInvoices", partialInvoices),
            Map.entry("paidInvoices", paidInvoices),
            Map.entry("activeLeadsCount", activeLeadsCount),
            Map.entry("qualifiedLeads", qualifiedLeads),
            Map.entry("wonLeads", wonLeads),
            Map.entry("lostLeads", lostLeads),
            Map.entry("openFollowups", openFollowups),
            Map.entry("overdueFollowups", overdueFollowups),
            Map.entry("totalFollowups", totalFollowups),
            // CPR detailed
            Map.entry("totalCprs", totalCprs),
            Map.entry("draftCprs", draftCprs),
            Map.entry("approvedCprs", approvedCprs),
            Map.entry("rejectedCprs", rejectedCprs),
            Map.entry("convertedCprs", convertedCprs),
            // CPR TV
            Map.entry("totalCprTvs", totalCprTvs),
            Map.entry("draftCprTvs", draftCprTvs),
            Map.entry("underVerificationCprTvs", underVerificationCprTvs),
            Map.entry("completedCprTvs", completedCprTvs),
            Map.entry("approvedCprTvs", approvedCprTvs),
            Map.entry("rejectedCprTvs", rejectedCprTvs),
            // Cost Workout
            Map.entry("totalCostWorkouts", totalCostWorkouts),
            Map.entry("draftCostWorkouts", draftCostWorkouts),
            Map.entry("pendingCostWorkouts", pendingCostWorkouts),
            Map.entry("completedCostWorkouts", completedCostWorkouts),
            Map.entry("approvedCostWorkouts", approvedCostWorkouts),
            Map.entry("rejectedCostWorkouts", rejectedCostWorkouts),
            // Profit Workout
            Map.entry("totalProfitWorkouts", totalProfitWorkouts),
            Map.entry("draftProfitWorkouts", draftProfitWorkouts),
            Map.entry("pendingProfitWorkouts", pendingProfitWorkouts),
            Map.entry("completedProfitWorkouts", completedProfitWorkouts),
            Map.entry("approvedProfitWorkouts", approvedProfitWorkouts),
            Map.entry("rejectedProfitWorkouts", rejectedProfitWorkouts),
            // Quotation detailed
            Map.entry("approvedQuotations", approvedQuotations),
            Map.entry("rejectedQuotations", rejectedQuotations),
            Map.entry("convertedQuotations", convertedQuotations),
            // Sales Contract detailed
            Map.entry("submittedSalesContracts", submittedSalesContracts),
            Map.entry("approvedSalesContracts", approvedSalesContracts),
            Map.entry("activeSalesContracts", activeSalesContracts),
            Map.entry("completedSalesContracts", completedSalesContracts),
            Map.entry("cancelledSalesContracts", cancelledSalesContracts),
            // CPO detailed
            Map.entry("approvedSalesOrders", approvedSalesOrders),
            Map.entry("inProgressSalesOrders", inProgressSalesOrders),
            Map.entry("completedSalesOrders", completedSalesOrders),
            Map.entry("cancelledSalesOrders", cancelledSalesOrders),
            // Delivery Challan
            Map.entry("pendingDeliveryChallans", pendingDeliveryChallans),
            Map.entry("approvedDeliveryChallans", approvedDeliveryChallans),
            // Proforma Invoice
            Map.entry("pendingProformaInvoices", pendingProformaInvoices),
            Map.entry("approvedProformaInvoices", approvedProformaInvoices),
            // Invoice detailed
            Map.entry("pendingInvoices", pendingInvoices),
            Map.entry("approvedInvoices", approvedInvoices),
            Map.entry("paidInvoicesCount", paidInvoicesCount),
            // Credit Note detailed
            Map.entry("approvedCreditNotes", approvedCreditNotes),
            // Payment Receipt detailed
            Map.entry("pendingPaymentReceipts", pendingPaymentReceipts),
            Map.entry("receivedPaymentReceipts", receivedPaymentReceipts),
            Map.entry("partialPaymentReceipts", partialPaymentReceipts),
            Map.entry("cancelledPaymentReceipts", cancelledPaymentReceipts)
        );
    }
}
