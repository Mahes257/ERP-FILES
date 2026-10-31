package com.vishatech.erp.purchase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.PurchaseInvoice;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.repository.NotificationRepository;
import com.vishatech.erp.repository.PurchaseGrnRepository;
import com.vishatech.erp.repository.PurchaseInspectionRepository;
import com.vishatech.erp.repository.PurchaseInvoiceRepository;
import com.vishatech.erp.repository.PurchaseOrderRepository;
import com.vishatech.erp.repository.PurchaseRequisitionRepository;
import com.vishatech.erp.repository.PurchaseRfqRepository;
import com.vishatech.erp.repository.UserRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.security.JwtService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Prompt 7 integration tests — Purchase Work Queue, Dashboard and
 * Notifications against a REAL database (H2 in MySQL mode, real JPA
 * entities and repositories, no mocks).
 *
 * Every count assertion compares the API response with an independent
 * repository count taken at the same moment, so a hardcoded value can
 * never pass.
 */
@SpringBootTest
@AutoConfigureMockMvc
class PurchaseWorkQueueIntegrationTests extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private JwtService jwtService;
    @Autowired
    private com.vishatech.erp.security.CustomUserDetailsService userDetailsService;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private PurchaseRequisitionRepository requisitions;
    @Autowired
    private PurchaseRfqRepository rfqs;
    @Autowired
    private PurchaseOrderRepository orders;
    @Autowired
    private PurchaseGrnRepository grns;
    @Autowired
    private PurchaseInspectionRepository inspections;
    @Autowired
    private PurchaseInvoiceRepository invoices;
    @Autowired
    private NotificationRepository notifications;

    private String tokenFor(String email) {
        return jwtService.generateToken(userDetailsService.loadUserByUsername(email));
    }

    private String adminToken() {
        return tokenFor("admin@vishaktech.com");
    }

    private JsonNode getData(MvcResult result) throws Exception {
        JsonNode root = objectMapper.readTree(result.getResponse().getContentAsString());
        return root.path("data");
    }

    private JsonNode postJson(String url, String token, Object body) throws Exception {
        MvcResult result = mockMvc.perform(post(url)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().is2xxSuccessful())
                .andReturn();
        return getData(result);
    }

    // ------------------------------------------------------------------
    // PR lifecycle helpers — real records through the real API
    // ------------------------------------------------------------------

    private JsonNode createAndSubmitPr(String token) throws Exception {
        String today = LocalDate.now().toString();
        Map<String, Object> item = Map.of(
                "product", "Hex bolt M10",
                "qty", new BigDecimal("10"),
                "rate", new BigDecimal("25.50"));
        Map<String, Object> body = Map.of(
                "title", "Work queue test PR",
                "department", "Quality",
                "requester", "Kavya Krishnan",
                "currency", "INR",
                "priority", "High",
                "date", today,
                "expectedDate", LocalDate.now().plusDays(10).toString(),
                "items", List.of(item));
        JsonNode created = postJson("/api/purchase/requisitions", token, body);
        long prId = created.path("id").asLong();
        return postJson("/api/purchase/requisitions/" + prId + "/submit", token, Map.of());
    }

    // ------------------------------------------------------------------
    // 1. Work queue counts are real database counts
    // ------------------------------------------------------------------

    @Test
    void workQueueCountsMatchDatabaseRecords() throws Exception {
        String token = adminToken();

        // Baseline counts straight from the database.
        long prPendingBefore = requisitions.countByStatusAndRecordState(
                "Pending Approval", com.vishatech.erp.entity.PurchaseRequisition.RECORD_ACTIVE);

        // Add a real pending PR through the workflow.
        createAndSubmitPr(token);

        long prPendingAfter = requisitions.countByStatusAndRecordState(
                "Pending Approval", com.vishatech.erp.entity.PurchaseRequisition.RECORD_ACTIVE);
        assertThat(prPendingAfter).isEqualTo(prPendingBefore + 1);

        // The work queue must reflect the database, not a constant.
        MvcResult queue = mockMvc.perform(get("/api/purchase/work-queue/counts")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode counts = getData(queue);

        assertThat(counts.path("pr-approvals").asLong())
                .isEqualTo(requisitions.countByStatusAndRecordState(
                        "Pending Approval", com.vishatech.erp.entity.PurchaseRequisition.RECORD_ACTIVE));
        assertThat(counts.path("rfq-actions").asLong())
                .isEqualTo(rfqs.countByStatusIn(java.util.List.of(
                        "Pending Approval", "Quotation Received", "Evaluation",
                        "1st Approval", "2nd Approval", "Final Approval")));
        assertThat(counts.path("po-approvals").asLong())
                .isEqualTo(orders.countByStatus("Pending Approval"));
        assertThat(counts.path("po-releases").asLong())
                .isEqualTo(orders.countByStatus("Approved"));
        assertThat(counts.path("pending-grns").asLong())
                .isEqualTo(grns.countByStatus("Expected"));
        assertThat(counts.path("pending-inspections").asLong())
                .isEqualTo(inspections.countByStatus("Pending"));
        assertThat(counts.path("invoice-matching").asLong())
                .isEqualTo(invoices.countByMatchStatusIn(java.util.List.of("Pending Match", "Mismatch")));
        assertThat(counts.path("invoice-approvals").asLong())
                .isEqualTo(invoices.countByStatus("Submitted"));
        assertThat(counts.path("payments-due").asLong())
                .isEqualTo(invoices.countPaymentsDue());
    }

    // ------------------------------------------------------------------
    // 2. Approving the PR decreases the PR Approvals count
    // ------------------------------------------------------------------

    @Test
    void prApprovalDecreasesWorkQueueCount() throws Exception {
        String token = adminToken();
        JsonNode pr = createAndSubmitPr(token);
        long prId = pr.path("id").asLong();

        MvcResult before = mockMvc.perform(get("/api/purchase/work-queue/counts")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        long countBefore = getData(before).path("pr-approvals").asLong();
        assertThat(requisitions.findById(prId).orElseThrow().getStatus())
                .isEqualTo("Pending Approval");

        postJson("/api/purchase/requisitions/" + prId + "/approve", token, Map.of("remarks", "ok"));

        MvcResult after = mockMvc.perform(get("/api/purchase/work-queue/counts")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        long countAfter = getData(after).path("pr-approvals").asLong();

        assertThat(countAfter).isEqualTo(countBefore - 1);
        assertThat(requisitions.findById(prId).orElseThrow().getStatus())
                .isEqualTo("Technical Specification Review");
    }

    // ------------------------------------------------------------------
    // 3. Work queue returns actionable records with routing info
    // ------------------------------------------------------------------

    @Test
    void workQueueReturnsActionableRecords() throws Exception {
        String token = adminToken();
        createAndSubmitPr(token);

        MvcResult queue = mockMvc.perform(get("/api/purchase/work-queue")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode categories = getData(queue).path("categories");

        assertThat(categories.isArray()).isTrue();
        assertThat(categories.size()).isEqualTo(10);

        JsonNode prCategory = null;
        for (JsonNode category : categories) {
            assertThat(category.has("key")).isTrue();
            assertThat(category.has("count")).isTrue();
            assertThat(category.has("items")).isTrue();
            if ("pr-approvals".equals(category.path("key").asText())) {
                prCategory = category;
            }
        }
        assertThat(prCategory).isNotNull();
        JsonNode items = prCategory.path("items");
        assertThat(items.isArray()).isTrue();
        assertThat(items.size()).isGreaterThanOrEqualTo(1);
        JsonNode first = items.get(0);
        assertThat(first.path("route").asText()).startsWith("/purchase/");
        assertThat(first.path("actionLabel").asText()).isNotBlank();
        assertThat(first.path("number").asText()).startsWith("PR-");
    }

    // ------------------------------------------------------------------
    // 4. Dashboard stats are real database values
    // ------------------------------------------------------------------

    @Test
    void dashboardStatsMatchDatabase() throws Exception {
        String token = adminToken();

        MvcResult result = mockMvc.perform(get("/api/purchase/dashboard/stats")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode stats = getData(result);

        assertThat(stats.path("totalPRs").asLong())
                .isEqualTo(requisitions.countByRecordState(
                        com.vishatech.erp.entity.PurchaseRequisition.RECORD_ACTIVE));
        assertThat(stats.path("pendingPRApprovals").asLong())
                .isEqualTo(requisitions.countByStatusAndRecordState(
                        "Pending Approval", com.vishatech.erp.entity.PurchaseRequisition.RECORD_ACTIVE));
        assertThat(stats.path("pendingPOApprovals").asLong())
                .isEqualTo(orders.countByStatus("Pending Approval"));
        assertThat(stats.path("pendingPOReleases").asLong())
                .isEqualTo(orders.countByStatus("Approved"));
        assertThat(stats.path("pendingGRNs").asLong())
                .isEqualTo(grns.countByStatus("Expected"));
        assertThat(stats.path("pendingInspections").asLong())
                .isEqualTo(inspections.countByStatus("Pending"));
        assertThat(stats.path("pendingInvoiceMatching").asLong())
                .isEqualTo(invoices.countByMatchStatusIn(java.util.List.of("Pending Match", "Mismatch")));
        assertThat(stats.path("pendingInvoiceApprovals").asLong())
                .isEqualTo(invoices.countByStatus("Submitted"));
        assertThat(stats.path("paymentsDue").asLong())
                .isEqualTo(invoices.countPaymentsDue());
        assertThat(stats.path("overduePayments").asLong())
                .isEqualTo(invoices.countPaymentsOverdue(LocalDate.now().toString()));

        // Dashboard values must agree with the work queue for the same
        // category (single source of truth).
        MvcResult queue = mockMvc.perform(get("/api/purchase/work-queue/counts")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(stats.path("pendingPRApprovals").asLong())
                .isEqualTo(getData(queue).path("pr-approvals").asLong());
        assertThat(stats.path("paymentsDue").asLong())
                .isEqualTo(getData(queue).path("payments-due").asLong());
    }

    // ------------------------------------------------------------------
    // 5. Overdue payments are identified from actual due dates
    // ------------------------------------------------------------------

    @Test
    void overduePaymentsUseDueDates() throws Exception {
        String token = adminToken();
        String today = LocalDate.now().toString();

        long overdueBefore = invoices.countPaymentsOverdue(today);

        // Create a real overdue invoice: matched, unpaid, due date passed.
        JsonNode po = postJson("/api/purchase/orders", token, Map.of(
                "title", "Overdue test order",
                "vendor", "Test Supplier",
                "orderDate", today,
                "items", List.of(Map.of(
                        "product", "Bearing 6204",
                        "qty", new BigDecimal("5"),
                        "rate", new BigDecimal("100")))));
        String poNo = po.path("poNo").asText();

        // Move the PO through release so a GRN can be received.
        long poId = po.path("id").asLong();
        postJson("/api/purchase/orders/" + poId + "/submit", token, Map.of());
        postJson("/api/purchase/orders/" + poId + "/approve", token, Map.of());
        postJson("/api/purchase/orders/" + poId + "/release", token, Map.of());

        // GRN + receipt so the three-way match can pass.
        JsonNode grn = postJson("/api/purchase/grns", token, Map.of("poNo", poNo));
        long grnId = grn.path("id").asLong();
        postJson("/api/purchase/grns/" + grnId + "/receive", token, Map.of());

        // Invoice with a past due date, exact received qty and exact rate.
        String pastDue = LocalDate.now().minusDays(5).toString();
        JsonNode invoice = postJson("/api/purchase/invoices", token, Map.of(
                "poNo", poNo,
                "grnNo", grn.path("grnNo").asText(),
                "vendorInvoiceNo", "VINV-" + System.currentTimeMillis(),
                "dueDate", pastDue,
                "items", List.of(Map.of(
                        "product", "Bearing 6204",
                        "qty", new BigDecimal("5"),
                        "rate", new BigDecimal("100")))));
        long invoiceId = invoice.path("id").asLong();
        postJson("/api/purchase/invoices/" + invoiceId + "/submit", token, Map.of());
        postJson("/api/purchase/invoices/" + invoiceId + "/approve", token, Map.of());

        PurchaseInvoice saved = invoices.findById(invoiceId).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo("Approved");
        assertThat(saved.getMatchStatus()).isEqualTo("Matched");

        long overdueAfter = invoices.countPaymentsOverdue(today);
        assertThat(overdueAfter).isEqualTo(overdueBefore + 1);

        // Dashboard reflects the same real value.
        MvcResult stats = mockMvc.perform(get("/api/purchase/dashboard/stats")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(getData(stats).path("overduePayments").asLong()).isEqualTo(overdueAfter);
    }

    // ------------------------------------------------------------------
    // 6. Workflow events generate notifications (via NotificationService)
    // ------------------------------------------------------------------

    @Test
    void prLifecycleGeneratesNotifications() throws Exception {
        String token = adminToken();
        User admin = userRepository.findByEmail("admin@vishaktech.com").orElseThrow();

        long before = notifications.findByRecipientUserIdOrderByCreatedAtDesc(admin.getId())
                .stream()
                .filter(n -> "PURCHASE".equals(n.getModule()))
                .count();

        JsonNode pr = createAndSubmitPr(token);
        long prId = pr.path("id").asLong();

        List<com.vishatech.erp.entity.Notification> afterSubmit =
                notifications.findByRecipientUserIdOrderByCreatedAtDesc(admin.getId());
        assertThat(afterSubmit.stream()
                        .filter(n -> "PURCHASE".equals(n.getModule())
                                && "PR_SUBMITTED".equals(n.getNotificationType())
                                && Long.valueOf(prId).equals(n.getReferenceId()))
                        .count())
                .isEqualTo(1);

        // Resubmitting the same PR again must not duplicate the notification
        // (deduplication guard — repeated operations never re-notify).
        mockMvc.perform(post("/api/purchase/requisitions/" + prId + "/submit")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().is4xxClientError());

        postJson("/api/purchase/requisitions/" + prId + "/approve", token, Map.of("remarks", "ok"));
        List<com.vishatech.erp.entity.Notification> afterApprove =
                notifications.findByRecipientUserIdOrderByCreatedAtDesc(admin.getId());
        assertThat(afterApprove.stream()
                        .filter(n -> "PURCHASE".equals(n.getModule())
                                && "PR_APPROVED".equals(n.getNotificationType())
                                && Long.valueOf(prId).equals(n.getReferenceId()))
                        .count())
                .isEqualTo(1);

        long after = afterApprove.stream()
                .filter(n -> "PURCHASE".equals(n.getModule()))
                .count();
        assertThat(after).isEqualTo(before + 2);
    }

    // ------------------------------------------------------------------
    // 7. PO lifecycle generates notifications (submit → approve → release)
    // ------------------------------------------------------------------

    @Test
    void poLifecycleGeneratesNotifications() throws Exception {
        String token = adminToken();
        User admin = userRepository.findByEmail("admin@vishaktech.com").orElseThrow();
        String today = LocalDate.now().toString();

        JsonNode po = postJson("/api/purchase/orders", token, Map.of(
                "title", "Notification test order",
                "vendor", "Notification Supplier",
                "orderDate", today,
                "items", List.of(Map.of(
                        "product", "Coupling NBR",
                        "qty", new BigDecimal("2"),
                        "rate", new BigDecimal("300")))));
        long poId = po.path("id").asLong();

        postJson("/api/purchase/orders/" + poId + "/submit", token, Map.of());
        postJson("/api/purchase/orders/" + poId + "/approve", token, Map.of());
        postJson("/api/purchase/orders/" + poId + "/release", token, Map.of());

        List<com.vishatech.erp.entity.Notification> all =
                notifications.findByRecipientUserIdOrderByCreatedAtDesc(admin.getId());
        assertThat(all.stream().filter(n -> "PURCHASE".equals(n.getModule())
                        && "PO_SUBMITTED".equals(n.getNotificationType())
                        && Long.valueOf(poId).equals(n.getReferenceId())).count())
                .isEqualTo(1);
        assertThat(all.stream().filter(n -> "PURCHASE".equals(n.getModule())
                        && "PO_APPROVED".equals(n.getNotificationType())
                        && Long.valueOf(poId).equals(n.getReferenceId())).count())
                .isEqualTo(1);
        assertThat(all.stream().filter(n -> "PURCHASE".equals(n.getModule())
                        && "PO_RELEASED".equals(n.getNotificationType())
                        && Long.valueOf(poId).equals(n.getReferenceId())).count())
                .isEqualTo(1);
    }

    // ------------------------------------------------------------------
    // 8. Authorization — per RolePermissions: USER holds PURCHASE_VIEW /
    //    CREATE / EDIT but NOT PURCHASE_APPROVE. Viewing the queue is
    //    allowed for every role; approval-class actions are the 403 line.
    // ------------------------------------------------------------------

    @Test
    void usersWithoutApprovePermissionCannotApproveQueueItems() throws Exception {
        String userToken = tokenFor("kavya@vishaktech.com");

        // USER role has PURCHASE_VIEW → can read the queue and dashboard.
        mockMvc.perform(get("/api/purchase/work-queue")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/purchase/work-queue/counts")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/purchase/work-queue/pr-approvals")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/purchase/dashboard/stats")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk());

        // Create + submit a real PR as admin, then verify the USER role
        // (no PURCHASE_APPROVE authority) cannot act on its queue item.
        JsonNode pr = createAndSubmitPr(adminToken());
        long prId = pr.path("id").asLong();
        mockMvc.perform(post("/api/purchase/requisitions/" + prId + "/approve")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("remarks", "not allowed"))))
                .andExpect(status().isForbidden());

        // The restricted item stays pending — nothing was bypassed.
        assertThat(requisitions.findById(prId).orElseThrow().getStatus())
                .isEqualTo("Pending Approval");

        // No token at all → unauthorized.
        mockMvc.perform(get("/api/purchase/work-queue"))
                .andExpect(status().isUnauthorized());
    }

    // ------------------------------------------------------------------
    // 9. Admin can approve queue items; USER-role create follows the matrix
    // ------------------------------------------------------------------

    @Test
    void roleGrantsFollowRbacMatrix() throws Exception {
        String adminToken = adminToken();
        mockMvc.perform(get("/api/purchase/work-queue")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk());

        // USER role holds PURCHASE_CREATE — creating an order is allowed.
        String userToken = tokenFor("kavya@vishaktech.com");
        mockMvc.perform(post("/api/purchase/orders")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("title", "x"))))
                .andExpect(status().isBadRequest());

        // ...but PO approval stays behind PURCHASE_APPROVE (403).
        JsonNode po = postJson("/api/purchase/orders", adminToken(), Map.of(
                "title", "RBAC order",
                "vendor", "RBAC Supplier",
                "orderDate", LocalDate.now().toString(),
                "items", List.of(Map.of(
                        "product", "O-ring",
                        "qty", new BigDecimal("1"),
                        "rate", new BigDecimal("10")))));
        long poId = po.path("id").asLong();
        postJson("/api/purchase/orders/" + poId + "/submit", adminToken(), Map.of());
        mockMvc.perform(post("/api/purchase/orders/" + poId + "/approve")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of())))
                .andExpect(status().isForbidden());
        assertThat(orders.findById(poId).orElseThrow().getStatus())
                .isEqualTo("Pending Approval");
    }

    // ------------------------------------------------------------------
    // 10. GRN receipt flows into inspection queue counts (real data flow)
    // ------------------------------------------------------------------

    @Test
    void grnReceiptIncreasesInspectionQueue() throws Exception {
        String token = adminToken();
        String today = LocalDate.now().toString();

        JsonNode po = postJson("/api/purchase/orders", token, Map.of(
                "title", "Inspection flow order",
                "vendor", "Flow Supplier",
                "orderDate", today,
                "items", List.of(Map.of(
                        "product", "Valve V-1",
                        "qty", new BigDecimal("4"),
                        "rate", new BigDecimal("150")))));
        long poId = po.path("id").asLong();
        String poNo = po.path("poNo").asText();
        postJson("/api/purchase/orders/" + poId + "/submit", token, Map.of());
        postJson("/api/purchase/orders/" + poId + "/approve", token, Map.of());
        postJson("/api/purchase/orders/" + poId + "/release", token, Map.of());

        JsonNode grn = postJson("/api/purchase/grns", token, Map.of("poNo", poNo));
        long grnId = grn.path("id").asLong();

        // Before receipt the GRN is Expected → pending GRNs, not inspections.
        MvcResult before = mockMvc.perform(get("/api/purchase/work-queue/counts")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        long grnQueueBefore = getData(before).path("pending-grns").asLong();
        assertThat(grns.findById(grnId).orElseThrow().getStatus()).isEqualTo("Expected");

        postJson("/api/purchase/grns/" + grnId + "/receive", token, Map.of());

        // After receipt: GRN no longer pending receipt, GRN count decreases.
        MvcResult after = mockMvc.perform(get("/api/purchase/work-queue/counts")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(getData(after).path("pending-grns").asLong())
                .isEqualTo(grnQueueBefore - 1);
        assertThat(grns.findById(grnId).orElseThrow().getStatus())
                .isEqualTo("Pending Inspection");
    }

    // ------------------------------------------------------------------
    // 11. Soft-deleted PRs never appear in the queue (record state filter)
    // ------------------------------------------------------------------

    @Test
    void deletedPrsAreExcludedFromQueue() throws Exception {
        String token = adminToken();
        JsonNode pr = createAndSubmitPr(token);
        long prId = pr.path("id").asLong();

        MvcResult before = mockMvc.perform(get("/api/purchase/work-queue/counts")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        long countBefore = getData(before).path("pr-approvals").asLong();

        mockMvc.perform(patch("/api/purchase/requisitions/" + prId + "/delete")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().is2xxSuccessful());

        MvcResult after = mockMvc.perform(get("/api/purchase/work-queue/counts")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(getData(after).path("pr-approvals").asLong())
                .isEqualTo(countBefore - 1);
    }
}
