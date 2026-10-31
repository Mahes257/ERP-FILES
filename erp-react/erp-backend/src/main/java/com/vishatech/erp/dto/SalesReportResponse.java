package com.vishatech.erp.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;
import java.util.List;

/**
 * Response of {@code GET /sales/reports} (Sales Reports page).
 *
 * <p>A typed replacement for the previous {@code Map<String, Object>} payload:
 * every section is a record, so the shape of the report is checked by the
 * compiler instead of by string keys. The JSON field names are pinned with
 * {@link JsonProperty} to the names the Sales Reports page already consumes —
 * including the report's internal {@code _module} / {@code _date} style keys and
 * the {@code kpis.moduleCounts} view the frontend derives from the flat counts.
 */
public record SalesReportResponse(
        long totalRecords,
        Kpis kpis,
        MonthlyTrend monthlyTrend,
        StatusDistribution statusDistribution,
        ModuleBreakdown moduleBreakdown,
        List<RecordRow> records) {

    /** Head-line counters for the KPI cards. */
    public record Kpis(
            long totalRecords,
            BigDecimal totalValue,
            BigDecimal avgRecordValue,
            long quotationCount,
            long contractCount,
            long cpoCount,
            long invoiceCount) {
    }

    /** Records per month for the bar chart. */
    public record MonthlyTrend(
            List<String> labels,
            List<Long> counts,
            List<MonthPoint> trend) {
    }

    public record MonthPoint(String month, long count) {
    }

    /** Status split for the doughnut chart. */
    public record StatusDistribution(
            List<String> labels,
            List<Long> counts,
            List<StatusSlice> distribution) {
    }

    public record StatusSlice(String label, long count, long percentage) {
    }

    /** Value/count per Sales module for the ranked-bar card. */
    public record ModuleBreakdown(List<ModuleTotal> breakdown) {
    }

    public record ModuleTotal(String key, String label, long count, BigDecimal amount) {
    }

    /**
     * One flattened report row (a record from any of the eight Sales modules).
     * The underscore-prefixed components are the report's own presentation
     * fields and are serialized under their historic names.
     */
    public record RecordRow(
            Long id,
            @JsonProperty("_module") String module,
            @JsonProperty("_moduleKey") String moduleKey,
            @JsonProperty("_date") String date,
            @JsonProperty("_amount") BigDecimal amount,
            @JsonProperty("_no") String docNo,
            @JsonProperty("_route") String route,
            String status,
            String clientName,
            BigDecimal grandTotal) {
    }
}
