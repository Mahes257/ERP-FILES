package com.vishatech.erp.audit;

import static org.assertj.core.api.Assertions.assertThat;

import com.vishatech.erp.dto.production.AuditLogDTO;
import com.vishatech.erp.entity.production.AuditLog;
import com.vishatech.erp.repository.production.AuditLogRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.service.production.AuditService;
import java.util.Comparator;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * P2 — the shared audit boundary ({@link AuditPort} + {@link AuditRecord} +
 * {@link AuditModule} + {@link AuditAction}) and its production-owned
 * implementation.
 *
 * <p>Pins the two properties the relocation must not have broken:
 *
 * <ol>
 *   <li><b>Write parity.</b> Writing through the shared port persists exactly
 *       what a direct call to the implementation persists — same columns, same
 *       enum names, same values — so no caller's audit data changed shape.</li>
 *   <li><b>The production read path still works.</b> Rows written through the
 *       port are returned by the existing query API and the display-name
 *       vocabulary used by its filters still resolves.</li>
 * </ol>
 */
@SpringBootTest
class SharedAuditContractTests extends AbstractSecurityTest {

    @Autowired
    private AuditPort auditPort;

    @Autowired
    private AuditService auditService;

    @Autowired
    private AuditLogRepository auditLogRepository;

    private static AuditRecord sample(String entityId) {
        return new AuditRecord(
                AuditModule.PRODUCTION,
                "ProductionOrder",
                entityId,
                "WO-" + entityId,
                AuditAction.VERIFY,
                "42",
                "Shared Audit Probe",
                "Verification recorded through the shared contract",
                "{\"status\":\"PENDING\"}",
                "{\"status\":\"VERIFIED\"}",
                "10.0.0.7",
                "req-" + entityId);
    }

    @Test
    void writingThroughThePortPersistsExactlyWhatADirectCallPersists() {
        // The same logical entry through both entry points: the shared port and
        // the implementation's own API, which is how production callers write.
        auditPort.record(sample("77"));
        auditService.record(
                AuditModule.PRODUCTION, "ProductionOrder", "77", "WO-77", AuditAction.VERIFY,
                "42", "Shared Audit Probe", "Verification recorded through the shared contract",
                "{\"status\":\"PENDING\"}", "{\"status\":\"VERIFIED\"}", "10.0.0.7", "req-77");

        List<AuditLog> rows = auditLogRepository.findAll().stream()
                .filter(l -> "77".equals(l.getEntityId()))
                .sorted(Comparator.comparing(AuditLog::getId))
                .toList();
        assertThat(rows).hasSize(2);
        AuditLog fromPort = rows.get(0);
        AuditLog direct = rows.get(1);

        // Same enum vocabulary, persisted by name (what the database stores).
        assertThat(fromPort.getModule()).isEqualTo(AuditModule.PRODUCTION);
        assertThat(fromPort.getModule().name()).isEqualTo("PRODUCTION");
        assertThat(fromPort.getAction()).isEqualTo(AuditAction.VERIFY);
        assertThat(fromPort.getAction().name()).isEqualTo("VERIFY");

        // Every other column matches the direct call, field for field.
        assertThat(fromPort)
                .usingRecursiveComparison()
                .ignoringFields("id", "createdAt", "updatedAt")
                .isEqualTo(direct);
        assertThat(fromPort.getEntityDisplayId()).isEqualTo("WO-77");
        assertThat(fromPort.getIpAddress()).isEqualTo("10.0.0.7");
        assertThat(fromPort.getRequestId()).isEqualTo("req-77");
    }

    @Test
    void rowsWrittenThroughThePortAreVisibleToTheExistingReadApi() {
        auditPort.record(sample("3"));

        List<AuditLogDTO> history = auditService.getEntityHistory("ProductionOrder", "3");
        assertThat(history).hasSize(1);
        assertThat(history.get(0).getModule()).isEqualTo(AuditModule.PRODUCTION.getDisplayName());
        assertThat(history.get(0).getAction()).isEqualTo(AuditAction.VERIFY.getDisplayName());
        assertThat(history.get(0).getDescription())
                .isEqualTo("Verification recorded through the shared contract");

        // The filter vocabulary used by the read API still resolves the moved enums.
        assertThat(AuditModule.fromDisplayName("Production")).isEqualTo(AuditModule.PRODUCTION);
        assertThat(AuditModule.fromDisplayName("PRODUCTION")).isEqualTo(AuditModule.PRODUCTION);
        assertThat(AuditAction.fromDisplayName("Verify")).isEqualTo(AuditAction.VERIFY);
        assertThat(AuditAction.fromDisplayName("VERIFY")).isEqualTo(AuditAction.VERIFY);
    }

}
