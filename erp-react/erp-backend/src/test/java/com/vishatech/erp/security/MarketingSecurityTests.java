package com.vishatech.erp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.repository.UserRepository;
import com.vishatech.erp.crm.entity.Contact;
import com.vishatech.erp.crm.entity.Customer;
import com.vishatech.erp.crm.entity.Lead;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class MarketingSecurityTests extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    // ============================== Helpers ==============================

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

    private String login(String email, String password) throws Exception {
        MvcResult result = mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", email,
                                "password", password))))
                .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("token").asText();
    }

    private long createVisit(String token, Map<String, Object> body) throws Exception {
        MvcResult result = mockMvc.perform(post("/marketing/visits")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("id").asLong();
    }

    private Map<String, Object> visitBody(String company, String outcome) {
        return Map.of(
                "companyName", company,
                "scheduleDate", "2026-08-20",
                "appointmentStatus", "Fixed",
                "contactPerson", "Ramesh Kumar",
                "phone", "9876543210",
                "location", "Chennai",
                "outcome", outcome == null ? "" : outcome);
    }

    private long createLeadFromVisit(String token, long visitId) throws Exception {
        MvcResult result = mockMvc.perform(post("/marketing/visits/" + visitId + "/lead")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("leadId").asLong();
    }

    private void promote(String email, UserRole role) {
        userRepository.findByEmail(email).ifPresent(user -> {
            user.setRole(role);
            userRepository.save(user);
        });
    }

    private String expectedVisitNo(long id) {
        return "VST-" + LocalDate.now().getYear() + "-" + String.format("%03d", id);
    }

    private String expectedLeadNo(long id) {
        return "L-" + LocalDate.now().getYear() + "-" + String.format("%03d", id);
    }

    // ============================== Auth ==============================

    @Test
    void marketingEndpointsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/marketing/visits"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/marketing/visits")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(visitBody("NoAuth Co", null))))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/marketing/summary"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/marketing/leads"))
                .andExpect(status().isUnauthorized());
    }

    // ============================== Create-time status ==============================

    @Test
    void newVisitDefaultsToPlannedAndPersistsQFormStatus() throws Exception {
        String token = register("mktstatus1@example.com", "Marketer Status1");

        // Defaults: visitStatus=Planned (system-controlled), qFormStatus=Not Prepared.
        long visitA = createVisit(token, visitBody("Status Co", null));
        mockMvc.perform(get("/marketing/visits/" + visitA)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.visitStatus").value("Planned"))
                .andExpect(jsonPath("$.data.qFormStatus").value("Not Prepared"));

        // A status sent with the creation request is ignored — status stays Planned.
        long visitB = createVisit(token, Map.of(
                "companyName", "Status Co B",
                "scheduleDate", "2026-08-20",
                "appointmentStatus", "Fixed",
                "location", "Chennai",
                "visitStatus", "Completed"));
        mockMvc.perform(get("/marketing/visits/" + visitB)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.visitStatus").value("Planned"))
                .andExpect(jsonPath("$.data.qFormStatus").value("Not Prepared"));

        // The selected Q Form status from the New Visit form is persisted.
        long visitC = createVisit(token, Map.of(
                "companyName", "Status Co C",
                "scheduleDate", "2026-08-20",
                "appointmentStatus", "Fixed",
                "location", "Chennai",
                "qFormStatus", "Filled & Submitted"));
        mockMvc.perform(get("/marketing/visits/" + visitC)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.visitStatus").value("Planned"))
                .andExpect(jsonPath("$.data.qFormStatus").value("Filled & Submitted"));
    }

    @Test
    void invalidQFormStatusIsRejectedOnCreate() throws Exception {
        String token = register("mktstatus2@example.com", "Marketer Status2");
        mockMvc.perform(post("/marketing/visits")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "companyName", "Bad Status Co",
                                "scheduleDate", "2026-08-20",
                                "appointmentStatus", "Fixed",
                                "qFormStatus", "Made Up Status"))))
                .andExpect(status().isBadRequest());
    }

    // ============================== Ownership ==============================

    @Test
    void marketerSeesOnlyOwnVisits() throws Exception {
        String tokenA = register("mkta1@example.com", "Marketer A");
        String tokenB = register("mkta2@example.com", "Marketer B");

        long visitA = createVisit(tokenA, visitBody("ABC Cement", null));

        // Marketer B cannot read A's visit directly (403).
        mockMvc.perform(get("/marketing/visits/" + visitA)
                        .header("Authorization", "Bearer " + tokenB))
                .andExpect(status().isForbidden());

        // Marketer B's list does not contain A's visit.
        MvcResult listB = mockMvc.perform(get("/marketing/visits")
                        .param("size", "100")
                        .header("Authorization", "Bearer " + tokenB))
                .andReturn();
        JsonNode content = objectMapper.readTree(listB.getResponse().getContentAsString())
                .path("content");
        for (JsonNode row : content) {
            assertThat(row.path("id").asLong()).isNotEqualTo(visitA);
        }

        // Marketer A sees their own visit with the VST-YYYY-NNN number.
        mockMvc.perform(get("/marketing/visits/" + visitA)
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.visitNo").value(expectedVisitNo(visitA)))
                .andExpect(jsonPath("$.data.marketer").value("Marketer A"));
    }

    @Test
    void marketerCannotModifyAnotherUsersVisit() throws Exception {
        String tokenA = register("mkta3@example.com", "Marketer A3");
        String tokenB = register("mkta4@example.com", "Marketer B4");
        long visitA = createVisit(tokenA, visitBody("Beta Forge", null));

        mockMvc.perform(patch("/marketing/visits/" + visitA + "/status")
                        .header("Authorization", "Bearer " + tokenB)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("visitStatus", "Completed"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void managerAndAdminSeeAllVisits() throws Exception {
        String tokenA = register("mkta5@example.com", "Marketer A5");
        long visitA = createVisit(tokenA, visitBody("Gamma Mills", null));

        String adminToken = login("admin@vishaktech.com", "Admin@123");
        String managerEmail = "mktmgr1@example.com";
        register(managerEmail, "Manager One");
        promote(managerEmail, UserRole.MANAGER);
        String managerToken = login(managerEmail, "password123");

        mockMvc.perform(get("/marketing/visits/" + visitA)
                        .header("Authorization", "Bearer " + managerToken))
                .andExpect(status().isOk());
        mockMvc.perform(get("/marketing/visits/" + visitA)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.companyName").value("Gamma Mills"));
    }

    @Test
    void marketerSeesOnlyOwnLeads() throws Exception {
        String tokenA = register("mkta14@example.com", "Marketer A14");
        String tokenB = register("mkta15@example.com", "Marketer B15");

        MvcResult created = mockMvc.perform(post("/marketing/leads")
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "companyName", "Private Corp",
                                "contactPerson", "Ramesh"))))
                .andExpect(status().isCreated())
                .andReturn();
        long leadId = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        mockMvc.perform(get("/marketing/leads/" + leadId)
                        .header("Authorization", "Bearer " + tokenB))
                .andExpect(status().isForbidden());
    }

    // ============================== Validation ==============================

    @Test
    void createVisitRequiresCompanyCustomerOrLead() throws Exception {
        String token = register("mkta6@example.com", "Marketer A6");
        mockMvc.perform(post("/marketing/visits")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "scheduleDate", "2026-08-20"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void invalidStatusValuesAreRejected() throws Exception {
        String token = register("mkta7@example.com", "Marketer A7");
        mockMvc.perform(post("/marketing/visits")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "companyName", "Delta Steel",
                                "appointmentStatus", "Bogus"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void noLeadOutcomeRequiresReason() throws Exception {
        String token = register("mkta8@example.com", "Marketer A8");
        mockMvc.perform(post("/marketing/visits")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "companyName", "Epsilon Chem",
                                "outcome", "No Lead"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void exitBeforeEntryIsRejected() throws Exception {
        String token = register("mkta16@example.com", "Marketer A16");
        long visit = createVisit(token, visitBody("Omega Motors", null));

        mockMvc.perform(patch("/marketing/visits/" + visit + "/exit")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(patch("/marketing/visits/" + visit + "/entry")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "meetingPerson", "Suresh"))))
                .andExpect(status().isOk());

        mockMvc.perform(patch("/marketing/visits/" + visit + "/exit")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.exitDateTime").isNotEmpty());
    }

    @Test
    void completionRequiresEntryAndExit() throws Exception {
        String token = register("mkta17@example.com", "Marketer A17");
        long visit = createVisit(token, visitBody("Sigma Tools", null));

        mockMvc.perform(patch("/marketing/visits/" + visit + "/status")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("visitStatus", "Completed"))))
                .andExpect(status().isBadRequest());

        mockMvc.perform(patch("/marketing/visits/" + visit + "/entry")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());

        mockMvc.perform(patch("/marketing/visits/" + visit + "/status")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("visitStatus", "Completed"))))
                .andExpect(status().isBadRequest());

        mockMvc.perform(patch("/marketing/visits/" + visit + "/exit")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());

        mockMvc.perform(patch("/marketing/visits/" + visit + "/status")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("visitStatus", "Completed"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.visitStatus").value("Completed"));
    }

    // ============================== Search / autocomplete ==============================

    @Test
    void searchReturnsMatchingVisitsAndLeads() throws Exception {
        String token = register("mktsearch1@example.com", "Search Marketer");
        long visit = createVisit(token, Map.of(
                "companyName", "Search Co Alpha",
                "scheduleDate", "2026-08-20",
                "appointmentStatus", "Fixed",
                "contactPerson", "Search Contact",
                "phone", "9876550001",
                "location", "Hyderabad"));
        MvcResult leadResult = mockMvc.perform(post("/marketing/leads")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("companyName", "Search Lead Co"))))
                .andExpect(status().isCreated())
                .andReturn();
        long leadId = objectMapper.readTree(leadResult.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        // By company → the visit.
        mockMvc.perform(get("/marketing/search").param("q", "Search Co")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].type").value("visit"))
                .andExpect(jsonPath("$.data[0].id").value(visit));
        // By company → the standalone lead.
        mockMvc.perform(get("/marketing/search").param("q", "Search Lead")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].type").value("lead"))
                .andExpect(jsonPath("$.data[0].id").value(leadId));
        // By phone.
        mockMvc.perform(get("/marketing/search").param("q", "9876550001")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value(visit));
        // By Visit ID (VST-YYYY-NNN).
        mockMvc.perform(get("/marketing/search").param("q", expectedVisitNo(visit))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value(visit));
        // By Lead Number (L-YYYY-NNN).
        mockMvc.perform(get("/marketing/search").param("q", expectedLeadNo(leadId))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value(leadId));
        // Empty / blank query → empty result.
        mockMvc.perform(get("/marketing/search").param("q", " ")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(0));
    }

    @Test
    void searchRequiresAuthAndRespectsOwnership() throws Exception {
        mockMvc.perform(get("/marketing/search").param("q", "x"))
                .andExpect(status().isUnauthorized());

        String tokenA = register("mktsearch2@example.com", "Search A");
        String tokenB = register("mktsearch3@example.com", "Search B");
        long visit = createVisit(tokenA, Map.of(
                "companyName", "Search Private Co",
                "scheduleDate", "2026-08-20",
                "appointmentStatus", "Fixed"));

        // Marketer B must not see A's record in autocomplete.
        mockMvc.perform(get("/marketing/search").param("q", "Search Private")
                        .header("Authorization", "Bearer " + tokenB))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(0));
        // Marketer A sees it.
        mockMvc.perform(get("/marketing/search").param("q", "Search Private")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value(visit));
    }

    // ============================== Performance ==============================

    @Test
    void performanceReflectsMarketingData() throws Exception {
        String token = register("mktperf1@example.com", "Perf Marketer");
        LocalDate today = LocalDate.now();

        // Visit A: today, Fixed, completed, Q Form submitted, linked qualified lead, 2 follow-ups.
        long visitA = createVisit(token, Map.of(
                "companyName", "Perf Co A",
                "scheduleDate", today.toString(),
                "appointmentStatus", "Fixed",
                "qFormStatus", "Filled & Submitted",
                "outcome", "Lead Generated"));
        mockMvc.perform(patch("/marketing/visits/" + visitA + "/entry")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk());
        mockMvc.perform(patch("/marketing/visits/" + visitA + "/exit")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk());
        mockMvc.perform(patch("/marketing/visits/" + visitA + "/status")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("visitStatus", "Completed"))))
                .andExpect(status().isOk());

        // Standalone qualified lead linked to A (snapshots stage + value onto the visit).
        MvcResult leadResult = mockMvc.perform(post("/marketing/leads")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "companyName", "Perf Co A",
                                "stage", "Qualified",
                                "estimatedValue", 100000))))
                .andExpect(status().isCreated())
                .andReturn();
        long leadA = objectMapper.readTree(leadResult.getResponse().getContentAsString())
                .path("data").path("id").asLong();
        mockMvc.perform(post("/marketing/visits/" + visitA + "/link-lead")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("leadId", leadA))))
                .andExpect(status().isOk());

        mockMvc.perform(post("/marketing/visits/" + visitA + "/followups")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "followupDate", today.toString(),
                                "status", "Completed",
                                "mode", "Phone Call"))))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/marketing/visits/" + visitA + "/followups")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "followupDate", today.plusDays(3).toString(),
                                "status", "Pending",
                                "mode", "WhatsApp"))))
                .andExpect(status().isCreated());

        // Visit B: upcoming (planned) direct visit, Q Form not prepared, no lead.
        createVisit(token, Map.of(
                "companyName", "Perf Co B",
                "scheduleDate", today.plusDays(2).toString(),
                "appointmentStatus", "Direct Visit"));

        // Visit C: old, cancelled.
        long visitC = createVisit(token, Map.of(
                "companyName", "Perf Co C",
                "scheduleDate", today.minusDays(30).toString(),
                "appointmentStatus", "Fixed"));
        mockMvc.perform(patch("/marketing/visits/" + visitC + "/status")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("visitStatus", "Cancelled"))))
                .andExpect(status().isOk());

        // Scoped to this test's marketer so counts are exact (other tests share the DB).
        mockMvc.perform(get("/marketing/performance")
                        .param("marketer", "Perf Marketer")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                // Visit performance
                .andExpect(jsonPath("$.data.totalVisits").value(3))
                .andExpect(jsonPath("$.data.todayVisits").value(1))
                .andExpect(jsonPath("$.data.upcomingVisits").value(1))
                .andExpect(jsonPath("$.data.pendingVisits").value(1))
                .andExpect(jsonPath("$.data.completedVisits").value(1))
                .andExpect(jsonPath("$.data.cancelledVisits").value(1))
                .andExpect(jsonPath("$.data.directVisits").value(1))
                .andExpect(jsonPath("$.data.fixedAppointments").value(1))
                // Q Form performance
                .andExpect(jsonPath("$.data.qformsNotPrepared").value(2))
                .andExpect(jsonPath("$.data.qformsSubmitted").value(1))
                .andExpect(jsonPath("$.data.qformCompletionPct").value(33))
                // Lead performance
                .andExpect(jsonPath("$.data.leadsGenerated").value(1))
                .andExpect(jsonPath("$.data.qualifiedLeads").value(1))
                .andExpect(jsonPath("$.data.leadsOnFollowup").value(1))
                .andExpect(jsonPath("$.data.lostLeads").value(0))
                .andExpect(jsonPath("$.data.estimatedPipelineValue").value(100000))
                // Follow-up performance
                .andExpect(jsonPath("$.data.totalFollowups").value(2))
                .andExpect(jsonPath("$.data.completedFollowups").value(1))
                .andExpect(jsonPath("$.data.pendingFollowups").value(1))
                .andExpect(jsonPath("$.data.overdueFollowups").value(0))
                .andExpect(jsonPath("$.data.followupCompletionPct").value(50))
                // Outcome performance
                .andExpect(jsonPath("$.data.outcomes['Lead Generated']").value(1))
                // Marketer performance
                .andExpect(jsonPath("$.data.marketers[0].marketer").value("Perf Marketer"))
                .andExpect(jsonPath("$.data.marketers[0].totalVisits").value(3))
                .andExpect(jsonPath("$.data.marketers[0].completedVisits").value(1))
                .andExpect(jsonPath("$.data.marketers[0].qformsSubmitted").value(1))
                .andExpect(jsonPath("$.data.marketers[0].leadsGenerated").value(1))
                .andExpect(jsonPath("$.data.marketers[0].followups").value(2));
    }

    @Test
    void performanceRespectsDateRangeAndMarketerFilter() throws Exception {
        LocalDate today = LocalDate.now();
        String tokenA = register("mktperf2@example.com", "Perf Alpha");
        String tokenB = register("mktperf3@example.com", "Perf Beta");

        // Alpha: visit + follow-up today.
        long visitA = createVisit(tokenA, Map.of(
                "companyName", "Perf Alpha Co",
                "scheduleDate", today.toString(),
                "appointmentStatus", "Fixed"));
        mockMvc.perform(post("/marketing/visits/" + visitA + "/followups")
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "followupDate", today.toString(),
                                "status", "Completed",
                                "mode", "Phone"))))
                .andExpect(status().isCreated());

        // Beta: visit outside the range.
        createVisit(tokenB, Map.of(
                "companyName", "Perf Beta Co",
                "scheduleDate", today.minusDays(45).toString(),
                "appointmentStatus", "Fixed"));

        // Date range = today only, scoped to Alpha → only Alpha's data.
        mockMvc.perform(get("/marketing/performance")
                        .param("dateFrom", today.toString())
                        .param("dateTo", today.toString())
                        .param("marketer", "Perf Alpha")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalVisits").value(1))
                .andExpect(jsonPath("$.data.totalFollowups").value(1))
                .andExpect(jsonPath("$.data.marketers.length()").value(1))
                .andExpect(jsonPath("$.data.marketers[0].marketer").value("Perf Alpha"));

        // Marketer filter → only Beta's (all-time) data.
        mockMvc.perform(get("/marketing/performance")
                        .param("marketer", "Perf Beta")
                        .header("Authorization", "Bearer " + tokenB))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalVisits").value(1))
                .andExpect(jsonPath("$.data.totalFollowups").value(0))
                .andExpect(jsonPath("$.data.marketers.length()").value(1))
                .andExpect(jsonPath("$.data.marketers[0].marketer").value("Perf Beta"));
    }

    // ============================== Follow-up history ==============================

    @Test
    void followUpHistoryIsPreserved() throws Exception {
        String token = register("mkta9@example.com", "Marketer A9");
        long visit = createVisit(token, visitBody("Zeta Textiles", null));

        mockMvc.perform(post("/marketing/visits/" + visit + "/followups")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "followupDate", "2026-08-21", "mode", "Phone",
                                "status", "Completed", "nextAction", "Send quotation"))))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/marketing/visits/" + visit + "/followups")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "followupDate", "2026-08-25", "mode", "Visit",
                                "status", "Pending", "nextAction", "Negotiation discussion"))))
                .andExpect(status().isCreated());

        MvcResult detail = mockMvc.perform(get("/marketing/visits/" + visit)
                        .header("Authorization", "Bearer " + token))
                .andReturn();
        JsonNode history = objectMapper.readTree(detail.getResponse().getContentAsString())
                .path("data").path("followUpHistory");
        assertThat(history.size()).isEqualTo(2);
        assertThat(history.get(0).path("mode").asText()).isEqualTo("Visit");
        assertThat(history.get(1).path("mode").asText()).isEqualTo("Phone");
        assertThat(history.get(0).path("status").asText()).isEqualTo("Pending");
        assertThat(history.get(1).path("status").asText()).isEqualTo("Completed");
    }

    // ============================== Standalone leads ==============================

    @Test
    void createLeadFromVisitIsStandaloneMarketingRecord() throws Exception {
        String token = register("mkta10@example.com", "Marketer A10");
        long visit = createVisit(token, visitBody("Eta Polymers", null));

        MvcResult leadResult = mockMvc.perform(post("/marketing/visits/" + visit + "/lead")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "estimatedValue", 500000, "priority", "High"))))
                .andReturn();
        assertThat(leadResult.getResponse().getStatus()).isEqualTo(201);
        long leadId = objectMapper.readTree(leadResult.getResponse().getContentAsString())
                .path("data").path("leadId").asLong();
        assertThat(leadId).isPositive();

        // The visit now carries the linked-lead snapshot (drawer contract).
        mockMvc.perform(get("/marketing/visits/" + visit)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.leadId").value(leadId))
                .andExpect(jsonPath("$.data.leadNo").value(expectedLeadNo(leadId)))
                .andExpect(jsonPath("$.data.leadStage").value("New"))
                .andExpect(jsonPath("$.data.leadStatus").value("Active"));

        // The standalone marketing lead exists with source forced to Offline Marketing.
        mockMvc.perform(get("/marketing/leads/" + leadId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.source").value("Offline Marketing"))
                .andExpect(jsonPath("$.data.companyName").value("Eta Polymers"))
                .andExpect(jsonPath("$.data.estimatedValue").value(500000));
    }

    @Test
    void standaloneLeadCrud() throws Exception {
        String token = register("mkta18@example.com", "Marketer A18");

        MvcResult created = mockMvc.perform(post("/marketing/leads")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "companyName", "Nu Steel",
                                "contactPerson", "Karthik",
                                "phone", "9988776655",
                                "estimatedValue", 250000,
                                "priority", "Medium"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.source").value("Offline Marketing"))
                .andExpect(jsonPath("$.data.leadNo").isNotEmpty())
                .andReturn();
        long leadId = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        mockMvc.perform(put("/marketing/leads/" + leadId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "companyName", "Nu Steel",
                                "stage", "Qualified"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.stage").value("Qualified"));

        mockMvc.perform(get("/marketing/leads/" + leadId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.stage").value("Qualified"));
    }

    @Test
    void leadHistoryEndpoints() throws Exception {
        String token = register("mkta19@example.com", "Marketer A19");
        long visit1 = createVisit(token, visitBody("Kappa Papers", null));
        long leadId = createLeadFromVisit(token, visit1);

        // Lead-level visit history includes the originating visit.
        MvcResult visits = mockMvc.perform(get("/marketing/leads/" + leadId + "/visits")
                        .header("Authorization", "Bearer " + token))
                .andReturn();
        JsonNode visitRows = objectMapper.readTree(visits.getResponse().getContentAsString()).path("data");
        assertThat(visitRows.size()).isEqualTo(1);
        assertThat(visitRows.get(0).path("id").asLong()).isEqualTo(visit1);

        // A second visit to the same lead keeps both records (never overwrites).
        long visit2 = createVisit(token, visitBody("Kappa Papers", null));
        mockMvc.perform(post("/marketing/visits/" + visit2 + "/link-lead")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("leadId", leadId))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.leadNo").value(expectedLeadNo(leadId)));

        MvcResult visits2 = mockMvc.perform(get("/marketing/leads/" + leadId + "/visits")
                        .header("Authorization", "Bearer " + token))
                .andReturn();
        JsonNode visitRows2 = objectMapper.readTree(visits2.getResponse().getContentAsString()).path("data");
        assertThat(visitRows2.size()).isEqualTo(2);

        // Follow-ups created at the visit level carry the lead link and appear
        // under the lead's follow-up history.
        mockMvc.perform(post("/marketing/visits/" + visit2 + "/followups")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "followupDate", "2026-08-26", "mode", "Phone",
                                "nextAction", "Send details"))))
                .andExpect(status().isCreated());

        MvcResult followUps = mockMvc.perform(get("/marketing/leads/" + leadId + "/follow-ups")
                        .header("Authorization", "Bearer " + token))
                .andReturn();
        JsonNode rows = objectMapper.readTree(followUps.getResponse().getContentAsString()).path("data");
        assertThat(rows.size()).isEqualTo(1);
        assertThat(rows.get(0).path("nextAction").asText()).isEqualTo("Send details");
        assertThat(rows.get(0).path("leadId").asLong()).isEqualTo(leadId);
    }

    @Test
    void standaloneFollowUpCompleteAndReschedule() throws Exception {
        String token = register("mkta20@example.com", "Marketer A20");
        long visit = createVisit(token, visitBody("Theta Tools", null));
        long leadId = createLeadFromVisit(token, visit);

        MvcResult created = mockMvc.perform(post("/marketing/follow-ups")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "leadId", leadId,
                                "followupDate", "2026-08-21",
                                "mode", "Phone Call",
                                "nextAction", "Customer confirmation"))))
                .andExpect(status().isCreated())
                .andReturn();
        long followUpId = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        mockMvc.perform(post("/marketing/follow-ups/" + followUpId + "/complete")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("Completed"));

        mockMvc.perform(post("/marketing/follow-ups/" + followUpId + "/reschedule")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "followupDate", "2026-08-28"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("Rescheduled"))
                .andExpect(jsonPath("$.data.followupDate").value("2026-08-28"));

        // History persists for the lead.
        MvcResult history = mockMvc.perform(get("/marketing/leads/" + leadId + "/follow-ups")
                        .header("Authorization", "Bearer " + token))
                .andReturn();
        JsonNode rows = objectMapper.readTree(history.getResponse().getContentAsString()).path("data");
        assertThat(rows.size()).isEqualTo(1);
        assertThat(rows.get(0).path("status").asText()).isEqualTo("Rescheduled");
    }

    @Test
    void standaloneFollowUpRequiresLeadOrVisit() throws Exception {
        String token = register("mkta21@example.com", "Marketer A21");
        mockMvc.perform(post("/marketing/follow-ups")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "followupDate", "2026-08-21"))))
                .andExpect(status().isBadRequest());
    }

    // ============================== Soft delete ==============================

    @Test
    void deleteVisitIsSoftAndHidesItFromLists() throws Exception {
        String token = register("mkta22@example.com", "Marketer A22");
        long visit = createVisit(token, visitBody("Iota Cement", null));

        mockMvc.perform(delete("/marketing/visits/" + visit)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        mockMvc.perform(get("/marketing/visits/" + visit)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());

        MvcResult list = mockMvc.perform(get("/marketing/visits")
                        .param("size", "100")
                        .header("Authorization", "Bearer " + token))
                .andReturn();
        JsonNode content = objectMapper.readTree(list.getResponse().getContentAsString())
                .path("content");
        for (JsonNode row : content) {
            assertThat(row.path("id").asLong()).isNotEqualTo(visit);
        }
    }

    @Test
    void handoverRequiresALinkedLead() throws Exception {
        String token = register("mkta11@example.com", "Marketer A11");
        long visit = createVisit(token, visitBody("Theta Tools", null));

        mockMvc.perform(post("/marketing/visits/" + visit + "/handover")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "handoverStatus", "Ready for Sales"))))
                .andExpect(status().isBadRequest());

        createLeadFromVisit(token, visit);

        mockMvc.perform(post("/marketing/visits/" + visit + "/handover")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "handoverStatus", "Ready for Sales",
                                "handoverRemarks", "Quotation requested"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.handoverStatus").value("Ready for Sales"))
                .andExpect(jsonPath("$.data.handoverTo").isNotEmpty());
    }

    @Test
    void entryExitAndCompletionFlow() throws Exception {
        String token = register("mkta12@example.com", "Marketer A12");
        long visit = createVisit(token, visitBody("Iota Cement", null));

        mockMvc.perform(patch("/marketing/visits/" + visit + "/entry")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "meetingPerson", "Suresh",
                                "meetingDesignation", "Purchase Manager"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.visitStatus").value("In Progress"))
                .andExpect(jsonPath("$.data.entryDateTime").isNotEmpty());

        mockMvc.perform(patch("/marketing/visits/" + visit + "/exit")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.exitDateTime").isNotEmpty());

        mockMvc.perform(patch("/marketing/visits/" + visit + "/status")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("visitStatus", "Completed"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.visitStatus").value("Completed"));
    }

    @Test
    void visitHistoryKeepsAllVisitsForTheSameLead() throws Exception {
        String token = register("mkta13@example.com", "Marketer A13");
        long visit1 = createVisit(token, visitBody("Kappa Papers", null));
        long leadId = createLeadFromVisit(token, visit1);

        // Second visit to the SAME lead gets its own record (never overwrites
        // the first) and links the existing standalone marketing lead.
        long visit2 = createVisit(token, visitBody("Kappa Papers", null));
        mockMvc.perform(post("/marketing/visits/" + visit2 + "/link-lead")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("leadId", leadId))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.leadNo").value(expectedLeadNo(leadId)));

        // Visit history for visit2 includes visit1 (both preserved).
        MvcResult result = mockMvc.perform(get("/marketing/visits/" + visit2 + "/history")
                        .header("Authorization", "Bearer " + token))
                .andReturn();
        JsonNode history = objectMapper.readTree(result.getResponse().getContentAsString()).path("data");
        assertThat(history.isArray()).isTrue();
        assertThat(history.size()).isEqualTo(1);
        assertThat(history.get(0).path("id").asLong()).isEqualTo(visit1);
    }

    // ============================== Travel Registry attachments ==============================

    /** Creates a draft Travel Registry for the caller and returns its id. */
    private long createTravelRegistry(String token) throws Exception {
        MvcResult result = mockMvc.perform(post("/marketing/travel-plans")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "startDate", "2026-08-20",
                                "startingLocation", "Erode",
                                "endingLocation", "Chennai",
                                "purpose", "Marketing Visit"))))
                .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("id").asLong();
    }

    private MockMultipartFile attachment(String name, String contentType, String body) {
        return new MockMultipartFile("file", name, contentType, body.getBytes(StandardCharsets.UTF_8));
    }

    private long uploadTravelAttachment(String token, long planId, MockMultipartFile file) throws Exception {
        MvcResult result = mockMvc.perform(multipart("/marketing/travel-plans/" + planId + "/attachments")
                        .file(file)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("id").asLong();
    }

    /**
     * A Travel Registry attachment is stored (bytes + row), listed back on a fresh
     * request and removable — the behaviour the registry UI depends on.
     */
    @Test
    void travelRegistryAttachmentIsStoredReloadedAndDeleted() throws Exception {
        String token = register("travelattach1@example.com", "Travel Attach One");
        long planId = createTravelRegistry(token);
        String body = "travel registry attachment bytes";

        mockMvc.perform(get("/marketing/travel-plans/" + planId + "/attachments")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(0));

        MvcResult upload = mockMvc.perform(multipart("/marketing/travel-plans/" + planId + "/attachments")
                        .file(attachment("site-photos.pdf", MediaType.APPLICATION_PDF_VALUE, body))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.name").value("site-photos.pdf"))
                .andExpect(jsonPath("$.data.contentType").value(MediaType.APPLICATION_PDF_VALUE))
                .andExpect(jsonPath("$.data.url").isNotEmpty())
                .andReturn();
        JsonNode uploaded = objectMapper.readTree(upload.getResponse().getContentAsString()).path("data");
        long attachmentId = uploaded.path("id").asLong();
        assertThat(uploaded.path("size").asLong())
                .isEqualTo(body.getBytes(StandardCharsets.UTF_8).length);

        // The bytes are really in the shared storage pool, served by the file endpoint.
        String url = uploaded.path("url").asText();
        String storedName = url.substring(url.lastIndexOf('/') + 1);
        mockMvc.perform(get("/files/" + storedName).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(content().string(body));

        // Re-read on a NEW request: the metadata is database-backed, not in-memory.
        mockMvc.perform(get("/marketing/travel-plans/" + planId + "/attachments")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(attachmentId))
                .andExpect(jsonPath("$[0].name").value("site-photos.pdf"));

        mockMvc.perform(delete("/marketing/travel-plans/" + planId + "/attachments/" + attachmentId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        mockMvc.perform(get("/marketing/travel-plans/" + planId + "/attachments")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    /** An attachment belongs to ONE registry and ONE marketer. */
    @Test
    void travelRegistryAttachmentIsScopedToItsRegistryAndMarketer() throws Exception {
        String tokenA = register("travelattach2@example.com", "Travel Attach Two");
        String tokenB = register("travelattach3@example.com", "Travel Attach Three");
        long planA = createTravelRegistry(tokenA);
        long planB = createTravelRegistry(tokenA);
        long attachmentId = uploadTravelAttachment(tokenA, planA,
                attachment("quotation.pdf", MediaType.APPLICATION_PDF_VALUE, "quoted"));

        // Another registry cannot take (or expose) this attachment id.
        mockMvc.perform(delete("/marketing/travel-plans/" + planB + "/attachments/" + attachmentId)
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isNotFound());

        // Another marketer can neither read, add to, nor delete registry A's files.
        mockMvc.perform(get("/marketing/travel-plans/" + planA + "/attachments")
                        .header("Authorization", "Bearer " + tokenB))
                .andExpect(status().isForbidden());
        mockMvc.perform(multipart("/marketing/travel-plans/" + planA + "/attachments")
                        .file(attachment("other.pdf", MediaType.APPLICATION_PDF_VALUE, "other"))
                        .header("Authorization", "Bearer " + tokenB))
                .andExpect(status().isForbidden());
        mockMvc.perform(delete("/marketing/travel-plans/" + planA + "/attachments/" + attachmentId)
                        .header("Authorization", "Bearer " + tokenB))
                .andExpect(status().isForbidden());

        // The refused calls changed nothing: the file is still there, only in A.
        mockMvc.perform(get("/marketing/travel-plans/" + planA + "/attachments")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(attachmentId));
    }

    /** Validation and authentication for the registry attachment endpoints. */
    @Test
    void travelRegistryAttachmentValidationAndAuthentication() throws Exception {
        String token = register("travelattach4@example.com", "Travel Attach Four");
        long planId = createTravelRegistry(token);

        // A type outside the ERP upload policy, and an empty file, are refused.
        mockMvc.perform(multipart("/marketing/travel-plans/" + planId + "/attachments")
                        .file(attachment("payload.exe", MediaType.APPLICATION_OCTET_STREAM_VALUE, "MZ"))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());
        mockMvc.perform(multipart("/marketing/travel-plans/" + planId + "/attachments")
                        .file(attachment("empty.pdf", MediaType.APPLICATION_PDF_VALUE, ""))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());

        // An unknown registry is a 404 — nothing is stored for it.
        mockMvc.perform(multipart("/marketing/travel-plans/999999999/attachments")
                        .file(attachment("ghost.pdf", MediaType.APPLICATION_PDF_VALUE, "ghost"))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());

        // Signed-out callers get no attachment access at all.
        mockMvc.perform(get("/marketing/travel-plans/" + planId + "/attachments"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(multipart("/marketing/travel-plans/" + planId + "/attachments")
                        .file(attachment("anon.pdf", MediaType.APPLICATION_PDF_VALUE, "anon")))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/marketing/travel-plans/" + planId + "/attachments/1"))
                .andExpect(status().isUnauthorized());
    }

    // ============================== Travel Scheduler ==============================

    /** Creates a schedule through the real API and returns its id. */
    private long createTravelSchedule(String token, java.util.Map<String, Object> body) throws Exception {
        MvcResult result = mockMvc.perform(post("/marketing/travel-schedules")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("id").asLong();
    }

    /** The schedule fields every valid create shares; callers override what they test. */
    private java.util.Map<String, Object> scheduleBody(long assignedUserId) {
        java.util.Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("scheduleTitle", "Coimbatore plant visit");
        body.put("assignedUserId", assignedUserId);
        body.put("purpose", "Plant Survey");
        body.put("priority", "High");
        body.put("startDate", "2026-11-02");
        body.put("startTime", "08:30");
        body.put("endDate", "2026-11-02");
        body.put("endTime", "18:00");
        body.put("startingLocation", "Erode");
        body.put("endingLocation", "Coimbatore");
        body.put("travelMode", "Car");
        body.put("contactPerson", "Ramesh Kumar");
        body.put("meetingDetails", "Discuss the new cement order");
        return body;
    }

    private long userIdOf(String email) {
        return userRepository.findByEmail(email).orElseThrow().getId();
    }

    /**
     * True when a field carries no value, whether the payload omits the node or emits an
     * explicit {@code null}. The test profile serialises nulls, production omits them.
     */
    private static boolean absentOrNull(JsonNode data, String field) {
        JsonNode node = data.path(field);
        return node.isMissingNode() || node.isNull();
    }

    @Test
    void travelScheduleCreationValidatesInputAndNeverSelfApproves() throws Exception {
        String requester = register("sched1@example.com", "Scheduler One");
        register("sched1emp@example.com", "Employee One");
        long employeeId = userIdOf("sched1emp@example.com");

        // The form's pickers are served by the module, so the employee list does not
        // depend on GET /users, which a non-settings marketing user cannot read.
        MvcResult options = mockMvc.perform(get("/marketing/travel-schedules/options")
                        .header("Authorization", "Bearer " + requester))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode optionData = objectMapper
                .readTree(options.getResponse().getContentAsString()).path("data");
        assertThat(optionData.path("purposes").size()).isGreaterThan(0);
        assertThat(optionData.path("priorities").size()).isGreaterThan(0);
        assertThat(optionData.path("travelModes").size()).isGreaterThan(0);
        boolean employeeListed = false;
        for (JsonNode employee : optionData.path("employees")) {
            if (employee.path("id").asLong() == employeeId) employeeListed = true;
        }
        assertThat(employeeListed).isTrue();

        // Signed out: no access to the scheduler at all.
        mockMvc.perform(get("/marketing/travel-schedules")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/marketing/travel-schedules/options")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/marketing/travel-schedules")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(scheduleBody(employeeId))))
                .andExpect(status().isUnauthorized());

        // Required fields, employee reference, closed enums and time order.
        assertThat(createStatus(requester, without(scheduleBody(employeeId), "scheduleTitle"))).isEqualTo(400);
        assertThat(createStatus(requester, without(scheduleBody(employeeId), "assignedUserId"))).isEqualTo(400);
        assertThat(createStatus(requester, without(scheduleBody(employeeId), "purpose"))).isEqualTo(400);
        assertThat(createStatus(requester, without(scheduleBody(employeeId), "startingLocation"))).isEqualTo(400);
        assertThat(createStatus(requester, without(scheduleBody(employeeId), "endingLocation"))).isEqualTo(400);
        assertThat(createStatus(requester, without(scheduleBody(employeeId), "startDate"))).isEqualTo(400);
        assertThat(createStatus(requester, without(scheduleBody(employeeId), "startTime"))).isEqualTo(400);
        assertThat(createStatus(requester, with(scheduleBody(employeeId), "assignedUserId", 999999999L)))
                .isEqualTo(400);
        assertThat(createStatus(requester, with(scheduleBody(employeeId), "travelMode", "Teleport")))
                .isEqualTo(400);
        assertThat(createStatus(requester, with(scheduleBody(employeeId), "priority", "Whenever")))
                .isEqualTo(400);
        assertThat(createStatus(requester, with(scheduleBody(employeeId), "startTime", "8:30 am")))
                .isEqualTo(400);
        java.util.Map<String, Object> backwards = with(scheduleBody(employeeId), "endDate", "2026-11-01");
        assertThat(createStatus(requester, backwards)).isEqualTo(400);
        java.util.Map<String, Object> sameDayTooEarly = with(scheduleBody(employeeId), "endTime", "07:00");
        assertThat(createStatus(requester, sameDayTooEarly)).isEqualTo(400);

        // A purpose outside the module's own option list is accepted and stored
        // as typed: the column is free text, which is what lets the New Schedule
        // form take a purpose the list does not carry instead of refusing it.
        long customPurpose = createTravelSchedule(requester,
                with(scheduleBody(employeeId), "purpose", "Vendor audit"));
        mockMvc.perform(get("/marketing/travel-schedules/" + customPurpose)
                        .header("Authorization", "Bearer " + requester))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.purpose").value("Vendor audit"));

        // A valid schedule is created as Draft, numbered, and stamped server-side.
        MvcResult created = mockMvc.perform(post("/marketing/travel-schedules")
                        .header("Authorization", "Bearer " + requester)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(scheduleBody(employeeId))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("Draft"))
                .andExpect(jsonPath("$.data.assignedTo").value("Employee One"))
                .andExpect(jsonPath("$.data.travelDate").value("2026-11-02"))
                .andExpect(jsonPath("$.data.requestedBy").value("Scheduler One"))
                .andReturn();
        JsonNode createdData = objectMapper.readTree(created.getResponse().getContentAsString()).path("data");
        assertThat(createdData.path("scheduleNo").asText())
                .matches("TS-\\d{4}-" + String.format("%04d", createdData.path("id").asLong()));
        // Never self-approved: no approver or approval decision is stamped on create.
        assertThat(absentOrNull(createdData, "approvedBy")).isTrue();
        assertThat(absentOrNull(createdData, "approvalStatus")).isTrue();
        // The employee relationship points at the real user row from the master.
        assertThat(createdData.path("assignedUserId").asLong()).isEqualTo(employeeId);
    }

    @Test
    void travelScheduleStatusChangesOnlyThroughTheWorkflowEndpoints() throws Exception {
        String requester = register("sched2@example.com", "Scheduler Two");
        register("sched2emp@example.com", "Employee Two");
        long employeeId = userIdOf("sched2emp@example.com");

        // A client cannot create a pre-approved schedule, nor inject a status.
        long scheduleId = createTravelSchedule(requester, with(
                with(scheduleBody(employeeId), "status", "Approved"), "approvalStatus", "Approved"));
        MvcResult draftResult = mockMvc.perform(get("/marketing/travel-schedules/" + scheduleId)
                        .header("Authorization", "Bearer " + requester))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("Draft"))
                .andReturn();
        JsonNode draftData = objectMapper
                .readTree(draftResult.getResponse().getContentAsString()).path("data");
        assertThat(absentOrNull(draftData, "approvalStatus")).isTrue();

        // Editing a draft works and persists.
        mockMvc.perform(put("/marketing/travel-schedules/" + scheduleId)
                        .header("Authorization", "Bearer " + requester)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of(
                                "scheduleTitle", "Coimbatore plant visit (revised)",
                                "priority", "Urgent"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.scheduleTitle").value("Coimbatore plant visit (revised)"))
                .andExpect(jsonPath("$.data.priority").value("Urgent"));

        // An update can never clear a required field.
        mockMvc.perform(put("/marketing/travel-schedules/" + scheduleId)
                        .header("Authorization", "Bearer " + requester)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"scheduleTitle\":\"  \"}"))
                .andExpect(status().isBadRequest());

        // Approval is only reachable from Submitted.
        mockMvc.perform(post("/marketing/travel-schedules/" + scheduleId + "/approve")
                        .header("Authorization", "Bearer " + requester))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/marketing/travel-schedules/" + scheduleId + "/submit")
                        .header("Authorization", "Bearer " + requester))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("Submitted"))
                .andExpect(jsonPath("$.data.approvalStatus").value("Pending"));

        // Rejection and revision need their remark.
        mockMvc.perform(post("/marketing/travel-schedules/" + scheduleId + "/reject")
                        .header("Authorization", "Bearer " + requester)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/marketing/travel-schedules/" + scheduleId + "/revision")
                        .header("Authorization", "Bearer " + requester)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of(
                                "revisionComments", "Move the visit to the morning"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("Revision Required"))
                .andExpect(jsonPath("$.data.revisionComments").value("Move the visit to the morning"));

        // Revision → submitted → approved → completed, then it is closed for changes.
        mockMvc.perform(post("/marketing/travel-schedules/" + scheduleId + "/submit")
                        .header("Authorization", "Bearer " + requester))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("Submitted"));
        mockMvc.perform(post("/marketing/travel-schedules/" + scheduleId + "/approve")
                        .header("Authorization", "Bearer " + requester))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("Approved"))
                .andExpect(jsonPath("$.data.approvedBy").value("Scheduler Two"))
                .andExpect(jsonPath("$.data.approvedAt").isNotEmpty());
        mockMvc.perform(post("/marketing/travel-schedules/" + scheduleId + "/approve")
                        .header("Authorization", "Bearer " + requester))
                .andExpect(status().isBadRequest());
        mockMvc.perform(put("/marketing/travel-schedules/" + scheduleId)
                        .header("Authorization", "Bearer " + requester)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of("remarks", "late change"))))
                .andExpect(status().isBadRequest());
        mockMvc.perform(delete("/marketing/travel-schedules/" + scheduleId)
                        .header("Authorization", "Bearer " + requester))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/marketing/travel-schedules/" + scheduleId + "/complete")
                        .header("Authorization", "Bearer " + requester))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("Completed"));
        mockMvc.perform(post("/marketing/travel-schedules/" + scheduleId + "/cancel")
                        .header("Authorization", "Bearer " + requester)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of("reason", "too late"))))
                .andExpect(status().isBadRequest());

        // A separate schedule: cancel needs a reason and closes the record.
        long cancellable = createTravelSchedule(requester, scheduleBody(employeeId));
        mockMvc.perform(post("/marketing/travel-schedules/" + cancellable + "/cancel")
                        .header("Authorization", "Bearer " + requester)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/marketing/travel-schedules/" + cancellable + "/cancel")
                        .header("Authorization", "Bearer " + requester)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of("reason", "Plant rescheduled"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("Cancelled"))
                .andExpect(jsonPath("$.data.cancellationReason").value("Plant rescheduled"))
                .andExpect(jsonPath("$.data.cancelledBy").value("Scheduler Two"));
    }

    @Test
    void travelSchedulesAreListedFilteredAndScopedToTheCaller() throws Exception {
        String requester = register("sched3@example.com", "Scheduler Three");
        String outsider = register("sched3out@example.com", "Outsider Three");
        register("sched3emp@example.com", "Employee Three");
        long employeeId = userIdOf("sched3emp@example.com");

        long scheduleId = createTravelSchedule(requester, with(scheduleBody(employeeId),
                "scheduleTitle", "Salem depot review"));

        // The list endpoint returns the persisted record with its filters applied.
        mockMvc.perform(get("/marketing/travel-schedules")
                        .param("search", "Salem")
                        .param("status", "Draft")
                        .param("assignedUserId", String.valueOf(employeeId))
                        .param("dateFrom", "2026-11-01")
                        .param("dateTo", "2026-11-30")
                        .header("Authorization", "Bearer " + requester))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(scheduleId))
                .andExpect(jsonPath("$.content[0].scheduleTitle").value("Salem depot review"))
                .andExpect(jsonPath("$.content[0].assignedTo").value("Employee Three"))
                .andExpect(jsonPath("$.content[0].destination").value("Coimbatore"));

        // The destination filter is a partial, case-insensitive match on the route.
        mockMvc.perform(get("/marketing/travel-schedules")
                        .param("destination", "coimba")
                        .header("Authorization", "Bearer " + requester))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(scheduleId));

        // A filter that cannot match returns an empty page, not another user's row.
        mockMvc.perform(get("/marketing/travel-schedules")
                        .param("status", "Approved")
                        .header("Authorization", "Bearer " + requester))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(0));
        mockMvc.perform(get("/marketing/travel-schedules")
                        .param("destination", "Nowhere")
                        .header("Authorization", "Bearer " + requester))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(0));

        // The assigned employee sees it; an unrelated marketer does not.
        mockMvc.perform(get("/marketing/travel-schedules/" + scheduleId)
                        .header("Authorization", "Bearer " + login("sched3emp@example.com", "password123")))
                .andExpect(status().isOk());
        mockMvc.perform(get("/marketing/travel-schedules/" + scheduleId)
                        .header("Authorization", "Bearer " + outsider))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/marketing/travel-schedules")
                        .header("Authorization", "Bearer " + outsider))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(0));
        mockMvc.perform(delete("/marketing/travel-schedules/" + scheduleId)
                        .header("Authorization", "Bearer " + outsider))
                .andExpect(status().isForbidden());

        // A manager sees every schedule.
        promote("sched3out@example.com", UserRole.MANAGER);
        mockMvc.perform(get("/marketing/travel-schedules/" + scheduleId)
                        .header("Authorization", "Bearer " + outsider))
                .andExpect(status().isOk());

        // Unknown records are a clean 404, not an empty body.
        mockMvc.perform(get("/marketing/travel-schedules/999999999")
                        .header("Authorization", "Bearer " + requester))
                .andExpect(status().isNotFound());
    }

    @Test
    void travelScheduleAttachmentsAreStoredOnTheSchedule() throws Exception {
        String requester = register("sched4@example.com", "Scheduler Four");
        register("sched4emp@example.com", "Employee Four");
        long employeeId = userIdOf("sched4emp@example.com");
        long scheduleId = createTravelSchedule(requester, scheduleBody(employeeId));
        long otherScheduleId = createTravelSchedule(requester, scheduleBody(employeeId));
        String body = "ticket and itinerary";

        mockMvc.perform(get("/marketing/travel-schedules/" + scheduleId + "/attachments")
                        .header("Authorization", "Bearer " + requester))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        MvcResult upload = mockMvc.perform(multipart("/marketing/travel-schedules/" + scheduleId + "/attachments")
                        .file(attachment("ticket.pdf", MediaType.APPLICATION_PDF_VALUE, body))
                        .header("Authorization", "Bearer " + requester))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.name").value("ticket.pdf"))
                .andReturn();
        long attachmentId = objectMapper.readTree(upload.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        // Persisted on the schedule and still there on a fresh request.
        mockMvc.perform(get("/marketing/travel-schedules/" + scheduleId + "/attachments")
                        .header("Authorization", "Bearer " + requester))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(attachmentId));

        // It belongs to that schedule only.
        mockMvc.perform(delete("/marketing/travel-schedules/" + otherScheduleId + "/attachments/" + attachmentId)
                        .header("Authorization", "Bearer " + requester))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete("/marketing/travel-schedules/" + scheduleId + "/attachments/" + attachmentId)
                        .header("Authorization", "Bearer " + requester))
                .andExpect(status().isOk());
        mockMvc.perform(get("/marketing/travel-schedules/" + scheduleId + "/attachments")
                        .header("Authorization", "Bearer " + requester))
                .andExpect(jsonPath("$.length()").value(0));
    }

    /**
     * Travel Scheduler and Travel Registry records are private. The owner drives
     * its own record through the whole workflow, but another ordinary user can
     * neither read, edit, delete, approve, reject, request a revision on, nor
     * attach a file to a record it does not own — not by id, and not through the
     * aggregates those records feed (registry summary, calendar, map). An
     * ADMIN/MANAGER still reaches every record.
     */
    @Test
    void travelRecordsAreUnreachableByAnotherUser() throws Exception {
        String owner = register("travelown5@example.com", "Travel Owner Five");
        String outsider = register("travelout5@example.com", "Travel Outsider Five");
        register("travelown5emp@example.com", "Travel Employee Five");
        long employeeId = userIdOf("travelown5emp@example.com");

        long scheduleId = createTravelSchedule(owner, scheduleBody(employeeId));
        long planId = createTravelRegistry(owner);

        // Both records are SUBMITTED, so each refusal below is the ownership rule
        // talking, not a state error that would also stop the owner.
        mockMvc.perform(post("/marketing/travel-schedules/" + scheduleId + "/submit")
                        .header("Authorization", "Bearer " + owner))
                .andExpect(status().isOk());
        mockMvc.perform(post("/marketing/travel-plans/" + planId + "/submit")
                        .header("Authorization", "Bearer " + owner))
                .andExpect(status().isOk());

        // Reading another user's record by id
        mockMvc.perform(get("/marketing/travel-schedules/" + scheduleId)
                        .header("Authorization", "Bearer " + outsider))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/marketing/travel-plans/" + planId)
                        .header("Authorization", "Bearer " + outsider))
                .andExpect(status().isForbidden());

        // Driving another user's schedule workflow, editing or deleting it
        for (String action : java.util.List.of("approve", "complete")) {
            mockMvc.perform(post("/marketing/travel-schedules/" + scheduleId + "/" + action)
                            .header("Authorization", "Bearer " + outsider))
                    .andExpect(status().isForbidden());
        }
        mockMvc.perform(post("/marketing/travel-schedules/" + scheduleId + "/reject")
                        .header("Authorization", "Bearer " + outsider)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("rejectionReason", "not mine"))))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/marketing/travel-schedules/" + scheduleId + "/revision")
                        .header("Authorization", "Bearer " + outsider)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("revisionComments", "not mine"))))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/marketing/travel-schedules/" + scheduleId + "/cancel")
                        .header("Authorization", "Bearer " + outsider)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("reason", "not mine"))))
                .andExpect(status().isForbidden());
        mockMvc.perform(put("/marketing/travel-schedules/" + scheduleId)
                        .header("Authorization", "Bearer " + outsider)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("remarks", "hijacked"))))
                .andExpect(status().isForbidden());
        mockMvc.perform(delete("/marketing/travel-schedules/" + scheduleId)
                        .header("Authorization", "Bearer " + outsider))
                .andExpect(status().isForbidden());

        // Driving another user's registry workflow, editing it, or touching its route
        for (String action : java.util.List.of("approve", "start", "end", "recalculate")) {
            mockMvc.perform(post("/marketing/travel-plans/" + planId + "/" + action)
                            .header("Authorization", "Bearer " + outsider))
                    .andExpect(status().isForbidden());
        }
        mockMvc.perform(post("/marketing/travel-plans/" + planId + "/reject")
                        .header("Authorization", "Bearer " + outsider)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("rejectionReason", "not mine"))))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/marketing/travel-plans/" + planId + "/revision")
                        .header("Authorization", "Bearer " + outsider)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("revisionComments", "not mine"))))
                .andExpect(status().isForbidden());
        mockMvc.perform(put("/marketing/travel-plans/" + planId)
                        .header("Authorization", "Bearer " + outsider)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("purpose", "hijacked"))))
                .andExpect(status().isForbidden());
        mockMvc.perform(put("/marketing/travel-plans/" + planId + "/draft")
                        .header("Authorization", "Bearer " + outsider)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("purpose", "hijacked"))))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/marketing/travel-plans/" + planId + "/stops")
                        .header("Authorization", "Bearer " + outsider)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "companyName", "Intruder Plant", "plannedDate", "2026-08-21"))))
                .andExpect(status().isForbidden());
        mockMvc.perform(delete("/marketing/travel-plans/" + planId)
                        .header("Authorization", "Bearer " + outsider))
                .andExpect(status().isForbidden());

        // Attachments of another user's record — read, upload and delete
        mockMvc.perform(get("/marketing/travel-plans/" + planId + "/attachments")
                        .header("Authorization", "Bearer " + outsider))
                .andExpect(status().isForbidden());
        mockMvc.perform(multipart("/marketing/travel-plans/" + planId + "/attachments")
                        .file(attachment("intrusion.pdf", MediaType.APPLICATION_PDF_VALUE, "intrusion"))
                        .header("Authorization", "Bearer " + outsider))
                .andExpect(status().isForbidden());
        mockMvc.perform(delete("/marketing/travel-plans/" + planId + "/attachments/1")
                        .header("Authorization", "Bearer " + outsider))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/marketing/travel-schedules/" + scheduleId + "/attachments")
                        .header("Authorization", "Bearer " + outsider))
                .andExpect(status().isForbidden());
        mockMvc.perform(multipart("/marketing/travel-schedules/" + scheduleId + "/attachments")
                        .file(attachment("intrusion.pdf", MediaType.APPLICATION_PDF_VALUE, "intrusion"))
                        .header("Authorization", "Bearer " + outsider))
                .andExpect(status().isForbidden());

        // The registry's own tallies count only what the caller may open
        mockMvc.perform(get("/marketing/travel-plans/summary")
                        .header("Authorization", "Bearer " + owner))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalPlans").value(1))
                .andExpect(jsonPath("$.data.pendingApproval").value(1));
        mockMvc.perform(get("/marketing/travel-plans/summary")
                        .header("Authorization", "Bearer " + outsider))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalPlans").value(0))
                .andExpect(jsonPath("$.data.pendingApproval").value(0))
                .andExpect(jsonPath("$.data.approvedPlans").value(0))
                .andExpect(jsonPath("$.data.activeTrips").value(0));

        // A registry stop with coordinates, added by the OWNER — this is what the
        // shared map would pin for everybody if the read were not scoped.
        mockMvc.perform(post("/marketing/travel-plans/" + planId + "/stops")
                        .header("Authorization", "Bearer " + owner)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "companyName", "Owner Only Plant",
                                "plannedDate", "2026-08-20",
                                "latitude", 11.3410,
                                "longitude", 77.7172,
                                "city", "Erode"))))
                .andExpect(status().isCreated());

        MvcResult ownerMap = mockMvc.perform(get("/marketing/map/locations")
                        .header("Authorization", "Bearer " + owner))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(ownerMap.getResponse().getContentAsString()).contains("Owner Only Plant");
        MvcResult outsiderMap = mockMvc.perform(get("/marketing/map/locations")
                        .header("Authorization", "Bearer " + outsider))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(outsiderMap.getResponse().getContentAsString()).doesNotContain("Owner Only Plant");

        // The stop's own detail panels belong to the same private record, so a stop
        // id read off a map must not open a coworker's registry data either.
        long stopId = -1;
        for (JsonNode location : objectMapper
                .readTree(ownerMap.getResponse().getContentAsString()).path("data")) {
            if ("Owner Only Plant".equals(location.path("name").asText())) {
                stopId = location.path("id").asLong();
            }
        }
        assertThat(stopId).isPositive();
        MvcResult ownerStopAbout = mockMvc.perform(get("/marketing/map/locations/" + stopId + "/about")
                        .param("type", "travel_stop")
                        .header("Authorization", "Bearer " + owner))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(ownerStopAbout.getResponse().getContentAsString()).contains("Owner Only Plant");
        for (String detail : java.util.List.of("about", "summary", "updates", "photos")) {
            mockMvc.perform(get("/marketing/map/locations/" + stopId + "/" + detail)
                            .param("type", "travel_stop")
                            .header("Authorization", "Bearer " + outsider))
                    .andExpect(status().isForbidden());
        }

        // Same for the shared month calendar, keyed by the registry's event id.
        String planEventId = "\"travelplan_" + planId + "\"";
        MvcResult ownerCalendar = mockMvc.perform(get("/marketing/calendar/activities")
                        .param("year", "2026")
                        .param("month", "8")
                        .header("Authorization", "Bearer " + owner))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(ownerCalendar.getResponse().getContentAsString()).contains(planEventId);
        MvcResult outsiderCalendar = mockMvc.perform(get("/marketing/calendar/activities")
                        .param("year", "2026")
                        .param("month", "8")
                        .header("Authorization", "Bearer " + outsider))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(outsiderCalendar.getResponse().getContentAsString()).doesNotContain(planEventId);

        // Nothing above changed the records, and the OWNER still runs its own
        // workflow to the end.
        mockMvc.perform(post("/marketing/travel-plans/" + planId + "/approve")
                        .header("Authorization", "Bearer " + owner))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("Approved"))
                .andExpect(jsonPath("$.data.approvedBy").value("Travel Owner Five"));
        mockMvc.perform(post("/marketing/travel-schedules/" + scheduleId + "/approve")
                        .header("Authorization", "Bearer " + owner))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("Approved"));

        // A MANAGER reaches records belonging to another user — same token, the
        // role is read from the database on every request.
        promote("travelout5@example.com", UserRole.MANAGER);
        mockMvc.perform(get("/marketing/travel-schedules/" + scheduleId)
                        .header("Authorization", "Bearer " + outsider))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.assignedTo").value("Travel Employee Five"));
        mockMvc.perform(get("/marketing/travel-plans/" + planId)
                        .header("Authorization", "Bearer " + outsider))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.marketer").value("Travel Owner Five"));
    }

    /** POSTs a schedule body and returns the status code (for the invalid-input matrix). */
    private int createStatus(String token, java.util.Map<String, Object> body) throws Exception {
        return mockMvc.perform(post("/marketing/travel-schedules")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse().getStatus();
    }

    private static java.util.Map<String, Object> with(java.util.Map<String, Object> base,
                                                      String key, Object value) {
        java.util.Map<String, Object> copy = new java.util.LinkedHashMap<>(base);
        copy.put(key, value);
        return copy;
    }

    private static java.util.Map<String, Object> without(java.util.Map<String, Object> base, String key) {
        java.util.Map<String, Object> copy = new java.util.LinkedHashMap<>(base);
        copy.remove(key);
        return copy;
    }
}
