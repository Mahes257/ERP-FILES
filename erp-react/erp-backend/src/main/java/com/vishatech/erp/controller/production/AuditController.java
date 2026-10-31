package com.vishatech.erp.controller.production;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.production.AuditLogDTO;
import com.vishatech.erp.dto.production.AuditStatsDTO;
import com.vishatech.erp.dto.production.PagedResponse;
import com.vishatech.erp.service.production.AuditService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;

import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * REST controller for the central Audit Log.
 * Provides read-only access to audit records with search, filtering, and pagination.
 * No create/update/delete endpoints — audit is created by business services internally.
 */
@RestController
@RequestMapping("/audit")
@PreAuthorize("hasAuthority('PRODUCTION_VIEW')")
public class AuditController {

    private final AuditService auditService;

    public AuditController(AuditService auditService) {
        this.auditService = auditService;
    }

    // ========================
    // List & Search
    // ========================

    /**
     * GET /api/audit
     * List all audit logs with search, filters, and pagination.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<PagedResponse<AuditLogDTO>>> listAuditLogs(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String module,
            @RequestParam(required = false) String entityType,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "desc") String direction) {

        PagedResponse<AuditLogDTO> result = auditService.getAuditLogs(
            search, module, entityType, action, userId, dateFrom, dateTo,
            page, size, sort, direction);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    // ========================
    // Get By ID
    // ========================

    /**
     * GET /api/audit/{id}
     * Get a single audit log entry.
     */
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<AuditLogDTO>> getAuditLog(@PathVariable Long id) {
        AuditLogDTO audit = auditService.getAuditLog(id);
        return ResponseEntity.ok(ApiResponse.ok(audit));
    }

    // ========================
    // Entity History
    // ========================

    /**
     * GET /api/audit/entity/{entityType}/{entityId}
     * Get the full history of a specific record.
     */
    @GetMapping("/entity/{entityType}/{entityId}")
    public ResponseEntity<ApiResponse<List<AuditLogDTO>>> getEntityHistory(
            @PathVariable String entityType,
            @PathVariable String entityId) {
        List<AuditLogDTO> history = auditService.getEntityHistory(entityType, entityId);
        return ResponseEntity.ok(ApiResponse.ok(history));
    }

    // ========================
    // User Activity
    // ========================

    /**
     * GET /api/audit/user/{userId}
     * Get all actions performed by a specific user.
     */
    @GetMapping("/user/{userId}")
    public ResponseEntity<ApiResponse<PagedResponse<AuditLogDTO>>> getUserActivity(
            @PathVariable String userId,
            @RequestParam(required = false) String module,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        PagedResponse<AuditLogDTO> result = auditService.getUserActivity(userId, module, page, size);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    // ========================
    // Module Activity
    // ========================

    /**
     * GET /api/audit/module/{module}
     * Get all audit entries for a specific module.
     */
    @GetMapping("/module/{module}")
    public ResponseEntity<ApiResponse<PagedResponse<AuditLogDTO>>> getModuleActivity(
            @PathVariable String module,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        PagedResponse<AuditLogDTO> result = auditService.getModuleActivity(module, page, size);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    // ========================
    // Statistics
    // ========================

    /**
     * GET /api/audit/stats
     * Get audit statistics/KPI data.
     */
    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<AuditStatsDTO>> getStats() {
        AuditStatsDTO stats = auditService.getStatistics();
        return ResponseEntity.ok(ApiResponse.ok(stats));
    }
}
