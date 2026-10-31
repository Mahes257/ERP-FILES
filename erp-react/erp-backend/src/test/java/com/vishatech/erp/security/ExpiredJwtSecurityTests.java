package com.vishatech.erp.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Runs in its own Spring context with a 1 ms token lifetime so an issued
 * token is guaranteed expired by the time it is used.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "app.jwt.expiration-ms=1")
class ExpiredJwtSecurityTests extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private CustomUserDetailsService userDetailsService;

    @Test
    void expiredTokenReturns401() throws Exception {
        UserDetails details = userDetailsService.loadUserByUsername("admin@vishaktech.com");
        String token = jwtService.generateToken(details);
        Thread.sleep(20); // let it expire
        mockMvc.perform(get("/leads").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }
}
