package com.vishatech.erp.purchase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.PurchaseGrn;
import com.vishatech.erp.entity.PurchaseInspection;
import com.vishatech.erp.entity.PurchaseInventoryMovement;
import com.vishatech.erp.entity.PurchaseManufacturingJob;
import com.vishatech.erp.entity.PurchaseShipment;
import com.vishatech.erp.repository.PurchaseGrnRepository;
import com.vishatech.erp.repository.PurchaseInspectionRepository;
import com.vishatech.erp.repository.PurchaseInventoryMovementRepository;
import com.vishatech.erp.repository.PurchaseManufacturingJobRepository;
import com.vishatech.erp.repository.PurchaseShipmentRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.security.CustomUserDetailsService;
import com.vishatech.erp.security.JwtService;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Purchase Receiving scalability tests — the GRN / inspection / packing /
 * shipment / inventory lists against a REAL database (H2 in MySQL mode, real
 * JPA entities, no mocks).
 *
 * The endpoints used to return every row in the table. They now answer with
 * exactly one page plus the database totals, so these tests pin down:
 *
 *   · one request returns one page, never the whole table
 *   · page size is clamped — a request for 5000 rows is served as 100
 *   · totalElements / totalPages come from real database counts
 *   · search, status / type / vendor filters and sorting happen in the DB
 *   · the stats endpoints equal independent repository counts
 *   · single-document lookups resolve by id AND by business number
 */
