package com.vishatech.erp.service;

import com.vishatech.erp.dashboard.dto.ClientCounts;
import com.vishatech.erp.dashboard.dto.FollowUpActivity;
import com.vishatech.erp.dashboard.dto.LeadCounts;
import com.vishatech.erp.dashboard.port.CprDashboardPort;
import com.vishatech.erp.dashboard.port.CrmDashboardPort;
import com.vishatech.erp.dashboard.port.ProductionDashboardPort;
import com.vishatech.erp.repository.CreditNoteRepository;
import com.vishatech.erp.repository.DeliveryChallanRepository;
import com.vishatech.erp.repository.InvoiceRepository;
import com.vishatech.erp.repository.PaymentReceiptRepository;
import com.vishatech.erp.repository.ProformaInvoiceRepository;
import com.vishatech.erp.repository.QuotationRepository;
import com.vishatech.erp.repository.SalesContractRepository;
import com.vishatech.erp.repository.SalesOrderRepository;
import jakarta.persistence.criteria.Expression;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Read-only aggregation for the Sales Dashboard (GET /sales/dashboard).
 *
 * <p>Counts reuse the per-module {@code stats()} maps (revision-aware, matching
 * the list pages); monetary values, monthly trend, recent records, top
 * customers, recent activity and follow-up alerts are computed here from the
 * existing tables — no new tables, no schema change.
 *
 * <p><b>Query design.</b> Nothing is aggregated by loading a whole table: every
 * metric is filtered/aggregated in SQL (COUNT, SUM, or a two-column projection
 * restricted to the rows that qualify), so the cost of a dashboard read does
 * not grow with the size of the tables it reads. Three computations stay in
 * Java on purpose, because moving them into SQL would change a number the
 * dashboard already shows:
 *
 * <ul>
 *   <li>the monthly trend adds per-row rupee values
 *       ({@code BigDecimal.longValue()}), while a database SUM would round the
 *       total differently;</li>
 *   <li>the top-customer ranking groups rows the same way it always has (blank
 *       client → "—") and keeps its existing ordering;</li>
 *   <li>the recent-activity feed merges seven small per-type lists and sorts
 *       them by timestamp.</li>
 * </ul>
 *
 * "Active" status sets below exclude drafts / cancelled / rejected / expired /
 * archived / deleted rows so pipeline values reflect real in-play business.
 */
@Service
@Transactional(readOnly = true)
public class SalesDashboardService {

    private static final Set<String> QUOTATION_ACTIVE =
            Set.of("pending approval", "sent", "viewed", "accepted", "negotiation", "approved", "converted");
    private static final Set<String> CONTRACT_ACTIVE =
            Set.of("submitted", "under review", "approved", "active", "completed");
    private static final Set<String> ORDER_ACTIVE =
            Set.of("pending review", "approved", "in progress", "completed");
    private static final Set<String> INVOICE_ACTIVE =
            Set.of("issued", "sent", "partial", "paid", "overdue");
    private static final Set<String> RECEIPT_RECEIVED =
            Set.of("received", "completed");

    /** Status values that are never part of the dashboard. */
    private static final String ARCHIVED = "archived";
    private static final String DELETED = "deleted";

    /** Rows fetched per record type for the recent-activity feed. */
    private static final int ACTIVITY_PAGE_SIZE = 4;

    /** ACTIVE lead untouched for this many days is reported as stale. */
    private static final int INACTIVE_LEAD_DAYS = 30;

    private final QuotationRepository quotationRepository;
    private final SalesContractRepository salesContractRepository;
    private final SalesOrderRepository salesOrderRepository;
    private final InvoiceRepository invoiceRepository;
    private final PaymentReceiptRepository paymentReceiptRepository;
    private final ProformaInvoiceRepository proformaInvoiceRepository;
    private final DeliveryChallanRepository deliveryChallanRepository;
    private final CreditNoteRepository creditNoteRepository;

    /** The CRM, CPR and production data this dashboard needs, through their read ports. */
    private final CrmDashboardPort crm;
    private final CprDashboardPort cpr;
    private final ProductionDashboardPort production;

