package com.vishatech.erp.cpr;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.CprTechnicalVerification;
import com.vishatech.erp.entity.TechnicalVerificationStatus;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.purchase.api.PurchaseRequisitionIngressPort;
import com.vishatech.erp.purchase.api.PurchaseRequisitionIngressResult;
import com.vishatech.erp.repository.CprTechnicalVerificationRepository;
import com.vishatech.erp.repository.PurchaseRequisitionRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.service.PurchaseRequisitionIngressAdapter;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * P3 — transaction atomicity of the CPR conversion across the new ingress port.
 *
 * <p><b>What is injected.</b> The primary {@link PurchaseRequisitionIngressPort}
 * delegates to the <em>real</em> Purchase adapter — so a real requisition row is
 * written through the real requisition service, inside the caller's transaction —
 * and then fails. That is the interesting case: the failure happens
 * <em>after</em> Purchase has accepted and inserted the requisition, which is
 * exactly when a missing shared transaction would leave a committed requisition
 * behind for a CPR row that never got linked.
 *
 * <p><b>What it proves.</b> Both halves of the conversion are still one unit of
 * work: the requisition Purchase inserted is <b>rolled back</b> with the failing
 * conversion, the CPR row is not marked as forwarded, and nothing is left
 * half-written. If the port had introduced its own transaction (or an
 * asynchronous hop), the requisition count would have increased and this test
 * would fail.
 *
 * <p>No live database is involved: the suite runs on in-memory H2.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
@Import(CprPurchaseRequisitionRollbackTests.FailingIngressConfiguration.class)
class CprPurchaseRequisitionRollbackTests extends AbstractSecurityTest {

    /**
     * A port that behaves exactly like the real one until it has succeeded, and
     * then fails: a genuine Purchase insert followed by a genuine exception.
     */
    @TestConfiguration
    static class FailingIngressConfiguration {

        @Bean
        @Primary
        PurchaseRequisitionIngressPort failingIngressPort(PurchaseRequisitionIngressAdapter realAdapter) {
            return request -> {
                PurchaseRequisitionIngressResult accepted = realAdapter.createRequisition(request);
                throw new BadRequestException(
                        "Simulated failure after Purchase accepted requisition " + accepted.prNo());
            };
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private CprTechnicalVerificationRepository tvRepository;

    @Autowired
    private PurchaseRequisitionRepository requisitionRepository;

    private String registerUser() throws Exception {
        MvcResult result = mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "fullName", "P3 Rollback User",
                                "email", "p3-rollback-" + System.nanoTime() + "@example.com",
                                "password", "password123"))))
                .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("token").asText();
    }

    @Test
    void aFailureInsideTheRequisitionBoundaryRollsBackBothHalvesOfTheConversion() throws Exception {
        String token = registerUser();

        MvcResult cpr = mockMvc.perform(post("/cprs")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "referencePrNo", "PR-P3-RB-" + System.nanoTime(),
                                "clientId", 4242,
                                "clientName", "P3 Rollback Client",
                                "department", "Sales",
                                "requestedBy", "Admin User",
                                "priority", "Medium",
                                "requiredDate", LocalDate.now().plusDays(10).toString(),
                                "items", List.of(Map.of(
                                        "drawingNo", "DRW-P3-RB",
                                        "description", "P3 rollback item",
                                        "qty", 2,
                                        "unit", "Nos"))))))
                .andExpect(status().isCreated())
                .andReturn();
        var cprData = objectMapper.readTree(cpr.getResponse().getContentAsString()).path("data");
        long cprId = cprData.path("id").asLong();
        long itemId = cprData.path("items").get(0).path("id").asLong();

        MvcResult tv = mockMvc.perform(post("/cpr-technical-verifications")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "cprId", cprId,
                                "cprItemId", itemId,
                                "itemNo", "DRW-P3-RB",
                                "drawingNumber", "DRW-P3-RB",
                                "itemDescription", "P3 rollback item",
                                "fileExists", true,
                                "division", "TEAM",
                                "status", "APPROVED"))))
                .andExpect(status().isCreated())
                .andReturn();
        long tvId = objectMapper.readTree(tv.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        long requisitionsBefore = requisitionRepository.count();

        mockMvc.perform(post("/cpr-technical-verifications/" + tvId
                        + "/convert-to-purchase-requisition")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().is4xxClientError());

        // 1. The requisition Purchase really inserted inside this transaction is
        //    gone: the conversion and its requisition still commit as one unit.
        assertThat(requisitionRepository.count()).isEqualTo(requisitionsBefore);

        // 2. The CPR row is untouched — not forwarded, not linked, status unchanged.
        CprTechnicalVerification row = tvRepository.findById(tvId).orElseThrow();
        assertThat(row.isForwardedToPurchaseRequisition()).isFalse();
        assertThat(row.getPurchaseRequisitionId()).isNull();
        assertThat(row.getPurchaseRequisitionPrNo()).isNull();
        assertThat(row.getForwardedToPrAt()).isNull();
        assertThat(row.getStatus()).isNotEqualTo(TechnicalVerificationStatus.FORWARDED_TO_PURCHASE_REQUISITION);
    }
}
