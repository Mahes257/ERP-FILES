package com.vishatech.erp.service.production;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.audit.AuditAction;
import com.vishatech.erp.audit.AuditModule;
import com.vishatech.erp.audit.AuditPort;
import com.vishatech.erp.audit.AuditRecord;
import com.vishatech.erp.dto.production.AuditLogDTO;
import com.vishatech.erp.dto.production.AuditStatsDTO;
import com.vishatech.erp.dto.production.PagedResponse;
import com.vishatech.erp.entity.production.AuditLog;
import com.vishatech.erp.repository.production.AuditLogRepository;
import com.vishatech.erp.util.production.OrderMapper;
import jakarta.persistence.EntityManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Central ERP Audit Service — the implementation of the shared
 * {@link AuditPort}.
 *
 * <p>Creates immutable audit records for every meaningful ERP action, and serves
 * the read-only {@code /audit} query API (pagination, filters, statistics, entity
 * history).
 *
 * <p><b>Ownership.</b> The <em>write contract</em> and the audit vocabulary are
 * shared infrastructure and live in {@code com.vishatech.erp.audit}
 * ({@link AuditPort}, {@link AuditRecord}, {@link AuditModule},
 * {@link AuditAction}). This class is the implementation that owns the
 * {@code audit_logs} persistence and the read API; other modules depend on the
 * port, never on this class's package.
 *
 * <p><b>Transaction policy.</b> The class is {@code @Transactional}, so every
 * write joins the caller's transaction ({@code REQUIRED}) exactly as before. The
 * service deliberately does not isolate itself: whether an audit write must
 * survive a caller's rollback is the caller's decision. Purchase, for example,
 * calls it from a separate transaction after its own commit (see
 * {@code PurchaseCentralAuditWriter}).
 */
@Service
@Transactional
public class AuditService implements AuditPort {

    private final AuditLogRepository auditLogRepository;
    private final EntityManager entityManager;
    private final ObjectMapper objectMapper;

    public AuditService(AuditLogRepository auditLogRepository,
                        EntityManager entityManager,
                        ObjectMapper objectMapper) {
        this.auditLogRepository = auditLogRepository;
        this.entityManager = entityManager;
        this.objectMapper = objectMapper;
    }

    // ========================
    // Audit Creation
    // ========================

    /**
     * {@link AuditPort} adapter: the shared-contract entry point.
     *
     * <p>Delegates to the existing creation overload, so the persisted audit
     * representation (columns, enum names, JSON values) is byte-for-byte what
     * direct callers already produced. Callers outside this package should use
     * this method through the {@link AuditPort} interface.
     */
    @Override
    public void record(AuditRecord entry) {
        record(entry.module(), entry.entityType(), entry.entityId(), entry.entityDisplayId(),
                entry.action(), entry.userId(), entry.username(), entry.description(),
                entry.oldValue(), entry.newValue(), entry.ipAddress(), entry.requestId());
    }

    /**
     * Create an audit record. Called by business services inside their transactions.
     *
     * @param module         ERP module
     * @param entityType     entity type (e.g., "ProductionOrder")
     * @param entityId       entity ID
     * @param entityDisplayId display identifier (e.g., "WO-0001")
     * @param action         action performed
     * @param userId         authenticated user ID
     * @param username       display name of the user
     * @param description    human-readable description
     * @param oldValue       previous state (JSON string, nullable)
     * @param newValue       new state (JSON string, nullable)
     * @param ipAddress      client IP (nullable)
     * @param requestId      request tracing ID (nullable)
     * @return the saved audit log
     */
    public AuditLog record(AuditModule module, String entityType, String entityId,
                           String entityDisplayId, AuditAction action,
                           String userId, String username, String description,
                           String oldValue, String newValue,
                           String ipAddress, String requestId) {

        AuditLog audit = AuditLog.builder()
            .module(module)
            .entityType(entityType)
            .entityId(entityId)
            .entityDisplayId(entityDisplayId)
            .action(action)
            .userId(userId)
            .username(username)
            .description(description)
            .oldValue(oldValue)
            .newValue(newValue)
            .ipAddress(ipAddress)
            .requestId(requestId)
            .build();

        return auditLogRepository.save(audit);
    }

