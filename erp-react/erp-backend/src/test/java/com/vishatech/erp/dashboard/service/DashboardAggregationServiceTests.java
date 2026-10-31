package com.vishatech.erp.dashboard.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

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
import com.vishatech.erp.service.CostWorkoutService;
import com.vishatech.erp.service.ProfitWorkoutService;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * Unit tests for {@link DashboardAggregationService}: the aggregation is pure
 * presentation over the module ports, so it can be verified without a database
 * or a Spring context.
 *
 * <p>These tests pin what only the aggregation controls — the payload's key set,
 * the way port values are mapped onto keys, the two additions it performs and the
 * placeholder zeros — while {@code DashboardStatsApiTests} pins the same contract
 * end to end through HTTP.
 */
@ExtendWith(MockitoExtension.class)
class DashboardAggregationServiceTests {

    /** The frozen payload key set (same contract as the HTTP characterization test). */
    private static final List<String> DASHBOARD_KEYS = List.of(
            "totalExpenses", "netProfit", "cashBalance", "totalCustomers",
            "totalVendors", "activeLeads", "salesOrders", "purchaseOrders",
            "pendingDeliveries", "pendingReceipts", "pendingPayments", "pendingCprs",
            "totalQuotations", "totalSalesContracts", "totalProformaInvoices", "totalInvoices",
            "totalPaymentReceipts", "totalCreditNotes", "totalDeliveryChallans", "draftQuotations",
            "pendingQuotations", "draftSalesContracts", "pendingSalesContracts", "draftSalesOrders",
            "pendingSalesOrders", "draftCreditNotes", "pendingCreditNotes", "overdueInvoices",
            "partialInvoices", "paidInvoices", "activeLeadsCount", "qualifiedLeads",
            "wonLeads", "lostLeads", "openFollowups", "overdueFollowups",
            "totalFollowups", "totalCprs", "draftCprs", "approvedCprs",
            "rejectedCprs", "convertedCprs", "totalCprTvs", "draftCprTvs",
            "underVerificationCprTvs", "completedCprTvs", "approvedCprTvs", "rejectedCprTvs",
            "totalCostWorkouts", "draftCostWorkouts", "pendingCostWorkouts", "completedCostWorkouts",
            "approvedCostWorkouts", "rejectedCostWorkouts", "totalProfitWorkouts", "draftProfitWorkouts",
            "pendingProfitWorkouts", "completedProfitWorkouts", "approvedProfitWorkouts", "rejectedProfitWorkouts",
            "approvedQuotations", "rejectedQuotations", "convertedQuotations", "submittedSalesContracts",
            "approvedSalesContracts", "activeSalesContracts", "completedSalesContracts", "cancelledSalesContracts",
            "approvedSalesOrders", "inProgressSalesOrders", "completedSalesOrders", "cancelledSalesOrders",
            "pendingDeliveryChallans", "approvedDeliveryChallans", "pendingProformaInvoices", "approvedProformaInvoices",
            "pendingInvoices", "approvedInvoices", "paidInvoicesCount", "approvedCreditNotes",
            "pendingPaymentReceipts", "receivedPaymentReceipts", "partialPaymentReceipts", "cancelledPaymentReceipts",
            "clientsTotal", "clientsActive", "followupTotal", "followupOpen",
            "followupCompleted", "followupRescheduled", "followupOverdue", "cprTvTotal",
            "cprTvDraft", "cprTvUnderVerification", "cprTvVerified", "cprTvRejected",
            "productionTotalOrders", "productionPendingApproval", "productionInProgress", "productionOnHold",
            "productionCompleted", "productionAverageProgress", "qcTotal", "qcPending",
            "qcInProgress", "qcPassed", "qcFailed", "qcHold",
            "productionTvTotal", "productionTvPending", "productionTvVerified", "productionTvRejected",
            "productionDrawingTotal", "productionDrawingPending", "productionDrawingVerified", "productionDrawingRejected",
            "productionModelTotal", "productionModelPending", "productionModelVerified", "productionModelRejected",
            "packingTotal", "packingPending", "packingInProgress", "packingCompleted",
            "packingReadyForDispatch", "dispatchTotal", "dispatchReady", "dispatchDispatched",
            "dispatchInTransit", "dispatchDelivered", "castingTotal", "castingPending",
            "castingInProgress", "castingHold", "castingCompleted", "fabricationTotal",
            "fabricationPending", "fabricationInProgress", "fabricationHold", "fabricationCompleted",
            "assemblyTotal", "assemblyPending", "assemblyInProgress", "assemblyHold",
            "assemblyCompleted");

    @Mock
    private SalesDashboardPort sales;

    @Mock
    private CrmDashboardPort crm;

    @Mock
    private CprDashboardPort cpr;

    @Mock
    private ProductionDashboardPort production;

    @Mock
    private CostWorkoutService costWorkoutService;

    @Mock
    private ProfitWorkoutService profitWorkoutService;

    private DashboardAggregationService service;

    @BeforeEach
    void setUp() {
        service = new DashboardAggregationService(sales, crm, cpr, production,
                costWorkoutService, profitWorkoutService);
        stubPorts();
    }

    @Test
    void payloadKeepsTheFrozenKeySet() {
        Map<String, Object> payload = service.dashboardPayload();

        assertThat(payload.keySet()).containsExactlyInAnyOrderElementsOf(DASHBOARD_KEYS);
        assertThat(payload).hasSize(DASHBOARD_KEYS.size());
    }

