package com.vishatech.erp.production;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.production.ProductionTracker;
import com.vishatech.erp.entity.SalesOrder;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.production.ProductionTrackerRepository;
import com.vishatech.erp.repository.SalesOrderRepository;
import com.vishatech.erp.sales.api.SalesOrderLookupPort;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.security.CustomUserDetailsService;
import com.vishatech.erp.security.JwtService;
import com.vishatech.erp.service.production.ProductionTrackerService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * P7 — the production tracker's CPO link no longer touches Sales persistence.
 *
 * <p>{@code ProductionTrackerService} used to inject {@code SalesOrderRepository}
 * and hold {@code SalesOrder} values; it now resolves the CPO through the published
 * {@link SalesOrderLookupPort} and stores only {@link ProductionTracker#setSalesOrderId}.
 * These tests pin both halves of that change against a real database:
 *
 * <ul>
 *   <li>linking a tracker to a CPO still denormalises the CPO number, customer and
 *       order date, still fails fast with the same 404 for an unknown id, and still
 *       persists the {@code sales_order_id} column — the column and its values are
 *       unchanged, only the Java mapping is;</li>
 *   <li>a request body still cannot link a CPO ({@code @JsonIgnore} kept the field
 *       out of the payload, and the response still omits it), so the wire contract is
 *       byte-for-byte what it was.</li>
 * </ul>
 */
@SpringBootTest
@AutoConfigureMockMvc
class ProductionTrackerCpoLinkIntegrationTests extends AbstractSecurityTest {

    private static final long UNKNOWN_CPO_ID = 9_000_000_000L;

    @Autowired
    private ProductionTrackerService trackerService;

    @Autowired
    private ProductionTrackerRepository trackers;

    @Autowired
    private SalesOrderRepository salesOrderRepository;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private CustomUserDetailsService userDetailsService;

    private static String unique(String prefix) {
        return prefix + "-" + Long.toString(System.nanoTime(), 36);
    }

    private SalesOrder seedCpo(String clientName, Long clientId, LocalDateTime orderDate) {
        SalesOrder cpo = new SalesOrder();
        cpo.setSoNo(unique("SO-P7"));
        cpo.setClientName(clientName);
        cpo.setClientId(clientId);
        cpo.setOrderDate(orderDate);
        return salesOrderRepository.save(cpo);
    }

    private String adminToken() {
        return jwtService.generateToken(userDetailsService.loadUserByUsername("admin@vishaktech.com"));
    }

    // ------------------------------------------------------------------
    // The service path (Java callers)
    // ------------------------------------------------------------------

    @Test
    void linkingATrackerToACpoDenormalisesItThroughThePublishedLookup() {
        SalesOrder cpo = seedCpo("Tracker Industries", 77L, LocalDateTime.of(2026, 5, 6, 8, 0));
        ProductionTracker input = new ProductionTracker();
        input.setSalesOrderId(cpo.getId());

        ProductionTracker saved = trackerService.create(input);

        assertThat(saved.getSalesOrderId()).isEqualTo(cpo.getId());
        assertThat(saved.getCpoNo()).isEqualTo(cpo.getSoNo());
        assertThat(saved.getCustomer()).isEqualTo("Tracker Industries");
        assertThat(saved.getOrderDate()).isEqualTo(LocalDate.of(2026, 5, 6));

        // The foreign-key column itself is still written and still readable.
        ProductionTracker reloaded = trackers.findById(saved.getId()).orElseThrow();
        assertThat(reloaded.getSalesOrderId()).isEqualTo(cpo.getId());
        assertThat(trackers.findBySalesOrderId(cpo.getId())).isPresent();
    }

    @Test
    void aTrackerWithoutACpoKeepsExactlyWhatTheClientSent() {
        ProductionTracker input = new ProductionTracker();
        input.setCpoNo(unique("CPO-P7"));
        input.setCustomer("Sent By Client");
        input.setOrderDate(LocalDate.of(2026, 6, 1));

        ProductionTracker saved = trackerService.create(input);

        assertThat(saved.getSalesOrderId()).isNull();
        assertThat(saved.getCpoNo()).isEqualTo(input.getCpoNo());
        assertThat(saved.getCustomer()).isEqualTo("Sent By Client");
        assertThat(saved.getOrderDate()).isEqualTo(LocalDate.of(2026, 6, 1));
    }

    @Test
    void anUnknownCpoIdStillFailsFastWithTheSameNotFoundError() {
        ProductionTracker input = new ProductionTracker();
        input.setSalesOrderId(UNKNOWN_CPO_ID);

        assertThatThrownBy(() -> trackerService.create(input))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessageContaining("Sales Order not found")
                .hasMessageContaining(String.valueOf(UNKNOWN_CPO_ID));
    }

    @Test
    void editingATrackerNeverTouchesItsCpoLink() {
        SalesOrder cpo = seedCpo("Edit Safe Industries", 78L, LocalDateTime.of(2026, 5, 7, 8, 0));
        ProductionTracker input = new ProductionTracker();
        input.setSalesOrderId(cpo.getId());
        ProductionTracker saved = trackerService.create(input);

        ProductionTracker edit = new ProductionTracker();
        edit.setCastingPct(40);
        ProductionTracker updated = trackerService.update(saved.getId(), edit);

        assertThat(updated.getSalesOrderId()).isEqualTo(cpo.getId());
        assertThat(updated.getCpoNo()).isEqualTo(cpo.getSoNo());
        assertThat(trackers.findById(saved.getId()).orElseThrow().getSalesOrderId())
                .isEqualTo(cpo.getId());
    }

    @Test
    void autoCreateForCpoUsesThePublishedReferenceAndStaysIdempotent() {
        SalesOrder cpo = seedCpo("Auto Create Industries", 79L, LocalDateTime.of(2026, 5, 8, 8, 0));
        SalesOrderLookupPort.SalesOrderRef ref =
                new SalesOrderLookupPort.SalesOrderRef(
                        cpo.getId(), cpo.getSoNo(), cpo.getClientName(), cpo.getClientId(),
                        cpo.getOrderDate());

        ProductionTracker created = trackerService.autoCreateForCpo(ref);
        ProductionTracker again = trackerService.autoCreateForCpo(ref);

        assertThat(created.getSalesOrderId()).isEqualTo(cpo.getId());
        assertThat(created.getCpoNo()).isEqualTo(cpo.getSoNo());
        assertThat(created.getCustomer()).isEqualTo("Auto Create Industries");
        assertThat(created.getOrderDate()).isEqualTo(LocalDate.of(2026, 5, 8));
        assertThat(created.getCurrentStatus()).isEqualTo("NOT_STARTED");
        assertThat(again.getId()).isEqualTo(created.getId());
        assertThat(trackers.findByCpoNo(cpo.getSoNo())).isPresent();
    }

    // ------------------------------------------------------------------
    // The HTTP path (what the React app sends)
    // ------------------------------------------------------------------

    @Test
    void theRequestBodyStillCannotLinkACpoAndTheResponseStillHidesIt() throws Exception {
        SalesOrder cpo = seedCpo("Wire Contract Industries", 80L, LocalDateTime.of(2026, 5, 9, 8, 0));
        String cpoNo = unique("CPO-P7");

        String body = "{\"cpoNo\":\"" + cpoNo + "\",\"customer\":\"API customer\","
                + "\"salesOrderId\":" + cpo.getId() + ","
                + "\"salesOrder\":{\"id\":" + cpo.getId() + "},"
                + "\"orderDate\":\"2026-07-01\"}";

        MvcResult result = mockMvc.perform(post("/production-trackers")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode data = objectMapper.readTree(result.getResponse().getContentAsString()).path("data");

        assertThat(data.path("cpoNo").asText()).isEqualTo(cpoNo);
        assertThat(data.path("customer").asText()).isEqualTo("API customer");
        assertThat(data.path("orderDate").asText()).isEqualTo("2026-07-01");
        assertThat(data.has("salesOrderId")).isFalse();
        assertThat(data.has("salesOrder")).isFalse();
        assertThat(trackers.findByCpoNo(cpoNo).orElseThrow().getSalesOrderId()).isNull();
    }
}
