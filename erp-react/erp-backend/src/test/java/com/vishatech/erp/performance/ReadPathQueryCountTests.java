package com.vishatech.erp.performance;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.vishatech.erp.dto.production.PagedResponse;
import com.vishatech.erp.dto.production.ProductionOrderDTO;
import com.vishatech.erp.entity.PurchaseInvoice;
import com.vishatech.erp.entity.PurchaseOrder;
import com.vishatech.erp.entity.PurchaseOrderItem;
import com.vishatech.erp.entity.PurchaseRfq;
import com.vishatech.erp.entity.PurchaseRfqItem;
import com.vishatech.erp.entity.SalesOrder;
import com.vishatech.erp.entity.SalesOrderItem;
import com.vishatech.erp.entity.production.OrderStatus;
import com.vishatech.erp.entity.production.Priority;
import com.vishatech.erp.entity.production.ProductionOrder;
import com.vishatech.erp.entity.production.ProductionOrderItem;
import com.vishatech.erp.entity.production.ProductionType;
import com.vishatech.erp.repository.PurchaseInvoiceRepository;
import com.vishatech.erp.repository.PurchaseOrderRepository;
import com.vishatech.erp.repository.PurchaseRfqRepository;
import com.vishatech.erp.repository.SalesOrderRepository;
import com.vishatech.erp.repository.production.ProductionOrderRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.service.PurchaseInvoiceService;
import com.vishatech.erp.service.PurchaseOrderService;
import com.vishatech.erp.service.PurchaseRfqService;
import com.vishatech.erp.service.SalesOrderService;
import com.vishatech.erp.service.production.ProductionOrderService;
import com.vishatech.erp.crm.entity.Customer;
import jakarta.persistence.EntityManagerFactory;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

/**
 * Measures the actual JDBC statement count of the high-traffic Production,
 * Purchase and Sales read paths against a REAL database (H2 in MySQL mode, real
 * JPA entities, repositories and services — no mocks), with Hibernate statistics
 * enabled.
 *
 * <p>Each test seeds a deterministic graph (12 parents x 3 children per mark) and
 * then asserts two things:
 *
 * <ol>
 *   <li><b>Query cost is bounded, not proportional to the row count.</b> The
 *       statement budget is the theoretical minimum — the count query, the page
 *       query and ONE batched child fetch — plus small slack. An N+1 regression
 *       (one child query per parent) blows past it immediately.</li>
 *   <li><b>The payload is unchanged.</b> The list/page mapping is compared
 *       field-by-field (JSON deep equality) against the same mapper applied to a
 *       single freshly-loaded record, so an optimisation can never silently drop
 *       or alter a field.</li>
 * </ol>
 */
@SpringBootTest
class ReadPathQueryCountTests extends AbstractSecurityTest {

    /** Parents seeded per mark (comfortably more than one page). */
    private static final int PARENTS = 12;
    private static final int CHILDREN_PER_PARENT = 3;
    private static final int PAGE_SIZE = 5;

    /**
     * Statements a single page read may issue: count + page + one batched child
     * load, plus slack. A per-row child query (N+1) or a per-row count query
     * exceeds this by an order of magnitude.
     */
    private static final long PAGE_STATEMENT_BUDGET = 5;

    /** Statements a whole-list read may issue: the list select + one batched child load. */
    private static final long LIST_STATEMENT_BUDGET = 4;

    /**
     * Statements a Sales Order page may issue: count, page, batched items, the
     * batched E-Action rows and the three batched child tables (attachments,
     * timeline, history). Five of those were previously PER ROW — they are
     * batched, so the budget is a constant, not a function of the row count.
     */
    private static final long SALES_ORDER_PAGE_STATEMENT_BUDGET = 7;

    /** Registered modules so the harness can serialise the entities' date/time values. */
    private static final ObjectMapper MAPPER = new ObjectMapper().findAndRegisterModules();

    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private PurchaseOrderService purchaseOrderService;
    @Autowired private PurchaseRfqService purchaseRfqService;
    @Autowired private SalesOrderService salesOrderService;
    @Autowired private PurchaseInvoiceService purchaseInvoiceService;

    @Autowired private ProductionOrderRepository productionOrderRepository;
    @Autowired private PurchaseOrderRepository purchaseOrderRepository;
    @Autowired private PurchaseRfqRepository purchaseRfqRepository;
    @Autowired private SalesOrderRepository salesOrderRepository;
    @Autowired private PurchaseInvoiceRepository purchaseInvoiceRepository;

