package com.vishatech.erp.entity.production;

import com.vishatech.erp.audit.AuditAction;
import com.vishatech.erp.audit.AuditModule;
import jakarta.persistence.*;
import lombok.*;

/**
 * Central, immutable audit log for the ERP.
 * Records every meaningful business action across all modules.
 * Audit records are READ ONLY — no update or delete APIs exist.
 */
@Entity
@Table(name = "audit_logs", indexes = {
    @Index(name = "idx_audit_user_id", columnList = "user_id"),
    @Index(name = "idx_audit_module", columnList = "module"),
    @Index(name = "idx_audit_entity_type", columnList = "entity_type"),
    @Index(name = "idx_audit_entity_id", columnList = "entity_id"),
    @Index(name = "idx_audit_action", columnList = "action"),
    @Index(name = "idx_audit_created_at", columnList = "created_at"),
    @Index(name = "idx_audit_module_entity", columnList = "module, entity_type, entity_id"),
    @Index(name = "idx_audit_user_module", columnList = "user_id, module")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLog extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * User who performed the action (from authenticated backend context).
     */
    @Column(name = "user_id", length = 255)
    private String userId;

    /**
     * Display name of the user.
     */
    @Column(name = "username", length = 255)
    private String username;

    /**
     * ERP module where the action occurred.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "module", nullable = false, length = 50)
    private AuditModule module;

    /**
     * Entity type affected (e.g., ProductionOrder, PackingList).
     */
    @Column(name = "entity_type", nullable = false, length = 100)
    private String entityType;

    /**
     * ID of the affected record.
     */
    @Column(name = "entity_id", length = 100)
    private String entityId;

    /**
     * Display identifier of the record (e.g., WO-0001, PL-0001).
     */
    @Column(name = "entity_display_id", length = 255)
    private String entityDisplayId;

    /**
     * Action performed.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "action", nullable = false, length = 50)
    private AuditAction action;

    /**
     * Previous state (JSON) for UPDATE / STATUS_CHANGE operations.
     */
    @Column(name = "old_value", columnDefinition = "JSON")
    private String oldValue;

    /**
     * New state (JSON) for UPDATE / STATUS_CHANGE operations.
     */
    @Column(name = "new_value", columnDefinition = "JSON")
    private String newValue;

    /**
     * Human-readable description of the action.
     */
    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    /**
     * IP address of the client (if available from request context).
     */
    @Column(name = "ip_address", length = 100)
    private String ipAddress;

    /**
     * Request ID for tracing (if available).
     */
    @Column(name = "request_id", length = 100)
    private String requestId;
}
