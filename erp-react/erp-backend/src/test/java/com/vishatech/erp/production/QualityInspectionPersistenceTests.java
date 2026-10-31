package com.vishatech.erp.production;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.production.QualityInspection;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.production.QualityInspectionRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.security.CustomUserDetailsService;
import com.vishatech.erp.security.JwtService;
import com.vishatech.erp.service.production.QualityInspectionService;
import jakarta.annotation.PostConstruct;
import java.sql.Connection;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * §14.14 — the quality-inspection workflow still behaves exactly as it did before its
 * entity, repository, service and controller moved into the Production module.
 *
 * <p>These tests deliberately exercise the moved classes through their real SQL against
 * the test database rather than asserting that a package changed: the repository's
 * filtered paging, its SQL aggregates and its ordering query are what the Quality screen
 * and the Quality KPI cards read, and the service's create / status / QC-data paths are
 * what the QC form writes. A package move that renamed a column, dropped an aggregate or
 * broke the String-keyed mapping would fail here, not silently ship.
 *
 * <p>The table is created by hand, exactly like the other dashboard tests do:
 * {@code QualityInspection} declares MySQL {@code JSON} columns, which H2 cannot create,
 * so the test schema defines them as large text columns while the entity keeps declaring
 * {@code columnDefinition = "JSON"} — production's schema is untouched by this phase.
 * Doing it here in full (rather than the two columns the count-only tests need) is what
 * makes the mapping itself testable: any mapped column this DDL does not declare fails
 * the first query that loads a row.
 */
@SpringBootTest
@AutoConfigureMockMvc
class QualityInspectionPersistenceTests extends AbstractSecurityTest {

    @Autowired
    private QualityInspectionRepository inspections;

    @Autowired
    private QualityInspectionService service;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private CustomUserDetailsService userDetailsService;

    @PostConstruct
    void ensureQualityInspectionsTable() throws Exception {
        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {
            statement.execute("DROP TABLE IF EXISTS quality_inspections");
            statement.execute("CREATE TABLE quality_inspections ("
                    + "id VARCHAR(20) PRIMARY KEY, "
                    + "inspection_id VARCHAR(20), "
                    + "production_order_id VARCHAR(50), "
                    + "work_order VARCHAR(50), "
                    + "work_order_item_id BIGINT, "
                    + "product VARCHAR(200), "
                    + "customer VARCHAR(200), "
                    + "department VARCHAR(100), "
                    + "inspection_type VARCHAR(50), "
                    + "inspection_date DATE, "
                    + "inspector VARCHAR(100), "
                    + "quantity_inspected INT, "
                    + "accepted_quantity INT, "
                    + "rejected_quantity INT, "
                    + "status VARCHAR(30), "
                    + "remarks CLOB, "
                    + "checklist CLOB, "
                    + "inspection_report CLOB, "
                    + "dimensional_inspection CLOB, "
                    + "material_test_certificate CLOB, "
                    + "final_qc_info CLOB, "
                    + "history CLOB, "
                    + "created_by VARCHAR(100), "
                    + "updated_by VARCHAR(100), "
                    + "created_at TIMESTAMP, "
                    + "updated_at TIMESTAMP, "
                    + "qc_updated_at TIMESTAMP)");
        }
    }

    private static String unique(String prefix) {
        return prefix + "-" + Long.toString(System.nanoTime(), 36);
    }

    private String adminToken() {
        return jwtService.generateToken(userDetailsService.loadUserByUsername("admin@vishaktech.com"));
    }

    private QualityInspection input(String orderId, String product, int inspected,
                                    int accepted, int rejected) {
        QualityInspection input = new QualityInspection();
        input.setProductionOrderId(orderId);
        input.setInspectionType("Final");
        input.setDepartment("QA");
        input.setProduct(product);
        input.setCustomer("QC Industries");
        input.setInspector("inspector@example.com");
        input.setInspectionDate(LocalDate.of(2026, 7, 1));
        input.setQuantityInspected(inspected);
        input.setAcceptedQuantity(accepted);
        input.setRejectedQuantity(rejected);
        return input;
    }

    // ------------------------------------------------------------------
    // The write path: the same service, the same columns
    // ------------------------------------------------------------------