    @Autowired private EntityManagerFactory entityManagerFactory;

    /** Enable Hibernate statistics before each test. */
    @org.junit.jupiter.api.BeforeEach
    void enableStatistics() {
        statistics().setStatisticsEnabled(true);
    }

    // ==================== Production Orders ====================

    @Test
    void productionOrderPageIsBoundedAndPaginatedInTheDatabase() {
        String mark = mark("PROD");
        seedProductionOrders(mark);

        Run<PagedResponse<ProductionOrderDTO>> run = measure("productionOrders page", () -> productionOrderService.getOrders(
                mark, null, null, null, null, null, null, null, null, null,
                0, PAGE_SIZE, null, "desc"));

        PagedResponse<ProductionOrderDTO> page = run.value();
        assertThat(page.getContent()).hasSize(PAGE_SIZE);
        assertThat(page.getTotalElements()).isEqualTo(PARENTS);

        // Pagination must be applied by the database: the whole table (12 orders and
        // their 36 items) must never be loaded to serve one page of 5.
        assertThat(run.statements())
                .as("statements for one page of %d orders (was one select per order plus the whole table)", PAGE_SIZE)
                .isLessThanOrEqualTo(PAGE_STATEMENT_BUDGET);
        assertThat(run.entityLoads())
                .as("entities loaded for one page (N+1 or in-memory pagination loads every row)")
                .isLessThanOrEqualTo(PAGE_SIZE + PAGE_SIZE * CHILDREN_PER_PARENT + 5);
        assertThat(run.entityLoads())
                .as("must not load the entire table to serve one page")
                .isLessThan(PARENTS + PARENTS * CHILDREN_PER_PARENT);
    }

    @Test
    void productionOrderPagePayloadMatchesSingleOrderReads() {
        String mark = mark("PRODJSON");
        seedProductionOrders(mark);

        PagedResponse<ProductionOrderDTO> page = productionOrderService.getOrders(
                mark, null, null, null, null, null, null, null, null, null,
                0, PARENTS, null, "desc");

        for (ProductionOrderDTO row : page.getContent()) {
            ProductionOrderDTO single = productionOrderService.getOrder(row.getBackendId());
            // ProductionOrder.items carries no @OrderBy, so the item array is compared
            // order-insensitively (the single-record read uses its own select).
            assertSameJson(single, row, false);
            assertThat(row.getItems()).hasSize(CHILDREN_PER_PARENT);
        }
    }

    // ==================== Purchase Orders ====================

    @Test
    void purchaseOrderListDoesNotQueryEachOrdersItems() {
        String mark = mark("PO");
        seedPurchaseOrders(mark);

        Run<List<Map<String, Object>>> run = measure("purchaseOrders list", () -> purchaseOrderService.list());

        List<Map<String, Object>> rows = mine(run.value(), mark);
        assertThat(rows).hasSize(PARENTS);
        assertThat(rows).allSatisfy(row -> assertThat((List<?>) row.get("items")).hasSize(CHILDREN_PER_PARENT));

        assertThat(run.statements())
                .as("statements for the whole PO list (one items select per order is an N+1)")
                .isLessThanOrEqualTo(LIST_STATEMENT_BUDGET);
    }

    @Test
    void purchaseOrderPayloadMatchesSingleOrderReads() {
        String mark = mark("POJSON");
        seedPurchaseOrders(mark);

        List<Map<String, Object>> rows = mine(purchaseOrderService.list(), mark);
        assertThat(rows).isNotEmpty();

        for (Map<String, Object> row : rows) {
            Map<String, Object> single = purchaseOrderService.getResponse(number(row));
            // items use @OrderColumn, so their order is part of the payload.
            assertSameJson(single, row, true);
        }
    }

    // ==================== Purchase RFQs (the list behind RFQ + Quotation screens) ====================