@SpringBootTest
@AutoConfigureMockMvc
class PurchaseReceivingPagingIntegrationTests extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private JwtService jwtService;
    @Autowired
    private CustomUserDetailsService userDetailsService;
    @Autowired
    private PurchaseGrnRepository grns;
    @Autowired
    private PurchaseInspectionRepository inspections;
    @Autowired
    private PurchaseManufacturingJobRepository mfgJobs;
    @Autowired
    private PurchaseShipmentRepository shipments;
    @Autowired
    private PurchaseInventoryMovementRepository inventory;

    private static int sequence = 0;

    private static synchronized String unique(String prefix) {
        sequence++;
        return prefix + "-PAG-" + System.nanoTime() + "-" + sequence;
    }

    private String adminToken() {
        return jwtService.generateToken(userDetailsService.loadUserByUsername("admin@vishaktech.com"));
    }

    private JsonNode getJson(String url, String token) throws Exception {
        MvcResult result = mockMvc.perform(get(url).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private PurchaseGrn seedGrn(String status) {
        PurchaseGrn grn = new PurchaseGrn();
        grn.setGrnNo(unique("GRN"));
        grn.setPoNo(unique("PO"));
        grn.setSupplier("Pagination Vendor");
        grn.setWarehouse("Test Store");
        grn.setReceivedBy("Test User");
        grn.setStatus(status);
        return grns.save(grn);
    }

    private PurchaseInspection seedInspection(String status) {
        PurchaseInspection inspection = new PurchaseInspection();
        inspection.setInspectionNo(unique("QI"));
        inspection.setGrnNo(seedGrn("Pending Inspection").getGrnNo());
        inspection.setInspector("Test Inspector");
        inspection.setStatus(status);
        inspection.setItemsJson("[]");
        return inspections.save(inspection);
    }

    private PurchaseManufacturingJob seedJob(String status) {
        PurchaseManufacturingJob job = new PurchaseManufacturingJob();
        job.setMfrNo(unique("MFR"));
        job.setPoNo(unique("PO"));
        job.setVendor("Pagination Vendor");
        job.setProduct("Test product");
        job.setQty(new BigDecimal("10"));
        job.setStatus(status);
        return mfgJobs.save(job);
    }

    private PurchaseShipment seedShipment(String status) {
        PurchaseShipment shipment = new PurchaseShipment();
        shipment.setShipmentNo(unique("SHP"));
        shipment.setPoNo(unique("PO"));
        shipment.setVendor("Pagination Vendor");
        shipment.setStatus(status);
        return shipments.save(shipment);
    }

    private PurchaseInventoryMovement seedMovement(String type) {
        PurchaseInventoryMovement movement = new PurchaseInventoryMovement();
        movement.setMovementNo(unique("INV"));
        movement.setSku(unique("SKU"));
        movement.setProduct("Test product");
        movement.setWarehouse("Test Store");
        movement.setType(type);
        movement.setBeforeQty(BigDecimal.ZERO);
        movement.setDelta(new BigDecimal("5"));
        movement.setAfterQty(new BigDecimal("5"));
        return inventory.save(movement);
    }

    // ------------------------------------------------------------------
    // 1. One request = one page
    // ------------------------------------------------------------------

    @Test
    void grnListReturnsOnlyTheRequestedPage() throws Exception {
        String token = adminToken();
        for (int i = 0; i < 5; i++) seedGrn("Expected");

        long total = grns.countBy();
        assertThat(total).isGreaterThan(2);

        JsonNode page = getJson("/api/purchase/grns?page=0&size=2", token);

        assertThat(page.path("content").size()).isEqualTo(2);
        assertThat(page.path("size").asInt()).isEqualTo(2);
        assertThat(page.path("number").asInt()).isZero();
        assertThat(page.path("totalElements").asLong()).isEqualTo(total);
        assertThat(page.path("totalPages").asLong())
                .isEqualTo((total + 1) / 2);
    }

    @Test
    void pageBeyondTheEndIsEmptyButStillReportsTotals() throws Exception {
        String token = adminToken();
        seedGrn("Expected");

        long total = grns.countBy();
        JsonNode page = getJson("/api/purchase/grns?page=9999&size=25", token);

        assertThat(page.path("content").size()).isZero();
        assertThat(page.path("totalElements").asLong()).isEqualTo(total);
        assertThat(page.path("totalPages").asLong()).isGreaterThan(0);
    }

    // ------------------------------------------------------------------
    // 2. Page size is clamped on the server
    // ------------------------------------------------------------------

    @Test
    void oversizedPageSizeIsClampedToTheMaximum() throws Exception {
        String token = adminToken();
        seedGrn("Expected");

        for (String url : new String[] {
                "/api/purchase/grns?size=5000",
                "/api/purchase/inspections?size=5000",
                "/api/purchase/manufacturing?size=5000",
                "/api/purchase/shipments?size=5000",
                "/api/purchase/inventory?size=5000" }) {
            JsonNode page = getJson(url, token);
            assertThat(page.path("size").asInt()).as(url).isEqualTo(100);
            assertThat(page.path("content").size()).as(url).isLessThanOrEqualTo(100);
        }
    }

    @Test
    void missingOrInvalidPageSizeFallsBackToTheDefault() throws Exception {
        String token = adminToken();

        assertThat(getJson("/api/purchase/grns", token).path("size").asInt()).isEqualTo(25);
        assertThat(getJson("/api/purchase/grns?size=0", token).path("size").asInt()).isEqualTo(25);
        assertThat(getJson("/api/purchase/grns?size=-10", token).path("size").asInt()).isEqualTo(25);
        assertThat(getJson("/api/purchase/grns?page=-3&size=10", token).path("number").asInt()).isZero();
    }

    // ------------------------------------------------------------------
    // 3. Filtering and sorting run in the database
    // ------------------------------------------------------------------

    @Test
    void searchNarrowsTheResultInTheDatabase() throws Exception {
        String token = adminToken();
        PurchaseGrn target = seedGrn("Expected");

        JsonNode page = getJson("/api/purchase/grns?search=" + target.getGrnNo(), token);

        assertThat(page.path("totalElements").asLong()).isEqualTo(1);
        assertThat(page.path("content").get(0).path("grnNo").asText()).isEqualTo(target.getGrnNo());
    }

    @Test
    void statusFilterMatchesTheDatabaseCount() throws Exception {
        String token = adminToken();
        seedGrn("Received");

        JsonNode page = getJson("/api/purchase/grns?status=Received&size=100", token);
        assertThat(page.path("totalElements").asLong()).isEqualTo(grns.countByStatus("Received"));
    }

    @Test
    void sortAscendingIsHonoured() throws Exception {
        String token = adminToken();
        for (int i = 0; i < 3; i++) seedGrn("Expected");

        JsonNode page = getJson("/api/purchase/grns?sort=grnNo,asc&size=100", token);
        String previous = "";
        for (JsonNode row : page.path("content")) {
            String grnNo = row.path("grnNo").asText();
            assertThat(grnNo.compareTo(previous)).isGreaterThanOrEqualTo(0);
            previous = grnNo;
        }
    }

    @Test
    void inventoryListFiltersByTypeInTheDatabase() throws Exception {
        String token = adminToken();
        seedMovement("Adjustment");

        JsonNode page = getJson("/api/purchase/inventory?type=Adjustment&size=100", token);
        assertThat(page.path("totalElements").asLong()).isEqualTo(inventory.countByType("Adjustment"));
        for (JsonNode row : page.path("content")) {
            assertThat(row.path("type").asText()).isEqualTo("Adjustment");
        }
    }

    // ------------------------------------------------------------------
    // 4. Stats are database counts, not list scans
    // ------------------------------------------------------------------

    @Test
    void receivingStatsMatchDatabaseCounts() throws Exception {
        String token = adminToken();
        seedGrn("Pending Inspection");
        seedInspection("Pending");
        seedJob("Packed");
        seedShipment("In Transit");
        seedMovement("Receipt");

        JsonNode grnStats = getJson("/api/purchase/grns/stats", token).path("data");
        assertThat(grnStats.path("total").asLong()).isEqualTo(grns.countBy());
        assertThat(grnStats.path("expected").asLong()).isEqualTo(grns.countByStatus("Expected"));
        assertThat(grnStats.path("received").asLong()).isEqualTo(grns.countByStatus("Received"));
        assertThat(grnStats.path("pendingInspection").asLong())
                .isEqualTo(grns.countByStatus("Pending Inspection"));

        JsonNode inspectionStats = getJson("/api/purchase/inspections/stats", token).path("data");
        assertThat(inspectionStats.path("total").asLong()).isEqualTo(inspections.countBy());
        assertThat(inspectionStats.path("pending").asLong())
                .isEqualTo(inspections.countByStatus("Pending"));
        assertThat(inspectionStats.path("passed").asLong())
                .isEqualTo(inspections.countByStatus("Passed"));
        assertThat(inspectionStats.path("failed").asLong())
                .isEqualTo(inspections.countByStatus("Failed"));
        assertThat(inspectionStats.path("partiallyAccepted").asLong())
                .isEqualTo(inspections.countByStatus("Partially Accepted"));

        JsonNode mfgStats = getJson("/api/purchase/manufacturing/stats", token).path("data");
        assertThat(mfgStats.path("total").asLong()).isEqualTo(mfgJobs.countBy());
        assertThat(mfgStats.path("packed").asLong()).isEqualTo(mfgJobs.countByStatus("Packed"));

        JsonNode shipmentStats = getJson("/api/purchase/shipments/stats", token).path("data");
        assertThat(shipmentStats.path("total").asLong()).isEqualTo(shipments.countBy());
        assertThat(shipmentStats.path("inTransit").asLong())
                .isEqualTo(shipments.countByStatus("In Transit"));

        JsonNode inventoryStats = getJson("/api/purchase/inventory/stats", token).path("data");
        assertThat(inventoryStats.path("total").asLong()).isEqualTo(inventory.countBy());
        assertThat(inventoryStats.path("receipts").asLong()).isEqualTo(inventory.countByType("Receipt"));
        assertThat(inventoryStats.path("transfers").asLong())
                .isEqualTo(inventory.countByTypeAndDirection("Transfer", "Out"));
        assertThat(inventoryStats.path("netMovement").decimalValue())
                .isEqualByComparingTo(inventory.sumDelta());
    }

    // ------------------------------------------------------------------
    // 5. Single-document lookups
    // ------------------------------------------------------------------

    @Test
    void inspectionResolvesByIdAndByInspectionNumber() throws Exception {
        String token = adminToken();
        PurchaseInspection inspection = seedInspection("Pending");

        JsonNode byId = getJson("/api/purchase/inspections/" + inspection.getId(), token).path("data");
        assertThat(byId.path("inspectionNo").asText()).isEqualTo(inspection.getInspectionNo());

        JsonNode byNumber = getJson("/api/purchase/inspections/" + inspection.getInspectionNo(), token).path("data");
        assertThat(byNumber.path("id").asLong()).isEqualTo(inspection.getId());
    }

    @Test
    void inspectionLookupForAMissingRecordIsNotFound() throws Exception {
        String token = adminToken();
        mockMvc.perform(get("/api/purchase/inspections/QI-DOES-NOT-EXIST")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------------
    // 6. Every list stays behind authentication
    // ------------------------------------------------------------------

    @Test
    void receivingListsRequireAuthentication() throws Exception {
        for (String url : new String[] {
                "/api/purchase/grns",
                "/api/purchase/inspections",
                "/api/purchase/manufacturing",
                "/api/purchase/shipments",
                "/api/purchase/inventory" }) {
            mockMvc.perform(get(url))
                    .andExpect(status().isUnauthorized());
        }
    }
}
