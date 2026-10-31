package com.vishatech.erp.production;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.production.Dispatch;
import com.vishatech.erp.entity.production.DispatchStatus;
import com.vishatech.erp.entity.production.EntryStatus;
import com.vishatech.erp.entity.production.OrderStatus;
import com.vishatech.erp.entity.production.PackingList;
import com.vishatech.erp.entity.production.PackingStatus;
import com.vishatech.erp.entity.production.Priority;
import com.vishatech.erp.entity.production.ProductionEntry;
import com.vishatech.erp.entity.production.ProductionOrder;
import com.vishatech.erp.repository.production.DispatchRepository;
import com.vishatech.erp.repository.production.PackingListRepository;
import com.vishatech.erp.repository.production.ProductionEntryRepository;
import com.vishatech.erp.repository.production.ProductionOrderRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.security.CustomUserDetailsService;
import com.vishatech.erp.security.JwtService;
import com.vishatech.erp.crm.entity.Customer;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Production KPI aggregation tests against a REAL database (H2 in MySQL mode,
 * real JPA entities, no mocks).
 *
 * The KPI screens used to download whole production tables and then filter,
 * count and page them in the browser. Every KPI is now a database question, so
 * these tests pin down:
 *
 *   · one request returns one page — never the table behind a KPI
 *   · the page size is clamped (default 25, hard max 100)
 *   · the KPI's own definition (status set / quantity rule / past-due rule) is
 *     applied by the database and matches an independent count
 *   · the counters endpoint equals those same counts
 *   · search and the screen's status filter narrow the result in SQL
 *   · empty and large data sets behave (empty page, real totals)
 *   · the KPI endpoints stay behind authentication
 */
