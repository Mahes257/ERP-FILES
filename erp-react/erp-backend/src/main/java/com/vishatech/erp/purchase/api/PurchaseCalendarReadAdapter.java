package com.vishatech.erp.purchase.api;

import com.vishatech.erp.calendar.dto.CalendarEntry;
import com.vishatech.erp.calendar.port.CalendarSourcePort;
import com.vishatech.erp.entity.PurchaseInvoice;
import com.vishatech.erp.entity.PurchaseOrder;
import com.vishatech.erp.entity.PurchaseRequisition;
import com.vishatech.erp.entity.PurchaseRfq;
import com.vishatech.erp.entity.PurchaseShipment;
import com.vishatech.erp.repository.PurchaseInvoiceRepository;
import com.vishatech.erp.repository.PurchaseOrderRepository;
import com.vishatech.erp.repository.PurchaseRequisitionRepository;
import com.vishatech.erp.repository.PurchaseRfqRepository;
import com.vishatech.erp.repository.PurchaseShipmentRepository;
import com.vishatech.erp.security.Permission;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Purchase's contribution to {@code GET /calendar/entries}.
 *
 * <p><b>Verified date sources.</b> Only fields the module itself treats as a
 * deadline or a scheduled action are published; a document date (a creation
 * stamp) is never turned into a calendar item:
 *
 * <ul>
 *   <li><b>{@code PurchaseRequisition.expectedDate}</b> - the "Required /
 *       expected delivery date" the requisition form validates through
 *       {@code parseDate} and requires, and the date the RFQ/PO conversion
 *       carries forward. Published only while the requisition is still a live
 *       pre-terminal request, and only for {@code recordState = active}.</li>
 *   <li><b>{@code PurchaseRfq.dueDate}</b> - the quotation due date on the RFQ
 *       form (the deadline vendors must quote by). Published for open RFQs;
 *       drafts, awarded, closed and cancelled RFQs carry no outstanding
 *       deadline.</li>
 *   <li><b>{@code PurchaseOrder.expectedDate}</b> - the "Expected Delivery"
 *       field, and the date {@code PurchaseReceivingService} uses when it opens
 *       a goods receipt. Published only after release, i.e. once the supplier is
 *       actually committed to delivering.</li>
 *   <li><b>{@code PurchaseInvoice.dueDate}</b> - the invoice's payment due date.
 *       Published under the module's own "payment is due" predicate (matched,
 *       nothing paid yet), which is exactly what the Work Queue and the payment
 *       reminder scheduler already use.</li>
 *   <li><b>{@code PurchaseShipment.eta}</b> - the expected arrival date of an
 *       undelivered shipment. This is the only real expected-receipt date in the
 *       logistics tables: an "Expected" GRN stores {@code receiptDate = null}
 *       until the goods actually arrive.</li>
 * </ul>
 *
 * <p><b>Deliberately not published.</b>
 * <ul>
 *   <li>{@code approvalDate}, {@code releasedAt}, {@code acknowledgedAt} - they
 *       record an action that already happened, not an upcoming one.</li>
 *   <li>{@code PurchaseGrn.receiptDate} - null on every pending GRN, so there is
 *       no date to publish; the PO's expected delivery (and the shipment ETA)
 *       already cover the expected receipt.</li>
 *   <li>{@code PurchaseInspection.inspectionDate} - written as
 *       {@code LocalDate.now()} when the pending inspection is created, so it is
 *       a creation stamp, not a scheduled inspection date.</li>
 *   <li>{@code PurchaseRfqFollowUp.followUpDate} - a genuine scheduled date, but
 *       the module exposes only an edit form for a single follow-up; the Calendar
 *       must not link into a write screen, so it is left out until a read-only
 *       follow-up page exists.</li>
 *   <li>{@code PurchaseOrder.deliveryDate} - the second, logistics-side delivery
 *       date with no distinct workflow meaning; publishing it alongside
 *       {@code expectedDate} would draw the same delivery commitment twice.</li>
 *   <li>{@code invoiceDate} and every document date - not deadlines.</li>
 * </ul>
 *
 * <p><b>Dates and times.</b> Every field above is date-only (three are ISO
 * {@code yyyy-MM-dd} strings validated on the way in, two are {@code LocalDate}),
 * so every entry is all-day and no start or end time is invented.
 *
 * <p><b>Read-only.</b> Nothing is written, counted or audited here. The entry
 * links to the existing Purchase screen for the record, where the module's own
 * workflow and permissions apply.
 */