    /**
     * Convenience overload for common audit creation without IP/requestId.
     */
    public AuditLog record(AuditModule module, String entityType, String entityId,
                           String entityDisplayId, AuditAction action,
                           String userId, String username, String description,
                           String oldValue, String newValue) {
        return record(module, entityType, entityId, entityDisplayId, action,
            userId, username, description, oldValue, newValue, null, null);
    }

    /**
     * Convenience overload for simple audit without old/new values.
     */
    public AuditLog record(AuditModule module, String entityType, String entityId,
                           String entityDisplayId, AuditAction action,
                           String userId, String username, String description) {
        return record(module, entityType, entityId, entityDisplayId, action,
            userId, username, description, null, null, null, null);
    }

    /**
     * Record a status change audit with old/new status values.
     */
    public AuditLog recordStatusChange(AuditModule module, String entityType,
                                       String entityId, String entityDisplayId,
                                       String oldStatus, String newStatus,
                                       String userId, String username) {
        String description = String.format("%s status changed from %s to %s.",
            entityType, oldStatus, newStatus);

        String oldJson = serializeStatus(oldStatus);
        String newJson = serializeStatus(newStatus);

        return record(module, entityType, entityId, entityDisplayId,
            AuditAction.STATUS_CHANGE, userId, username, description,
            oldJson, newJson);
    }

    /**
     * Record a CRUD create operation.
     */
    public AuditLog recordCreate(AuditModule module, String entityType,
                                 String entityId, String entityDisplayId,
                                 String userId, String username, String details) {
        String description = String.format("%s %s created.%s",
            entityType, entityDisplayId != null ? entityDisplayId : "",
            details != null ? " " + details : "");
        return record(module, entityType, entityId, entityDisplayId,
            AuditAction.CREATE, userId, username, description);
    }

    /**
     * Record a CRUD update operation.
     */
    public AuditLog recordUpdate(AuditModule module, String entityType,
                                 String entityId, String entityDisplayId,
                                 String userId, String username,
                                 String oldValue, String newValue) {
        String description = String.format("%s %s updated.",
            entityType, entityDisplayId != null ? entityDisplayId : "");
        return record(module, entityType, entityId, entityDisplayId,
            AuditAction.UPDATE, userId, username, description,
            oldValue, newValue);
    }

    /**
     * Record a delete operation.
     */
    public AuditLog recordDelete(AuditModule module, String entityType,
                                 String entityId, String entityDisplayId,
                                 String userId, String username) {
        String description = String.format("%s %s deleted.",
            entityType, entityDisplayId != null ? entityDisplayId : "");
        return record(module, entityType, entityId, entityDisplayId,
            AuditAction.DELETE, userId, username, description);
    }

    // ========================
    // Query APIs
    // ========================

    /**
     * Get audit log by ID.
     */
    @Transactional(readOnly = true)
    public AuditLogDTO getAuditLog(Long id) {
        AuditLog audit = auditLogRepository.findById(id)
            .orElseThrow(() -> new java.util.NoSuchElementException("Audit log not found with id: " + id));
        return OrderMapper.toAuditLogDTO(audit);
    }