    @Test
    void purchaseRfqListDoesNotQueryItemsOrQuotationCountsPerRow() {
        String mark = mark("RFQ");
        seedPurchaseRfqs(mark);

        Run<List<Map<String, Object>>> run = measure("purchaseRfqs list", () -> purchaseRfqService.list());

        List<Map<String, Object>> rows = mine(run.value(), mark);
        assertThat(rows).hasSize(PARENTS);
        assertThat(rows).allSatisfy(row -> {
            assertThat((List<?>) row.get("items")).hasSize(CHILDREN_PER_PARENT);
            assertThat(row.get("quotationReceived")).isEqualTo(0);
        });

        assertThat(run.statements())
                .as("statements for the whole RFQ list: one items select AND one quotation count per RFQ is an N+1")
                .isLessThanOrEqualTo(LIST_STATEMENT_BUDGET);
    }

    @Test
    void purchaseRfqPayloadMatchesSingleRfqReads() {
        String mark = mark("RFQJSON");
        seedPurchaseRfqs(mark);

        List<Map<String, Object>> rows = mine(purchaseRfqService.list(), mark);
        assertThat(rows).isNotEmpty();

        for (Map<String, Object> row : rows) {
            Map<String, Object> single = purchaseRfqService.getResponse(((Number) row.get("id")).longValue());
            assertSameJson(single, row, true);
        }
    }

    // ==================== Sales Orders (the CPO feed behind Production) ====================

    @Test
    void salesOrderPageDoesNotQueryItemsPerOrder() {
        String mark = mark("SO");
        seedSalesOrders(mark);

        Run<?> onePage = measure("salesOrders page size=" + PAGE_SIZE, () -> salesOrderService.list(
                0, PAGE_SIZE, mark, null, null, null, null, null, null, null, null));
        Run<?> allRows = measure("salesOrders page size=" + PARENTS, () -> salesOrderService.list(
                0, PARENTS, mark, null, null, null, null, null, null, null, null));

        assertThat(onePage.statements())
                .as("statements for one page of %d sales orders (one items select per order is an N+1)", PAGE_SIZE)
                .isLessThanOrEqualTo(SALES_ORDER_PAGE_STATEMENT_BUDGET);
        // Same cost for a bigger page: the query count must not scale with the rows.
        assertThat(allRows.statements())
                .as("statements for a page of %d sales orders — cost must not grow with the row count", PARENTS)
                .isEqualTo(onePage.statements());
        assertThat(onePage.entityLoads())
                .as("must not load every sales order to serve one page")
                .isLessThan(PARENTS + PARENTS * CHILDREN_PER_PARENT);
    }

    @Test
    void salesOrderPagePayloadMatchesSingleOrderReads() {
        String mark = mark("SOJSON");
        seedSalesOrders(mark);

        var page = salesOrderService.list(0, PARENTS, mark, null, null, null, null, null, null, null, null);
        assertThat(page.getContent()).hasSize(PARENTS);

        for (var row : page.getContent()) {
            var single = salesOrderService.get(row.id());
            // The list mapper deliberately omits the revision chain that the detail
            // mapper adds; everything else must be identical.
            assertSameJson(single, row, true, "revisions");
            assertThat(row.items()).hasSize(CHILDREN_PER_PARENT);
        }
    }

    // ==================== Purchase Invoices (verified already N+1-free) ====================

    @Test
    void salesOrderOptionFeedIsBatched() {
        String mark = mark("SOOPT");
        seedSalesOrders(mark);

        Run<List<com.vishatech.erp.dto.SalesOrderOptionResponse>> run =
                measure("salesOrders options feed", () -> salesOrderService.listOptions(mark));

        assertThat(run.value()).hasSize(PARENTS);
        assertThat(run.statements())
                .as("the CPO feed Production reads: count + page + one grouped item-count query")
                .isLessThanOrEqualTo(3);
        // The slim row must agree with the full record for the same order.
        for (var option : run.value()) {
            var full = salesOrderService.get(option.id());
            assertThat(option.soNo()).isEqualTo(full.soNo());
            assertThat(option.clientName()).isEqualTo(full.clientName());
            assertThat(option.itemCount()).isEqualTo(full.itemsCount());
        }
    }

    @Test
    void salesOrderExportIsBatched() {
        String mark = mark("SOEXP");
        seedSalesOrders(mark);

        Run<List<com.vishatech.erp.dto.SalesOrderResponse>> run =
                measure("salesOrders export", () -> salesOrderService.export(mark, null, null, null, null, null, null, null));

        assertThat(run.value()).hasSize(PARENTS);
        assertThat(run.value()).allSatisfy(row -> assertThat(row.items()).hasSize(CHILDREN_PER_PARENT));
        assertThat(run.statements())
                .as("export of every matching order: items + E-Actions + attachments + timeline + history must be batched")
                .isLessThanOrEqualTo(7);
    }

