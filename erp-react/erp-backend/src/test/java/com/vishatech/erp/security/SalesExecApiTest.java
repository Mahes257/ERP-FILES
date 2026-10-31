package com.vishatech.erp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Sales Execution API verification for the migrated SOURCE implementation:
 * authorization on the new endpoint families, the Customer Purchase Order
 * E-Actions CRUD flow, the Quotation Overview remarks, the optional Reference
 * PR No (Direct PR Reference) and the conversion-reference recording.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class SalesExecApiTest extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private String register(String email, String name) throws Exception {
        MvcResult result = mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "fullName", name,
                                "email", email,
                                "password", "password123"))))
                .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("token").asText();
    }

    @Test
    void salesExecutionEndpointsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/sales-orders/e-actions")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/quotations/1/remarks")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/pr-references")).andExpect(status().isUnauthorized());
    }

    @Test
    void cpoEActionsCrudFlowWorks() throws Exception {
        String token = register("so-eaction@example.com", "E-Action User");

        MvcResult order = mockMvc.perform(post("/sales-orders?draft=true")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "clientName", "E-Action Client",
                                "releaseMethod", "E-AUCTION",
                                "participationRequired", true))))
                .andExpect(status().isCreated())
                .andReturn();
        long orderId = objectMapper.readTree(order.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        MvcResult created = mockMvc.perform(post("/sales-orders/" + orderId + "/e-actions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "participantTeam", "Commercial",
                                "assignedAction", "Review the quotation",
                                "assignedTo", "QA User",
                                "status", "Pending",
                                "remarks", "Please review"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.participantTeam").value("Commercial"))
                .andReturn();
        long actionId = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        // The standalone E-Actions view reads the SAME rows across all CPOs.
        mockMvc.perform(get("/sales-orders/e-actions")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].participantTeam").value("Commercial"));

        mockMvc.perform(get("/sales-orders/e-actions/" + actionId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.assignedAction").value("Review the quotation"));

        // The CPO's own payload carries its E-Action rows.
        mockMvc.perform(get("/sales-orders/" + orderId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.eActions[0].participantTeam").value("Commercial"));

        // Deleting approves SALES_DELETE, which a plain USER does not hold.
        mockMvc.perform(delete("/sales-orders/" + orderId + "/e-actions/" + actionId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    /**
     * Sales E-Action revision lifecycle through the real API and an isolated H2
     * database: the first edit stores the state it replaced, a repeated no-op
     * save stores nothing, a second edit appends the next version, a failed edit
     * stores nothing, and one action's history is never returned for another.
     */
    @Test
    void eActionEditsAppendPersistentRevisionSnapshots() throws Exception {
        String email = "eaction-revisions@example.com";
        String token = register(email, "E-Action Revision User");

        MvcResult order = mockMvc.perform(post("/sales-orders?draft=true")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "clientName", "Revision Client",
                                "releaseMethod", "E-AUCTION"))))
                .andExpect(status().isCreated())
                .andReturn();
        long orderId = objectMapper.readTree(order.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        long actionId = createEAction(token, orderId, "Revision action", "first remark");
        long untouchedId = createEAction(token, orderId, "Untouched action", "other remark");

        // A newly created E-Action has no revision history.
        mockMvc.perform(get("/sales-orders/e-actions/" + actionId + "/revisions")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty());

        Map<String, Object> firstEdit = eActionPayload("Revision action", "second remark");
        mockMvc.perform(put("/sales-orders/" + orderId + "/e-actions/" + actionId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(firstEdit)))
                .andExpect(status().isOk());

        // One snapshot, holding the values that were replaced.
        mockMvc.perform(get("/sales-orders/e-actions/" + actionId + "/revisions")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].version").value(1))
                .andExpect(jsonPath("$.data[0].fields.remarks").value("first remark"))
                .andExpect(jsonPath("$.data[0].changedBy").value(email));

        // The same submission saved again is not another edit.
        mockMvc.perform(put("/sales-orders/" + orderId + "/e-actions/" + actionId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(firstEdit)))
                .andExpect(status().isOk());
        mockMvc.perform(get("/sales-orders/e-actions/" + actionId + "/revisions")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.data.length()").value(1));

        // A second genuine edit appends version 2 with the state version 1 left.
        mockMvc.perform(put("/sales-orders/" + orderId + "/e-actions/" + actionId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(eActionPayload("Revision action", "third remark"))))
                .andExpect(status().isOk());
        mockMvc.perform(get("/sales-orders/e-actions/" + actionId + "/revisions")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[1].version").value(2))
                .andExpect(jsonPath("$.data[1].fields.remarks").value("second remark"));

        // A rejected edit (unknown CPO) creates no revision and changes no row.
        Map<String, Object> invalid = new java.util.LinkedHashMap<>(eActionPayload("Revision action", "should not persist"));
        invalid.put("salesOrderId", 99999999);
        mockMvc.perform(put("/sales-orders/e-actions/" + actionId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalid)))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/sales-orders/e-actions/" + actionId + "/revisions")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.data.length()").value(2));
        mockMvc.perform(get("/sales-orders/e-actions/" + actionId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.data.remarks").value("third remark"));

        // Another E-Action's empty history is not widened by this record's rows.
        mockMvc.perform(get("/sales-orders/e-actions/" + untouchedId + "/revisions")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty());

        // Field-level edit history is scoped to the same record.
        mockMvc.perform(get("/sales-orders/e-actions/" + actionId + "/history")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].version").value(2))
                .andExpect(jsonPath("$.data[0].changes[0].field").value("remarks"));

        mockMvc.perform(get("/sales-orders/e-actions/" + actionId + "/revisions"))
                .andExpect(status().isUnauthorized());
    }

    private long createEAction(String token, long orderId, String assignedAction, String remarks) throws Exception {
        MvcResult created = mockMvc.perform(post("/sales-orders/" + orderId + "/e-actions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "participantTeam", "Commercial",
                                "assignedAction", assignedAction,
                                "assignedTo", "QA User",
                                "status", "Pending",
                                "requestedOn", "2026-10-20",
                                "remarks", remarks))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();
    }

    private static Map<String, Object> eActionPayload(String assignedAction, String remarks) {
        return Map.of(
                "participantTeam", "Commercial",
                "assignedAction", assignedAction,
                "assignedTo", "QA User",
                "status", "Pending",
                "requestedOn", "2026-10-20",
                "remarks", remarks);
    }

    @Test
    void quotationReferencePrNoResolvesAsDirectAndReadsBack() throws Exception {
        String token = register("qtn-refpr@example.com", "Quotation PR User");

        MvcResult created = mockMvc.perform(post("/quotations?draft=true")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "clientName", "Direct PR Client",
                                "referencePrNo", "PR-DIRECT-TEST-01"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.referencePrNo").value("PR-DIRECT-TEST-01"))
                .andExpect(jsonPath("$.data.referencePrSource").value("DIRECT"))
                .andReturn();
        long quotationId = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        // The DIRECT PR No becomes selectable afterwards (pr_references catalog).
        mockMvc.perform(get("/pr-references")
                        .header("Authorization", "Bearer " + token)
                        .param("q", "PR-DIRECT-TEST-01"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].referencePrNo").value("PR-DIRECT-TEST-01"));

        mockMvc.perform(get("/quotations/" + quotationId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.referencePrNo").value("PR-DIRECT-TEST-01"))
                .andExpect(jsonPath("$.data.referencePrSource").value("DIRECT"));
    }

    /**
     * The list's Reference PR No. column reads a real, searchable and sortable
     * value: the reference is part of the paged response, the search box finds a
     * quotation by it, and {@code sort=referencePrNo} orders by the column
     * instead of silently falling back to the default created-at ordering.
     */
    @Test
    void quotationListExposesSearchableAndSortableReferencePrNo() throws Exception {
        String token = register("qtn-refpr-list@example.com", "Quotation Ref List User");

        // Created deliberately out of alphabetical order, so a createdAt-based
        // fallback can never produce both requested directions.
        createQuotationWithReference(token, "ZZ-LIST-REF-02");
        String lower = createQuotationWithReference(token, "AA-LIST-REF-01");

        // 1. Searchable by the reference itself (number/client/sales person only
        //    before this column existed).
        MvcResult searched = mockMvc.perform(get("/quotations")
                        .header("Authorization", "Bearer " + token)
                        .param("size", "50")
                        .param("search", lower))
                .andExpect(status().isOk())
                .andReturn();
        List<String> found = new ArrayList<>();
        for (JsonNode row : objectMapper.readTree(searched.getResponse().getContentAsString()).path("content")) {
            found.add(row.path("referencePrNo").asText(""));
        }
        assertThat(found).isNotEmpty();
        assertThat(found).contains(lower);

        // 2. Sortable by the column, in both directions.
        List<String> ascending = referencePrNoOrder(token, "referencePrNo,asc");
        List<String> descending = referencePrNoOrder(token, "referencePrNo,desc");
        assertThat(ascending).contains(lower);
        assertThat(ascending).isSorted();
        assertThat(descending).isSortedAccordingTo(Comparator.reverseOrder());
        assertThat(ascending).isNotEqualTo(descending);
    }

    /** Creates a draft quotation carrying the given Reference PR No. */
    private String createQuotationWithReference(String token, String referencePrNo) throws Exception {
        mockMvc.perform(post("/quotations?draft=true")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "clientName", "List Reference Client",
                                "referencePrNo", referencePrNo))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.referencePrNo").value(referencePrNo));
        return referencePrNo;
    }

    /**
     * The page's non-blank Reference PR No values, in the order the list returned
     * them for the given sort.
     */
    private List<String> referencePrNoOrder(String token, String sort) throws Exception {
        MvcResult result = mockMvc.perform(get("/quotations")
                        .header("Authorization", "Bearer " + token)
                        .param("size", "200")
                        .param("sort", sort))
                .andExpect(status().isOk())
                .andReturn();
        List<String> refs = new ArrayList<>();
        for (JsonNode row : objectMapper.readTree(result.getResponse().getContentAsString()).path("content")) {
            String reference = row.path("referencePrNo").asText("");
            if (!reference.isBlank()) {
                refs.add(reference);
            }
        }
        return refs;
    }

    @Test
    void generatedNumbersStayUniqueAndWellFormed() throws Exception {
        String token = register("sales-seq@example.com", "Sales Sequence User");

        String first = createQuotationAndReadNumber(token, "Sequence Client A");
        String second = createQuotationAndReadNumber(token, "Sequence Client B");

        assertThat(first).matches("QTN-\\d{4}-\\d{6}");
        assertThat(second).matches("QTN-\\d{4}-\\d{6}");
        assertThat(first).isNotEqualTo(second);
    }

    private String createQuotationAndReadNumber(String token, String clientName) throws Exception {
        MvcResult created = mockMvc.perform(post("/quotations?draft=true")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("clientName", clientName))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("quotationNo").asText();
    }

    @Test
    void creditNoteAndPrReferenceMutationsHonourSalesAuthorities() throws Exception {
        String token = register("sales-authz@example.com", "Sales Authz User");

        // Credit Notes used to rely on authentication alone: SALES_CREATE (which a
        // plain USER holds) must keep creating them...
        MvcResult note = mockMvc.perform(post("/credit-notes?draft=true")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "clientName", "Authz Client",
                                "reason", "Rate difference"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.cnNo").isNotEmpty())
                .andExpect(jsonPath("$.data.status").value("draft"))
                .andReturn();
        long creditNoteId = objectMapper.readTree(note.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        // ...while approving and deleting still require their own authorities.
        mockMvc.perform(post("/credit-notes/" + creditNoteId + "/approve")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        mockMvc.perform(delete("/credit-notes/" + creditNoteId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());

        // A missing filter is an empty selection, never a server error.
        mockMvc.perform(get("/pr-references")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty());
        mockMvc.perform(get("/pr-references/lookup")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        // The PR-Reference catalog keeps its SALES_VIEW/SALES_CREATE boundary.
        mockMvc.perform(post("/pr-references")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "referencePrNo", "PR-AUTHZ-" + System.nanoTime(),
                                "clientName", "Authz Client"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.referencePrNo").isNotEmpty());
    }

    @Test
    void quotationRemarksAndConversionReferenceWork() throws Exception {
        String token = register("qtn-remark@example.com", "Quotation Remark User");

        MvcResult created = mockMvc.perform(post("/quotations?draft=true")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("clientName", "Remark Client"))))
                .andExpect(status().isCreated())
                .andReturn();
        long quotationId = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        // Remarks persist one row each, with the authenticated author.
        MvcResult remark = mockMvc.perform(post("/quotations/" + quotationId + "/remarks")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("text", "First remark"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.text").value("First remark"))
                .andExpect(jsonPath("$.data.addedBy").value("qtn-remark@example.com"))
                .andReturn();
        long remarkId = objectMapper.readTree(remark.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        mockMvc.perform(get("/quotations/" + quotationId + "/remarks")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].text").value("First remark"));

        // Deleting a remark approves SALES_DELETE, which a plain USER does not hold.
        mockMvc.perform(delete("/quotations/" + quotationId + "/remarks/" + remarkId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());

        // Recording an externally-created document never rewrites the lifecycle status.
        mockMvc.perform(post("/quotations/" + quotationId + "/conversion-reference")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "target", "sales-contract",
                                "number", "SC-TEST-0001"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.convertedToSc").value("SC-TEST-0001"))
                .andExpect(jsonPath("$.data.status").value("draft"));
    }

    /**
     * Proforma Invoice → Delivery Challan (the Actions-menu "Convert to Delivery
     * Challan" entry): the challan is really persisted with the source Proforma
     * Invoice's parties, items and commercial values, the source record points at
     * itself back, and a second conversion is refused instead of silently
     * producing a duplicate challan.
     */
    @Test
    void proformaInvoiceConvertsToDeliveryChallanAndPersistsSource() throws Exception {
        String token = register("pi-to-dc@example.com", "PI Dispatch User");

        MvcResult created = mockMvc.perform(post("/proforma-invoices?draft=true")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "clientName", "Dispatch Client",
                                "referenceNo", "REF-DISPATCH-01",
                                "sourceRef", "SO-DISPATCH-0001",
                                "billingAddress", "Dispatch Street 1",
                                "items", List.of(Map.of(
                                        "description", "Gear Blank",
                                        "sku", "SKU-GEAR-1",
                                        "uom", "Nos",
                                        "qty", 4,
                                        "rate", 250,
                                        "gstRate", 18))))))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode pi = objectMapper.readTree(created.getResponse().getContentAsString()).path("data");
        long piId = pi.path("id").asLong();
        String piNo = pi.path("piNo").asText();

        MvcResult converted = mockMvc.perform(post("/proforma-invoices/" + piId + "/generate-delivery-challan")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.module").value("delivery-challan"))
                .andExpect(jsonPath("$.data.number").isNotEmpty())
                .andReturn();
        JsonNode conversion = objectMapper.readTree(converted.getResponse().getContentAsString()).path("data");
        long dcId = conversion.path("id").asLong();
        String dcNo = conversion.path("number").asText();
        assertThat(dcNo).matches("DC-\\d{4}-\\d{6}");

        // The challan is readable through its own module with the copied data and
        // an own-entry timeline naming the source Proforma Invoice.
        mockMvc.perform(get("/delivery-challans/" + dcId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dcNo").value(dcNo))
                .andExpect(jsonPath("$.data.status").value("draft"))
                .andExpect(jsonPath("$.data.clientName").value("Dispatch Client"))
                .andExpect(jsonPath("$.data.items[0].description").value("Gear Blank"))
                .andExpect(jsonPath("$.data.items[0].uom").value("Nos"))
                .andExpect(jsonPath("$.data.items[0].qty").value(4))
                .andExpect(jsonPath("$.data.subTotal").value(1000.00))
                .andExpect(jsonPath("$.data.grandTotal").value(1180.00))
                .andExpect(jsonPath("$.data.timeline[0].detail").value(containsString(piNo)));

        // The source Proforma Invoice is intact (nothing deleted/overwritten) and
        // now carries the conversion reference.
        mockMvc.perform(get("/proforma-invoices/" + piId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.piNo").value(piNo))
                .andExpect(jsonPath("$.data.convertedToDc").value(dcNo))
                .andExpect(jsonPath("$.data.status").value("converted"));

        // A repeated request is refused — no second challan for the same PI.
        mockMvc.perform(post("/proforma-invoices/" + piId + "/generate-delivery-challan")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());

        // An unknown Proforma Invoice never produces a document.
        mockMvc.perform(post("/proforma-invoices/99999999/generate-delivery-challan")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }

    /**
     * Proforma Invoice → Delivery Challan through the Delivery Challan FORM
     * (Actions ⋮ → Convert to Delivery Challan → review/edit → Save): the challan
     * the user actually submitted is what gets persisted — the edited quantity
     * and the transport details survive, the source reference and party block
     * come from the Proforma Invoice, the source record is marked converted — and
     * a repeated Save is refused, so the form can never produce a duplicate
     * challan for the same Proforma Invoice.
     */
    @Test
    void proformaInvoiceDeliveryChallanFormSavePersistsReviewedChallan() throws Exception {
        String token = register("pi-dc-form@example.com", "PI Form User");

        MvcResult created = mockMvc.perform(post("/proforma-invoices?draft=true")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "clientName", "Form Client",
                                "contactPerson", "Ravi Kumar",
                                "email", "ravi@example.com",
                                "phone", "9876543210",
                                "referenceNo", "REF-FORM-01",
                                "sourceRef", "SO-FORM-0001",
                                "billingAddress", "Form Street 5",
                                "shippingAddress", "Form Dock 7",
                                "notes", "Handle with care",
                                "items", List.of(Map.of(
                                        "description", "Shaft Blank",
                                        "sku", "SKU-SHAFT-1",
                                        "uom", "Nos",
                                        "qty", 6,
                                        "rate", 100,
                                        "gstRate", 18))))))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode pi = objectMapper.readTree(created.getResponse().getContentAsString()).path("data");
        long piId = pi.path("id").asLong();
        String piNo = pi.path("piNo").asText();

        // The reviewed form: quantity edited down to 4, dispatch details added.
        MvcResult saved = mockMvc.perform(post("/proforma-invoices/" + piId + "/delivery-challans")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "clientName", "Form Client",
                                "status", "Dispatched",
                                "transportCompany", "Safe Logistics",
                                "vehicleNumber", "MH-01-AB-1234",
                                "items", List.of(Map.of(
                                        "description", "Shaft Blank",
                                        "sku", "SKU-SHAFT-1",
                                        "uom", "Nos",
                                        "qty", 4,
                                        "rate", 100,
                                        "gstRate", 18))))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.dcNo").value(containsString("DC-")))
                .andExpect(jsonPath("$.data.status").value("dispatched"))
                .andExpect(jsonPath("$.data.clientName").value("Form Client"))
                .andExpect(jsonPath("$.data.transportCompany").value("Safe Logistics"))
                .andReturn();
        JsonNode dc = objectMapper.readTree(saved.getResponse().getContentAsString()).path("data");
        long dcId = dc.path("id").asLong();
        String dcNo = dc.path("dcNo").asText();

        // Persisted through the Delivery Challan module: the reviewed values, the
        // source references the form did not carry, and totals recomputed from the
        // challan's own rows (4 × 100 + 18% GST), never copied from the invoice.
        MvcResult challan = mockMvc.perform(get("/delivery-challans/" + dcId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dcNo").value(dcNo))
                .andExpect(jsonPath("$.data.status").value("dispatched"))
                .andExpect(jsonPath("$.data.soRef").value("SO-FORM-0001"))
                .andExpect(jsonPath("$.data.scRef").value("REF-FORM-01"))
                .andExpect(jsonPath("$.data.contactPerson").value("Ravi Kumar"))
                .andExpect(jsonPath("$.data.shippingAddress").value("Form Dock 7"))
                .andExpect(jsonPath("$.data.vehicleNumber").value("MH-01-AB-1234"))
                .andExpect(jsonPath("$.data.items[0].qty").value(4))
                .andExpect(jsonPath("$.data.items[0].sku").value("SKU-SHAFT-1"))
                .andExpect(jsonPath("$.data.subTotal").value(400.00))
                .andExpect(jsonPath("$.data.grandTotal").value(472.00))
                .andReturn();
        // The challan's own timeline records which document it came from (the
        // entry is added after the challan's own "created" entry, so it is looked
        // up rather than assumed to be first).
        boolean namesSource = false;
        for (JsonNode entry : objectMapper.readTree(challan.getResponse().getContentAsString())
                .path("data").path("timeline")) {
            if (entry.path("detail").asText().contains(piNo)) {
                namesSource = true;
                break;
            }
        }
        assertThat(namesSource).as("the challan timeline names the source Proforma Invoice").isTrue();

        // …and it shows up in the Delivery Challans list.
        mockMvc.perform(get("/delivery-challans").param("search", dcNo)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].dcNo").value(dcNo));

        // The source Proforma Invoice is intact and now points at the challan.
        mockMvc.perform(get("/proforma-invoices/" + piId).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.piNo").value(piNo))
                .andExpect(jsonPath("$.data.convertedToDc").value(dcNo))
                .andExpect(jsonPath("$.data.status").value("converted"));

        // A repeated Save (double click / retry) is refused: one challan per PI.
        mockMvc.perform(post("/proforma-invoices/" + piId + "/delivery-challans")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("clientName", "Form Client"))))
                .andExpect(status().isBadRequest());

        // An unknown Proforma Invoice never produces a challan.
        mockMvc.perform(post("/proforma-invoices/99999999/delivery-challans")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("clientName", "Form Client"))))
                .andExpect(status().isNotFound());
    }

    /**
     * Invoice → Credit Note (the Actions-menu "Convert to Credit Note" entry):
     * the credit note is persisted with the invoice's reference, parties, items
     * and recalculated totals, while the original invoice stays intact and a
     * repeated request reuses the existing credit note.
     */
    @Test
    void invoiceConvertsToCreditNoteAndKeepsOriginalInvoiceIntact() throws Exception {
        String token = register("inv-to-cn@example.com", "Invoice Credit User");

        MvcResult created = mockMvc.perform(post("/invoices?draft=true")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "clientName", "Credit Client",
                                "referenceNo", "REF-CREDIT-01",
                                "items", List.of(Map.of(
                                        "description", "Bracket Assembly",
                                        "uom", "Nos",
                                        "qty", 3,
                                        "rate", 200,
                                        "gstRate", 18))))))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode invoice = objectMapper.readTree(created.getResponse().getContentAsString()).path("data");
        long invoiceId = invoice.path("id").asLong();
        String invoiceNo = invoice.path("invoiceNo").asText();
        BigDecimal invoiceGrandTotal = invoice.path("grandTotal").decimalValue();

        MvcResult converted = mockMvc.perform(post("/invoices/" + invoiceId + "/convert-credit-note")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.module").value("credit-note"))
                .andExpect(jsonPath("$.data.number").isNotEmpty())
                .andReturn();
        JsonNode conversion = objectMapper.readTree(converted.getResponse().getContentAsString()).path("data");
        long cnId = conversion.path("id").asLong();
        String cnNo = conversion.path("number").asText();
        assertThat(cnNo).matches("CN-\\d{4}-\\d{6}");

        // The credit note persists the original invoice reference and its lines.
        MvcResult creditNote = mockMvc.perform(get("/credit-notes/" + cnId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.cnNo").value(cnNo))
                .andExpect(jsonPath("$.data.status").value("draft"))
                .andExpect(jsonPath("$.data.sourceRef").value(invoiceNo))
                .andExpect(jsonPath("$.data.clientName").value("Credit Client"))
                .andExpect(jsonPath("$.data.items[0].description").value("Bracket Assembly"))
                .andExpect(jsonPath("$.data.items[0].qty").value(3))
                .andExpect(jsonPath("$.data.timeline[0].detail").value(containsString(invoiceNo)))
                .andReturn();
        // Compared numerically — the JSON scale of the two responses may differ.
        BigDecimal cnGrandTotal = objectMapper.readTree(creditNote.getResponse().getContentAsString())
                .path("data").path("grandTotal").decimalValue();
        assertThat(cnGrandTotal).isEqualByComparingTo(invoiceGrandTotal);

        // The invoice survives with its own values and records the credit note.
        MvcResult invoiceAfter = mockMvc.perform(get("/invoices/" + invoiceId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.invoiceNo").value(invoiceNo))
                .andExpect(jsonPath("$.data.convertedToCreditNote").value(cnNo))
                .andReturn();
        BigDecimal invoiceTotalAfter = objectMapper.readTree(invoiceAfter.getResponse().getContentAsString())
                .path("data").path("grandTotal").decimalValue();
        assertThat(invoiceTotalAfter).isEqualByComparingTo(invoiceGrandTotal);

        // A repeated request is idempotent: the SAME credit note is returned.
        mockMvc.perform(post("/invoices/" + invoiceId + "/convert-credit-note")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.number").value(cnNo));

        // An unknown invoice never produces a credit note.
        mockMvc.perform(post("/invoices/99999999/convert-credit-note")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }

    /**
     * The Credit Notes list's linked-document columns — CPO No., Dispatch Date,
     * Destination Reached Date, Terms, Due Date and Due Date Exceeded.
     *
     * <p>Every one of them comes from a real relationship, never from a copy of
     * an unrelated document: CPO No. is the Customer Purchase Order the note
     * traces back to (through the Delivery Challan that shipped it), Dispatch
     * Date is that challan's own dispatch date, Terms are the note's stored
     * terms, and the due date / overdue flag follow the note's own due date and
     * settlement state. Destination Reached Date is the note's OWN value (no
     * other document in the chain records it) and survives a save + reopen.
     */
    @Test
    void creditNoteLinkedDocumentColumnsResolveFromTheRealChain() throws Exception {
        String token = register("cn-link-columns@example.com", "CN Link Columns User");
        String dueDate = LocalDate.now().minusDays(10).toString();
        String dispatchDate = LocalDate.now().minusDays(7).toString();
        String reachedDate = LocalDate.now().minusDays(2).toString();

        // 1. A CPO whose due date (its delivery date) has already passed.
        MvcResult order = mockMvc.perform(post("/sales-orders?draft=true")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "clientName", "Linked Columns Client",
                                "deliveryDate", dueDate,
                                "items", List.of(Map.of(
                                        "description", "Returned Bracket",
                                        "uom", "Nos",
                                        "qty", 2,
                                        "rate", 100,
                                        "gstRate", 18))))))
                .andExpect(status().isCreated())
                .andReturn();
        String soNo = objectMapper.readTree(order.getResponse().getContentAsString())
                .path("data").path("soNo").asText();
        assertThat(soNo).isNotBlank();

        // 2. The Delivery Challan that shipped it: it owns the dispatch date.
        MvcResult challan = mockMvc.perform(post("/delivery-challans?draft=true")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "clientName", "Linked Columns Client",
                                "soRef", soNo,
                                "dispatchDate", dispatchDate,
                                "terms", "Goods once sold are not returnable",
                                "items", List.of(Map.of(
                                        "description", "Returned Bracket",
                                        "uom", "Nos",
                                        "qty", 2,
                                        "rate", 100,
                                        "gstRate", 18))))))
                .andExpect(status().isCreated())
                .andReturn();
        long dcId = objectMapper.readTree(challan.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        // 3. Delivery Challan → Credit Note (the conversion the list action runs).
        MvcResult converted = mockMvc.perform(post("/delivery-challans/" + dcId + "/convert-credit-note")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.module").value("credit-note"))
                .andReturn();
        JsonNode conversion = objectMapper.readTree(converted.getResponse().getContentAsString()).path("data");
        long cnId = conversion.path("id").asLong();
        String cnNo = conversion.path("number").asText();

        // 4. The LIST row (what the table renders) carries every column.
        JsonNode row = creditNoteListRow(token, cnNo);
        assertThat(row).as("the credit note must appear in the list").isNotNull();
        assertThat(row.path("cpoNo").asText()).isEqualTo(soNo);
        assertThat(row.path("dispatchDate").asText()).isEqualTo(dispatchDate);
        assertThat(row.path("dueDate").asText()).isEqualTo(dueDate);
        assertThat(row.path("dueDateExceeded").asBoolean()).isTrue();
        assertThat(row.path("terms").asText()).isEqualTo("Goods once sold are not returnable");
        assertThat(row.path("destinationReachedDate").isMissingNode()
                || row.path("destinationReachedDate").isNull()).isTrue();

        // 5. The DETAIL payload agrees with the row.
        MvcResult detail = mockMvc.perform(get("/credit-notes/" + cnId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.cpoNo").value(soNo))
                .andExpect(jsonPath("$.data.dispatchDate").value(dispatchDate))
                .andExpect(jsonPath("$.data.dueDate").value(dueDate))
                .andExpect(jsonPath("$.data.dueDateExceeded").value(true))
                .andReturn();

        // 6. Destination Reached Date is the credit note's own column: it is
        //    saved through the ordinary edit payload and comes back on reopen.
        ObjectNode payload = (ObjectNode) objectMapper.readTree(detail.getResponse().getContentAsString())
                .path("data");
        payload.put("destinationReachedDate", reachedDate);
        MvcResult updated = mockMvc.perform(put("/credit-notes/" + cnId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.destinationReachedDate").value(reachedDate))
                .andReturn();
        JsonNode revision = objectMapper.readTree(updated.getResponse().getContentAsString()).path("data");
        long revisionId = revision.path("id").asLong();
        mockMvc.perform(get("/credit-notes/" + revisionId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.destinationReachedDate").value(reachedDate));

        // 7. A settled credit is never overdue: converting it to a Payment
        //    Receipt clears the flag even though the due date has passed.
        mockMvc.perform(post("/credit-notes/" + revisionId + "/convert-payment-receipt")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        mockMvc.perform(get("/credit-notes/" + revisionId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.convertedToPr").isNotEmpty())
                .andExpect(jsonPath("$.data.dueDateExceeded").value(false));
    }

    /**
     * A FULLY PAID source invoice must never make its credit note overdue: the
     * due date still comes from the linked CPO, but the amount is no longer
     * outstanding, so the indicator flips off.
     */
    @Test
    void creditNoteOverdueFlagClearsWhenTheSourceInvoiceIsPaid() throws Exception {
        String token = register("cn-paid-invoice@example.com", "CN Paid Invoice User");
        String dueDate = LocalDate.now().minusDays(14).toString();

        MvcResult order = mockMvc.perform(post("/sales-orders?draft=true")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "clientName", "Paid Invoice Client",
                                "deliveryDate", dueDate,
                                "items", List.of(Map.of(
                                        "description", "Bracket",
                                        "uom", "Nos",
                                        "qty", 1,
                                        "rate", 500,
                                        "gstRate", 18))))))
                .andExpect(status().isCreated())
                .andReturn();
        long soId = objectMapper.readTree(order.getResponse().getContentAsString())
                .path("data").path("id").asLong();
        String soNo = objectMapper.readTree(order.getResponse().getContentAsString())
                .path("data").path("soNo").asText();

        MvcResult invoiceConversion = mockMvc.perform(post("/sales-orders/" + soId + "/convert-invoice")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        long invoiceId = objectMapper.readTree(invoiceConversion.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        MvcResult cnConversion = mockMvc.perform(post("/invoices/" + invoiceId + "/convert-credit-note")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        long cnId = objectMapper.readTree(cnConversion.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        // Unpaid invoice: the CPO is the linked CPO, the due date is its own
        // delivery date, and the credit is overdue.
        mockMvc.perform(get("/credit-notes/" + cnId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.cpoNo").value(soNo))
                .andExpect(jsonPath("$.data.dueDate").value(dueDate))
                .andExpect(jsonPath("$.data.dueDateExceeded").value(true));

        // Fully paid invoice: nothing remains outstanding, so it is not overdue.
        mockMvc.perform(post("/invoices/" + invoiceId + "/mark-paid")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        mockMvc.perform(get("/credit-notes/" + cnId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dueDate").value(dueDate))
                .andExpect(jsonPath("$.data.dueDateExceeded").value(false));
    }

    /**
     * The linked Dispatch Date and Due Date can be ENTERED OR OVERRIDDEN on the
     * credit note itself, for the case where the linked document records no
     * value (or one the user must correct).
     *
     * <p>The override is stored on the note and REPLACES the resolved value; the
     * linked Delivery Challan, invoice and CPO are only ever read, so correcting
     * a date here cannot rewrite the documents that own it. A saved override
     * survives a reopen (that is what makes a browser refresh safe) and an edit
     * that re-points the note at a DIFFERENT linked document, because the
     * automatic resolution cannot destroy it. "Due Date Exceeded" is measured
     * against whichever date is authoritative, so overriding the due date moves
     * the flag with it — and clearing the override puts the linked value back in
     * charge, which is what proves the automatic resolution still works. CPO No.
     * has no override at all: it IS the document relationship.
     */
    @Test
    void creditNoteLinkedDatesCanBeEnteredOrOverriddenOnTheNoteItself() throws Exception {
        String token = register("cn-override@example.com", "CN Override User");
        String client = "CN Override Client";
        String linkedDue = LocalDate.now().minusDays(12).toString();
        String linkedDispatch = LocalDate.now().minusDays(9).toString();
        String overriddenDispatch = LocalDate.now().minusDays(4).toString();
        String overriddenDue = LocalDate.now().plusDays(6).toString();

        String cpoNo = createSortedOrder(token, client, linkedDue);
        String cnNo = creditNoteFromChallan(token, client, cpoNo, linkedDispatch);
        JsonNode row = creditNoteListRow(token, cnNo);
        assertThat(row).as("the credit note must be in the list").isNotNull();
        long cnId = row.path("id").asLong();

        // 1. Nothing overridden yet: the linked documents answer for both dates
        //    and the passed due date makes the credit overdue.
        MvcResult detail = mockMvc.perform(get("/credit-notes/" + cnId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dispatchDate").value(linkedDispatch))
                .andExpect(jsonPath("$.data.dueDate").value(linkedDue))
                // The automatic values are reported separately from the effective
                // ones (identical here, since nothing is overridden).
                .andExpect(jsonPath("$.data.resolvedDispatchDate").value(linkedDispatch))
                .andExpect(jsonPath("$.data.resolvedDueDate").value(linkedDue))
                .andExpect(jsonPath("$.data.dispatchDateOverride").doesNotExist())
                .andExpect(jsonPath("$.data.dueDateOverride").doesNotExist())
                .andExpect(jsonPath("$.data.dueDateExceeded").value(true))
                .andReturn();

        // 2. The user enters both dates through the ordinary edit payload — the
        //    same update endpoint, no extra request type.
        ObjectNode payload = (ObjectNode) objectMapper.readTree(detail.getResponse().getContentAsString())
                .path("data");
        payload.put("dispatchDateOverride", overriddenDispatch);
        payload.put("dueDateOverride", overriddenDue);
        MvcResult updated = mockMvc.perform(put("/credit-notes/" + cnId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dispatchDate").value(overriddenDispatch))
                .andExpect(jsonPath("$.data.dueDate").value(overriddenDue))
                .andExpect(jsonPath("$.data.dispatchDateOverride").value(overriddenDispatch))
                .andExpect(jsonPath("$.data.dueDateOverride").value(overriddenDue))
                // The linked documents still answer for the automatic values: an
                // override hides them, it does not replace them, which is what
                // lets the form show the linked date again when it is cleared.
                .andExpect(jsonPath("$.data.resolvedDispatchDate").value(linkedDispatch))
                .andExpect(jsonPath("$.data.resolvedDueDate").value(linkedDue))
                // The flag follows the authoritative date: a future due date is
                // not exceeded even though the linked CPO's date has passed, and
                // the user never sets the flag itself.
                .andExpect(jsonPath("$.data.dueDateExceeded").value(false))
                .andReturn();
        long revisionId = objectMapper.readTree(updated.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        // 3. Reopening the record still shows the saved overrides — this is the
        //    page refresh / reopen case.
        MvcResult reopened = mockMvc.perform(get("/credit-notes/" + revisionId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dispatchDateOverride").value(overriddenDispatch))
                .andExpect(jsonPath("$.data.dueDateOverride").value(overriddenDue))
                .andExpect(jsonPath("$.data.dueDate").value(overriddenDue))
                .andExpect(jsonPath("$.data.dueDateExceeded").value(false))
                .andReturn();

        // 4. An unrelated edit that also RE-POINTS the note at another linked
        //    document (its CPO instead of the challan) keeps the overrides: the
        //    automatic resolution now finds a past due date of its own, but the
        //    saved override is still what the note shows and dates itself by.
        ObjectNode reedited = (ObjectNode) objectMapper.readTree(reopened.getResponse().getContentAsString())
                .path("data");
        reedited.put("remarks", "Reviewed with the customer");
        reedited.put("source", "so");
        reedited.put("sourceRef", cpoNo);
        MvcResult afterReedit = mockMvc.perform(put("/credit-notes/" + revisionId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reedited.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.remarks").value("Reviewed with the customer"))
                .andExpect(jsonPath("$.data.cpoNo").value(cpoNo))
                .andExpect(jsonPath("$.data.dispatchDateOverride").value(overriddenDispatch))
                .andExpect(jsonPath("$.data.dueDateOverride").value(overriddenDue))
                .andExpect(jsonPath("$.data.dispatchDate").value(overriddenDispatch))
                .andExpect(jsonPath("$.data.dueDate").value(overriddenDue))
                .andExpect(jsonPath("$.data.dueDateExceeded").value(false))
                .andReturn();
        long reeditedId = objectMapper.readTree(afterReedit.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        // 5. Clearing the overrides hands both dates back to the linked
        //    documents (the challan's dispatch date, the CPO's due date), which
        //    proves the automatic resolution never stopped working, and the
        //    overdue flag follows the restored date again.
        ObjectNode cleared = (ObjectNode) objectMapper.readTree(afterReedit.getResponse().getContentAsString())
                .path("data");
        cleared.remove("dispatchDateOverride");
        cleared.remove("dueDateOverride");
        mockMvc.perform(put("/credit-notes/" + reeditedId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cleared.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dispatchDateOverride").doesNotExist())
                .andExpect(jsonPath("$.data.dueDateOverride").doesNotExist())
                .andExpect(jsonPath("$.data.dispatchDate").value(linkedDispatch))
                .andExpect(jsonPath("$.data.dueDate").value(linkedDue))
                .andExpect(jsonPath("$.data.resolvedDispatchDate").value(linkedDispatch))
                .andExpect(jsonPath("$.data.resolvedDueDate").value(linkedDue))
                .andExpect(jsonPath("$.data.dueDateExceeded").value(true));
    }

    /**
     * The Credit Notes list can be SORTED on its resolved linked-document
     * columns — CPO No., Dispatch Date, Due Date and Due Date Exceeded — and the
     * order follows the values the table shows.
     *
     * <p>None of those four is a column of the credit note; each is resolved
     * from the documents the note points at. The fixture is built so a wrong
     * implementation is visible: the two linked notes are created in the REVERSE
     * order of their CPO numbers, so sorting on any stored column (number,
     * creation time) would return them the other way round. One note is left
     * unlinked, so every derived value of it is empty — that is what the
     * nulls-last rule is about. Finally the pages of a one-row-per-page listing
     * have to concatenate to exactly the whole sorted order: the order is
     * decided over the complete filtered set, never within a page.
     */
    @Test
    void creditNoteListSortsOnResolvedLinkedDocumentColumns() throws Exception {
        String token = register("cn-sort@example.com", "CN Sort User");
        String client = "CN Sort Client";
        String olderDispatch = LocalDate.now().minusDays(9).toString();
        String newerDispatch = LocalDate.now().minusDays(3).toString();
        String pastDue = LocalDate.now().minusDays(20).toString();
        String futureDue = LocalDate.now().plusDays(10).toString();

        // CPO one is created first (so its number sorts before CPO two's), but the
        // credit note created first belongs to CPO TWO.
        String cpoOne = createSortedOrder(token, client, pastDue);
        String cpoTwo = createSortedOrder(token, client, futureDue);
        String cnLinkedToCpoTwo = creditNoteFromChallan(token, client, cpoTwo, newerDispatch);
        String cnLinkedToCpoOne = creditNoteFromChallan(token, client, cpoOne, olderDispatch);

        // An unlinked credit note: no CPO, no dispatch, no due date.
        MvcResult unlinked = mockMvc.perform(post("/credit-notes")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "clientName", client,
                                "reason", "Unlinked note",
                                // A note's own stored terms: they must survive an
                                // edit of an unrelated field (asserted below).
                                "terms", "Credit valid for 30 days",
                                "items", List.of(Map.of(
                                        "description", "No linked document",
                                        "uom", "Nos",
                                        "qty", 1,
                                        "rate", 10,
                                        "gstRate", 18))))))
                .andExpect(status().isCreated())
                .andReturn();
        String unlinkedCnNo = objectMapper.readTree(unlinked.getResponse().getContentAsString())
                .path("data").path("cnNo").asText();

        // ---- CPO No.: ordered on the RESOLVED CPO, not on creation order -----
        JsonNode byCpoAsc = creditNoteSortPage(token, client, "cpoNo,asc", 10, 0);
        assertThat(byCpoAsc.path("totalElements").asLong()).isEqualTo(3);
        assertThat(valuesOf(byCpoAsc, "cpoNo")).containsExactly(cpoOne, cpoTwo, null);
        // The store order is the opposite one, so the order above really came
        // from the resolved CPO numbers.
        assertThat(valuesOf(byCpoAsc, "cnNo"))
                .containsExactly(cnLinkedToCpoOne, cnLinkedToCpoTwo, unlinkedCnNo);
        // Descending is the same list turned around — the missing value stays last.
        assertThat(valuesOf(creditNoteSortPage(token, client, "cpoNo,desc", 10, 0), "cpoNo"))
                .containsExactly(cpoTwo, cpoOne, null);

        // ---- Dispatch Date: the challan that shipped first comes first -------
        assertThat(valuesOf(creditNoteSortPage(token, client, "dispatchDate,asc", 10, 0), "dispatchDate"))
                .containsExactly(olderDispatch, newerDispatch, null);
        assertThat(valuesOf(creditNoteSortPage(token, client, "dispatchDate,desc", 10, 0), "dispatchDate"))
                .containsExactly(newerDispatch, olderDispatch, null);

        // ---- Due Date: the linked CPO's past delivery date before the future one
        assertThat(valuesOf(creditNoteSortPage(token, client, "dueDate,asc", 10, 0), "dueDate"))
                .containsExactly(pastDue, futureDue, null);
        assertThat(valuesOf(creditNoteSortPage(token, client, "dueDate,desc", 10, 0), "dueDate"))
                .containsExactly(futureDue, pastDue, null);

        // ---- Due Date Exceeded: the resolved flag, not the due date's order ---
        // Only the note whose CPO was due 20 days ago is overdue; the future-dated
        // one and the unlinked one (no due date at all) are not.
        JsonNode flagAsc = creditNoteSortPage(token, client, "dueDateExceeded,asc", 10, 0);
        assertThat(valuesOf(flagAsc, "dueDateExceeded")).containsExactly("false", "false", "true");
        JsonNode flagDesc = creditNoteSortPage(token, client, "dueDateExceeded,desc", 10, 0);
        assertThat(valuesOf(flagDesc, "dueDateExceeded")).containsExactly("true", "false", "false");
        assertThat(flagDesc.path("content").get(0).path("cnNo").asText())
                .as("the overdue row is the one whose CPO was already due")
                .isEqualTo(cnLinkedToCpoOne);

        // ---- Pagination: one row per page concatenates to the whole order ----
        List<String> paged = new ArrayList<>();
        for (int page = 0; page < 3; page++) {
            JsonNode single = creditNoteSortPage(token, client, "cpoNo,asc", 1, page);
            assertThat(single.path("totalElements").asLong()).isEqualTo(3);
            assertThat(single.path("content").size()).isEqualTo(1);
            paged.add(valuesOf(single, "cpoNo").get(0));
        }
        assertThat(paged).containsExactly(cpoOne, cpoTwo, null);

        // ---- The STORED columns keep their own, unchanged sort path -----------
        // Destination Reached Date is the note's OWN column (not a derived one),
        // so it must still order correctly now that the four derived keys have a
        // path of their own. Every note gets a value here on purpose: the direct
        // column sort is the database's own, and where a NULL would land is the
        // database's business — the guarantee this test makes is about values.
        String reachedFirst = LocalDate.now().minusDays(30).toString();
        String reachedSecond = LocalDate.now().minusDays(20).toString();
        String reachedThird = LocalDate.now().minusDays(10).toString();
        setDestinationReachedDate(token, cnLinkedToCpoTwo, reachedThird);
        setDestinationReachedDate(token, cnLinkedToCpoOne, reachedFirst);
        JsonNode updatedUnlinked = setDestinationReachedDate(token, unlinkedCnNo, reachedSecond);

        // The edit persisted the note's OWN date, and left its own stored Terms
        // untouched — reopening the record reads both values back.
        assertThat(updatedUnlinked.path("destinationReachedDate").asText()).isEqualTo(reachedSecond);
        assertThat(updatedUnlinked.path("terms").asText()).isEqualTo("Credit valid for 30 days");
        mockMvc.perform(get("/credit-notes/" + updatedUnlinked.path("id").asLong())
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.destinationReachedDate").value(reachedSecond))
                .andExpect(jsonPath("$.data.terms").value("Credit valid for 30 days"));
        assertThat(valuesOf(creditNoteSortPage(token, client, "destinationReachedDate,asc", 10, 0),
                "destinationReachedDate"))
                .containsExactly(reachedFirst, reachedSecond, reachedThird);
        assertThat(valuesOf(creditNoteSortPage(token, client, "destinationReachedDate,desc", 10, 0),
                "destinationReachedDate"))
                .containsExactly(reachedThird, reachedSecond, reachedFirst);
    }

    /** The credit-note list page for one client and sort, as the table asks for it. */
    private JsonNode creditNoteSortPage(String token, String client, String sort, int size, int page)
            throws Exception {
        MvcResult result = mockMvc.perform(get("/credit-notes")
                        .param("client", client)
                        .param("size", String.valueOf(size))
                        .param("page", String.valueOf(page))
                        .param("sort", sort)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    /**
     * Sets a credit note's own Destination Reached Date through the ordinary
     * edit payload, and answers the updated record (the revision it created).
     */
    private JsonNode setDestinationReachedDate(String token, String cnNo, String date) throws Exception {
        JsonNode row = creditNoteListRow(token, cnNo);
        assertThat(row).as("the credit note must be in the list").isNotNull();
        long id = row.path("id").asLong();
        MvcResult detail = mockMvc.perform(get("/credit-notes/" + id)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        ObjectNode payload = (ObjectNode) objectMapper.readTree(detail.getResponse().getContentAsString())
                .path("data");
        payload.put("destinationReachedDate", date);
        MvcResult updated = mockMvc.perform(put("/credit-notes/" + id)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload.toString()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(updated.getResponse().getContentAsString()).path("data");
    }

    /** One resolved field of every row, keeping a missing/null value as null. */
    private List<String> valuesOf(JsonNode page, String field) {
        List<String> values = new ArrayList<>();
        for (JsonNode row : page.path("content")) {
            JsonNode value = row.path(field);
            values.add(value.isMissingNode() || value.isNull() ? null : value.asText());
        }
        return values;
    }

    /** A draft CPO whose delivery date is the due date the credit note inherits. */
    private String createSortedOrder(String token, String client, String deliveryDate) throws Exception {
        MvcResult order = mockMvc.perform(post("/sales-orders?draft=true")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "clientName", client,
                                "deliveryDate", deliveryDate,
                                "items", List.of(Map.of(
                                        "description", "Sorted Bracket",
                                        "uom", "Nos",
                                        "qty", 1,
                                        "rate", 100,
                                        "gstRate", 18))))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(order.getResponse().getContentAsString())
                .path("data").path("soNo").asText();
    }

    /** A CPO shipped by its own Delivery Challan, converted into a credit note. */
    private String creditNoteFromChallan(String token, String client, String soNo, String dispatchDate)
            throws Exception {
        MvcResult challan = mockMvc.perform(post("/delivery-challans?draft=true")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "clientName", client,
                                "soRef", soNo,
                                "dispatchDate", dispatchDate,
                                "items", List.of(Map.of(
                                        "description", "Sorted Bracket",
                                        "uom", "Nos",
                                        "qty", 1,
                                        "rate", 100,
                                        "gstRate", 18))))))
                .andExpect(status().isCreated())
                .andReturn();
        long challanId = objectMapper.readTree(challan.getResponse().getContentAsString())
                .path("data").path("id").asLong();
        MvcResult converted = mockMvc.perform(post("/delivery-challans/" + challanId + "/convert-credit-note")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(converted.getResponse().getContentAsString())
                .path("data").path("number").asText();
    }

    /** The credit-note list row for a number, as the table receives it. */
    private JsonNode creditNoteListRow(String token, String cnNo) throws Exception {
        MvcResult listed = mockMvc.perform(get("/credit-notes?size=100")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode page = objectMapper.readTree(listed.getResponse().getContentAsString());
        JsonNode content = page.path("content");
        for (JsonNode node : content) {
            if (cnNo.equals(node.path("cnNo").asText())) {
                return node;
            }
        }
        return null;
    }

    /**
     * Sales Contract attachments keep the DOCUMENT TYPE they were filed under.
     *
     * <p>The Upload Documents panel of Create/Edit Sales Contract offers E-Sign
     * (digitally signed) and Scanned Copy (a scan of the signed/physical
     * contract). The category rides on the attachment itself, so it survives the
     * save/reopen round trip, is reported by both the attachment list and the
     * contract's own payload, and is untouched for an upload that names none —
     * the shared attachment store stays usable by every other sales module.
     */
    @Test
    void salesContractAttachmentsKeepTheirDocumentCategory() throws Exception {
        String token = register("sc-attachments@example.com", "Contract Attachment User");

        MvcResult created = mockMvc.perform(post("/sales-contracts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "clientName", "Attachment Client"))))
                .andExpect(status().isCreated())
                .andReturn();
        long contractId = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();
        String attachUrl = "/sales-contracts/" + contractId + "/attachments";

        // 1. E-Sign — the digitally signed contract document.
        mockMvc.perform(multipart(attachUrl)
                        .file(new MockMultipartFile("file", "contract-e-sign.pdf", "application/pdf",
                                "%PDF-1.4 signed".getBytes()))
                        .param("category", "E-Sign")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.attachmentCategory").value("E-Sign"));

        // 2. Scanned Copy — a scan of the signed physical contract.
        mockMvc.perform(multipart(attachUrl)
                        .file(new MockMultipartFile("file", "contract-scan.pdf", "application/pdf",
                                "%PDF-1.4 scan".getBytes()))
                        .param("category", "Scanned Copy")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.attachmentCategory").value("Scanned Copy"));

        // 3. No category at all — the pre-existing behaviour, unchanged.
        MvcResult uncategorised = mockMvc.perform(multipart(attachUrl)
                        .file(new MockMultipartFile("file", "annexure.pdf", "application/pdf",
                                "%PDF-1.4 annexure".getBytes()))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())
                .andReturn();
        assertThat(objectMapper.readTree(uncategorised.getResponse().getContentAsString())
                .path("data").path("attachmentCategory").isNull())
                .as("an attachment uploaded without a category stays unlabelled")
                .isTrue();

        // A blank category is the same as none (never stored as an empty label).
        MvcResult blankCategory = mockMvc.perform(multipart(attachUrl)
                        .file(new MockMultipartFile("file", "blank-category.pdf", "application/pdf",
                                "%PDF-1.4 blank".getBytes()))
                        .param("category", "   ")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())
                .andReturn();
        assertThat(objectMapper.readTree(blankCategory.getResponse().getContentAsString())
                .path("data").path("attachmentCategory").isNull())
                .as("a blank category is stored as no category")
                .isTrue();

        // A value longer than the column is refused, never truncated.
        mockMvc.perform(multipart(attachUrl)
                        .file(new MockMultipartFile("file", "too-long.pdf", "application/pdf",
                                "%PDF-1.4 long".getBytes()))
                        .param("category", "x".repeat(41))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());

        // Reopening the contract reports every attachment with its own category:
        // the labelled ones keep their label, the unlabelled ones stay empty and
        // every earlier upload is still there.
        MvcResult listed = mockMvc.perform(get(attachUrl)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode rows = objectMapper.readTree(listed.getResponse().getContentAsString());
        assertThat(rows).hasSize(4);
        assertThat(categoryOf(rows, "contract-e-sign.pdf")).isEqualTo("E-Sign");
        assertThat(categoryOf(rows, "contract-scan.pdf")).isEqualTo("Scanned Copy");
        assertThat(categoryOf(rows, "annexure.pdf")).isNull();
        assertThat(categoryOf(rows, "blank-category.pdf")).isNull();

        // The contract's own payload carries the same categories (the Edit form
        // loads its attachments from there).
        MvcResult reopened = mockMvc.perform(get("/sales-contracts/" + contractId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode payloadAttachments = objectMapper.readTree(reopened.getResponse().getContentAsString())
                .path("data").path("attachments");
        assertThat(categoryOf(payloadAttachments, "contract-e-sign.pdf")).isEqualTo("E-Sign");
        assertThat(categoryOf(payloadAttachments, "contract-scan.pdf")).isEqualTo("Scanned Copy");
    }

    /** The stored category of the attachment row named {@code fileName}. */
    private static String categoryOf(JsonNode rows, String fileName) {
        for (JsonNode row : rows) {
            if (fileName.equals(row.path("name").asText())) {
                return row.path("attachmentCategory").isNull()
                        ? null
                        : row.path("attachmentCategory").asText();
            }
        }
        throw new AssertionError("attachment " + fileName + " not found in " + rows);
    }
}
