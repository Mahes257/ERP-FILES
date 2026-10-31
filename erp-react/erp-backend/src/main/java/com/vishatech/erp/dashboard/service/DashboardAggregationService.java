package com.vishatech.erp.dashboard.service;

import com.vishatech.erp.dashboard.dto.ApprovalCounts;
import com.vishatech.erp.dashboard.dto.ClientCounts;
import com.vishatech.erp.dashboard.dto.CprCounts;
import com.vishatech.erp.dashboard.dto.CprVerificationCounts;
import com.vishatech.erp.dashboard.dto.DispatchCounts;
import com.vishatech.erp.dashboard.dto.FollowUpCounts;
import com.vishatech.erp.dashboard.dto.LeadCounts;
import com.vishatech.erp.dashboard.dto.PackingCounts;
import com.vishatech.erp.dashboard.dto.ProductionOrderCounts;
import com.vishatech.erp.dashboard.dto.QualityCounts;
import com.vishatech.erp.dashboard.dto.SalesCounts;
import com.vishatech.erp.dashboard.dto.ShopFloorCounts;
import com.vishatech.erp.dashboard.port.CprDashboardPort;
import com.vishatech.erp.dashboard.port.CrmDashboardPort;
import com.vishatech.erp.dashboard.port.ProductionDashboardPort;
import com.vishatech.erp.dashboard.port.SalesDashboardPort;
import com.vishatech.erp.dashboard.dto.DashboardStats;
import com.vishatech.erp.service.CostWorkoutService;
import com.vishatech.erp.service.ProfitWorkoutService;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Aggregation for {@code GET /dashboard/stats}: the ERP dashboard's own
 * presentation logic, separated from every business module.
 *
 * <p><b>What it does.</b> It reads the five module-owned ports once each and
 * assembles the complete response map — the {@link DashboardStats} document plus
 * the 61 workflow keys the controller used to add inline. Only dashboard
 * concerns live here: key names, the placeholders the page still expects, the
 * two additions the payload has always performed ("pending production approval"
 * as the sum of both approval states, and the stale-lead/bookkeeping zeros).
 *
 * <p><b>What it does not do.</b> No SQL, no entity, no repository, no
 * transaction of its own, and no dependency on another module's internals: every
 * value arrives through a port as a dashboard-owned record. That is what makes
 * this class testable without a database.
 *
 * <p><b>Contract preserved.</b> The response keeps all 145 keys with the same
 * values, including the quirks: {@code pendingDeliveries} carries the
 * delivery-challan total, {@code clientsTotal} is the customer count with the
 * deleted rows removed, both lead keys report the same active-lead count, and
 * the fields this dashboard has always published as literal zero stay zero.
 */
@Service
public class DashboardAggregationService {

    /**
     * Shop-floor categories the payload renders. The key drives the port and the
     * first half of every payload key ({@code castingTotal}, {@code castingPending}
     * …); the label is only used in comments and logs.
     */
    private static final Map<String, String> SHOP_FLOOR_TYPES = new LinkedHashMap<>();

    static {
        SHOP_FLOOR_TYPES.put("casting", "Casting");
        SHOP_FLOOR_TYPES.put("fabrication", "Fabrication");
        SHOP_FLOOR_TYPES.put("assembly", "Assembly");
    }

    /** Fields the dashboard still publishes as literal zero, as it always has. */
    private static final List<String> ZERO_PLACEHOLDER_KEYS = List.of(
            "totalExpenses", "netProfit", "cashBalance", "totalVendors",
            "purchaseOrders", "pendingReceipts", "pendingPayments",
            "openFollowups", "overdueFollowups", "totalFollowups",
            "totalCprTvs", "draftCprTvs", "underVerificationCprTvs",
            "completedCprTvs", "approvedCprTvs", "rejectedCprTvs");

    private final SalesDashboardPort sales;
    private final CrmDashboardPort crm;
    private final CprDashboardPort cpr;
    private final ProductionDashboardPort production;
    private final CostWorkoutService costWorkoutService;
    private final ProfitWorkoutService profitWorkoutService;

    public DashboardAggregationService(SalesDashboardPort sales,
                                       CrmDashboardPort crm,
                                       CprDashboardPort cpr,
                                       ProductionDashboardPort production,
                                       CostWorkoutService costWorkoutService,
                                       ProfitWorkoutService profitWorkoutService) {
        this.sales = sales;
        this.crm = crm;
        this.cpr = cpr;
        this.production = production;
        this.costWorkoutService = costWorkoutService;
        this.profitWorkoutService = profitWorkoutService;
    }

