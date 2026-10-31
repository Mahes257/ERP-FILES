package com.vishatech.erp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.repository.UserRepository;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
class AuthorizationSecurityTests extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private CustomUserDetailsService userDetailsService;

    @Autowired
    private UserRepository userRepository;

    private String tokenFor(String email) {
        return jwtService.generateToken(userDetailsService.loadUserByUsername(email));
    }

    @Test
    void roleChangeRequiresAuthentication() throws Exception {
        mockMvc.perform(patch("/users/1/role")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("role", "ADMIN"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void roleChangeByRegularUserIsForbidden() throws Exception {
        mockMvc.perform(patch("/users/1/role")
                        .header("Authorization", "Bearer " + tokenFor("kavya@vishaktech.com"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("role", "ADMIN"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void roleChangeByAdminSucceeds() throws Exception {
        Long targetId = userRepository.findByEmail("kavya@vishaktech.com").orElseThrow().getId();
        mockMvc.perform(patch("/users/" + targetId + "/role")
                        .header("Authorization", "Bearer " + tokenFor("admin@vishaktech.com"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("role", "MANAGER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.role").value("MANAGER"));
        // Restore.
        mockMvc.perform(patch("/users/" + targetId + "/role")
                .header("Authorization", "Bearer " + tokenFor("admin@vishaktech.com"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("role", "USER"))))
                .andExpect(status().isOk());
    }

    @Test
    void adminCannotChangeOwnRole() throws Exception {
        Long adminId = userRepository.findByEmail("admin@vishaktech.com").orElseThrow().getId();
        mockMvc.perform(patch("/users/" + adminId + "/role")
                        .header("Authorization", "Bearer " + tokenFor("admin@vishaktech.com"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("role", "USER"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void invalidRoleValueRejected() throws Exception {
        Long targetId = userRepository.findByEmail("kavya@vishaktech.com").orElseThrow().getId();
        mockMvc.perform(patch("/users/" + targetId + "/role")
                        .header("Authorization", "Bearer " + tokenFor("admin@vishaktech.com"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("role", "SUPERADMIN"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void financialSettingsChangeRequiresAdminRole() throws Exception {
        mockMvc.perform(put("/settings/financial")
                        .header("Authorization", "Bearer " + tokenFor("kavya@vishaktech.com"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("baseCurrency", "USD"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void meEndpointReturnsAuthenticatedIdentityOnly() throws Exception {
        MvcResult result = mockMvc.perform(get("/auth/me")
                        .header("Authorization", "Bearer " + tokenFor("kavya@vishaktech.com")))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        // Identity always comes from the authenticated principal — the client
        // cannot ask for another user's profile via this endpoint.
        assertThat(body.path("data").path("email").asText()).isEqualTo("kavya@vishaktech.com");
    }
}
