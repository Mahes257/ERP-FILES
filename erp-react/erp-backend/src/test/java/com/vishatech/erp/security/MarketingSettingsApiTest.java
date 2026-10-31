package com.vishatech.erp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.repository.SettingsAuditLogRepository;
import com.vishatech.erp.repository.UserRepository;
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
 * Marketing Settings are persisted server-side through {@code app_settings}
 * (key {@code marketing_settings}) with an audit trail in
 * {@code settings_audit_log}. These tests exercise the real controller against
 * the in-memory database: authorization, save, and reload persistence.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class MarketingSettingsApiTest extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SettingsAuditLogRepository auditRepository;

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

    private void promoteToAdmin(String email) {
        userRepository.findByEmail(email).ifPresent(user -> {
            user.setRole(UserRole.ADMIN);
            userRepository.save(user);
        });
    }

    @Test
    void marketingSettingsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/settings/marketing"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(put("/settings/marketing")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void nonAdminCannotWriteMarketingSettings() throws Exception {
        String token = register("mkt-settings-user@example.com", "Mkt Settings User");
        mockMvc.perform(put("/settings/marketing")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminCanSaveReloadAndAuditMarketingSettings() throws Exception {
        String email = "mkt-settings-admin@example.com";
        String token = register(email, "Mkt Settings Admin");
        promoteToAdmin(email);

        String body = "{\"general\":{\"defaultMarketer\":\"Alice\"},"
                + "\"visitSettings\":{\"visitStatuses\":[{\"name\":\"Planned\",\"active\":true}]}}";

        mockMvc.perform(put("/settings/marketing")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.general.defaultMarketer").value("Alice"));

        // Reload from the database — the persisted blob survives a new GET.
        mockMvc.perform(get("/settings/marketing")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.general.defaultMarketer").value("Alice"))
                .andExpect(jsonPath("$.data.visitSettings.visitStatuses[0].name").value("Planned"));

        // Every write is recorded in the audit trail.
        assertThat(auditRepository.findBySettingKeyOrderByChangedAtDesc("marketing_settings"))
                .isNotEmpty();
    }

    /**
     * Reads stay open to any authenticated user (every Marketing module loads
     * its defaults from this endpoint); only writes are SETTINGS_MANAGE-gated.
     */
    @Test
    void authenticatedNonAdminCanStillReadMarketingSettings() throws Exception {
        String token = register("mkt-settings-reader@example.com", "Mkt Settings Reader");

        mockMvc.perform(get("/settings/marketing")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").isMap());

        mockMvc.perform(get("/settings/marketing/general")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    /**
     * Grid configuration: readable/writable by any authenticated user, reset
     * via DELETE — the contract every Sales & Marketing grid relies on.
     */
    @Test
    void gridConfigurationRoundTripForAuthenticatedUser() throws Exception {
        String token = register("mkt-grid-user@example.com", "Mkt Grid User");
        String key = "marketing.test.grid";

        // Never configured → success with no stored value (frontend falls back
        // to the grid's built-in defaults; this is not an error).
        mockMvc.perform(get("/settings/grid-configs/" + key)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(content().string(not(containsString("Marketing Grid Probe"))));

        String config = "[{\"id\":\"sno\",\"key\":\"sno\","
                + "\"label\":\"Marketing Grid Probe\",\"type\":\"text\",\"order\":1}]";

        mockMvc.perform(put("/settings/grid-configs/" + key)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(config))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].label").value("Marketing Grid Probe"));

        mockMvc.perform(get("/settings/grid-configs/" + key)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value("sno"))
                .andExpect(jsonPath("$.data[0].order").value(1));

        // Reset removes the stored row so the grid returns to its defaults.
        mockMvc.perform(delete("/settings/grid-configs/" + key)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        mockMvc.perform(get("/settings/grid-configs/" + key)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(content().string(not(containsString("Marketing Grid Probe"))));
    }
}
