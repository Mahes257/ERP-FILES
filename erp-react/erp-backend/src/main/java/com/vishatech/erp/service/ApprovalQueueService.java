package com.vishatech.erp.service;

import com.vishatech.erp.dto.approval.PendingApprovalItem;
import com.vishatech.erp.entity.CprStatus;
import com.vishatech.erp.entity.CostWorkoutStatus;
import com.vishatech.erp.entity.ProfitWorkoutStatus;
import com.vishatech.erp.entity.TechnicalVerificationStatus;
import com.vishatech.erp.service.production.ProductionApprovalQueueReader;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Aggregated pending-approval queue behind the dedicated Pending Approvals page
 * ({@code GET /approvals/pending}).
 *
 * <p>Each module contributes only the states its own approve/reject action
 * accepts, so this list and the sidebar badge ({@link ApprovalSummaryService})
 * describe the same work:
 *
 * <ul>
 *   <li>CPR → {@code PENDING_APPROVAL}</li>
 *   <li>CPR Technical Verification → {@code UNDER_VERIFICATION}</li>
 *   <li>Cost / Profit Workout → {@code SUBMITTED}</li>
 *   <li>Quotation → 'pending approval' / 'submitted'</li>
 *   <li>Sales Contract → 'submitted' / 'under review'</li>
 *   <li>Sales Order (CPO) → 'pending review'</li>
 *   <li>Credit Note → 'pending approval'</li>
 *   <li>Purchase Requisition / Vendor / RFQ / PO → 'Pending Approval'</li>
 *   <li>Purchase Invoice → 'Submitted'</li>
 *   <li>Production Order → the two approval queues, published by the
 *       production-owned {@link ProductionApprovalQueueReader}</li>
 * </ul>
 *
 * <p>Drafts, approved, rejected, cancelled, archived, deleted, superseded
 * revisions and completed records are excluded in the queries themselves, so
 * nothing resolved can reappear. Each queue is one targeted query (no module
 * list endpoint is re-fetched and re-filtered), and Purchase / Production
 * queues keep the same authority gates the sidebar count uses — a user who
 * cannot approve those records never receives them.
 *
 * <p>Read-only: opening or listing an approval never approves or rejects it.
 */
@Service
public class ApprovalQueueService {

    private static final DateTimeFormatter ISO_LOCAL = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    private final EntityManager entityManager;
    /** Production-owned reader — this service never reads production persistence. */
    private final ProductionApprovalQueueReader productionApprovalQueue;

    public ApprovalQueueService(EntityManager entityManager,
                                ProductionApprovalQueueReader productionApprovalQueue) {
        this.entityManager = entityManager;
        this.productionApprovalQueue = productionApprovalQueue;
    }