@Service
public class PurchaseCalendarReadAdapter implements CalendarSourcePort {

    static final String SOURCE = "purchase";

    /** The existing Calendar category key and colour for the Purchase area. */
    private static final String CATEGORY = SOURCE;

    private static final String ENTITY_REQUISITION = "PurchaseRequisition";
    private static final String ENTITY_RFQ = "PurchaseRfq";
    private static final String ENTITY_ORDER = "PurchaseOrder";
    private static final String ENTITY_INVOICE = "PurchaseInvoice";
    private static final String ENTITY_SHIPMENT = "PurchaseShipment";

    private static final String FIELD_EXPECTED_DATE = "expectedDate";
    private static final String FIELD_DUE_DATE = "dueDate";
    private static final String FIELD_ETA = "eta";

    /** Live, pre-terminal requisitions (the Work Queue approval stage included). */
    private static final List<String> PR_LIVE_STATUSES = List.of(
            "Pending Approval", "Approved", "Technical Specification Review",
            "Ready for RFQ", "Returned");

    /** RFQs whose quotation deadline is still outstanding (Draft is uncommitted). */
    private static final List<String> RFQ_OPEN_STATUSES = List.of(
            "Pending Approval", "Approved", "Sent", "Quotation Received", "Evaluation",
            "1st Approval", "2nd Approval", "Final Approval");

    /**
     * Released stages - the same list {@code PurchaseWorkQueueService} uses for
     * "the supplier has the order and delivery is expected".
     */
    private static final List<String> PO_LIVE_STATUSES = List.of(
            "Released", "Supplier Acknowledged", "In Progress", "Partially Delivered");

    /** The invoice statuses behind the module's {@code countPaymentsDue} query. */
    private static final List<String> INVOICE_DUE_STATUSES = List.of(
            "Approved", "Partially Paid", "Overdue");

    private static final String INVOICE_MATCHED = "Matched";

    /** Undelivered shipments, i.e. the ones whose ETA is still ahead. */
    private static final List<String> SHIPMENT_OPEN_STATUSES = List.of(
            "Pending Dispatch", "In Transit", "Delayed");

    private final PurchaseRequisitionRepository requisitions;
    private final PurchaseRfqRepository rfqs;
    private final PurchaseOrderRepository orders;
    private final PurchaseInvoiceRepository invoices;
    private final PurchaseShipmentRepository shipments;

    public PurchaseCalendarReadAdapter(PurchaseRequisitionRepository requisitions,
                                       PurchaseRfqRepository rfqs,
                                       PurchaseOrderRepository orders,
                                       PurchaseInvoiceRepository invoices,
                                       PurchaseShipmentRepository shipments) {
        this.requisitions = requisitions;
        this.rfqs = rfqs;
        this.orders = orders;
        this.invoices = invoices;
        this.shipments = shipments;
    }

    @Override
    public String source() {
        return SOURCE;
    }

    @Override
    public String requiredAuthority() {
        return Permission.PURCHASE_VIEW.name();
    }

