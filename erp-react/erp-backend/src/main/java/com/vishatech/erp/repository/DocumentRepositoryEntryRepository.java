package com.vishatech.erp.repository;

import com.vishatech.erp.entity.DocumentRepositoryEntry;
import com.vishatech.erp.entity.DocumentVisibility;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface DocumentRepositoryEntryRepository extends JpaRepository<DocumentRepositoryEntry, Long> {

    long countByModule(String module);

    long countByStatus(String status);

    long countByVisibility(DocumentVisibility visibility);

    long countByCreatedAtBetween(LocalDateTime from, LocalDateTime to);

    @Query("SELECT d.module, COUNT(d) FROM DocumentRepositoryEntry d GROUP BY d.module ORDER BY d.module")
    List<Object[]> countByModuleGrouped();

    @Query("SELECT d.documentType, COUNT(d) FROM DocumentRepositoryEntry d GROUP BY d.documentType ORDER BY d.documentType")
    List<Object[]> countByDocumentTypeGrouped();

    // --- Module-scoped counts (Sales Documents page) ---

    @Query("SELECT COUNT(d) FROM DocumentRepositoryEntry d WHERE " + MODULE_SCOPE_FILTER)
    long countInModules(@Param("scopeModules") List<String> scopeModules);

    @Query("SELECT COUNT(d) FROM DocumentRepositoryEntry d WHERE LOWER(d.status) = LOWER(:status) AND "
            + MODULE_SCOPE_FILTER)
    long countByStatusInModules(@Param("status") String status,
                                @Param("scopeModules") List<String> scopeModules);

    @Query("SELECT COUNT(d) FROM DocumentRepositoryEntry d WHERE d.visibility = :visibility AND "
            + MODULE_SCOPE_FILTER)
    long countByVisibilityInModules(@Param("visibility") DocumentVisibility visibility,
                                    @Param("scopeModules") List<String> scopeModules);

    @Query("SELECT COUNT(d) FROM DocumentRepositoryEntry d WHERE d.createdAt >= :from AND d.createdAt <= :to AND "
            + MODULE_SCOPE_FILTER)
    long countCreatedBetweenInModules(@Param("from") LocalDateTime from,
                                      @Param("to") LocalDateTime to,
                                      @Param("scopeModules") List<String> scopeModules);

    @Query("SELECT d.module, COUNT(d) FROM DocumentRepositoryEntry d WHERE " + MODULE_SCOPE_FILTER
            + " GROUP BY d.module ORDER BY d.module")
    List<Object[]> countByModuleGroupedInModules(@Param("scopeModules") List<String> scopeModules);

    /** Rows in scope that are still active — the dataset the scoped page lists. */
    @Query("SELECT COUNT(d) FROM DocumentRepositoryEntry d WHERE " + MODULE_SCOPE_FILTER
            + " AND " + ACTIVE_FILTER)
    long countActiveInModules(@Param("scopeModules") List<String> scopeModules);

    /** Per-module active counts, so the category tabs add up to the scoped total. */
    @Query("SELECT d.module, COUNT(d) FROM DocumentRepositoryEntry d WHERE " + MODULE_SCOPE_FILTER
            + " AND " + ACTIVE_FILTER + " GROUP BY d.module ORDER BY d.module")
    List<Object[]> countByModuleGroupedInModulesActive(@Param("scopeModules") List<String> scopeModules);

    Page<DocumentRepositoryEntry> findByModuleIgnoreCase(String module, Pageable pageable);

    Page<DocumentRepositoryEntry> findByDocumentTypeIgnoreCase(String documentType, Pageable pageable);

    Page<DocumentRepositoryEntry> findByCustomerId(Long customerId, Pageable pageable);

    Page<DocumentRepositoryEntry> findByUploadedBy(String uploadedBy, Pageable pageable);

    Page<DocumentRepositoryEntry> findByVisibility(DocumentVisibility visibility, Pageable pageable);

    Page<DocumentRepositoryEntry> findByStatus(String status, Pageable pageable);

    @Query("SELECT d FROM DocumentRepositoryEntry d WHERE " +
           "(:search IS NULL OR :search = '' OR " +
           "LOWER(d.documentName) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(d.recordNumber) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(d.customerName) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(d.module) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(d.documentType) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(d.uploadedBy) LIKE LOWER(CONCAT('%', :search, '%')))")
    Page<DocumentRepositoryEntry> search(@Param("search") String search, Pageable pageable);

    /**
     * A repository row counts as ACTIVE while it is in neither terminal state:
     * not in the trash ({@code deleted}) and not {@code archived}. The Sales
     * Documents page lists the active repository — an old generated record
     * mirror that has been moved to the trash leaves the working list but stays
     * one Status filter away (and fully restorable).
     */
    String ACTIVE_FILTER = "LOWER(d.status) <> 'deleted' AND LOWER(d.status) <> 'archived'";

    /**
     * Shared listing predicate (search + every optional filter + the caller's
     * allowed visibilities). Declared once so the unscoped listing and the
     * module-scoped listing can never drift apart.
     */
    String LIST_FILTERS =
           "(:search IS NULL OR :search = '' OR " +
           "LOWER(d.documentName) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(d.recordNumber) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(d.customerName) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(d.module) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(d.documentType) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(d.uploadedBy) LIKE LOWER(CONCAT('%', :search, '%'))) AND " +
           "(:module IS NULL OR :module = '' OR LOWER(d.module) = LOWER(:module)) AND " +
           "(:documentType IS NULL OR :documentType = '' OR LOWER(d.documentType) = LOWER(:documentType)) AND " +
           "(:customerId IS NULL OR d.customerId = :customerId) AND " +
           "(:uploadedBy IS NULL OR :uploadedBy = '' OR LOWER(d.uploadedBy) = LOWER(:uploadedBy)) AND " +
           "(:visibility IS NULL OR :visibility = '' OR d.visibility = :visibility) AND " +
           "(:status IS NULL OR :status = '' OR LOWER(d.status) = LOWER(:status)) AND " +
           "(:dateFrom IS NULL OR d.createdAt >= :dateFrom) AND " +
           "(:dateTo IS NULL OR d.createdAt <= :dateTo) AND " +
           // Only the Sales-scoped listings ask for this; the unscoped listing
           // keeps returning the whole repository, trashed rows included.
           "(:activeOnly = FALSE OR (" + ACTIVE_FILTER + ")) AND " +
           "(:reusable = FALSE OR (LOWER(d.status) <> 'deleted' AND d.filePath IS NOT NULL " +
           "AND LOWER(d.filePath) <> 'metadata-only')) AND " +
           "d.visibility IN (:allowedVisibilities)";

    /** Module-scope predicate: restricts the listing to one ERP area's modules. */
    String MODULE_SCOPE_FILTER = "LOWER(d.module) IN (:scopeModules)";

    @Query("SELECT d FROM DocumentRepositoryEntry d WHERE " + LIST_FILTERS)
    Page<DocumentRepositoryEntry> searchWithFilters(
            @Param("search") String search,
            @Param("module") String module,
            @Param("documentType") String documentType,
            @Param("customerId") Long customerId,
            @Param("uploadedBy") String uploadedBy,
            @Param("visibility") DocumentVisibility visibility,
            @Param("status") String status,
            @Param("dateFrom") LocalDateTime dateFrom,
            @Param("dateTo") LocalDateTime dateTo,
            @Param("allowedVisibilities") List<DocumentVisibility> allowedVisibilities,
            @Param("reusable") boolean reusable,
            @Param("activeOnly") boolean activeOnly,
            Pageable pageable);

    /**
     * Same listing restricted to the module spellings of one ERP area — used by
     * the Sales module's Documents page so the SQL result set (and therefore
     * search, filters, pagination, counts and sorting) only ever contains rows
     * the Sales side owns.
     */
    @Query("SELECT d FROM DocumentRepositoryEntry d WHERE " + LIST_FILTERS +
           " AND " + MODULE_SCOPE_FILTER)
    Page<DocumentRepositoryEntry> searchWithFiltersInModules(
            @Param("search") String search,
            @Param("module") String module,
            @Param("documentType") String documentType,
            @Param("customerId") Long customerId,
            @Param("uploadedBy") String uploadedBy,
            @Param("visibility") DocumentVisibility visibility,
            @Param("status") String status,
            @Param("dateFrom") LocalDateTime dateFrom,
            @Param("dateTo") LocalDateTime dateTo,
            @Param("allowedVisibilities") List<DocumentVisibility> allowedVisibilities,
            @Param("scopeModules") List<String> scopeModules,
            @Param("reusable") boolean reusable,
            @Param("activeOnly") boolean activeOnly,
            Pageable pageable);

    /**
     * Rows filed under one module that point at one stored file — the lookup
     * behind "Inside ERP", which files an existing document into another
     * context by REFERENCE.
     *
     * The provenance marker itself ({@code metadata}) is checked on the loaded
     * rows instead of in SQL: {@code metadata} is a LOB/TEXT column, and the
     * predicate stays portable across MySQL and the H2 test schema.
     */
    List<DocumentRepositoryEntry> findByModuleIgnoreCaseAndFilePath(String module, String filePath);

    /**
     * Every ACTIVE row filed under one module — the working documents of one
     * repository context. "Active" is the same pair of terminal states the Sales
     * listing hides: the trash ({@code deleted}) and {@code archived}.
     *
     * <p>Used by the reference flow's duplicate guard: a selection may not create
     * a second entry for a stored file the target context already holds. The
     * file paths are compared in Java afterwards, because the same stored file
     * reaches a row as a bare name, an API path or an absolute URL depending on
     * which flow created it.
     */
    @Query("SELECT d FROM DocumentRepositoryEntry d WHERE LOWER(d.module) = LOWER(:module) "
            + "AND LOWER(d.status) <> 'deleted' AND LOWER(d.status) <> 'archived'")
    List<DocumentRepositoryEntry> findActiveByModule(@Param("module") String module);

    List<DocumentRepositoryEntry> findByModuleIgnoreCaseAndRelatedRecordId(String module, Long relatedRecordId);

    boolean existsByFilePath(String filePath);

    boolean existsByModuleAndRelatedRecordId(String module, Long relatedRecordId);

    /** Owning document for a stored file (bare name or /files/{name} path form). */
    @Query("SELECT d FROM DocumentRepositoryEntry d WHERE d.filePath = :name OR d.filePath LIKE CONCAT('%/', :name)")
    List<DocumentRepositoryEntry> findByFilePathName(@Param("name") String name);

    @Query("SELECT d FROM DocumentRepositoryEntry d WHERE " +
           "LOWER(d.module) IN ('sales order', 'sales') AND " +
           "LOWER(d.documentType) IN ('sales order', 'customer purchase order')")
    List<DocumentRepositoryEntry> findSalesOrderDocumentsForMigration();
}
