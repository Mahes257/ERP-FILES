package com.vishatech.erp.dashboard;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.crm.entity.Customer;
import com.vishatech.erp.crm.entity.FollowUp;
import com.vishatech.erp.crm.entity.Lead;
import com.vishatech.erp.crm.entity.LeadStage;
import com.vishatech.erp.crm.entity.LeadStatus;
import com.vishatech.erp.crm.repository.CustomerRepository;
import com.vishatech.erp.crm.repository.FollowUpRepository;
import com.vishatech.erp.crm.repository.LeadRepository;
import com.vishatech.erp.entity.production.Dispatch;
import com.vishatech.erp.entity.production.DispatchStatus;
import com.vishatech.erp.entity.production.EntryStatus;
import com.vishatech.erp.entity.production.OrderStatus;
import com.vishatech.erp.entity.production.PackingList;
import com.vishatech.erp.entity.production.PackingStatus;
import com.vishatech.erp.entity.production.Priority;
import com.vishatech.erp.entity.production.ProductionEntry;
import com.vishatech.erp.entity.production.ProductionOrder;
import com.vishatech.erp.entity.production.ProductionType;
import com.vishatech.erp.repository.production.DispatchRepository;
import com.vishatech.erp.repository.production.PackingListRepository;
import com.vishatech.erp.repository.production.ProductionEntryRepository;
import com.vishatech.erp.repository.production.ProductionOrderRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import jakarta.annotation.PostConstruct;
import java.sql.Connection;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Characterization tests for {@code GET /dashboard/stats}, written against the
 * <b>existing</b> implementation before any port, adapter or aggregation
 * service is introduced.
 *
 * <p>They pin the three things the Dashboard page depends on and that a
 * refactor must not be allowed to change:
 *
 * <ol>
 *   <li><b>The payload contract.</b> The response is a flat map whose key order
 *       is unspecified ({@code DashboardStats.toMap()} uses {@code
 *       Map.ofEntries}), so the key <em>set</em> is frozen here: 84 keys from
 *       {@code DashboardStats.toMap()} plus 46 explicit {@code map.put} keys
 *       plus 15 shop-floor keys (3 production types x 5 statuses).</li>
 *   <li><b>The values and their quirks.</b> Counters are asserted as deltas over
 *       a deterministic seed, so they are independent of whatever other tests
 *       left in the shared in-memory database. The documented quirks are
 *       asserted explicitly: fields the aggregation hardcodes to {@code 0},
 *       {@code pendingDeliveries} carrying the delivery-challan count, and
 *       {@code clientsTotal = max(0, count - deleted)}.</li>
 *   <li><b>The read cost.</b> Moved to {@link DashboardStatsQueryCountTests},
 *       which owns the measured statement budget (fixed term + one verification
 *       lookup per production order + the batched items load) and the proof that
 *       counted rows add no statement. Keeping the budget there means a wiring
 *       change that adds a query touches one file, and this class stays focused
 *       on the payload contract.</li>
 * </ol>
 *
 * <p><b>Known limit of this harness.</b> {@code
 * TechnicalVerificationService.getStatistics()} iterates the production orders
 * and loads each order's items, so seeding production orders does add
 * statements by design — that pre-existing behaviour is why the read-cost test
 * seeds CRM rows only.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class DashboardStatsApiTests extends AbstractSecurityTest {

    /** The frozen payload key set of {@code GET /dashboard/stats}. */
    private static final List<String> DASHBOARD_KEYS = List.of(
            "totalExpenses", "netProfit", "cashBalance", "totalCustomers",
            "totalVendors", "activeLeads", "salesOrders", "purchaseOrders",
            "pendingDeliveries", "pendingReceipts", "pendingPayments", "pendingCprs",
            "totalQuotations", "totalSalesContracts", "totalProformaInvoices", "totalInvoices",
            "totalPaymentReceipts", "totalCreditNotes", "totalDeliveryChallans", "draftQuotations",
            "pendingQuotations", "draftSalesContracts", "pendingSalesContracts", "draftSalesOrders",
            "pendingSalesOrders", "draftCreditNotes", "pendingCreditNotes", "overdueInvoices",
            "partialInvoices", "paidInvoices", "activeLeadsCount", "qualifiedLeads",
            "wonLeads", "lostLeads", "openFollowups", "overdueFollowups",
            "totalFollowups", "totalCprs", "draftCprs", "approvedCprs",
            "rejectedCprs", "convertedCprs", "totalCprTvs", "draftCprTvs",
            "underVerificationCprTvs", "completedCprTvs", "approvedCprTvs", "rejectedCprTvs",
            "totalCostWorkouts", "draftCostWorkouts", "pendingCostWorkouts", "completedCostWorkouts",
            "approvedCostWorkouts", "rejectedProfitWorkouts", "totalProfitWorkouts", "draftProfitWorkouts",
            "pendingProfitWorkouts", "completedProfitWorkouts", "approvedProfitWorkouts", "rejectedCostWorkouts",
            "approvedQuotations", "rejectedQuotations", "convertedQuotations", "submittedSalesContracts",
            "approvedSalesContracts", "activeSalesContracts", "completedSalesContracts", "cancelledSalesContracts",
            "approvedSalesOrders", "inProgressSalesOrders", "completedSalesOrders", "cancelledSalesOrders",
            "pendingDeliveryChallans", "approvedDeliveryChallans", "pendingProformaInvoices", "approvedProformaInvoices",
            "pendingInvoices", "approvedInvoices", "paidInvoicesCount", "approvedCreditNotes",
            "pendingPaymentReceipts", "receivedPaymentReceipts", "partialPaymentReceipts", "cancelledPaymentReceipts",
            "clientsTotal", "clientsActive", "followupTotal", "followupOpen",
            "followupCompleted", "followupRescheduled", "followupOverdue", "cprTvTotal",
            "cprTvDraft", "cprTvUnderVerification", "cprTvVerified", "cprTvRejected",
            "productionTotalOrders", "productionPendingApproval", "productionInProgress", "productionOnHold",
            "productionCompleted", "productionAverageProgress", "qcTotal", "qcPending",
            "qcInProgress", "qcPassed", "qcFailed", "qcHold",
            "productionTvTotal", "productionTvPending", "productionTvVerified", "productionTvRejected",
            "productionDrawingTotal", "productionDrawingPending", "productionDrawingVerified", "productionDrawingRejected",
            "productionModelTotal", "productionModelPending", "productionModelVerified", "productionModelRejected",
            "packingTotal", "packingPending", "packingInProgress", "packingCompleted",
            "packingReadyForDispatch", "dispatchTotal", "dispatchReady", "dispatchDispatched",
            "dispatchInTransit", "dispatchDelivered", "castingTotal", "castingPending",
            "castingInProgress", "castingHold", "castingCompleted", "fabricationTotal",
            "fabricationPending", "fabricationInProgress", "fabricationHold", "fabricationCompleted",
            "assemblyTotal", "assemblyPending", "assemblyInProgress", "assemblyHold",
            "assemblyCompleted");

    /**
     * Fields the current aggregation passes as literal {@code 0} (16 of them:
     * finance/vendor/purchase slots plus the whole CPR Technical Verification
     * block). They are part of today's API response and are pinned so that a
     * later "cleanup" cannot silently change a value the page renders.
     */
    private static final List<String> HARDCODED_ZERO_KEYS = List.of(
            "totalExpenses", "netProfit", "cashBalance", "totalVendors",
            "purchaseOrders", "pendingReceipts", "pendingPayments",
            "openFollowups", "overdueFollowups", "totalFollowups",
            "totalCprTvs", "draftCprTvs", "underVerificationCprTvs",
            "completedCprTvs", "approvedCprTvs", "rejectedCprTvs");

    /** Production types the controller emits shop-floor keys for. */
    private static final List<String> SHOP_FLOOR_TYPES = List.of("casting", "fabrication", "assembly");

    private static int sequence = 0;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private CustomerRepository customerRepository;

    @Autowired
    private FollowUpRepository followUpRepository;

    @Autowired
    private LeadRepository leadRepository;

    @Autowired
    private ProductionOrderRepository productionOrders;

    @Autowired
    private ProductionEntryRepository productionEntries;

    @Autowired
    private PackingListRepository packingLists;

    @Autowired
    private DispatchRepository dispatches;

    /**
     * {@code QualityInspection} declares six MySQL {@code JSON} columns, which
     * Hibernate cannot create in H2 (the quoted type is read as a missing
     * domain). The other dashboard test classes only ever call {@code count()},
     * so they recreate the table with an id column alone. This endpoint calls
     * {@code stats(null)}, which counts per status — so the table is created (or
     * upgraded) here with the {@code status} column those counts need. Adding a
     * column is non-destructive, so this stays correct regardless of which test
     * class created the table first.
     */
    @PostConstruct
    void ensureQualityInspectionsTable() throws Exception {
        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {
            statement.execute("CREATE TABLE IF NOT EXISTS quality_inspections ("
                    + "id VARCHAR(20) PRIMARY KEY, status VARCHAR(50))");
            statement.execute("ALTER TABLE quality_inspections ADD COLUMN IF NOT EXISTS status VARCHAR(50)");
        }
    }

    // ==================== Authentication ====================

    @Test
    void dashboardStatsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/dashboard/stats"))
                .andExpect(status().isUnauthorized());
    }

    // ==================== Payload contract ====================

    @Test
    void dashboardStatsExposeTheFrozenKeySet() throws Exception {
        String token = register("dashboard-stats-keys@example.com", "Dashboard Stats Keys");

        JsonNode body = dashboard(token);

        List<String> keys = new ArrayList<>();
        body.fieldNames().forEachRemaining(keys::add);

        assertThat(keys)
                .as("the dashboard payload key set is the page's contract")
                .containsExactlyInAnyOrderElementsOf(DASHBOARD_KEYS);
        assertThat(keys).hasSize(DASHBOARD_KEYS.size()).doesNotHaveDuplicates();
    }

    // ==================== Values and quirks ====================

    @Test
    void dashboardCountersFollowTheLiveTablesAndKeepTheirQuirks() throws Exception {
        String token = register("dashboard-stats-values@example.com", "Dashboard Stats Values");
        String mark = "DS" + System.nanoTime();
        LocalDate today = LocalDate.now();

        JsonNode before = dashboard(token);

        // ---- CRM: one active and one deleted customer. clientsActive rises by
        //      one, clientsTotal by one too, because the dashboard subtracts the
        //      deleted rows instead of counting them (max(0, count - deleted)).
        saveCustomer(mark + "-ACTIVE", "Active");
        saveCustomer(mark + "-DELETED", "Deleted");

        // ---- Follow-ups: two open (one of them overdue), one completed, one
        //      rescheduled. countOpenOverdue only looks at status 'Open' rows
        //      whose next follow-up date is before today.
        saveFollowUp(mark + "-FU-OPEN", "Open", today, null);
        saveFollowUp(mark + "-FU-OVERDUE", "Open", today, today.minusDays(3));
        saveFollowUp(mark + "-FU-DONE", "Completed", today, today.plusDays(2));
        saveFollowUp(mark + "-FU-RESCH", "Rescheduled", today, today.plusDays(4));

        // ---- Leads: three active leads, one per stage the dashboard counts.
        saveLead(mark + "-L-QUALIFIED", LeadStatus.ACTIVE, LeadStage.QUALIFIED);
        saveLead(mark + "-L-WON", LeadStatus.ACTIVE, LeadStage.WON);
        saveLead(mark + "-L-LOST", LeadStatus.ACTIVE, LeadStage.LOST);

        // ---- Production orders: one per status the dashboard reports separately.
        saveOrder(OrderStatus.PENDING_PRODUCTION_APPROVAL);
        saveOrder(OrderStatus.PENDING_ADMIN_APPROVAL);
        saveOrder(OrderStatus.IN_PROGRESS);
        saveOrder(OrderStatus.HOLD);
        saveOrder(OrderStatus.COMPLETED);

        // ---- Shop-floor jobs: one pending and one completed job per production
        //      type, each on its own draft order (the entry table requires an order).
        for (ProductionType type : ProductionType.values()) {
            saveEntry(type, EntryStatus.PENDING);
            saveEntry(type, EntryStatus.COMPLETED);
        }

        // ---- Packing and dispatch.
        savePackingList(PackingStatus.PENDING);
        saveDispatch(DispatchStatus.READY);

        JsonNode after = dashboard(token);

        // CRM
        assertThat(delta(after, before, "clientsActive")).isEqualTo(1L);
        assertThat(delta(after, before, "clientsTotal"))
                .as("clientsTotal = max(0, customers - deleted customers)")
                .isEqualTo(1L);
        assertThat(delta(after, before, "totalCustomers"))
                .as("totalCustomers is the raw customer count, deleted rows included")
                .isEqualTo(2L);
        assertThat(delta(after, before, "followupTotal")).isEqualTo(4L);
        assertThat(delta(after, before, "followupOpen")).isEqualTo(2L);
        assertThat(delta(after, before, "followupCompleted")).isEqualTo(1L);
        assertThat(delta(after, before, "followupRescheduled")).isEqualTo(1L);
        assertThat(delta(after, before, "followupOverdue")).isEqualTo(1L);
        assertThat(delta(after, before, "activeLeads")).isEqualTo(3L);
        assertThat(delta(after, before, "activeLeadsCount")).isEqualTo(3L);
        assertThat(delta(after, before, "qualifiedLeads")).isEqualTo(1L);
        assertThat(delta(after, before, "wonLeads")).isEqualTo(1L);
        assertThat(delta(after, before, "lostLeads")).isEqualTo(1L);

        // Production orders: 5 seeded orders + 6 orders carrying the shop-floor
        // entries. productionPendingApproval is the SUM of both approval states.
        assertThat(delta(after, before, "productionTotalOrders")).isEqualTo(11L);
        assertThat(delta(after, before, "productionPendingApproval"))
                .as("pendingProductionApproval + pendingAdminApproval")
                .isEqualTo(2L);
        assertThat(delta(after, before, "productionInProgress")).isEqualTo(1L);
        assertThat(delta(after, before, "productionOnHold")).isEqualTo(1L);
        assertThat(delta(after, before, "productionCompleted")).isEqualTo(1L);
        assertThat(delta(after, before, "productionTvTotal"))
                .as("the technical-verification statistic counts production orders")
                .isEqualTo(11L);

        // Shop-floor jobs, per type and status: two jobs per production type
        // (one pending, one completed), and no other type leaks into the count.
        for (String type : SHOP_FLOOR_TYPES) {
            assertThat(delta(after, before, type + "Total")).isEqualTo(2L);
            assertThat(delta(after, before, type + "Pending")).isEqualTo(1L);
            assertThat(delta(after, before, type + "Completed")).isEqualTo(1L);
            assertThat(delta(after, before, type + "InProgress")).isZero();
            assertThat(delta(after, before, type + "Hold")).isZero();
        }

        // Packing and dispatch.
        assertThat(delta(after, before, "packingTotal")).isEqualTo(1L);
        assertThat(delta(after, before, "packingPending")).isEqualTo(1L);
        assertThat(delta(after, before, "dispatchTotal")).isEqualTo(1L);
        assertThat(delta(after, before, "dispatchReady")).isEqualTo(1L);

        // ---- Quirk: pendingDeliveries carries the delivery-challan count, not a
        //      pending-delivery count. It still mirrors totalDeliveryChallans.
        assertThat(after.path("pendingDeliveries").asLong())
                .as("pendingDeliveries is fed from the delivery-challan total")
                .isEqualTo(after.path("totalDeliveryChallans").asLong());

        // ---- Quirk: the fields the aggregation hardcodes to zero stay zero.
        for (String key : HARDCODED_ZERO_KEYS) {
            assertThat(after.path(key).asLong())
                    .as(key + " is a literal 0 in the current aggregation")
                    .isZero();
        }

        // ---- The QC block reads a table that cannot exist in H2 with its MySQL
        //      JSON columns; an empty recreated table keeps the endpoint serving
        //      zeroes instead of failing.
        assertThat(after.path("qcTotal").asLong()).isZero();
    }

    // ==================== Harness ====================

    private JsonNode dashboard(String token) throws Exception {
        MvcResult result = mockMvc.perform(get("/dashboard/stats")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

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

    private static long delta(JsonNode after, JsonNode before, String key) {
        return after.path(key).asLong() - before.path(key).asLong();
    }

    // ==================== Seeding ====================

    private static synchronized String unique(String prefix) {
        sequence++;
        String value = prefix + "-" + Long.toString(System.nanoTime(), 36)
                + Integer.toString(sequence, 36);
        return value.length() <= 20 ? value : value.substring(value.length() - 20);
    }

    private void saveCustomer(String mark, String statusValue) {
        Customer customer = new Customer();
        customer.setBusinessName(mark);
        customer.setStatus(statusValue);
        customerRepository.save(customer);
    }

    private void saveFollowUp(String company, String statusValue, LocalDate followupDate, LocalDate nextDate) {
        FollowUp followUp = new FollowUp();
        followUp.setCompanyName(company);
        followUp.setStatus(statusValue);
        followUp.setFollowupDate(followupDate);
        followUp.setNextFollowupDate(nextDate);
        followUpRepository.save(followUp);
    }

    private void saveLead(String name, LeadStatus statusValue, LeadStage stage) {
        Lead lead = new Lead();
        lead.setName(name);
        lead.setStatus(statusValue);
        lead.setStage(stage);
        leadRepository.save(lead);
    }

    private ProductionOrder saveOrder(OrderStatus statusValue) {
        ProductionOrder order = ProductionOrder.builder()
                .workOrder(unique("WO"))
                .product("Dashboard stats product")
                .department("Dashboard Stats")
                .status(statusValue)
                .priority(Priority.MEDIUM)
                .dueDate(LocalDate.now().plusDays(5))
                .startDate(LocalDate.now().minusDays(2))
                .quantity(10)
                .progress(0)
                .build();
        return productionOrders.save(order);
    }

    /** One shop-floor job, on its own draft order — the entry table requires an order. */
    private void saveEntry(ProductionType type, EntryStatus statusValue) {
        ProductionOrder order = saveOrder(OrderStatus.DRAFT);
        ProductionEntry entry = ProductionEntry.builder()
                .productionOrder(order)
                .productionType(type.getDisplayName())
                .stage("Dashboard stage " + statusValue)
                .inputQuantity(10)
                .outputQuantity(0)
                .rejectedQuantity(0)
                .status(statusValue)
                .build();
        productionEntries.save(entry);
    }

    private void savePackingList(PackingStatus statusValue) {
        PackingList list = PackingList.builder()
                .packingListNumber(unique("PL"))
                .workOrderId("WO-DASHBOARD-TEST")
                .product("Dashboard stats product")
                .customer("Dashboard Stats Customer")
                .productionQuantity(10)
                .status(statusValue)
                .build();
        packingLists.save(list);
    }

    private void saveDispatch(DispatchStatus statusValue) {
        Dispatch dispatch = Dispatch.builder()
                .dispatchNumber(unique("DSP"))
                .workOrderId("WO-DASHBOARD-TEST")
                .product("Dashboard stats product")
                .customer("Dashboard Stats Customer")
                .quantity(5)
                .status(statusValue)
                .build();
        dispatches.save(dispatch);
    }
}