    @Override
    @Transactional(readOnly = true)
    public List<CalendarEntry> entriesBetween(LocalDate from, LocalDate to) {
        // One entry per source record + date field, keyed by the published id, so
        // a duplicate query row can never draw the same deadline twice.
        Map<String, CalendarEntry> byId = new LinkedHashMap<>();

        // One bounded query per document type for the whole range - never one
        // lookup per record.
        for (PurchaseRequisition requisition : requisitions.findAll(
                liveRequisitions(from, to))) {
            add(byId, requisitionEntry(requisition));
        }

        for (PurchaseRfq rfq : rfqs.findAll(
                statusInAndDated(RFQ_OPEN_STATUSES, FIELD_DUE_DATE, from, to))) {
            add(byId, rfqEntry(rfq));
        }

        for (PurchaseOrder order : orders.findAll(
                statusInAndDated(PO_LIVE_STATUSES, FIELD_EXPECTED_DATE, from, to))) {
            add(byId, orderEntry(order));
        }

        for (PurchaseInvoice invoice : invoices.findAll(paymentsDue(from, to))) {
            add(byId, invoiceEntry(invoice));
        }

        for (PurchaseShipment shipment : shipments.findAll(
                shipmentEtaInRange(from, to))) {
            add(byId, shipmentEntry(shipment));
        }

        return List.copyOf(byId.values());
    }

    // ------------------------------------------------------------- mappers

    private CalendarEntry requisitionEntry(PurchaseRequisition requisition) {
        return entry(
                ENTITY_REQUISITION,
                requisition.getId(),
                FIELD_EXPECTED_DATE,
                isoDate(requisition.getExpectedDate()),
                "Required delivery",
                requisition.getPrNo(),
                firstNonBlank(requisition.getVendor(), requisition.getTitle()),
                requisition.getStatus(),
                "/purchase/requisition/" + requisition.getId());
    }

    private CalendarEntry rfqEntry(PurchaseRfq rfq) {
        return entry(
                ENTITY_RFQ,
                rfq.getId(),
                FIELD_DUE_DATE,
                isoDate(rfq.getDueDate()),
                "Quotation due",
                rfq.getRfqNo(),
                rfq.getTitle(),
                rfq.getStatus(),
                "/purchase/rfq/" + rfq.getId());
    }

    private CalendarEntry orderEntry(PurchaseOrder order) {
        return entry(
                ENTITY_ORDER,
                order.getId(),
                FIELD_EXPECTED_DATE,
                isoDate(order.getExpectedDate()),
                "PO expected delivery",
                order.getPoNo(),
                order.getVendor(),
                order.getStatus(),
                "/purchase/orders/" + order.getId());
    }

    private CalendarEntry invoiceEntry(PurchaseInvoice invoice) {
        return entry(
                ENTITY_INVOICE,
                invoice.getId(),
                FIELD_DUE_DATE,
                isoDate(invoice.getDueDate()),
                "Payment due",
                invoice.getInvoiceNo(),
                invoice.getVendor(),
                invoice.getStatus(),
                "/purchase/invoices/" + invoice.getId());
    }

    private CalendarEntry shipmentEntry(PurchaseShipment shipment) {
        return entry(
                ENTITY_SHIPMENT,
                shipment.getId(),
                FIELD_ETA,
                shipment.getEta(),
                "Shipment ETA",
                shipment.getShipmentNo(),
                shipment.getVendor(),
                shipment.getStatus(),
                "/purchase/logistics/shipment/" + shipment.getShipmentNo());
    }

    /**
     * One projection. A null or unreadable date produces no entry (nothing is
     * fabricated); the id follows the calendar's identity convention so a refresh
     * replaces the same entry and two date fields on one record stay distinct.
     */
    private static CalendarEntry entry(String entityType,
                                       Long entityId,
                                       String dateField,
                                       LocalDate date,
                                       String kind,
                                       String number,
                                       String party,
                                       String status,
                                       String linkPath) {
        if (entityId == null || date == null) {
            return null;
        }
        return new CalendarEntry(
                SOURCE + ":" + entityType + ":" + entityId + ":" + dateField + ":" + date,
                SOURCE,
                entityType,
                entityId,
                title(kind, number, party),
                date,
                // Purchase dates are date-only: no time of day is invented.
                null,
                null,
                true,
                status,
                CATEGORY,
                linkPath,
                true);
    }

