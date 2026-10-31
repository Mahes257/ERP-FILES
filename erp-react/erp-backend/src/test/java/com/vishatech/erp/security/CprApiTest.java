package com.vishatech.erp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.repository.UserRepository;
import java.util.LinkedHashMap;
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
 * CPR module API verification for the migrated SOURCE implementation:
 * authorization on the CPR endpoints, CPR create + read-back (the CRM client
 * link is persisted), the next-number endpoint, and the shared grid
 * configuration store the CPR / Cost Workout grids depend on.
 *
 * Authorization coverage spans the whole CPR module - CPR, Technical
 * Verification, Cost Workout and Profit Workout - because all four controllers
 * now follow the Purchase / Production guard pattern: class-level CPR_VIEW for
 * reads plus the narrowest CPR authority per mutating operation.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class CprApiTest extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

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

    private String login(String email, String password) throws Exception {
        MvcResult result = mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", email,
                                "password", password))))
                .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("token").asText();
    }

    private void promote(String email, UserRole role) {
        userRepository.findByEmail(email).ifPresent(user -> {
            user.setRole(role);
            userRepository.save(user);
        });
    }

    private long createCpr(String token, String referencePrNo) throws Exception {
        MvcResult created = mockMvc.perform(post("/cprs")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "referencePrNo", referencePrNo,
                                "clientId", 4242,
                                "clientName", "Cpr Test Client",
                                "department", "Sales",
                                "items", List.of(Map.of(
                                        "drawingNo", "DRW-1",
                                        "description", "Test item",
                                        "qty", 1,
                                        "unit", "Nos"))))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();
    }

    /** One CPR create payload carrying the given Reference PR No + item rows. */
    private Map<String, Object> cprPayload(String referencePrNo, List<Map<String, Object>> items) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("referencePrNo", referencePrNo);
        payload.put("clientId", 4242);
        payload.put("clientName", "Cpr Test Client");
        payload.put("department", "Sales");
        payload.put("items", items);
        return payload;
    }

    /** One CPR item row; {@code notes} is sent only when provided. */
    private Map<String, Object> cprItem(String description, String notes) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("drawingNo", "DRW-1");
        item.put("description", description);
        item.put("qty", 1);
        item.put("unit", "Nos");
        if (notes != null) {
            item.put("notes", notes);
        }
        return item;
    }

    /**
     * A Reference PR No belongs to exactly one live CPR: a second CPR (and an
     * edit of a DIFFERENT CPR) reusing it is rejected case-insensitively and
     * after trimming, while the owning CPR keeps its own value on edit and a
     * distinct number stays valid.
     */
    @Test
    void duplicateReferencePrNoIsRejectedButTheOwningCprAndDistinctNumbersStayValid() throws Exception {
        String token = register("cpr-dup-ref@example.com", "CPR Duplicate Ref");
        String referencePrNo = "PR-DUP-" + System.nanoTime();
        long id = createCpr(token, referencePrNo);

        mockMvc.perform(post("/cprs")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cprPayload(
                                "  " + referencePrNo.toLowerCase() + "  ",
                                List.of(cprItem("Another item", null))))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("already used by CPR")));

        // The record that OWNS the number keeps it when edited.
        mockMvc.perform(put("/cprs/" + id)
                        .param("draft", "true")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cprPayload(
                                referencePrNo, List.of(cprItem("Updated item", "Own note"))))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.referencePrNo").value(referencePrNo));

        // A different Reference PR No is still accepted.
        long distinctId = createCpr(token, referencePrNo + "-B");
        assertThat(distinctId).isPositive();
    }

    /**
     * Item notes are per-item, survive save + read-back, and editing one item's
     * notes never overwrites another item's notes. Notes are stored in the
     * existing item payload (not as a custom-column value).
     */
    @Test
    void itemNotesRoundTripAndStayIndependentPerItem() throws Exception {
        String token = register("cpr-item-notes@example.com", "CPR Item Notes");
        String referencePrNo = "PR-NOTES-" + System.nanoTime();

        MvcResult created = mockMvc.perform(post("/cprs")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cprPayload(referencePrNo, List.of(
                                cprItem("First item", "First line\nSecond line"),
                                cprItem("Second item", "Second item note"))))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.items[0].notes").value("First line\nSecond line"))
                .andExpect(jsonPath("$.data.items[1].notes").value("Second item note"))
                .andReturn();
        long id = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        mockMvc.perform(get("/cprs/" + id)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].notes").value("First line\nSecond line"))
                .andExpect(jsonPath("$.data.items[1].notes").value("Second item note"))
                .andExpect(jsonPath("$.data.items[0].customFields.notes").doesNotExist());

        // Edit only the FIRST item's notes; the second item keeps its own note.
        mockMvc.perform(put("/cprs/" + id)
                        .param("draft", "true")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cprPayload(referencePrNo, List.of(
                                cprItem("First item", "Edited first note"),
                                cprItem("Second item", "Second item note"))))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].notes").value("Edited first note"))
                .andExpect(jsonPath("$.data.items[1].notes").value("Second item note"));
    }

    @Test
    void cprEndpointsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/cprs")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/cpr-technical-verifications")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/cost-workouts")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/profit-workouts")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/settings/grid-configs/cpr.items")).andExpect(status().isUnauthorized());
    }

    @Test
    void cprCreatePersistsTheClientLinkAndReadsBack() throws Exception {
        String token = register("cpr-user@example.com", "CPR User");

        MvcResult created = mockMvc.perform(post("/cprs")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "referencePrNo", "PR-TEST-0001",
                                "clientId", 4242,
                                "clientName", "Cpr Test Client",
                                "department", "Sales",
                                "items", List.of(Map.of(
                                        "drawingNo", "DRW-1",
                                        "description", "Test item",
                                        "qty", 1,
                                        "unit", "Nos"))))))
                .andExpect(status().isCreated())
                .andReturn();

        long id = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        mockMvc.perform(get("/cprs/" + id)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.clientId").value(4242))
                .andExpect(jsonPath("$.data.referencePrNo").value("PR-TEST-0001"))
                .andExpect(jsonPath("$.data.prNo").isNotEmpty());
    }

    @Test
    void cprNextNumberAndGridConfigStoreWork() throws Exception {
        String token = register("cpr-grid-user@example.com", "CPR Grid User");

        mockMvc.perform(get("/cprs/next-number")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.nextNumber").isNotEmpty());

        List<Map<String, Object>> config = List.of(
                Map.of("id", "sno", "key", "sno", "label", "#", "type", "text", "order", 1),
                Map.of("id", "description", "key", "description", "label", "Description",
                        "type", "text", "order", 2));

        mockMvc.perform(put("/settings/grid-configs/cpr.test.items")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(config)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/settings/grid-configs/cpr.test.items")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value("sno"))
                .andExpect(jsonPath("$.data[1].label").value("Description"));
    }

    /**
     * The class-level CPR_VIEW guard must not lock out the ordinary CPR role:
     * every read surface of all four CPR subsections stays reachable, and the
     * non-approval workflow actions stay usable because the USER role holds
     * CPR_CREATE + CPR_EDIT.
     */
    @Test
    void cprReadSurfacesAndEditActionsStayAvailableToTheCprRole() throws Exception {
        String token = register("cpr-reader@example.com", "CPR Reader");

        List<String> readEndpoints = List.of(
                "/cprs",
                "/cprs/stats",
                "/cprs/reports/summary",
                "/cpr-technical-verifications",
                "/cpr-technical-verifications/stats",
                "/cost-workouts",
                "/cost-workouts/stats",
                "/cost-workouts/next-number",
                "/profit-workouts",
                "/profit-workouts/stats",
                "/profit-workouts/next-number");
        for (String endpoint : readEndpoints) {
            mockMvc.perform(get(endpoint).header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk());
        }

        long id = createCpr(token, "PR-READ-0001");

        // CPR_EDIT: the submit step is a record edit, not an approval decision.
        mockMvc.perform(post("/cprs/" + id + "/submit")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        // CPR_CREATE: duplicating creates a new record.
        mockMvc.perform(post("/cprs/" + id + "/duplicate")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated());

        // CPR_EDIT: comments and the restorable delete stay available.
        mockMvc.perform(post("/cprs/" + id + "/comments")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("text", "Checked the drawing"))))
                .andExpect(status().isCreated());
    }

    /**
     * Approval decisions and permanent deletion need authorities the USER role
     * does not hold. Before the CPR controllers were aligned with the
     * Purchase / Production guard pattern these endpoints had no authorization
     * at all, so any authenticated user could approve a CPR.
     */
    @Test
    void approvalsAndPermanentDeleteRequireTheNarrowerCprAuthorities() throws Exception {
        String managerEmail = "cpr-approver@example.com";
        register(managerEmail, "CPR Approver");
        String userToken = login(managerEmail, "password123");

        long id = createCpr(userToken, "PR-APPROVE-0001");

        mockMvc.perform(post("/cprs/" + id + "/submit")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk());

        mockMvc.perform(post("/cprs/" + id + "/approve")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("remarks", "Self approval"))))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/cprs/" + id + "/float")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("destination", "PR"))))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/cprs/bulk-permanent-delete")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("ids", List.of(id)))))
                .andExpect(status().isForbidden());

        // The same decisions succeed for a role that holds CPR_APPROVE / CPR_DELETE.
        promote(managerEmail, UserRole.MANAGER);
        String managerToken = login(managerEmail, "password123");

        mockMvc.perform(post("/cprs/" + id + "/approve")
                        .header("Authorization", "Bearer " + managerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("remarks", "Approved"))))
                .andExpect(status().isOk());

        mockMvc.perform(post("/cprs/bulk-permanent-delete")
                        .header("Authorization", "Bearer " + managerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("ids", List.of(id)))))
                .andExpect(status().isOk());
    }

    /**
     * The two levels of CPR deletion, and why their authorities differ.
     *
     * <p>The restorable delete is an everyday record edit: {@code DELETE
     * /cprs/{id}} and {@code POST /cprs/bulk-delete} both require CPR_EDIT, the
     * record is only moved to the trash ("CPR moved to trash") and stays
     * restorable. Permanent deletion is a different operation carrying a
     * narrower authority: {@code POST /cprs/bulk-permanent-delete} requires
     * CPR_DELETE, which the USER role does not hold (see {@code RolePermissions}).
     * The pair is therefore deliberate rather than inconsistent, and the single
     * delete cannot drift away from its bulk counterpart unnoticed — this test
     * pins both levels, plus the fact that authorization is decided before
     * request validation.
     */
    @Test
    void restorableDeleteIsAnEditWhilePermanentDeleteNeedsTheNarrowerAuthority() throws Exception {
        // Unauthenticated callers are refused before any authority is consulted.
        mockMvc.perform(delete("/cprs/1")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/cprs/bulk-delete")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("ids", List.of(1)))))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/cprs/bulk-permanent-delete")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("ids", List.of(1)))))
                .andExpect(status().isUnauthorized());

        String email = "cpr-delete-levels@example.com";
        register(email, "Cpr Delete Levels");
        String userToken = login(email, "password123");

        long singleId = createCpr(userToken, "PR-DELETE-SINGLE");
        long bulkId = createCpr(userToken, "PR-DELETE-BULK");

        // A plain USER holds CPR_EDIT, so the RESTORABLE delete works - the
        // single route and its bulk counterpart agree.
        mockMvc.perform(delete("/cprs/" + singleId)
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                // The existing envelope: ApiResponse.ok(String) carries the text
                // in `message` with a null payload, unchanged by this test.
                .andExpect(jsonPath("$.message").value("CPR moved to trash"));

        mockMvc.perform(post("/cprs/bulk-delete")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("ids", List.of(bulkId)))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        // Validation stays distinct from authorization: this caller IS
        // authorized for the restorable delete, so an empty selection is a
        // 400 (BulkRequest.ids is @NotEmpty), never a 403.
        mockMvc.perform(post("/cprs/bulk-delete")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("ids", List.of()))))
                .andExpect(status().isBadRequest());

        // The permanent delete needs CPR_DELETE: a WELL-FORMED request from the
        // same caller is refused by the authority check.
        mockMvc.perform(post("/cprs/bulk-permanent-delete")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("ids", List.of(bulkId)))))
                .andExpect(status().isForbidden());

        // A malformed body is still a 400 for a caller who IS authorised for the
        // action (see the bulk-delete case above): Spring MVC resolves the body's
        // @Valid before the method-security interceptor. A caller who lacks the
        // permission is refused one step earlier, by the Sales Access Management
        // gate — a servlet HandlerInterceptor, so it runs before argument
        // resolution and before validation — and therefore gets 403 here rather
        // than 400. Neither refusal touches any data, and the 403 above is the
        // answer to a well-formed destructive request, which is the case that
        // matters. The same ordering is pinned for Sales in
        // SalesDocumentAuthorityContractTests, so a change to it stays a visible
        // decision in both modules.
        mockMvc.perform(post("/cprs/bulk-permanent-delete")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("ids", List.of()))))
                .andExpect(status().isForbidden());

        // The authority that DOES hold CPR_DELETE keeps the workflow.
        promote(email, UserRole.MANAGER);
        String managerToken = login(email, "password123");
        mockMvc.perform(post("/cprs/bulk-permanent-delete")
                        .header("Authorization", "Bearer " + managerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("ids", List.of(bulkId)))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    /**
     * Saving an UNCHANGED CPR through the edit form must not fabricate a revision.
     *
     * <p>The edit form submits the whole document, writing blank values for the
     * optional header / item fields whose stored value is null. The change detector
     * compared those raw values, so a no-op save (including the save the item-level
     * CW / PR conversion performs before converting) created a new revision: the
     * record was renumbered, and the page the user came from became a superseded,
     * read-only historical revision. A real edit must still create exactly one
     * revision.
     */
    @Test
    void savingAnUnchangedCprFromTheEditFormDoesNotCreateARevision() throws Exception {
        String token = register("cpr-noop-save@example.com", "Cpr Noop Save");
        String referencePrNo = "PR-NOOP-" + System.nanoTime();
        long id = createCpr(token, referencePrNo);

        // The shape the edit form submits: the full header, with "" for every
        // optional field the created record leaves null, plus the item fields the
        // grid always sends.
        Map<String, Object> unchanged = cprPayload(referencePrNo, List.of(unchangedItem()));
        for (String field : List.of("project", "leadNo", "pan", "vendor", "remarks", "description",
                "quotationDeadline", "extendedDeadline")) {
            unchanged.put(field, "");
        }

        MvcResult saved = mockMvc.perform(put("/cprs/" + id)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(unchanged)))
                .andExpect(status().isOk())
                .andReturn();
        long savedId = objectMapper.readTree(saved.getResponse().getContentAsString())
                .path("data").path("id").asLong();
        // Same row, no revision number in the CPR No.
        assertThat(savedId).isEqualTo(id);
        assertThat(objectMapper.readTree(saved.getResponse().getContentAsString())
                .path("data").path("prNo").asText()).doesNotContain("(");

        // The no-op guard must not hide real edits: a changed department still
        // raises exactly one revision.
        unchanged.put("department", "Production");
        MvcResult revised = mockMvc.perform(put("/cprs/" + id)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(unchanged)))
                .andExpect(status().isOk())
                .andReturn();
        long revisedId = objectMapper.readTree(revised.getResponse().getContentAsString())
                .path("data").path("id").asLong();
        assertThat(revisedId).isNotEqualTo(id);
    }

    /**
     * The real conversion sequence: an item-level CW conversion stores the Cost
     * Workout's subtotal on the CPR, and the form save that precedes a second
     * conversion must then still be a no-op — otherwise the CPR is renumbered and
     * the page the user is working on becomes a superseded, read-only revision.
     */
    @Test
    void savingTheCprAfterAnItemConversionDoesNotCreateARevision() throws Exception {
        String token = register("cpr-conversion-noop@example.com", "Cpr Conversion Noop");
        String referencePrNo = "PR-CONV-NOOP-" + System.nanoTime();

        MvcResult created = mockMvc.perform(post("/cprs")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cprPayload(referencePrNo, List.of(
                                cprItem("First item", "First note"),
                                cprItem("Second item", "Second note"))))))
                .andExpect(status().isCreated())
                .andReturn();
        long id = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();
        long firstItemId = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("items").get(0).path("id").asLong();

        // The verification rows are created from the CPR items on first read.
        MvcResult rows = mockMvc.perform(get("/cpr-technical-verifications/by-cpr/" + id + "/items")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        long tvId = 0;
        for (var row : objectMapper.readTree(rows.getResponse().getContentAsString()).path("data")) {
            if (row.path("cprItemId").asLong() == firstItemId) {
                tvId = row.path("id").asLong();
            }
        }
        assertThat(tvId).isPositive();

        // Convert the FIRST item only: this writes the CW subtotal + status onto
        // the CPR, exactly like the CW / PR buttons on the item grid.
        mockMvc.perform(post("/cpr-technical-verifications/" + tvId + "/convert-to-cost-workout")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.destination").value("CW"));

        // The save the page performs before converting the SECOND item: the edit
        // form loads the CPR (now carrying the CW's cost workout + status) and
        // submits it back untouched.
        MvcResult loaded = mockMvc.perform(get("/cprs/" + id)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        String asTheFormSendsIt = objectMapper.readTree(loaded.getResponse().getContentAsString())
                .path("data").toString();
        MvcResult saved = mockMvc.perform(put("/cprs/" + id)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(asTheFormSendsIt))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(objectMapper.readTree(saved.getResponse().getContentAsString())
                .path("data").path("id").asLong()).isEqualTo(id);
    }

    /**
     * A Technical Verification can be created from the create form without a
     * Division: the create view no longer asks for one, so the request omits it and
     * the backend's own default (TEAM) applies. The CPR / item link and the
     * document number the form shows must still be produced by the server.
     */
    @Test
    void technicalVerificationCanBeCreatedWithoutADivision() throws Exception {
        String token = register("cpr-tv-no-division@example.com", "Cpr Tv No Division");
        String referencePrNo = "PR-TVNODIV-" + System.nanoTime();

        MvcResult created = mockMvc.perform(post("/cprs")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cprPayload(referencePrNo, List.of(
                                cprItem("First item", "First note"),
                                cprItem("Second item", "Second note"))))))
                .andExpect(status().isCreated())
                .andReturn();
        long cprId = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();
        long itemId = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("items").get(0).path("id").asLong();

        // Exactly the payload the create form sends: no division field at all.
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("cprId", cprId);
        request.put("cprItemId", itemId);
        request.put("itemNo", "DRW-1");
        request.put("drawingNumber", "DRW-1");
        request.put("itemDescription", "Test item");
        request.put("fileExists", false);
        request.put("nextReviewDate", null);

        mockMvc.perform(post("/cpr-technical-verifications")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                // The backend's default, not a value invented by the browser.
                .andExpect(jsonPath("$.data.division").value("TEAM"))
                .andExpect(jsonPath("$.data.tvNo").value(org.hamcrest.Matchers.startsWith("TV-")))
                .andExpect(jsonPath("$.data.cprId").value(cprId))
                .andExpect(jsonPath("$.data.cprItemId").value(itemId))
                .andExpect(jsonPath("$.data.drawingNumber").value("DRW-1"))
                .andExpect(jsonPath("$.data.status").value("DRAFT"))
                .andExpect(jsonPath("$.data.cprPrNo").value(org.hamcrest.Matchers.startsWith("CPR-")));
    }

    /** An item row exactly as the CPR item grid serializes it (blank, not null). */
    private Map<String, Object> unchangedItem() {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("drawingNo", "DRW-1");
        item.put("description", "Test item");
        item.put("qty", 1);
        item.put("unit", "Nos");
        item.put("fileName", "");
        item.put("fileSize", 0);
        item.put("fileType", "");
        item.put("attachments", List.of());
        item.put("customFields", Map.of());
        return item;
    }
}
