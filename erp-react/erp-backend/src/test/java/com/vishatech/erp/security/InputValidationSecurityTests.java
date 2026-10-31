package com.vishatech.erp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
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
class InputValidationSecurityTests extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private CustomUserDetailsService userDetailsService;

    private String adminToken() {
        return jwtService.generateToken(userDetailsService.loadUserByUsername("admin@vishaktech.com"));
    }

    @Test
    void sqlInjectionInSearchParamIsNeutralized() throws Exception {
        // Parameterized criteria queries: the payload is treated as a literal
        // string, never executed. The request must succeed (not 500/leak).
        MvcResult result = mockMvc.perform(get("/leads")
                        .header("Authorization", "Bearer " + adminToken())
                        .param("search", "' OR 1=1 --"))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("SQL");
    }

    @Test
    void sqlInjectionInSortParamIsNeutralized() throws Exception {
        // buildSort() maps known fields only — an injected sort must fall back
        // to the safe default instead of breaking the query.
        mockMvc.perform(get("/leads")
                        .header("Authorization", "Bearer " + adminToken())
                        .param("sort", "id;DROP TABLE leads"))
                .andExpect(status().isOk());
    }

    @Test
    void invalidDateParamReturns400Not500() throws Exception {
        mockMvc.perform(get("/leads")
                        .header("Authorization", "Bearer " + adminToken())
                        .param("dateFrom", "not-a-date"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void oversizedPaginationIsClamped() throws Exception {
        MvcResult result = mockMvc.perform(get("/leads")
                        .header("Authorization", "Bearer " + adminToken())
                        .param("size", "999999"))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(result.getResponse().getContentAsString()).contains("\"size\":200");
    }

    @Test
    void invalidLeadBodyRejectedWith400() throws Exception {
        mockMvc.perform(post("/leads")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"pipelineStage\": \"BOGUS\"}"))
                .andExpect(status().is4xxClientError());
    }

    @Test
    void unknownEndpointReturns404() throws Exception {
        mockMvc.perform(get("/does-not-exist")
                        .header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Endpoint not found"));
    }

    @Test
    void missingTokenOnUserListReturns401() throws Exception {
        mockMvc.perform(get("/users")).andExpect(status().isUnauthorized());
    }
}