    @Test
    void purchaseInvoicePageIsQueryBounded() {
        String mark = mark("VINV");
        seedPurchaseInvoices(mark);

        Run<?> run = measure("purchaseInvoices page", () -> purchaseInvoiceService.list(0, PAGE_SIZE, mark, null, null));

        assertThat(run.statements())
                .as("invoice rows are mapped from JSON columns, so a page costs a count query plus one select")
                .isLessThanOrEqualTo(3);
    }

    @Test
    void purchaseInvoicePayloadMatchesSingleInvoiceReads() {
        String mark = mark("VINVJSON");
        seedPurchaseInvoices(mark);

        var page = purchaseInvoiceService.list(0, PARENTS, mark, null, null);
        assertThat(page.getContent()).isNotEmpty();

        for (Map<String, Object> row : page.getContent()) {
            assertSameJson(purchaseInvoiceService.get(((Number) row.get("id")).longValue()), row, true);
        }
    }

    // ==================== harness ====================

    private record Run<T>(T value, long statements, long queries, long entityLoads) {}

    private Statistics statistics() {
        return entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
    }

    /**
     * Runs one read path and reports what it cost: {@code statements} is the number
     * of JDBC statements prepared, {@code entityLoads} the number of entities
     * materialised.
     */
    private <T> Run<T> measure(String label, Supplier<T> call) {
        Statistics stats = statistics();
        long statements = stats.getPrepareStatementCount();
        long queries = stats.getQueryExecutionCount();
        long loads = stats.getEntityLoadCount();
        T value = call.get();
        Run<T> run = new Run<>(value,
                stats.getPrepareStatementCount() - statements,
                stats.getQueryExecutionCount() - queries,
                stats.getEntityLoadCount() - loads);
        System.out.printf("[query-count] %-34s statements=%d queries=%d entityLoads=%d%n",
                label, run.statements(), run.queries(), run.entityLoads());
        return run;
    }

    /**
     * Every run gets its own marker so a test only ever asserts on its own rows.
     * Kept short on purpose: {@code production_orders.work_order} is 20 characters.
     */
    private String mark(String area) {
        return "QT" + area.charAt(0) + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
    }

