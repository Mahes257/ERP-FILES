package com.vishatech.erp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
 * CRM API verification: the create/edit form's Notes text block is persisted as
 * a real lead note, client duplicate detection reports matches, and the CRM
 * endpoints require authentication.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class CrmApiTest extends AbstractSecurityTest {

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
    void crmEndpointsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/leads")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/customers")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/followups")).andExpect(status().isUnauthorized());
    }

    @Test
    void leadFormNotesArePersistedAsALeadNote() throws Exception {
        String token = register("crm-lead-user@example.com", "CRM Lead User");

        MvcResult created = mockMvc.perform(post("/leads")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "leadName", "Crm Note Lead",
                                "companyName", "Note Co",
                                "notes", "Called the buyer — wants a revised quote."))))
                .andExpect(status().isCreated())
                .andReturn();
        long id = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        mockMvc.perform(get("/leads/" + id)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.notes[0].text")
                        .value("Called the buyer — wants a revised quote."));
    }

    @Test
    void leadDescriptionPersistsThroughCreateViewAndUpdate() throws Exception {
        String token = register("crm-lead-description@example.com", "CRM Lead Description");
        String initial = "Initial line one\nInitial line two";

        MvcResult created = mockMvc.perform(post("/leads")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "leadName", "Description Lead",
                                "companyName", "Description Co",
                                "description", initial))))
                .andExpect(status().isCreated())
                .andReturn();
        long id = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        mockMvc.perform(get("/leads/" + id)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.description").value(initial));

        // Editing an unrelated field and omitting description must not erase it.
        mockMvc.perform(put("/leads/" + id)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "leadName", "Description Lead Renamed",
                                "companyName", "Description Co"))))
                .andExpect(status().isOk());

        mockMvc.perform(get("/leads/" + id)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.description").value(initial));

        String updated = "Updated line one\nUpdated line two";
        mockMvc.perform(put("/leads/" + id)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "leadName", "Description Lead Renamed",
                                "companyName", "Description Co",
                                "description", updated))))
                .andExpect(status().isOk());

        mockMvc.perform(get("/leads/" + id)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.description").value(updated));
    }

    @Test
    void locationMasterCascadesAreAvailableForTheLeadForm() throws Exception {
        String token = register("crm-location-user@example.com", "CRM Location User");

        MvcResult result = mockMvc.perform(get("/locations/countries")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode countries = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data");
        assertThat(countries.isArray()).isTrue();
        assertThat(countries.size()).isGreaterThan(0);
    }

    @Test
    void clientDuplicateDetectionReportsMatches() throws Exception {
        String token = register("crm-client-user@example.com", "CRM Client User");

        mockMvc.perform(post("/customers")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "businessName", "Duplicate Co",
                                "gstin", "29ABCDE1234F1Z5"))))
                .andExpect(status().isCreated());

        MvcResult result = mockMvc.perform(get("/customers/check-duplicate")
                        .param("gstin", "29ABCDE1234F1Z5")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode matches = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data");
        assertThat(matches.isArray()).isTrue();
        assertThat(matches.size()).isEqualTo(1);
        // The match is a typed read model — the four shipped keys, all text.
        JsonNode match = matches.get(0);
        assertThat(match.path("field").asText()).isEqualTo("gstin");
        assertThat(match.path("message").isTextual()).isTrue();
        assertThat(match.path("message").asText()).contains("already exists for client");
        assertThat(match.path("existingId").isTextual()).isTrue();
        assertThat(match.path("existingName").asText()).isEqualTo("Duplicate Co");
        assertThat(match.size()).isEqualTo(4);
    }

    @Test
    void leadLifecycleActionsRemainAvailableToEditPermissionHolders() throws Exception {
        String token = register("crm-lead-lifecycle@example.com", "CRM Lead Lifecycle");

        MvcResult created = mockMvc.perform(post("/leads")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "leadName", "Lifecycle Lead",
                                "companyName", "Lifecycle Co"))))
                .andExpect(status().isCreated())
                .andReturn();
        long id = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        for (String action : new String[]{"archive", "restore", "inactive", "active"}) {
            mockMvc.perform(patch("/leads/" + action + "/" + id)
                            .header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk());
        }

        mockMvc.perform(patch("/leads/" + id + "/stage")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("stage", "CONTACTED"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.stage").value("Contacted"));

        mockMvc.perform(patch("/leads/" + id + "/priority")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("priority", "High"))))
                .andExpect(status().isOk());

        mockMvc.perform(patch("/leads/" + id + "/owner")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("owner", "Priya"))))
                .andExpect(status().isOk());
    }

    @Test
    void clientLifecycleActionsAndGeneratedCodesRemainAvailable() throws Exception {
        String token = register("crm-client-lifecycle@example.com", "CRM Client Lifecycle");

        String firstCode = createClientAndReadCode(token, "Lifecycle Client A", "lifecycle-a@example.com");
        String secondCode = createClientAndReadCode(token, "Lifecycle Client B", "lifecycle-b@example.com");

        assertThat(firstCode).matches("CL-\\d{4,}");
        assertThat(secondCode).matches("CL-\\d{4,}");
        assertThat(Integer.parseInt(secondCode.substring(3)))
                .isGreaterThan(Integer.parseInt(firstCode.substring(3)));

        long id = clientIdByCode(token, firstCode);

        for (String action : new String[]{"archive", "restore"}) {
            mockMvc.perform(patch("/customers/" + action + "/" + id)
                            .header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk());
        }

        mockMvc.perform(patch("/customers/" + id + "/status")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("status", "Inactive"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("Inactive"));
    }

    @Test
    void followUpLifecycleActionsRemainAvailableToEditPermissionHolders() throws Exception {
        String token = register("crm-followup-lifecycle@example.com", "CRM Follow-up Lifecycle");

        MvcResult lead = mockMvc.perform(post("/leads")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "leadName", "Follow-up Lead",
                                "companyName", "Follow-up Co"))))
                .andExpect(status().isCreated())
                .andReturn();
        long leadId = objectMapper.readTree(lead.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        MvcResult followUp = mockMvc.perform(post("/followups")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "leadId", leadId,
                                "followupDate", "2026-02-01"))))
                .andExpect(status().isCreated())
                .andReturn();
        long id = objectMapper.readTree(followUp.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        for (String action : new String[]{"archive", "restore"}) {
            mockMvc.perform(patch("/followups/" + action + "/" + id)
                            .header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk());
        }
    }

    private String createClientAndReadCode(String token, String businessName, String email) throws Exception {
        MvcResult created = mockMvc.perform(post("/customers")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "businessName", businessName,
                                "email", email))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("clientCode").asText();
    }

    /**
     * Close Lead, end to end on the API: the closed state is persisted (a fresh
     * read still reports it), the lead leaves the active list/counts but stays
     * findable in the Closed view, closing twice is a no-op, and every operation
     * that would start new work on it — edit, follow-up, CPR, quotation — is
     * refused by the server with a clear message while the record, its number,
     * its timeline and its history stay intact.
     */
    @Test
    void closingALeadPersistsAndBlocksNewActiveWork() throws Exception {
        String token = register("crm-lead-close@example.com", "CRM Lead Close");

        MvcResult created = mockMvc.perform(post("/leads")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "leadName", "Close Flow Lead",
                                "companyName", "Close Flow Co",
                                "email", "close-flow@example.com"))))
                .andExpect(status().isCreated())
                .andReturn();
        long id = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();
        String leadNo = String.format("LEAD-%06d", id);

        // 1. Close the lead.
        mockMvc.perform(patch("/leads/close/" + id)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("Inactive"));

        // 2. Persisted: a fresh read reports the closed state plus its audit trail.
        mockMvc.perform(get("/leads/" + id)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("Inactive"))
                .andExpect(jsonPath("$.data.name").value("Close Flow Lead"))
                .andExpect(jsonPath("$.data.timeline[*].title",
                        org.hamcrest.Matchers.hasItem("Lead closed")))
                .andExpect(jsonPath("$.data.history[*].newValue",
                        org.hamcrest.Matchers.hasItem("Closed")));

        // 3. Idempotent: a second close neither reopens nor re-audits anything.
        mockMvc.perform(patch("/leads/close/" + id)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("Inactive"));
        JsonNode closedLead = objectMapper.readTree(
                mockMvc.perform(get("/leads/" + id).header("Authorization", "Bearer " + token))
                        .andReturn().getResponse().getContentAsString()).path("data");
        long closeEntries = 0;
        for (JsonNode entry : closedLead.path("timeline")) {
            if ("Lead closed".equals(entry.path("title").asText())) {
                closeEntries++;
            }
        }
        assertThat(closeEntries).as("one close audit entry whatever was clicked").isEqualTo(1);

        // 4. Gone from the active list, still present in the Closed view.
        assertThat(leadIds(mockMvc.perform(get("/leads")
                        .param("search", "Close Flow Lead")
                        .param("size", "50")
                        .header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getContentAsString()))
                .as("a closed lead is not an active lead")
                .doesNotContain(id);
        assertThat(leadIds(mockMvc.perform(get("/leads")
                        .param("status", "Inactive")
                        .param("size", "50")
                        .header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getContentAsString()))
                .as("a closed lead stays findable in the Closed view")
                .contains(id);

        // 5. No new active work — enforced by the server, not only by the UI.
        mockMvc.perform(put("/leads/" + id)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "leadName", "Close Flow Lead Renamed",
                                "companyName", "Close Flow Co"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", org.hamcrest.Matchers.containsString("closed")));

        mockMvc.perform(post("/leads/" + id + "/follow-up")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", org.hamcrest.Matchers.containsString("closed")));

        mockMvc.perform(post("/followups")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "leadId", id,
                                "followupDate", "2026-10-26"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", org.hamcrest.Matchers.containsString("closed")));

        mockMvc.perform(post("/cprs")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "leadNo", leadNo,
                                "clientName", "Close Flow Co",
                                "sourceLead", "Close Flow Lead"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", org.hamcrest.Matchers.containsString("closed")));

        mockMvc.perform(post("/quotations")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "leadNo", leadNo,
                                "clientName", "Close Flow Co"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", org.hamcrest.Matchers.containsString("closed")));

        // 6. Nothing in the record was changed by the refused operations.
        mockMvc.perform(get("/leads/" + id)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.name").value("Close Flow Lead"))
                .andExpect(jsonPath("$.data.status").value("Inactive"))
                .andExpect(jsonPath("$.data.email").value("close-flow@example.com"));

        // 7. The lead can still be reopened through the existing authorized
        //    lifecycle action, after which editing is allowed again.
        mockMvc.perform(patch("/leads/active/" + id)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("Active"));
        mockMvc.perform(put("/leads/" + id)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "leadName", "Close Flow Lead Reopened",
                                "companyName", "Close Flow Co"))))
                .andExpect(status().isOk());
    }

    /** Ids of the lead rows in a list/Page response. */
    private java.util.List<Long> leadIds(String body) throws Exception {
        JsonNode root = objectMapper.readTree(body);
        JsonNode rows = root.has("content") ? root.path("content") : root.path("data");
        java.util.List<Long> ids = new java.util.ArrayList<>();
        for (JsonNode row : rows) {
            ids.add(row.path("id").asLong());
        }
        return ids;
    }

    private long clientIdByCode(String token, String clientCode) throws Exception {
        MvcResult result = mockMvc.perform(get("/customers")
                        .param("q", clientCode)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode rows = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data");
        for (JsonNode row : rows) {
            if (clientCode.equals(row.path("clientCode").asText())) {
                return row.path("id").asLong();
            }
        }
        throw new AssertionError("No client found with code " + clientCode);
    }
}
