package com.vishatech.erp.audit;

/**
 * One immutable audit entry to be written through {@link AuditPort}.
 *
 * <p>This is the deliberate request contract of the shared audit boundary: it
 * names every field a caller supplies, so a cross-module caller cannot silently
 * mis-order a long positional argument list. The field set is exactly what the
 * audit table already stores — no new field, no renamed field, no changed
 * meaning — so adopting the port cannot change the persisted representation.
 *
 * <p>Nullability follows the existing table: {@code module}, {@code entityType},
 * {@code description} and {@code action} are always supplied by callers in this
 * codebase; {@code entityId}, {@code entityDisplayId}, {@code userId},
 * {@code username}, {@code oldValue}, {@code newValue}, {@code ipAddress} and
 * {@code requestId} may be {@code null} ({@code oldValue}/{@code newValue} are
 * JSON strings when present).
 *
 * @param module          ERP module the action belongs to, stored by enum name
 * @param entityType      entity family, e.g. {@code PR}, {@code ProductionOrder}
 * @param entityId        id of the affected record, as text
 * @param entityDisplayId human-facing identifier, e.g. {@code PR-42}
 * @param action          action performed, stored by enum name
 * @param userId          acting user's id, as text
 * @param username        acting user's display name
 * @param description     human-readable description
 * @param oldValue        previous state as JSON, nullable
 * @param newValue        new state as JSON, nullable
 * @param ipAddress       client IP, nullable (not persisted by every caller)
 * @param requestId       tracing id, nullable (not persisted by every caller)
 */
public record AuditRecord(
        AuditModule module,
        String entityType,
        String entityId,
        String entityDisplayId,
        AuditAction action,
        String userId,
        String username,
        String description,
        String oldValue,
        String newValue,
        String ipAddress,
        String requestId) {
}
