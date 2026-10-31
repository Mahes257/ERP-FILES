package com.vishatech.erp.service;

import com.vishatech.erp.dto.SalesReportResponse;
import com.vishatech.erp.dto.SalesReportRow;
import com.vishatech.erp.repository.CreditNoteRepository;
import com.vishatech.erp.repository.DeliveryChallanRepository;
import com.vishatech.erp.repository.InvoiceRepository;
import com.vishatech.erp.repository.PaymentReceiptRepository;
import com.vishatech.erp.repository.ProformaInvoiceRepository;
import com.vishatech.erp.repository.QuotationRepository;
import com.vishatech.erp.repository.SalesContractRepository;
import com.vishatech.erp.repository.SalesOrderRepository;
import com.vishatech.erp.crm.entity.Customer;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read-only aggregation service for the Sales Reports page
 * ({@code GET /sales/reports}).
 *
 * <p>Every filter the page can send — date range, status, module and client —
 * is pushed into SQL by the eight module queries
 * ({@code *Repository.findReportRows}), which return the typed projection
 * {@link SalesReportRow} instead of hydrating full entity graphs. The service
 * then builds the typed {@link SalesReportResponse} (KPIs, monthly trend,
 * status distribution, module breakdown and the flat record list) from those
 * rows, preserving the calculations and response shape the page already uses.
 */
@Service
@Transactional(readOnly = true)
public class SalesReportService {

    /** Report modules, in the order the flat record list is assembled. */
    private record ReportModule(String key, String label, String route) {
    }

    private static final List<ReportModule> REPORT_MODULES = List.of(
            new ReportModule("quotations", "Quotations", "/quotations"),
            new ReportModule("salesContracts", "Sales Contracts", "/sales-contracts"),
            new ReportModule("salesOrders", "Customer Purchase Orders", "/sales-orders"),
            new ReportModule("proformaInvoices", "Proforma Invoices", "/proforma-invoices"),
            new ReportModule("deliveryChallans", "Delivery Challans", "/delivery-challans"),
            new ReportModule("invoices", "Invoices", "/invoices"),
            new ReportModule("creditNotes", "Credit Notes", "/credit-notes"),
            new ReportModule("paymentReceipts", "Payment Receipts", "/payment-receipts"));

    private final QuotationRepository quotationRepository;
    private final SalesContractRepository salesContractRepository;
    private final SalesOrderRepository salesOrderRepository;
    private final ProformaInvoiceRepository proformaInvoiceRepository;
    private final DeliveryChallanRepository deliveryChallanRepository;
    private final InvoiceRepository invoiceRepository;
    private final CreditNoteRepository creditNoteRepository;
    private final PaymentReceiptRepository paymentReceiptRepository;

    public SalesReportService(
            QuotationRepository quotationRepository,
            SalesContractRepository salesContractRepository,
            SalesOrderRepository salesOrderRepository,
            ProformaInvoiceRepository proformaInvoiceRepository,
            DeliveryChallanRepository deliveryChallanRepository,
            InvoiceRepository invoiceRepository,
            CreditNoteRepository creditNoteRepository,
            PaymentReceiptRepository paymentReceiptRepository) {
        this.quotationRepository = quotationRepository;
        this.salesContractRepository = salesContractRepository;
        this.salesOrderRepository = salesOrderRepository;
        this.proformaInvoiceRepository = proformaInvoiceRepository;
        this.deliveryChallanRepository = deliveryChallanRepository;
        this.invoiceRepository = invoiceRepository;
        this.creditNoteRepository = creditNoteRepository;
        this.paymentReceiptRepository = paymentReceiptRepository;
    }

