package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Response contracts for the Marketing Dashboard analytics endpoints.
 * All values are computed from real persisted data — nothing is hardcoded.
 */
public final class MarketingDashboardAnalyticsResponse {

    private MarketingDashboardAnalyticsResponse() {
    }

    /** KPI value with prior-period comparison (integer counts). */
    public record KpiChange(long value, long previous, int changePercent) {}

    /** KPI value with prior-period comparison (money amounts). */
    public record MoneyKpi(BigDecimal value, BigDecimal previous, int changePercent) {}

    /** One point of a 7-day sparkline. */
    public record SparklinePoint(String label, long value) {}

    /** Top-level summary with the five KPI cards, each with its own 7-day sparkline. */
    public record Summary(
            KpiChange totalVisits,
            KpiChange plantsVisited,
            KpiChange qFormsFilled,
            KpiChange travelTrips,
            MoneyKpi expensesAmount,
            List<SparklinePoint> visitsSparkline,
            List<SparklinePoint> plantsSparkline,
            List<SparklinePoint> qFormsSparkline,
            List<SparklinePoint> tripsSparkline,
            List<SparklinePoint> expensesSparkline) {}

    /** One bucket of the visits trend chart. */
    public record TrendPoint(String label, long planned, long actual, long completed) {}

    /** One slice of the visit-status donut. */
    public record VisitStatusItem(String status, long count) {}

    /** One entry in the recent activities feed. */
    public record ActivityItem(
            String type,
            String title,
            String description,
            LocalDateTime timestamp,
            String targetPage,
            String filterParam) {}

    /** One row of the Top Plants table. */
    public record TopPlant(String name, long visits, long qForms, int completionPercent) {}

    /** One slice of the expenses-by-category donut. */
    public record ExpenseCategory(String category, long count, BigDecimal amount) {}

    /** Expenses breakdown with bill tracking + category slices. */
    public record ExpensesCategoryBreakdown(
            BigDecimal total,
            BigDecimal withBillAmount,
            BigDecimal withoutBillAmount,
            List<ExpenseCategory> categories) {}

    /** One row of the Active Trips table. */
    public record ActiveTrip(
            String tripNo,
            String marketer,
            String from,
            String to,
            String status,
            LocalDate startDate) {}
}