package com.vishatech.erp.sales.api;

import com.vishatech.erp.calendar.dto.CalendarEntry;
import com.vishatech.erp.calendar.port.CalendarSourcePort;
import com.vishatech.erp.entity.CreditNote;
import com.vishatech.erp.entity.DeliveryChallan;
import com.vishatech.erp.entity.Invoice;
import com.vishatech.erp.entity.ProformaInvoice;
import com.vishatech.erp.entity.Quotation;
import com.vishatech.erp.entity.SalesContract;
import com.vishatech.erp.entity.SalesOrder;
import com.vishatech.erp.repository.CreditNoteRepository;
import com.vishatech.erp.repository.DeliveryChallanRepository;
import com.vishatech.erp.repository.InvoiceRepository;
import com.vishatech.erp.repository.ProformaInvoiceRepository;
import com.vishatech.erp.repository.QuotationRepository;
import com.vishatech.erp.repository.SalesContractRepository;
import com.vishatech.erp.repository.SalesOrderRepository;
import com.vishatech.erp.security.Permission;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;

/**
 * Sales' contribution to {@code GET /calendar/entries}.
 *
 * <p><b>Verified date sources.</b> Every field below is a real, stored date on
 * the Sales document it belongs to - checked against the entity, the form config
 * and the service that persists it (all of them are date-only inputs, saved
 * through the module's own {@code parseDate}):
 *
 * <ul>
 *   <li><b>Quotation.validUntil</b> - "Valid until" on the quotation form.</li>
 *   <li><b>SalesOrder.deliveryDate</b> - the Customer Purchase Order's expected
 *       delivery date.</li>
 *   <li><b>SalesOrder.actionDeadline</b> - the CPO release/action deadline,
 *       stored only when the order carries one.</li>
 *   <li><b>Invoice.dueDate</b> - the invoice's payment due date.</li>
 *   <li><b>DeliveryChallan.dispatchDate</b> - when the consignment is/was
 *       dispatched.</li>
 *   <li><b>SalesContract.validity</b> - "Contract Validity / Valid until".</li>
 *   <li><b>ProformaInvoice.validTill</b> - the proforma's "Valid Till".</li>
 *   <li><b>CreditNote.dueDateOverride</b> - the credit note's own authoritative
 *       due date, stored only when the user deliberately overrides the value
 *       resolved from the linked invoice/CPO.</li>
 * </ul>
 *
 * <p><b>Deliberately not published.</b> Payment Receipts are not on the
 * calendar: {@code paymentDate} records money already received, it is not a
 * deadline or a scheduled action, so turning it into a calendar item would
 * invent a schedule. A Credit Note without a {@code dueDateOverride} stores no
 * due date of its own - its effective due date is the linked invoice's or CPO's,
 * and those documents already publish it - so only the override is read here.
 * Document dates such as {@code quotationDate}, {@code cnDate} or
 * {@code sourceDate} are not deadlines and are not published either.
 *
 * <p><b>Exclusions.</b> Only the current row of each revision chain is read
 * (the same {@code latestRevision} / no-newer-revision rule the Sales list pages
 * use), and rows whose status is {@code archived} or {@code deleted} are
 * excluded. A record with a null date simply produces no entry.
 *
 * <p><b>No invented time.</b> These columns are date-only in practice and are
 * stored at midnight. Midnight is therefore treated as "no time of day" and the
 * entry is all-day; a stored non-midnight value (which can only exist if a
 * caller wrote a real timestamp) is published as its own time instead of being
 * discarded.
 *
 * <p><b>Read-only.</b> Nothing is written, counted or audited here; the entry is
 * a projection and links back to the existing Sales screen for the record.
 */
@Service
public class SalesCalendarReadAdapter implements CalendarSourcePort {

    static final String SOURCE = "sales";

    /** The existing Calendar category key for the Sales area. */
    private static final String CATEGORY = SOURCE;