    /** Keeps only the rows this test seeded (keys differ per module, so match on values). */
    private List<Map<String, Object>> mine(List<Map<String, Object>> rows, String mark) {
        List<Map<String, Object>> kept = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            if (row.values().stream().anyMatch(v -> v instanceof String s && s.contains(mark))) {
                kept.add(row);
            }
        }
        return kept;
    }

    private Long number(Map<String, Object> row) {
        return ((Number) row.get("id")).longValue();
    }

    private void seedProductionOrders(String mark) {
        for (int i = 0; i < PARENTS; i++) {
            ProductionOrder order = ProductionOrder.builder()
                    .workOrder(mark + "-WO-" + i)
                    .salesOrderNumber(mark + "-SO")
                    .customer(mark + " Customer")
                    .customerCode("QCT")
                    .priority(Priority.MEDIUM)
                    .status(OrderStatus.DRAFT)
                    .productionType(ProductionType.CASTING)
                    .progress(i)
                    .build();
            for (int j = 0; j < CHILDREN_PER_PARENT; j++) {
                order.addItem(ProductionOrderItem.builder()
                        .productName(mark + " Item " + i + "-" + j)
                        .productCode("P-" + j)
                        .quantity(5)
                        .producedQuantity(0)
                        .rejectedQuantity(0)
                        .productionType(ProductionType.CASTING)
                        .status(OrderStatus.PENDING)
                        .unit("Nos")
                        .build());
            }
            productionOrderRepository.save(order);
        }
    }

    private void seedPurchaseOrders(String mark) {
        for (int i = 0; i < PARENTS; i++) {
            PurchaseOrder order = new PurchaseOrder();
            order.setPoNo(mark + "-PO-" + i);
            order.setTitle(mark + " Order " + i);
            order.setVendor(mark + " Vendor");
            order.setStatus("Draft");
            order.setApprovalStatus("Pending");
            order.setAmount(new BigDecimal("1000.00"));
            for (int j = 0; j < CHILDREN_PER_PARENT; j++) {
                PurchaseOrderItem item = new PurchaseOrderItem();
                item.setItemCode("ITEM-" + j);
                item.setProduct(mark + " Product " + i + "-" + j);
                item.setUom("Nos");
                item.setQty(new BigDecimal("5.000"));
                item.setRate(new BigDecimal("100.00"));
                item.setReceivedQty(BigDecimal.ZERO);
                item.setCancelledQty(BigDecimal.ZERO);
                item.setOrder(order);
                order.getItems().add(item);
            }
            purchaseOrderRepository.save(order);
        }
    }

    private void seedPurchaseRfqs(String mark) {
        for (int i = 0; i < PARENTS; i++) {
            PurchaseRfq rfq = new PurchaseRfq();
            rfq.setRfqNo(mark + "-RFQ-" + i);
            rfq.setTitle(mark + " RFQ " + i);
            rfq.setStatus("Draft");
            rfq.setApprovalStatus("Pending");
            for (int j = 0; j < CHILDREN_PER_PARENT; j++) {
                PurchaseRfqItem item = new PurchaseRfqItem();
                item.setItemCode("ITEM-" + j);
                item.setProduct(mark + " Product " + i + "-" + j);
                item.setUom("Nos");
                item.setQty(new BigDecimal("5.000"));
                item.setRfq(rfq);
                rfq.getItems().add(item);
            }
            purchaseRfqRepository.save(rfq);
        }
    }

    private void seedSalesOrders(String mark) {
        for (int i = 0; i < PARENTS; i++) {
            SalesOrder order = new SalesOrder();
            order.setSoNo(mark + "-SO-" + i);
            order.setClientName(mark + " Client");
            order.setStatus("draft");
            order.setSubTotal(new BigDecimal("500.00"));
            order.setGrandTotal(new BigDecimal("590.00"));
            for (int j = 0; j < CHILDREN_PER_PARENT; j++) {
                SalesOrderItem item = new SalesOrderItem();
                item.setDescription(mark + " Line " + i + "-" + j);
                item.setSku("SKU-" + j);
                item.setUom("Nos");
                item.setQty(new BigDecimal("2"));
                item.setRate(new BigDecimal("250.00"));
                order.addItem(item);
            }
            salesOrderRepository.save(order);
        }
    }

    private void seedPurchaseInvoices(String mark) {
        for (int i = 0; i < PARENTS; i++) {
            PurchaseInvoice invoice = new PurchaseInvoice();
            invoice.setInvoiceNo(mark + "-VINV-" + i);
            invoice.setVendorInvoiceNo("SUP-" + mark + "-" + i);
            invoice.setVendor(mark + " Vendor");
            invoice.setPoNo(mark + "-PO");
            invoice.setStatus("Draft");
            invoice.setAmount(new BigDecimal("1000.00"));
            invoice.setTotal(new BigDecimal("1180.00"));
            invoice.setItemsJson("[{\"product\":\"" + mark + " item\",\"qty\":5}]");
            purchaseInvoiceRepository.save(invoice);
        }
    }

    // ==================== JSON comparison ====================

    private void assertSameJson(Object expected, Object actual, boolean orderSensitive, String... ignoredFields) {
        JsonNode expectedNode = normalize(MAPPER.valueToTree(expected), orderSensitive, ignoredFields);
        JsonNode actualNode = normalize(MAPPER.valueToTree(actual), orderSensitive, ignoredFields);
        assertThat(actualNode).isEqualTo(expectedNode);
    }

    private JsonNode normalize(JsonNode node, boolean orderSensitive, String... ignoredFields) {
        if (node.isArray()) {
            List<JsonNode> children = new ArrayList<>();
            node.forEach(child -> children.add(normalize(child, orderSensitive, ignoredFields)));
            if (!orderSensitive) {
                children.sort(Comparator.comparing(JsonNode::toString));
            }
            ArrayNode array = MAPPER.createArrayNode();
            children.forEach(array::add);
            return array;
        }
        if (node.isObject()) {
            List<String> names = new ArrayList<>();
            node.fieldNames().forEachRemaining(names::add);
            Collections.sort(names);
            ObjectNode object = MAPPER.createObjectNode();
            for (String name : names) {
                if (Arrays.asList(ignoredFields).contains(name)) {
                    continue;
                }
                object.set(name, normalize(node.get(name), orderSensitive, ignoredFields));
            }
            return object;
        }
        return node;
    }
}