    /**
     * Every authorized, still-actionable approval, newest submission first,
     * plus the totals the page header and the module filter tabs display.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> pending() {
        List<PendingApprovalItem> items = new ArrayList<>();
        items.addAll(customerPurchaseRequestQueue());
        items.addAll(technicalVerificationQueue());
        items.addAll(workoutQueue(
                "SELECT w.id, w.cwNo, w.customerName, w.status, w.preparedBy, w.createdAt FROM CostWorkout w"
                        + " WHERE w.latestRevision = true AND w.archivedAt IS NULL AND w.status = :status",
                CostWorkoutStatus.SUBMITTED, "costWorkout", "Cost Workout", "Cost workout",
                "/cost-workouts/", "Review cost workout"));
        items.addAll(workoutQueue(
                "SELECT w.id, w.pwNo, w.customerName, w.status, w.preparedBy, w.createdAt FROM ProfitWorkout w"
                        + " WHERE w.latestRevision = true AND w.archivedAt IS NULL AND w.status = :status",
                ProfitWorkoutStatus.SUBMITTED, "profitWorkout", "Profit Workout", "Profit workout",
                "/profit-workouts/", "Review profit workout"));
        items.addAll(quotationQueue());
        items.addAll(salesContractQueue());
        items.addAll(salesOrderQueue());
        items.addAll(creditNoteQueue());

        // Purchase approval queues — the same PURCHASE_APPROVE gate the
        // approve/reject endpoints and the sidebar count use.
        if (hasAuthority("PURCHASE_APPROVE")) {
            items.addAll(purchaseRequisitionQueue());
            items.addAll(purchaseVendorQueue());
            items.addAll(purchaseRfqQueue());
            items.addAll(purchaseOrderQueue());
            items.addAll(purchaseInvoiceQueue());
        }
        // Production approval queues — PRODUCTION_APPROVE gate.
        if (hasAuthority("PRODUCTION_APPROVE")) {
            items.addAll(productionApprovalQueue.pendingApprovalOrders());
        }

        // Newest submission first; records without a stored submission time last.
        items.sort(Comparator.comparing(PendingApprovalItem::submittedAt,
                Comparator.nullsLast(Comparator.reverseOrder())));

        Map<String, Object> byModule = new LinkedHashMap<>();
        byModule.put(PendingApprovalItem.MODULE_SALES, 0L);
        byModule.put(PendingApprovalItem.MODULE_PURCHASE, 0L);
        byModule.put(PendingApprovalItem.MODULE_PRODUCTION, 0L);
        for (PendingApprovalItem item : items) {
            byModule.merge(item.module(), 1L, (a, b) -> (Long) a + (Long) b);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("count", (long) items.size());
        result.put("byModule", byModule);
        result.put("items", items);
        return result;
    }

    // ------------------------------ Sales: CPR family

    private List<PendingApprovalItem> customerPurchaseRequestQueue() {
        List<Object[]> rows = query(
                "SELECT c.id, c.prNo, c.clientName, c.project, c.status, c.priority, c.submittedBy,"
                        + " c.requestedBy, c.submittedAt, c.createdAt FROM Cpr c"
                        + " WHERE c.latestRevision = true AND c.archivedAt IS NULL AND c.status = :status",
                Map.of("status", CprStatus.PENDING_APPROVAL));
        List<PendingApprovalItem> items = new ArrayList<>();
        for (Object[] row : rows) {
            Long id = asLong(row[0]);
            String prNo = asText(row[1]);
            String project = asText(row[3]);
            items.add(new PendingApprovalItem(
                    "sales:cpr:" + id,
                    PendingApprovalItem.MODULE_SALES,
                    "Customer Purchase Request",
                    "Purchase request " + orFallback(prNo, "#" + id) + " awaiting approval",
                    prNo,
                    asText(row[2]),
                    firstNonBlank(asText(row[6]), asText(row[7])),
                    iso(row[8] != null ? row[8] : row[9]),
                    display(row[4]),
                    display(row[5]),
                    "/cprs/" + id,
                    "Review CPR" + (project == null ? "" : " · " + project)));
        }
        return items;
    }

    private List<PendingApprovalItem> technicalVerificationQueue() {
        List<Object[]> rows = query(
                "SELECT t.id, t.tvNo, t.drawingNumber, t.status, t.forwardedBy, t.forwardedAt, t.createdBy,"
                        + " t.createdAt FROM CprTechnicalVerification t WHERE t.status = :status",
                Map.of("status", TechnicalVerificationStatus.UNDER_VERIFICATION));
        List<PendingApprovalItem> items = new ArrayList<>();
        for (Object[] row : rows) {
            Long id = asLong(row[0]);
            String tvNo = asText(row[1]);
            String drawing = asText(row[2]);
            items.add(new PendingApprovalItem(
                    "sales:cprTv:" + id,
                    PendingApprovalItem.MODULE_SALES,
                    "Technical Verification",
                    "Technical verification " + orFallback(tvNo, "#" + id) + " under verification",
                    tvNo,
                    drawing,
                    firstNonBlank(asText(row[4]), asText(row[6])),
                    iso(row[5] != null ? row[5] : row[7]),
                    display(row[3]),
                    null,
                    "/cpr/technical-verification",
                    "Review verification"));
        }
        return items;
    }

    /**
     * Cost and Profit Workouts share the same row shape (number, customer,
     * status, prepared by, created at) and the same approval stage.
     */
    private List<PendingApprovalItem> workoutQueue(String jpql,
                                                   Enum<?> status,
                                                   String idPrefix,
                                                   String area,
                                                   String titlePrefix,
                                                   String routePrefix,
                                                   String actionLabel) {
        List<Object[]> rows = query(jpql, Map.of("status", status));
        List<PendingApprovalItem> items = new ArrayList<>();
        for (Object[] row : rows) {
            Long id = asLong(row[0]);
            String number = asText(row[1]);
            items.add(new PendingApprovalItem(
                    "sales:" + idPrefix + ":" + id,
                    PendingApprovalItem.MODULE_SALES,
                    area,
                    titlePrefix + " " + orFallback(number, "#" + id) + " submitted for approval",
                    number,
                    asText(row[2]),
                    asText(row[4]),
                    iso(row[5]),
                    display(row[3]),
                    null,
                    routePrefix + id,
                    actionLabel));
        }
        return items;
    }