    private static final String ENTITY_QUOTATION = "Quotation";
    private static final String ENTITY_SALES_ORDER = "SalesOrder";
    private static final String ENTITY_INVOICE = "Invoice";
    private static final String ENTITY_DELIVERY_CHALLAN = "DeliveryChallan";
    private static final String ENTITY_SALES_CONTRACT = "SalesContract";
    private static final String ENTITY_PROFORMA_INVOICE = "ProformaInvoice";
    private static final String ENTITY_CREDIT_NOTE = "CreditNote";

    private static final String FIELD_VALID_UNTIL = "validUntil";
    private static final String FIELD_DELIVERY_DATE = "deliveryDate";
    private static final String FIELD_ACTION_DEADLINE = "actionDeadline";
    private static final String FIELD_DUE_DATE = "dueDate";
    private static final String FIELD_DISPATCH_DATE = "dispatchDate";
    private static final String FIELD_VALIDITY = "validity";
    private static final String FIELD_VALID_TILL = "validTill";
    private static final String FIELD_DUE_DATE_OVERRIDE = "dueDateOverride";

    private static final String ARCHIVED = "archived";
    private static final String DELETED = "deleted";

    private final QuotationRepository quotations;
    private final SalesOrderRepository salesOrders;
    private final InvoiceRepository invoices;
    private final DeliveryChallanRepository deliveryChallans;
    private final SalesContractRepository salesContracts;
    private final ProformaInvoiceRepository proformaInvoices;
    private final CreditNoteRepository creditNotes;

    public SalesCalendarReadAdapter(
            QuotationRepository quotations,
            SalesOrderRepository salesOrders,
            InvoiceRepository invoices,
            DeliveryChallanRepository deliveryChallans,
            SalesContractRepository salesContracts,
            ProformaInvoiceRepository proformaInvoices,
            CreditNoteRepository creditNotes) {
        this.quotations = quotations;
        this.salesOrders = salesOrders;
        this.invoices = invoices;
        this.deliveryChallans = deliveryChallans;
        this.salesContracts = salesContracts;
        this.proformaInvoices = proformaInvoices;
        this.creditNotes = creditNotes;
    }

    @Override
    public String source() {
        return SOURCE;
    }

    @Override
    public String requiredAuthority() {
        return Permission.SALES_VIEW.name();
    }

    @Override
    public List<CalendarEntry> entriesBetween(LocalDate from, LocalDate to) {
        // One entry per source record + date field, keyed by the same id the
        // response publishes, so a revision chain or a duplicate query row can
        // never draw the same deadline twice.
        Map<String, CalendarEntry> byId = new LinkedHashMap<>();

        // One bounded query per date field for the whole range - never one
        // lookup per record.
        for (Quotation quotation : quotations.findAll(currentAndDated(FIELD_VALID_UNTIL, from, to))) {
            CalendarEntry entry = quotationEntry(quotation);
            if (entry != null) {
                byId.putIfAbsent(entry.id(), entry);
            }
        }

        for (SalesOrder order : salesOrders.findAll(currentAndDated(FIELD_DELIVERY_DATE, from, to))) {
            CalendarEntry entry = orderEntry(order, FIELD_DELIVERY_DATE, "Expected delivery");
            if (entry != null) {
                byId.putIfAbsent(entry.id(), entry);
            }
        }

        for (SalesOrder order : salesOrders.findAll(currentAndDated(FIELD_ACTION_DEADLINE, from, to))) {
            CalendarEntry entry = orderEntry(order, FIELD_ACTION_DEADLINE, "Action deadline");
            if (entry != null) {
                byId.putIfAbsent(entry.id(), entry);
            }
        }

        for (Invoice invoice : invoices.findAll(currentAndDated(FIELD_DUE_DATE, from, to))) {
            CalendarEntry entry = invoiceEntry(invoice);
            if (entry != null) {
                byId.putIfAbsent(entry.id(), entry);
            }
        }

        for (DeliveryChallan challan
                : deliveryChallans.findAll(currentAndDated(FIELD_DISPATCH_DATE, from, to))) {
            CalendarEntry entry = deliveryChallanEntry(challan);
            if (entry != null) {
                byId.putIfAbsent(entry.id(), entry);
            }
        }

        for (SalesContract contract
                : salesContracts.findAll(currentAndDated(FIELD_VALIDITY, from, to))) {
            CalendarEntry entry = salesContractEntry(contract);
            if (entry != null) {
                byId.putIfAbsent(entry.id(), entry);
            }
        }

        for (ProformaInvoice proforma
                : proformaInvoices.findAll(currentAndDated(FIELD_VALID_TILL, from, to))) {
            CalendarEntry entry = proformaInvoiceEntry(proforma);
            if (entry != null) {
                byId.putIfAbsent(entry.id(), entry);
            }
        }

        for (CreditNote creditNote
                : creditNotes.findAll(currentAndDated(FIELD_DUE_DATE_OVERRIDE, from, to))) {
            CalendarEntry entry = creditNoteEntry(creditNote);
            if (entry != null) {
                byId.putIfAbsent(entry.id(), entry);
            }
        }

        return List.copyOf(byId.values());
    }