    /**
     * Get all audit logs with search, filters, and pagination.
     */
    @Transactional(readOnly = true)
    public PagedResponse<AuditLogDTO> getAuditLogs(
            String search, String module, String entityType, String action,
            String userId, String dateFrom, String dateTo,
            int page, int size, String sort, String direction) {

        Sort sortOrder;
        if (sort != null && !sort.isBlank()) {
            Sort.Direction dir = "desc".equalsIgnoreCase(direction) ? Sort.Direction.DESC : Sort.Direction.ASC;
            sortOrder = Sort.by(dir, mapSortField(sort));
        } else {
            sortOrder = Sort.by(Sort.Direction.DESC, "createdAt");
        }

        PageRequest pageRequest = PageRequest.of(Math.max(0, page), Math.max(1, Math.min(size, 100)), sortOrder);

        boolean hasFilters = (module != null && !module.isBlank()) ||
            (entityType != null && !entityType.isBlank()) ||
            (action != null && !action.isBlank()) ||
            (userId != null && !userId.isBlank()) ||
            (dateFrom != null && !dateFrom.isBlank()) ||
            (dateTo != null && !dateTo.isBlank());

        Page<AuditLog> auditPage;

        if (hasFilters) {
            auditPage = auditLogRepository.findFiltered(
                search,
                module != null && !module.isBlank() ? AuditModule.fromDisplayName(module) : null,
                entityType,
                action != null && !action.isBlank() ? AuditAction.fromDisplayName(action) : null,
                userId,
                dateFrom != null && !dateFrom.isBlank() ? Instant.parse(dateFrom) : null,
                dateTo != null && !dateTo.isBlank() ? Instant.parse(dateTo) : null,
                pageRequest
            );
        } else {
            auditPage = auditLogRepository.searchAuditLogs(search, pageRequest);
        }

        List<AuditLogDTO> dtos = auditPage.getContent().stream()
            .map(OrderMapper::toAuditLogDTO)
            .collect(Collectors.toList());

        return PagedResponse.<AuditLogDTO>builder()
            .content(dtos)
            .page(auditPage.getNumber())
            .size(auditPage.getSize())
            .totalElements(auditPage.getTotalElements())
            .totalPages(auditPage.getTotalPages())
            .first(auditPage.isFirst())
            .last(auditPage.isLast())
            .build();
    }

    /**
     * Get entity history — what happened to a specific record.
     */
    @Transactional(readOnly = true)
    public List<AuditLogDTO> getEntityHistory(String entityType, String entityId) {
        return auditLogRepository.findByEntityTypeAndEntityIdOrderByCreatedAtDesc(entityType, entityId)
            .stream()
            .map(OrderMapper::toAuditLogDTO)
            .collect(Collectors.toList());
    }

    /**
     * Get user activity — actions performed by a specific user.
     */
    @Transactional(readOnly = true)
    public PagedResponse<AuditLogDTO> getUserActivity(String userId, String module,
                                                       int page, int size) {
        PageRequest pageRequest = PageRequest.of(Math.max(0, page), Math.max(1, Math.min(size, 100)),
            Sort.by(Sort.Direction.DESC, "createdAt"));

        Page<AuditLog> auditPage;
        if (module != null && !module.isBlank()) {
            auditPage = auditLogRepository.findByUserIdAndModule(
                userId, AuditModule.fromDisplayName(module), pageRequest);
        } else {
            auditPage = auditLogRepository.findByUserIdOrderByCreatedAtDesc(userId, pageRequest);
        }

        List<AuditLogDTO> dtos = auditPage.getContent().stream()
            .map(OrderMapper::toAuditLogDTO)
            .collect(Collectors.toList());

        return PagedResponse.<AuditLogDTO>builder()
            .content(dtos)
            .page(auditPage.getNumber())
            .size(auditPage.getSize())
            .totalElements(auditPage.getTotalElements())
            .totalPages(auditPage.getTotalPages())
            .first(auditPage.isFirst())
            .last(auditPage.isLast())
            .build();
    }

