package com.vishatech.erp.service;

import com.vishatech.erp.dashboard.dto.ProductionOrderCounts;
import com.vishatech.erp.dashboard.port.ProductionDashboardPort;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

/**
 * Aggregates the live pending-approval counts across every ERP module that
 * has an approval workflow. Each module reuses its existing stats() logic
 * (COUNT-based, current revisions only; the backend/database is the source of
 * truth), so these numbers always match the module KPI cards and list rows.
 *
 * "Awaiting approval" is the status the module's own approve/reject action
 * accepts — verified against each service:
 *   - CPR                          -> 'pending approval'
 *   - CPR Technical Verification   -> 'under verification'
 *   - Cost Workout                 -> 'submitted' (approve/reject only accept SUBMITTED)
 *   - Profit Workout               -> 'submitted' (approve/reject only accept SUBMITTED)
 *   - Quotation                    -> 'pending approval' / 'submitted'
 *   - Sales Contract               -> 'submitted' ("Submit for Approval") and 'under review'
 *   - Sales Order (CPO)            -> 'pending review' ("Submit for Approval")
 *   - Credit Note                  -> 'pending approval' ("Submit for Approval")
 *   - Production Order             -> 'PENDING_PRODUCTION_APPROVAL' and
 *                                     'PENDING_ADMIN_APPROVAL' (the two queues
 *                                     approve-production / approve-admin accept)
 *                                     plus the normal 'PENDING' status — an
 *                                     approved work order that is released and
 *                                     waiting to be started ("start production"
 *                                     accepts it), i.e. pending production work
 * 'completed' (work finished, not yet submitted), drafts, approved, rejected,
 * cancelled, archived and deleted are never pending. Modules without an
 * approval workflow (Leads, Clients, Follow-ups, Proforma Invoices, Delivery
 * Challans, Invoices, Payment Receipts) report 0 — no states are invented.
 * Each pending record has exactly one status and lives in exactly one module,
 * so the parent/global totals cannot double count.
 */
@Service
public class ApprovalSummaryService {

    private final CprService cprService;
    private final CprTechnicalVerificationService cprTvService;
    private final CostWorkoutService costWorkoutService;
    private final ProfitWorkoutService profitWorkoutService;
    private final QuotationService quotationService;
    private final SalesContractService salesContractService;
    private final SalesOrderService salesOrderService;
    private final CreditNoteService creditNoteService;
    /** Published production read port — this class never reads production persistence. */
    private final ProductionDashboardPort productionDashboardPort;
    /** Purchase approval queues — read through each service's own stats(), never the repositories. */
    private final PurchaseRequisitionService purchaseRequisitionService;
    private final PurchaseVendorService purchaseVendorService;
    private final PurchaseRfqService purchaseRfqService;
    private final PurchaseOrderService purchaseOrderService;
    private final PurchaseInvoiceService purchaseInvoiceService;

    public ApprovalSummaryService(CprService cprService,
                                  CprTechnicalVerificationService cprTvService,
                                  CostWorkoutService costWorkoutService,
                                  ProfitWorkoutService profitWorkoutService,
                                  QuotationService quotationService,
                                  SalesContractService salesContractService,
                                  SalesOrderService salesOrderService,
                                  CreditNoteService creditNoteService,
                                  ProductionDashboardPort productionDashboardPort,
                                  PurchaseRequisitionService purchaseRequisitionService,
                                  PurchaseVendorService purchaseVendorService,
                                  PurchaseRfqService purchaseRfqService,
                                  PurchaseOrderService purchaseOrderService,
                                  PurchaseInvoiceService purchaseInvoiceService) {
        this.cprService = cprService;
        this.cprTvService = cprTvService;
        this.costWorkoutService = costWorkoutService;
        this.profitWorkoutService = profitWorkoutService;
        this.quotationService = quotationService;
        this.salesContractService = salesContractService;
        this.salesOrderService = salesOrderService;
        this.creditNoteService = creditNoteService;
        this.productionDashboardPort = productionDashboardPort;
        this.purchaseRequisitionService = purchaseRequisitionService;
        this.purchaseVendorService = purchaseVendorService;
        this.purchaseRfqService = purchaseRfqService;
        this.purchaseOrderService = purchaseOrderService;
        this.purchaseInvoiceService = purchaseInvoiceService;
    }