    private List<PendingApprovalItem> quotationQueue() {
        List<Object[]> rows = query(
                "SELECT q.id, q.quotationNo, q.clientName, q.status, q.quotationDate, q.createdAt"
                        + " FROM Quotation q WHERE q.latestRevision = true AND q.archivedAt IS NULL"
                        + " AND LOWER(q.status) IN ('pending approval', 'submitted')",
                Map.of());
        List<PendingApprovalItem> items = new ArrayList<>();
        for (Object[] row : rows) {
            Long id = asLong(row[0]);
            String quotationNo = asText(row[1]);
            items.add(new PendingApprovalItem(
                    "sales:quotation:" + id,
                    PendingApprovalItem.MODULE_SALES,
                    "Quotations",
                    "Quotation " + orFallback(quotationNo, "#" + id) + " awaiting approval",
                    quotationNo,
                    asText(row[2]),
                    null,
                    iso(row[4] != null ? row[4] : row[5]),
                    display(row[3]),
                    null,
                    "/quotations/" + id + "/view",
                    "Review quotation"));
        }
        return items;
    }

    private List<PendingApprovalItem> salesContractQueue() {
        List<Object[]> rows = query(
                "SELECT s.id, s.scNo, s.clientName, s.status, s.salesExecutive, s.contractDate, s.createdAt"
                        + " FROM SalesContract s WHERE s.latestRevision = true AND s.archivedAt IS NULL"
                        + " AND LOWER(s.status) IN ('submitted', 'under review')",
                Map.of());
        List<PendingApprovalItem> items = new ArrayList<>();
        for (Object[] row : rows) {
            Long id = asLong(row[0]);
            String scNo = asText(row[1]);
            items.add(new PendingApprovalItem(
                    "sales:salesContract:" + id,
                    PendingApprovalItem.MODULE_SALES,
                    "Sales Contracts",
                    "Sales contract " + orFallback(scNo, "#" + id) + " awaiting approval",
                    scNo,
                    asText(row[2]),
                    asText(row[4]),
                    iso(row[5] != null ? row[5] : row[6]),
                    display(row[3]),
                    null,
                    "/sales-contracts/" + id,
                    "Review contract"));
        }
        return items;
    }

    private List<PendingApprovalItem> salesOrderQueue() {
        List<Object[]> rows = query(
                "SELECT o.id, o.soNo, o.clientName, o.status, o.salesExecutive, o.assignedTo, o.priority,"
                        + " o.orderDate, o.createdAt FROM SalesOrder o WHERE o.latestRevision = true"
                        + " AND o.archivedAt IS NULL AND LOWER(o.status) = 'pending review'",
                Map.of());
        List<PendingApprovalItem> items = new ArrayList<>();
        for (Object[] row : rows) {
            Long id = asLong(row[0]);
            String soNo = asText(row[1]);
            items.add(new PendingApprovalItem(
                    "sales:salesOrder:" + id,
                    PendingApprovalItem.MODULE_SALES,
                    "Customer Purchase Orders",
                    "Customer purchase order " + orFallback(soNo, "#" + id) + " pending approval",
                    soNo,
                    asText(row[2]),
                    firstNonBlank(asText(row[4]), asText(row[5])),
                    iso(row[7] != null ? row[7] : row[8]),
                    display(row[3]),
                    display(row[6]),
                    "/sales-orders/" + id,
                    "Review CPO"));
        }
        return items;
    }

