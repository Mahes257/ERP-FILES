package com.vishatech.erp.purchase;

import static org.assertj.core.api.Assertions.assertThat;

import com.vishatech.erp.audit.AuditAction;
import com.vishatech.erp.audit.AuditModule;
import com.vishatech.erp.entity.production.AuditLog;
import com.vishatech.erp.repository.PurchaseTimelineRepository;
import com.vishatech.erp.repository.production.AuditLogRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.service.PurchaseSupportService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * P1 — the successful half of the Purchase → shared-audit mirror.
 *
 * <p>Pins the behaviour that must NOT change while the transaction boundary
 * moves to its own transaction and after-commit timing:
 *
 * <ul>
 *   <li>a Purchase timeline entry still produces exactly one shared
 *       {@code audit_logs} row,</li>
 *   <li>that row still carries the module, entity type, entity id, display id,
 *       action, actor, description and JSON old/new values it carried before,</li>
 *   <li>the timeline-action → {@code AuditAction} vocabulary is unchanged,</li>
 *   <li>the Purchase mirror still persists no client IP and no request id.</li>
 * </ul>
 *
 * <p>{@link PurchaseAuditFailureIsolationTests} covers the failing half.
 */
@SpringBootTest
class PurchaseAuditWriteTests extends AbstractSecurityTest {

    @Autowired
    private PurchaseSupportService purchaseSupport;

    @Autowired
    private PurchaseTimelineRepository timelineRepository;

    @Autowired
    private AuditLogRepository auditLogRepository;

    private List<AuditLog> auditRowsFor(String entityType, long entityId) {
        return auditLogRepository.findAll().stream()
                .filter(l -> l.getModule() == AuditModule.PURCHASE)
                .filter(l -> entityType.equals(l.getEntityType()))
                .filter(l -> String.valueOf(entityId).equals(l.getEntityId()))
                .toList();
    }

    @Test
    void timelineEntryAndCentralAuditRowAreStillBothWritten() {
        long docId = System.nanoTime();

        purchaseSupport.log("PR", docId, "create", "Requisition created", "from test",
                null, "draft");

        // 1. The authoritative Purchase timeline entry.
        assertThat(timelineRepository.findByDocTypeAndDocIdOrderByTimestampAscIdAsc("PR", docId))
                .hasSize(1);

        // 2. Exactly one mirror row, with the persisted values unchanged.
        List<AuditLog> rows = auditRowsFor("PR", docId);
        assertThat(rows).hasSize(1);
        AuditLog row = rows.get(0);
        assertThat(row.getModule()).isEqualTo(AuditModule.PURCHASE);
        assertThat(row.getAction()).isEqualTo(AuditAction.CREATE);
        assertThat(row.getEntityType()).isEqualTo("PR");
        assertThat(row.getEntityId()).isEqualTo(String.valueOf(docId));
        assertThat(row.getEntityDisplayId()).isEqualTo("PR-" + docId);
        assertThat(row.getDescription()).startsWith("Requisition created").contains("draft");
        assertThat(row.getOldValue()).isNull();
        assertThat(row.getNewValue()).isEqualTo("\"draft\"");
        assertThat(row.getUsername()).isNotBlank();
        // The Purchase mirror never persisted request attribution fields.
        assertThat(row.getIpAddress()).isNull();
        assertThat(row.getRequestId()).isNull();
    }

    @Test
    void timelineActionVocabularyIsUnchanged() {
        long docId = System.nanoTime();
        record Action(String type, AuditAction expected) {
        }

        List<Action> expected = List.of(
                new Action("create", AuditAction.CREATE),
                new Action("submit", AuditAction.SUBMIT),
                new Action("approve", AuditAction.APPROVE),
                new Action("reject", AuditAction.REJECT),
                new Action("release", AuditAction.DELIVER),
                new Action("receive", AuditAction.DELIVER),
                new Action("attachment", AuditAction.FILE_UPLOAD),
                new Action("acknowledge", AuditAction.COMPLETE),
                new Action("payment", AuditAction.STATUS_CHANGE),
                new Action("quotation", AuditAction.VERIFY),
                new Action("delete", AuditAction.DELETE),
                new Action("archive", AuditAction.UPDATE),
                new Action("something-unknown", AuditAction.UPDATE));

        for (Action action : expected) {
            purchaseSupport.log("PO", docId, action.type(), "Vocabulary probe", null);
        }

        List<AuditLog> rows = auditRowsFor("PO", docId);
        assertThat(rows).hasSize(expected.size());
        assertThat(rows).extracting(AuditLog::getAction)
                .containsExactlyInAnyOrderElementsOf(expected.stream().map(Action::expected).toList());
    }
}
