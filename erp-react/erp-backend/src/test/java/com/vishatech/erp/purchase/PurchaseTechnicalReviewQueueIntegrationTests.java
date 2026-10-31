package com.vishatech.erp.purchase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.PurchaseRequisition;
import com.vishatech.erp.entity.PurchaseRequisitionItem;
import com.vishatech.erp.repository.PurchaseRequisitionRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.security.CustomUserDetailsService;
import com.vishatech.erp.security.JwtService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Technical Specification Review queue — scalability tests against a REAL
 * database (H2 in MySQL mode, real JPA entities, no mocks).
 *
 * The queue used to be read as 500 requisitions and filtered, sorted and
 * paged in the browser. It is now one bounded, database-filtered page with
 * database counts, so these tests pin down:
 *
 *   · one request returns one page, never the whole queue
 *   · the page size is clamped (default 25, max 100)
 *   · the queue is scoped to the review stage — other statuses never leak in
 *   · search, filters, KPI filters and sorting are applied by the database
 *   · totalElements / totalPages are real database counts
 *   · the stats endpoint equals independent repository counts
 */
@SpringBootTest
@AutoConfigureMockMvc
class PurchaseTechnicalReviewQueueIntegrationTests extends AbstractSecurityTest {

    private static final String STAGE = "Technical Specification Review";
    private static final String READY = "Ready for Review";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private JwtService jwtService;
    @Autowired
    private CustomUserDetailsService userDetailsService;
    @Autowired
    private PurchaseRequisitionRepository requisitions;

    private static int sequence = 0;

    private static synchronized String unique(String prefix) {
        sequence++;
        return prefix + "-TQ-" + System.nanoTime() + "-" + sequence;
    }

    private String adminToken() {
        return jwtService.generateToken(userDetailsService.loadUserByUsername("admin@vishaktech.com"));
    }

    private JsonNode getJson(String url, String token) throws Exception {
        return getJson(url, token, new String[0]);
    }

