package com.vishatech.erp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import java.sql.Connection;
import java.sql.Statement;
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
 * The Sales Dashboard is served by the read-only {@code GET /sales/dashboard}
 * aggregation. These tests exercise the real controller against the in-memory
 * database: authentication is required, and the pipeline reflects the exact
 * stage contract the SOURCE dashboard renders.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class SalesDashboardApiTest extends AbstractSecurityTest {

    /** Pipeline stage keys, in the business order the SOURCE dashboard renders. */
    private static final List<String> PIPELINE_KEYS = List.of(
            "leads", "clients", "followups", "cpr", "technicalverification",
            "costworkout", "profitworkout", "cprreports", "quotation", "contract",
            "cpo", "productiontracker", "qc", "packinglist", "proformainvoice",
            "deliverychallan", "invoice", "creditnote", "payment");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private DataSource dataSource;

    /**
     * The {@code QualityInspection} entity declares several MySQL JSON columns,
     * which the H2 test schema cannot create (no JSON domain). The Sales
     * Dashboard only ever calls {@code qualityInspectionRepository.count()}, so
     * the pipeline needs the table to exist but not its columns. This recreates
     * the table after Hibernate's create-drop phase when it is missing.
     */
    @PostConstruct
    void ensureQualityInspectionsTable() throws Exception {
        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {
            statement.execute("CREATE TABLE IF NOT EXISTS quality_inspections (id VARCHAR(20) PRIMARY KEY)");
        }
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

    @Test
    void salesDashboardRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/sales/dashboard"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void salesDashboardReturnsTheSourcePipeline() throws Exception {
        String token = register("sales-dashboard-user@example.com", "Sales Dashboard User");

        MvcResult result = mockMvc.perform(get("/sales/dashboard")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        JsonNode pipeline = body.path("pipeline");
        assertThat(pipeline.isArray()).isTrue();

        List<String> keys = new ArrayList<>();
        pipeline.forEach(stage -> keys.add(stage.path("key").asText()));
        assertThat(keys).containsExactlyElementsOf(PIPELINE_KEYS);

        // Each stage carries a label and a numeric count.
        pipeline.forEach(stage -> {
            assertThat(stage.path("label").asText()).isNotBlank();
            assertThat(stage.path("count").isNumber()).isTrue();
        });
    }
}