    // ------------------------------------------------------------- mappers

    private CalendarEntry quotationEntry(Quotation quotation) {
        return entry(
                ENTITY_QUOTATION,
                quotation.getId(),
                FIELD_VALID_UNTIL,
                "Quotation valid until",
                quotation.getQuotationNo(),
                quotation.getClientName(),
                quotation.getValidUntil(),
                quotation.getStatus(),
                "/quotations/" + quotation.getId() + "/view");
    }

    private CalendarEntry orderEntry(SalesOrder order, String dateField, String kind) {
        LocalDateTime date = FIELD_ACTION_DEADLINE.equals(dateField)
                ? order.getActionDeadline()
                : order.getDeliveryDate();
        return entry(
                ENTITY_SALES_ORDER,
                order.getId(),
                dateField,
                kind,
                order.getSoNo(),
                order.getClientName(),
                date,
                order.getStatus(),
                "/sales-orders/" + order.getId());
    }

    private CalendarEntry invoiceEntry(Invoice invoice) {
        return entry(
                ENTITY_INVOICE,
                invoice.getId(),
                FIELD_DUE_DATE,
                "Invoice due",
                invoice.getInvoiceNo(),
                invoice.getClientName(),
                invoice.getDueDate(),
                invoice.getStatus(),
                "/invoices/" + invoice.getId());
    }

    private CalendarEntry deliveryChallanEntry(DeliveryChallan challan) {
        return entry(
                ENTITY_DELIVERY_CHALLAN,
                challan.getId(),
                FIELD_DISPATCH_DATE,
                "Challan dispatch",
                challan.getDcNo(),
                challan.getClientName(),
                challan.getDispatchDate(),
                challan.getStatus(),
                "/delivery-challans/" + challan.getId());
    }

    private CalendarEntry salesContractEntry(SalesContract contract) {
        return entry(
                ENTITY_SALES_CONTRACT,
                contract.getId(),
                FIELD_VALIDITY,
                "Contract validity",
                contract.getScNo(),
                contract.getClientName(),
                contract.getValidity(),
                contract.getStatus(),
                "/sales-contracts/" + contract.getId());
    }

    private CalendarEntry proformaInvoiceEntry(ProformaInvoice proforma) {
        return entry(
                ENTITY_PROFORMA_INVOICE,
                proforma.getId(),
                FIELD_VALID_TILL,
                "Proforma valid till",
                proforma.getPiNo(),
                proforma.getClientName(),
                proforma.getValidTill(),
                proforma.getStatus(),
                "/proforma-invoices/" + proforma.getId());
    }

    private CalendarEntry creditNoteEntry(CreditNote creditNote) {
        return entry(
                ENTITY_CREDIT_NOTE,
                creditNote.getId(),
                FIELD_DUE_DATE_OVERRIDE,
                "Credit note due",
                creditNote.getCnNo(),
                firstNonBlank(creditNote.getClientName(), creditNote.getCompanyName()),
                creditNote.getDueDateOverride(),
                creditNote.getStatus(),
                "/credit-notes/" + creditNote.getId());
    }

