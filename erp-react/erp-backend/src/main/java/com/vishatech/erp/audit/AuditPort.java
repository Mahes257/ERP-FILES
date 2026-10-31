package com.vishatech.erp.audit;

/**
 * Shared audit write contract for the ERP-wide {@code audit_logs} table.
 *
 * <p><b>Why this interface exists.</b> The audit trail is cross-module
 * infrastructure — {@link AuditModule} enumerates PURCHASE, SALES, PRODUCTION, …
 * and several modules write into the same table — but the implementation used to
 * live only in the production module. Any other module that wanted to audit had
 * to import {@code com.vishatech.erp.service.production.AuditService}, which made
 * a business module depend on another business module's internals. Purchase was
 * the remaining such caller; this port is the seam that removes it.
 *
 * <p><b>Contract.</b> A caller supplies an {@link AuditRecord} and the
 * implementation persists it. Nothing else is shared: the read/query API
 * (pagination, filters, statistics, entity history) and the {@code /audit} REST
 * surface stay with the audit implementation, because no other module consumes
 * them.
 *
 * <p><b>Transactions are the caller's concern.</b> Implementations must join the
 * caller's transaction when one is active (the default {@code REQUIRED}
 * behaviour) and must not introduce a transaction boundary of their own: whether
 * an audit write is isolated from, or part of, business work is a decision each
 * caller makes deliberately. Purchase, for example, writes its mirror only after
 * its business transaction has committed, in a transaction of its own.
 *
 * <p><b>Persisted representation.</b> Implementations write to the existing
 * {@code audit_logs} table with {@link AuditModule} and {@link AuditAction}
 * stored by enum name; they must not change the stored shape or vocabulary.
 */
public interface AuditPort {

    /**
     * Writes one audit entry against the shared audit trail.
     *
     * @param entry the entry to persist; {@code ipAddress} and {@code requestId}
     *              may be {@code null}
     */
    void record(AuditRecord entry);
}
