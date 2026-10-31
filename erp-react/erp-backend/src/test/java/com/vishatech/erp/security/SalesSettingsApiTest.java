package com.vishatech.erp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
 * Sales Settings backend verification: the only server-persisted Sales Settings
 * section is the document default visibility (Settings → Document Settings,
 * {@code app_settings} key {@code document_default_visibility} with a
 * {@code settings_audit_log} trail). These tests exercise the real controller
 * against the in-memory database: authentication, authorization, save, reload
 * persistence and the audit row.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class SalesSettingsApiTest extends AbstractSecurityTest {

    private static final String SETTING_KEY = "document_default_visibility";

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

    /** Promote, then log in again so the issued token carries ADMIN authorities. */
    private String adminToken(String email) throws Exception {
        userRepository.findByEmail(email).ifPresent(user -> {
            user.setRole(UserRole.ADMIN);
            userRepository.save(user);
        });
        MvcResult login = mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", email,
                                "password", "password123"))))
                .andReturn();
        assertThat(login.getResponse().getStatus()).isEqualTo(200);
        return objectMapper.readTree(login.getResponse().getContentAsString())
                .path("data").path("token").asText();
    }

    @Test
    void salesSettingsEndpointsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/settings/documents")).andExpect(status().isUnauthorized());
        mockMvc.perform(put("/settings/documents")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"defaultVisibility\":\"TEAM_ONLY\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void nonAdminCannotReadOrWriteDocumentSettings() throws Exception {
        String token = register("sales-settings-user@example.com", "Sales Settings User");
        mockMvc.perform(get("/settings/documents")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        mockMvc.perform(put("/settings/documents")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"defaultVisibility\":\"TEAM_ONLY\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminCanSaveReloadAndAuditDocumentVisibility() throws Exception {
        String email = "sales-settings-admin@example.com";
        register(email, "Sales Settings Admin");
        String token = adminToken(email);

        mockMvc.perform(put("/settings/documents")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"defaultVisibility\":\"BOTH\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.defaultVisibility").value("BOTH"));

        // Reload from the database — the persisted value survives a new GET.
        mockMvc.perform(get("/settings/documents")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.defaultVisibility").value("BOTH"));

        // Every write is recorded in the settings audit trail.
        assertThat(auditRepository.findBySettingKeyOrderByChangedAtDesc(SETTING_KEY)).isNotEmpty();
    }

    @Test
    void invalidVisibilityIsRejected() throws Exception {
        String email = "sales-settings-invalid@example.com";
        register(email, "Sales Settings Invalid");
        String token = adminToken(email);

        mockMvc.perform(put("/settings/documents")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"defaultVisibility\":\"NOT_A_VISIBILITY\"}"))
                .andExpect(status().isBadRequest());
    }

    // ── Sales Settings blob (/settings/sales) ──────────────────────────────
    // The whole Sales Settings document is persisted server-side (app_settings
    // key sales_settings) with a settings_audit_log trail — the same
    // architecture Marketing Settings uses, and the counterpart of the
    // document-default-visibility cases above.

    @Test
    void salesSettingsBlobRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/settings/sales")).andExpect(status().isUnauthorized());
        mockMvc.perform(put("/settings/sales")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized());
    }

    /** Any authenticated user loads the defaults; only ADMIN may replace them. */
    @Test
    void authenticatedUserCanReadButNotWriteSalesSettings() throws Exception {
        String token = register("sales-settings-reader@example.com", "Sales Settings Reader");

        mockMvc.perform(get("/settings/sales")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").isMap());

        // A section read answers with the stored (or empty) section, never a
        // mistyped-section error.
        mockMvc.perform(get("/settings/sales/numbering")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        mockMvc.perform(put("/settings/sales")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"general\":{\"defaultCurrency\":\"USD\"}}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminCanSaveReloadAndAuditSalesSettings() throws Exception {
        String email = "sales-settings-admin-blob@example.com";
        register(email, "Sales Settings Admin Blob");
        String token = adminToken(email);

        String body = "{\"general\":{\"defaultCurrency\":\"AED\",\"defaultSalesStatus\":\"Draft\"},"
                + "\"paymentTerms\":[{\"name\":\"Advance\",\"days\":0,\"active\":true}]}";

        mockMvc.perform(put("/settings/sales")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.general.defaultCurrency").value("AED"));

        // Reload from the database — the persisted blob survives a new GET, and
        // a section read returns just that section.
        mockMvc.perform(get("/settings/sales")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.general.defaultCurrency").value("AED"))
                .andExpect(jsonPath("$.data.paymentTerms[0].name").value("Advance"));

        mockMvc.perform(get("/settings/sales/general")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.defaultCurrency").value("AED"));

        // Every write is recorded in the shared settings audit trail, under the
        // sales_settings key the audit consumers query by.
        assertThat(auditRepository.findBySettingKeyOrderByChangedAtDesc("sales_settings"))
                .isNotEmpty();
    }

    @Test
    void invalidSalesSettingsBodyIsRejected() throws Exception {
        String email = "sales-settings-invalid-blob@example.com";
        register(email, "Sales Settings Invalid Blob");
        String token = adminToken(email);

        // A JSON array is not a settings document.
        mockMvc.perform(put("/settings/sales")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[1,2,3]"))
                .andExpect(status().isBadRequest());
    }
}