    @Test
    void valuesAreMappedFromThePorts() {
        Map<String, Object> payload = service.dashboardPayload();

        assertThat(payload.get("clientsTotal")).isEqualTo(7L);
        assertThat(payload.get("clientsActive")).isEqualTo(6L);
        assertThat(payload.get("totalCustomers")).isEqualTo(9L);
        assertThat(payload.get("followupOverdue")).isEqualTo(2L);
        assertThat(payload.get("cprTvVerified")).isEqualTo(4L);
        assertThat(payload.get("productionAverageProgress")).isEqualTo(37);
        assertThat(payload.get("qcPassed")).isEqualTo(5L);
        assertThat(payload.get("packingReadyForDispatch")).isEqualTo(3L);
        assertThat(payload.get("dispatchInTransit")).isEqualTo(8L);
        assertThat(payload.get("totalQuotations")).isEqualTo(11L);
        assertThat(payload.get("pendingSalesContracts")).isEqualTo(13L);
        assertThat(payload.get("activeLeads")).isEqualTo(21L);
        assertThat(payload.get("totalCprs")).isEqualTo(31L);
    }

    @Test
    void placeholderZeroFieldsStayZero() {
        Map<String, Object> payload = service.dashboardPayload();

        List<Object> nonZero = new ArrayList<>();
        for (String key : DashboardAggregationService.zeroPlaceholderKeys()) {
            if (!Long.valueOf(0L).equals(payload.get(key))) {
                nonZero.add(key);
            }
        }
        assertThat(nonZero).as("these keys are literal zero in the current payload").isEmpty();
    }

    @Test
    void pendingDeliveriesMirrorsTheDeliveryChallanTotal() {
        Map<String, Object> payload = service.dashboardPayload();

        assertThat(payload.get("pendingDeliveries")).isEqualTo(payload.get("totalDeliveryChallans"));
        assertThat(payload.get("pendingDeliveries")).isEqualTo(41L);
    }

    @Test
    void pendingApprovalIsTheSumOfBothProductionApprovalStates() {
        Map<String, Object> payload = service.dashboardPayload();

        assertThat(payload.get("productionPendingApproval")).isEqualTo(3L + 4L);
    }

    @Test
    void shopFloorKeysComeFromThePerTypeCounts() {
        Map<String, Object> payload = service.dashboardPayload();

        for (String type : List.of("casting", "fabrication", "assembly")) {
            assertThat(payload.get(type + "Total")).isEqualTo(10L);
            assertThat(payload.get(type + "Pending")).isEqualTo(1L);
            assertThat(payload.get(type + "InProgress")).isEqualTo(2L);
            assertThat(payload.get(type + "Hold")).isEqualTo(3L);
            assertThat(payload.get(type + "Completed")).isEqualTo(4L);
        }
    }

    // ==================== Stubs ====================

    private void stubPorts() {
        when(sales.counts()).thenReturn(new SalesCounts(
                11, 1, 2, 3, 4, 5,
                20, 6, 13, 7, 8, 9, 10, 11,
                30, 12, 14, 13, 15, 16, 17,
                40, 18, 19, 20,
                50, 21, 22, 23, 24, 25,
                41, 26, 27,
                60, 28, 29,
                70, 30, 31, 32, 33));

        when(crm.clientCounts()).thenReturn(new ClientCounts(9, 7, 6));
        when(crm.leadCounts()).thenReturn(new LeadCounts(25, 21, 1, 2, 3, 4, 5, 6, 7, 8));
        when(crm.followUpCounts(any(LocalDate.class))).thenReturn(new FollowUpCounts(20, 13, 3, 2, 2));

        when(cpr.cprCounts()).thenReturn(new CprCounts(31, 32, 33, 34, 35, 36));
        when(cpr.technicalVerificationCounts()).thenReturn(new CprVerificationCounts(1, 2, 3, 4, 5));

        when(production.orderCounts())
                .thenReturn(new ProductionOrderCounts(100, 3, 4, 8, 5, 6, 7, 37));
        when(production.qualityCounts()).thenReturn(new QualityCounts(1, 2, 3, 5, 4, 6));
        when(production.verificationCounts()).thenReturn(new ApprovalCounts(11, 12, 13, 14));
        when(production.drawingCounts()).thenReturn(new ApprovalCounts(21, 22, 23, 24));
        when(production.modelCounts()).thenReturn(new ApprovalCounts(31, 32, 33, 34));
        when(production.shopFloorCounts(anyString())).thenReturn(new ShopFloorCounts(10, 1, 2, 3, 4));
        when(production.packingCounts()).thenReturn(new PackingCounts(51, 52, 53, 54, 3));
        when(production.dispatchCounts()).thenReturn(new DispatchCounts(71, 72, 73, 8, 74));

        when(costWorkoutService.stats()).thenReturn(Map.of(
                "total", 61L, "draft", 62L, "pendingapproval", 63L,
                "completed", 64L, "approved", 65L, "rejected", 66L));
        when(profitWorkoutService.stats()).thenReturn(Map.of(
                "total", 81L, "draft", 82L, "pendingapproval", 83L,
                "completed", 84L, "approved", 85L, "rejected", 86L));
    }
}