    private static void add(Map<String, CalendarEntry> byId, CalendarEntry entry) {
        if (entry != null) {
            byId.putIfAbsent(entry.id(), entry);
        }
    }

    private static String title(String kind, String number, String party) {
        StringBuilder title = new StringBuilder(kind);
        if (number != null && !number.isBlank()) {
            title.append(' ').append(number.trim());
        }
        if (party != null && !party.isBlank()) {
            title.append(" - ").append(party.trim());
        }
        return title.toString();
    }

    /** An ISO {@code yyyy-MM-dd} value, or null when the stored text is unusable. */
    private static LocalDate isoDate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(value.trim());
        } catch (DateTimeParseException ex) {
            return null;
        }
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    // -------------------------------------------------------- query rules

    /** Live requisitions: the Work Queue's active record state, pre-terminal status. */
    private static Specification<PurchaseRequisition> liveRequisitions(LocalDate from, LocalDate to) {
        return (root, query, cb) -> cb.and(
                cb.equal(root.<String>get("recordState"), PurchaseRequisition.RECORD_ACTIVE),
                root.<String>get("status").in(PR_LIVE_STATUSES),
                isoDateInRange(cb, root, FIELD_EXPECTED_DATE, from, to));
    }

    /**
     * The module's own "payment is due" rule, copied from
     * {@code PurchaseInvoiceRepository.countPaymentsDue}: matched three-way match,
     * nothing paid yet, an approved/partially paid/overdue invoice - plus the
     * requested range on the stored due date.
     */
    private static Specification<PurchaseInvoice> paymentsDue(LocalDate from, LocalDate to) {
        return (root, query, cb) -> {
            Expression<BigDecimal> paid = root.get("paidAmount");
            return cb.and(
                    cb.equal(root.<String>get("matchStatus"), INVOICE_MATCHED),
                    cb.or(cb.isNull(paid), cb.lessThanOrEqualTo(paid, BigDecimal.ZERO)),
                    root.<String>get("status").in(INVOICE_DUE_STATUSES),
                    isoDateInRange(cb, root, FIELD_DUE_DATE, from, to));
        };
    }

    /** Undelivered shipments whose stored {@code eta} falls inside the range. */
    private static Specification<PurchaseShipment> shipmentEtaInRange(LocalDate from, LocalDate to) {
        return (root, query, cb) -> cb.and(
                root.<String>get("status").in(SHIPMENT_OPEN_STATUSES),
                cb.isNotNull(root.<LocalDate>get(FIELD_ETA)),
                cb.greaterThanOrEqualTo(root.<LocalDate>get(FIELD_ETA), from),
                cb.lessThanOrEqualTo(root.<LocalDate>get(FIELD_ETA), to));
    }

    private static <T> Specification<T> statusInAndDated(List<String> statuses,
                                                         String dateField,
                                                         LocalDate from,
                                                         LocalDate to) {
        return (root, query, cb) -> cb.and(
                root.<String>get("status").in(statuses),
                isoDateInRange(cb, root, dateField, from, to));
    }

    /**
     * {@code field BETWEEN from AND to} on an ISO {@code yyyy-MM-dd} text column.
     *
     * <p>The stored values are date-only strings written from the module's date
     * inputs, so the lexicographic order is the calendar order. The length check
     * keeps an unexpected value out of the comparison rather than letting it
     * match by accident, and {@link #isoDate} parses the surviving value before
     * it becomes an entry.
     */
    private static Predicate isoDateInRange(CriteriaBuilder cb,
                                            Root<?> root,
                                            String field,
                                            LocalDate from,
                                            LocalDate to) {
        return cb.and(
                cb.equal(cb.length(root.<String>get(field)), 10),
                cb.greaterThanOrEqualTo(root.<String>get(field), from.toString()),
                cb.lessThanOrEqualTo(root.<String>get(field), to.toString()));
    }
}
