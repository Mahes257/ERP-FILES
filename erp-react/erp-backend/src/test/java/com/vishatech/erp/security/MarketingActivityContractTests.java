package com.vishatech.erp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
 * Contract regression tests for the follow-up / visit-extension endpoints
 * ({@code /marketing/activities}).
 *
 * These lock the behaviour of two fixed defects:
 *
 * <ul>
 *   <li>A missing record returned a <em>body-less</em> 404 — the client had no
 *       message to show. It must now return the same
 *       {@code {"success":false,"message":"…"}} body as the rest of the API.</li>
 *   <li>Every failure was swallowed into a 400 with an ad-hoc map built by
 *       {@code Map.of(...)} (which also threw NPE when the exception message was
 *       null) and leaked raw exception text. Failures must now flow through
 *       GlobalExceptionHandler so the status matches the cause.</li>
 * </ul>
 *
 * The <em>success</em> bodies are deliberately asserted as raw/unwrapped: the
 * activity endpoints are a separate, wider inconsistency (they do not use
 * {@code ApiResponse} like their sibling follow-up endpoints) and are out of
 * scope here. Locking them means a future change to that contract has to be a
 * conscious decision rather than an accident.
 *
 * Lives in this package to reuse the shared {@code AbstractSecurityTest} H2
 * harness (the tests must never touch the development MySQL database).
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class MarketingActivityContractTests extends AbstractSecurityTest {

    private static final String TEST_EMAIL = "activity-contract@example.com";
    private static final long MISSING_ID = 999_999L;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    /** Registration is rate-limited and one-shot per e-mail, so cache the token. */
    private static String cachedToken;

    private String token() throws Exception {
        if (cachedToken == null) {
            MvcResult result = mockMvc.perform(post("/auth/register")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(Map.of(
                                    "fullName", "Activity Contract",
                                    "email", TEST_EMAIL,
                                    "password", "password123"))))
                    .andReturn();
            assertThat(result.getResponse().getStatus())
                    .as("registration must succeed for the contract tests")
                    .isEqualTo(201);
            cachedToken = objectMapper.readTree(result.getResponse().getContentAsString())
                    .path("data").path("token").asText();
        }
        return cachedToken;
    }

    /** Creates a real visit so an activity can be attached to it. */
    private long createVisit() throws Exception {
        MvcResult result = mockMvc.perform(post("/marketing/visits")
                        .header("Authorization", "Bearer " + token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "companyName", "Contract Test Co",
                                "scheduleDate", "2026-08-20",
                                "appointmentStatus", "Fixed",
                                "contactPerson", "Ramesh Kumar",
                                "phone", "9876543210",
                                "location", "Chennai",
                                // Empty outcome skips the mkt_outcomes master-data
                                // check — the same fixture MarketingSecurityTests uses.
                                "outcome", ""))))
                .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("id").asLong();
    }

    private long createActivity(long visitId) throws Exception {
        MvcResult result = mockMvc.perform(post("/marketing/activities")
                        .header("Authorization", "Bearer " + token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "visitId", visitId,
                                "activityType", "extension",
                                "activityDate", "2026-09-19",
                                "companyName", "Contract Test Co"))))
                .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .path("id").asLong();
    }

    // ===================== Fixed: missing record → 404 with a body =====================

    @Test
    void missingActivityReturns404WithReadableMessage() throws Exception {
        MvcResult result = mockMvc.perform(get("/marketing/activities/" + MISSING_ID)
                        .header("Authorization", "Bearer " + token()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Activity not found with id: " + MISSING_ID))
                .andReturn();

        assertThat(result.getResponse().getContentAsString())
                .as("a body-less 404 left the client with no error text")
                .isNotEmpty();
    }

    @Test
    void missingOriginalVisitReturns404WithReadableMessage() throws Exception {
        mockMvc.perform(get("/marketing/activities/visit/" + MISSING_ID)
                        .header("Authorization", "Bearer " + token()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Marketing visit not found with id: " + MISSING_ID));
    }

    @Test
    void updatingMissingActivityReturns404NotBadRequest() throws Exception {
        mockMvc.perform(put("/marketing/activities/" + MISSING_ID)
                        .header("Authorization", "Bearer " + token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("companyName", "Ghost Co"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Activity not found with id: " + MISSING_ID));
    }

    @Test
    void deletingMissingActivityReturns404NotBadRequest() throws Exception {
        mockMvc.perform(delete("/marketing/activities/" + MISSING_ID)
                        .header("Authorization", "Bearer " + token()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Activity not found with id: " + MISSING_ID));
    }

    // ===================== Fixed: failures keep their real status =====================

    @Test
    void createWithoutVisitIdStillReturns400WithEnvelope() throws Exception {
        // IllegalArgumentException is validation, so 400 is correct — what changed
        // is that it now comes from the shared handler (sanitised + enveloped).
        mockMvc.perform(post("/marketing/activities")
                        .header("Authorization", "Bearer " + token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("visitId is required"));
    }

    @Test
    void createWithUnknownVisitReturns400WithEnvelope() throws Exception {
        mockMvc.perform(post("/marketing/activities")
                        .header("Authorization", "Bearer " + token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("visitId", MISSING_ID))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Original visit not found: " + MISSING_ID));
    }

    // ===================== Unchanged success contract (regression guard) =====================

    @Test
    void createActivityKeeps201AndRawBody() throws Exception {
        long visitId = createVisit();
        MvcResult result = mockMvc.perform(post("/marketing/activities")
                        .header("Authorization", "Bearer " + token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "visitId", visitId,
                                "activityType", "extension",
                                "activityDate", "2026-09-19",
                                "companyName", "Contract Test Co"))))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.path("id").asLong()).isPositive();
        assertThat(body.path("activityType").asText()).isEqualTo("extension");
        assertThat(body.has("success"))
                .as("success shape must stay raw until the wider envelope fix is approved")
                .isFalse();
    }

    @Test
    void getActivitySuccessBodyStaysRaw() throws Exception {
        long visitId = createVisit();
        long activityId = createActivity(visitId);

        MvcResult result = mockMvc.perform(get("/marketing/activities/" + activityId)
                        .header("Authorization", "Bearer " + token()))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.path("id").asLong()).isEqualTo(activityId);
        assertThat(body.path("visitId").asLong()).isEqualTo(visitId);
        assertThat(body.has("success")).isFalse();
    }

    @Test
    void updateAndDeleteSuccessBodiesUnchanged() throws Exception {
        long visitId = createVisit();
        long activityId = createActivity(visitId);

        MvcResult updated = mockMvc.perform(put("/marketing/activities/" + activityId)
                        .header("Authorization", "Bearer " + token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("companyName", "Updated Co"))))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode updatedBody = objectMapper.readTree(updated.getResponse().getContentAsString());
        assertThat(updatedBody.path("companyName").asText()).isEqualTo("Updated Co");
        assertThat(updatedBody.has("success")).isFalse();

        mockMvc.perform(delete("/marketing/activities/" + activityId)
                        .header("Authorization", "Bearer " + token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Activity deleted"));

        // …and the record really is gone afterwards.
        mockMvc.perform(get("/marketing/activities/" + activityId)
                        .header("Authorization", "Bearer " + token()))
                .andExpect(status().isNotFound());
    }
}
