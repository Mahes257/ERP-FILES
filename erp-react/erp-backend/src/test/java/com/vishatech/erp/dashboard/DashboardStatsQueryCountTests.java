package com.vishatech.erp.dashboard;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.crm.entity.FollowUp;
import com.vishatech.erp.crm.entity.Customer;
import com.vishatech.erp.crm.entity.Lead;
import com.vishatech.erp.crm.entity.LeadStage;
import com.vishatech.erp.crm.entity.LeadStatus;
import com.vishatech.erp.crm.repository.CustomerRepository;
import com.vishatech.erp.crm.repository.FollowUpRepository;
import com.vishatech.erp.crm.repository.LeadRepository;
import com.vishatech.erp.entity.production.Dispatch;
import com.vishatech.erp.entity.production.DispatchStatus;
import com.vishatech.erp.entity.production.OrderStatus;
import com.vishatech.erp.entity.production.PackingList;
import com.vishatech.erp.entity.production.PackingStatus;
import com.vishatech.erp.entity.production.Priority;
import com.vishatech.erp.entity.production.ProductionOrder;
import com.vishatech.erp.repository.production.DispatchRepository;
import com.vishatech.erp.repository.production.PackingListRepository;
import com.vishatech.erp.repository.production.ProductionOrderRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import jakarta.annotation.PostConstruct;
import jakarta.persistence.EntityManagerFactory;
import java.sql.Connection;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.Map;
import javax.sql.DataSource;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * The explicit read-cost budget of {@code GET /dashboard/stats}.
 *
 * <p><b>Why this is a separate class.</b> The payload contract ("does the page
 * still get its 145 keys with the right values?") and the read cost ("how many
 * SQL statements does one request issue, and which rows make that number
 * grow?") answer different questions and are maintained by different changes: a
 * payload change must touch {@link DashboardStatsApiTests}, a wiring change that
 * adds a query must touch the two constants below. Keeping the budget here also
 * means the measurement runs once, not once per payload assertion.
 *
 * <p><b>The budget is measured, not invented.</b> One request issues a fixed
 * number of statements — every CRM / CPR / production / sales counter is a single
 * {@code COUNT}, {@code SUM} or {@code GROUP BY} statement — plus exactly one
 * statement per production order, because
 * {@code TechnicalVerificationService.getStatistics()} (which the production port
 * delegates to) walks every order and looks up its technical verifications. That
 * second term is pre-existing behaviour, not something this refactor introduced,
 * so it is modelled explicitly instead of being hidden inside a loose threshold:
 *
 * <pre>
 * statements(one request) = FIXED_STATEMENTS
 *                         + STATEMENTS_PER_PRODUCTION_ORDER * productionOrders
 *                         + batches(productionOrders)
 * </pre>
 *
 * <p>The third term is the lazily-loaded {@code ProductionOrder.items} collection,
 * which Hibernate batches at {@value #ITEMS_BATCH_SIZE} (the entity's
 * {@code @BatchSize}) — one statement per 50 orders, therefore 0 or 1 for the row
 * counts this suite reaches, and bounded by
 * {@link #itemsBatches(long)}. Because the term is a step function, the absolute
 * count is asserted as a two-statement window rather than a single number; the
 * <em>exact</em> per-order rate and the batch step are asserted by the controlled
 * delta test, which crosses a batch boundary on purpose.
 *
 * <p><b>Measured values.</b> On this codebase a request costs 194 statements with
 * 10 orders and 204 with 20 — that is {@code 183 + 1 x orders + 1 batch}; 21 orders
 * were observed at 205 while another dashboard class had seeded orders. Constants
 * are pinned from those measurements, and every test re-measures rather than
 * trusting the doc: a port that stops delegating and issues its own query breaks
 * the fixed term, and a new per-row read breaks the per-order term.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class DashboardStatsQueryCountTests extends AbstractSecurityTest {

    /**
     * MEASURED: statements one request issues independently of the production-order
     * count — the ports' counts/sums, the workout statistics, authentication and
     * Hibernate's own bookkeeping. 194 statements measured at 10 orders, of which
     * 1 was the single {@code findByWorkOrderId} lookup per order and 1 the batched
     * items load, leaves 183.
     */
    private static final long FIXED_STATEMENTS = 183;

    /** MEASURED: one {@code findByWorkOrderId} statement per production order. */
    private static final long STATEMENTS_PER_PRODUCTION_ORDER = 1;

    /**
     * Mirrors {@code ProductionOrder.items}' {@code @BatchSize(50)}: the lazy items
     * collection is loaded in batches of 50 orders, one statement per batch.
     */
    private static final long ITEMS_BATCH_SIZE = 50;

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
    private PackingListRepository packingLists;

    @Autowired
    private DispatchRepository dispatches;

    @Autowired
    private ProductionOrderRepository productionOrders;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    /**
     * {@code QualityInspection} declares MySQL {@code JSON} columns that H2
     * cannot create, so the table is (re)created with the {@code status} column
     * the dashboard's per-status counts need — the same workaround
     * {@code DashboardStatsApiTests} and {@code SalesDashboardApiTest} use.
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

    @BeforeEach
    void enableStatistics() {
        statistics().setStatisticsEnabled(true);
    }

    // ==================== The budget ====================

    /**
     * One request costs the fixed term plus the verification terms, and rows the
     * dashboard only <em>counts</em> (customers, follow-ups, leads, packing
     * lists, dispatches) cost nothing extra: the modular refactor routed every
     * one of those counters through a port that delegates to a SQL count.
     */
    @Test
    void oneRequestStaysInsideTheMeasuredBudgetAndIgnoresCountedRows() throws Exception {
        String token = register("dashboard-cost-budget@example.com", "Dashboard Cost Budget");

        long orders = productionOrders.count();
        Run small = measure(token);

        String mark = "DSQ" + System.nanoTime();
        for (int i = 0; i < 20; i++) {
            saveCustomer(mark + "-C-" + i);
            saveFollowUp(mark + "-FU-" + i);
            saveLead(mark + "-L-" + i);
        }
        for (int i = 0; i < 5; i++) {
            savePackingList();
            saveDispatch();
        }

        Run large = measure(token);

        long lowerBound = FIXED_STATEMENTS + STATEMENTS_PER_PRODUCTION_ORDER * orders;
        long upperBound = lowerBound + itemsBatches(orders);
        System.out.printf("[dashboard-budget] orders=%d budget=[%d,%d] measuredSmall=%d measuredLarge=%d%n",
                orders, lowerBound, upperBound, small.statements(), large.statements());

        assertThat(small.statements())
                .as("one request must land inside the measured budget window [%d,%d] for %d orders",
                        lowerBound, upperBound, orders)
                .isBetween(lowerBound, upperBound);

        // 20 customers + 20 follow-ups + 20 leads + 5 packing lists + 5 dispatches
        // are counted by SQL, so none of them may add a statement or an entity load.
        assertThat(large.statements())
                .as("counted rows must not add statements")
                .isEqualTo(small.statements());
        assertThat(large.entityLoads())
                .as("counting rows must not load entities")
                .isEqualTo(small.entityLoads());

        // The extra rows still reach the payload — the cheaper read must not have
        // been bought by dropping keys or freezing values.
        assertThat(delta(large.body, small.body, "clientsTotal")).isEqualTo(20L);
        assertThat(delta(large.body, small.body, "followupTotal")).isEqualTo(20L);
        assertThat(delta(large.body, small.body, "activeLeads")).isEqualTo(20L);
        assertThat(delta(large.body, small.body, "packingTotal")).isEqualTo(5L);
        assertThat(delta(large.body, small.body, "dispatchTotal")).isEqualTo(5L);
    }

    /**
     * The only row count that moves the statement count is the production-order
     * iteration behind the technical-verification statistic. Seeding enough orders
     * to cross an items-batch boundary (60 of them, against a batch size of 50)
     * makes the assertion discriminating: it expects one {@code findByWorkOrderId}
     * lookup per order <em>plus</em> the extra items-batch statement, so a model
     * that missed either term — or a new per-row read — cannot pass.
     */
    @Test
    void onlyTheVerificationIterationScalesWithProductionOrders() throws Exception {
        String token = register("dashboard-cost-scaling@example.com", "Dashboard Cost Scaling");

        long ordersBefore = productionOrders.count();
        Run before = measure(token);

        for (int i = 0; i < 60; i++) {
            saveOrder();
        }

        Run after = measure(token);

        long ordersAfter = productionOrders.count();
        long added = ordersAfter - ordersBefore;
        long expected = STATEMENTS_PER_PRODUCTION_ORDER * added
                + (itemsBatches(ordersAfter) - itemsBatches(ordersBefore));
        System.out.printf("[dashboard-budget] ordersBefore=%d ordersAfter=%d statementsBefore=%d "
                        + "statementsAfter=%d expectedDelta=%d%n",
                ordersBefore, ordersAfter, before.statements(), after.statements(), expected);

        assertThat(added).isEqualTo(60L);
        assertThat(after.statements() - before.statements())
                .as("one verification lookup per new order plus the items-batch step")
                .isEqualTo(expected);

        long lowerBound = FIXED_STATEMENTS + STATEMENTS_PER_PRODUCTION_ORDER * ordersAfter;
        assertThat(after.statements())
                .as("the measured budget still covers the endpoint after %d orders", ordersAfter)
                .isBetween(lowerBound, lowerBound + itemsBatches(ordersAfter));

        assertThat(after.body.path("productionTvTotal").asLong())
                .as("the verification statistic counts production orders")
                .isEqualTo(before.body.path("productionTvTotal").asLong() + added);
    }

    /** The budget test measures the real, complete payload — all 145 keys. */
    @Test
    void theMeasuredRequestReturnsTheCompleteFrozenPayload() throws Exception {
        String token = register("dashboard-cost-keys@example.com", "Dashboard Cost Keys");

        Run run = measure(token);

        assertThat(run.body.size())
                .as("the budget is for the whole /dashboard/stats contract, not a subset")
                .isEqualTo(145);
    }

    // ==================== Harness ====================

    /** Dashboard payload plus the statements/entity loads it took to produce it. */
    private record Run(JsonNode body, long statements, long entityLoads) {}

    private Run measure(String token) throws Exception {
        Statistics stats = statistics();
        long statements = stats.getPrepareStatementCount();
        long loads = stats.getEntityLoadCount();
        JsonNode body = dashboard(token);
        return new Run(body, stats.getPrepareStatementCount() - statements,
                stats.getEntityLoadCount() - loads);
    }

    private Statistics statistics() {
        return entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
    }

    /** Statements the lazy items collection needs for {@code orders} rows, batched at 50. */
    private static long itemsBatches(long orders) {
        return (orders + ITEMS_BATCH_SIZE - 1) / ITEMS_BATCH_SIZE;
    }

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

    private void saveCustomer(String businessName) {
        Customer customer = new Customer();
        customer.setBusinessName(businessName);
        customer.setStatus("Active");
        customerRepository.save(customer);
    }

    private void saveFollowUp(String company) {
        FollowUp followUp = new FollowUp();
        followUp.setCompanyName(company);
        followUp.setStatus("Open");
        followUp.setFollowupDate(LocalDate.now());
        followUp.setNextFollowupDate(LocalDate.now().plusDays(5));
        followUpRepository.save(followUp);
    }

    private void saveLead(String name) {
        Lead lead = new Lead();
        lead.setName(name);
        lead.setStatus(LeadStatus.ACTIVE);
        lead.setStage(LeadStage.NEW);
        leadRepository.save(lead);
    }

    private ProductionOrder saveOrder() {
        ProductionOrder order = ProductionOrder.builder()
                .workOrder(unique("WO"))
                .product("Dashboard cost product")
                .department("Dashboard Cost")
                .status(OrderStatus.DRAFT)
                .priority(Priority.MEDIUM)
                .dueDate(LocalDate.now().plusDays(5))
                .startDate(LocalDate.now().minusDays(2))
                .quantity(10)
                .progress(0)
                .build();
        return productionOrders.save(order);
    }

    private void savePackingList() {
        packingLists.save(PackingList.builder()
                .packingListNumber(unique("PL"))
                .workOrderId("WO-DASHBOARD-COST")
                .product("Dashboard cost product")
                .customer("Dashboard Cost Customer")
                .productionQuantity(10)
                .status(PackingStatus.PENDING)
                .build());
    }

    private void saveDispatch() {
        dispatches.save(Dispatch.builder()
                .dispatchNumber(unique("DSP"))
                .workOrderId("WO-DASHBOARD-COST")
                .product("Dashboard cost product")
                .customer("Dashboard Cost Customer")
                .quantity(5)
                .status(DispatchStatus.READY)
                .build());
    }
}