    /**
     * Get module activity — all audit entries for a specific module.
     */
    @Transactional(readOnly = true)
    public PagedResponse<AuditLogDTO> getModuleActivity(String module, int page, int size) {
        PageRequest pageRequest = PageRequest.of(Math.max(0, page), Math.max(1, Math.min(size, 100)),
            Sort.by(Sort.Direction.DESC, "createdAt"));

        Page<AuditLog> auditPage = auditLogRepository.findByModuleOrderByCreatedAtDesc(
            AuditModule.fromDisplayName(module), pageRequest);

        List<AuditLogDTO> dtos = auditPage.getContent().stream()
            .map(OrderMapper::toAuditLogDTO)
            .collect(Collectors.toList());

        return PagedResponse.<AuditLogDTO>builder()
            .content(dtos)
            .page(auditPage.getNumber())
            .size(auditPage.getSize())
            .totalElements(auditPage.getTotalElements())
            .totalPages(auditPage.getTotalPages())
            .first(auditPage.isFirst())
            .last(auditPage.isLast())
            .build();
    }

    /**
     * Get audit statistics.
     */
    @Transactional(readOnly = true)
    public AuditStatsDTO getStatistics() {
        long total = auditLogRepository.count();

        Instant todayStart = LocalDate.now().atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant weekStart = LocalDate.now().minusDays(7).atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant monthStart = LocalDate.now().minusDays(30).atStartOfDay(ZoneOffset.UTC).toInstant();

        long todayCount = auditLogRepository.countSince(todayStart);
        long weekCount = auditLogRepository.countSince(weekStart);
        long monthCount = auditLogRepository.countSince(monthStart);

        // Counts by module
        Map<String, Long> byModule = new LinkedHashMap<>();
        auditLogRepository.countByModule().forEach(row -> {
            AuditModule module = (AuditModule) row[0];
            Long count = (Long) row[1];
            byModule.put(module.getDisplayName(), count);
        });

        // Counts by action
        Map<String, Long> byAction = new LinkedHashMap<>();
        auditLogRepository.countByAction().forEach(row -> {
            AuditAction action = (AuditAction) row[0];
            Long count = (Long) row[1];
            byAction.put(action.getDisplayName(), count);
        });

        // Counts by entity type
        Map<String, Long> byEntityType = new LinkedHashMap<>();
        auditLogRepository.countByEntityType().forEach(row -> {
            String entityType = (String) row[0];
            Long count = (Long) row[1];
            byEntityType.put(entityType, count);
        });

        // Total unique users (approximate from user IDs)
        long totalUsers = byModule.isEmpty() ? 0 : auditLogRepository.countByAction(AuditAction.CREATE);

        return AuditStatsDTO.builder()
            .totalAuditLogs(total)
            .todayAuditLogs(todayCount)
            .thisWeekAuditLogs(weekCount)
            .thisMonthAuditLogs(monthCount)
            .byModule(byModule)
            .byAction(byAction)
            .byEntityType(byEntityType)
            .totalUsers(totalUsers)
            .build();
    }

    // ========================
    // Helper Methods
    // ========================

    /**
     * Serialize a status value to JSON for old/new value storage.
     */
    private String serializeStatus(String status) {
        if (status == null) return null;
        try {
            Map<String, String> map = Map.of("status", status);
            return objectMapper.writeValueAsString(map);
        } catch (Exception e) {
            return "{\"status\":\"" + status + "\"}";
        }
    }

    /**
     * Build a JSON representation of changed fields for audit old/new values.
     */
    public String buildChangeJson(Map<String, Object> fields) {
        if (fields == null || fields.isEmpty()) return null;
        try {
            return objectMapper.writeValueAsString(fields);
        } catch (Exception e) {
            return fields.toString();
        }
    }

    private String mapSortField(String frontendField) {
        return switch (frontendField.toLowerCase()) {
            case "module" -> "module";
            case "entitytype", "entity_type" -> "entityType";
            case "entityid", "entity_id" -> "entityId";
            case "action" -> "action";
            case "userid", "user_id" -> "userId";
            case "username" -> "username";
            case "createdat", "created_at" -> "createdAt";
            default -> "createdAt";
        };
    }
}
