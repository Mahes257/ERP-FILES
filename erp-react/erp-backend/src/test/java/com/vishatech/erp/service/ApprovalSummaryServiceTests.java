package com.vishatech.erp.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.vishatech.erp.dashboard.dto.ProductionOrderCounts;
import com.vishatech.erp.dashboard.port.ProductionDashboardPort;
import java.util.Arrays;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * The shared sidebar Pending Approvals badge reads GET /approvals/summary, so
 * this pins the Production contribution of that payload:
 *
 * <ul>
 *   <li>both approval queues (Pending Production Approval / Pending Admin
 *       Approval) are included exactly once,</li>
 *   <li>normal 'Pending' work orders (released, waiting to be started) are
 *       included as pending production work,</li>
 *   <li>Draft / Completed / Cancelled / approved stages never contribute — the
 *       count is status-based, so only these three statuses are summed,</li>
 *   <li>each status keeps its own authority: the approval queues stay behind
 *       PRODUCTION_APPROVE, 'Pending' behind PRODUCTION_EDIT (the authority
 *       PENDING -> IN_PROGRESS requires in ProductionOrderController).</li>
 * </ul>
 */
class ApprovalSummaryServiceTests {

    private final CprService cprService = mock(CprService.class);
    private final CprTechnicalVerificationService cprTvService = mock(CprTechnicalVerificationService.class);
    private final CostWorkoutService costWorkoutService = mock(CostWorkoutService.class);
    private final ProfitWorkoutService profitWorkoutService = mock(ProfitWorkoutService.class);
    private final QuotationService quotationService = mock(QuotationService.class);
    private final SalesContractService salesContractService = mock(SalesContractService.class);
    private final SalesOrderService salesOrderService = mock(SalesOrderService.class);
    private final CreditNoteService creditNoteService = mock(CreditNoteService.class);
    private final ProductionDashboardPort productionPort = mock(ProductionDashboardPort.class);
    private final PurchaseRequisitionService purchaseRequisitionService = mock(PurchaseRequisitionService.class);
    private final PurchaseVendorService purchaseVendorService = mock(PurchaseVendorService.class);
    private final PurchaseRfqService purchaseRfqService = mock(PurchaseRfqService.class);
    private final PurchaseOrderService purchaseOrderService = mock(PurchaseOrderService.class);
    private final PurchaseInvoiceService purchaseInvoiceService = mock(PurchaseInvoiceService.class);

    private final ApprovalSummaryService service = new ApprovalSummaryService(
            cprService, cprTvService, costWorkoutService, profitWorkoutService,
            quotationService, salesContractService, salesOrderService,
            creditNoteService, productionPort,
            purchaseRequisitionService, purchaseVendorService, purchaseRfqService,
            purchaseOrderService, purchaseInvoiceService);

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    private void salesAreQuiet() {
        when(cprService.stats()).thenReturn(Map.of());
        when(cprTvService.stats(null)).thenReturn(Map.of());
        when(costWorkoutService.stats()).thenReturn(Map.of());
        when(profitWorkoutService.stats()).thenReturn(Map.of());
        when(quotationService.stats()).thenReturn(Map.of());
        when(salesContractService.stats()).thenReturn(Map.of());
        when(salesOrderService.stats()).thenReturn(Map.of());
        when(creditNoteService.stats()).thenReturn(Map.of());
        when(purchaseRequisitionService.stats()).thenReturn(Map.of());
        when(purchaseVendorService.stats()).thenReturn(Map.of());
        when(purchaseRfqService.stats()).thenReturn(Map.of());
        when(purchaseOrderService.stats()).thenReturn(Map.of());
        when(purchaseInvoiceService.stats()).thenReturn(Map.of());
    }