    /**
     * Purchase approval queues require {@code PURCHASE_APPROVE} (ADMIN /
     * MANAGER — see RolePermissions), the same authority the approve/reject
     * endpoints are gated on. A caller who cannot act on those records gets 0,
     * so the sidebar badge never counts work they cannot do.
     */
    private static boolean canApprovePurchase() {
        return hasAuthority("PURCHASE_APPROVE");
    }

    /**
     * Production approval queues require {@code PRODUCTION_APPROVE} (ADMIN /
     * MANAGER — see RolePermissions). A caller who cannot act on those records
     * gets 0, so the badge only ever counts work the signed-in user can do.
     */
    private static boolean canApproveProduction() {
        return hasAuthority("PRODUCTION_APPROVE");
    }

    /**
     * A normal 'PENDING' production order is not an approval stage: it is
     * released work waiting to be started, which the existing transition
     * {@code PENDING -> IN_PROGRESS} exposes as {@code PRODUCTION_EDIT} (see
     * ProductionOrderController#startProduction). It is therefore gated by the
     * authority that can actually action it — USER and MANAGER/ADMIN all hold it.
     */
    private static boolean canEditProduction() {
        return hasAuthority("PRODUCTION_EDIT");
    }

    private static boolean hasAuthority(String authority) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return false;
        }
        return auth.getAuthorities().stream()
                .anyMatch(a -> authority.equals(a.getAuthority()));
    }

    /** Safe long extraction from a stats map (missing/odd keys are treated as 0). */
    private static long num(Map<String, Object> stats, String key) {
        Object value = stats.get(key);
        return value instanceof Number ? ((Number) value).longValue() : 0L;
    }

    public Map<String, Object> summary() {
        // Per-module pending counts — same semantics as each module's own
        // /stats endpoint (only CURRENT revisions count, no status aliases
        // double-counted, drafts/approved/rejected/archived/deleted excluded).
        long cpr = num(cprService.stats(), "pendingApproval");
        long cprTv = num(cprTvService.stats(null), "underVerification");
        // Cost/Profit Workout: SUBMITTED is the approval queue — the services'
        // own approve()/reject() reject any other status.
        long costWorkout = num(costWorkoutService.stats(), "submitted");
        long profitWorkout = num(profitWorkoutService.stats(), "submitted");
        Map<String, Object> quotationStats = quotationService.stats();
        long quotation = num(quotationStats, "pendingapproval") + num(quotationStats, "submitted");
        Map<String, Object> salesContractStats = salesContractService.stats();
        // Sales Contract: "Submit for Approval" stores 'submitted'; 'under
        // review' is the following awaiting-approval stage. Both are pending.
        long salesContract = num(salesContractStats, "submitted") + num(salesContractStats, "underreview");
        long salesOrder = num(salesOrderService.stats(), "pendingreview");
        long creditNote = num(creditNoteService.stats(), "pendingapproval");
        // Production Order: the two approval queues plus the normal 'PENDING'
        // work-order status. Order status is a single value, so a record sits in
        // exactly one of these statuses — the sum cannot double count. Each
        // status keeps its own authority: the approval queues need
        // PRODUCTION_APPROVE, 'PENDING' (start production) needs PRODUCTION_EDIT.
        long productionOrders = 0L;
        boolean approveProduction = canApproveProduction();
        boolean editProduction = canEditProduction();
        if (approveProduction || editProduction) {
            ProductionOrderCounts productionCounts = productionDashboardPort.orderCounts();
            if (approveProduction) {
                productionOrders += productionCounts.pendingProductionApproval()
                        + productionCounts.pendingAdminApproval();
            }
            if (editProduction) {
                productionOrders += productionCounts.pending();
            }
        }

        // Purchase: each queue's own "awaiting approval" status, read from the
        // module's stats() so the badge matches what the Purchase page shows.
        //   PR      -> 'Pending Approval'   (approve/reject only accept it)
        //   Vendor  -> 'Pending Approval'   (vendor registration approval)
        //   RFQ     -> 'Pending Approval'   (approve before sending)
        //   PO      -> 'Pending Approval'   (submit -> approve/reject)
        //   Invoice -> 'Submitted'          (approve/reject only accept it)
        // Drafts, approved, rejected, cancelled and completed records are never
        // counted, and a record lives in exactly one of these queues.
        long purchaseRequisitions = 0L;
        long purchaseVendors = 0L;
        long purchaseRfqs = 0L;
        long purchaseOrders = 0L;
        long purchaseInvoices = 0L;
        if (canApprovePurchase()) {
            purchaseRequisitions = num(purchaseRequisitionService.stats(), "pendingApproval");
            purchaseVendors = num(purchaseVendorService.stats(), "pending");
            purchaseRfqs = num(purchaseRfqService.stats(), "pendingApproval");
            purchaseOrders = num(purchaseOrderService.stats(), "Pending Approval");
            purchaseInvoices = num(purchaseInvoiceService.stats(), "submitted");
        }
        long purchase = purchaseRequisitions + purchaseVendors + purchaseRfqs + purchaseOrders
                + purchaseInvoices;

        // Parent totals derived from their child modules.
        long customerPurchaseRequest = cpr + cprTv + costWorkout + profitWorkout;
        long salesExecution = quotation + salesContract + salesOrder + creditNote;
        // Global = sum of each unique module's pending count (no record counted twice).
        long global = cpr + cprTv + costWorkout + profitWorkout + quotation + salesContract + salesOrder
                + creditNote + productionOrders + purchase;

        Map<String, Object> result = new LinkedHashMap<>();
        // Modules with an approval workflow.
        result.put("cpr", cpr);
        result.put("cprTv", cprTv);
        result.put("costWorkout", costWorkout);
        result.put("profitWorkout", profitWorkout);
        result.put("quotations", quotation);
        result.put("salesContracts", salesContract);
        result.put("salesOrders", salesOrder);
        result.put("creditNotes", creditNote);
        result.put("productionOrders", productionOrders);
        // Purchase approval queues (each gated by PURCHASE_APPROVE).
        result.put("purchaseRequisitions", purchaseRequisitions);
        result.put("purchaseVendors", purchaseVendors);
        result.put("purchaseRfqs", purchaseRfqs);
        result.put("purchaseOrders", purchaseOrders);
        result.put("purchaseInvoices", purchaseInvoices);
        // Modules without an approval workflow always report 0 (kept here so the
        // payload documents the full ERP surface; no approval states invented).
        result.put("leads", 0L);
        result.put("clients", 0L);
        result.put("followups", 0L);
        result.put("proformaInvoices", 0L);
        result.put("deliveryChallans", 0L);
        result.put("invoices", 0L);
        result.put("paymentReceipts", 0L);
        // Parent + global totals.
        result.put("customerPurchaseRequest", customerPurchaseRequest);
        result.put("salesExecution", salesExecution);
        // Production has one parent today (Production Orders: approval queues +
        // released 'PENDING' work orders); the key exists so the sidebar can
        // aggregate it like the Sales parents.
        result.put("production", productionOrders);
        // Purchase parent total — one entry for the five Purchase approval
        // queues, mirroring the Sales/Production parents the sidebar adds up.
        result.put("purchase", purchase);
        result.put("global", global);
        return result;
    }
}
