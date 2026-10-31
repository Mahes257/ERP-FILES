package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.util.List;

public record MarketingDashboardResponse(
        // Offline Marketing
        OfflineMarketingKpis offlineMarketing,
        // Q Forms
        QFormKpis qForms,
        // Travel Planners
        TravelPlanKpis travelPlans,
        // Marketing Expenses
        ExpenseKpis expenses,
        // Cross-module pending actions
        List<PendingAction> pendingActions,
        // Alerts requiring attention
        List<AlertItem> alerts
) {
    public record OfflineMarketingKpis(
            long totalVisits,
            long todayVisits,
            long upcomingVisits,
            long pendingFollowUps,
            long overdueFollowUps,
            long completedVisits,
            long totalLeads,
            long handoverPending
    ) {}

    public record QFormKpis(
            long total,
            long notPrepared,
            long draft,
            long submitted
    ) {}

    public record TravelPlanKpis(
            long total,
            long pendingApproval,
            long approved,
            long active,
            long completed,
            long cancelled
    ) {}

    public record ExpenseKpis(
            long activeTrips,
            long pendingSubmission,
            long pendingApproval,
            long approved,
            long rejected,
            BigDecimal totalAmount,
            BigDecimal withBillAmount,
            BigDecimal withoutBillAmount
    ) {}

    public record PendingAction(
            String module,
            String type,
            String description,
            long count,
            String filterParam,
            String targetPage
    ) {}

    public record AlertItem(
            String module,
            String severity,
            String message,
            String targetPage,
            String filterParam
    ) {}
}
