package com.vishatech.erp.service;

import com.vishatech.erp.entity.PurchaseRequisition;
import com.vishatech.erp.repository.PurchaseAdjustmentNoteRepository;
import com.vishatech.erp.repository.PurchaseGrnRepository;
import com.vishatech.erp.repository.PurchaseInspectionRepository;
import com.vishatech.erp.repository.PurchaseInventoryMovementRepository;
import com.vishatech.erp.repository.PurchaseInvoiceRepository;
import com.vishatech.erp.repository.PurchaseManufacturingJobRepository;
import com.vishatech.erp.repository.PurchaseOrderRepository;
import com.vishatech.erp.repository.PurchaseRequisitionRepository;
import com.vishatech.erp.repository.PurchaseRfqRepository;
import com.vishatech.erp.repository.PurchaseShipmentRepository;
import com.vishatech.erp.repository.PurchaseVendorRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Purchase Dashboard statistics — every KPI required by the Purchase
 * frontend dashboard, computed with repository COUNT/aggregate queries
 * against real records.
 *
 * No entire table is ever loaded just to count: each metric is a
 * derived COUNT (or a COUNT over a small filtered set), so the payload
 * is O(1) per metric regardless of table size.
 */
@Service
public class PurchaseDashboardStatsService {

    private static final String PR_RECORD_ACTIVE = PurchaseRequisition.RECORD_ACTIVE;
    private static final String PR_STATUS_PENDING = "Pending Approval";

    private static final List<String> RFQ_OPEN_STATUSES = List.of(
            "Sent", "Quotation Received", "Evaluation");
    private static final List<String> RFQ_PENDING_APPROVAL_STATUSES = List.of(
            "Pending Approval", "1st Approval", "2nd Approval", "Final Approval");
    private static final List<String> RFQ_PENDING_STATUSES = List.of(
            "Pending Approval", "Quotation Received", "Evaluation",
            "1st Approval", "2nd Approval", "Final Approval");

    private static final List<String> PO_ACTIVE_STAGES = List.of(
            "Draft", "Pending Approval", "Approved", "Released",
            "Supplier Acknowledged", "In Progress", "Partially Delivered");
    private static final List<String> PO_RELEASED_STAGES = List.of(
            "Released", "Supplier Acknowledged", "In Progress", "Partially Delivered");

    private static final List<String> INVOICE_MATCH_PENDING = List.of("Pending Match", "Mismatch");

    /** PO stages reached after the release gate (one disjoint released group). */
    private static final List<String> PO_COMPLETED_STAGES = List.of("Completed", "Closed");

    /** RFQ statuses (mirrors the RFQ list's own status values). */
    private static final String RFQ_QUOTATION_RECEIVED = "Quotation Received";
    private static final String RFQ_AWARDED = "Awarded";
    private static final String RFQ_CLOSED = "Closed";
    private static final String RFQ_CANCELLED = "Cancelled";

    private final PurchaseRequisitionRepository requisitions;
    private final PurchaseRfqRepository rfqs;
    private final PurchaseOrderRepository orders;
    private final PurchaseGrnRepository grns;
    private final PurchaseInspectionRepository inspections;
    private final PurchaseInvoiceRepository invoices;
    private final PurchaseVendorRepository vendors;
    private final PurchaseManufacturingJobRepository packingJobs;
    private final PurchaseShipmentRepository shipments;
    private final PurchaseInventoryMovementRepository inventory;
    private final PurchaseAdjustmentNoteRepository adjustmentNotes;
    private final PurchaseWorkQueueService workQueueService;

