package com.vishatech.erp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.RefreshToken;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.repository.RefreshTokenRepository;
import com.vishatech.erp.repository.UserRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Regression coverage for the token-retention cleanup inside
 * {@link com.vishatech.erp.service.RefreshTokenService#issue(User)}.
 *
 * <p>DEFECT REPRODUCED HERE: {@code RefreshTokenService} is deliberately not
 * transactional (each repository call must commit on its own so reuse-detection
 * revocations survive the BadCredentialsException thrown afterwards), but Spring
 * Data JPA does not make DERIVED {@code deleteBy...} queries transactional. The
 * cleanup therefore failed with
 * {@code InvalidDataAccessApiUsageException: No EntityManager with actual
 * transaction available for current thread - cannot reliably process 'remove'
 * call} — and because Spring Data only issues the {@code remove} calls for rows
 * it actually found, the failure appeared ONLY once a token older than the
 * 30-day retention window existed. That turned every {@code POST /auth/login}
 * and {@code POST /auth/register} into an HTTP 500 in production while the
 * suite stayed green against a freshly created, empty H2 database.
 *
 * <p>This class is deliberately NOT {@code @Transactional}: a surrounding test
 * transaction would supply the very EntityManager the cleanup is missing and
 * the regression would be invisible again. It inserts a token that is due for
 * removal so the {@code remove} path is exercised, then drives the real
 * endpoints.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class RefreshTokenCleanupTests extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RefreshTokenRepository refreshTokenRepository;

    @Autowired
    private UserRepository userRepository;

    /**
     * A refresh token that is both expired and revoked well before the 30-day
     * retention cutoff, i.e. one the cleanup is expected to remove.
     */
    private RefreshToken dueForCleanup() {
        User admin = userRepository.findByEmail("admin@vishaktech.com").orElseThrow();
        Instant longAgo = Instant.now().minus(60, ChronoUnit.DAYS);
        RefreshToken stale = new RefreshToken();
        stale.setUserId(admin.getId());
        stale.setTokenHash(UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", ""));
        stale.setFamilyId(UUID.randomUUID().toString());
        stale.setCreatedAt(longAgo);
        stale.setExpiresAt(longAgo);
        stale.setRevokedAt(Instant.now().minus(45, ChronoUnit.DAYS));
        stale.setRevokedReason("ROTATED");
        return refreshTokenRepository.save(stale);
    }

    @Test
    void loginSucceedsAndCleansUpWhenStaleTokensAreDue() throws Exception {
        RefreshToken stale = dueForCleanup();
        assertThat(refreshTokenRepository.findById(stale.getId())).isPresent();

        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", "admin@vishaktech.com",
                                "password", "Admin@123"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.token").isNotEmpty())
                .andExpect(jsonPath("$.data.refreshToken").isNotEmpty());

        // The cleanup really ran: the retention-expired token is gone.
        assertThat(refreshTokenRepository.findById(stale.getId())).isEmpty();
    }

    @Test
    void registrationSucceedsAndCleansUpWhenStaleTokensAreDue() throws Exception {
        RefreshToken stale = dueForCleanup();
        String email = "cleanup-" + UUID.randomUUID() + "@example.com";

        mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "fullName", "Cleanup Probe",
                                "email", email,
                                "password", "password123"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.token").isNotEmpty());

        assertThat(refreshTokenRepository.findById(stale.getId())).isEmpty();
    }

    @Test
    void invalidCredentialsStillReturnUnauthorizedWhileCleanupIsDue() throws Exception {
        dueForCleanup();

        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", "admin@vishaktech.com",
                                "password", "wrong-password"))))
                .andExpect(status().isUnauthorized());
    }
}