    private final CostWorkoutService costWorkoutService;
    private final ProfitWorkoutService profitWorkoutService;
    private final QuotationService quotationService;
    private final SalesContractService salesContractService;
    private final SalesOrderService salesOrderService;
    private final InvoiceService invoiceService;
    private final PaymentReceiptService paymentReceiptService;
    private final ProformaInvoiceService proformaInvoiceService;
    private final DeliveryChallanService deliveryChallanService;
    private final CreditNoteService creditNoteService;

    public SalesDashboardService(
            QuotationRepository quotationRepository,
            SalesContractRepository salesContractRepository,
            SalesOrderRepository salesOrderRepository,
            InvoiceRepository invoiceRepository,
            PaymentReceiptRepository paymentReceiptRepository,
            ProformaInvoiceRepository proformaInvoiceRepository,
            DeliveryChallanRepository deliveryChallanRepository,
            CreditNoteRepository creditNoteRepository,
            CrmDashboardPort crm,
            CprDashboardPort cpr,
            ProductionDashboardPort production,
            CostWorkoutService costWorkoutService,
            ProfitWorkoutService profitWorkoutService,
            QuotationService quotationService,
            SalesContractService salesContractService,
            SalesOrderService salesOrderService,
            InvoiceService invoiceService,
            PaymentReceiptService paymentReceiptService,
            ProformaInvoiceService proformaInvoiceService,
            DeliveryChallanService deliveryChallanService,
            CreditNoteService creditNoteService) {
        this.quotationRepository = quotationRepository;
        this.salesContractRepository = salesContractRepository;
        this.salesOrderRepository = salesOrderRepository;
        this.invoiceRepository = invoiceRepository;
        this.paymentReceiptRepository = paymentReceiptRepository;
        this.proformaInvoiceRepository = proformaInvoiceRepository;
        this.deliveryChallanRepository = deliveryChallanRepository;
        this.creditNoteRepository = creditNoteRepository;
        this.crm = crm;
        this.cpr = cpr;
        this.production = production;
        this.costWorkoutService = costWorkoutService;
        this.profitWorkoutService = profitWorkoutService;
        this.quotationService = quotationService;
        this.salesContractService = salesContractService;
        this.salesOrderService = salesOrderService;
        this.invoiceService = invoiceService;
        this.paymentReceiptService = paymentReceiptService;
        this.proformaInvoiceService = proformaInvoiceService;
        this.deliveryChallanService = deliveryChallanService;
        this.creditNoteService = creditNoteService;
    }

    public Map<String, Object> getSummary() {
        // One "today" for the whole payload: the dashboard is a single snapshot,
        // not a set of reads taken at slightly different instants.
        LocalDate today = LocalDate.now();

        Map<String, Object> out = new LinkedHashMap<>();

        // ---------- Counts ----------
        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("leads", leadCounts());
        counts.put("clients", clientCounts());
        counts.put("followUps", followUpCounts(today));
        counts.put("cpr", cpr.cprStats());
        counts.put("costWorkouts", costWorkoutService.stats());
        counts.put("profitWorkouts", profitWorkoutService.stats());
        counts.put("quotations", quotationService.stats());
        counts.put("contracts", salesContractService.stats());
        counts.put("cpos", salesOrderService.stats());
        counts.put("invoices", invoiceService.stats());
        counts.put("receipts", paymentReceiptService.stats());
        out.put("counts", counts);

        // ---------- Monetary values ----------
        Map<String, Object> values = valueSummary();
        out.put("values", values);

        // ---------- Sales pipeline (counts + value per stage) ----------
        out.put("pipeline", pipeline(today, values));

        // ---------- Monthly trend (last 6 months) ----------
        out.put("trend", monthlyTrend());

        // ---------- Recent lists ----------
        out.put("quotationsRecent", recentQuotations(5));
        out.put("cposRecent", recentCpos(5));

        // ---------- Recent activity feed ----------
        out.put("activities", recentActivities(15));

        // ---------- Top customers ----------
        out.put("topCustomers", topCustomers(6));

        // ---------- Attention required ----------
        out.put("alerts", alerts(today));

        return out;
    }

    // ============================== Counts ==============================

    private Map<String, Object> leadCounts() {
        LeadCounts counts = crm.leadCounts();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("total", counts.activeAndInactive());
        m.put("active", counts.active());
        m.put("new", counts.newLeads());
        m.put("contacted", counts.contacted());
        m.put("qualified", counts.qualified());
        m.put("proposal", counts.proposal());
        m.put("proposalSent", counts.proposalSent());
        m.put("negotiation", counts.negotiation());
        m.put("won", counts.won());
        m.put("lost", counts.lost());
        return m;
    }

