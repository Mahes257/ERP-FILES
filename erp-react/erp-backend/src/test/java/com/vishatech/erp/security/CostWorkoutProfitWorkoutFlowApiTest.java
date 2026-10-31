package com.vishatech.erp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.entity.Quotation;
import com.vishatech.erp.repository.QuotationRepository;
import com.vishatech.erp.service.ProfitWorkoutService;
import com.vishatech.erp.repository.UserRepository;
import com.vishatech.erp.crm.entity.Lead;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * End-to-end HTTP verification of the Cost Workout → Profit Workout workflow on
 * the isolated H2 test database (the real MySQL database is never touched).
 *
 * <p>Pins the business rule that a Profit Workout is created <b>only</b> by the
 * explicit {@code POST /cost-workouts/{id}/convert-to-profit-workout} action:
 *
 * <ol>
 *   <li>creating (and saving) a Cost Workout leaves the Profit Workout count
 *       unchanged;</li>
 *   <li>submitting and approving it still leaves the Profit Workout count
 *       unchanged (approval no longer auto-generates a Profit Workout);</li>
 *   <li>the explicit conversion creates exactly one Profit Workout, linked back
 *       to the Cost Workout, and leaves the Cost Workout itself untouched;</li>
 *   <li>repeating the same conversion is idempotent — no duplicate is created.</li>
 * </ol>
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class CostWorkoutProfitWorkoutFlowApiTest extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private QuotationRepository quotationRepository;

    private String registerManager(String email) throws Exception {
        MvcResult registered = mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "fullName", "CW Flow Manager",
                                "email", email,
                                "password", "password123"))))
                .andReturn();
        assertThat(registered.getResponse().getStatus()).isEqualTo(201);

        userRepository.findByEmail(email).ifPresent(user -> {
            user.setRole(UserRole.MANAGER);
            userRepository.save(user);
        });

        MvcResult loggedIn = mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", email,
                                "password", "password123"))))
                .andReturn();
        assertThat(loggedIn.getResponse().getStatus()).isEqualTo(200);
        return objectMapper.readTree(loggedIn.getResponse().getContentAsString())
                .path("data").path("token").asText();
    }

    /** Total persisted Profit Workouts (matches the module KPI count). */
    private long profitWorkoutCount(String token) throws Exception {
        MvcResult result = mockMvc.perform(get("/profit-workouts")
                        .param("page", "0").param("size", "1")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .path("totalElements").asLong();
    }

    private long createCostWorkout(String token) throws Exception {
        Map<String, Object> body = Map.of(
                "cwDate", "2026-10-09",
                "status", "completed",
                "preparedBy", "API Tester",
                "department", "Engineering",
                "sourceLead", "Lead-Flow-1",
                "customerName", "Flow Test Client",
                "items", List.of(Map.of(
                        "description", "Widget",
                        "qty", 1,
                        "unit", "Nos",
                        "categories", List.of(Map.of(
                                "category", "Material Cost",
                                "qty", 1,
                                "unit", "Nos",
                                "rate", 10)))));
        MvcResult created = mockMvc.perform(post("/cost-workouts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();
    }

    @Test
    void creatingSavingAndApprovingACostWorkoutNeverCreatesAProfitWorkout() throws Exception {
        String token = registerManager("cw-flow-manager@example.com");

        long pwBefore = profitWorkoutCount(token);

        // 1-2. Create + save the Cost Workout (persists as its own row).
        long cwId = createCostWorkout(token);

        // 3. The save operation created NO Profit Workout.
        assertThat(profitWorkoutCount(token))
                .as("Profit Workouts after creating a Cost Workout")
                .isEqualTo(pwBefore);

        // The Cost Workout itself is persisted and not yet converted.
        mockMvc.perform(get("/cost-workouts/" + cwId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(cwId));

        // 4. Submit then approve. Approval must NOT auto-create a Profit Workout.
        mockMvc.perform(post("/cost-workouts/" + cwId + "/submit")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        mockMvc.perform(post("/cost-workouts/" + cwId + "/approve")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("remarks", "Approved by test"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("approved"));

        assertThat(profitWorkoutCount(token))
                .as("Profit Workouts after approving the Cost Workout")
                .isEqualTo(pwBefore);
    }

    /**
     * Submitting a Cost Workout (the list's "Submit for Approval" action) must
     * leave it in the approval queue even when an edit-form save — or the 30 s
     * autosave — follows.
     *
     * <p>The edit form only carries the FORM-LEVEL status (Draft / Completed;
     * the autosave always sends "draft"), so applying it to a record whose status
     * is SUBMITTED silently un-submitted the document: it disappeared from the
     * approval queue (which selects `status = SUBMITTED`) and could no longer be
     * approved or rejected. Those two states belong to the approval endpoints.
     */
    @Test
    void editingAfterSubmissionKeepsTheCostWorkoutInTheApprovalQueue() throws Exception {
        String token = registerManager("cw-approval-queue-manager@example.com");
        long cwId = createCostWorkout(token);

        // Submit for approval — the state the approval queue queries on.
        mockMvc.perform(post("/cost-workouts/" + cwId + "/submit")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("submitted"));

        Map<String, Object> editForm = Map.of(
                "cwDate", "2026-10-10",
                "status", "draft",
                "preparedBy", "API Tester",
                "department", "Engineering",
                "sourceLead", "Lead-Flow-1",
                "customerName", "Flow Test Client",
                "items", List.of(Map.of(
                        "description", "Widget",
                        "qty", 1,
                        "unit", "Nos",
                        "categories", List.of(Map.of(
                                "category", "Material Cost",
                                "qty", 1,
                                "unit", "Nos",
                                "rate", 12)))));

        // 1. Explicit save from the edit page: the form's status dropdown reads
        //    Draft, but the record's approval state must survive the save.
        MvcResult saved = mockMvc.perform(put("/cost-workouts/" + cwId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(editForm)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("submitted"))
                .andReturn();
        long revisionId = objectMapper.readTree(saved.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        // 2. The background autosave (draft=true) of the same record.
        mockMvc.perform(put("/cost-workouts/" + revisionId)
                        .param("draft", "true")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(editForm)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("submitted"));

        // 3. The record is still the persisted SUBMITTED document the approval
        //    queue lists, so the approver can still approve it.
        mockMvc.perform(get("/cost-workouts/" + revisionId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("submitted"));
        mockMvc.perform(get("/cost-workouts")
                        .param("status", "submitted")
                        .param("size", "200")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id == " + revisionId + ")].status")
                        .value(org.hamcrest.Matchers.hasItem("submitted")));

        mockMvc.perform(post("/cost-workouts/" + revisionId + "/approve")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("remarks", "Approved by test"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("approved"));
    }

    /**
     * Cost Workout → Quotation: the Cost Workout's material/item detail has to
     * reach the quotation's item grid, and the quotation must stay linked to the
     * Cost Workout it came from.
     *
     * <p>A Cost Workout holds the company's own costing of the job, so what the
     * quotation's items carry is the Cost Workout's item data: its description /
     * material / name, its quantity and unit, its cost (the sum of its category
     * rows, spread over its quantity, so the line total equals the Cost Workout
     * item total), the cost breakdown as the item's own detail rows, the delivery
     * lead time read off the "Lead Time" row (never counted as money), and the
     * item's user-defined column values.
     */
    @Test
    void convertingACostWorkoutToAQuotationCarriesItsItemDetail() throws Exception {
        String token = registerManager("cw-quotation-manager@example.com");

        Map<String, Object> body = Map.ofEntries(
                Map.entry("cwDate", "2026-10-09"),
                Map.entry("status", "completed"),
                Map.entry("preparedBy", "API Tester"),
                Map.entry("department", "Engineering"),
                Map.entry("sourceLead", "Lead-Quotation-Flow-1"),
                Map.entry("customerName", "Quotation Flow Client"),
                Map.entry("company", "Quotation Flow Client"),
                Map.entry("gstPct", 18),
                Map.entry("items", List.of(Map.of(
                        "description", "Steel Plate 5mm",
                        "qty", 10,
                        "unit", "Nos",
                        "customFields", Map.of("heatNo", "H-9912"),
                        "categories", List.of(
                                Map.of("category", "Material Cost", "qty", 1, "unit", "Nos",
                                        "rate", 250, "notes", "Ground finish"),
                                Map.of("category", "Lead Time", "qty", 6, "unit", "Weeks",
                                        "rate", 0, "notes", "6 weeks after PO"))))));

        MvcResult created = mockMvc.perform(post("/cost-workouts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode cw = objectMapper.readTree(created.getResponse().getContentAsString()).path("data");
        long cwId = cw.path("id").asLong();
        String cwNo = cw.path("cwNo").asText();

        mockMvc.perform(post("/cost-workouts/" + cwId + "/submit")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        mockMvc.perform(post("/cost-workouts/" + cwId + "/approve")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("remarks", "Approved by test"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("approved"));

        // The conversion persists a real quotation and reports it.
        MvcResult converted = mockMvc.perform(post("/cost-workouts/" + cwId + "/convert-to-quotation")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.module").value("quotation"))
                .andExpect(jsonPath("$.data.number").isNotEmpty())
                .andReturn();
        JsonNode conversion = objectMapper.readTree(converted.getResponse().getContentAsString()).path("data");
        long quotationId = conversion.path("id").asLong();
        String quotationNo = conversion.path("number").asText();

        // Reopening the quotation shows the transferred item detail.
        MvcResult fetched = mockMvc.perform(get("/quotations/" + quotationId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode quotation = objectMapper.readTree(fetched.getResponse().getContentAsString()).path("data");
        assertThat(quotation.path("sourceCw").asText()).isEqualTo(cwNo);
        assertThat(quotation.path("items")).hasSize(1);

        JsonNode item = quotation.path("items").get(0);
        assertThat(item.path("productName").asText()).isEqualTo("Steel Plate 5mm");
        assertThat(item.path("description").asText()).isEqualTo("Steel Plate 5mm");
        assertThat(item.path("material").asText()).isEqualTo("Steel Plate 5mm");
        assertThat(item.path("uom").asText()).isEqualTo("Nos");
        assertThat(item.path("qty").decimalValue()).isEqualByComparingTo("10");
        // 1 × 250 over qty 10 keeps the line total equal to the Cost Workout item total.
        assertThat(item.path("rate").decimalValue()).isEqualByComparingTo("25");
        assertThat(item.path("gstRate").decimalValue()).isEqualByComparingTo("18");
        // The breakdown travels as the item's own detail rows.
        assertThat(item.path("descriptionRows")).hasSize(1);
        assertThat(item.path("descriptionRows").get(0).path("label").asText()).isEqualTo("Material Cost");
        assertThat(item.path("descriptionRows").get(0).path("value").asText())
                .isEqualTo("1 Nos × 250.00 — Ground finish");
        // The Lead Time row becomes the item's lead time, never money.
        assertThat(item.path("leadTime").asText()).isEqualTo("6 weeks after PO");
        // The item's user-defined column values survive.
        assertThat(item.path("customFields").path("heatNo").asText()).isEqualTo("H-9912");

        // The Cost Workout is linked to the quotation and left otherwise intact.
        mockMvc.perform(get("/cost-workouts/" + cwId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.convertedToQtn").value(quotationNo))
                .andExpect(jsonPath("$.data.items[0].description").value("Steel Plate 5mm"));

        // Repeating the conversion can never create a second quotation: the
        // established duplicate answer is 409 Conflict, naming the document that
        // already exists for this Cost Workout.
        mockMvc.perform(post("/cost-workouts/" + cwId + "/convert-to-quotation")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isConflict());
    }

    /** The payload the conversion-prefilled Profit Workout form posts on Save. */
    private Map<String, Object> prefilledPwBody(long cwId) {
        return Map.ofEntries(
                Map.entry("pwDate", "2026-10-09"),
                Map.entry("status", "draft"),
                Map.entry("preparedBy", "API Tester"),
                Map.entry("department", "Engineering"),
                Map.entry("sourceLead", "Lead-Flow-1"),
                Map.entry("customerName", "Flow Test Client"),
                Map.entry("currency", "INR"),
                Map.entry("profitPct", 10),
                Map.entry("gstPct", 18),
                Map.entry("sourceCwId", cwId),
                Map.entry("items", List.of(Map.of(
                        "description", "Widget",
                        "qty", 1,
                        "category", "Material Cost",
                        "unit", "Nos",
                        "costRate", 10,
                        "sellingRate", 11))));
    }

    private String costWorkoutNumber(String token, long cwId) throws Exception {
        MvcResult cwResult = mockMvc.perform(get("/cost-workouts/" + cwId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(cwResult.getResponse().getContentAsString()).path("data").path("cwNo").asText();
    }

    /**
     * Two simultaneous saves for the same Cost Workout (double click, retry, two
     * tabs) must still produce exactly ONE Profit Workout. The source CW row is
     * locked for the conversion transaction, so the loser sees the committed
     * conversion and is rejected with the normal 409 instead of inserting a
     * second record.
     */
    @Test
    void concurrentSavesForTheSameCostWorkoutCreateExactlyOneProfitWorkout() throws Exception {
        String token = registerManager("cw-race-manager@example.com");
        long cwId = createCostWorkout(token);
        String cwNo = costWorkoutNumber(token, cwId);
        long pwBefore = profitWorkoutCount(token);

        Map<String, Object> body = prefilledPwBody(cwId);
        String json = objectMapper.writeValueAsString(body);

        // More than two contenders so the race is not just one clean overlap.
        int contenders = 3;
        ExecutorService pool = Executors.newFixedThreadPool(contenders);
        CyclicBarrier start = new CyclicBarrier(contenders);
        List<Future<Integer>> results = new ArrayList<>();
        try {
            for (int i = 0; i < contenders; i++) {
                results.add(pool.submit(() -> {
                    start.await(10, TimeUnit.SECONDS);
                    return mockMvc.perform(post("/profit-workouts")
                                    .header("Authorization", "Bearer " + token)
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(json))
                            .andReturn().getResponse().getStatus();
                }));
            }
        } finally {
            pool.shutdown();
        }

        List<Integer> statuses = new ArrayList<>();
        for (Future<Integer> future : results) {
            statuses.add(future.get(60, TimeUnit.SECONDS));
        }

        assertThat(statuses)
                .as("exactly one concurrent save wins; every other is rejected as a duplicate")
                .containsExactlyInAnyOrder(201, 409, 409);
        assertThat(profitWorkoutCount(token))
                .as("exactly one Profit Workout after two simultaneous saves")
                .isEqualTo(pwBefore + 1);

        // The single surviving Profit Workout is the one the Cost Workout links to.
        MvcResult cwResult = mockMvc.perform(get("/cost-workouts/" + cwId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode cw = objectMapper.readTree(cwResult.getResponse().getContentAsString()).path("data");
        assertThat(cw.path("convertedToPwId").asLong()).isPositive();
        assertThat(cw.path("convertedToPw").asText()).isNotEmpty();
        mockMvc.perform(get("/profit-workouts/" + cw.path("convertedToPwId").asLong())
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sourceCwId").value(cwId))
                .andExpect(jsonPath("$.data.sourceCwNo").value(cwNo));
    }

    /**
     * The two supported creation paths for a Cost Workout conversion — the
     * prefilled form Save and the legacy {@code POST /cost-workouts/{id}/
     * convert-to-profit-workout} action — take the same source-CW row lock, so
     * firing both at the same moment still yields exactly ONE Profit Workout.
     *
     * <p>Whichever wins, the Cost Workout links to that single record, the legacy
     * call answers with the same Profit Workout (it is idempotent, never a 409),
     * and the form Save is either the winner (201) or the duplicate (409).
     */
    @Test
    void legacyConversionCannotRaceWithThePrefilledSave() throws Exception {
        String token = registerManager("cw-crosspath-manager@example.com");
        long cwId = createCostWorkout(token);
        String cwNo = costWorkoutNumber(token, cwId);
        long pwBefore = profitWorkoutCount(token);

        String json = objectMapper.writeValueAsString(prefilledPwBody(cwId));
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CyclicBarrier start = new CyclicBarrier(2);
        try {
            Future<Integer> formSave = pool.submit(() -> {
                start.await(10, TimeUnit.SECONDS);
                return mockMvc.perform(post("/profit-workouts")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(json))
                        .andReturn().getResponse().getStatus();
            });
            Future<MvcResult> legacy = pool.submit(() -> {
                start.await(10, TimeUnit.SECONDS);
                return mockMvc.perform(post("/cost-workouts/" + cwId + "/convert-to-profit-workout")
                                .header("Authorization", "Bearer " + token))
                        .andReturn();
            });

            MvcResult legacyResult = legacy.get(60, TimeUnit.SECONDS);
            assertThat(legacyResult.getResponse().getStatus()).isEqualTo(200);
            long legacyPwId = objectMapper.readTree(legacyResult.getResponse().getContentAsString())
                    .path("data").path("id").asLong();

            int formStatus = formSave.get(60, TimeUnit.SECONDS);
            assertThat(formStatus)
                    .as("the prefilled save either wins or is rejected as a duplicate")
                    .isIn(201, 409);

            assertThat(profitWorkoutCount(token))
                    .as("one Profit Workout for the Cost Workout, whichever path won")
                    .isEqualTo(pwBefore + 1);

            MvcResult cwResult = mockMvc.perform(get("/cost-workouts/" + cwId)
                            .header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode cw = objectMapper.readTree(cwResult.getResponse().getContentAsString()).path("data");
            assertThat(cw.path("convertedToPwId").asLong())
                    .as("the Cost Workout links to the single Profit Workout")
                    .isEqualTo(legacyPwId);
            mockMvc.perform(get("/profit-workouts/" + legacyPwId)
                            .header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.sourceCwId").value(cwId))
                    .andExpect(jsonPath("$.data.sourceCwNo").value(cwNo));
        } finally {
            pool.shutdown();
        }
    }

    /**
     * A prefilled save that fails validation (here: no Prepared By) is rejected
     * before anything is written: no Profit Workout row appears and the Cost
     * Workout is not linked, so the user's reviewed form can be fixed and retried.
     */
    @Test
    void invalidPrefilledSaveCreatesNoProfitWorkoutAndLeavesTheCostWorkoutUntouched() throws Exception {
        String token = registerManager("cw-invalid-manager@example.com");
        long cwId = createCostWorkout(token);
        long pwBefore = profitWorkoutCount(token);

        Map<String, Object> body = new java.util.HashMap<>(prefilledPwBody(cwId));
        body.remove("preparedBy");

        mockMvc.perform(post("/profit-workouts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());

        assertThat(profitWorkoutCount(token))
                .as("a rejected prefill save writes nothing")
                .isEqualTo(pwBefore);
        MvcResult cwResult = mockMvc.perform(get("/cost-workouts/" + cwId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode cw = objectMapper.readTree(cwResult.getResponse().getContentAsString()).path("data");
        assertThat(cw.path("convertedToPw").isNull() || cw.path("convertedToPw").asText().isEmpty())
                .as("a rejected prefill save does not link the Cost Workout")
                .isTrue();
        assertThat(cw.path("convertedToPwId").isNull() || cw.path("convertedToPwId").isMissingNode())
                .as("a rejected prefill save does not link the Cost Workout")
                .isTrue();
    }

    /**
     * The Profit Workout creation form is prefilled from a Cost Workout and saved
     * by the user (no automatic conversion). The saved record must keep its own
     * Profit Workout number plus the real source Cost Workout reference, link the
     * Cost Workout back to it, and the one-CW→one-PW rule must hold server-side.
     */
    @Test
    void prefilledCreationKeepsTheSourceCostWorkoutAndBlocksADuplicate() throws Exception {
        String token = registerManager("cw-prefill-manager@example.com");
        long cwId = createCostWorkout(token);

        MvcResult cwResult = mockMvc.perform(get("/cost-workouts/" + cwId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode cw = objectMapper.readTree(cwResult.getResponse().getContentAsString()).path("data");
        String cwNo = cw.path("cwNo").asText();
        assertThat(cw.path("convertedToPw").isNull() || cw.path("convertedToPw").asText().isEmpty())
                .as("a Cost Workout that has not been converted")
                .isTrue();

        Map<String, Object> body = prefilledPwBody(cwId);

        MvcResult created = mockMvc.perform(post("/profit-workouts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.sourceCwId").value(cwId))
                .andExpect(jsonPath("$.data.sourceCwNo").value(cwNo))
                .andExpect(jsonPath("$.data.status").value("draft"))
                .andReturn();
        JsonNode pw = objectMapper.readTree(created.getResponse().getContentAsString()).path("data");
        long pwId = pw.path("id").asLong();
        String pwNo = pw.path("pwNo").asText();
        assertThat(pwNo).isNotBlank().isNotEqualTo(cwNo);

        // The Cost Workout links back to the saved Profit Workout, its own
        // business data untouched.
        mockMvc.perform(get("/cost-workouts/" + cwId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.convertedToPw").value(pwNo))
                .andExpect(jsonPath("$.data.convertedToPwId").value(pwId))
                .andExpect(jsonPath("$.data.cwNo").value(cwNo))
                .andExpect(jsonPath("$.data.status").value("completed"))
                .andExpect(jsonPath("$.data.items[0].description").value("Widget"));

        // A second save from the same conversion is rejected — never a duplicate.
        long pwBefore = profitWorkoutCount(token);
        mockMvc.perform(post("/profit-workouts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isConflict());
        assertThat(profitWorkoutCount(token)).isEqualTo(pwBefore);

        // The saved Profit Workout reopens with the reviewed values.
        mockMvc.perform(get("/profit-workouts/" + pwId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.pwNo").value(pwNo))
                .andExpect(jsonPath("$.data.sourceCwNo").value(cwNo))
                .andExpect(jsonPath("$.data.items[0].costRate").value(10));
    }

    @Test
    void explicitConversionCreatesOneLinkedProfitWorkoutAndIsIdempotent() throws Exception {
        String token = registerManager("cw-convert-manager@example.com");

        long pwBefore = profitWorkoutCount(token);
        long cwId = createCostWorkout(token);

        // 5. Explicit conversion — the only path that creates a Profit Workout.
        MvcResult converted = mockMvc.perform(post("/cost-workouts/" + cwId + "/convert-to-profit-workout")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.module").value("profit-workout"))
                .andExpect(jsonPath("$.data.number").isNotEmpty())
                .andReturn();
        long pwId = objectMapper.readTree(converted.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        // 6. Exactly one Profit Workout exists and the Cost Workout links to it.
        assertThat(profitWorkoutCount(token))
                .as("Profit Workouts after one explicit conversion")
                .isEqualTo(pwBefore + 1);
        mockMvc.perform(get("/cost-workouts/" + cwId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.convertedToPwId").value(pwId))
                .andExpect(jsonPath("$.data.status").value("completed"));

        // 7. Repeating the same conversion returns the existing Profit Workout —
        // no duplicate row is created.
        mockMvc.perform(post("/cost-workouts/" + cwId + "/convert-to-profit-workout")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(pwId));

        assertThat(profitWorkoutCount(token))
                .as("Profit Workouts after repeating the conversion")
                .isEqualTo(pwBefore + 1);

        // 8. The Cost Workout is neither deleted nor corrupted by the conversion.
        mockMvc.perform(get("/cost-workouts/" + cwId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.cwNo").isNotEmpty())
                .andExpect(jsonPath("$.data.convertedToPwId").value(pwId));
    }

    // ==================== Cost Workout → Quotation: one CW → one quotation ====================

    /** Approves the Cost Workout so it becomes convertible, and returns its number. */
    private String approvedCostWorkoutNumber(String token, long cwId) throws Exception {
        mockMvc.perform(post("/cost-workouts/" + cwId + "/submit")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        mockMvc.perform(post("/cost-workouts/" + cwId + "/approve")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("remarks", "Approved by test"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("approved"));
        return costWorkoutNumber(token, cwId);
    }

    /** The payload the CW-prefilled Quotation form posts on Save. */
    private Map<String, Object> prefilledQuotationBody(String cwNo) {
        return Map.ofEntries(
                Map.entry("quotationDate", "2026-10-09"),
                Map.entry("clientName", "Quotation Flow Client"),
                Map.entry("sourceCw", cwNo),
                Map.entry("currency", "INR"),
                Map.entry("items", List.of(Map.of(
                        "productName", "Widget",
                        "qty", 1,
                        "rate", 11,
                        "gstRate", 18))));
    }

    /** Quotation documents (chain heads, i.e. not revisions) still alive for a Cost Workout. */
    private List<Quotation> liveQuotationsFor(String cwNo) {
        return quotationRepository.findLiveBySourceCw(cwNo).stream()
                .filter(q -> q.getRevisionOf() == null)
                .toList();
    }

    /**
     * Saving the CW-prefilled Quotation form persists the Cost Workout → Quotation
     * relationship and enforces one Cost Workout → one quotation: the first save
     * links the Cost Workout, and every later save (form or the legacy conversion
     * endpoint) is rejected with 409 instead of creating a second document.
     */
    @Test
    void prefilledQuotationSaveLinksTheCostWorkoutAndBlocksASecondSave() throws Exception {
        String token = registerManager("cw-qtn-link-manager@example.com");
        long cwId = createCostWorkout(token);
        String cwNo = approvedCostWorkoutNumber(token, cwId);

        MvcResult created = mockMvc.perform(post("/quotations")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(prefilledQuotationBody(cwNo))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.sourceCw").value(cwNo))
                .andReturn();
        JsonNode quotation = objectMapper.readTree(created.getResponse().getContentAsString()).path("data");
        String quotationNo = quotation.path("quotationNo").asText();
        assertThat(quotationNo).isNotBlank().isNotEqualTo(cwNo);

        // The source relationship is persisted on BOTH sides, in one transaction.
        assertThat(liveQuotationsFor(cwNo)).hasSize(1);
        mockMvc.perform(get("/cost-workouts/" + cwId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.convertedToQtn").value(quotationNo))
                .andExpect(jsonPath("$.data.cwNo").value(cwNo))
                .andExpect(jsonPath("$.data.status").value("approved"))
                .andExpect(jsonPath("$.data.items[0].description").value("Widget"));

        // A second save for the same Cost Workout is a conflict, not a duplicate.
        mockMvc.perform(post("/quotations")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(prefilledQuotationBody(cwNo))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString(quotationNo)));

        // The legacy endpoint cannot create a second quotation either.
        mockMvc.perform(post("/cost-workouts/" + cwId + "/convert-to-quotation")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isConflict());
        assertThat(liveQuotationsFor(cwNo))
                .as("exactly one quotation for the Cost Workout after every retry")
                .hasSize(1);

        // Ordinary quotation creation (no source Cost Workout) is unaffected.
        mockMvc.perform(post("/quotations")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "quotationDate", "2026-10-09",
                                "clientName", "Direct Client",
                                "items", List.of(Map.of("productName", "Standalone", "qty", 1, "rate", 5))))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.quotationNo").isNotEmpty());
    }

    /**
     * A source Cost Workout that is not eligible (not approved) or does not exist
     * is rejected before anything is written, and the Cost Workout stays
     * unconverted — so a fixed form can be saved afterwards.
     */
    @Test
    void ineligibleOrUnknownSourceCostWorkoutCreatesNoQuotation() throws Exception {
        String token = registerManager("cw-qtn-guard-manager@example.com");
        long cwId = createCostWorkout(token);
        String cwNo = costWorkoutNumber(token, cwId);

        // Still "completed", never approved.
        mockMvc.perform(post("/quotations")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(prefilledQuotationBody(cwNo))))
                .andExpect(status().isBadRequest());
        assertThat(liveQuotationsFor(cwNo)).isEmpty();

        // A source Cost Workout that does not exist.
        mockMvc.perform(post("/quotations")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(prefilledQuotationBody("CW-9999-999999"))))
                .andExpect(status().isBadRequest());

        MvcResult guardedCw = mockMvc.perform(get("/cost-workouts/" + cwId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("completed"))
                .andReturn();
        JsonNode guarded = objectMapper.readTree(guardedCw.getResponse().getContentAsString()).path("data");
        assertThat(guarded.path("convertedToQtn").isNull() || guarded.path("convertedToQtn").asText().isEmpty())
                .as("a rejected save leaves the Cost Workout unconverted")
                .isTrue();

        // Once approved, the very same save succeeds.
        approvedCostWorkoutNumber(token, cwId);
        mockMvc.perform(post("/quotations")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(prefilledQuotationBody(cwNo))))
                .andExpect(status().isCreated());
        assertThat(liveQuotationsFor(cwNo)).hasSize(1);
    }

    /**
     * Two simultaneous saves of the same CW-prefilled form (double click, retry,
     * two tabs) produce exactly ONE quotation: the source Cost Workout row is
     * locked for the conversion transaction, so the loser sees the committed
     * conversion and is rejected with 409.
     */
    @Test
    void concurrentQuotationSavesForTheSameCostWorkoutCreateExactlyOneQuotation() throws Exception {
        String token = registerManager("cw-qtn-race-manager@example.com");
        long cwId = createCostWorkout(token);
        String cwNo = approvedCostWorkoutNumber(token, cwId);

        String json = objectMapper.writeValueAsString(prefilledQuotationBody(cwNo));
        int contenders = 3;
        ExecutorService pool = Executors.newFixedThreadPool(contenders);
        CyclicBarrier start = new CyclicBarrier(contenders);
        List<Future<Integer>> results = new ArrayList<>();
        try {
            for (int i = 0; i < contenders; i++) {
                results.add(pool.submit(() -> {
                    start.await(10, TimeUnit.SECONDS);
                    return mockMvc.perform(post("/quotations")
                                    .header("Authorization", "Bearer " + token)
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(json))
                            .andReturn().getResponse().getStatus();
                }));
            }
        } finally {
            pool.shutdown();
        }

        List<Integer> statuses = new ArrayList<>();
        for (Future<Integer> future : results) {
            statuses.add(future.get(60, TimeUnit.SECONDS));
        }

        assertThat(statuses)
                .as("exactly one concurrent save wins; every other is rejected as a duplicate")
                .containsExactlyInAnyOrder(201, 409, 409);
        assertThat(liveQuotationsFor(cwNo))
                .as("one quotation for the Cost Workout after three simultaneous saves")
                .hasSize(1);

        Quotation winner = liveQuotationsFor(cwNo).get(0);
        mockMvc.perform(get("/cost-workouts/" + cwId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.convertedToQtn").value(winner.getQuotationNo()));
    }

    /**
     * The legacy {@code convert-to-quotation} endpoint and the prefilled-form save
     * take the same Cost Workout row lock, so firing both at once still yields one
     * quotation: the loser answers 409 (form) or 409 (legacy), never a second row.
     */
    @Test
    void legacyQuotationConversionCannotRaceThePrefilledSave() throws Exception {
        String token = registerManager("cw-qtn-crosspath-manager@example.com");
        long cwId = createCostWorkout(token);
        String cwNo = approvedCostWorkoutNumber(token, cwId);

        String json = objectMapper.writeValueAsString(prefilledQuotationBody(cwNo));
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CyclicBarrier start = new CyclicBarrier(2);
        try {
            Future<Integer> formSave = pool.submit(() -> {
                start.await(10, TimeUnit.SECONDS);
                return mockMvc.perform(post("/quotations")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(json))
                        .andReturn().getResponse().getStatus();
            });
            Future<Integer> legacy = pool.submit(() -> {
                start.await(10, TimeUnit.SECONDS);
                return mockMvc.perform(post("/cost-workouts/" + cwId + "/convert-to-quotation")
                                .header("Authorization", "Bearer " + token))
                        .andReturn().getResponse().getStatus();
            });

            int formStatus = formSave.get(60, TimeUnit.SECONDS);
            int legacyStatus = legacy.get(60, TimeUnit.SECONDS);
            assertThat(formStatus).as("the form save wins or is the duplicate").isIn(201, 409);
            assertThat(legacyStatus).as("the legacy conversion wins or is the duplicate").isIn(200, 409);
            assertThat((formStatus == 201 ? 1 : 0) + (legacyStatus == 200 ? 1 : 0))
                    .as("exactly one path creates the quotation")
                    .isEqualTo(1);
            assertThat(liveQuotationsFor(cwNo))
                    .as("one quotation for the Cost Workout whichever path won")
                    .hasSize(1);

            Quotation winner = liveQuotationsFor(cwNo).get(0);
            mockMvc.perform(get("/cost-workouts/" + cwId)
                            .header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.convertedToQtn").value(winner.getQuotationNo()));
        } finally {
            pool.shutdown();
        }
    }

    // ==================== Profit Workout → Quotation ====================

    /** A saved Profit Workout to convert (its own number is the conversion key). */
    private JsonNode createProfitWorkout(String token, long cwId) throws Exception {
        MvcResult created = mockMvc.perform(post("/profit-workouts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(prefilledPwBody(cwId))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(created.getResponse().getContentAsString()).path("data");
    }

    /** The payload the PW-prefilled Quotation form posts on Save. */
    private Map<String, Object> prefilledPwQuotationBody(String pwNo) {
        return Map.ofEntries(
                Map.entry("quotationDate", "2026-10-09"),
                Map.entry("clientName", "Flow Test Client"),
                Map.entry("sourcePw", pwNo),
                Map.entry("currency", "INR"),
                Map.entry("items", List.of(Map.of(
                        "productName", "Widget",
                        "qty", 1,
                        "uom", "Nos",
                        "rate", 11,
                        "gstRate", 18))));
    }

    /** Quotation rows carrying the conversion reference for this Profit Workout. */
    private long quotationCountForProfitWorkout(String pwNo) {
        return quotationRepository
                .findByReferenceStartingWith(ProfitWorkoutService.QUOTATION_REF_PREFIX + pwNo)
                .size();
    }

    /**
     * The PW → Quotation workflow is now a prefilled form save: the quotation is
     * created only by that save, it carries the Profit Workout's own data and the
     * established "Generated from Profit Workout …" reference, and the Profit
     * Workout reports the conversion back (which is what turns its list action
     * into Open Quotation). A second save is a 409 — never a duplicate.
     */
    @Test
    void prefilledQuotationSaveFromAProfitWorkoutLinksItAndBlocksASecondSave() throws Exception {
        String token = registerManager("pw-qtn-manager@example.com");
        long cwId = createCostWorkout(token);
        JsonNode pw = createProfitWorkout(token, cwId);
        long pwId = pw.path("id").asLong();
        String pwNo = pw.path("pwNo").asText();
        assertThat(pwNo).isNotBlank();
        assertThat(quotationCountForProfitWorkout(pwNo))
                .as("saving the Profit Workout itself creates no quotation")
                .isZero();

        // The prefilled form sends the Profit Workout's lead reference with the
        // rest of the hydrated fields (the backend stores what the reviewed form
        // submits; it only resolves the source relationship itself).
        Map<String, Object> savedBody = new java.util.HashMap<>(prefilledPwQuotationBody(pwNo));
        savedBody.put("leadNo", pw.path("sourceLead").asText());

        MvcResult created = mockMvc.perform(post("/quotations")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(savedBody)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.reference")
                        .value(ProfitWorkoutService.QUOTATION_REF_PREFIX + pwNo))
                .andExpect(jsonPath("$.data.leadNo").value(pw.path("sourceLead").asText()))
                .andExpect(jsonPath("$.data.clientName").value("Flow Test Client"))
                .andReturn();
        JsonNode quotation = objectMapper.readTree(created.getResponse().getContentAsString()).path("data");
        long quotationId = quotation.path("id").asLong();
        String quotationNo = quotation.path("quotationNo").asText();
        assertThat(quotationNo).isNotBlank().isNotEqualTo(pwNo);

        // The item carries the Profit Workout's SELLING rate (its own price), not
        // its cost or profit, and reuses the quotation's own tax/total rules.
        mockMvc.perform(get("/quotations/" + quotationId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].productName").value("Widget"))
                .andExpect(jsonPath("$.data.items[0].qty").value(1))
                .andExpect(jsonPath("$.data.items[0].rate").value(11))
                .andExpect(jsonPath("$.data.items[0].uom").value("Nos"))
                .andExpect(jsonPath("$.data.items[0].gstRate").value(18));

        // The Profit Workout reports the conversion back.
        mockMvc.perform(get("/profit-workouts/" + pwId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.convertedToQtn").value(quotationNo))
                .andExpect(jsonPath("$.data.pwNo").value(pwNo));

        // A second save is a conflict naming the existing quotation…
        mockMvc.perform(post("/quotations")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(prefilledPwQuotationBody(pwNo))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString(quotationNo)));

        // …and the legacy conversion endpoint keeps reporting it as converted.
        mockMvc.perform(post("/profit-workouts/" + pwId + "/convert-to-quotation")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());

        assertThat(quotationCountForProfitWorkout(pwNo))
                .as("exactly one quotation for the Profit Workout after every retry")
                .isEqualTo(1);
    }

    /**
     * A TRASHED quotation does not block a new conversion: the Profit Workout's
     * list action goes back to Convert to Quotation and a fresh prefill save is
     * accepted (the same non-deleted rule the Cost Workout link follows).
     */
    @Test
    void aTrashedQuotationDoesNotBlockANewConversion() throws Exception {
        String token = registerManager("pw-qtn-trash-manager@example.com");
        long cwId = createCostWorkout(token);
        JsonNode pw = createProfitWorkout(token, cwId);
        long pwId = pw.path("id").asLong();
        String pwNo = pw.path("pwNo").asText();

        MvcResult first = mockMvc.perform(post("/quotations")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(prefilledPwQuotationBody(pwNo))))
                .andExpect(status().isCreated())
                .andReturn();
        long firstId = objectMapper.readTree(first.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        mockMvc.perform(delete("/quotations/" + firstId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        MvcResult trashed = mockMvc.perform(get("/profit-workouts/" + pwId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode trashedPw = objectMapper.readTree(trashed.getResponse().getContentAsString()).path("data");
        assertThat(trashedPw.path("convertedToQtn").isNull()
                || trashedPw.path("convertedToQtn").asText().isEmpty())
                .as("a trashed quotation no longer counts as the conversion")
                .isTrue();

        MvcResult second = mockMvc.perform(post("/quotations")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(prefilledPwQuotationBody(pwNo))))
                .andExpect(status().isCreated())
                .andReturn();
        String secondNo = objectMapper.readTree(second.getResponse().getContentAsString())
                .path("data").path("quotationNo").asText();

        mockMvc.perform(get("/profit-workouts/" + pwId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.convertedToQtn").value(secondNo));
    }

    /** An unknown source Profit Workout is rejected before anything is written. */
    @Test
    void prefilledQuotationSaveWithAnUnknownProfitWorkoutCreatesNothing() throws Exception {
        String token = registerManager("pw-qtn-guard-manager@example.com");

        mockMvc.perform(post("/quotations")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(prefilledPwQuotationBody("PW-9999-999999"))))
                .andExpect(status().isBadRequest());

        assertThat(quotationCountForProfitWorkout("PW-9999-999999"))
                .as("a rejected save writes nothing")
                .isZero();
    }

    /**
     * Two simultaneous saves of the same PW-prefilled form (double click, retry,
     * two tabs) produce exactly ONE quotation: the source Profit Workout row is
     * locked for the conversion transaction, so the losers see the committed
     * conversion and are rejected with 409.
     */
    @Test
    void concurrentQuotationSavesForTheSameProfitWorkoutCreateExactlyOneQuotation() throws Exception {
        String token = registerManager("pw-qtn-race-manager@example.com");
        long cwId = createCostWorkout(token);
        JsonNode pw = createProfitWorkout(token, cwId);
        long pwId = pw.path("id").asLong();
        String pwNo = pw.path("pwNo").asText();

        String json = objectMapper.writeValueAsString(prefilledPwQuotationBody(pwNo));
        int contenders = 3;
        ExecutorService pool = Executors.newFixedThreadPool(contenders);
        CyclicBarrier start = new CyclicBarrier(contenders);
        List<Future<Integer>> results = new ArrayList<>();
        try {
            for (int i = 0; i < contenders; i++) {
                results.add(pool.submit(() -> {
                    start.await(10, TimeUnit.SECONDS);
                    return mockMvc.perform(post("/quotations")
                                    .header("Authorization", "Bearer " + token)
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(json))
                            .andReturn().getResponse().getStatus();
                }));
            }
        } finally {
            pool.shutdown();
        }

        List<Integer> statuses = new ArrayList<>();
        for (Future<Integer> future : results) {
            statuses.add(future.get(60, TimeUnit.SECONDS));
        }

        assertThat(statuses)
                .as("exactly one concurrent save wins; every other is rejected as a duplicate")
                .containsExactlyInAnyOrder(201, 409, 409);
        assertThat(quotationCountForProfitWorkout(pwNo))
                .as("one quotation for the Profit Workout after three simultaneous saves")
                .isEqualTo(1);

        Quotation winner = quotationRepository
                .findByReferenceStartingWith(ProfitWorkoutService.QUOTATION_REF_PREFIX + pwNo)
                .get(0);
        mockMvc.perform(get("/profit-workouts/" + pwId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.convertedToQtn").value(winner.getQuotationNo()));
    }

    /**
     * The two Profit Workout → Quotation creation paths take the SAME source-row
     * lock: a legacy {@code /profit-workouts/{id}/convert-to-quotation} racing the
     * conversion-prefilled form's save produces exactly one quotation, and the
     * Profit Workout links to whichever path won.
     */
    @Test
    void legacyAndFormConversionOfTheSameProfitWorkoutCreateOnlyOneQuotation() throws Exception {
        String token = registerManager("pw-qtn-both-paths-manager@example.com");
        long cwId = createCostWorkout(token);
        JsonNode pw = createProfitWorkout(token, cwId);
        long pwId = pw.path("id").asLong();
        String pwNo = pw.path("pwNo").asText();

        String json = objectMapper.writeValueAsString(prefilledPwQuotationBody(pwNo));
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CyclicBarrier start = new CyclicBarrier(2);
        try {
            Future<Integer> formSave = pool.submit(() -> {
                start.await(10, TimeUnit.SECONDS);
                return mockMvc.perform(post("/quotations")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(json))
                        .andReturn().getResponse().getStatus();
            });
            Future<Integer> legacy = pool.submit(() -> {
                start.await(10, TimeUnit.SECONDS);
                return mockMvc.perform(post("/profit-workouts/" + pwId + "/convert-to-quotation")
                                .header("Authorization", "Bearer " + token))
                        .andReturn().getResponse().getStatus();
            });

            int formStatus = formSave.get(60, TimeUnit.SECONDS);
            int legacyStatus = legacy.get(60, TimeUnit.SECONDS);
            assertThat(formStatus).as("the form save wins or is the duplicate").isIn(201, 409);
            assertThat(legacyStatus).as("the legacy conversion wins or is the duplicate").isIn(200, 400);
            assertThat((formStatus == 201 ? 1 : 0) + (legacyStatus == 200 ? 1 : 0))
                    .as("exactly one path creates the quotation")
                    .isEqualTo(1);
            assertThat(quotationCountForProfitWorkout(pwNo))
                    .as("one quotation for the Profit Workout whichever path won")
                    .isEqualTo(1);

            Quotation winner = quotationRepository
                    .findByReferenceStartingWith(ProfitWorkoutService.QUOTATION_REF_PREFIX + pwNo)
                    .get(0);
            mockMvc.perform(get("/profit-workouts/" + pwId)
                            .header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.convertedToQtn").value(winner.getQuotationNo()));
        } finally {
            pool.shutdown();
        }
    }

    /**
     * Approval of a submitted Cost Workout needs CPR_APPROVE — the authority the
     * Cost Workout table's ⋮ menu mirrors when it decides whether to offer
     * Approve (ADMIN / MANAGER only). This pins the server half of that rule: a
     * plain USER is refused and the record stays submitted, while the same call
     * succeeds for a MANAGER and persists APPROVED on the same record.
     */
    @Test
    void costWorkoutApprovalRequiresTheCprApproveAuthority() throws Exception {
        String managerToken = registerManager("cw-approve-menu-manager@example.com");
        long cwId = createCostWorkout(managerToken);
        mockMvc.perform(post("/cost-workouts/" + cwId + "/submit")
                        .header("Authorization", "Bearer " + managerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("submitted"));

        // A fresh registration holds USER: CPR_VIEW / CPR_CREATE / CPR_EDIT only.
        mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "fullName", "CW Plain User",
                                "email", "cw-approve-menu-user@example.com",
                                "password", "password123"))))
                .andExpect(status().isCreated());
        MvcResult loggedIn = mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", "cw-approve-menu-user@example.com",
                                "password", "password123"))))
                .andReturn();
        String userToken = objectMapper.readTree(loggedIn.getResponse().getContentAsString())
                .path("data").path("token").asText();

        mockMvc.perform(post("/cost-workouts/" + cwId + "/approve")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("remarks", "self approval"))))
                .andExpect(status().isForbidden());

        // The refused call changed nothing.
        mockMvc.perform(get("/cost-workouts/" + cwId)
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("submitted"));

        // The manager (CPR_APPROVE) approves that same submitted record.
        mockMvc.perform(post("/cost-workouts/" + cwId + "/approve")
                        .header("Authorization", "Bearer " + managerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("remarks", "Approved from the table menu"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("approved"));

        mockMvc.perform(get("/cost-workouts/" + cwId)
                        .header("Authorization", "Bearer " + managerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("approved"));
    }
}
