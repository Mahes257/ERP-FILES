package com.vishatech.erp.cpr;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.CprTechnicalVerification;
import com.vishatech.erp.entity.PurchaseRequisition;
import com.vishatech.erp.entity.TechnicalVerificationStatus;
import com.vishatech.erp.repository.CprTechnicalVerificationRepository;
import com.vishatech.erp.repository.PurchaseRequisitionRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import java.time.LocalDate;
import java.util.List;
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
 * P3 — the CPR technical-verification → Purchase Requisition conversion through
 * the Purchase-owned ingress port, driven end to end over the real REST API on
 * the H2 test database.
 *
 * <p>What it proves:
 *
 * <ol>
 *   <li>the conversion still works after CPR stopped injecting
 *       {@code PurchaseRequisitionService}: exactly one requisition is created
 *       through Purchase's own creation logic, and its id and PR number are
 *       recorded on the CPR verification row;</li>
 *   <li>the HTTP response fields the frontend reads are unchanged
 *       ({@code destination}, {@code destinationId}, {@code destinationNo},
 *       {@code alreadyConverted}, {@code itemCount}, {@code message});</li>
 *   <li>the conversion stays idempotent — a second call opens the existing
 *       requisition instead of raising a second one;</li>
 *   <li>Purchase's own validation still guards the port path: a requisition
 *       Purchase refuses leaves the CPR row unforwarded and creates nothing;</li>
 *   <li>the endpoint still requires authentication.</li>
 * </ol>
 *
 * <p>No live database is involved: {@link AbstractSecurityTest} points the suite
 * at in-memory H2, and nothing here touches the dev MySQL schema.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class CprPurchaseRequisitionConversionIntegrationTests extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private CprTechnicalVerificationRepository tvRepository;

    @Autowired
    private PurchaseRequisitionRepository requisitionRepository;

    // ------------------------------------------------------------------ helpers

    /** A fresh CPR_CREATE / CPR_EDIT user, exactly like the existing CPR API tests. */
    private String registerUser(String prefix) throws Exception {
        MvcResult result = mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "fullName", "P3 CPR User",
                                "email", prefix + "-" + System.nanoTime() + "@example.com",
                                "password", "password123"))))
                .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("token").asText();
    }

    /** Creates a CPR with exactly one item over the public API; returns {cprId, itemId}. */
    private long[] createCprWithOneItem(String token, String requiredDate) throws Exception {
        return createCprWithOneItem(token, requiredDate, 3);
    }

    /** As above, with an explicit quantity (Purchase validates that it is positive). */
    private long[] createCprWithOneItem(String token, String requiredDate, int qty) throws Exception {
        MvcResult created = mockMvc.perform(post("/cprs")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "referencePrNo", "PR-P3-" + System.nanoTime(),
                                "clientId", 4242,
                                "clientName", "P3 Test Client",
                                "company", "P3 Test Client",
                                "department", "Sales",
                                "requestedBy", "Admin User",
                                "priority", "High",
                                "requiredDate", requiredDate,
                                "items", List.of(Map.of(
                                        "drawingNo", "DRW-P3",
                                        "description", "P3 test item",
                                        "specification", "EN8",
                                        "qty", qty,
                                        "unit", "Nos",
                                        "estimatedCost", 120))))))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode data = objectMapper.readTree(created.getResponse().getContentAsString()).path("data");
        long cprId = data.path("id").asLong();
        long itemId = data.path("items").get(0).path("id").asLong();
        assertThat(cprId).isPositive();
        assertThat(itemId).isPositive();
        return new long[] {cprId, itemId};
    }

    /** Creates the verified technical-verification row for that CPR item; returns its id. */
    private long createVerifiedRow(String token, long cprId, long itemId) throws Exception {
        MvcResult created = mockMvc.perform(post("/cpr-technical-verifications")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "cprId", cprId,
                                "cprItemId", itemId,
                                "itemNo", "DRW-P3",
                                "drawingNumber", "DRW-P3",
                                "itemDescription", "P3 test item",
                                "fileExists", true,
                                "division", "TEAM",
                                "status", "APPROVED"))))
                .andExpect(status().isCreated())
                .andReturn();

        long tvId = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();
        assertThat(tvId).isPositive();
        return tvId;
    }

    private JsonNode convert(String token, long tvId) throws Exception {
        MvcResult result = mockMvc.perform(post("/cpr-technical-verifications/" + tvId
                        + "/convert-to-purchase-requisition")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).path("data");
    }

    // -------------------------------------------------------------------- tests

    @Test
    void convertingAVerifiedItemRaisesExactlyOneRequisitionAndLinksItOnTheCprRow() throws Exception {
        String token = registerUser("p3-convert");
        long[] cpr = createCprWithOneItem(token, LocalDate.now().plusDays(10).toString());
        long tvId = createVerifiedRow(token, cpr[0], cpr[1]);
        long requisitionsBefore = requisitionRepository.count();

        JsonNode data = convert(token, tvId);

        // 1. The response contract the frontend reads is unchanged.
        assertThat(data.path("destination").asText()).isEqualTo("PR");
        assertThat(data.path("alreadyConverted").asBoolean()).isFalse();
        assertThat(data.path("itemCount").asInt()).isEqualTo(1);
        long prId = data.path("destinationId").asLong();
        String prNo = data.path("destinationNo").asText();
        assertThat(prId).isPositive();
        assertThat(prNo).startsWith("PR-");

        // 2. Exactly one requisition was created, through Purchase's own logic.
        assertThat(requisitionRepository.count()).isEqualTo(requisitionsBefore + 1);
        PurchaseRequisition pr = requisitionRepository.findById(prId).orElseThrow();
        assertThat(pr.getPrNo()).isEqualTo(prNo);
        assertThat(pr.getPrType()).isEqualTo("CPR");
        assertThat(pr.getDepartment()).isEqualTo("Sales");
        assertThat(pr.getPriority()).isEqualTo("High");
        assertThat(pr.getRequester()).isEqualTo("Admin User");
        assertThat(pr.getExpectedDate()).isEqualTo(LocalDate.now().plusDays(10).toString());
        // The PR number the caller was told about is the number Purchase allocated.
        assertThat(requisitionRepository.findByPrNo(prNo)).isPresent();

        // 3. The CPR verification row records the requisition it caused.
        CprTechnicalVerification row = tvRepository.findById(tvId).orElseThrow();
        assertThat(row.isForwardedToPurchaseRequisition()).isTrue();
        assertThat(row.getPurchaseRequisitionId()).isEqualTo(prId);
        assertThat(row.getPurchaseRequisitionPrNo()).isEqualTo(prNo);
        assertThat(row.getForwardedToPrAt()).isNotNull();
        assertThat(row.getForwardedToPrBy()).isNotBlank();
        assertThat(row.getStatus())
                .isEqualTo(TechnicalVerificationStatus.FORWARDED_TO_PURCHASE_REQUISITION);
    }

    @Test
    void repeatingTheConversionOpensTheExistingRequisitionInsteadOfCreatingADuplicate() throws Exception {
        String token = registerUser("p3-repeat");
        long[] cpr = createCprWithOneItem(token, LocalDate.now().plusDays(10).toString());
        long tvId = createVerifiedRow(token, cpr[0], cpr[1]);
        long requisitionsBefore = requisitionRepository.count();

        JsonNode first = convert(token, tvId);
        JsonNode second = convert(token, tvId);

        assertThat(requisitionRepository.count()).isEqualTo(requisitionsBefore + 1);
        assertThat(second.path("alreadyConverted").asBoolean()).isTrue();
        assertThat(second.path("destinationId").asLong()).isEqualTo(first.path("destinationId").asLong());
        assertThat(second.path("destinationNo").asText()).isEqualTo(first.path("destinationNo").asText());
        assertThat(second.path("message").asText()).contains("already converted");
    }

    @Test
    void aRequisitionValidationFailureLeavesTheCprRowUnforwarded() throws Exception {
        String token = registerUser("p3-reject");
        // The CPR item carries a zero quantity, so the requisition the conversion
        // builds fails a rule Purchase itself owns and enforces ("Item quantity
        // must be positive"). Nothing test-only is wired in: the real Purchase
        // validation fails and the CPR row must not be left claiming success.
        //
        // (A past required date no longer reproduces this: the conversion carries a
        // CPR deadline that is still ahead and otherwise falls back to the
        // requisition's own request date, so a passed CPR deadline converts instead
        // of failing — see CprItemConversionTests.)
        long[] cpr = createCprWithOneItem(token,
                LocalDate.now().plusDays(10).toString(), 0);
        long tvId = createVerifiedRow(token, cpr[0], cpr[1]);
        long requisitionsBefore = requisitionRepository.count();

        mockMvc.perform(post("/cpr-technical-verifications/" + tvId
                        + "/convert-to-purchase-requisition")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().is4xxClientError());

        // Purchase refused it, and the CPR row was not left claiming success.
        assertThat(requisitionRepository.count()).isEqualTo(requisitionsBefore);
        CprTechnicalVerification row = tvRepository.findById(tvId).orElseThrow();
        assertThat(row.isForwardedToPurchaseRequisition()).isFalse();
        assertThat(row.getPurchaseRequisitionId()).isNull();
        assertThat(row.getPurchaseRequisitionPrNo()).isNull();
        assertThat(row.getStatus()).isNotEqualTo(TechnicalVerificationStatus.FORWARDED_TO_PURCHASE_REQUISITION);
    }

    @Test
    void theConversionEndpointStillRequiresAuthentication() throws Exception {
        mockMvc.perform(post("/cpr-technical-verifications/1/convert-to-purchase-requisition"))
                .andExpect(status().isUnauthorized());
    }
}
