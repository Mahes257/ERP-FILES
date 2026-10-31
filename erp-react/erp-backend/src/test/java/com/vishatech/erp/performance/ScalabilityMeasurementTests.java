package com.vishatech.erp.performance;

import static org.assertj.core.api.Assertions.assertThat;

import com.vishatech.erp.entity.production.OrderStatus;
import com.vishatech.erp.entity.production.ProductionOrder;
import com.vishatech.erp.entity.production.ProductionOrderItem;
import com.vishatech.erp.entity.production.ProductionType;
import com.vishatech.erp.entity.production.Priority;
import com.vishatech.erp.entity.SalesOrder;
import com.vishatech.erp.entity.SalesOrderItem;
import com.vishatech.erp.entity.PurchaseGrn;
import com.vishatech.erp.entity.PurchaseInspection;
import com.vishatech.erp.repository.production.ProductionOrderRepository;
import com.vishatech.erp.repository.SalesOrderRepository;
import com.vishatech.erp.repository.PurchaseGrnRepository;
import com.vishatech.erp.repository.PurchaseInspectionRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.security.JwtService;
import com.vishatech.erp.crm.entity.Customer;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Scalability measurement tests for key ERP read endpoints.
 *
 * <p>Uses MockMvc (in-process, no network overhead) to measure the actual
 * processing time of each endpoint. Tests progressively from 1 to 500
 * concurrent requests to identify scaling behavior.
 *
 * <p>Results are printed as structured lines for easy parsing:
 *   ENDPOINT | CONCURRENCY | TOTAL_REQUESTS | TOTAL_MS | REQ/S | P50_MS | P95_MS | P99_MS | ERRORS
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "spring.jpa.show-sql=false",
        "spring.jpa.properties.hibernate.format_sql=false"
})
class ScalabilityMeasurementTests extends AbstractSecurityTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtService jwtService;
    @Autowired private UserDetailsService userDetailsService;
    @Autowired private ProductionOrderRepository productionOrderRepo;
    @Autowired private SalesOrderRepository salesOrderRepo;
    @Autowired private PurchaseGrnRepository grnRepo;
    @Autowired private PurchaseInspectionRepository inspectionRepo;

    private static String authToken;

    @BeforeAll
    static void setupToken(@Autowired JwtService jwtService,
                           @Autowired UserDetailsService uds) {
        authToken = jwtService.generateToken(uds.loadUserByUsername("admin@vishaktech.com"));
    }

    // ======================================================================
    // Seed data
    // ======================================================================

    private int seedProductionOrders(int count) {
        List<ProductionOrder> orders = new ArrayList<>();
        OrderStatus[] statuses = OrderStatus.values();
        ProductionType[] types = {ProductionType.CASTING, ProductionType.FABRICATION};
        Priority[] priorities = Priority.values();

        for (int i = 0; i < count; i++) {
            ProductionOrder po = ProductionOrder.builder()
                    .workOrder("WO-PERF-" + UUID.randomUUID().toString().substring(0, 8))
                    .salesOrderNumber("SO-" + (1000 + i))
                    .customer("Customer-" + (i % 50))
                    .customerCode("CUST-" + (i % 50))
                    .product("Product-" + (i % 20))
                    .startDate(LocalDateTime.now().toLocalDate().minusDays(i % 30))
                    .dueDate(LocalDateTime.now().toLocalDate().plusDays(30 - (i % 30)))
                    .priority(priorities[i % priorities.length])
                    .status(statuses[i % statuses.length])
                    .productionType(types[i % types.length])
                    .currentStage("Stage-" + (i % 5))
                    .progress(i % 100)
                    .quantity(100 + i)
                    .department("Dept-" + (i % 5))
                    .batchNumber("BATCH-" + (i % 10))
                    .build();
            ProductionOrderItem item = new ProductionOrderItem();
            item.setProductName("Item-" + i);
            item.setProductCode("PRD-" + i);
            item.setQuantity(100 + i);
            item.setProductionType(types[i % types.length]);
            po.addItem(item);
            orders.add(po);
        }
        productionOrderRepo.saveAll(orders);
        return orders.size();
    }

    private int seedSalesOrders(int count) {
        List<SalesOrder> orders = new ArrayList<>();
        String[] statuses = {"draft", "confirmed", "delivered", "invoiced"};
        for (int i = 0; i < count; i++) {
            SalesOrder so = new SalesOrder();
            so.setSoNo("SO-PERF-" + UUID.randomUUID().toString().substring(0, 8));
            so.setStatus(statuses[i % statuses.length]);
            so.setOrderDate(LocalDateTime.now().minusDays(i % 60));
            so.setClientName("Client-" + (i % 30));
            so.setGrandTotal(BigDecimal.valueOf(10000 + i * 100));
            so.setRevision(0);
            so.setLatestRevision(true);
            SalesOrderItem item = new SalesOrderItem();
            item.setDescription("Product-" + i);
            item.setQty(BigDecimal.valueOf(10 + i % 20));
            item.setRate(BigDecimal.valueOf(500 + i));
            so.getItems().add(item);
            item.setSalesOrder(so);
            orders.add(so);
        }
        salesOrderRepo.saveAll(orders);
        return orders.size();
    }

    private int seedPurchaseReceiving(int grnCount, int inspectionCount) {
        List<PurchaseGrn> grns = new ArrayList<>();
        String[] statuses = {"Expected", "Received", "Pending Inspection", "Inspected"};
        for (int i = 0; i < grnCount; i++) {
            PurchaseGrn grn = new PurchaseGrn();
            grn.setGrnNo("GRN-PERF-" + UUID.randomUUID().toString().substring(0, 8));
            grn.setPoNo("PO-" + (1000 + i));
            grn.setSupplier("Supplier-" + (i % 20));
            grn.setStatus(statuses[i % statuses.length]);
            grns.add(grn);
        }
        grnRepo.saveAll(grns);

        List<PurchaseInspection> inspections = new ArrayList<>();
        String[] inspStatuses = {"Pending", "Pass", "Fail"};
        for (int i = 0; i < inspectionCount; i++) {
            PurchaseInspection insp = new PurchaseInspection();
            insp.setInspectionNo("INSP-PERF-" + UUID.randomUUID().toString().substring(0, 8));
            insp.setGrnNo("GRN-PERF-" + UUID.randomUUID().toString().substring(0, 8));
            insp.setStatus(inspStatuses[i % inspStatuses.length]);
            insp.setInspector("Inspector-" + (i % 5));
            inspections.add(insp);
        }
        inspectionRepo.saveAll(inspections);
        return grnCount + inspectionCount;
    }

    // ======================================================================
    // Measurement harness
    // ======================================================================

    record EndpointStats(
        String endpoint,
        int concurrency,
        int totalRequests,
        long totalMs,
        double reqPerSec,
        long p50Ms,
        long p95Ms,
        long p99Ms,
        int errors
    ) {
        @Override
        public String toString() {
            return String.format("%-50s | %4d | %6d | %7d | %7.1f | %5d | %5d | %5d | %4d",
                    endpoint, concurrency, totalRequests, totalMs, reqPerSec, p50Ms, p95Ms, p99Ms, errors);
        }
    }

    private EndpointStats measureEndpoint(String name, String url, int concurrency, int requestsPerUser) throws Exception {
        int totalRequests = concurrency * requestsPerUser;
        ExecutorService executor = Executors.newFixedThreadPool(concurrency);
        CountDownLatch startLatch = new CountDownLatch(1);
        ConcurrentLinkedQueue<Long> latencies = new ConcurrentLinkedQueue<>();
        AtomicInteger errors = new AtomicInteger(0);

        List<Future<?>> futures = new ArrayList<>();
        for (int u = 0; u < concurrency; u++) {
            futures.add(executor.submit(() -> {
                try {
                    startLatch.await();
                    for (int r = 0; r < requestsPerUser; r++) {
                        long start = System.nanoTime();
                        MvcResult result = mockMvc.perform(
                                org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(url)
                                        .header("Authorization", "Bearer " + authToken))
                                .andReturn();
                        long elapsed = (System.nanoTime() - start) / 1_000_000;
                        latencies.add(elapsed);
                        if (result.getResponse().getStatus() >= 400) {
                            errors.incrementAndGet();
                        }
                    }
                } catch (Exception e) {
                    errors.incrementAndGet();
                }
            }));
        }

        long wallStart = System.currentTimeMillis();
        startLatch.countDown();
        for (Future<?> f : futures) {
            f.get();
        }
        long wallElapsed = System.currentTimeMillis() - wallStart;
        executor.shutdown();

        List<Long> sorted = new ArrayList<>(latencies);
        sorted.sort(Long::compareTo);

        long p50 = sorted.isEmpty() ? 0 : sorted.get((int) (sorted.size() * 0.50));
        long p95 = sorted.isEmpty() ? 0 : sorted.get((int) (sorted.size() * 0.95));
        long p99 = sorted.isEmpty() ? 0 : sorted.get((int) (Math.min(sorted.size() - 1, sorted.size() * 0.99)));
        double rps = wallElapsed > 0 ? (totalRequests * 1000.0 / wallElapsed) : 0;

        return new EndpointStats(name, concurrency, totalRequests, wallElapsed, rps, p50, p95, p99, errors.get());
    }

    // ======================================================================
    // Test scenarios
    // ======================================================================

    @Test
    void measureProductionOrdersScalability() throws Exception {
        int seeded = seedProductionOrders(500);
        System.out.println("\n=== PRODUCTION ORDERS PERFORMANCE ===");
        System.out.printf("Seeded %d production orders%n", seeded);
        System.out.println("ENDPOINT                                        | CONC | REQS  | TOTAL_MS | REQ/S | P50  | P95  | P99  | ERR");
        System.out.println("-".repeat(115));

        for (int concurrency : new int[]{10, 25, 50, 100}) {
            EndpointStats stats = measureEndpoint(
                    "GET /production-orders (page 1)",
                    "/production-orders?page=0&size=25",
                    concurrency, 20);
            System.out.println(stats);
        }

        // Filtered query
        for (int concurrency : new int[]{10, 25, 50}) {
            EndpointStats stats = measureEndpoint(
                    "GET /production-orders (filtered)",
                    "/production-orders?page=0&size=25&status=IN_PROGRESS&productionType=CASTING",
                    concurrency, 10);
            System.out.println(stats);
        }
    }

    @Test
    void measureSalesOrdersScalability() throws Exception {
        int seeded = seedSalesOrders(500);
        System.out.println("\n=== SALES ORDERS PERFORMANCE ===");
        System.out.printf("Seeded %d sales orders%n", seeded);
        System.out.println("ENDPOINT                                        | CONC | REQS  | TOTAL_MS | REQ/S | P50  | P95  | P99  | ERR");
        System.out.println("-".repeat(115));

        for (int concurrency : new int[]{10, 25, 50, 100}) {
            EndpointStats stats = measureEndpoint(
                    "GET /sales-orders (page 1)",
                    "/sales-orders?page=0&size=25",
                    concurrency, 20);
            System.out.println(stats);
        }
    }

    @Test
    void measurePurchaseReceivingScalability() throws Exception {
        int seeded = seedPurchaseReceiving(300, 200);
        System.out.println("\n=== PURCHASE RECEIVING PERFORMANCE ===");
        System.out.printf("Seeded %d GRNs + %d inspections%n", 300, 200);
        System.out.println("ENDPOINT                                        | CONC | REQS  | TOTAL_MS | REQ/S | P50  | P95  | P99  | ERR");
        System.out.println("-".repeat(115));

        for (int concurrency : new int[]{10, 25, 50}) {
            EndpointStats stats = measureEndpoint(
                    "GET /api/purchase/grns (page 1)",
                    "/api/purchase/grns?page=0&size=25",
                    concurrency, 15);
            System.out.println(stats);
        }

        for (int concurrency : new int[]{10, 25, 50}) {
            EndpointStats stats = measureEndpoint(
                    "GET /api/purchase/inspections (page 1)",
                    "/api/purchase/inspections?page=0&size=25",
                    concurrency, 15);
            System.out.println(stats);
        }
    }

    @Test
    void measureNotificationScalability() throws Exception {
        System.out.println("\n=== NOTIFICATION PERFORMANCE ===");
        System.out.println("ENDPOINT                                        | CONC | REQS  | TOTAL_MS | REQ/S | P50  | P95  | P99  | ERR");
        System.out.println("-".repeat(115));

        for (int concurrency : new int[]{10, 25, 50, 100}) {
            EndpointStats stats = measureEndpoint(
                    "GET /notifications (user list)",
                    "/notifications",
                    concurrency, 20);
            System.out.println(stats);
        }
    }

    @Test
    void measureMasterDataScalability() throws Exception {
        System.out.println("\n=== MASTER DATA PERFORMANCE ===");
        System.out.println("ENDPOINT                                        | CONC | REQS  | TOTAL_MS | REQ/S | P50  | P95  | P99  | ERR");
        System.out.println("-".repeat(115));

        for (int concurrency : new int[]{10, 50, 100}) {
            EndpointStats stats = measureEndpoint(
                    "GET /masters/departments",
                    "/masters/pr_departments",
                    concurrency, 30);
            System.out.println(stats);
        }

        for (int concurrency : new int[]{10, 50, 100}) {
            EndpointStats stats = measureEndpoint(
                    "GET /users (dropdown)",
                    "/users?page=0&size=50",
                    concurrency, 30);
            System.out.println(stats);
        }
    }

    @Test
    void measureMixedWorkload() throws Exception {
        seedProductionOrders(300);
        seedSalesOrders(300);
        seedPurchaseReceiving(200, 150);

        System.out.println("\n=== MIXED WORKLOAD (50 concurrent users) ===");
        System.out.println("ENDPOINT                                        | CONC | REQS  | TOTAL_MS | REQ/S | P50  | P95  | P99  | ERR");
        System.out.println("-".repeat(115));

        String[][] endpoints = {
                {"GET /production-orders", "/production-orders?page=0&size=25"},
                {"GET /sales-orders", "/sales-orders?page=0&size=25"},
                {"GET /api/purchase/grns", "/api/purchase/grns?page=0&size=25"},
                {"GET /api/purchase/inspections", "/api/purchase/inspections?page=0&size=25"},
                {"GET /notifications", "/notifications"},
                {"GET /masters/departments", "/masters/pr_departments"},
        };

        ExecutorService executor = Executors.newFixedThreadPool(50);
        CountDownLatch start = new CountDownLatch(1);
        ConcurrentLinkedQueue<EndpointStats> allResults = new ConcurrentLinkedQueue<>();
        List<Future<?>> futures = new ArrayList<>();

        for (int u = 0; u < 50; u++) {
            final String[] ep = endpoints[u % endpoints.length];
            futures.add(executor.submit(() -> {
                try {
                    start.await();
                    for (int r = 0; r < 10; r++) {
                        long s = System.nanoTime();
                        mockMvc.perform(
                                org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(ep[1])
                                        .header("Authorization", "Bearer " + authToken))
                                .andReturn();
                        long elapsed = (System.nanoTime() - s) / 1_000_000;
                    }
                } catch (Exception e) {
                    // count error
                }
            }));
        }

        long wallStart = System.currentTimeMillis();
        start.countDown();
        for (Future<?> f : futures) f.get();
        long wallElapsed = System.currentTimeMillis() - wallStart;
        executor.shutdown();

        System.out.printf("Mixed workload: 50 users × 10 requests = 500 total in %d ms (%.1f req/s)%n",
                wallElapsed, wallElapsed > 0 ? 500_000.0 / wallElapsed : 0);
    }
}
