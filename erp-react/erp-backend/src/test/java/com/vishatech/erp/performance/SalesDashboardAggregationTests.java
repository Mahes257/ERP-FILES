package com.vishatech.erp.performance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.crm.entity.FollowUp;
import com.vishatech.erp.entity.Invoice;
import com.vishatech.erp.entity.PaymentReceipt;
import com.vishatech.erp.entity.Quotation;
import com.vishatech.erp.entity.SalesOrder;
import com.vishatech.erp.crm.repository.FollowUpRepository;
import com.vishatech.erp.repository.InvoiceRepository;
import com.vishatech.erp.repository.PaymentReceiptRepository;
import com.vishatech.erp.repository.QuotationRepository;
import com.vishatech.erp.repository.SalesOrderRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import jakarta.annotation.PostConstruct;
import jakarta.persistence.EntityManagerFactory;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.Statement;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;
import javax.sql.DataSource;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Verifies the two properties the Sales Dashboard aggregation must keep:
 *
 * <ol>
 *   <li><b>The KPI values are unchanged.</b> A deterministic set of records is
 *       seeded — including rows that the dashboard has always excluded (an older
 *       revision, a draft/cancelled status) and a status written with different
 *       casing/spacing — and the dashboard's counters must move by exactly the
 *       expected amounts. The assertions are deltas, so they are independent of
 *       whatever else other tests left in the database.</li>
 *   <li><b>Reading the dashboard does not scale with the data.</b> Statements and
 *       entity loads are measured with Hibernate statistics: adding CPOs must not
 *       add statements, and must not load one entity per new record.</li>
 * </ol>
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class SalesDashboardAggregationTests extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private QuotationRepository quotationRepository;

    @Autowired
    private SalesOrderRepository salesOrderRepository;

    @Autowired
    private InvoiceRepository invoiceRepository;

    @Autowired
    private PaymentReceiptRepository paymentReceiptRepository;

    @Autowired
    private FollowUpRepository followUpRepository;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    /**
     * {@code QualityInspection} declares MySQL JSON columns, which the H2 test
     * schema cannot create. The dashboard only counts that table, so the table
     * just has to exist — recreated here after Hibernate's create-drop phase,
     * exactly as {@code SalesDashboardApiTest} does.
     */
    @PostConstruct
    void ensureQualityInspectionsTable() throws Exception {
        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {
            statement.execute("CREATE TABLE IF NOT EXISTS quality_inspections (id VARCHAR(20) PRIMARY KEY)");
        }
    }

    @org.junit.jupiter.api.BeforeEach
    void enableStatistics() {
        statistics().setStatisticsEnabled(true);
    }

    // ==================== KPI values ====================

    @Test
    void dashboardFiguresComeFromTheActiveRowsOnly() throws Exception {
        String token = register("sales-dashboard-kpi@example.com", "Sales Dashboard KPI");
        String mark = "KPI" + System.nanoTime();
        LocalDateTime now = LocalDateTime.now();
        LocalDate today = LocalDate.now();

        JsonNode before = dashboard(token);

        // ---- Quotations: one current active row, one current row with a
        //      differently cased/padded status, plus two rows the dashboard
        //      must ignore (an older revision and a draft).
        saveQuotation(mark + "-Q-A", "approved", new BigDecimal("1000.50"), true, now);
        saveQuotation(mark + "-Q-B", "  APProved  ", new BigDecimal("500.25"), true, now);
        saveQuotation(mark + "-Q-OLD", "approved", new BigDecimal("9999.00"), false, now);
        saveQuotation(mark + "-Q-DRAFT", "draft", new BigDecimal("7777.00"), true, now);

        // ---- CPO: a large current active order (so it also tops the customer
        //      ranking), a cancelled one, and one with no client name.
        saveOrder(mark + "-SO-BIG", "approved", new BigDecimal("9999999.00"), "Delta Ranking Client", true, now);
        saveOrder(mark + "-SO-CANCELLED", "cancelled", new BigDecimal("5000.00"), "Delta Other Client", true, now);
        saveOrder(mark + "-SO-BLANK", "approved", new BigDecimal("9999998.00"), null, true, now);

        // ---- Invoice / receipt: one current active row each, one draft/cancelled.
        saveInvoice(mark + "-INV", "issued", new BigDecimal("3000.00"), "Delta Ranking Client", true, now);
        saveInvoice(mark + "-INV-DRAFT", "draft", new BigDecimal("8000.00"), "Delta Other Client", true, now);
        saveReceipt(mark + "-RCPT", "received", new BigDecimal("1200.00"), "Delta Ranking Client", true, now);
        saveReceipt(mark + "-RCPT-CANCELLED", "cancelled", new BigDecimal("900.00"), "Delta Other Client", true, now);
        saveReceipt(mark + "-RCPT-OLD", "received", new BigDecimal("4000.00"), "Delta Other Client", false, now);

        // ---- Follow-up workload: one overdue, one mid-case "open" due this
        //      week, one further out, and one closed row that must not count.
        saveFollowUp(mark + "-FU-1", "Open", today, today.minusDays(1));
        saveFollowUp(mark + "-FU-2", "open", today.minusDays(5), today.plusDays(3));
        saveFollowUp(mark + "-FU-3", "Open", today.plusDays(2), today.plusDays(10));
        saveFollowUp(mark + "-FU-4", "Completed", today, today.plusDays(1));

        JsonNode after = dashboard(token);

        assertThat(delta(after, before, "/values/quotationValue")).isEqualByComparingTo("1500.75");
        assertThat(delta(after, before, "/values/cpoValue")).isEqualByComparingTo("19999997.00");
        assertThat(delta(after, before, "/values/invoiced")).isEqualByComparingTo("3000.00");
        assertThat(delta(after, before, "/values/collected")).isEqualByComparingTo("1200.00");
        assertThat(delta(after, before, "/values/outstanding")).isEqualByComparingTo("1800.00");

        assertThat(delta(after, before, "/counts/followUps/total")).isEqualByComparingTo("3");
        assertThat(delta(after, before, "/counts/followUps/open")).isEqualByComparingTo("3");
        assertThat(delta(after, before, "/counts/followUps/overdue")).isEqualByComparingTo("1");
        assertThat(delta(after, before, "/counts/followUps/today")).isEqualByComparingTo("1");
        assertThat(delta(after, before, "/counts/followUps/dueThisWeek")).isEqualByComparingTo("1");
        assertThat(delta(after, before, "/alerts/overdueFollowups")).isEqualByComparingTo("1");
        assertThat(delta(after, before, "/alerts/todayFollowups")).isEqualByComparingTo("1");

        // The monthly trend buckets the same records into the current month
        // (per-row rupee amounts, exactly as the chart has always summed them).
        assertThat(delta(after, before, "/trend/cpo/5")).isEqualByComparingTo("19999997");
        assertThat(delta(after, before, "/trend/quotation/5")).isEqualByComparingTo("1500");
        assertThat(delta(after, before, "/trend/invoice/5")).isEqualByComparingTo("3000");
        assertThat(delta(after, before, "/trend/collection/5")).isEqualByComparingTo("1200");

        // The pipeline reports the very same money as the KPI values.
        assertThat(pipelineValue(after, "quotation"))
                .isEqualByComparingTo(after.at("/values/quotationValue").decimalValue());
        assertThat(pipelineValue(after, "invoice"))
                .isEqualByComparingTo(after.at("/values/invoiced").decimalValue());
        assertThat(pipelineValue(after, "payment"))
                .isEqualByComparingTo(after.at("/values/collected").decimalValue());

        // ---- Top customers: the largest current order wins and is reported
        //      with its invoice/payment/outstanding figures; a blank client name
        //      is still grouped under the existing placeholder.
        JsonNode top = after.path("topCustomers");
        assertThat(top.isArray()).isTrue();
        JsonNode leader = top.get(0);
        assertThat(leader.path("name").asText()).isEqualTo("Delta Ranking Client");
        assertThat(leader.path("orderValue").decimalValue()).isGreaterThanOrEqualTo(new BigDecimal("9999999.00"));
        assertThat(leader.path("invoiceValue").decimalValue()).isEqualByComparingTo("3000.00");
        assertThat(leader.path("payment").decimalValue()).isEqualByComparingTo("1200.00");
        assertThat(leader.path("outstanding").decimalValue()).isEqualByComparingTo("1800.00");
        assertThat(hasBlankClientRow(top)).isTrue();
    }

    // ==================== Query cost ====================

    @Test
    void dashboardReadCostDoesNotGrowWithTheNumberOfRecords() throws Exception {
        String token = register("sales-dashboard-cost@example.com", "Sales Dashboard Cost");
        String mark = "COST" + System.nanoTime();

        seedOrders(mark, 0, 2);
        Run small = measure(token);
        seedOrders(mark, 2, 20);
        Run large = measure(token);

        // Same number of statements no matter how many CPOs exist: the dashboard
        // aggregates in SQL instead of scanning tables.
        assertThat(large.statements())
                .as("statement count must not grow with the number of CPOs")
                .isEqualTo(small.statements());

        // And it must not load one entity per new record.
        assertThat(large.entityLoads() - small.entityLoads())
                .as("adding 20 CPOs must not add 20 entity loads")
                .isLessThan(20);

        // The value it reports still tracks the data: the 20 CPOs added between
        // the two reads are worth 20 x 590.00.
        assertThat(delta(large.body, small.body, "/values/cpoValue"))
                .isEqualByComparingTo("11800.00");
    }

    // ==================== Harness ====================

    /** Dashboard payload plus the statements/entity loads it took to produce it. */
    private record Run(JsonNode body, long statements, long entityLoads) {}

    private Run measure(String token) throws Exception {
        Statistics stats = statistics();
        long statements = stats.getPrepareStatementCount();
        long loads = stats.getEntityLoadCount();
        JsonNode body = dashboard(token);
        Run run = new Run(body, stats.getPrepareStatementCount() - statements,
                stats.getEntityLoadCount() - loads);
        System.out.printf("[dashboard-cost] statements=%d entityLoads=%d%n",
                run.statements(), run.entityLoads());
        return run;
    }

    private Statistics statistics() {
        return entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
    }

    private JsonNode dashboard(String token) throws Exception {
        MvcResult result = mockMvc.perform(get("/sales/dashboard")
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

    private static BigDecimal delta(JsonNode after, JsonNode before, String pointer) {
        return after.at(pointer).decimalValue().subtract(before.at(pointer).decimalValue());
    }

    private static BigDecimal pipelineValue(JsonNode body, String stageKey) {
        for (JsonNode stage : body.path("pipeline")) {
            if (stageKey.equals(stage.path("key").asText())) {
                return stage.path("value").decimalValue();
            }
        }
        throw new AssertionError("pipeline stage not found: " + stageKey);
    }

    private static boolean hasBlankClientRow(JsonNode topCustomers) {
        for (JsonNode row : topCustomers) {
            if ("—".equals(row.path("name").asText())) {
                return true;
            }
        }
        return false;
    }

    // ==================== Seeding ====================

    private void saveQuotation(String no, String status, BigDecimal total, boolean current, LocalDateTime date) {
        Quotation quotation = new Quotation();
        quotation.setQuotationNo(no);
        quotation.setClientName("Delta Ranking Client");
        quotation.setStatus(status);
        quotation.setGrandTotal(total);
        quotation.setQuotationDate(date);
        quotation.setLatestRevision(current);
        quotationRepository.save(quotation);
    }

    private void saveOrder(String no, String status, BigDecimal total, String client,
                           boolean current, LocalDateTime date) {
        SalesOrder order = new SalesOrder();
        order.setSoNo(no);
        order.setClientName(client);
        order.setStatus(status);
        order.setGrandTotal(total);
        order.setOrderDate(date);
        order.setLatestRevision(current);
        salesOrderRepository.save(order);
    }

    private void saveInvoice(String no, String status, BigDecimal total, String client,
                             boolean current, LocalDateTime date) {
        Invoice invoice = new Invoice();
        invoice.setInvoiceNo(no);
        invoice.setClientName(client);
        invoice.setStatus(status);
        invoice.setGrandTotal(total);
        invoice.setInvoiceDate(date);
        invoice.setLatestRevision(current);
        invoiceRepository.save(invoice);
    }

    private void saveReceipt(String no, String status, BigDecimal amount, String client,
                             boolean current, LocalDateTime date) {
        PaymentReceipt receipt = new PaymentReceipt();
        receipt.setReceiptNo(no);
        receipt.setClientName(client);
        receipt.setStatus(status);
        receipt.setAmount(amount);
        receipt.setPaymentDate(date);
        receipt.setLatestRevision(current);
        paymentReceiptRepository.save(receipt);
    }

    private void saveFollowUp(String title, String status, LocalDate followupDate, LocalDate nextDate) {
        FollowUp followUp = new FollowUp();
        followUp.setCompanyName(title);
        followUp.setStatus(status);
        followUp.setFollowupDate(followupDate);
        followUp.setNextFollowupDate(nextDate);
        followUpRepository.save(followUp);
    }

    /** Active, current CPOs worth 590.00 each — the value the cost test expects. */
    private void seedOrders(String mark, int from, int count) {
        for (int i = from; i < from + count; i++) {
            saveOrder(mark + "-SO-" + i, "approved", new BigDecimal("590.00"),
                    "Delta Ranking Client", true, LocalDateTime.now());
        }
    }
}
