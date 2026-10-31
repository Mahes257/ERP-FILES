package com.vishatech.erp.service;

import com.vishatech.erp.entity.PurchaseGrn;
import com.vishatech.erp.entity.PurchaseInspection;
import com.vishatech.erp.entity.PurchaseInvoice;
import com.vishatech.erp.entity.PurchaseOrder;
import com.vishatech.erp.entity.PurchaseRequisition;
import com.vishatech.erp.entity.PurchaseRfq;
import com.vishatech.erp.repository.PurchaseGrnRepository;
import com.vishatech.erp.repository.PurchaseInspectionRepository;
import com.vishatech.erp.repository.PurchaseInvoiceRepository;
import com.vishatech.erp.repository.PurchaseOrderRepository;
import com.vishatech.erp.repository.PurchaseRequisitionRepository;
import com.vishatech.erp.repository.PurchaseRfqRepository;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Purchase Work Queue service — the actionable pending-work view of the
 * entire procurement workflow, computed from REAL database records.
 *
 * Every category count is a repository COUNT/filtered query — never a
 * hardcoded zero, never a full-table scan into memory. Items are limited
 * per category (newest first) so the payload stays small.
 *
 * Category predicates mirror the frontend's shared pending-status
 * predicates (src/purchase/utils/pendingStatus.js) exactly, so a queue
 * count can never disagree with a frontend sidebar badge:
 *
 *   PR Approvals            — status "Pending Approval", active recordState
 *   RFQ Actions             — Pending Approval / Quotation Received /
 *                             Evaluation / 1st / 2nd / Final Approval
 *   PO Approvals            — status "Pending Approval" (approval gate)
 *   PO Releases             — status "Approved" (not yet released)
 *   Supplier Acks           — released stages without acknowledgedAt
 *   Pending GRNs            — status "Expected" (receipt pending)
 *   Pending Inspections     — status "Pending" (pass/fail decision)
 *   Invoice Matching        — matchStatus "Pending Match" or "Mismatch"
 *   Invoice Approvals       — status "Submitted"
 *   Payments Due            — Matched + nothing paid (overdue flagged)
 */
@Service
public class PurchaseWorkQueueService {

    /** Max actionable records returned per category (counts stay exact). */
    private static final int MAX_ITEMS_PER_CATEGORY = 50;

    private static final String PR_RECORD_ACTIVE = PurchaseRequisition.RECORD_ACTIVE;
    private static final String PR_STATUS_PENDING = "Pending Approval";

    private static final List<String> RFQ_PENDING_STATUSES = List.of(
            "Pending Approval", "Quotation Received", "Evaluation",
            "1st Approval", "2nd Approval", "Final Approval");

    private static final List<String> PO_RELEASED_STAGES = List.of(
            "Released", "Supplier Acknowledged", "In Progress", "Partially Delivered");

    private static final List<String> INVOICE_MATCH_PENDING = List.of("Pending Match", "Mismatch");

    private final PurchaseRequisitionRepository requisitions;
    private final PurchaseRfqRepository rfqs;
    private final PurchaseOrderRepository orders;
    private final PurchaseGrnRepository grns;
    private final PurchaseInspectionRepository inspections;
    private final PurchaseInvoiceRepository invoices;

    public PurchaseWorkQueueService(PurchaseRequisitionRepository requisitions,
                                    PurchaseRfqRepository rfqs,
                                    PurchaseOrderRepository orders,
                                    PurchaseGrnRepository grns,
                                    PurchaseInspectionRepository inspections,
                                    PurchaseInvoiceRepository invoices) {
        this.requisitions = requisitions;
        this.rfqs = rfqs;
        this.orders = orders;
        this.grns = grns;
        this.inspections = inspections;
        this.invoices = invoices;
    }