    public PurchaseDashboardStatsService(PurchaseRequisitionRepository requisitions,
                                         PurchaseRfqRepository rfqs,
                                         PurchaseOrderRepository orders,
                                         PurchaseGrnRepository grns,
                                         PurchaseInspectionRepository inspections,
                                         PurchaseInvoiceRepository invoices,
                                         PurchaseVendorRepository vendors,
                                         PurchaseManufacturingJobRepository packingJobs,
                                         PurchaseShipmentRepository shipments,
                                         PurchaseInventoryMovementRepository inventory,
                                         PurchaseAdjustmentNoteRepository adjustmentNotes,
                                         PurchaseWorkQueueService workQueueService) {
        this.requisitions = requisitions;
        this.rfqs = rfqs;
        this.orders = orders;
        this.grns = grns;
        this.inspections = inspections;
        this.invoices = invoices;
        this.vendors = vendors;
        this.packingJobs = packingJobs;
        this.shipments = shipments;
        this.inventory = inventory;
        this.adjustmentNotes = adjustmentNotes;
        this.workQueueService = workQueueService;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> stats() {
        String today = LocalDate.now().toString();

        Map<String, Object> stats = new LinkedHashMap<>();

        // ---- Requisitions ----
        // Every requisition count reads ACTIVE rows only, exactly like the PR
        // list and the work queue: soft-deleted requisitions never inflate a
        // dashboard number.
        stats.put("totalPRs", requisitions.countByRecordState(PR_RECORD_ACTIVE));
        stats.put("totalRequisitions", requisitions.countByRecordState(PR_RECORD_ACTIVE));
        stats.put("pendingPRApprovals",
                requisitions.countByStatusAndRecordState(PR_STATUS_PENDING, PR_RECORD_ACTIVE));
        stats.put("draftPRs",
                requisitions.countByStatusAndRecordState("Draft", PR_RECORD_ACTIVE));
        stats.put("techSpecPRs", requisitions.countByStatusAndRecordState(
                "Technical Specification Review", PR_RECORD_ACTIVE));
        stats.put("readyForRfqPRs", requisitions.countByStatusAndRecordState(
                "Ready for RFQ", PR_RECORD_ACTIVE));
        stats.put("convertedPRs", requisitions.countByStatusAndRecordState(
                "Converted to RFQ", PR_RECORD_ACTIVE));

        // ---- RFQs ----
        stats.put("totalRFQs", rfqs.countBy());
        stats.put("openRFQs", rfqs.countByStatusIn(RFQ_OPEN_STATUSES));
        stats.put("openRfq", rfqs.countByStatusIn(RFQ_OPEN_STATUSES));
        stats.put("pendingRFQApprovals", rfqs.countByStatusIn(RFQ_PENDING_APPROVAL_STATUSES));
        // The RFQ work-queue predicate — the same list the Work Queue category uses.
        stats.put("pendingRFQActions", rfqs.countByStatusIn(RFQ_PENDING_STATUSES));
        stats.put("quotationReceivedRFQs", rfqs.countByStatusIn(List.of(RFQ_QUOTATION_RECEIVED)));
        stats.put("awardedRFQs", rfqs.countByStatusIn(List.of(RFQ_AWARDED)));
        stats.put("closedRFQs", rfqs.countByStatusIn(List.of(RFQ_CLOSED)));
        stats.put("cancelledRFQs", rfqs.countByStatusIn(List.of(RFQ_CANCELLED)));

        // ---- Purchase Orders ----
        stats.put("totalPOs", orders.countBy());
        stats.put("openPOs", orders.countByStatusIn(PO_ACTIVE_STAGES));
        stats.put("pendingPOApprovals", orders.countByStatus("Pending Approval"));
        stats.put("pendingPOReleases", orders.countByStatus("Approved"));
        stats.put("pendingAcknowledgements", orders.countPendingAcknowledgements(PO_RELEASED_STAGES));
        stats.put("draftPOs", orders.countByStatus("Draft"));
        stats.put("approvedPOs", orders.countByStatus("Approved"));
        stats.put("releasedPOs", orders.countByStatusIn(PO_RELEASED_STAGES));
        stats.put("completedPOs", orders.countByStatusIn(PO_COMPLETED_STAGES));
        stats.put("cancelledPOs", orders.countByStatus("Cancelled"));

        // ---- Logistics: packing / manufacturing jobs ----
        stats.put("totalPackingJobs", packingJobs.countBy());
        stats.put("packingInProduction", packingJobs.countByStatus("In Production"));
        stats.put("packingPacked", packingJobs.countByStatus("Packed"));
        stats.put("packingReadyToShip", packingJobs.countByStatus("Ready to Ship"));

        // ---- Logistics: shipments ----
        stats.put("totalShipments", shipments.countBy());
        stats.put("pendingShipments", shipments.countByStatus("Pending Dispatch"));
        stats.put("inTransitShipments", shipments.countByStatus("In Transit"));
        stats.put("deliveredShipments", shipments.countByStatus("Delivered"));
        stats.put("delayedShipments", shipments.countByStatus("Delayed"));

        // ---- Logistics: goods receipts ----
        stats.put("totalGRNs", grns.countBy());
        stats.put("pendingGRNs", grns.countByStatus("Expected"));
        stats.put("receivedGRNs", grns.countByStatus("Received"));
        stats.put("grnsPendingInspection", grns.countByStatus("Pending Inspection"));

        // ---- Logistics: quality inspections ----
        stats.put("totalInspections", inspections.countBy());
        stats.put("pendingInspections", inspections.countByStatus("Pending"));
        stats.put("inspectionsInProgress", inspections.countByStatus("In Progress"));
        stats.put("passedInspections", inspections.countByStatus("Passed"));
        stats.put("failedInspections", inspections.countByStatus("Failed"));
        stats.put("partiallyAcceptedInspections", inspections.countByStatus("Partially Accepted"));

        // ---- Logistics: stock movements ----
        stats.put("totalInventoryMovements", inventory.countBy());
        stats.put("inventoryReceipts", inventory.countByType("Receipt"));
        stats.put("inventoryIssues", inventory.countByType("Issue"));
        stats.put("inventoryAdjustments", inventory.countByType("Adjustment"));
        stats.put("inventoryTransfers", inventory.countByTypeAndDirection("Transfer", "Out"));

        // ---- Invoices / payments ----
        stats.put("totalPurchaseInvoices", invoices.countBy());
        stats.put("draftPurchaseInvoices", invoices.countByStatus("Draft"));
        stats.put("pendingInvoiceMatching", invoices.countByMatchStatusIn(INVOICE_MATCH_PENDING));
        stats.put("pendingMatchInvoices", invoices.countByMatchStatus("Pending Match"));
        stats.put("matchedInvoices", invoices.countByMatchStatus("Matched"));
        stats.put("partiallyMatchedInvoices", invoices.countByMatchStatus("Partially Matched"));
        stats.put("mismatchedInvoices", invoices.countByMatchStatus("Mismatch"));
        stats.put("exceptionInvoices", invoices.countByMatchStatus("Exception"));
        stats.put("pendingInvoiceApprovals", invoices.countByStatus("Submitted"));
        stats.put("approvedPurchaseInvoices", invoices.countByStatus("Approved"));
        stats.put("rejectedPurchaseInvoices", invoices.countByStatus("Rejected"));
        stats.put("partiallyPaidPurchaseInvoices", invoices.countByStatus("Partially Paid"));
        // Overdue as the invoice module reports it (due date passed + balance
        // outstanding, any status) — the same number the Vendor Payment page's
        // "Overdue" tab shows. The lifecycle status "Overdue" is only set when
        // a payment is reversed, so counting it would disagree with that page.
        stats.put("overdueInvoicesWithBalance",
                invoices.countOverdueInvoicesWithBalance(today));
        stats.put("paidPurchaseInvoices", invoices.countByStatus("Paid"));
        stats.put("paymentsDue", invoices.countPaymentsDue());
        stats.put("overduePayments", invoices.countPaymentsOverdue(today));
        stats.put("paymentAdvicesIssued", invoices.countByAdviceStatus("Issued"));
        stats.put("paymentAdvicesSent", invoices.countByAdviceStatus("Sent"));

        // ---- Adjustment notes (debit / credit notes off invoices) ----
        stats.put("totalAdjustmentNotes", adjustmentNotes.count());
        stats.put("draftAdjustmentNotes", adjustmentNotes.countByStatus("Draft"));
        stats.put("submittedAdjustmentNotes", adjustmentNotes.countByStatus("Submitted"));
        stats.put("approvedAdjustmentNotes", adjustmentNotes.countByStatus("Approved"));
        stats.put("rejectedAdjustmentNotes", adjustmentNotes.countByStatus("Rejected"));

        // ---- Vendors ----
        stats.put("totalVendors", vendors.countByRecordState("active"));
        stats.put("approvedVendors", vendors.countByRecordStateAndStatus("active", "Approved"));
        stats.put("pendingVendorApprovals", vendors.countByRecordStateAndStatus("active", "Pending Approval"));

        // ---- Work queue totals (single source of truth: the queue itself) ----
        // One queue read serves both the total and the per-category counts, so
        // the Overall Dashboard and the Purchase Work Queue page can never
        // disagree about what is pending.
        Map<String, Object> queue = workQueueService.workQueue();
        stats.put("workQueueTotal", queue.get("total"));
        stats.put("workQueueCategories", workQueueCounts(queue));

        // ---- Financial aggregates (COUNT-driven sums over DB queries) ----
        stats.put("overduePaymentsValue", overduePaymentsValue(today));

        return stats;
    }

    /**
     * The work queue's categories reduced to {key, label, count}: the Overall
     * Dashboard only needs the numbers, not each category's item list.
     */
    private static List<Map<String, Object>> workQueueCounts(Map<String, Object> queue) {
        Object raw = queue.get("categories");
        if (!(raw instanceof List<?> categories)) return List.of();
        List<Map<String, Object>> counts = new ArrayList<>(categories.size());
        for (Object entry : categories) {
            if (!(entry instanceof Map<?, ?> category)) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", category.get("key"));
            row.put("label", category.get("label"));
            row.put("count", category.get("count"));
            counts.add(row);
        }
        return counts;
    }

    /** Sum of outstanding totals on overdue invoices — computed in the DB. */
    private BigDecimal overduePaymentsValue(String today) {
        BigDecimal value = invoices.sumPaymentsOverdue(today);
        return value == null ? BigDecimal.ZERO : value;
    }
}
