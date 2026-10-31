package com.vishatech.erp.security;

import static org.assertj.core.api.Assertions.assertThat;
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

// Registration/rate-limit budgets raised so this class can register several
// test users from the same (MockMvc) IP without tripping the limiter.
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class AuthSecurityTests extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private MvcResult register(Map<String, Object> body) throws Exception {
        return mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn();
    }

    @Test
    void publicRegistrationWithAdminRoleStillCreatesUserRole() throws Exception {
        MvcResult result = register(Map.of(
                "fullName", "Hacker One",
                "email", "hacker1@example.com",
                "password", "password123",
                "role", "ADMIN"));
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.path("data").path("role").asText()).isEqualTo("USER");
        assertThat(body.path("data").path("token").asText()).isNotBlank();
    }

    @Test
    void publicRegistrationWithManagerRoleStillCreatesUserRole() throws Exception {
        MvcResult result = register(Map.of(
                "fullName", "Hacker Two",
                "email", "hacker2@example.com",
                "password", "password123",
                "role", "MANAGER"));
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.path("data").path("role").asText()).isEqualTo("USER");
    }

    @Test
    void registeredUserCanNeverBeAdminViaMeEndpoint() throws Exception {
        MvcResult result = register(Map.of(
                "fullName", "Hacker Three",
                "email", "hacker3@example.com",
                "password", "password123",
                "role", "ADMIN"));
        String token = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("token").asText();

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/auth/me")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.role").value("USER"));
    }

    @Test
    void registrationWithoutRoleIsUser() throws Exception {
        MvcResult result = register(Map.of(
                "fullName", "Plain User",
                "email", "plainuser@example.com",
                "password", "password123"));
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.path("data").path("role").asText()).isEqualTo("USER");
    }

    @Test
    void duplicateEmailReturnsConflict() throws Exception {
        Map<String, Object> body = Map.of(
                "fullName", "Dup User",
                "email", "dup@example.com",
                "password", "password123");
        register(body);
        mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isConflict());
    }

    @Test
    void weakPasswordRejectedByValidation() throws Exception {
        mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "fullName", "Weak Pass",
                                "email", "weak@example.com",
                                "password", "short"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void loginWithValidCredentialsSucceeds() throws Exception {
        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", "admin@vishaktech.com",
                                "password", "Admin@123"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.token").isNotEmpty())
                .andExpect(jsonPath("$.data.refreshToken").isNotEmpty());
    }

    @Test
    void loginWithWrongPasswordFailsWith401() throws Exception {
        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", "admin@vishaktech.com",
                                "password", "wrong-password"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.data").doesNotExist());
    }
}