    @Test
    void theServiceStillCreatesAnInspectionThroughTheMovedPersistence() {
        String orderId = unique("CPO-QC");

        QualityInspection saved = service.create(input(orderId, "Impeller", 10, 8, 2));

        assertThat(saved.getId()).startsWith("QI-");
        assertThat(saved.getInspectionId())
                .as("the legacy inspection_id column is still populated with the same id")
                .isEqualTo(saved.getId());
        assertThat(saved.getStatus()).isEqualTo("Pending");
        assertThat(saved.getChecklist())
                .as("the default checklist template is still seeded")
                .contains("Visual Inspection");
        assertThat(saved.getHistory()).contains("Inspection Created");
        assertThat(saved.getCreatedBy()).isNotBlank();

        QualityInspection reloaded = inspections.findById(saved.getId()).orElseThrow();
        assertThat(reloaded.getProductionOrderId()).isEqualTo(orderId);
        assertThat(reloaded.getProduct()).isEqualTo("Impeller");
        assertThat(reloaded.getQuantityInspected()).isEqualTo(10);
        assertThat(reloaded.getAcceptedQuantity()).isEqualTo(8);
        assertThat(reloaded.getRejectedQuantity()).isEqualTo(2);
        assertThat(reloaded.getCreatedAt()).isNotNull();
    }