    /**
     * One projection. A null date produces no entry (nothing is fabricated); the
     * id follows the calendar's identity convention so a refresh replaces the
     * same entry and two date fields on one record stay distinct.
     */
    private static CalendarEntry entry(String entityType,
                                       Long entityId,
                                       String dateField,
                                       String kind,
                                       String number,
                                       String client,
                                       LocalDateTime date,
                                       String status,
                                       String linkPath) {
        if (entityId == null || date == null) {
            return null;
        }
        String time = timeOf(date);
        return new CalendarEntry(
                SOURCE + ":" + entityType + ":" + entityId + ":" + dateField + ":" + date.toLocalDate(),
                SOURCE,
                entityType,
                entityId,
                title(kind, number, client),
                date.toLocalDate(),
                time,
                // No Sales document stores an end time; none is invented.
                null,
                time == null,
                status,
                CATEGORY,
                linkPath,
                true);
    }

    private static String title(String kind, String number, String client) {
        StringBuilder title = new StringBuilder(kind);
        if (number != null && !number.isBlank()) {
            title.append(' ').append(number.trim());
        }
        if (client != null && !client.isBlank()) {
            title.append(" - ").append(client.trim());
        }
        return title.toString();
    }

    /**
     * Midnight is the date-only marker used by every Sales form, so it means
     * "no time recorded" and the entry is all-day. A genuinely stored time is
     * kept instead of being dropped.
     */
    private static String timeOf(LocalDateTime value) {
        LocalTime time = value.toLocalTime();
        if (time.equals(LocalTime.MIDNIGHT)) {
            return null;
        }
        return String.format("%02d:%02d", time.getHour(), time.getMinute());
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

    /**
     * The module's own "current + active + dated inside the range" rule:
     *
     * <ul>
     *   <li>the row is the current revision of its chain ({@code latestRevision}
     *       or no newer revision exists - exactly what the Sales lists use);</li>
     *   <li>its status is neither {@code archived} nor {@code deleted};</li>
     *   <li>the date field is non-null and falls in {@code [from, to]}.</li>
     * </ul>
     *
     * The range is expressed as a half-open window on the stored timestamp, so
     * both end days are inclusive without relying on a 23:59:59 sentinel.
     */
    private static <T> Specification<T> currentAndDated(String dateField, LocalDate from, LocalDate to) {
        LocalDateTime start = from.atStartOfDay();
        LocalDateTime endExclusive = to.plusDays(1).atStartOfDay();
        return (root, query, cb) -> cb.and(
                currentRevision(root, query, cb),
                notArchivedOrDeleted(root, cb),
                cb.isNotNull(root.get(dateField)),
                cb.greaterThanOrEqualTo(root.<LocalDateTime>get(dateField), start),
                cb.lessThan(root.<LocalDateTime>get(dateField), endExclusive));
    }

    /** Current row of a revision chain (the same rule the Sales lists apply). */
    @SuppressWarnings("unchecked")
    private static <T> Predicate currentRevision(Root<T> root, CriteriaQuery<?> query, CriteriaBuilder cb) {
        Predicate current = cb.isTrue(root.<Boolean>get("latestRevision"));
        if (query == null) {
            return current;
        }
        Subquery<Long> newer = query.subquery(Long.class);
        Root<T> newerRoot = newer.from((Class<T>) root.getJavaType());
        newer.select(newerRoot.<Long>get("id"));
        newer.where(
                cb.equal(
                        cb.coalesce(newerRoot.<Long>get("revisionOf"), newerRoot.<Long>get("id")),
                        cb.coalesce(root.<Long>get("revisionOf"), root.<Long>get("id"))),
                cb.greaterThan(
                        cb.coalesce(newerRoot.<Integer>get("revision"), 0),
                        cb.coalesce(root.<Integer>get("revision"), 0)));
        return cb.or(current, cb.not(cb.exists(newer)));
    }

    /** Status predicate shared by every Sales list: archived/deleted are hidden. */
    private static <T> Predicate notArchivedOrDeleted(Root<T> root, CriteriaBuilder cb) {
        return cb.not(cb.lower(cb.coalesce(root.<String>get("status"), "")).in(ARCHIVED, DELETED));
    }
}