    private Map<String, Object> clientCounts() {
        ClientCounts counts = crm.clientCounts();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("total", counts.totalCustomers());
        m.put("active", counts.clientsActive());
        return m;
    }

    /**
     * Follow-up workload, counted in the database per bucket. Mirrors the
     * original in-Java pass exactly: only open follow-ups are considered, the
     * status comparison is case-insensitive, "today" uses the follow-up date and
     * the overdue/this-week buckets use the next follow-up date.
     */
    private Map<String, Object> followUpCounts(LocalDate today) {
        FollowUpActivity activity = crm.followUpActivity(today);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("total", activity.open());
        m.put("open", activity.open());
        m.put("overdue", activity.overdue());
        m.put("today", activity.today());
        m.put("dueThisWeek", activity.dueThisWeek());
        return m;
    }

    // ============================== Values ==============================

    /**
     * Pipeline money, summed by the database over exactly the rows the old
     * in-memory pass selected (current revision, non-null total, active status).
     */
    private Map<String, Object> valueSummary() {
        BigDecimal quotationValue =
                sumOrZero(quotationRepository.sumCurrentGrandTotalByStatusIn(QUOTATION_ACTIVE));
        BigDecimal contractValue =
                sumOrZero(salesContractRepository.sumCurrentGrandTotalByStatusIn(CONTRACT_ACTIVE));
        BigDecimal cpoValue =
                sumOrZero(salesOrderRepository.sumCurrentGrandTotalByStatusIn(ORDER_ACTIVE));
        BigDecimal invoiced =
                sumOrZero(invoiceRepository.sumCurrentGrandTotalByStatusIn(INVOICE_ACTIVE));
        BigDecimal collected =
                sumOrZero(paymentReceiptRepository.sumCurrentAmountByStatusIn(RECEIPT_RECEIVED));

        BigDecimal outstanding = invoiced.subtract(collected).max(BigDecimal.ZERO);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("quotationValue", quotationValue);
        m.put("contractValue", contractValue);
        m.put("cpoValue", cpoValue);
        m.put("invoiced", invoiced);
        m.put("collected", collected);
        m.put("outstanding", outstanding);
        return m;
    }

    /** A SUM with no matching rows is NULL in SQL — the dashboard reports zero. */
    private static BigDecimal sumOrZero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    // ============================== Pipeline ==============================

    private List<Map<String, Object>> pipeline(LocalDate today, Map<String, Object> values) {
        Map<String, Object> leads = leadCounts();
        Map<String, Object> cprStats = cpr.cprStats();
        Map<String, Object> costW = costWorkoutService.stats();
        Map<String, Object> profitW = profitWorkoutService.stats();
        Map<String, Object> qtn = quotationService.stats();
        Map<String, Object> sc = salesContractService.stats();
        Map<String, Object> so = salesOrderService.stats();
        Map<String, Object> inv = invoiceService.stats();
        Map<String, Object> pr = paymentReceiptService.stats();
        Map<String, Object> pi = proformaInvoiceService.stats();
        Map<String, Object> dc = deliveryChallanService.stats();
        Map<String, Object> cn = creditNoteService.stats();
        Map<String, Object> pt = production.trackerStats();

        long clientsActive = crm.clientCounts().clientsActive();
        long followUpsOpen = num(followUpCounts(today), "total");
        long tvTotal = cpr.technicalVerificationTotal();
        long qcTotal = production.qualityTotal();
        long packingTotal = production.packingTotal();

        List<Map<String, Object>> stages = new ArrayList<>();
        stages.add(stage("leads", "Leads", num(leads, "total"), null));
        stages.add(stage("clients", "Clients", clientsActive, null));
        stages.add(stage("followups", "Follow-ups", followUpsOpen, null));
        stages.add(stage("cpr", "CPR", num(cprStats, "total"), null));
        stages.add(stage("technicalverification", "Tech. Verification", tvTotal, null));
        stages.add(stage("costworkout", "Cost Workout", num(costW, "total"), null));
        stages.add(stage("profitworkout", "Profit Workout", num(profitW, "total"), null));
        stages.add(stage("cprreports", "CPR Reports", num(cprStats, "approved") + num(cprStats, "converted"), null));
        stages.add(stage("quotation", "Quotation", num(qtn, "total"), (BigDecimal) values.get("quotationValue")));
        stages.add(stage("contract", "Contract", contractActive(sc), (BigDecimal) values.get("contractValue")));
        stages.add(stage("cpo", "CPO", orderActive(so), (BigDecimal) values.get("cpoValue")));
        stages.add(stage("productiontracker", "Production", num(pt, "total"), null));
        stages.add(stage("qc", "QC", qcTotal, null));
        stages.add(stage("packinglist", "Packing", packingTotal, null));
        stages.add(stage("proformainvoice", "Proforma Inv.", num(pi, "total"), null));
        stages.add(stage("deliverychallan", "Delivery Challan", num(dc, "total"), null));
        stages.add(stage("invoice", "Invoice", invoiceActive(inv), (BigDecimal) values.get("invoiced")));
        stages.add(stage("creditnote", "Credit Note", num(cn, "total"), null));
        stages.add(stage("payment", "Payment", receiptReceived(pr), (BigDecimal) values.get("collected")));
        return stages;
    }