    /**
     * Build the complete sales report for the given filter parameters. Every
     * parameter is optional; an unparseable date or a blank string is treated
     * as "no filter" exactly as before.
     *
     * @param dateFrom start date (YYYY-MM-DD) or null for no lower bound
     * @param dateTo   end date (YYYY-MM-DD) or null for no upper bound
     * @param status   filter by status or null for all
     * @param module   filter by module key or null for all
     * @param client   filter by client name substring or null for all
     */
    public SalesReportResponse getReport(
            String dateFrom, String dateTo, String status,
            String module, String client) {

        LocalDate from = parseDate(dateFrom);
        LocalDate to = parseDate(dateTo);
        // Inclusive day bounds: the source dates are timestamps, so the upper
        // bound is the start of the day AFTER the requested end date.
        LocalDateTime fromTs = from != null ? from.atStartOfDay() : null;
        LocalDateTime toTs = to != null ? to.plusDays(1).atStartOfDay() : null;

        String statusFilter = blankToNull(status);
        String clientFilter = blankToNull(client);
        String moduleFilter = blankToNull(module);

        List<SalesReportResponse.RecordRow> records = new ArrayList<>();
        for (ReportModule m : REPORT_MODULES) {
            if (moduleFilter != null && !moduleFilter.equals(m.key())) {
                continue;
            }
            for (SalesReportRow row : loadRows(m.key(), statusFilter, clientFilter, fromTs, toTs)) {
                records.add(toRecordRow(m, row));
            }
        }

        return new SalesReportResponse(
                records.size(),
                kpis(records),
                monthlyTrend(records),
                statusDistribution(records),
                moduleBreakdown(records),
                records);
    }

    /** The eight module queries, dispatched by report module key. */
    private List<SalesReportRow> loadRows(
            String moduleKey, String status, String client,
            LocalDateTime fromTs, LocalDateTime toTs) {
        return switch (moduleKey) {
            case "quotations" -> quotationRepository.findReportRows(status, client, fromTs, toTs);
            case "salesContracts" -> salesContractRepository.findReportRows(status, client, fromTs, toTs);
            case "salesOrders" -> salesOrderRepository.findReportRows(status, client, fromTs, toTs);
            case "proformaInvoices" -> proformaInvoiceRepository.findReportRows(status, client, fromTs, toTs);
            case "deliveryChallans" -> deliveryChallanRepository.findReportRows(status, client, fromTs, toTs);
            case "invoices" -> invoiceRepository.findReportRows(status, client, fromTs, toTs);
            case "creditNotes" -> creditNoteRepository.findReportRows(status, client, fromTs, toTs);
            case "paymentReceipts" -> paymentReceiptRepository.findReportRows(status, client, fromTs, toTs);
            default -> List.of();
        };
    }

    /**
     * Flatten one projection row into the report's row shape. The business date
     * falls back to the creation timestamp, a missing value reports as zero and
     * a missing status/client reports as the historic defaults.
     */
    private static SalesReportResponse.RecordRow toRecordRow(ReportModule module, SalesReportRow row) {
        String date = "";
        if (row.date() != null) {
            date = row.date().toLocalDate().toString();
        } else if (row.createdAt() != null) {
            date = row.createdAt().toLocalDate().toString();
        }
        BigDecimal amount = row.amount() != null ? row.amount() : BigDecimal.ZERO;
        return new SalesReportResponse.RecordRow(
                row.id(),
                module.label(),
                module.key(),
                date,
                amount,
                row.docNo() != null ? row.docNo() : "",
                module.route(),
                row.status() != null ? row.status() : "Draft",
                row.clientName() != null ? row.clientName() : "",
                row.amount());
    }

    // ====================== KPI computation ======================