@SpringBootTest
@AutoConfigureMockMvc
class ProductionKpiAggregationIntegrationTests extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private JwtService jwtService;
    @Autowired
    private CustomUserDetailsService userDetailsService;
    @Autowired
    private ProductionOrderRepository orders;
    @Autowired
    private PackingListRepository packingLists;
    @Autowired
    private DispatchRepository dispatches;
    @Autowired
    private ProductionEntryRepository entries;

    private static int sequence = 0;
    private static final String DEPT = "KPI-Gate";

    /** Unique, ≤20 characters (production_orders.work_order is varchar(20)). */
    private static synchronized String unique(String prefix) {
        sequence++;
        String value = prefix + "-" + Long.toString(System.nanoTime(), 36)
                + Integer.toString(sequence, 36);
        return value.length() <= 20 ? value : value.substring(value.length() - 20);
    }

    private String adminToken() {
        return jwtService.generateToken(userDetailsService.loadUserByUsername("admin@vishaktech.com"));
    }

    private JsonNode getData(String url, String token) throws Exception {
        return getData(url, token, new String[0]);
    }

    /**
     * GET with explicit query parameters, so values containing spaces travel
     * exactly as a browser would send them.
     */
    private JsonNode getData(String url, String token, String... keyValues) throws Exception {
        var request = get(url).header("Authorization", "Bearer " + token);
        for (int i = 0; i + 1 < keyValues.length; i += 2) {
            request = request.param(keyValues[i], keyValues[i + 1]);
        }
        MvcResult result = mockMvc.perform(request).andExpect(status().isOk()).andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).path("data");
    }

    // ------------------------------------------------------------------
    // Fixtures
    // ------------------------------------------------------------------

    private ProductionOrder seedOrder(OrderStatus status, String product, LocalDate dueDate) {
        ProductionOrder order = ProductionOrder.builder()
                .workOrder(unique("WO"))
                .product(product)
                .department(DEPT)
                .status(status)
                .priority(Priority.MEDIUM)
                .dueDate(dueDate)
                .startDate(LocalDate.now().minusDays(10))
                .quantity(10)
                .progress(0)
                .build();
        return orders.save(order);
    }

    private PackingList seedPackingList(PackingStatus status) {
        PackingList list = PackingList.builder()
                .packingListNumber(unique("PL"))
                .workOrderId("WO-KPI-TEST")
                .product("KPI product")
                .customer("KPI Customer")
                .productionQuantity(10)
                .status(status)
                .build();
        return packingLists.save(list);
    }

    private Dispatch seedDispatch(DispatchStatus status) {
        Dispatch dispatch = Dispatch.builder()
                .dispatchNumber(unique("DSP"))
                .workOrderId("WO-KPI-TEST")
                .product("KPI product")
                .customer("KPI Customer")
                .quantity(5)
                .status(status)
                .build();
        return dispatches.save(dispatch);
    }

    private ProductionEntry seedEntry(String productionType, EntryStatus status) {
        ProductionOrder order = seedOrder(OrderStatus.DRAFT, "KPI shop-floor product", LocalDate.now().plusDays(5));
        ProductionEntry entry = ProductionEntry.builder()
                .productionOrder(order)
                .productionType(productionType)
                .stage("KPI stage")
                .inputQuantity(10)
                .outputQuantity(0)
                .rejectedQuantity(0)
                .status(status)
                .build();
        return entries.save(entry);
    }

    private long countOrders(OrderStatus... statuses) {
        long total = 0;
        for (OrderStatus status : statuses) {
            total += orders.count((root, query, cb) -> cb.equal(root.get("status"), status));
        }
        return total;
    }

    // ------------------------------------------------------------------
    // 1. One request = one page, never the whole table
    // ------------------------------------------------------------------

    @Test
    void kpiPageReturnsOnlyTheRequestedPage() throws Exception {
        String token = adminToken();
        for (int i = 0; i < 5; i++) seedOrder(OrderStatus.DRAFT, "Paged product", LocalDate.now().plusDays(3));

        long draftCount = countOrders(OrderStatus.DRAFT);
        assertThat(draftCount).isGreaterThan(2);

        JsonNode page = getData("/production-kpi/orders/kpi/draft?page=0&size=2", token);

        assertThat(page.path("content").size()).isEqualTo(2);
        assertThat(page.path("size").asInt()).isEqualTo(2);
        assertThat(page.path("page").asInt()).isZero();
        assertThat(page.path("totalElements").asLong()).isEqualTo(draftCount);
        assertThat(page.path("totalPages").asLong()).isEqualTo((draftCount + 1) / 2);
    }

    @Test
    void pageSizeIsClampedAndDefaultsTo25() throws Exception {
        String token = adminToken();

        assertThat(getData("/production-kpi/orders/kpi/total?size=5000", token).path("size").asInt())
                .isEqualTo(100);
        assertThat(getData("/production-kpi/orders/kpi/total?size=5000", token)
                .path("content").size()).isLessThanOrEqualTo(100);
        assertThat(getData("/production-kpi/orders/kpi/total", token).path("size").asInt()).isEqualTo(25);
        assertThat(getData("/production-kpi/orders/kpi/total?size=0", token).path("size").asInt()).isEqualTo(25);
        assertThat(getData("/production-kpi/orders/kpi/total?size=-5", token).path("size").asInt()).isEqualTo(25);
        assertThat(getData("/production-kpi/orders/kpi/total?page=-2&size=10", token).path("page").asInt()).isZero();
    }

    @Test
    void pageBeyondTheEndIsEmptyButStillReportsTheCount() throws Exception {
        String token = adminToken();
        seedOrder(OrderStatus.APPROVED, "Overflow product", LocalDate.now().plusDays(2));

        JsonNode page = getData("/production-kpi/orders/kpi/approved?page=9999&size=25", token);

        assertThat(page.path("content").size()).isZero();
        assertThat(page.path("totalElements").asLong()).isEqualTo(countOrders(OrderStatus.APPROVED));
    }

    // ------------------------------------------------------------------
    // 2. Every KPI definition is the same question the UI asked before
    // ------------------------------------------------------------------

    @Test
    void orderKpiStatusSetsMatchIndependentCounts() throws Exception {
        String token = adminToken();
        seedOrder(OrderStatus.PENDING_PRODUCTION_APPROVAL, "Approval product", LocalDate.now().plusDays(4));
        seedOrder(OrderStatus.PRODUCTION_APPROVED, "Approval product", LocalDate.now().plusDays(4));
        seedOrder(OrderStatus.PENDING_ADMIN_APPROVAL, "Approval product", LocalDate.now().plusDays(4));
        seedOrder(OrderStatus.ADMIN_APPROVED, "Approval product", LocalDate.now().plusDays(4));
        seedOrder(OrderStatus.PRODUCTION_REJECTED, "Approval product", LocalDate.now().plusDays(4));
        seedOrder(OrderStatus.ADMIN_REJECTED, "Approval product", LocalDate.now().plusDays(4));
        seedOrder(OrderStatus.CANCELLED, "Approval product", LocalDate.now().plusDays(4));

        assertThat(getData("/production-kpi/orders/kpi/total?size=1", token).path("totalElements").asLong())
                .isEqualTo(orders.count());
        assertThat(getData("/production-kpi/orders/kpi/draft?size=1", token).path("totalElements").asLong())
                .isEqualTo(countOrders(OrderStatus.DRAFT));
        assertThat(getData("/production-kpi/orders/kpi/prodApproval?size=1", token).path("totalElements").asLong())
                .isEqualTo(countOrders(OrderStatus.PENDING_PRODUCTION_APPROVAL, OrderStatus.PRODUCTION_APPROVED));
        assertThat(getData("/production-kpi/orders/kpi/adminApproval?size=1", token).path("totalElements").asLong())
                .isEqualTo(countOrders(OrderStatus.PENDING_ADMIN_APPROVAL, OrderStatus.ADMIN_APPROVED));
        assertThat(getData("/production-kpi/orders/kpi/approved?size=1", token).path("totalElements").asLong())
                .isEqualTo(countOrders(OrderStatus.APPROVED));
        assertThat(getData("/production-kpi/orders/kpi/prodRejected?size=1", token).path("totalElements").asLong())
                .isEqualTo(countOrders(OrderStatus.PRODUCTION_REJECTED));
        assertThat(getData("/production-kpi/orders/kpi/adminRejected?size=1", token).path("totalElements").asLong())
                .isEqualTo(countOrders(OrderStatus.ADMIN_REJECTED));
        assertThat(getData("/production-kpi/orders/kpi/cancelled?size=1", token).path("totalElements").asLong())
                .isEqualTo(countOrders(OrderStatus.CANCELLED));
    }

    @Test
    void dashboardDelayedKpiIsPastDueAndNotFinished() throws Exception {
        String token = adminToken();
        seedOrder(OrderStatus.DRAFT, "Late product", LocalDate.now().minusDays(3));
        seedOrder(OrderStatus.CANCELLED, "Late cancelled", LocalDate.now().minusDays(3));
        seedOrder(OrderStatus.COMPLETED, "Late completed", LocalDate.now().minusDays(3));
        seedOrder(OrderStatus.DRAFT, "Future product", LocalDate.now().plusDays(3));
        /* Due today is already past due: the dashboard card compared
           `new Date(dueDate)` (00:00 UTC) against `new Date()` (now). */
        seedOrder(OrderStatus.DRAFT, "Due today", LocalDate.now());

        long expected = orders.count((root, query, cb) -> cb.and(
                cb.lessThanOrEqualTo(root.get("dueDate"), LocalDate.now(ZoneOffset.UTC)),
                cb.not(root.get("status").in(java.util.List.of(
                        OrderStatus.COMPLETED, OrderStatus.PACKED,
                        OrderStatus.DISPATCHED, OrderStatus.CANCELLED)))));

        JsonNode page = getData("/production-kpi/dashboard/kpi/delayed?size=100", token);

        assertThat(page.path("totalElements").asLong()).isEqualTo(expected);
        for (JsonNode row : page.path("content")) {
            assertThat(row.path("status").asText()).isNotIn("Completed", "Packed", "Dispatched", "Cancelled");
        }
        assertThat(expected).isGreaterThanOrEqualTo(2);
    }

    /*
     * The quality KPI keys (total / pending / today / accepted / rejected /
     * onHold) are exercised against the live MySQL backend instead of here:
     * quality_inspections cannot be created in the H2 test schema because its
     * JSON columns use MySQL's JSON type and the test profile sets
     * globally_quoted_identifiers, so Hibernate emits "JSON" as an identifier.
     * That limitation is pre-existing and unrelated to the KPI queries.
     */

    @Test
    void packingAndDispatchKpisFilterByStatusInTheDatabase() throws Exception {
        String token = adminToken();
        seedPackingList(PackingStatus.PENDING);
        seedPackingList(PackingStatus.READY_FOR_DISPATCH);
        seedDispatch(DispatchStatus.DRAFT);
        seedDispatch(DispatchStatus.DELIVERED);

        assertThat(getData("/production-kpi/packing/kpi/pending?size=100", token).path("totalElements").asLong())
                .isEqualTo(packingLists.countByStatus(PackingStatus.PENDING));
        assertThat(getData("/production-kpi/packing/kpi/readyForDispatch?size=100", token)
                .path("totalElements").asLong())
                .isEqualTo(packingLists.countByStatus(PackingStatus.READY_FOR_DISPATCH));
        assertThat(getData("/production-kpi/dispatch/kpi/draft?size=100", token).path("totalElements").asLong())
                .isEqualTo(dispatches.countByStatus(DispatchStatus.DRAFT));
        assertThat(getData("/production-kpi/dispatch/kpi/delivered?size=100", token).path("totalElements").asLong())
                .isEqualTo(dispatches.countByStatus(DispatchStatus.DELIVERED));

        /* The dashboard's "pending" cards keep their own two-status definitions. */
        assertThat(getData("/production-kpi/dashboard/kpi/packingPending?size=100", token)
                .path("totalElements").asLong())
                .isEqualTo(packingLists.count((root, query, cb) -> root.get("status").in(
                        java.util.List.of(PackingStatus.PENDING, PackingStatus.IN_PROGRESS))));
        assertThat(getData("/production-kpi/dashboard/kpi/dispatchPending?size=100", token)
                .path("totalElements").asLong())
                .isEqualTo(dispatches.count((root, query, cb) -> root.get("status").in(
                        java.util.List.of(DispatchStatus.DRAFT, DispatchStatus.READY))));
    }

    @Test
    void shopFloorKpisAreScopedToTheirProductionType() throws Exception {
        String token = adminToken();
        seedEntry("Casting", EntryStatus.PENDING);
        seedEntry("Casting", EntryStatus.COMPLETED);
        seedEntry("Fabrication", EntryStatus.PENDING);

        long castingPending = entries.count((root, query, cb) -> cb.and(
                cb.equal(root.get("productionType"), "Casting"),
                cb.equal(root.get("status"), EntryStatus.PENDING)));
        assertThat(getData("/production-kpi/casting/kpi/pending?size=100", token).path("totalElements").asLong())
                .isEqualTo(castingPending);
        assertThat(getData("/production-kpi/fabrication/kpi/pending?size=100", token)
                .path("totalElements").asLong())
                .isEqualTo(entries.count((root, query, cb) -> cb.and(
                        cb.equal(root.get("productionType"), "Fabrication"),
                        cb.equal(root.get("status"), EntryStatus.PENDING))));

        /* A Casting KPI must never leak another shop floor's jobs. */
        for (JsonNode row : getData("/production-kpi/casting/kpi/total?size=100", token).path("content")) {
            assertThat(row.path("status").asText()).isIn("Pending", "In Progress", "Hold", "Completed", "Skipped");
        }
    }

    // ------------------------------------------------------------------
    // 3. Search and the screen's status filter run in the database
    // ------------------------------------------------------------------

    @Test
    void searchAndStatusFilterNarrowTheKpiPage() throws Exception {
        String token = adminToken();
        ProductionOrder target = seedOrder(OrderStatus.DRAFT, "Searchable gearbox", LocalDate.now().plusDays(1));
        seedOrder(OrderStatus.DRAFT, "Other product", LocalDate.now().plusDays(1));

        JsonNode byWorkOrder = getData(
                "/production-kpi/orders/kpi/total", token, "search", target.getWorkOrder());
        assertThat(byWorkOrder.path("totalElements").asLong())
                .as("searching %s must find exactly that work order", target.getWorkOrder())
                .isEqualTo(1);
        assertThat(byWorkOrder.path("content").get(0).path("id").asText())
                .isEqualTo(target.getWorkOrder());

        JsonNode byProduct = getData(
                "/production-kpi/orders/kpi/total", token, "search", "Searchable gearbox");
        assertThat(byProduct.path("totalElements").asLong())
                .as("the product text is searchable")
                .isGreaterThanOrEqualTo(1);

        JsonNode byStatusFilter = getData(
                "/production-kpi/orders/kpi/total", token, "status", "Approved", "size", "100");
        assertThat(byStatusFilter.path("totalElements").asLong())
                .as("the status dropdown filters in SQL")
                .isEqualTo(countOrders(OrderStatus.APPROVED));
    }

    @Test
    void kpiRowsCarryOnlyTheColumnsTheTableRenders() throws Exception {
        String token = adminToken();
        ProductionOrder order = seedOrder(OrderStatus.DRAFT, "Lean row product", LocalDate.now().plusDays(7));

        JsonNode row = null;
        for (JsonNode candidate : getData("/production-kpi/orders/kpi/draft?size=100", token).path("content")) {
            if (order.getWorkOrder().equals(candidate.path("id").asText())) {
                row = candidate;
            }
        }
        assertThat(row).isNotNull();
        /* No item list, no drawing/batch/audit fields — the KPI table needs none. */
        assertThat(row.path("workOrder").asText()).isEqualTo(order.getWorkOrder());
        assertThat(row.path("product").asText()).isEqualTo("Lean row product");
        assertThat(row.path("status").asText()).isEqualTo("Draft");
        assertThat(row.path("dueDate").asText()).isEqualTo(LocalDate.now().plusDays(7).toString());
        assertThat(row.has("items")).isFalse();
        assertThat(row.fieldNames()).toIterable().hasSizeLessThanOrEqualTo(7);
    }

    // ------------------------------------------------------------------
    // 4. Counters equal the same counts
    // ------------------------------------------------------------------

    @Test
    void orderCountersMatchDatabaseCounts() throws Exception {
        String token = adminToken();
        seedOrder(OrderStatus.DRAFT, "Counter product", LocalDate.now().plusDays(3));

        JsonNode counts = getData("/production-kpi/orders/counts", token);

        assertThat(counts.path("total").asLong()).isEqualTo(orders.count());
        assertThat(counts.path("draft").asLong()).isEqualTo(countOrders(OrderStatus.DRAFT));
        assertThat(counts.path("prodApproval").asLong())
                .isEqualTo(countOrders(OrderStatus.PENDING_PRODUCTION_APPROVAL, OrderStatus.PRODUCTION_APPROVED));
        assertThat(counts.path("adminApproval").asLong())
                .isEqualTo(countOrders(OrderStatus.PENDING_ADMIN_APPROVAL, OrderStatus.ADMIN_APPROVED));
        assertThat(counts.path("approved").asLong()).isEqualTo(countOrders(OrderStatus.APPROVED));
        assertThat(counts.path("cancelled").asLong()).isEqualTo(countOrders(OrderStatus.CANCELLED));
    }

    @Test
    void shopFloorCountersMatchDatabaseCounts() throws Exception {
        String token = adminToken();
        seedEntry("Machine Shop", EntryStatus.IN_PROGRESS);

        JsonNode counts = getData("/production-kpi/machineShop/counts", token);

        assertThat(counts.path("total").asLong()).isEqualTo(entries.count((root, query, cb) ->
                cb.equal(root.get("productionType"), "Machine Shop")));
        assertThat(counts.path("inProgress").asLong()).isEqualTo(entries.count((root, query, cb) -> cb.and(
                cb.equal(root.get("productionType"), "Machine Shop"),
                cb.equal(root.get("status"), EntryStatus.IN_PROGRESS))));
    }

    // ------------------------------------------------------------------
    // 5. Empty data, large data, and unknown KPIs
    // ------------------------------------------------------------------

    @Test
    void anEmptyKpiIsAnEmptyPageNotAnError() throws Exception {
        String token = adminToken();

        JsonNode page = getData("/production-kpi/dispatch/kpi/inTransit?size=100", token);

        assertThat(page.path("totalElements").asLong()).isZero();
        assertThat(page.path("content").size()).isZero();
        assertThat(page.path("totalPages").asInt()).isZero();
    }

    @Test
    void aLargeKpiSetIsServedOnePageAtATime() throws Exception {
        String token = adminToken();
        for (int i = 0; i < 300; i++) {
            seedOrder(OrderStatus.DRAFT, "Bulk product " + i, LocalDate.now().plusDays(2));
        }

        JsonNode first = getData("/production-kpi/orders/kpi/draft?page=0&size=25", token);

        /* The browser receives 25 rows plus a count — never the 300-row table. */
        assertThat(first.path("content").size()).isEqualTo(25);
        assertThat(first.path("totalElements").asLong()).isGreaterThanOrEqualTo(300);
        assertThat(first.path("totalPages").asLong()).isGreaterThanOrEqualTo(12);

        /* Paging is stable: the second page continues where the first stopped. */
        JsonNode second = getData("/production-kpi/orders/kpi/draft?page=1&size=25", token);
        assertThat(second.path("content").size()).isEqualTo(25);
        assertThat(second.path("content").get(0).path("id").asText())
                .isNotEqualTo(first.path("content").get(0).path("id").asText());
    }

    @Test
    void unknownModuleOrKpiIsRejected() throws Exception {
        String token = adminToken();

        mockMvc.perform(get("/production-kpi/nonsense/kpi/total")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/production-kpi/orders/kpi/not-a-kpi")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());
    }

    // ------------------------------------------------------------------
    // 6. Still behind authentication
    // ------------------------------------------------------------------

    @Test
    void kpiEndpointsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/production-kpi/orders/kpi/total"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/production-kpi/orders/counts"))
                .andExpect(status().isUnauthorized());
    }
}