    @Test
    void theStatusTransitionAndHistoryRulesAreUnchanged() {
        QualityInspection saved = service.create(input(unique("CPO-QC"), "Housing", 5, 5, 0));

        assertThatThrownBy(() -> service.updateStatus(
                saved.getId(), "Passed", "Inspection Passed", "skipping a step"))
                .as("Pending → In Progress → Passed is still the only path to Passed")
                .isInstanceOf(BadRequestException.class);

        QualityInspection inProgress = service
                .updateStatus(saved.getId(), "In Progress", "Inspection Started", "started");
        assertThat(inProgress.getStatus()).isEqualTo("In Progress");

        QualityInspection passed = service
                .updateStatus(saved.getId(), "Passed", "Inspection Passed", "All checks passed.");

        assertThat(passed.getStatus()).isEqualTo("Passed");
        assertThat(passed.getHistory())
                .contains("Inspection Started")
                .contains("Inspection Passed")
                .contains("Pending");
        assertThat(inspections.findById(saved.getId()).orElseThrow().getStatus())
                .isEqualTo("Passed");

        assertThatThrownBy(() -> service.updateStatus(saved.getId(), "Pending", "Back", "no"))
                .as("Passed is still terminal")
                .isInstanceOf(BadRequestException.class);

        assertThatThrownBy(() -> service.updateChecklistItem(saved.getId(), 999, "Pass", ""))
                .as("an out-of-range checklist index is still rejected")
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void theJsonQcDataColumnsStillRoundTrip() {
        QualityInspection saved = service.create(input(unique("CPO-QC"), "Shaft", 4, 4, 0));

        QualityInspection withData = service.saveQcData(saved.getId(),
                "{\"result\":\"ok\"}", "[{\"point\":1}]", null, "{\"final\":true}");

        assertThat(withData.getInspectionReport()).isEqualTo("{\"result\":\"ok\"}");
        assertThat(withData.getQcUpdatedAt()).isNotNull();

        QualityInspection reloaded = inspections.findById(saved.getId()).orElseThrow();
        assertThat(reloaded.getInspectionReport()).isEqualTo("{\"result\":\"ok\"}");
        assertThat(reloaded.getDimensionalInspection()).isEqualTo("[{\"point\":1}]");
        assertThat(reloaded.getFinalQcInfo()).isEqualTo("{\"final\":true}");
        assertThat(reloaded.getMaterialTestCertificate())
                .as("an omitted field is still left untouched")
                .isNull();

        assertThat(service.toResponse(reloaded))
                .as("the response contract still parses the JSON columns for the screen")
                .containsEntry("inspectionReport", Map.of("result", "ok"))
                .containsEntry("dimensionalInspection", List.of(Map.of("point", 1)));
    }

    @Test
    void aCallerSuppliedIdIsStillHonouredAndStillRejectedWhenTaken() {
        String explicitId = "QI-TEST-" + Long.toString(System.nanoTime(), 36);
        QualityInspection first = input(unique("CPO-QC"), "Cover", 1, 1, 0);
        first.setId(explicitId);

        assertThat(service.create(first).getId()).isEqualTo(explicitId);

        QualityInspection duplicate = input(unique("CPO-QC"), "Cover", 1, 1, 0);
        duplicate.setId(explicitId);

        assertThatThrownBy(() -> service.create(duplicate))
                .as("the same id is still refused instead of silently overwriting")
                .isInstanceOf(BadRequestException.class);

        assertThatThrownBy(() -> service.get("QI-DOES-NOT-EXIST"))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    // ------------------------------------------------------------------
    // The read path: filtered paging, ordering and the SQL aggregates
    // ------------------------------------------------------------------

    @Test
    void theFilteredQueryStillPagesAndFiltersByEveryDocumentedField() {
        String orderId = unique("CPO-QC-PAGE");
        String product = unique("QCProduct");
        service.create(input(orderId, product, 3, 3, 0));
        service.create(input(orderId, product, 3, 2, 1));
        service.create(input(orderId, product, 3, 0, 3));

        Page<QualityInspection> firstPage = inspections.findAllFiltered(
                null, null, null, null, orderId,
                PageRequest.of(0, 2, Sort.by(Sort.Direction.DESC, "createdAt")));

        assertThat(firstPage.getTotalElements()).isEqualTo(3);
        assertThat(firstPage.getTotalPages()).isEqualTo(2);
        assertThat(firstPage.getNumber()).isZero();
        assertThat(firstPage.getContent()).hasSize(2);
        assertThat(firstPage.getContent())
                .extracting(QualityInspection::getProductionOrderId)
                .containsOnly(orderId);

        assertThat(inspections.findAllFiltered(
                product, null, null, null, null, PageRequest.of(0, 10)))
                .as("the free-text search still spans the id, order, product, inspector, "
                        + "customer and remarks columns")
                .extracting(QualityInspection::getProduct)
                .containsOnly(product);

        assertThat(service.list(0, 2, null, null, null, null, orderId, "-createdAt")
                .getTotalElements())
                .as("the service still delegates paging to the same query")
                .isEqualTo(3);

        List<QualityInspection> byOrder = inspections
                .findByProductionOrderIdOrderByCreatedAtDesc(orderId);
        assertThat(byOrder).hasSize(3);
        assertThat(byOrder)
                .isSortedAccordingTo((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()));
    }

    @Test
    void theCountingAndSummingQueriesStillAggregateInSql() {
        long pendingBefore = inspections.countByStatus("Pending");
        long finalTypeBefore = inspections.countByInspectionType("Final");
        long acceptedBefore = inspections.sumAcceptedQuantity();
        long rejectedBefore = inspections.sumRejectedQuantity();
        LocalDate inspectionDate = LocalDate.of(2026, 7, 1);
        long onDateBefore = inspections.countByInspectionDate(inspectionDate);

        String orderId = unique("CPO-QC-AGG");
        service.create(input(orderId, "Aggregate", 20, 17, 3));

        assertThat(inspections.countByStatus("Pending")).isEqualTo(pendingBefore + 1);
        assertThat(inspections.countByInspectionType("Final")).isEqualTo(finalTypeBefore + 1);
        assertThat(inspections.countByInspectionDate(inspectionDate)).isEqualTo(onDateBefore + 1);
        assertThat(inspections.countByProductionOrderId(orderId)).isEqualTo(1);
        assertThat(inspections.sumAcceptedQuantity()).isEqualTo(acceptedBefore + 17);
        assertThat(inspections.sumRejectedQuantity()).isEqualTo(rejectedBefore + 3);

        Map<String, Object> stats = service.stats(null);
        assertThat(stats.get("pendingInspections"))
                .as("the stats document is still derived from the same counting queries")
                .isEqualTo(inspections.countByStatus("Pending"));
        assertThat(stats.get("passedInspections"))
                .isEqualTo(inspections.countByStatus("Passed"));

        assertThat(service.stats(orderId))
                .as("the per-order stats still count the order's own rows")
                .containsEntry("totalInspections", 1)
                .containsEntry("pendingInspections", 1L);
    }

    // ------------------------------------------------------------------
    // The HTTP contract: the routes and authorities moved with the class
    // ------------------------------------------------------------------

    /**
     * Moving a {@code @RestController} between packages is invisible only if the route and
     * its authority still answer the same way — component scanning, the security filter
     * chain and the response envelope are all outside the class itself, so they are checked
     * here rather than assumed.
     */
    @Test
    void theQualityInspectionRoutesStillAnswerTheSameContractAndAuthority() throws Exception {
        mockMvc.perform(get("/quality-inspections"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/quality-inspections/stats"))
                .andExpect(status().isUnauthorized());

        String token = adminToken();
        QualityInspection seeded = service.create(input(unique("CPO-QC-API"), "API part", 6, 6, 0));

        mockMvc.perform(get("/quality-inspections").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isArray())
                .andExpect(jsonPath("$.data.totalElements").exists())
                .andExpect(jsonPath("$.data.totalPages").exists())
                .andExpect(jsonPath("$.data.number").exists())
                .andExpect(jsonPath("$.data.size").exists())
                .andExpect(jsonPath("$.data.first").exists())
                .andExpect(jsonPath("$.data.last").exists())
                .andExpect(jsonPath("$.data.empty").exists());

        mockMvc.perform(get("/quality-inspections/stats").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalInspections").exists())
                .andExpect(jsonPath("$.data.pendingInspections").exists());

        // the response still parses the JSON columns instead of echoing strings
        mockMvc.perform(get("/quality-inspections/" + seeded.getId())
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(seeded.getId()))
                .andExpect(jsonPath("$.data.checklist").isArray())
                .andExpect(jsonPath("$.data.productionOrderId")
                        .value(seeded.getProductionOrderId()));

        mockMvc.perform(get("/quality-inspections/by-order/" + seeded.getProductionOrderId())
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data[0].id").value(seeded.getId()));

        String body = "{\"id\":\"" + seeded.getId() + "-X"
                + "\",\"productionOrderId\":\"" + seeded.getProductionOrderId()
                + "\",\"inspectionType\":\"Final\",\"quantityInspected\":1,"
                + "\"acceptedQuantity\":1,\"rejectedQuantity\":0}";
        MvcResult created = mockMvc.perform(post("/quality-inspections")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode createdData = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data");
        assertThat(createdData.path("id").asText()).isEqualTo(seeded.getId() + "-X");
        assertThat(createdData.path("status").asText()).isEqualTo("Pending");

        mockMvc.perform(patch("/quality-inspections/" + seeded.getId() + "/status")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"In Progress\",\"action\":\"Inspection Started\","
                                + "\"remarks\":\"started\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("In Progress"));
    }

    @Test
    void theTrackerRoutesStillAnswerTheSameContractAndAuthority() throws Exception {
        mockMvc.perform(get("/production-trackers"))
                .andExpect(status().isUnauthorized());

        String token = adminToken();

        MvcResult result = mockMvc.perform(get("/production-trackers")
                        .header("Authorization", "Bearer " + token)
                        .param("size", "1"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode page = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(page.path("content"))
                .as("the tracker list is still a raw Spring Data page, as it always was")
                .isNotNull();
        assertThat(page.path("pageable").path("pageSize").asInt())
                .as("the size parameter is still honoured")
                .isEqualTo(1);

        mockMvc.perform(get("/production-trackers/stats").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalCpos").exists());
    }

    @Test
    void deletingAnInspectionStillRemovesItAndFreesItsId() {
        QualityInspection saved = service.create(input(unique("CPO-QC"), "Delete me", 1, 1, 0));
        String id = saved.getId();

        assertThat(service.get(id).getId()).isEqualTo(id);

        service.delete(id);

        assertThat(inspections.existsById(id)).isFalse();

        QualityInspection reused = input(unique("CPO-QC"), "Reuse", 1, 1, 0);
        reused.setId(id);
        assertThat(service.create(reused).getId())
                .as("a deleted id is free again — the same behaviour the flat class had")
                .isEqualTo(id);
    }
}
