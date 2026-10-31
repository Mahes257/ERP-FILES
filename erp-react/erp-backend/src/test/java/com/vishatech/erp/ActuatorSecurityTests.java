package com.vishatech.erp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.security.JwtService;
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Verifies that actuator infrastructure is properly configured:
 * - health is publicly accessible (no auth required)
 * - protected endpoints require authentication
 * - Micrometer metrics are registered
 */
@SpringBootTest
@AutoConfigureMockMvc
class ActuatorSecurityTests extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private UserDetailsService userDetailsService;

    @Autowired
    private MeterRegistry meterRegistry;

    private String tokenFor(String email) {
        return jwtService.generateToken(userDetailsService.loadUserByUsername(email));
    }

    @Test
    void healthEndpointIsPubliclyAccessible() throws Exception {
        mockMvc.perform(get("/health"))
                .andExpect(status().isOk());
    }

    @Test
    void protectedEndpointRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/leads"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void protectedEndpointRespondsWithValidToken() throws Exception {
        String token = tokenFor("admin@vishaktech.com");
        mockMvc.perform(get("/leads")
                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void micrometerMetricsAreRegistered() {
        // Verify that Micrometer is active and has registered standard metrics
        assertThat(meterRegistry).isNotNull();
        assertThat(meterRegistry.getMeters()).isNotEmpty();
    }

    @Test
    void customErpMetricsAreRegistered() {
        // Verify our custom metrics are registered
        assertThat(meterRegistry.find("erp_file_upload_total").counter()).isNotNull();
        assertThat(meterRegistry.find("erp_processing_job_total").counter()).isNotNull();
        assertThat(meterRegistry.find("erp_processing_job_queue_size").gauge()).isNotNull();
    }
}
