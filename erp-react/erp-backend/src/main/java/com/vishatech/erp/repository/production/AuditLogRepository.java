package com.vishatech.erp.repository.production;

import com.vishatech.erp.audit.AuditAction;
import com.vishatech.erp.audit.AuditModule;
import com.vishatech.erp.entity.production.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

/**
 * Repository for the central audit log.
 */
@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {

    // ========================
    // Search & Filter
    // ========================

    @Query("SELECT a FROM AuditLog a WHERE " +
        "(:search IS NULL OR :search = '' OR " +
        "LOWER(a.description) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
        "LOWER(a.entityType) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
        "LOWER(a.entityDisplayId) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
        "LOWER(a.username) LIKE LOWER(CONCAT('%', :search, '%')))")
    Page<AuditLog> searchAuditLogs(@Param("search") String search, Pageable pageable);

    @Query("SELECT a FROM AuditLog a WHERE " +
        "(:search IS NULL OR :search = '' OR " +
        "LOWER(a.description) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
        "LOWER(a.entityType) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
        "LOWER(a.entityDisplayId) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
        "LOWER(a.username) LIKE LOWER(CONCAT('%', :search, '%'))) AND " +
        "(:module IS NULL OR a.module = :module) AND " +
        "(:entityType IS NULL OR a.entityType = :entityType) AND " +
        "(:action IS NULL OR a.action = :action) AND " +
        "(:userId IS NULL OR a.userId = :userId) AND " +
        "(:dateFrom IS NULL OR a.createdAt >= :dateFrom) AND " +
        "(:dateTo IS NULL OR a.createdAt <= :dateTo)")
    Page<AuditLog> findFiltered(
        @Param("search") String search,
        @Param("module") AuditModule module,
        @Param("entityType") String entityType,
        @Param("action") AuditAction action,
        @Param("userId") String userId,
        @Param("dateFrom") Instant dateFrom,
        @Param("dateTo") Instant dateTo,
        Pageable pageable);

    // ========================
    // Entity History
    // ========================

    List<AuditLog> findByEntityTypeAndEntityIdOrderByCreatedAtDesc(
        String entityType, String entityId);

    // ========================
    // User Activity
    // ========================

    Page<AuditLog> findByUserIdOrderByCreatedAtDesc(String userId, Pageable pageable);

    @Query("SELECT a FROM AuditLog a WHERE a.userId = :userId AND " +
        "(:module IS NULL OR a.module = :module)")
    Page<AuditLog> findByUserIdAndModule(
        @Param("userId") String userId,
        @Param("module") AuditModule module,
        Pageable pageable);

    // ========================
    // Module Activity
    // ========================

    Page<AuditLog> findByModuleOrderByCreatedAtDesc(AuditModule module, Pageable pageable);

    // ========================
    // Statistics
    // ========================

    @Query("SELECT a.module, COUNT(a) FROM AuditLog a GROUP BY a.module ORDER BY COUNT(a) DESC")
    List<Object[]> countByModule();

    @Query("SELECT a.action, COUNT(a) FROM AuditLog a GROUP BY a.action ORDER BY COUNT(a) DESC")
    List<Object[]> countByAction();

    @Query("SELECT a.entityType, COUNT(a) FROM AuditLog a GROUP BY a.entityType ORDER BY COUNT(a) DESC")
    List<Object[]> countByEntityType();

    long countByModule(AuditModule module);

    long countByAction(AuditAction action);

    long countByCreatedAtBetween(Instant from, Instant to);

    long countByUserId(String userId);

    @Query("SELECT COUNT(a) FROM AuditLog a WHERE a.createdAt >= :since")
    long countSince(@Param("since") Instant since);
}