    private List<PendingApprovalItem> creditNoteQueue() {
        List<Object[]> rows = query(
                "SELECT n.id, n.cnNo, n.clientName, n.status, n.cnDate, n.createdAt FROM CreditNote n"
                        + " WHERE n.latestRevision = true AND n.archivedAt IS NULL"
                        + " AND LOWER(n.status) = 'pending approval'",
                Map.of());
        List<PendingApprovalItem> items = new ArrayList<>();
        for (Object[] row : rows) {
            Long id = asLong(row[0]);
            String cnNo = asText(row[1]);
            items.add(new PendingApprovalItem(
                    "sales:creditNote:" + id,
                    PendingApprovalItem.MODULE_SALES,
                    "Credit Notes",
                    "Credit note " + orFallback(cnNo, "#" + id) + " awaiting approval",
                    cnNo,
                    asText(row[2]),
                    null,
                    iso(row[4] != null ? row[4] : row[5]),
                    display(row[3]),
                    null,
                    "/credit-notes/" + id,
                    "Review credit note"));
        }
        return items;
    }

    // ------------------------------ Purchase

    private List<PendingApprovalItem> purchaseRequisitionQueue() {
        List<Object[]> rows = query(
                "SELECT r.id, r.prNo, r.department, r.status, r.priority, r.createdBy, r.createdAt"
                        + " FROM PurchaseRequisition r WHERE r.recordState = 'active'"
                        + " AND LOWER(r.status) = 'pending approval'",
                Map.of());
        List<PendingApprovalItem> items = new ArrayList<>();
        for (Object[] row : rows) {
            Long id = asLong(row[0]);
            String prNo = asText(row[1]);
            items.add(new PendingApprovalItem(
                    "purchase:requisition:" + id,
                    PendingApprovalItem.MODULE_PURCHASE,
                    "Purchase Requisition",
                    "Purchase requisition " + orFallback(prNo, "#" + id) + " awaiting approval",
                    prNo,
                    asText(row[2]),
                    asText(row[5]),
                    iso(row[6]),
                    display(row[3]),
                    display(row[4]),
                    "/purchase/requisition/" + id + "/approval",
                    "Review requisition"));
        }
        return items;
    }

    private List<PendingApprovalItem> purchaseVendorQueue() {
        List<Object[]> rows = query(
                "SELECT v.id, v.name, v.status, v.createdAt FROM PurchaseVendor v"
                        + " WHERE v.recordState = 'active' AND LOWER(v.status) = 'pending approval'",
                Map.of());
        List<PendingApprovalItem> items = new ArrayList<>();
        for (Object[] row : rows) {
            Long id = asLong(row[0]);
            String name = asText(row[1]);
            items.add(new PendingApprovalItem(
                    "purchase:vendor:" + id,
                    PendingApprovalItem.MODULE_PURCHASE,
                    "Vendor Management",
                    "Vendor " + orFallback(name, "#" + id) + " awaiting registration approval",
                    name,
                    name,
                    null,
                    iso(row[3]),
                    display(row[2]),
                    null,
                    "/purchase/vendors/" + id + "/approval",
                    "Review vendor"));
        }
        return items;
    }

    private List<PendingApprovalItem> purchaseRfqQueue() {
        List<Object[]> rows = query(
                "SELECT f.id, f.rfqNo, f.status, f.priority, f.createdAt FROM PurchaseRfq f"
                        + " WHERE LOWER(f.status) = 'pending approval'",
                Map.of());
        List<PendingApprovalItem> items = new ArrayList<>();
        for (Object[] row : rows) {
            Long id = asLong(row[0]);
            String rfqNo = asText(row[1]);
            items.add(new PendingApprovalItem(
                    "purchase:rfq:" + id,
                    PendingApprovalItem.MODULE_PURCHASE,
                    "RFQ & Quotations",
                    "RFQ " + orFallback(rfqNo, "#" + id) + " awaiting approval",
                    rfqNo,
                    null,
                    null,
                    iso(row[4]),
                    display(row[2]),
                    display(row[3]),
                    "/purchase/rfq/" + id,
                    "Review RFQ"));
        }
        return items;
    }