    /**
     * The complete {@code GET /dashboard/stats} payload, in the same order as
     * before: the {@link DashboardStats} document first, then the workflow keys.
     */
    public Map<String, Object> dashboardPayload() {
        LocalDate today = LocalDate.now();

        // One read per port: the values are shared between the document and the
        // workflow keys instead of being counted twice.
        SalesCounts salesCounts = sales.counts();
        ClientCounts clients = crm.clientCounts();
        FollowUpCounts followUps = crm.followUpCounts(today);
        LeadCounts leads = crm.leadCounts();
        CprCounts cprCounts = cpr.cprCounts();
        CprVerificationCounts cprVerification = cpr.technicalVerificationCounts();
        ProductionOrderCounts orders = production.orderCounts();
        QualityCounts quality = production.qualityCounts();
        ApprovalCounts verification = production.verificationCounts();
        ApprovalCounts drawings = production.drawingCounts();
        ApprovalCounts models = production.modelCounts();
        PackingCounts packing = production.packingCounts();
        DispatchCounts dispatch = production.dispatchCounts();
        Map<String, Object> costWorkouts = costWorkoutService.stats();
        Map<String, Object> profitWorkouts = profitWorkoutService.stats();

        Map<String, Object> map = new LinkedHashMap<>(stats(
                salesCounts, clients, leads, cprCounts, costWorkouts, profitWorkouts).toMap());

        // ---- Clients (CRM customers) ----
        map.put("clientsTotal", clients.clientsTotal());
        map.put("clientsActive", clients.clientsActive());

        // ---- Follow-ups (CRM followups table) ----
        map.put("followupTotal", followUps.total());
        map.put("followupOpen", followUps.open());
        map.put("followupCompleted", followUps.completed());
        map.put("followupRescheduled", followUps.rescheduled());
        map.put("followupOverdue", followUps.overdue());

        // ---- CPR Technical Verification ----
        map.put("cprTvTotal", cprVerification.total());
        map.put("cprTvDraft", cprVerification.draft());
        map.put("cprTvUnderVerification", cprVerification.underVerification());
        map.put("cprTvVerified", cprVerification.verified());
        map.put("cprTvRejected", cprVerification.rejected());

        // ---- Production (production_orders table) ----
        map.put("productionTotalOrders", orders.total());
        map.put("productionPendingApproval",
                orders.pendingProductionApproval() + orders.pendingAdminApproval());
        map.put("productionInProgress", orders.inProgress());
        map.put("productionOnHold", orders.hold());
        map.put("productionCompleted", orders.completed());
        map.put("productionAverageProgress", orders.averageProgress());

        // ---- QC (quality inspections) ----
        map.put("qcTotal", quality.total());
        map.put("qcPending", quality.pending());
        map.put("qcInProgress", quality.inProgress());
        map.put("qcPassed", quality.passed());
        map.put("qcFailed", quality.failed());
        map.put("qcHold", quality.hold());

        // ---- Technical Verification (production module) ----
        map.put("productionTvTotal", verification.total());
        map.put("productionTvPending", verification.pending());
        map.put("productionTvVerified", verification.verified());
        map.put("productionTvRejected", verification.rejected());

        // ---- Drawings ----
        map.put("productionDrawingTotal", drawings.total());
        map.put("productionDrawingPending", drawings.pending());
        map.put("productionDrawingVerified", drawings.verified());
        map.put("productionDrawingRejected", drawings.rejected());

        // ---- Models ----
        map.put("productionModelTotal", models.total());
        map.put("productionModelPending", models.pending());
        map.put("productionModelVerified", models.verified());
        map.put("productionModelRejected", models.rejected());

        // ---- Shop-floor jobs (Casting / Fabrication / Assembly entries) ----
        for (Map.Entry<String, String> type : SHOP_FLOOR_TYPES.entrySet()) {
            putEntryStats(map, type.getKey(), production.shopFloorCounts(type.getKey()));
        }

        // ---- Packing ----
        map.put("packingTotal", packing.total());
        map.put("packingPending", packing.pending());
        map.put("packingInProgress", packing.inProgress());
        map.put("packingCompleted", packing.completed());
        map.put("packingReadyForDispatch", packing.readyForDispatch());

        // ---- Dispatch ----
        map.put("dispatchTotal", dispatch.total());
        map.put("dispatchReady", dispatch.ready());
        map.put("dispatchDispatched", dispatch.dispatched());
        map.put("dispatchInTransit", dispatch.inTransit());
        map.put("dispatchDelivered", dispatch.delivered());

        return map;
    }