    /**
     * GET with explicit query parameters. Filters are passed as parameters
     * (never baked into the URL) so values containing spaces travel exactly
     * as a browser would send them.
     */
    private JsonNode getJson(String url, String token, String... keyValues) throws Exception {
        MockHttpServletRequestBuilder request = get(url).header("Authorization", "Bearer " + token);
        for (int i = 0; i + 1 < keyValues.length; i += 2) {
            request = request.param(keyValues[i], keyValues[i + 1]);
        }
        MvcResult result = mockMvc.perform(request)
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    /** Seeds one requisition in the review stage (optionally pre-reviewed). */
    private PurchaseRequisition seedQueuePr(String department, String priority, boolean reviewed) {
        PurchaseRequisition pr = new PurchaseRequisition();
        pr.setPrNo(unique("PR"));
        pr.setTitle("Queue test requisition");
        pr.setDepartment(department);
        pr.setRequester("Test Requester");
        pr.setBuyer("Test Buyer");
        pr.setVendor("Queue Test Vendor");
        pr.setCurrency("INR");
        pr.setPriority(priority);
        pr.setDate(LocalDate.now().toString());
        pr.setStatus(STAGE);
        pr.setApprovalStatus("Approved");
        pr.setRecordState(PurchaseRequisition.RECORD_ACTIVE);
        pr.setAmount(new BigDecimal("1000.00"));
        if (reviewed) {
            pr.setTechnicalReviewJson("{\"specification\":\"IS 2062\",\"drawing\":\"F-1\","
                    + "\"materialGrade\":\"E250\",\"dimensions\":\"3mm\",\"comments\":\"ok\","
                    + "\"reviewStatus\":\"Reviewed\",\"reviewedBy\":\"Reviewer\","
                    + "\"reviewedAt\":\"" + LocalDateTime.now() + "\"}");
        }
        PurchaseRequisitionItem item = new PurchaseRequisitionItem();
        item.setRequisition(pr);
        item.setProduct("Queue item " + unique("P"));
        item.setUom("Nos");
        item.setQty(new BigDecimal("2"));
        item.setRate(new BigDecimal("500"));
        item.setDiscount(BigDecimal.ZERO);
        item.setGstRate(new BigDecimal("18"));
        pr.getItems().add(item);
        return requisitions.saveAndFlush(pr);
    }

    private long queueSizeInDb() {
        return requisitions.findByStatusInAndRecordState(java.util.List.of(STAGE),
                PurchaseRequisition.RECORD_ACTIVE).size();
    }

    // ------------------------------------------------------------------
    // 1. One request = one page
    // ------------------------------------------------------------------

    @Test
    void queueReturnsOnlyTheRequestedPage() throws Exception {
        String token = adminToken();
        for (int i = 0; i < 5; i++) {
            seedQueuePr("Quality", "High", false);
        }

        long total = queueSizeInDb();
        assertThat(total).isGreaterThan(2);

        JsonNode page = getJson("/api/purchase/requisitions/technical-review", token,
                "page", "0", "size", "2");

        assertThat(page.path("content").size()).isEqualTo(2);
        assertThat(page.path("size").asInt()).isEqualTo(2);
        assertThat(page.path("number").asInt()).isZero();
        assertThat(page.path("totalElements").asLong()).isEqualTo(total);
        assertThat(page.path("totalPages").asLong()).isEqualTo((total + 1) / 2);
    }

    @Test
    void oversizedPageSizeIsClampedAndDefaultsAreApplied() throws Exception {
        String token = adminToken();
        seedQueuePr("Quality", "High", false);

        JsonNode clamped = getJson("/api/purchase/requisitions/technical-review", token, "size", "5000");
        assertThat(clamped.path("size").asInt()).isEqualTo(100);
        assertThat(clamped.path("content").size()).isLessThanOrEqualTo(100);

        assertThat(getJson("/api/purchase/requisitions/technical-review", token).path("size").asInt())
                .isEqualTo(25);
        assertThat(getJson("/api/purchase/requisitions/technical-review", token, "size", "0")
                .path("size").asInt()).isEqualTo(25);
        assertThat(getJson("/api/purchase/requisitions/technical-review", token, "page", "-4")
                .path("number").asInt()).isZero();
    }

    @Test
    void pageBeyondTheEndIsEmptyButStillReportsTheTotal() throws Exception {
        String token = adminToken();
        seedQueuePr("Quality", "High", false);

        JsonNode page = getJson("/api/purchase/requisitions/technical-review", token,
                "page", "9999", "size", "25");
        assertThat(page.path("content").size()).isZero();
        assertThat(page.path("totalElements").asLong()).isEqualTo(queueSizeInDb());
    }

    // ------------------------------------------------------------------
    // 2. The queue stays scoped to the review stage
    // ------------------------------------------------------------------

    @Test
    void queueOnlyContainsRequisitionsInTheReviewStage() throws Exception {
        String token = adminToken();
        PurchaseRequisition pending = seedQueuePr("Quality", "High", false);
        pending.setStatus("Pending Approval");
        requisitions.saveAndFlush(pending);

        JsonNode page = getJson("/api/purchase/requisitions/technical-review", token, "size", "100");
        for (JsonNode row : page.path("content")) {
            assertThat(row.path("status").asText()).isEqualTo(STAGE);
        }
        assertThat(page.path("totalElements").asLong()).isEqualTo(queueSizeInDb());
    }

    // ------------------------------------------------------------------
    // 3. Filtering, searching, sorting happen in the database
    // ------------------------------------------------------------------

    @Test
    void reviewStatusFilterSeparatesReviewedFromReadyRows() throws Exception {
        String token = adminToken();
        PurchaseRequisition reviewed = seedQueuePr("Quality", "High", true);
        seedQueuePr("Quality", "High", false);

        JsonNode ready = getJson("/api/purchase/requisitions/technical-review", token,
                "reviewStatus", READY, "size", "100");
        assertThat(containsPrNo(ready, reviewed.getPrNo())).isFalse();
        for (JsonNode row : ready.path("content")) {
            assertThat(row.path("technicalReview").path("reviewStatus").asText()).isNotEqualTo("Reviewed");
        }

        JsonNode done = getJson("/api/purchase/requisitions/technical-review", token,
                "reviewStatus", "Reviewed", "size", "100");
        assertThat(containsPrNo(done, reviewed.getPrNo())).isTrue();
    }

    @Test
    void filterOptionsAndCountsComeFromTheWholeQueue() throws Exception {
        String token = adminToken();
        seedQueuePr("QueueDept " + unique("D"), "Critical", false);

        JsonNode stats = getJson("/api/purchase/requisitions/technical-review/stats", token).path("data");
        assertThat(stats.path("pendingReview").asLong()).isEqualTo(queueSizeInDb());
        assertThat(stats.path("highPriority").asLong()).isGreaterThanOrEqualTo(1);

        boolean departmentPresent = false;
        for (JsonNode name : stats.path("departments")) {
            if (name.asText().startsWith("QueueDept")) departmentPresent = true;
        }
        assertThat(departmentPresent).isTrue();
    }

    @Test
    void departmentAndPriorityFiltersNarrowTheQueue() throws Exception {
        String token = adminToken();
        String department = "FilterDept " + unique("D");
        PurchaseRequisition target = seedQueuePr(department, "Critical", false);
        seedQueuePr("OtherDept " + unique("D"), "Low", false);

        JsonNode byDepartment = getJson("/api/purchase/requisitions/technical-review", token,
                "department", department, "size", "100");
        assertThat(byDepartment.path("totalElements").asLong()).isEqualTo(1);
        assertThat(byDepartment.path("content").get(0).path("prNo").asText()).isEqualTo(target.getPrNo());

        JsonNode highAndCritical = getJson("/api/purchase/requisitions/technical-review", token,
                "priority", "High,Critical", "size", "100");
        for (JsonNode row : highAndCritical.path("content")) {
            assertThat(row.path("priority").asText()).isIn("High", "Critical");
        }
    }

    @Test
    void searchMatchesPrNumberAndLineItems() throws Exception {
        String token = adminToken();
        PurchaseRequisition target = seedQueuePr("SearchDept " + unique("D"), "Medium", false);

        JsonNode byNumber = getJson("/api/purchase/requisitions/technical-review", token,
                "search", target.getPrNo(), "size", "100");
        assertThat(byNumber.path("totalElements").asLong()).isEqualTo(1);
        assertThat(byNumber.path("content").get(0).path("prNo").asText()).isEqualTo(target.getPrNo());

        String itemProduct = target.getItems().get(0).getProduct();
        JsonNode byItem = getJson("/api/purchase/requisitions/technical-review", token,
                "search", itemProduct, "size", "100");
        assertThat(byItem.path("totalElements").asLong()).isGreaterThanOrEqualTo(1);
    }

    @Test
    void queueIsOrderedByPriorityRankWhenAsked() throws Exception {
        String token = adminToken();
        seedQueuePr("SortDept " + unique("D"), "Critical", false);
        seedQueuePr("SortDept " + unique("D"), "Low", false);

        JsonNode page = getJson("/api/purchase/requisitions/technical-review", token,
                "sort", "priority", "size", "100");
        int previous = -1;
        for (JsonNode row : page.path("content")) {
            int rank = switch (row.path("priority").asText()) {
                case "Critical" -> 0;
                case "High" -> 1;
                case "Medium" -> 2;
                default -> 3;
            };
            assertThat(rank).isGreaterThanOrEqualTo(previous);
            previous = rank;
        }

        JsonNode descending = getJson("/api/purchase/requisitions/technical-review", token,
                "sort", "-priority", "size", "100");
        int previousDesc = 9;
        for (JsonNode row : descending.path("content")) {
            int rank = switch (row.path("priority").asText()) {
                case "Critical" -> 0;
                case "High" -> 1;
                case "Medium" -> 2;
                default -> 3;
            };
            assertThat(rank).isLessThanOrEqualTo(previousDesc);
            previousDesc = rank;
        }
    }

    @Test
    void emptyQueueIsReportedAsAnEmptyPage() throws Exception {
        String token = adminToken();
        JsonNode page = getJson("/api/purchase/requisitions/technical-review", token,
                "search", unique("nothing"), "size", "25");

        assertThat(page.path("content").size()).isZero();
        assertThat(page.path("totalElements").asLong()).isZero();
        assertThat(page.path("totalPages").asLong()).isLessThanOrEqualTo(1);
    }

    // ------------------------------------------------------------------
    // 4. Security
    // ------------------------------------------------------------------

    @Test
    void queueRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/purchase/requisitions/technical-review"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/purchase/requisitions/technical-review/stats"))
                .andExpect(status().isUnauthorized());
    }

    private boolean containsPrNo(JsonNode page, String prNo) {
        for (JsonNode row : page.path("content")) {
            if (prNo.equals(row.path("prNo").asText())) {
                return true;
            }
        }
        return false;
    }
}