    /**
     * The full work queue — all 10 categories in display order with
     * exact database counts and bounded actionable items.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> workQueue() {
        List<Map<String, Object>> categories = new ArrayList<>();
        categories.add(category("pr-approvals", "PR Approvals",
                "Requisitions awaiting the approval decision",
                prApprovalItems()));
        categories.add(category("rfq-actions", "RFQ Actions",
                "Sourcing steps awaiting your input",
                rfqActionItems()));
        categories.add(category("po-approvals", "PO Approvals",
                "Purchase orders awaiting approval",
                poApprovalItems()));
        categories.add(category("po-releases", "PO Releases",
                "Approved orders not yet released to suppliers",
                poReleaseItems()));
        categories.add(category("supplier-acknowledgements", "Supplier Acknowledgements",
                "Released orders awaiting supplier confirmation",
                supplierAcknowledgementItems()));
        categories.add(category("pending-grns", "Pending GRNs",
                "Expected goods receipts awaiting receipt",
                pendingGrnItems()));
        categories.add(category("pending-inspections", "Pending Inspections",
                "Quality inspections awaiting a decision",
                pendingInspectionItems()));
        categories.add(category("invoice-matching", "Invoice Matching",
                "Invoices awaiting the three-way match",
                invoiceMatchingItems()));
        categories.add(category("invoice-approvals", "Invoice Approvals",
                "Submitted invoices awaiting approval",
                invoiceApprovalItems()));
        categories.add(category("payments-due", "Payments Due",
                "Matched invoices awaiting payment",
                paymentsDueItems()));

        long total = categories.stream()
                .mapToLong(c -> ((Number) c.get("count")).longValue())
                .sum();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("categories", categories);
        result.put("total", total);
        return result;
    }

    /** One category — same shape as the frontend WORK_QUEUE_CATEGORIES entry. */
    public Map<String, Object> category(String key, String label, String hint,
                                        List<Map<String, Object>> items) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("key", key);
        map.put("label", label);
        map.put("hint", hint);
        map.put("count", items.size() < MAX_ITEMS_PER_CATEGORY ? items.size() : countFor(key));
        map.put("items", items);
        return map;
    }

    /** Exact database count for one category key. */
    @Transactional(readOnly = true)
    public long countFor(String key) {
        return switch (key) {
            case "pr-approvals" -> requisitions.countByStatusAndRecordState(PR_STATUS_PENDING, PR_RECORD_ACTIVE);
            case "rfq-actions" -> rfqs.countByStatusIn(RFQ_PENDING_STATUSES);
            case "po-approvals" -> orders.countByStatus("Pending Approval");
            case "po-releases" -> orders.countByStatus("Approved");
            case "supplier-acknowledgements" -> orders.countPendingAcknowledgements(PO_RELEASED_STAGES);
            case "pending-grns" -> grns.countByStatus("Expected");
            case "pending-inspections" -> inspections.countByStatus("Pending");
            case "invoice-matching" -> invoices.countByMatchStatusIn(INVOICE_MATCH_PENDING);
            case "invoice-approvals" -> invoices.countByStatus("Submitted");
            case "payments-due" -> invoices.countPaymentsDue();
            default -> 0;
        };
    }

    /** Single-category queue (key + items), e.g. for drill-down pages. */
    @Transactional(readOnly = true)
    public Map<String, Object> categoryByKey(String key) {
        List<Map<String, Object>> items = switch (key) {
            case "pr-approvals" -> prApprovalItems();
            case "rfq-actions" -> rfqActionItems();
            case "po-approvals" -> poApprovalItems();
            case "po-releases" -> poReleaseItems();
            case "supplier-acknowledgements" -> supplierAcknowledgementItems();
            case "pending-grns" -> pendingGrnItems();
            case "pending-inspections" -> pendingInspectionItems();
            case "invoice-matching" -> invoiceMatchingItems();
            case "invoice-approvals" -> invoiceApprovalItems();
            case "payments-due" -> paymentsDueItems();
            default -> List.of();
        };
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("key", key);
        map.put("count", countFor(key));
        map.put("items", items);
        return map;
    }

    // ------------------------------------------------------------------
    // Item builders — bounded queries (never the whole table)
    // ------------------------------------------------------------------

    private List<Map<String, Object>> prApprovalItems() {
        List<PurchaseRequisition> rows = requisitions
                .findByStatusAndRecordStateOrderByIdDesc(
                        PR_STATUS_PENDING, PR_RECORD_ACTIVE,
                        PageRequest.of(0, MAX_ITEMS_PER_CATEGORY));
        return rows.stream().map(pr -> {
            Map<String, Object> item = base(pr.getId(), pr.getPrNo(), pr.getTitle(), pr.getVendor());
            item.put("status", pr.getStatus());
            item.put("priority", pr.getPriority());
            item.put("amount", pr.getAmount());
            item.put("date", pr.getDate());
            item.put("expectedDate", pr.getExpectedDate());
            item.put("requester", pr.getRequester());
            item.put("route", "/purchase/requisition/" + pr.getId() + "/approval");
            item.put("actionLabel", "Review & Approve");
            return item;
        }).toList();
    }

    private List<Map<String, Object>> rfqActionItems() {
        List<PurchaseRfq> rows = rfqs.findByStatusInOrderByIdDesc(
                RFQ_PENDING_STATUSES, PageRequest.of(0, MAX_ITEMS_PER_CATEGORY));
        return rows.stream().map(rfq -> {
            Map<String, Object> item = base(rfq.getId(), rfq.getRfqNo(), rfq.getTitle(), "");
            item.put("status", rfq.getStatus());
            item.put("priority", rfq.getPriority());
            item.put("amount", rfq.getEstimatedValue());
            item.put("date", rfq.getDueDate());
            item.put("dueDate", rfq.getDueDate());
            item.put("requester", rfq.getRequester());
            item.put("route", "/purchase/rfq/" + rfq.getId());
            item.put("actionLabel", actionForRfq(rfq.getStatus()));
            return item;
        }).toList();
    }

    private String actionForRfq(String status) {
        return switch (status) {
            case "Evaluation" -> "Select Supplier";
            case "Quotation Received" -> "Evaluate Quotations";
            default -> "Approve RFQ";
        };
    }

    private List<Map<String, Object>> poApprovalItems() {
        List<PurchaseOrder> rows = orders.findByStatusOrderByIdDesc(
                "Pending Approval", PageRequest.of(0, MAX_ITEMS_PER_CATEGORY));
        return rows.stream().map(po -> poItem(po, "Approve PO",
                "/purchase/orders/" + po.getId())).toList();
    }

    private List<Map<String, Object>> poReleaseItems() {
        List<PurchaseOrder> rows = orders.findByStatusOrderByIdDesc(
                "Approved", PageRequest.of(0, MAX_ITEMS_PER_CATEGORY));
        return rows.stream().map(po -> poItem(po, "Release PO",
                "/purchase/orders/" + po.getId())).toList();
    }

    private Map<String, Object> poItem(PurchaseOrder po, String action, String route) {
        Map<String, Object> item = base(po.getId(), po.getPoNo(), po.getTitle(), po.getVendor());
        item.put("status", po.getStatus());
        item.put("amount", po.getAmount());
        item.put("date", po.getOrderDate());
        item.put("expectedDate", po.getExpectedDate());
        item.put("route", route);
        item.put("actionLabel", action);
        return item;
    }

    private List<Map<String, Object>> supplierAcknowledgementItems() {
        List<PurchaseOrder> rows = orders.findPendingAcknowledgements(PO_RELEASED_STAGES,
                PageRequest.of(0, MAX_ITEMS_PER_CATEGORY));
        return rows.stream().map(po -> {
            Map<String, Object> item = poItem(po, "Record Acknowledgement",
                    "/purchase/orders/acknowledgement");
            item.put("status", "Pending Acknowledgement");
            return item;
        }).toList();
    }

    private List<Map<String, Object>> pendingGrnItems() {
        List<PurchaseGrn> rows = grns.findByStatusOrderByIdDesc(
                "Expected", PageRequest.of(0, MAX_ITEMS_PER_CATEGORY));
        return rows.stream().map(grn -> {
            Map<String, Object> item = base(grn.getId(), grn.getGrnNo(),
                    "GRN for PO " + grn.getPoNo(), grn.getSupplier());
            item.put("status", grn.getStatus());
            item.put("date", grn.getCreatedAt() == null ? null : grn.getCreatedAt().toLocalDate().toString());
            item.put("poNo", grn.getPoNo());
            item.put("route", "/purchase/logistics/grn/" + grn.getGrnNo());
            item.put("actionLabel", "Receive Goods");
            return item;
        }).toList();
    }

    private List<Map<String, Object>> pendingInspectionItems() {
        List<PurchaseInspection> rows = inspections.findByStatusOrderByIdDesc(
                "Pending", PageRequest.of(0, MAX_ITEMS_PER_CATEGORY));
        return rows.stream().map(insp -> {
            Map<String, Object> item = base(insp.getId(), insp.getInspectionNo(),
                    "Inspection for GRN " + insp.getGrnNo(), "");
            item.put("status", insp.getStatus());
            item.put("date", insp.getCreatedAt() == null ? null : insp.getCreatedAt().toLocalDate().toString());
            item.put("grnNo", insp.getGrnNo());
            item.put("route", "/purchase/logistics/quality/" + insp.getInspectionNo());
            item.put("actionLabel", "Start Inspection");
            return item;
        }).toList();
    }

    private List<Map<String, Object>> invoiceMatchingItems() {
        List<PurchaseInvoice> rows = invoices.findByMatchStatusInOrderByIdDesc(
                INVOICE_MATCH_PENDING, PageRequest.of(0, MAX_ITEMS_PER_CATEGORY));
        return rows.stream().map(inv -> {
            Map<String, Object> item = invoiceItem(inv, "Run Three-Way Match",
                    "/purchase/invoices/" + inv.getId());
            item.put("matchStatus", inv.getMatchStatus());
            return item;
        }).toList();
    }

    private List<Map<String, Object>> invoiceApprovalItems() {
        List<PurchaseInvoice> rows = invoices.findByStatusOrderByIdDesc(
                "Submitted", PageRequest.of(0, MAX_ITEMS_PER_CATEGORY));
        return rows.stream().map(inv -> invoiceItem(inv, "Approve Invoice",
                "/purchase/invoices/" + inv.getId())).toList();
    }

    private List<Map<String, Object>> paymentsDueItems() {
        List<PurchaseInvoice> rows = invoices.findPaymentsDue(
                PageRequest.of(0, MAX_ITEMS_PER_CATEGORY));
        String today = LocalDate.now().toString();
        return rows.stream().map(inv -> {
            Map<String, Object> item = invoiceItem(inv, "Record Payment",
                    "/purchase/invoices/" + inv.getId());
            item.put("dueDate", inv.getDueDate());
            boolean overdue = inv.getDueDate() != null && !inv.getDueDate().isBlank()
                    && inv.getDueDate().compareTo(today) < 0;
            item.put("overdue", overdue);
            return item;
        }).toList();
    }

    private Map<String, Object> invoiceItem(PurchaseInvoice inv, String action, String route) {
        Map<String, Object> item = base(inv.getId(), inv.getInvoiceNo(),
                "Invoice from " + inv.getVendor(), inv.getVendor());
        item.put("status", inv.getStatus());
        item.put("amount", inv.getTotal());
        item.put("paidAmount", inv.getPaidAmount());
        item.put("date", inv.getInvoiceDate());
        item.put("dueDate", inv.getDueDate());
        item.put("poNo", inv.getPoNo());
        item.put("route", route);
        item.put("actionLabel", action);
        return item;
    }

    private Map<String, Object> base(Long id, String number, String title, String vendor) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", id);
        item.put("number", number);
        item.put("title", title == null ? number : title);
        item.put("vendor", vendor == null ? "" : vendor);
        return item;
    }

}
