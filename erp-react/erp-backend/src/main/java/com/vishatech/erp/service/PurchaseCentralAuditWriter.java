package com.vishatech.erp.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.audit.AuditAction;
import com.vishatech.erp.audit.AuditModule;
import com.vishatech.erp.audit.AuditPort;
import com.vishatech.erp.audit.AuditRecord;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.util.AuditContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Mirrors Purchase timeline entries into the shared {@code audit_logs} table.
 *
 * <p>This bean exists for exactly one reason: it is a <b>separate Spring bean</b>,
 * so the {@code REQUIRES_NEW} transaction on {@link #write} is applied by the
 * transaction proxy. A call to a method on {@code this} would bypass the proxy
 * and silently stay in the caller's transaction, which is the defect this class
 * removes.
 *
 * <p><b>Transaction semantics (P1 — the contract {@link PurchaseSupportService}
 * relies on).</b> The mirror is written in its own transaction, independent of
 * the Purchase business transaction:
 *
 * <ul>
 *   <li>the business transaction is <em>suspended</em> while the mirror runs, so
 *       a failure inside the audit insert rolls back <em>only</em> the audit
 *       transaction — it can no longer mark the business transaction
 *       rollback-only (previously the audit service was called with
 *       {@code REQUIRED} propagation inside the business transaction, so a
 *       persistence failure there poisoned the business commit even though the
 *       exception was caught);</li>
 *   <li>the mirror is always invoked <em>after</em> the business transaction has
 *       committed (see {@link PurchaseSupportService}), so no audit row is
 *       written for an operation that never committed — the audit trail still
 *       only describes persisted actions;</li>
 *   <li>a mirror failure costs one extra transaction and is logged by the
 *       caller; {@code purchase_timelines} remains the authoritative Purchase
 *       trail, exactly as before.</li>
 * </ul>
 *
 * <p><b>Cost.</b> One short extra transaction (and therefore one extra pooled
 * connection for the duration of the insert) per Purchase timeline entry. The
 * audit row itself, the values written to it and the best-effort policy are
 * unchanged.
 */
@Service
public class PurchaseCentralAuditWriter {

    /**
     * The shared audit <em>contract</em> (P2). The audit subsystem is cross-module
     * infrastructure — {@link AuditModule} enumerates every ERP module — so
     * Purchase depends on the shared port and never on the production module that
     * happens to implement it today. Swapping the implementation, or moving it to a
     * neutral module, requires no change here.
     */
    private final AuditPort auditPort;

    private final AuditContext auditContext;

    private final ObjectMapper objectMapper = new ObjectMapper();

    public PurchaseCentralAuditWriter(AuditPort auditPort, AuditContext auditContext) {
        this.auditPort = auditPort;
        this.auditContext = auditContext;
    }

    /**
     * Writes one central audit row for a Purchase document action.
     *
     * <p>Runs in its own transaction ({@code REQUIRES_NEW}) so that a failure
     * here cannot affect the caller's transaction. The caller is responsible for
     * the best-effort policy (log, never propagate) and for invoking this only
     * once the business transaction has committed.
     *
     * <p>The persisted representation is byte-for-byte what Purchase wrote
     * before: module {@code PURCHASE}, entity type = document family
     * ({@code PR}/{@code RFQ}/…), entity id = document id, display id =
     * {@code <family>-<id>}, the mapped {@link AuditAction}, the acting user,
     * the human description and old/new values as JSON. Client IP and request id
     * are deliberately <b>not</b> persisted by the Purchase mirror, exactly as
     * before this change.
     *
     * @param docType   Purchase document family, e.g. {@code PR}, {@code PO}
     * @param docId     owning document id
     * @param type      timeline action type, mapped through {@link #auditAction}
     * @param label     human label of the action
     * @param oldValue  previous value (stored as JSON when present)
     * @param newValue  new value (stored as JSON when present)
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void write(String docType, Long docId, String type, String label,
                      String oldValue, String newValue) {
        User user = auditContext.currentUser();
        auditPort.record(new AuditRecord(
                AuditModule.PURCHASE,
                docType,
                docId == null ? null : String.valueOf(docId),
                docType + "-" + docId,
                auditAction(type),
                user == null ? null : String.valueOf(user.getId()),
                auditContext.currentUserName(),
                label + (newValue == null || newValue.isBlank() ? "" : " — " + newValue),
                jsonValue(oldValue),
                jsonValue(newValue),
                null,
                null));
    }

    /** The shared audit_logs table stores old/new values as native JSON. */
    private String jsonValue(String value) {
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("Unable to serialize Purchase audit value", e);
        }
    }

    /** Maps a Purchase timeline action to the shared AuditAction vocabulary. */
    private AuditAction auditAction(String type) {
        return switch (type == null ? "" : type) {
            case "create" -> AuditAction.CREATE;
            case "update" -> AuditAction.UPDATE;
            case "delete" -> AuditAction.DELETE;
            case "submit" -> AuditAction.SUBMIT;
            case "approve" -> AuditAction.APPROVE;
            case "reject" -> AuditAction.REJECT;
            case "archive", "restore" -> AuditAction.UPDATE;
            case "release", "receive", "grn" -> AuditAction.DELIVER;
            case "quotation", "award" -> AuditAction.VERIFY;
            case "payment", "invoice" -> AuditAction.STATUS_CHANGE;
            case "attachment" -> AuditAction.FILE_UPLOAD;
            case "acknowledge" -> AuditAction.COMPLETE;
            default -> AuditAction.UPDATE;
        };
    }
}
