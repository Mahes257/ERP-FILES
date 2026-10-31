package com.vishatech.erp.production;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.SalesOrder;
import com.vishatech.erp.entity.SalesTimeline;
import com.vishatech.erp.entity.production.ProductionTracker;
import com.vishatech.erp.production.api.ProductionTrackerLinkPort;
import com.vishatech.erp.repository.SalesOrderRepository;
import com.vishatech.erp.repository.SalesTimelineRepository;
import com.vishatech.erp.repository.production.ProductionTrackerRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.security.CustomUserDetailsService;
import com.vishatech.erp.security.JwtService;
import com.vishatech.erp.service.production.ProductionTrackerService;
import java.time.LocalDateTime;
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
 * The approved tracker-linked deletion policy, end to end.
 *
 * <p>A CPO with a linked Production tracker cannot be permanently deleted: the request
 * is refused with HTTP 409 and a message naming the order and the tracker, and nothing
 * is purged. The check runs through the published {@link ProductionTrackerLinkPort} —
 * Sales never reads the tracker table — so this class also pins the module contract that
 * makes the guard legal.
 *
 * <p>What it covers, in the order the policy states it:
 *
 * <ul>
 *   <li><b>409 while linked</b>, with the tracker and the CPO unchanged;</li>
 *   <li><b>no partial purge</b>: a bulk request that mixes a deletable CPO with a
 *       tracker-linked one removes nothing at all;</li>
 *   <li><b>the unlinked case still hard-deletes</b>, related rows and all — the guard
 *       must not have turned permanent deletion into a no-op;</li>
 *   <li><b>authorization is untouched</b>: a plain USER gets 403, not 409;</li>
 *   <li><b>the existing envelopes are untouched</b>: 404 for an unknown id, 400 for an
 *       empty id list;</li>
 *   <li><b>soft delete and restore still work</b> on a tracker-linked CPO (the policy
 *       covers permanent deletion only);</li>
 *   <li><b>the link is what blocks it</b>: removing the tracker through its own
 *       lifecycle lets the very same request succeed afterwards;</li>
 *   <li><b>both shapes of link count</b> — {@code sales_order_id}, and the denormalised
 *       CPO number a tracker keeps when it was created without an id — while a tracker
 *       that belongs to a <em>different</em> order never blocks this one.</li>
 * </ul>
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class SalesOrderPermanentDeleteTrackerGuardTests extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private SalesOrderRepository salesOrders;

    @Autowired
    private SalesTimelineRepository timelines;

    @Autowired
    private ProductionTrackerRepository trackers;

    @Autowired
    private ProductionTrackerService trackerService;

    @Autowired
    private ProductionTrackerLinkPort trackerLinkPort;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private CustomUserDetailsService userDetailsService;

    // ------------------------------------------------------------------
    // Fixtures
    // ------------------------------------------------------------------

    private static String unique(String prefix) {
        return prefix + "-" + Long.toString(System.nanoTime(), 36);
    }

    /** A bare CPO row: enough for the delete path, which reads the id and the number. */
    private SalesOrder seedCpo() {
        SalesOrder cpo = new SalesOrder();
        cpo.setSoNo(unique("CPO-GUARD"));
        cpo.setClientName("Guard Industries");
        cpo.setOrderDate(LocalDateTime.now());
        return salesOrders.save(cpo);
    }

    /** A tracker linked the way the application links one: by CPO id. */
    private ProductionTracker linkTracker(SalesOrder cpo) {
        ProductionTracker input = new ProductionTracker();
        input.setSalesOrderId(cpo.getId());
        return trackerService.create(input);
    }

    private SalesTimeline seedTimeline(SalesOrder cpo) {
        SalesTimeline entry = new SalesTimeline();
        entry.setModuleType("sales-order");
        entry.setModuleId(cpo.getId());
        entry.setType("created");
        entry.setTitle("Customer Purchase Order created");
        entry.setDetail("seeded for the permanent-delete purge assertion");
        entry.setCreatedAt(LocalDateTime.now());
        return timelines.save(entry);
    }

    private String adminToken() {
        return jwtService.generateToken(userDetailsService.loadUserByUsername("admin@vishaktech.com"));
    }

    /** A throwaway account that can never hold SALES_DELETE (register always assigns USER). */
    private String userToken() throws Exception {
        MvcResult result = mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "fullName", "Guard Limited User",
                                "email", unique("perm-delete-guard") + "@example.com",
                                "password", "password123"))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("token").asText();
    }

    private MvcResult permanentDelete(String token, List<Long> ids) throws Exception {
        return mockMvc.perform(post("/sales-orders/bulk-permanent-delete")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("ids", ids))))
                .andReturn();
    }

    // ------------------------------------------------------------------
    // The policy
    // ------------------------------------------------------------------

    @Test
    void aLinkedTrackerMakesPermanentDeletionA409AndChangesNothing() throws Exception {
        SalesOrder cpo = seedCpo();
        ProductionTracker tracker = linkTracker(cpo);
        SalesTimeline timeline = seedTimeline(cpo);

        MvcResult result = permanentDelete(adminToken(), List.of(cpo.getId()));

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.path("success").asBoolean()).isFalse();
        assertThat(body.path("message").asText())
                .contains("cannot be permanently deleted")
                .contains(cpo.getSoNo())
                .contains("Production tracker #" + tracker.getId());

        // The CPO is still there, with its related rows, and the tracker is untouched.
        assertThat(salesOrders.findById(cpo.getId())).isPresent();
        assertThat(timelines.findById(timeline.getId())).isPresent();
        ProductionTracker reloaded = trackers.findById(tracker.getId()).orElseThrow();
        assertThat(reloaded.getSalesOrderId()).isEqualTo(cpo.getId());
        assertThat(reloaded.getCpoNo()).isEqualTo(cpo.getSoNo());
        assertThat(reloaded.getCurrentStatus()).isEqualTo(tracker.getCurrentStatus());
    }

    @Test
    void aMixedBulkRequestPurgesNothingAtAll() throws Exception {
        SalesOrder deletable = seedCpo();
        SalesOrder linked = seedCpo();
        linkTracker(linked);
        SalesTimeline deletableTimeline = seedTimeline(deletable);

        // The deletable CPO is FIRST, which is exactly the order that used to leave a
        // partial purge behind.
        MvcResult result = permanentDelete(adminToken(), List.of(deletable.getId(), linked.getId()));

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        assertThat(salesOrders.findById(deletable.getId())).isPresent();
        assertThat(timelines.findById(deletableTimeline.getId())).isPresent();
        assertThat(salesOrders.findById(linked.getId())).isPresent();
    }

    @Test
    void anUnlinkedCpoIsStillPermanentlyDeletedWithItsRelatedRows() throws Exception {
        SalesOrder cpo = seedCpo();
        SalesTimeline timeline = seedTimeline(cpo);

        MvcResult result = permanentDelete(adminToken(), List.of(cpo.getId()));

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.path("success").asBoolean()).isTrue();
        assertThat(body.path("message").asText()).contains("Permanently deleted 1");

        assertThat(salesOrders.findById(cpo.getId())).isEmpty();
        assertThat(timelines.findById(timeline.getId())).isEmpty();
    }

    @Test
    void aUserWithoutTheDeleteAuthorityStillGetsA403() throws Exception {
        SalesOrder cpo = seedCpo();
        linkTracker(cpo);

        MvcResult result = permanentDelete(userToken(), List.of(cpo.getId()));

        assertThat(result.getResponse().getStatus()).isEqualTo(403);
        assertThat(salesOrders.findById(cpo.getId())).isPresent();
    }

    @Test
    void theExistingNotFoundEnvelopeIsUnchanged() throws Exception {
        MvcResult result = permanentDelete(adminToken(), List.of(9_000_000_000L));

        assertThat(result.getResponse().getStatus()).isEqualTo(404);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.path("success").asBoolean()).isFalse();
        assertThat(body.path("message").asText()).isNotBlank();
    }

    @Test
    void theExistingValidationEnvelopeIsUnchanged() throws Exception {
        mockMvc.perform(post("/sales-orders/bulk-permanent-delete")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message", containsString("ids must not be empty")));
    }

    @Test
    void softDeleteAndRestoreAreUnaffectedByALinkedTracker() throws Exception {
        SalesOrder cpo = seedCpo();
        linkTracker(cpo);
        String token = adminToken();

        // The single-delete endpoint answers with a message (data is null), exactly
        // as before: the row is moved to trash, it is not removed.
        mockMvc.perform(delete("/sales-orders/" + cpo.getId())
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Sales order moved to trash"));

        assertThat(salesOrders.findById(cpo.getId()).orElseThrow().getStatus()).isEqualTo("deleted");

        mockMvc.perform(patch("/sales-orders/restore/" + cpo.getId())
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("draft"));

        assertThat(salesOrders.findById(cpo.getId()).orElseThrow().getStatus()).isEqualTo("draft");
    }

    @Test
    void removingTheTrackerThroughItsOwnLifecycleUnblocksTheDeletion() throws Exception {
        SalesOrder cpo = seedCpo();
        ProductionTracker tracker = linkTracker(cpo);
        String token = adminToken();

        assertThat(permanentDelete(token, List.of(cpo.getId())).getResponse().getStatus()).isEqualTo(409);

        trackerService.delete(tracker.getId());

        MvcResult result = permanentDelete(token, List.of(cpo.getId()));
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(salesOrders.findById(cpo.getId())).isEmpty();
    }

    // ------------------------------------------------------------------
    // What counts as a link (owned by the port's implementation)
    // ------------------------------------------------------------------

    @Test
    void thePortReportsTheTrackerLinkedByIdAndNothingForAnUnlinkedOrder() {
        SalesOrder linked = seedCpo();
        SalesOrder unlinked = seedCpo();
        ProductionTracker tracker = linkTracker(linked);

        assertThat(trackerLinkPort.linkedTrackerId(linked.getId())).contains(tracker.getId());
        assertThat(trackerLinkPort.linkedTrackerId(unlinked.getId())).isEmpty();
        assertThat(trackerLinkPort.linkedTrackerId(null)).isEmpty();
    }

    @Test
    void aTrackerHoldingOnlyTheCpoNumberStillBlocksTheDeletion() throws Exception {
        SalesOrder cpo = seedCpo();

        // Created without a CPO id: the tracker keeps only the denormalised number,
        // which is the shape the HTTP path produces.
        ProductionTracker input = new ProductionTracker();
        input.setCpoNo(cpo.getSoNo());
        ProductionTracker tracker = trackerService.create(input);
        assertThat(tracker.getSalesOrderId()).isNull();

        MvcResult result = permanentDelete(adminToken(), List.of(cpo.getId()));

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        assertThat(result.getResponse().getContentAsString()).contains("Production tracker #" + tracker.getId());
        assertThat(salesOrders.findById(cpo.getId())).isPresent();
    }

    @Test
    void aTrackerBelongingToADifferentOrderNeverBlocksThisOne() throws Exception {
        SalesOrder other = seedCpo();
        SalesOrder target = seedCpo();

        // A tracker linked to `other`, carrying `target`'s number: inconsistent data,
        // but it is other's tracker and must not stand in front of target's deletion.
        ProductionTracker tracker = linkTracker(other);
        tracker.setCpoNo(target.getSoNo());
        trackers.save(tracker);

        MvcResult result = permanentDelete(adminToken(), List.of(target.getId()));

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(salesOrders.findById(target.getId())).isEmpty();
        assertThat(trackers.findById(tracker.getId())).isPresent();
    }

    @Test
    void everyRowOfTheRevisionChainIsCheckedNotJustTheRequestedOne() throws Exception {
        SalesOrder base = seedCpo();
        // A revision row: same chain, its own id, and the parent it was revised from.
        SalesOrder revision = seedCpo();
        revision.setRevisionOf(base.getId());
        revision.setRevision(1);
        revision.setLatestRevision(true);
        SalesOrder savedRevision = salesOrders.save(revision);

        // The tracker is linked to the BASE row while the request names the revision.
        ProductionTracker input = new ProductionTracker();
        input.setSalesOrderId(base.getId());
        input.setCpoNo(base.getSoNo());
        ProductionTracker tracker = trackerService.create(input);

        MvcResult result = permanentDelete(adminToken(), List.of(savedRevision.getId()));

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        assertThat(result.getResponse().getContentAsString()).contains("Production tracker #" + tracker.getId());
        assertThat(salesOrders.findById(base.getId())).isPresent();
        assertThat(salesOrders.findById(savedRevision.getId())).isPresent();
    }
}