    private static Map<String, Object> stage(String key, String label, long count, BigDecimal value) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("key", key);
        m.put("label", label);
        m.put("count", count);
        m.put("value", value);
        return m;
    }

    private static long contractActive(Map<String, Object> sc) {
        return num(sc, "submitted") + num(sc, "underreview") + num(sc, "approved") + num(sc, "active") + num(sc, "completed");
    }

    private static long orderActive(Map<String, Object> so) {
        return num(so, "pendingreview") + num(so, "approved") + num(so, "inprogress") + num(so, "completed");
    }

    private static long invoiceActive(Map<String, Object> inv) {
        return num(inv, "issued") + num(inv, "sent") + num(inv, "partial") + num(inv, "paid") + num(inv, "overdue");
    }

    private static long receiptReceived(Map<String, Object> pr) {
        return num(pr, "received") + num(pr, "completed");
    }

    // ============================== Monthly trend ==============================

    private Map<String, Object> monthlyTrend() {
        LocalDate today = LocalDate.now();
        List<YearMonth> months = new ArrayList<>();
        for (int i = 5; i >= 0; i--) {
            months.add(YearMonth.from(today).minusMonths(i));
        }
        DateTimeFormatter labelFmt = DateTimeFormatter.ofPattern("MMM", Locale.ENGLISH);

        long[] quotation = new long[6];
        long[] cpo = new long[6];
        long[] invoice = new long[6];
        long[] collection = new long[6];

        bucketByMonth(quotation, months,
                quotationRepository.findCurrentDatesAndTotalsByStatusIn(QUOTATION_ACTIVE));
        bucketByMonth(cpo, months,
                salesOrderRepository.findCurrentDatesAndTotalsByStatusIn(ORDER_ACTIVE));
        bucketByMonth(invoice, months,
                invoiceRepository.findCurrentDatesAndTotalsByStatusIn(INVOICE_ACTIVE));
        bucketByMonth(collection, months,
                paymentReceiptRepository.findCurrentDatesAndAmountsByStatusIn(RECEIPT_RECEIVED));

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("months", months.stream().map(ym -> ym.format(labelFmt)).toList());
        m.put("quotation", quotation);
        m.put("cpo", cpo);
        m.put("invoice", invoice);
        m.put("collection", collection);
        return m;
    }

    /**
     * Adds each (date, amount) projection row to the month bucket it falls in,
     * keeping the per-row rupee truncation the chart has always used.
     */
    private static void bucketByMonth(long[] buckets, List<YearMonth> months, List<Object[]> rows) {
        for (Object[] row : rows) {
            LocalDateTime date = (LocalDateTime) row[0];
            BigDecimal amount = (BigDecimal) row[1];
            if (date == null || amount == null) continue;
            int idx = months.indexOf(YearMonth.from(date.toLocalDate()));
            if (idx >= 0) buckets[idx] += amount.longValue();
        }
    }

    // ============================== Recent lists ==============================

    private List<Map<String, Object>> recentQuotations(int limit) {
        return quotationRepository.findDashboardRecent(PageRequest.of(0, limit)).stream()
                .map(q -> row(q.getId(), q.getQuotationNo(), q.getClientName(),
                        q.getQuotationDate() != null ? q.getQuotationDate() : q.getCreatedAt(),
                        q.getGrandTotal(), q.getStatus()))
                .toList();
    }

    private List<Map<String, Object>> recentCpos(int limit) {
        return salesOrderRepository.findDashboardRecent(PageRequest.of(0, limit)).stream()
                .map(so -> row(so.getId(), so.getSoNo(), so.getClientName(),
                        so.getOrderDate() != null ? so.getOrderDate() : so.getCreatedAt(),
                        so.getGrandTotal(), so.getStatus()))
                .toList();
    }

    private static Map<String, Object> row(Long id, String number, String client, LocalDateTime date, BigDecimal value, String status) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("number", number);
        m.put("client", client);
        m.put("date", date != null ? date.toString() : null);
        m.put("value", value);
        m.put("status", status);
        return m;
    }

    // ============================== Recent activity ==============================

    /**
     * The newest {@value #ACTIVITY_PAGE_SIZE} records of each type (fetched with a
     * bounded query), merged and trimmed to the requested size.
     */
    private List<Map<String, Object>> recentActivities(int limit) {
        List<Map<String, Object>> items = new ArrayList<>();

        PageRequest newestFirst = PageRequest.of(0, ACTIVITY_PAGE_SIZE,
                Sort.by(Sort.Direction.DESC, "createdAt"));

        crm.recentLeadActivity(ACTIVITY_PAGE_SIZE)
                .forEach(l -> items.add(activity(l.createdAt(), "Lead", "LEAD-" + l.id(),
                        l.company() != null && !l.company().isBlank() ? l.company() : l.name(),
                        l.stage() != null ? l.stage() : "",
                        "/leads/" + l.id() + "/edit")));

        cpr.recentCprActivity(ACTIVITY_PAGE_SIZE)
                .forEach(c -> items.add(activity(c.createdAt(), "CPR", c.prNo(),
                        c.clientName() != null ? c.clientName() : c.company(),
                        c.status() != null ? c.status() : "",
                        "/cprs/" + c.id() + "/edit")));

        quotationRepository.findAll(currentAndNotArchivedOrDeleted(), newestFirst)
                .getContent()
                .forEach(q -> items.add(activity(q.getCreatedAt(), "Quotation", q.getQuotationNo(), q.getClientName(),
                        q.getStatus(), "/quotations/" + q.getId() + "/view")));

        salesContractRepository.findAll(currentAndNotArchivedOrDeleted(), newestFirst)
                .getContent()
                .forEach(sc -> items.add(activity(sc.getCreatedAt(), "Sales Contract", sc.getScNo(), sc.getClientName(),
                        sc.getStatus(), "/sales-contracts/" + sc.getId())));

        salesOrderRepository.findAll(currentAndNotArchivedOrDeleted(), newestFirst)
                .getContent()
                .forEach(so -> items.add(activity(so.getCreatedAt(), "CPO", so.getSoNo(), so.getClientName(),
                        so.getStatus(), "/sales-orders/" + so.getId())));

        invoiceRepository.findAll(currentAndNotArchivedOrDeleted(), newestFirst)
                .getContent()
                .forEach(inv -> items.add(activity(inv.getCreatedAt(), "Invoice", inv.getInvoiceNo(), inv.getClientName(),
                        inv.getStatus(), "/invoices/" + inv.getId())));

        paymentReceiptRepository.findAll(currentAndNotArchivedOrDeleted(), newestFirst)
                .getContent()
                .forEach(pr -> items.add(activity(pr.getCreatedAt(), "Payment", pr.getReceiptNo(), pr.getClientName(),
                        pr.getStatus(), "/payment-receipts/" + pr.getId())));

        // Dates are stored as ISO-8601 strings (LocalDateTime.toString()) in
        // the activity maps, which sort lexicographically in chronological order.
        items.sort(Comparator.comparing((Map<String, Object> a) -> (String) a.get("date"),
                Comparator.nullsLast(Comparator.reverseOrder())));
        return items.stream().limit(limit).toList();
    }

    private static Map<String, Object> activity(LocalDateTime ts, String type, String ref, String name, String status, String route) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", type);
        m.put("ref", ref);
        m.put("name", name != null ? name : "");
        m.put("date", ts != null ? ts.toString() : null);
        m.put("status", status);
        m.put("route", route);
        return m;
    }

    // ============================== Top customers ==============================

    /**
     * Client ranking built from the same three per-row projections as before
     * (candidate rows are filtered in SQL), grouped and ordered here so the
     * blank-client label and the ranking order are unchanged.
     */
    private List<Map<String, Object>> topCustomers(int limit) {
        Map<String, Map<String, Object>> byClient = new HashMap<>();

        for (Object[] r : salesOrderRepository.findCurrentClientAndTotalsByStatusIn(ORDER_ACTIVE)) {
            BigDecimal value = (BigDecimal) r[1];
            if (value == null) continue;
            Map<String, Object> acc = byClient.computeIfAbsent(blankToDash((String) r[0]),
                    SalesDashboardService::newAcc);
            acc.put("orders", (Long) acc.get("orders") + 1);
            acc.put("orderValue", ((BigDecimal) acc.get("orderValue")).add(value));
        }
        for (Object[] r : invoiceRepository.findCurrentClientAndTotalsByStatusIn(INVOICE_ACTIVE)) {
            BigDecimal value = (BigDecimal) r[1];
            if (value == null) continue;
            Map<String, Object> acc = byClient.computeIfAbsent(blankToDash((String) r[0]),
                    SalesDashboardService::newAcc);
            acc.put("invoiceValue", ((BigDecimal) acc.get("invoiceValue")).add(value));
        }
        for (Object[] r : paymentReceiptRepository.findCurrentClientAndAmountsByStatusIn(RECEIPT_RECEIVED)) {
            BigDecimal value = (BigDecimal) r[1];
            if (value == null) continue;
            Map<String, Object> acc = byClient.computeIfAbsent(blankToDash((String) r[0]),
                    SalesDashboardService::newAcc);
            acc.put("payment", ((BigDecimal) acc.get("payment")).add(value));
        }

        return byClient.values().stream()
                .sorted(Comparator.comparing((Map<String, Object> a) -> (BigDecimal) a.get("orderValue")).reversed())
                .limit(limit)
                .map(a -> {
                    BigDecimal invoiceValue = (BigDecimal) a.get("invoiceValue");
                    BigDecimal payment = (BigDecimal) a.get("payment");
                    a.put("outstanding", invoiceValue.subtract(payment).max(BigDecimal.ZERO));
                    return a;
                })
                .toList();
    }

    private static Map<String, Object> newAcc(String name) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", name);
        m.put("orders", 0L);
        m.put("orderValue", BigDecimal.ZERO);
        m.put("invoiceValue", BigDecimal.ZERO);
        m.put("payment", BigDecimal.ZERO);
        return m;
    }

    // ============================== Alerts ==============================

    private Map<String, Object> alerts(LocalDate today) {
        Map<String, Object> followUps = followUpCounts(today);
        LocalDateTime cutoff = LocalDateTime.now().minusDays(INACTIVE_LEAD_DAYS);
        long inactiveLeads = crm.inactiveActiveLeads(cutoff);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("overdueFollowups", followUps.get("overdue"));
        m.put("todayFollowups", followUps.get("today"));
        m.put("dueThisWeek", followUps.get("dueThisWeek"));
        m.put("inactiveLeads", inactiveLeads);
        return m;
    }

    // ============================== Shared predicates ==============================

    /**
     * Newest revision of a document chain that is neither archived nor deleted —
     * the filter the dashboard's recent lists and activity feed use. The status
     * is compared on its lower-case/trimmed value, the same normalisation the
     * service has always applied in Java.
     */
    private static <T> Specification<T> currentAndNotArchivedOrDeleted() {
        return (root, query, cb) -> {
            Expression<String> status = cb.lower(cb.trim(root.<String>get("status")));
            return cb.and(
                    cb.isTrue(root.<Boolean>get("latestRevision")),
                    cb.or(cb.isNull(status), cb.not(status.in(ARCHIVED, DELETED))));
        };
    }

    // ============================== Helpers ==============================

    private static String blankToDash(String s) {
        return s == null || s.isBlank() ? "—" : s;
    }

    private static long num(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v instanceof Number ? ((Number) v).longValue() : 0L;
    }
}