    private List<PendingApprovalItem> purchaseOrderQueue() {
        List<Object[]> rows = query(
                "SELECT p.id, p.poNo, p.status, p.createdBy, p.createdAt FROM PurchaseOrder p"
                        + " WHERE LOWER(p.status) = 'pending approval'",
                Map.of());
        List<PendingApprovalItem> items = new ArrayList<>();
        for (Object[] row : rows) {
            Long id = asLong(row[0]);
            String poNo = asText(row[1]);
            items.add(new PendingApprovalItem(
                    "purchase:order:" + id,
                    PendingApprovalItem.MODULE_PURCHASE,
                    "Purchase Orders",
                    "Purchase order " + orFallback(poNo, "#" + id) + " awaiting approval",
                    poNo,
                    null,
                    asText(row[3]),
                    iso(row[4]),
                    display(row[2]),
                    null,
                    "/purchase/orders/" + id,
                    "Review purchase order"));
        }
        return items;
    }

    private List<PendingApprovalItem> purchaseInvoiceQueue() {
        List<Object[]> rows = query(
                "SELECT i.id, i.invoiceNo, i.status, i.createdAt FROM PurchaseInvoice i"
                        + " WHERE LOWER(i.status) = 'submitted'",
                Map.of());
        List<PendingApprovalItem> items = new ArrayList<>();
        for (Object[] row : rows) {
            Long id = asLong(row[0]);
            String invoiceNo = asText(row[1]);
            items.add(new PendingApprovalItem(
                    "purchase:invoice:" + id,
                    PendingApprovalItem.MODULE_PURCHASE,
                    "Purchase Invoices",
                    "Purchase invoice " + orFallback(invoiceNo, "#" + id) + " submitted for approval",
                    invoiceNo,
                    null,
                    null,
                    iso(row[3]),
                    display(row[2]),
                    null,
                    "/purchase/invoices/" + id,
                    "Review invoice"));
        }
        return items;
    }

    // ------------------------------ helpers

    private List<Object[]> query(String jpql, Map<String, Object> parameters) {
        TypedQuery<Object[]> query = entityManager.createQuery(jpql, Object[].class);
        parameters.forEach(query::setParameter);
        return query.getResultList();
    }

    private static boolean hasAuthority(String authority) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return false;
        }
        return auth.getAuthorities().stream().anyMatch(a -> authority.equals(a.getAuthority()));
    }

    private static Long asLong(Object value) {
        return value instanceof Number number ? number.longValue() : null;
    }

    private static String asText(Object value) {
        if (value == null) {
            return null;
        }
        String text = value.toString().trim();
        return text.isEmpty() ? null : text;
    }

    private static String firstNonBlank(String first, String second) {
        return first != null ? first : second;
    }

    private static String orFallback(String value, String fallback) {
        return value == null ? fallback : value;
    }

    /** ISO-8601 text for a {@link java.time.LocalDateTime} row value. */
    private static String iso(Object value) {
        if (value instanceof java.time.LocalDateTime local) {
            return local.format(ISO_LOCAL);
        }
        if (value instanceof java.time.Instant instant) {
            return instant.toString();
        }
        return value == null ? null : value.toString();
    }

    /**
     * Stored workflow status → display label ("pending approval" and
     * "PENDING_APPROVAL" both become "Pending Approval"). The stored value is
     * never replaced; this only affects what the page displays.
     */
    private static String display(Object value) {
        String text = asText(value);
        if (text == null) {
            return null;
        }
        String[] words = text.replace('_', ' ').toLowerCase().split("\\s+");
        StringBuilder label = new StringBuilder();
        for (String word : words) {
            if (word.isEmpty()) {
                continue;
            }
            if (label.length() > 0) {
                label.append(' ');
            }
            label.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return label.length() == 0 ? null : label.toString();
    }
}