    private static SalesReportResponse.Kpis kpis(List<SalesReportResponse.RecordRow> records) {
        long totalRecords = records.size();
        BigDecimal totalValue = BigDecimal.ZERO;
        long quotationCount = 0;
        long contractCount = 0;
        long cpoCount = 0;
        long invoiceCount = 0;

        for (SalesReportResponse.RecordRow r : records) {
            if (r.amount() != null) {
                totalValue = totalValue.add(r.amount());
            }
            if (r.moduleKey() != null) {
                switch (r.moduleKey()) {
                    case "quotations" -> quotationCount++;
                    case "salesContracts" -> contractCount++;
                    case "salesOrders" -> cpoCount++;
                    case "invoices" -> invoiceCount++;
                    default -> { }
                }
            }
        }

        BigDecimal avg = totalRecords > 0
                ? totalValue.divide(BigDecimal.valueOf(totalRecords), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        return new SalesReportResponse.Kpis(
                totalRecords, totalValue, avg,
                quotationCount, contractCount, cpoCount, invoiceCount);
    }

    // ====================== Monthly trend ======================

    private static SalesReportResponse.MonthlyTrend monthlyTrend(List<SalesReportResponse.RecordRow> records) {
        Map<String, Long> monthCounts = new LinkedHashMap<>();
        for (SalesReportResponse.RecordRow r : records) {
            String date = r.date();
            if (date == null || date.length() < 7) {
                continue;
            }
            monthCounts.merge(date.substring(0, 7), 1L, Long::sum); // YYYY-MM
        }

        List<String> months = new ArrayList<>(monthCounts.keySet());
        java.util.Collections.sort(months);

        List<SalesReportResponse.MonthPoint> trend = new ArrayList<>(months.size());
        for (String month : months) {
            trend.add(new SalesReportResponse.MonthPoint(month, monthCounts.get(month)));
        }
        return new SalesReportResponse.MonthlyTrend(
                months,
                months.stream().map(monthCounts::get).toList(),
                trend);
    }

    // ====================== Status distribution ======================

    private static SalesReportResponse.StatusDistribution statusDistribution(
            List<SalesReportResponse.RecordRow> records) {
        Map<String, Long> statusCounts = new LinkedHashMap<>();
        for (SalesReportResponse.RecordRow r : records) {
            String status = r.status() == null ? "" : r.status();
            if (status.isBlank()) {
                status = "Draft";
            }
            statusCounts.merge(status, 1L, Long::sum);
        }

        long total = records.size();
        List<String> labels = new ArrayList<>(statusCounts.keySet());
        List<Long> counts = new ArrayList<>(labels.size());
        List<SalesReportResponse.StatusSlice> distribution = new ArrayList<>(labels.size());
        for (String label : labels) {
            long count = statusCounts.get(label);
            counts.add(count);
            distribution.add(new SalesReportResponse.StatusSlice(
                    label, count, total > 0 ? Math.round(count * 100.0 / total) : 0));
        }
        return new SalesReportResponse.StatusDistribution(labels, counts, distribution);
    }

    // ====================== Module breakdown ======================

    private static SalesReportResponse.ModuleBreakdown moduleBreakdown(
            List<SalesReportResponse.RecordRow> records) {
        // Amounts are accumulated as BigDecimal — a long accumulator would
        // truncate the paise (828.36 -> 828) and the module bars would then
        // disagree with the Total Value KPI built from the same rows.
        Map<String, long[]> moduleCounts = new LinkedHashMap<>();
        Map<String, BigDecimal> moduleAmounts = new LinkedHashMap<>();
        for (SalesReportResponse.RecordRow r : records) {
            String key = r.moduleKey();
            if (key == null) {
                continue;
            }
            moduleCounts.computeIfAbsent(key, k -> new long[]{0})[0]++;
            if (r.amount() != null) {
                moduleAmounts.merge(key, r.amount(), BigDecimal::add);
            }
        }

        List<SalesReportResponse.ModuleTotal> breakdown = new ArrayList<>(moduleCounts.size());
        for (Map.Entry<String, long[]> e : moduleCounts.entrySet()) {
            breakdown.add(new SalesReportResponse.ModuleTotal(
                    e.getKey(),
                    moduleLabel(e.getKey()),
                    e.getValue()[0],
                    moduleAmounts.getOrDefault(e.getKey(), BigDecimal.ZERO)));
        }
        breakdown.sort(java.util.Comparator.comparing(SalesReportResponse.ModuleTotal::amount).reversed());
        return new SalesReportResponse.ModuleBreakdown(breakdown);
    }

    // ====================== Helpers ======================

    private static String moduleLabel(String key) {
        for (ReportModule m : REPORT_MODULES) {
            if (m.key().equals(key)) {
                return m.label();
            }
        }
        return key;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static LocalDate parseDate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(value.trim());
        } catch (Exception e) {
            return null;
        }
    }
}
