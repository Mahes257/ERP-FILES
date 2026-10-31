package com.vishatech.erp.calendar;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.cpr.api.CprCalendarReadAdapter;
import com.vishatech.erp.crm.entity.FollowUp;
import com.vishatech.erp.crm.repository.FollowUpRepository;
import com.vishatech.erp.entity.Cpr;
import com.vishatech.erp.entity.CprStatus;
import com.vishatech.erp.entity.CreditNote;
import com.vishatech.erp.entity.DeliveryChallan;
import com.vishatech.erp.entity.Invoice;
import com.vishatech.erp.entity.PaymentReceipt;
import com.vishatech.erp.entity.ProformaInvoice;
import com.vishatech.erp.entity.PurchaseInvoice;
import com.vishatech.erp.entity.PurchaseOrder;
import com.vishatech.erp.entity.PurchaseRequisition;
import com.vishatech.erp.entity.PurchaseRfq;
import com.vishatech.erp.entity.PurchaseShipment;
import com.vishatech.erp.entity.Quotation;
import com.vishatech.erp.entity.SalesContract;
import com.vishatech.erp.entity.SalesOrder;
import com.vishatech.erp.entity.production.OrderStatus;
import com.vishatech.erp.entity.production.ProductionOrder;
import com.vishatech.erp.production.api.ProductionCalendarReadAdapter;
import com.vishatech.erp.repository.CprRepository;
import com.vishatech.erp.repository.CreditNoteRepository;
import com.vishatech.erp.repository.DeliveryChallanRepository;
import com.vishatech.erp.repository.InvoiceRepository;
import com.vishatech.erp.repository.PaymentReceiptRepository;
import com.vishatech.erp.repository.ProformaInvoiceRepository;
import com.vishatech.erp.repository.PurchaseInvoiceRepository;
import com.vishatech.erp.repository.PurchaseOrderRepository;
import com.vishatech.erp.repository.PurchaseRequisitionRepository;
import com.vishatech.erp.repository.PurchaseRfqRepository;
import com.vishatech.erp.repository.PurchaseShipmentRepository;
import com.vishatech.erp.repository.QuotationRepository;
import com.vishatech.erp.repository.SalesContractRepository;
import com.vishatech.erp.repository.SalesOrderRepository;
import com.vishatech.erp.repository.production.ProductionOrderRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * End-to-end verification of {@code GET /calendar/entries} against the isolated
 * H2 test database (never the shared MySQL {@code erp_db}).
 *
 * <p>It proves the behaviours the phase is required to deliver: authentication,
 * range validation, predictable empty results, real source values (status, date,
 * optional time), soft-delete/archive exclusion, the open-only rule for the next
 * follow-up date, inclusive range boundaries, read-only flags and the absence of
 * any write endpoint.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class CalendarApiTest extends AbstractSecurityTest {

    private static final String PATH = "/calendar/entries";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private FollowUpRepository followUpRepository;

    @Autowired
    private QuotationRepository quotationRepository;

    @Autowired
    private SalesOrderRepository salesOrderRepository;

    @Autowired
    private InvoiceRepository invoiceRepository;

    @Autowired
    private DeliveryChallanRepository deliveryChallanRepository;

    @Autowired
    private SalesContractRepository salesContractRepository;

    @Autowired
    private ProformaInvoiceRepository proformaInvoiceRepository;

    @Autowired
    private CreditNoteRepository creditNoteRepository;

    @Autowired
    private PaymentReceiptRepository paymentReceiptRepository;

    @Autowired
    private PurchaseRequisitionRepository purchaseRequisitionRepository;

    @Autowired
    private PurchaseRfqRepository purchaseRfqRepository;

    @Autowired
    private PurchaseOrderRepository purchaseOrderRepository;

    @Autowired
    private PurchaseInvoiceRepository purchaseInvoiceRepository;

    @Autowired
    private PurchaseShipmentRepository purchaseShipmentRepository;

    @Autowired
    private CprRepository cprRepository;

    @Autowired
    private CprCalendarReadAdapter cprCalendarAdapter;

    @Autowired
    private ProductionOrderRepository productionOrderRepository;

    @Autowired
    private ProductionCalendarReadAdapter productionCalendarAdapter;

    /* ------------------------------------------------------------------ auth */

    @Test
    void endpointRequiresAuthentication() throws Exception {
        mockMvc.perform(get(PATH)
                        .param("from", "2026-10-01")
                        .param("to", "2026-10-31"))
                .andExpect(status().isUnauthorized());
    }

    /* -------------------------------------------------------------- validation */

    @Test
    void rejectsMissingInvertedAndOversizedRanges() throws Exception {
        String token = register("calendar-range-user@example.com");

        mockMvc.perform(get(PATH).header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());

        mockMvc.perform(get(PATH)
                        .header("Authorization", "Bearer " + token)
                        .param("from", "2026-10-31")
                        .param("to", "2026-10-01"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(get(PATH)
                        .header("Authorization", "Bearer " + token)
                        .param("from", "2025-01-01")
                        .param("to", "2026-01-01"))
                .andExpect(status().isBadRequest());

        // A non-ISO value is a bad request, not a 500.
        mockMvc.perform(get(PATH)
                        .header("Authorization", "Bearer " + token)
                        .param("from", "01-10-2026")
                        .param("to", "2026-10-31"))
                .andExpect(status().isBadRequest());
    }

    /* ------------------------------------------------------------ empty result */

    @Test
    void emptyRangeIsASuccessfulEmptyResult() throws Exception {
        String token = register("calendar-empty-user@example.com");

        JsonNode body = getEntries(token, "1999-01-01", "1999-01-31");

        assertThat(body.path("from").asText()).isEqualTo("1999-01-01");
        assertThat(body.path("to").asText()).isEqualTo("1999-01-31");
        assertThat(body.path("entries").isArray()).isTrue();
        assertThat(body.path("entries")).isEmpty();
        assertThat(body.path("sources")).isNotEmpty();
        assertThat(body.path("unavailableSources")).isEmpty();
    }

    /* -------------------------------------------------------------- real values */

    @Test
    void followUpIsPublishedWithItsOwnStatusDateAndTime() throws Exception {
        String token = register("calendar-followup-user@example.com");
        LocalDate date = LocalDate.now().plusDays(10);

        FollowUp followUp = newFollowUp(date, "Open");
        followUp.setCompanyName("Calendar Test Co");
        followUp.setLeadName("Calendar Lead");
        followUp.setTime("9:30 AM");
        followUp = followUpRepository.save(followUp);

        JsonNode entry = findEntry(
                getEntries(token, date.minusDays(1).toString(), date.plusDays(1).toString()),
                "crm:FollowUp:" + followUp.getId() + ":followupDate:" + date);

        assertThat(entry).as("the follow-up must appear on its own date").isNotNull();
        assertThat(entry.path("source").asText()).isEqualTo("crm");
        assertThat(entry.path("entityType").asText()).isEqualTo("FollowUp");
        assertThat(entry.path("entityId").asLong()).isEqualTo(followUp.getId());
        assertThat(entry.path("date").asText()).isEqualTo(date.toString());
        assertThat(entry.path("status").asText()).isEqualTo("Open");
        assertThat(entry.path("title").asText()).contains("Calendar Test Co");
        assertThat(entry.path("category").asText()).isEqualTo("crm");
        assertThat(entry.path("linkPath").asText()).isEqualTo("/followups/" + followUp.getId());
        assertThat(entry.path("readOnly").asBoolean()).isTrue();
        // The stored 12-hour value is normalised, not invented.
        assertThat(entry.path("startTime").asText()).isEqualTo("09:30");
        assertThat(entry.path("endTime").isNull()).isTrue();
        assertThat(entry.path("allDay").asBoolean()).isFalse();
    }

    @Test
    void unreadableTimeMakesTheEntryAllDayInsteadOfGuessing() throws Exception {
        String token = register("calendar-time-user@example.com");
        LocalDate date = LocalDate.now().plusDays(12);

        FollowUp followUp = newFollowUp(date, "Open");
        followUp.setCompanyName("No Time Co");
        followUp.setTime("sometime after lunch");
        followUp = followUpRepository.save(followUp);

        JsonNode entry = findEntry(
                getEntries(token, date.toString(), date.toString()),
                "crm:FollowUp:" + followUp.getId() + ":followupDate:" + date);

        assertThat(entry).isNotNull();
        assertThat(entry.path("startTime").isNull()).isTrue();
        assertThat(entry.path("allDay").asBoolean()).isTrue();
    }

    @Test
    void nextFollowUpIsPublishedOnlyWhileTheFollowUpIsOpen() throws Exception {
        String token = register("calendar-next-user@example.com");
        LocalDate booked = LocalDate.now().plusDays(20);
        LocalDate next = LocalDate.now().plusDays(27);

        FollowUp open = newFollowUp(booked, "Open");
        open.setCompanyName("Next Action Co");
        open.setNextFollowupDate(next);
        open = followUpRepository.save(open);

        FollowUp completed = newFollowUp(booked, "Completed");
        completed.setCompanyName("Closed Next Co");
        completed.setNextFollowupDate(next);
        completed = followUpRepository.save(completed);

        JsonNode body = getEntries(token, next.toString(), next.toString());

        assertThat(findEntry(body,
                "crm:FollowUp:" + open.getId() + ":nextFollowupDate:" + next))
                .as("an open follow-up's planned next action is a calendar entry")
                .isNotNull();
        assertThat(findEntry(body,
                "crm:FollowUp:" + completed.getId() + ":nextFollowupDate:" + next))
                .as("a completed follow-up's next date is history, not an action")
                .isNull();
    }

    /* -------------------------------------------------------- exclusions */

    @Test
    void deletedAndArchivedFollowUpsAreExcluded() throws Exception {
        String token = register("calendar-exclusion-user@example.com");
        LocalDate date = LocalDate.now().plusDays(30);

        FollowUp deleted = newFollowUp(date, "Deleted");
        deleted.setCompanyName("Deleted Co");
        deleted = followUpRepository.save(deleted);

        FollowUp archived = newFollowUp(date, "Open");
        archived.setCompanyName("Archived Co");
        archived.setArchivedAt(LocalDateTime.now());
        archived = followUpRepository.save(archived);

        JsonNode body = getEntries(token, date.toString(), date.toString());

        assertThat(findEntry(body, "crm:FollowUp:" + deleted.getId() + ":followupDate:" + date)).isNull();
        assertThat(findEntry(body, "crm:FollowUp:" + archived.getId() + ":followupDate:" + date)).isNull();
    }

    @Test
    void rangeBoundariesAreInclusiveAndNothingOutsideIsReturned() throws Exception {
        String token = register("calendar-boundary-user@example.com");
        LocalDate from = LocalDate.now().plusDays(40);
        LocalDate to = from.plusDays(6);
        LocalDate outside = to.plusDays(1);

        FollowUp first = followUpRepository.save(namedFollowUp(from, "First Day Co"));
        FollowUp last = followUpRepository.save(namedFollowUp(to, "Last Day Co"));
        FollowUp beyond = followUpRepository.save(namedFollowUp(outside, "Outside Co"));

        JsonNode body = getEntries(token, from.toString(), to.toString());

        assertThat(findEntry(body, "crm:FollowUp:" + first.getId() + ":followupDate:" + from)).isNotNull();
        assertThat(findEntry(body, "crm:FollowUp:" + last.getId() + ":followupDate:" + to)).isNotNull();
        assertThat(findEntry(body, "crm:FollowUp:" + beyond.getId() + ":followupDate:" + outside)).isNull();
    }

    /* ---------------------------------------------------------------- sales */

    @Test
    void salesDocumentsPublishTheirOwnStoredDeadlines() throws Exception {
        String token = register("calendar-sales-user@example.com");
        LocalDate base = LocalDate.now().plusDays(60);
        LocalDate actionDeadline = base.plusDays(2);

        Quotation quotation = newQuotation(base, "CAL-QTN-1", "sent", "Sales Test Co");
        quotation = quotationRepository.save(quotation);

        SalesOrder order = new SalesOrder();
        order.setSoNo("CAL-SO-1");
        order.setClientName("Sales Test Co");
        order.setStatus("approved");
        order.setDeliveryDate(base.atStartOfDay());
        order.setActionDeadline(actionDeadline.atStartOfDay());
        order = salesOrderRepository.save(order);

        Invoice invoice = new Invoice();
        invoice.setInvoiceNo("CAL-INV-1");
        invoice.setClientName("Sales Test Co");
        invoice.setStatus("issued");
        invoice.setDueDate(base.atStartOfDay());
        invoice = invoiceRepository.save(invoice);

        DeliveryChallan challan = new DeliveryChallan();
        challan.setDcNo("CAL-DC-1");
        challan.setClientName("Sales Test Co");
        challan.setStatus("dispatched");
        challan.setDispatchDate(base.atStartOfDay());
        challan = deliveryChallanRepository.save(challan);

        SalesContract contract = new SalesContract();
        contract.setScNo("CAL-SC-1");
        contract.setClientName("Sales Test Co");
        contract.setStatus("active");
        contract.setValidity(base.atStartOfDay());
        contract = salesContractRepository.save(contract);

        ProformaInvoice proforma = new ProformaInvoice();
        proforma.setPiNo("CAL-PI-1");
        proforma.setClientName("Sales Test Co");
        proforma.setStatus("sent");
        proforma.setValidTill(base.atStartOfDay());
        proforma = proformaInvoiceRepository.save(proforma);

        CreditNote creditNote = new CreditNote();
        creditNote.setCnNo("CAL-CN-1");
        creditNote.setClientName("Sales Test Co");
        creditNote.setStatus("issued");
        creditNote.setDueDateOverride(base.atStartOfDay());
        creditNote = creditNoteRepository.save(creditNote);

        JsonNode body = getEntries(token, base.toString(), actionDeadline.toString());
        assertThat(sourceNames(body))
                .as("the Sales module is read for a caller holding SALES_VIEW")
                .contains("sales");
        assertThat(body.path("unavailableSources")).isEmpty();

        JsonNode quotationEntry = findEntry(body,
                "sales:Quotation:" + quotation.getId() + ":validUntil:" + base);
        assertThat(quotationEntry).as("a quotation's valid-until date is a deadline").isNotNull();
        assertThat(quotationEntry.path("category").asText()).isEqualTo("sales");
        assertThat(quotationEntry.path("status").asText()).isEqualTo("sent");
        assertThat(quotationEntry.path("title").asText()).contains("CAL-QTN-1").contains("Sales Test Co");
        assertThat(quotationEntry.path("linkPath").asText())
                .isEqualTo("/quotations/" + quotation.getId() + "/view");
        assertThat(quotationEntry.path("readOnly").asBoolean()).isTrue();
        // Sales dates are date-only: no time is invented from the stored midnight.
        assertThat(quotationEntry.path("startTime").isNull()).isTrue();
        assertThat(quotationEntry.path("allDay").asBoolean()).isTrue();

        JsonNode delivery = findEntry(body,
                "sales:SalesOrder:" + order.getId() + ":deliveryDate:" + base);
        assertThat(delivery).as("the CPO delivery date is published").isNotNull();
        assertThat(delivery.path("linkPath").asText()).isEqualTo("/sales-orders/" + order.getId());

        JsonNode action = findEntry(body,
                "sales:SalesOrder:" + order.getId() + ":actionDeadline:" + actionDeadline);
        assertThat(action)
                .as("the CPO action deadline is a second, distinctly identified entry")
                .isNotNull();
        assertThat(action.path("id").asText()).isNotEqualTo(delivery.path("id").asText());

        assertThat(findEntry(body, "sales:Invoice:" + invoice.getId() + ":dueDate:" + base))
                .as("the invoice due date is published")
                .isNotNull();
        assertThat(findEntry(body, "sales:DeliveryChallan:" + challan.getId()
                + ":dispatchDate:" + base)).as("the challan dispatch date is published").isNotNull();
        assertThat(findEntry(body, "sales:SalesContract:" + contract.getId()
                + ":validity:" + base)).as("the contract validity is published").isNotNull();
        assertThat(findEntry(body, "sales:ProformaInvoice:" + proforma.getId()
                + ":validTill:" + base)).as("the proforma valid-till date is published").isNotNull();
        assertThat(findEntry(body, "sales:CreditNote:" + creditNote.getId()
                + ":dueDateOverride:" + base)).as("a credit note's own due date is published").isNotNull();
    }

    @Test
    void salesEntriesKeepTheRecordsOwnStatusAndAnyRealStoredTime() throws Exception {
        String token = register("calendar-sales-semantics-user@example.com");
        LocalDate past = LocalDate.now().minusDays(5);

        // Past its valid-until date but still stored as 'sent': the Calendar
        // must publish the record's own status, not derive 'expired'/'overdue'.
        Quotation pastDeadline = quotationRepository.save(
                newQuotation(past, "CAL-QTN-PAST", "sent", "Past Co"));

        Quotation timed = new Quotation();
        timed.setQuotationNo("CAL-QTN-TIMED");
        timed.setStatus("sent");
        timed.setValidUntil(past.atTime(14, 30));
        timed = quotationRepository.save(timed);

        JsonNode body = getEntries(token, past.toString(), past.toString());

        JsonNode expiredEntry = findEntry(body,
                "sales:Quotation:" + pastDeadline.getId() + ":validUntil:" + past);
        assertThat(expiredEntry).isNotNull();
        assertThat(expiredEntry.path("status").asText())
                .as("no overdue/expired state is invented for a past date")
                .isEqualTo("sent");

        JsonNode timedEntry = findEntry(body,
                "sales:Quotation:" + timed.getId() + ":validUntil:" + past);
        assertThat(timedEntry).isNotNull();
        assertThat(timedEntry.path("startTime").asText())
                .as("a genuinely stored time is preserved")
                .isEqualTo("14:30");
        assertThat(timedEntry.path("allDay").asBoolean()).isFalse();
    }

    @Test
    void salesEntriesAreRestrictedToTheInclusiveRange() throws Exception {
        String token = register("calendar-sales-range-user@example.com");
        LocalDate from = LocalDate.now().plusDays(70);
        LocalDate to = from.plusDays(4);

        Quotation first = quotationRepository.save(newQuotation(from, "CAL-QTN-FIRST", "sent", null));
        Quotation last = quotationRepository.save(newQuotation(to, "CAL-QTN-LAST", "sent", null));
        Quotation before = quotationRepository.save(
                newQuotation(from.minusDays(1), "CAL-QTN-BEFORE", "sent", null));
        Quotation after = quotationRepository.save(
                newQuotation(to.plusDays(1), "CAL-QTN-AFTER", "sent", null));
        // A real record without a usable date is not turned into an entry.
        Quotation undated = new Quotation();
        undated.setQuotationNo("CAL-QTN-UNDATED");
        undated.setStatus("sent");
        undated = quotationRepository.save(undated);

        JsonNode body = getEntries(token, from.toString(), to.toString());

        assertThat(findEntry(body, "sales:Quotation:" + first.getId() + ":validUntil:" + from)).isNotNull();
        assertThat(findEntry(body, "sales:Quotation:" + last.getId() + ":validUntil:" + to)).isNotNull();
        assertThat(findEntry(body, "sales:Quotation:" + before.getId()
                + ":validUntil:" + from.minusDays(1))).isNull();
        assertThat(findEntry(body, "sales:Quotation:" + after.getId()
                + ":validUntil:" + to.plusDays(1))).isNull();
        assertThat(findEntry(body, "sales:Quotation:" + undated.getId()
                + ":validUntil:" + from)).isNull();
    }

    @Test
    void salesEntriesExcludeDeletedArchivedAndSupersededRevisions() throws Exception {
        String token = register("calendar-sales-exclusion-user@example.com");
        LocalDate date = LocalDate.now().plusDays(80);

        Quotation deleted = quotationRepository.save(
                newQuotation(date, "CAL-QTN-DELETED", "deleted", null));
        Quotation archived = quotationRepository.save(
                newQuotation(date, "CAL-QTN-ARCHIVED", "archived", null));

        // The previous revision of an edited quotation is history, not a second
        // deadline: only the current revision of the chain is published.
        Quotation previousRevision = newQuotation(date, "CAL-QTN-REV-0", "sent", null);
        previousRevision.setRevision(0);
        previousRevision.setLatestRevision(false);
        previousRevision = quotationRepository.save(previousRevision);

        Quotation currentRevision = newQuotation(date, "CAL-QTN-REV-1", "sent", null);
        currentRevision.setRevisionOf(previousRevision.getId());
        currentRevision.setRevision(1);
        currentRevision.setLatestRevision(true);
        currentRevision = quotationRepository.save(currentRevision);

        // A payment receipt records money already received, not a deadline, so
        // it is deliberately not published on the calendar.
        PaymentReceipt receipt = new PaymentReceipt();
        receipt.setReceiptNo("CAL-PR-1");
        receipt.setPaymentDate(date.atStartOfDay());
        receipt.setStatus("received");
        receipt = paymentReceiptRepository.save(receipt);

        JsonNode body = getEntries(token, date.toString(), date.toString());

        assertThat(findEntry(body, "sales:Quotation:" + deleted.getId()
                + ":validUntil:" + date)).isNull();
        assertThat(findEntry(body, "sales:Quotation:" + archived.getId()
                + ":validUntil:" + date)).isNull();
        assertThat(findEntry(body, "sales:Quotation:" + previousRevision.getId()
                + ":validUntil:" + date)).isNull();
        assertThat(findEntry(body, "sales:Quotation:" + currentRevision.getId()
                + ":validUntil:" + date)).as("the current revision is published once").isNotNull();
        assertThat(findEntry(body, "sales:PaymentReceipt:" + receipt.getId()
                + ":paymentDate:" + date)).isNull();

        long currentRevisionEntries = 0;
        for (JsonNode entry : body.path("entries")) {
            if (entry.path("id").asText().startsWith("sales:Quotation:" + currentRevision.getId() + ":")) {
                currentRevisionEntries++;
            }
        }
        assertThat(currentRevisionEntries).isEqualTo(1);
    }

    @Test
    void salesEntriesDoNotDisplaceTheExistingCrmFeed() throws Exception {
        String token = register("calendar-sales-isolation-user@example.com");
        LocalDate date = LocalDate.now().plusDays(90);

        FollowUp followUp = newFollowUp(date, "Open");
        followUp.setCompanyName("Still Working Co");
        followUp = followUpRepository.save(followUp);

        JsonNode body = getEntries(token, date.toString(), date.toString());

        assertThat(sourceNames(body)).contains("crm", "sales");
        assertThat(body.path("unavailableSources")).isEmpty();
        assertThat(findEntry(body, "crm:FollowUp:" + followUp.getId()
                + ":followupDate:" + date)).isNotNull();
    }

    /* ------------------------------------------------------------- purchase */

    @Test
    void purchaseDocumentsPublishTheirOwnStoredDates() throws Exception {
        String token = register("calendar-purchase-user@example.com");
        LocalDate base = LocalDate.now().plusDays(100);

        PurchaseRequisition requisition = newRequisition(
                "CAL-PR-1", "Pending Approval", base.toString());
        requisition.setVendor("Purchase Test Co");
        requisition = purchaseRequisitionRepository.save(requisition);

        PurchaseRfq rfq = newRfq("CAL-RFQ-1", "Sent", base.toString());
        rfq = purchaseRfqRepository.save(rfq);

        PurchaseOrder order = newOrder("CAL-PO-1", "Released", base.toString());
        order = purchaseOrderRepository.save(order);

        PurchaseInvoice invoice = newInvoice("CAL-VINV-1", "Approved", base.toString());
        invoice = purchaseInvoiceRepository.save(invoice);

        PurchaseShipment shipment = newShipment("CAL-SHIP-1", "In Transit", base);
        shipment = purchaseShipmentRepository.save(shipment);

        JsonNode body = getEntries(token, base.toString(), base.toString());
        assertThat(sourceNames(body))
                .as("the Purchase module is read for a caller holding PURCHASE_VIEW")
                .contains("purchase");
        assertThat(body.path("unavailableSources")).isEmpty();

        JsonNode pr = findEntry(body,
                "purchase:PurchaseRequisition:" + requisition.getId() + ":expectedDate:" + base);
        assertThat(pr).as("a live requisition's required delivery date is published").isNotNull();
        assertThat(pr.path("source").asText()).isEqualTo("purchase");
        assertThat(pr.path("entityType").asText()).isEqualTo("PurchaseRequisition");
        assertThat(pr.path("entityId").asLong()).isEqualTo(requisition.getId());
        assertThat(pr.path("title").asText()).contains("CAL-PR-1");
        assertThat(pr.path("status").asText())
                .as("the record's own status is published unchanged")
                .isEqualTo("Pending Approval");
        assertThat(pr.path("category").asText()).isEqualTo("purchase");
        assertThat(pr.path("linkPath").asText())
                .isEqualTo("/purchase/requisition/" + requisition.getId());
        assertThat(pr.path("readOnly").asBoolean()).isTrue();
        assertThat(pr.path("startTime").isNull()).isTrue();
        assertThat(pr.path("endTime").isNull()).isTrue();
        assertThat(pr.path("allDay").asBoolean()).isTrue();

        JsonNode rfqEntry = findEntry(body,
                "purchase:PurchaseRfq:" + rfq.getId() + ":dueDate:" + base);
        assertThat(rfqEntry).as("the RFQ quotation deadline is published").isNotNull();
        assertThat(rfqEntry.path("linkPath").asText()).isEqualTo("/purchase/rfq/" + rfq.getId());
        assertThat(rfqEntry.path("status").asText()).isEqualTo("Sent");

        JsonNode poEntry = findEntry(body,
                "purchase:PurchaseOrder:" + order.getId() + ":expectedDate:" + base);
        assertThat(poEntry).as("a released order's expected delivery is published").isNotNull();
        assertThat(poEntry.path("linkPath").asText()).isEqualTo("/purchase/orders/" + order.getId());

        JsonNode invoiceEntry = findEntry(body,
                "purchase:PurchaseInvoice:" + invoice.getId() + ":dueDate:" + base);
        assertThat(invoiceEntry).as("an unpaid matched invoice's due date is published").isNotNull();
        assertThat(invoiceEntry.path("linkPath").asText())
                .isEqualTo("/purchase/invoices/" + invoice.getId());

        JsonNode shipmentEntry = findEntry(body,
                "purchase:PurchaseShipment:" + shipment.getId() + ":eta:" + base);
        assertThat(shipmentEntry).as("an undelivered shipment's ETA is published").isNotNull();
        assertThat(shipmentEntry.path("linkPath").asText())
                .isEqualTo("/purchase/logistics/shipment/CAL-SHIP-1");
    }

    @Test
    void purchaseEntriesExcludeIneligibleUndatedAndOutOfRangeRecords() throws Exception {
        String token = register("calendar-purchase-exclusion-user@example.com");
        LocalDate date = LocalDate.now().plusDays(110);

        PurchaseRequisition deleted = newRequisition(
                "CAL-PR-DELETED", "Pending Approval", date.toString());
        deleted.setRecordState(PurchaseRequisition.RECORD_DELETED);
        deleted = purchaseRequisitionRepository.save(deleted);

        PurchaseRequisition converted = newRequisition(
                "CAL-PR-CONVERTED", "Converted to RFQ", date.toString());
        converted = purchaseRequisitionRepository.save(converted);

        PurchaseRequisition undated = newRequisition("CAL-PR-UNDATED", "Pending Approval", null);
        undated = purchaseRequisitionRepository.save(undated);

        PurchaseRfq awarded = newRfq("CAL-RFQ-AWARDED", "Awarded", date.toString());
        awarded = purchaseRfqRepository.save(awarded);

        PurchaseOrder draft = newOrder("CAL-PO-DRAFT", "Draft", date.toString());
        draft = purchaseOrderRepository.save(draft);

        PurchaseOrder outsideRange = newOrder(
                "CAL-PO-OUTSIDE", "Released", date.plusDays(1).toString());
        outsideRange = purchaseOrderRepository.save(outsideRange);

        PurchaseInvoice paid = newInvoice("CAL-VINV-PAID", "Approved", date.toString());
        paid.setPaidAmount(paid.getTotal());
        paid = purchaseInvoiceRepository.save(paid);

        PurchaseInvoice submitted = newInvoice("CAL-VINV-SUBMITTED", "Submitted", date.toString());
        submitted = purchaseInvoiceRepository.save(submitted);

        PurchaseInvoice unmatched = newInvoice("CAL-VINV-UNMATCHED", "Approved", date.toString());
        unmatched.setMatchStatus("Pending Match");
        unmatched = purchaseInvoiceRepository.save(unmatched);

        PurchaseShipment delivered = newShipment("CAL-SHIP-DELIVERED", "Delivered", date);
        delivered = purchaseShipmentRepository.save(delivered);

        PurchaseOrder live = newOrder("CAL-PO-LIVE", "Released", date.toString());
        live = purchaseOrderRepository.save(live);

        JsonNode body = getEntries(token, date.toString(), date.toString());

        assertThat(findEntry(body, "purchase:PurchaseRequisition:" + deleted.getId()
                + ":expectedDate:" + date)).as("a deleted requisition is never published").isNull();
        assertThat(findEntry(body, "purchase:PurchaseRequisition:" + converted.getId()
                + ":expectedDate:" + date)).as("a converted requisition has no open deadline").isNull();
        assertThat(findEntry(body, "purchase:PurchaseRequisition:" + undated.getId()
                + ":expectedDate:" + date)).as("an undated requisition produces no entry").isNull();
        assertThat(findEntry(body, "purchase:PurchaseRfq:" + awarded.getId()
                + ":dueDate:" + date)).as("an awarded RFQ's deadline is history").isNull();
        assertThat(findEntry(body, "purchase:PurchaseOrder:" + draft.getId()
                + ":expectedDate:" + date)).as("a draft order is not a commitment").isNull();
        assertThat(findEntry(body, "purchase:PurchaseOrder:" + outsideRange.getId()
                + ":expectedDate:" + date.plusDays(1))).as("outside the range").isNull();
        assertThat(findEntry(body, "purchase:PurchaseInvoice:" + paid.getId()
                + ":dueDate:" + date)).as("a paid invoice has no payment due").isNull();
        assertThat(findEntry(body, "purchase:PurchaseInvoice:" + submitted.getId()
                + ":dueDate:" + date)).as("an unapproved invoice is not yet payable").isNull();
        assertThat(findEntry(body, "purchase:PurchaseInvoice:" + unmatched.getId()
                + ":dueDate:" + date)).as("an unmatched invoice is not yet payable").isNull();
        assertThat(findEntry(body, "purchase:PurchaseShipment:" + delivered.getId()
                + ":eta:" + date)).as("a delivered shipment's ETA is history").isNull();

        assertThat(findEntry(body, "purchase:PurchaseOrder:" + live.getId()
                + ":expectedDate:" + date)).as("an eligible order is still published").isNotNull();
    }

    @Test
    void purchaseEntriesDoNotDisplaceTheExistingFeeds() throws Exception {
        String token = register("calendar-purchase-isolation-user@example.com");
        LocalDate date = LocalDate.now().plusDays(120);

        FollowUp followUp = newFollowUp(date, "Open");
        followUp.setCompanyName("Purchase Isolation Co");
        followUp = followUpRepository.save(followUp);

        Quotation quotation = quotationRepository.save(
                newQuotation(date, "CAL-QTN-PURCHASE", "sent", "Purchase Isolation Co"));

        PurchaseOrder order = purchaseOrderRepository.save(
                newOrder("CAL-PO-ISOLATION", "In Progress", date.toString()));

        JsonNode body = getEntries(token, date.toString(), date.toString());

        assertThat(sourceNames(body)).contains("crm", "sales", "purchase");
        assertThat(body.path("unavailableSources")).isEmpty();
        assertThat(findEntry(body, "crm:FollowUp:" + followUp.getId()
                + ":followupDate:" + date)).isNotNull();
        assertThat(findEntry(body, "sales:Quotation:" + quotation.getId()
                + ":validUntil:" + date)).isNotNull();
        assertThat(findEntry(body, "purchase:PurchaseOrder:" + order.getId()
                + ":expectedDate:" + date)).isNotNull();
    }

    /* ------------------------------------------------------------------ cpr */

    @Test
    void cprSourceIsGatedByTheCprViewAuthority() {
        // Every existing role (ADMIN/MANAGER/USER) already holds CPR_VIEW, so a
        // real account cannot be built that lacks it; the gate itself is proven
        // generically in CalendarAggregationServiceTests, and what CPR must get
        // right is declaring the right authority and source key.
        assertThat(cprCalendarAdapter.source()).isEqualTo("cpr");
        assertThat(cprCalendarAdapter.requiredAuthority()).isEqualTo("CPR_VIEW");
    }

    @Test
    void cprRequiredDateIsPublishedForAnActiveCurrentRecord() throws Exception {
        String token = register("calendar-cpr-user@example.com");
        LocalDate date = LocalDate.now().plusDays(130);

        Cpr cpr = newCpr("CAL-CPR-1", CprStatus.DRAFT, date, null, null);
        cpr.setClientName("CPR Test Co");
        cpr = cprRepository.save(cpr);

        JsonNode body = getEntries(token, date.toString(), date.toString());
        assertThat(sourceNames(body))
                .as("the CPR module is read for a caller holding CPR_VIEW")
                .contains("cpr");
        assertThat(body.path("unavailableSources")).isEmpty();

        JsonNode entry = findEntry(body,
                "cpr:Cpr:" + cpr.getId() + ":requiredDate:" + date);
        assertThat(entry).as("a CPR's required date is published").isNotNull();
        assertThat(entry.path("source").asText()).isEqualTo("cpr");
        assertThat(entry.path("entityType").asText()).isEqualTo("Cpr");
        assertThat(entry.path("entityId").asLong()).isEqualTo(cpr.getId());
        assertThat(entry.path("title").asText()).contains("CAL-CPR-1").contains("CPR Test Co");
        assertThat(entry.path("date").asText()).isEqualTo(date.toString());
        // The record's own stored status, unchanged.
        assertThat(entry.path("status").asText()).isEqualTo("DRAFT");
        assertThat(entry.path("category").asText()).isEqualTo("cpr");
        assertThat(entry.path("linkPath").asText()).isEqualTo("/cprs/" + cpr.getId());
        assertThat(entry.path("readOnly").asBoolean()).isTrue();
        // A date-only field: no time of day is invented.
        assertThat(entry.path("startTime").isNull()).isTrue();
        assertThat(entry.path("endTime").isNull()).isTrue();
        assertThat(entry.path("allDay").asBoolean()).isTrue();
    }

    @Test
    void cprPublishesTheEffectiveDeadlineExactlyOnce() throws Exception {
        String token = register("calendar-cpr-deadline-user@example.com");
        LocalDate original = LocalDate.now().plusDays(140);
        LocalDate extended = original.plusDays(14);

        // Extended deadline wins; the superseded original must not be drawn too.
        Cpr extendedCpr = newCpr("CAL-CPR-EXT", CprStatus.DRAFT, null, original, extended);
        extendedCpr = cprRepository.save(extendedCpr);

        // No extension: the original is the effective deadline.
        Cpr plainCpr = newCpr("CAL-CPR-PLAIN", CprStatus.PENDING_APPROVAL, null, original, null);
        plainCpr = cprRepository.save(plainCpr);

        // A Custom extension with no base deadline is still a real deadline.
        Cpr extensionOnly = newCpr("CAL-CPR-EXTONLY", CprStatus.APPROVED, null, null, extended);
        extensionOnly = cprRepository.save(extensionOnly);

        // Neither field populated: nothing is fabricated.
        Cpr undated = newCpr("CAL-CPR-UNDATED", CprStatus.DRAFT, null, null, null);
        undated = cprRepository.save(undated);

        JsonNode body = getEntries(token, original.toString(), extended.toString());

        JsonNode extendedEntry = findEntry(body,
                "cpr:Cpr:" + extendedCpr.getId() + ":effectiveDeadline:" + extended);
        assertThat(extendedEntry)
                .as("the extension is the published effective deadline")
                .isNotNull();
        assertThat(extendedEntry.path("title").asText()).contains("CAL-CPR-EXT");
        assertThat(extendedEntry.path("status").asText()).isEqualTo("DRAFT");
        assertThat(extendedEntry.path("allDay").asBoolean()).isTrue();
        assertThat(findEntry(body,
                "cpr:Cpr:" + extendedCpr.getId() + ":effectiveDeadline:" + original))
                .as("the superseded original deadline is not published as well")
                .isNull();

        long deadlineEntries = 0;
        for (JsonNode entry : body.path("entries")) {
            if (entry.path("id").asText()
                    .startsWith("cpr:Cpr:" + extendedCpr.getId() + ":effectiveDeadline:")) {
                deadlineEntries++;
            }
        }
        assertThat(deadlineEntries).as("one entry per CPR for the effective deadline")
                .isEqualTo(1);

        assertThat(findEntry(body,
                "cpr:Cpr:" + plainCpr.getId() + ":effectiveDeadline:" + original))
                .as("without an extension the original deadline is the effective one")
                .isNotNull();
        assertThat(findEntry(body,
                "cpr:Cpr:" + extensionOnly.getId() + ":effectiveDeadline:" + extended))
                .as("an extension without a base deadline is still published")
                .isNotNull();
        assertThat(findEntry(body,
                "cpr:Cpr:" + undated.getId() + ":effectiveDeadline:" + original)).isNull();
        assertThat(findEntry(body,
                "cpr:Cpr:" + undated.getId() + ":requiredDate:" + original)).isNull();
    }

    @Test
    void cprConvertedRecordsKeepTheRequiredDateButNotTheQuotationDeadline() throws Exception {
        String token = register("calendar-cpr-converted-user@example.com");
        LocalDate date = LocalDate.now().plusDays(150);

        Cpr converted = newCpr("CAL-CPR-CONVERTED", CprStatus.CONVERTED, date, date, null);
        converted = cprRepository.save(converted);

        JsonNode body = getEntries(token, date.toString(), date.toString());

        assertThat(findEntry(body,
                "cpr:Cpr:" + converted.getId() + ":requiredDate:" + date))
                .as("the customer's required date is still a CPR fact after conversion")
                .isNotNull();
        assertThat(findEntry(body,
                "cpr:Cpr:" + converted.getId() + ":effectiveDeadline:" + date))
                .as("the resulting quotation already carries the deadline on the Sales feed")
                .isNull();
    }

    @Test
    void cprArchivedDeletedAndSupersededRevisionsAreExcluded() throws Exception {
        String token = register("calendar-cpr-exclusion-user@example.com");
        LocalDate date = LocalDate.now().plusDays(160);

        Cpr archived = newCpr("CAL-CPR-ARCHIVED", CprStatus.ARCHIVED, date, date, null);
        archived.setArchivedAt(LocalDateTime.now());
        archived = cprRepository.save(archived);

        Cpr deleted = newCpr("CAL-CPR-DELETED", CprStatus.DELETED, date, date, null);
        deleted.setArchivedAt(LocalDateTime.now());
        deleted = cprRepository.save(deleted);

        // The previous revision of an edited CPR is history, not a second date.
        Cpr previousRevision = newCpr(
                "CAL-CPR-REV-0", CprStatus.DRAFT, date, date, null);
        previousRevision.setRevision(0);
        previousRevision.setLatestRevision(false);
        previousRevision = cprRepository.save(previousRevision);

        Cpr currentRevision = newCpr("CAL-CPR-REV-1", CprStatus.DRAFT, date, date, null);
        currentRevision.setRevisionOf(previousRevision.getId());
        currentRevision.setRevision(1);
        currentRevision.setLatestRevision(true);
        currentRevision = cprRepository.save(currentRevision);

        JsonNode body = getEntries(token, date.toString(), date.toString());

        assertThat(findEntry(body, "cpr:Cpr:" + archived.getId()
                + ":requiredDate:" + date)).as("an archived CPR is not published").isNull();
        assertThat(findEntry(body, "cpr:Cpr:" + archived.getId()
                + ":effectiveDeadline:" + date)).isNull();
        assertThat(findEntry(body, "cpr:Cpr:" + deleted.getId()
                + ":requiredDate:" + date)).as("a deleted CPR is not published").isNull();
        assertThat(findEntry(body, "cpr:Cpr:" + deleted.getId()
                + ":effectiveDeadline:" + date)).isNull();
        assertThat(findEntry(body, "cpr:Cpr:" + previousRevision.getId()
                + ":requiredDate:" + date)).as("a superseded revision is not published").isNull();
        assertThat(findEntry(body, "cpr:Cpr:" + currentRevision.getId()
                + ":requiredDate:" + date)).as("the current revision is published").isNotNull();
        assertThat(findEntry(body, "cpr:Cpr:" + currentRevision.getId()
                + ":effectiveDeadline:" + date))
                .as("both of the current revision's dates are published")
                .isNotNull();
    }

    @Test
    void cprEntriesCoexistWithEveryOtherCalendarSource() throws Exception {
        String token = register("calendar-cpr-isolation-user@example.com");
        LocalDate date = LocalDate.now().plusDays(170);

        FollowUp followUp = newFollowUp(date, "Open");
        followUp.setCompanyName("CPR Isolation Co");
        followUp = followUpRepository.save(followUp);

        Quotation quotation = quotationRepository.save(
                newQuotation(date, "CAL-QTN-CPR", "sent", "CPR Isolation Co"));

        PurchaseOrder order = purchaseOrderRepository.save(
                newOrder("CAL-PO-CPR", "Released", date.toString()));

        Cpr cpr = cprRepository.save(
                newCpr("CAL-CPR-ISOLATION", CprStatus.PENDING_APPROVAL, date, null, null));

        JsonNode body = getEntries(token, date.toString(), date.toString());

        assertThat(sourceNames(body)).contains("crm", "marketing", "purchase", "sales", "cpr");
        assertThat(body.path("unavailableSources"))
                .as("no source may be reported unavailable because CPR joined the feed")
                .isEmpty();
        assertThat(findEntry(body, "crm:FollowUp:" + followUp.getId()
                + ":followupDate:" + date)).isNotNull();
        assertThat(findEntry(body, "sales:Quotation:" + quotation.getId()
                + ":validUntil:" + date)).isNotNull();
        assertThat(findEntry(body, "purchase:PurchaseOrder:" + order.getId()
                + ":expectedDate:" + date)).isNotNull();
        assertThat(findEntry(body, "cpr:Cpr:" + cpr.getId()
                + ":requiredDate:" + date)).isNotNull();
    }

    /* ----------------------------------------------------------- production */

    @Test
    void productionSourceIsGatedByTheProductionViewAuthority() {
        // Every role holds PRODUCTION_VIEW, so no real account can exercise the
        // negative branch; the authority itself is what this adapter must get right.
        assertThat(productionCalendarAdapter.source()).isEqualTo("production");
        assertThat(productionCalendarAdapter.requiredAuthority()).isEqualTo("PRODUCTION_VIEW");
    }

    @Test
    void productionDueDateIsPublishedForAnEligibleWorkOrder() throws Exception {
        String token = register("calendar-production-user@example.com");
        LocalDate due = LocalDate.now().plusDays(200);

        ProductionOrder order = productionOrder(
                "WO-CAL-1", OrderStatus.APPROVED, due, "Production Test Co");
        order = productionOrderRepository.save(order);

        JsonNode body = getEntries(token, due.toString(), due.toString());
        assertThat(sourceNames(body))
                .as("the Production module is read for a caller holding PRODUCTION_VIEW")
                .contains("production");
        assertThat(body.path("unavailableSources")).isEmpty();

        JsonNode entry = findEntry(body,
                "production:ProductionOrder:WO-CAL-1:dueDate:" + due);
        assertThat(entry).as("a Work Order's due date is published").isNotNull();
        assertThat(entry.path("source").asText()).isEqualTo("production");
        assertThat(entry.path("entityType").asText()).isEqualTo("ProductionOrder");
        assertThat(entry.path("entityId").asLong()).isEqualTo(order.getId());
        assertThat(entry.path("title").asText())
                .contains("WO-CAL-1").contains("Production Test Co");
        assertThat(entry.path("date").asText()).isEqualTo(due.toString());
        // The record's own stored status, shown with the module's label.
        assertThat(entry.path("status").asText()).isEqualTo("Approved");
        assertThat(entry.path("category").asText()).isEqualTo("production");
        assertThat(entry.path("linkPath").asText()).isEqualTo("/production/orders/WO-CAL-1");
        assertThat(entry.path("readOnly").asBoolean()).isTrue();
        // A date-only column: no time of day is invented.
        assertThat(entry.path("startTime").isNull()).isTrue();
        assertThat(entry.path("endTime").isNull()).isTrue();
        assertThat(entry.path("allDay").asBoolean()).isTrue();
    }

    @Test
    void productionExcludesTerminalAndCancelledStatusesButKeepsDraft() throws Exception {
        String token = register("calendar-production-exclusion-user@example.com");
        LocalDate due = LocalDate.now().plusDays(210);

        // Short work-order numbers: the column is 20 characters wide.
        Map<OrderStatus, String> workOrders = new java.util.LinkedHashMap<>();
        workOrders.put(OrderStatus.COMPLETED, "WO-CAL-EX1");
        workOrders.put(OrderStatus.DISPATCHED, "WO-CAL-EX2");
        workOrders.put(OrderStatus.CANCELLED, "WO-CAL-EX3");
        workOrders.put(OrderStatus.FAILED, "WO-CAL-EX4");
        workOrders.put(OrderStatus.PRODUCTION_REJECTED, "WO-CAL-EX5");
        workOrders.put(OrderStatus.ADMIN_REJECTED, "WO-CAL-EX6");
        for (Map.Entry<OrderStatus, String> row : workOrders.entrySet()) {
            productionOrderRepository.save(productionOrder(
                    row.getValue(), row.getKey(), due, "Excluded Co"));
        }

        // A draft is a live plan in the Production module's own rules, so it is
        // published (same decision as CPR's drafts).
        productionOrderRepository.save(productionOrder(
                "WO-CAL-DRAFT", OrderStatus.DRAFT, due, "Draft Co"));

        JsonNode body = getEntries(token, due.toString(), due.toString());

        for (Map.Entry<OrderStatus, String> row : workOrders.entrySet()) {
            assertThat(findEntry(body,
                    "production:ProductionOrder:" + row.getValue() + ":dueDate:" + due))
                    .as("%s must not be published", row.getKey())
                    .isNull();
        }
        JsonNode draft = findEntry(body,
                "production:ProductionOrder:WO-CAL-DRAFT:dueDate:" + due);
        assertThat(draft).as("a draft Work Order still carries a plan").isNotNull();
        assertThat(draft.path("status").asText()).isEqualTo("Draft");
    }

    @Test
    void productionSkipsWorkOrdersWithoutADueDate() throws Exception {
        String token = register("calendar-production-undated-user@example.com");
        LocalDate date = LocalDate.now().plusDays(220);

        productionOrderRepository.save(productionOrder(
                "WO-CAL-UNDATED", OrderStatus.APPROVED, null, "Undated Co"));
        // An out-of-range due date is not pulled into the requested day either.
        productionOrderRepository.save(productionOrder(
                "WO-CAL-OUTSIDE", OrderStatus.APPROVED, date.plusDays(1), "Outside Co"));

        JsonNode body = getEntries(token, date.toString(), date.toString());

        assertThat(findEntry(body,
                "production:ProductionOrder:WO-CAL-UNDATED:dueDate:" + date)).isNull();
        assertThat(findEntry(body,
                "production:ProductionOrder:WO-CAL-OUTSIDE:dueDate:" + date.plusDays(1)))
                .as("a due date outside the requested range is not returned").isNull();
    }

    @Test
    void productionEntriesCoexistWithEveryOtherCalendarSource() throws Exception {
        String token = register("calendar-production-isolation-user@example.com");
        LocalDate date = LocalDate.now().plusDays(230);

        FollowUp followUp = newFollowUp(date, "Open");
        followUp.setCompanyName("Production Isolation Co");
        followUp = followUpRepository.save(followUp);

        Quotation quotation = quotationRepository.save(
                newQuotation(date, "CAL-QTN-PROD", "sent", "Production Isolation Co"));

        PurchaseOrder purchaseOrder = purchaseOrderRepository.save(
                newOrder("CAL-PO-PROD", "Released", date.toString()));

        Cpr cpr = cprRepository.save(
                newCpr("CAL-CPR-PROD", CprStatus.PENDING_APPROVAL, date, null, null));

        productionOrderRepository.save(productionOrder(
                "WO-CAL-ISOLATION", OrderStatus.APPROVED, date, "Production Isolation Co"));

        JsonNode body = getEntries(token, date.toString(), date.toString());

        assertThat(sourceNames(body))
                .contains("cpr", "crm", "marketing", "purchase", "sales", "production");
        assertThat(body.path("unavailableSources"))
                .as("no source may be reported unavailable because Production joined the feed")
                .isEmpty();
        assertThat(findEntry(body, "crm:FollowUp:" + followUp.getId()
                + ":followupDate:" + date)).isNotNull();
        assertThat(findEntry(body, "sales:Quotation:" + quotation.getId()
                + ":validUntil:" + date)).isNotNull();
        assertThat(findEntry(body, "purchase:PurchaseOrder:" + purchaseOrder.getId()
                + ":expectedDate:" + date)).isNotNull();
        assertThat(findEntry(body, "cpr:Cpr:" + cpr.getId()
                + ":requiredDate:" + date)).isNotNull();
        assertThat(findEntry(body, "production:ProductionOrder:WO-CAL-ISOLATION"
                + ":dueDate:" + date)).isNotNull();
    }

    /* --------------------------------------------------------- read-only shape */

    @Test
    void thereIsNoWriteMappingOnTheCalendarEndpoint() throws Exception {
        String token = register("calendar-readonly-user@example.com");

        mockMvc.perform(post(PATH).header("Authorization", "Bearer " + token))
                .andExpect(status().isMethodNotAllowed());
    }

    /* -------------------------------------------------------------- helpers */

    private String register(String email) throws Exception {
        String password = "password123";
        MvcResult result = mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "fullName", "Calendar Test User",
                                "email", email,
                                "password", password))))
                .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("token").asText();
    }

    private JsonNode getEntries(String token, String from, String to) throws Exception {
        MvcResult result = mockMvc.perform(get(PATH)
                        .header("Authorization", "Bearer " + token)
                        .param("from", from)
                        .param("to", to))
                .andReturn();
        assertThat(result.getResponse().getStatus())
                .as("GET %s?from=%s&to=%s -> %s", PATH, from, to, result.getResponse().getContentAsString())
                .isEqualTo(200);
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    /** The module keys the response reports as read. */
    private static java.util.List<String> sourceNames(JsonNode body) {
        java.util.List<String> sources = new java.util.ArrayList<>();
        body.path("sources").forEach(node -> sources.add(node.asText()));
        return sources;
    }

    private static JsonNode findEntry(JsonNode body, String id) {
        Map<String, JsonNode> byId = new HashMap<>();
        body.path("entries").forEach(entry -> byId.put(entry.path("id").asText(), entry));
        return byId.get(id);
    }

    private static FollowUp newFollowUp(LocalDate date, String status) {
        FollowUp followUp = new FollowUp();
        followUp.setFollowupDate(date);
        followUp.setStatus(status);
        return followUp;
    }

    private static FollowUp namedFollowUp(LocalDate date, String company) {
        FollowUp followUp = newFollowUp(date, "Open");
        followUp.setCompanyName(company);
        return followUp;
    }

    private static Quotation newQuotation(LocalDate validUntil, String number, String status, String client) {
        Quotation quotation = new Quotation();
        quotation.setQuotationNo(number);
        quotation.setStatus(status);
        quotation.setClientName(client);
        quotation.setValidUntil(validUntil.atStartOfDay());
        return quotation;
    }

    private static PurchaseRequisition newRequisition(String prNo, String status, String expectedDate) {
        PurchaseRequisition requisition = new PurchaseRequisition();
        requisition.setPrNo(prNo);
        requisition.setTitle("Calendar test requisition");
        requisition.setStatus(status);
        requisition.setExpectedDate(expectedDate);
        requisition.setVendor("Purchase Test Co");
        requisition.setRecordState(PurchaseRequisition.RECORD_ACTIVE);
        return requisition;
    }

    private static PurchaseRfq newRfq(String rfqNo, String status, String dueDate) {
        PurchaseRfq rfq = new PurchaseRfq();
        rfq.setRfqNo(rfqNo);
        rfq.setTitle("Calendar test RFQ");
        rfq.setStatus(status);
        rfq.setDueDate(dueDate);
        return rfq;
    }

    private static PurchaseOrder newOrder(String poNo, String status, String expectedDate) {
        PurchaseOrder order = new PurchaseOrder();
        order.setPoNo(poNo);
        order.setTitle("Calendar test order");
        order.setVendor("Purchase Test Co");
        order.setStatus(status);
        order.setExpectedDate(expectedDate);
        return order;
    }

    private static PurchaseInvoice newInvoice(String invoiceNo, String status, String dueDate) {
        PurchaseInvoice invoice = new PurchaseInvoice();
        invoice.setInvoiceNo(invoiceNo);
        invoice.setVendorInvoiceNo("VENDOR-" + invoiceNo);
        invoice.setVendor("Purchase Test Co");
        invoice.setPoNo("CAL-PO-1");
        invoice.setStatus(status);
        invoice.setMatchStatus("Matched");
        invoice.setDueDate(dueDate);
        invoice.setPaidAmount(java.math.BigDecimal.ZERO);
        invoice.setTotal(new java.math.BigDecimal("1000.00"));
        return invoice;
    }

    private static PurchaseShipment newShipment(String shipmentNo, String status, LocalDate eta) {
        PurchaseShipment shipment = new PurchaseShipment();
        shipment.setShipmentNo(shipmentNo);
        shipment.setPoNo("CAL-PO-1");
        shipment.setVendor("Purchase Test Co");
        shipment.setStatus(status);
        shipment.setEta(eta);
        return shipment;
    }

    private static ProductionOrder productionOrder(String workOrder, OrderStatus status,
                                                   LocalDate dueDate, String customer) {
        ProductionOrder order = new ProductionOrder();
        order.setWorkOrder(workOrder);
        order.setStatus(status);
        order.setDueDate(dueDate);
        order.setCustomer(customer);
        order.setProductionType(com.vishatech.erp.entity.production.ProductionType.CASTING);
        return order;
    }

    private static Cpr newCpr(String prNo, CprStatus status, LocalDate requiredDate,
                             LocalDate quotationDeadline, LocalDate extendedDeadline) {
        Cpr cpr = new Cpr();
        cpr.setPrNo(prNo);
        cpr.setStatus(status);
        cpr.setClientName("CPR Test Co");
        cpr.setRequiredDate(requiredDate == null ? null : requiredDate.atStartOfDay());
        cpr.setQuotationDeadline(quotationDeadline);
        cpr.setExtendedDeadline(extendedDeadline);
        return cpr;
    }
}
