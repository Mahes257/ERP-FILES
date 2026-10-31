package com.vishatech.erp.purchase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.audit.AuditModule;
import com.vishatech.erp.audit.AuditPort;
import com.vishatech.erp.entity.production.AuditLog;
import com.vishatech.erp.repository.PurchaseRequisitionRepository;
import com.vishatech.erp.repository.PurchaseTimelineRepository;
import com.vishatech.erp.repository.production.AuditLogRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.security.CustomUserDetailsService;
import com.vishatech.erp.security.JwtService;
import com.vishatech.erp.service.PurchaseCentralAuditWriter;
import com.vishatech.erp.service.production.AuditService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.dao.DataAccessException;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * P1 — failure injection for the Purchase → shared-audit mirror, injected at the
 * shared {@link AuditPort} boundary introduced in P2.
 *
 * <p><b>What is injected.</b> The primary {@code AuditPort} refuses nothing — it
 * performs a <em>real</em> audit write through the real implementation, but with
 * an over-length {@code entity_type}. The database rejects it (the column is
 * {@code VARCHAR(100)}), which is a genuine persistence failure raised from
 * inside whatever transaction the audit write runs in. That is exactly the
 * failure mode the old code mishandled: a database error inside a
 * {@code REQUIRED} audit call marks the caller's transaction rollback-only, and
 * catching the exception does not undo it.
 *
 * <p><b>What it proves.</b>
 *
 * <ol>
 *   <li>the injected failure is real, not vacuous —
 *       {@link #theInjectedAuditFailureIsReal()} shows the writer throwing a
 *       data-access exception, and that the failed insert left no row behind;</li>
 *   <li>a Purchase business operation whose audit mirror fails still
 *       <b>commits</b>: the requisition row and its authoritative
 *       {@code purchase_timelines} entry are persisted and the HTTP response is
 *       successful;</li>
 *   <li>nothing is half-written: no <em>new</em> audit row exists for that
 *       document, and the shared audit count is unchanged.</li>
 * </ol>
 *
 * <p>Verified discriminating: with the audit write temporarily put back inside
 * the caller's transaction ({@code REQUIRED}, synchronous), this test fails —
 * {@code POST /api/purchase/requisitions} answers {@code 500} and the
 * requisition is rolled back. The probe was reverted; see the phase report.
 *
 * <p>No live database is involved: the suite runs on in-memory H2 in MySQL
 * compatibility mode where the same length constraint exists.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PurchaseAuditFailureIsolationTests.BrokenAuditConfiguration.class)
class PurchaseAuditFailureIsolationTests extends AbstractSecurityTest {

    /** {@code audit_logs.entity_type} is {@code VARCHAR(100)}; longer always fails. */
    static final String OVER_LONG_ENTITY_TYPE = "X".repeat(150);

    /**
     * A {@link AuditPort} that behaves exactly like the real one except that it
     * writes an over-length entity type, so every insert fails in the database.
     * It deliberately calls the real implementation, so the failure travels the
     * real code path and the real constraint.
     */
    @TestConfiguration
    static class BrokenAuditConfiguration {

        @Bean
        @Primary
        AuditPort brokenAuditPort(AuditService realAuditWriter) {
            return entry -> realAuditWriter.record(
                    entry.module(),
                    OVER_LONG_ENTITY_TYPE,
                    entry.entityId(),
                    entry.entityDisplayId(),
                    entry.action(),
                    entry.userId(),
                    entry.username(),
                    entry.description(),
                    entry.oldValue(),
                    entry.newValue(),
                    entry.ipAddress(),
                    entry.requestId());
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private CustomUserDetailsService userDetailsService;

    @Autowired
    private PurchaseCentralAuditWriter centralAuditWriter;

    @Autowired
    private PurchaseRequisitionRepository requisitions;

    @Autowired
    private PurchaseTimelineRepository timelineRepository;

    @Autowired
    private AuditLogRepository auditLogRepository;

    private List<AuditLog> purchaseAuditRowsFor(String entityType, long entityId) {
        return auditLogRepository.findAll().stream()
                .filter(l -> l.getModule() == AuditModule.PURCHASE)
                .filter(l -> entityType.equals(l.getEntityType()))
                .filter(l -> String.valueOf(entityId).equals(l.getEntityId()))
                .toList();
    }

    private long purchaseAuditCount() {
        return auditLogRepository.findAll().stream()
                .filter(l -> l.getModule() == AuditModule.PURCHASE)
                .count();
    }

    /** Ids of every audit row that already exists, whatever wrote it. */
    private Set<Long> existingAuditRowIds() {
        return auditLogRepository.findAll().stream()
                .map(AuditLog::getId)
                .collect(Collectors.toSet());
    }

    @Test
    void theInjectedAuditFailureIsReal() {
        assertThatThrownBy(() -> centralAuditWriter.write("PR", 1L, "create", "probe", null, null))
                .isInstanceOf(DataAccessException.class);
        // The failed insert left nothing behind, so it cannot explain a passing
        // assertion by accident.
        assertThat(auditLogRepository.findAll())
                .noneMatch(l -> OVER_LONG_ENTITY_TYPE.equals(l.getEntityType()));
    }

    @Test
    void aFailedCentralAuditInsertDoesNotRollBackThePurchaseOperation() throws Exception {
        String token = jwtService.generateToken(
                userDetailsService.loadUserByUsername("admin@vishaktech.com"));
        long auditRowsBefore = purchaseAuditCount();
        // The shared H2 audit table deliberately survives between Spring contexts:
        // it is excluded from Hibernate's create <em>and drop</em> filter and is
        // created by AbstractSecurityTest, while the business tables are recreated
        // per context and their identity ids restart. A row carrying this document's
        // id can therefore already exist from an earlier test class in the same JVM,
        // so "the mirror wrote nothing for this document" is asserted as "no NEW row
        // for this document" — identified by id — instead of an empty history.
        Set<Long> auditRowIdsBefore = existingAuditRowIds();

        MvcResult result = mockMvc.perform(post("/api/purchase/requisitions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "title", "Audit isolation PR",
                                "department", "Maintenance",
                                "requester", "Admin User",
                                "currency", "INR",
                                "priority", "Medium",
                                "date", LocalDate.now().toString(),
                                "expectedDate", LocalDate.now().plusDays(5).toString(),
                                "items", List.of(Map.of(
                                        "product", "Bearing 6204",
                                        "qty", new BigDecimal("2"),
                                        "rate", new BigDecimal("45")))))))
                .andExpect(status().is2xxSuccessful())
                .andReturn();

        JsonNode data = objectMapper.readTree(result.getResponse().getContentAsString()).path("data");
        long prId = data.path("id").asLong();
        assertThat(prId).isPositive();

        // 1. The primary business operation committed.
        assertThat(requisitions.findById(prId)).isPresent();

        // 2. Its authoritative Purchase timeline was written in that transaction.
        assertThat(timelineRepository.findByDocTypeAndDocIdOrderByTimestampAscIdAsc("PR", prId))
                .isNotEmpty();

        // 3. The mirror genuinely failed — loudly and cleanly: no NEW row for this
        //    document, no partial write, and no rolled-back business work.
        assertThat(purchaseAuditRowsFor("PR", prId))
                .allMatch(row -> auditRowIdsBefore.contains(row.getId()));
        assertThat(purchaseAuditCount()).isEqualTo(auditRowsBefore);
    }
}