    private static void authenticate(String... authorities) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("tester", "n/a",
                        Arrays.stream(authorities).map(SimpleGrantedAuthority::new).toList()));
    }

    /** total, pendingProductionApproval, pendingAdminApproval, pending, inProgress, hold, completed, avg. */
    private ProductionOrderCounts orders() {
        // 2 + 1 approval stages, 3 normal Pending work orders — the three
        // statuses a pending Production record can occupy. Everything else
        // (draft/approved/completed/cancelled) is carried in the other fields
        // and must not leak into the badge count.
        return new ProductionOrderCounts(40, 2, 1, 3, 5, 1, 9, 55);
    }

    @Test
    void countsBothApprovalQueuesAndNormalPendingOrdersExactlyOnce() {
        salesAreQuiet();
        when(productionPort.orderCounts()).thenReturn(orders());
        authenticate("PRODUCTION_VIEW", "PRODUCTION_EDIT", "PRODUCTION_APPROVE");

        Map<String, Object> summary = service.summary();

        // 2 (production approval) + 1 (admin approval) + 3 (normal Pending).
        assertThat(summary.get("productionOrders")).isEqualTo(6L);
        assertThat(summary.get("production")).isEqualTo(6L);
    }

    /**
     * A released 'Pending' work order is started by whoever holds
     * PRODUCTION_EDIT (PENDING -> IN_PROGRESS), so that pending work is theirs
     * to action even without PRODUCTION_APPROVE — while the approval queues
     * still stay hidden from them.
     */
    @Test
    void normalPendingOrdersNeedOnlyTheStartProductionAuthority() {
        salesAreQuiet();
        when(productionPort.orderCounts()).thenReturn(orders());
        authenticate("PRODUCTION_VIEW", "PRODUCTION_EDIT");

        Map<String, Object> summary = service.summary();

        assertThat(summary.get("productionOrders")).isEqualTo(3L);
    }

    @Test
    void approvalQueuesStillRequireProductionApprove() {
        salesAreQuiet();
        when(productionPort.orderCounts()).thenReturn(orders());
        authenticate("PRODUCTION_VIEW", "PRODUCTION_APPROVE");

        Map<String, Object> summary = service.summary();

        // No PRODUCTION_EDIT: the normal Pending work orders are not this
        // user's work, so only the two approval queues count.
        assertThat(summary.get("productionOrders")).isEqualTo(3L);
    }

    @Test
    void usersWithoutAnyProductionActionAuthorityCountNothing() {
        salesAreQuiet();
        authenticate("PRODUCTION_VIEW");

        Map<String, Object> summary = service.summary();

        assertThat(summary.get("productionOrders")).isEqualTo(0L);
        verify(productionPort, never()).orderCounts();
    }

    @Test
    void globalIsTheSalesTotalPlusTheProductionTotal() {
        salesAreQuiet();
        when(salesOrderService.stats()).thenReturn(Map.of("pendingreview", 2L));
        when(quotationService.stats()).thenReturn(Map.of("pendingapproval", 1L));
        when(productionPort.orderCounts()).thenReturn(orders());
        authenticate("PRODUCTION_VIEW", "PRODUCTION_EDIT", "PRODUCTION_APPROVE");

        Map<String, Object> summary = service.summary();

        long salesExecution = (Long) summary.get("salesExecution");
        long production = (Long) summary.get("production");
        assertThat(salesExecution).isEqualTo(3L);
        assertThat(production).isEqualTo(6L);
        assertThat(summary.get("global")).isEqualTo(salesExecution + production);
    }

    // ── Purchase approval queues ─────────────────────────────────────────

    private void purchaseQueues(long prs, long vendors, long rfqs, long pos, long invoices) {
        when(purchaseRequisitionService.stats()).thenReturn(Map.of("pendingApproval", prs));
        when(purchaseVendorService.stats()).thenReturn(Map.of("pending", vendors));
        when(purchaseRfqService.stats()).thenReturn(Map.of("pendingApproval", rfqs));
        when(purchaseOrderService.stats()).thenReturn(Map.of("Pending Approval", pos));
        when(purchaseInvoiceService.stats()).thenReturn(Map.of("submitted", invoices));
    }

    /**
     * Each Purchase queue keeps the status its module's approve/reject action
     * accepts, and the parent total is their sum — a draft or an approved record
     * never counts because those statuses are not read at all.
     */
    @Test
    void purchaseQueuesAreSummedIntoTheParentTotal() {
        salesAreQuiet();
        purchaseQueues(3, 1, 2, 4, 5);
        authenticate("PURCHASE_VIEW", "PURCHASE_APPROVE");

        Map<String, Object> summary = service.summary();

        assertThat(summary.get("purchaseRequisitions")).isEqualTo(3L);
        assertThat(summary.get("purchaseVendors")).isEqualTo(1L);
        assertThat(summary.get("purchaseRfqs")).isEqualTo(2L);
        assertThat(summary.get("purchaseOrders")).isEqualTo(4L);
        assertThat(summary.get("purchaseInvoices")).isEqualTo(5L);
        assertThat(summary.get("purchase")).isEqualTo(15L);
        assertThat(summary.get("global")).isEqualTo(15L);
    }

    /** Without PURCHASE_APPROVE the user cannot action a Purchase queue, so it counts 0. */
    @Test
    void purchaseQueuesRequirePurchaseApprove() {
        salesAreQuiet();
        purchaseQueues(3, 1, 2, 4, 5);
        authenticate("PURCHASE_VIEW", "PURCHASE_EDIT");

        Map<String, Object> summary = service.summary();

        assertThat(summary.get("purchase")).isEqualTo(0L);
        verify(purchaseRequisitionService, never()).stats();
        verify(purchaseInvoiceService, never()).stats();
    }

    /** Sales and Production keep their own totals — Purchase only adds to the global one. */
    @Test
    void purchaseDoesNotDisturbTheSalesOrProductionTotals() {
        salesAreQuiet();
        when(salesOrderService.stats()).thenReturn(Map.of("pendingreview", 2L));
        when(productionPort.orderCounts()).thenReturn(orders());
        purchaseQueues(1, 0, 0, 0, 0);
        authenticate("SALES_VIEW", "PRODUCTION_VIEW", "PRODUCTION_EDIT", "PRODUCTION_APPROVE",
                "PURCHASE_VIEW", "PURCHASE_APPROVE");

        Map<String, Object> summary = service.summary();

        assertThat(summary.get("salesExecution")).isEqualTo(2L);
        assertThat(summary.get("production")).isEqualTo(6L);
        assertThat(summary.get("purchase")).isEqualTo(1L);
        assertThat(summary.get("global")).isEqualTo(9L);
    }
}