    /** Counts of shop-floor jobs for one production type. */
    private static void putEntryStats(Map<String, Object> map, String prefix, ShopFloorCounts counts) {
        map.put(prefix + "Total", counts.total());
        map.put(prefix + "Pending", counts.pending());
        map.put(prefix + "InProgress", counts.inProgress());
        map.put(prefix + "Hold", counts.hold());
        map.put(prefix + "Completed", counts.completed());
    }

    /**
     * The dashboard's headline document. The values the aggregation has always
     * published as zero (finance, vendor, purchase, the follow-up summary and the
     * CPR technical-verification block inside the document) are still zero: they
     * are part of the response the page renders, and changing them would change
     * a business number.
     */
    private static DashboardStats stats(SalesCounts sales,
                                       ClientCounts clients,
                                       LeadCounts leads,
                                       CprCounts cpr,
                                       Map<String, Object> costWorkouts,
                                       Map<String, Object> profitWorkouts) {
        return new DashboardStats(
                0, 0, 0,
                clients.totalCustomers(), 0,
                leads.active(), sales.totalSalesOrders(), 0,
                sales.totalDeliveryChallans(), 0, 0,
                cpr.pendingApproval(), sales.totalQuotations(), sales.totalSalesContracts(),
                sales.totalProformaInvoices(), sales.totalInvoices(), sales.totalPaymentReceipts(),
                sales.totalCreditNotes(), sales.totalDeliveryChallans(),
                sales.draftQuotations(), sales.pendingApprovalQuotations(),
                sales.draftSalesContracts(), sales.underReviewSalesContracts(),
                sales.draftSalesOrders(), sales.pendingReviewSalesOrders(),
                sales.draftCreditNotes(), sales.pendingApprovalCreditNotes(),
                sales.overdueInvoices(), sales.partialInvoices(), sales.paidInvoices(),
                leads.active(), leads.qualified(), leads.won(), leads.lost(),
                0, 0, 0,
                // CPR detailed
                cpr.total(), cpr.draft(), cpr.approved(), cpr.rejected(), cpr.converted(),
                // CPR TV
                0, 0, 0, 0, 0, 0,
                // Cost Workout
                num(costWorkouts, "total"), num(costWorkouts, "draft"),
                num(costWorkouts, "pendingapproval"), num(costWorkouts, "completed"),
                num(costWorkouts, "approved"), num(costWorkouts, "rejected"),
                // Profit Workout
                num(profitWorkouts, "total"), num(profitWorkouts, "draft"),
                num(profitWorkouts, "pendingapproval"), num(profitWorkouts, "completed"),
                num(profitWorkouts, "approved"), num(profitWorkouts, "rejected"),
                // Quotation detailed
                sales.approvedQuotations(), sales.rejectedQuotations(), sales.convertedQuotations(),
                // Sales Contract detailed
                sales.submittedSalesContracts(), sales.approvedSalesContracts(),
                sales.activeSalesContracts(), sales.completedSalesContracts(),
                sales.cancelledSalesContracts(),
                // CPO detailed
                sales.approvedSalesOrders(), sales.inProgressSalesOrders(),
                sales.completedSalesOrders(), sales.cancelledSalesOrders(),
                // Delivery Challan
                sales.pendingApprovalDeliveryChallans(), sales.approvedDeliveryChallans(),
                // Proforma Invoice
                sales.pendingApprovalProformaInvoices(), sales.approvedProformaInvoices(),
                // Invoice detailed
                sales.pendingApprovalInvoices(), sales.approvedInvoices(), sales.paidInvoices(),
                // Credit Note detailed
                sales.approvedCreditNotes(),
                // Payment Receipt detailed
                sales.pendingApprovalPaymentReceipts(), sales.receivedPaymentReceipts(),
                sales.partialPaymentReceipts(), sales.cancelledPaymentReceipts());
    }

    /**
     * The keys this dashboard publishes as literal zero. Kept as a named list so
     * the unit test can assert the placeholders explicitly.
     */
    public static List<String> zeroPlaceholderKeys() {
        return ZERO_PLACEHOLDER_KEYS;
    }

    /** Safe long extraction from a stats document (missing or odd keys are zero). */
    private static long num(Map<String, Object> stats, String key) {
        Object value = stats.get(key);
        return value instanceof Number ? ((Number) value).longValue() : 0L;
    }
}
