package com.vishatech.erp.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.login.max-per-ip=4",
        "app.rate-limit.login.max-per-email-ip=4",
        "app.rate-limit.login.window-minutes=15",
        "app.rate-limit.register.max-per-ip=4",
        "app.rate-limit.register.window-minutes=60"
})
class RateLimitTests extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void bruteForceLoginAttemptsReturn429() throws Exception {
        // 4 allowed attempts, then 429.
        for (int i = 0; i < 4; i++) {
            mockMvc.perform(post("/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(Map.of(
                                    "email", "ratelimit-target@example.com",
                                    "password", "wrong"))))
                    .andExpect(status().isUnauthorized());
        }
        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", "ratelimit-target@example.com",
                                "password", "wrong"))))
                .andExpect(status().is(429));
    }

    @Test
    void registrationIsThrottledPerIp() throws Exception {
        for (int i = 0; i < 4; i++) {
            mockMvc.perform(post("/auth/register")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(Map.of(
                                    "fullName", "Spam " + i,
                                    "email", "spam" + i + "@example.com",
                                    "password", "password123"))))
                    .andExpect(status().isCreated());
        }
        // 5th register within the window → 429.
        mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "fullName", "Spam 5",
                                "email", "spam5@example.com",
                                "password", "password123"))))
                .andExpect(status().is(429));
    }
}
