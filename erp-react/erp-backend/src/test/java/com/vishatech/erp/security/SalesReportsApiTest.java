package com.vishatech.erp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Sales Reports API verification for the migrated SOURCE implementation:
 * authorization on GET /sales/reports, the full aggregation payload shape
 * (totalRecords / kpis / monthlyTrend / statusDistribution / moduleBreakdown /
 * records) and acceptance of every documented filter.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class SalesReportsApiTest extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

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
    void salesReportsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/sales/reports")).andExpect(status().isUnauthorized());
    }

    @Test
    void salesReportReturnsTheFullAggregationPayload() throws Exception {
        String token = register("reports-user@example.com", "Reports User");

        mockMvc.perform(get("/sales/reports")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalRecords").isNumber())
                .andExpect(jsonPath("$.data.kpis.totalRecords").isNumber())
                .andExpect(jsonPath("$.data.kpis.totalValue").exists())
                .andExpect(jsonPath("$.data.monthlyTrend.labels").isArray())
                .andExpect(jsonPath("$.data.monthlyTrend.counts").isArray())
                .andExpect(jsonPath("$.data.monthlyTrend.trend").isArray())
                .andExpect(jsonPath("$.data.statusDistribution.labels").isArray())
                .andExpect(jsonPath("$.data.statusDistribution.distribution").isArray())
                .andExpect(jsonPath("$.data.moduleBreakdown.breakdown").isArray())
                .andExpect(jsonPath("$.data.records").isArray());
    }

    @Test
    void everyDocumentedFilterIsAccepted() throws Exception {
        String token = register("reports-filter@example.com", "Reports Filter");

        // Date-range + status + module + client filters all applied together.
        mockMvc.perform(get("/sales/reports")
                        .header("Authorization", "Bearer " + token)
                        .param("dateFrom", "2020-01-01")
                        .param("dateTo", "2035-12-31")
                        .param("status", "approved")
                        .param("module", "quotations")
                        .param("client", "acme"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.records").isArray());

        // An unparseable date must not error — it is ignored.
        mockMvc.perform(get("/sales/reports")
                        .header("Authorization", "Bearer " + token)
                        .param("dateFrom", "not-a-date"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalRecords").isNumber());
    }

    /**
     * The filters are applied by the module queries themselves, so each one
     * must narrow (or empty) the result set, and every section of the typed
     * payload must describe the same row set.
     */
    @Test
    void reportFiltersAndSectionsStayConsistent() throws Exception {
        String token = register("reports-consistency@example.com", "Reports Consistency");

        MvcResult unfiltered = mockMvc.perform(get("/sales/reports")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode all = objectMapper.readTree(unfiltered.getResponse().getContentAsString()).path("data");

        // Every section counts the same filtered dataset.
        assertThat(all.path("kpis").path("totalRecords").asLong())
                .isEqualTo(all.path("totalRecords").asLong())
                .isEqualTo(all.path("records").size());
        long breakdownCount = 0;
        for (JsonNode row : all.path("moduleBreakdown").path("breakdown")) {
            breakdownCount += row.path("count").asLong();
        }
        assertThat(breakdownCount).isEqualTo(all.path("totalRecords").asLong());
        assertThat(all.path("kpis").path("totalValue").isNumber()).isTrue();

        // A module filter returns only that module's rows.
        MvcResult invoices = mockMvc.perform(get("/sales/reports")
                        .header("Authorization", "Bearer " + token)
                        .param("module", "invoices"))
                .andExpect(status().isOk())
                .andReturn();
        for (JsonNode row : objectMapper.readTree(invoices.getResponse().getContentAsString())
                .path("data").path("records")) {
            assertThat(row.path("_moduleKey").asText()).isEqualTo("invoices");
        }

        // An unknown module, an empty date window, an impossible client and the
        // excluded lifecycle statuses all return an empty report.
        for (String[] params : new String[][]{
                {"module", "noSuchModule"},
                {"dateFrom", "2099-01-01"},
                {"client", "zzz-no-such-client-zzz"},
                {"status", "archived"}}) {
            mockMvc.perform(get("/sales/reports")
                            .header("Authorization", "Bearer " + token)
                            .param(params[0], params[1]))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.totalRecords").value(0))
                    .andExpect(jsonPath("$.data.kpis.totalValue").value(0));
        }
    }
}
