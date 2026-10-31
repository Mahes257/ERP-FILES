package com.vishatech.erp.repository.production;

import com.vishatech.erp.entity.production.Model;
import com.vishatech.erp.entity.production.ModelStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ModelRepository extends JpaRepository<Model, Long> {

    Optional<Model> findByModelNumber(String modelNumber);

    boolean existsByModelNumber(String modelNumber);

    /**
     * Preview retention probe: how many models still point at a generated GLB.
     * A converted preview may only be deleted once no model references it.
     */
    long countByConvertedFilePath(String convertedFilePath);

    List<Model> findByWorkOrderId(String workOrderId);

    List<Model> findByWorkOrderIdAndWorkOrderItemId(String workOrderId, String workOrderItemId);

    void deleteByWorkOrderId(String workOrderId);

    // ========================
    // Search
    // ========================

    @Query("""
        SELECT m FROM Model m
        WHERE (:search IS NULL OR :search = '' OR
            LOWER(m.modelNumber) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(m.fileName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(m.workOrderId) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(m.itemName) LIKE LOWER(CONCAT('%', :search, '%'))
        )
    """)
    Page<Model> searchModels(@Param("search") String search, Pageable pageable);

    // ========================
    // Filtered search
    // ========================

    @Query("""
        SELECT m FROM Model m
        WHERE (:search IS NULL OR :search = '' OR
            LOWER(m.modelNumber) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(m.fileName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(m.workOrderId) LIKE LOWER(CONCAT('%', :search, '%'))
        )
        AND (:status IS NULL OR m.verificationStatus = :status)
        AND (:workOrderId IS NULL OR m.workOrderId = :workOrderId)
    """)
    Page<Model> findFiltered(
        @Param("search") String search,
        @Param("status") ModelStatus status,
        @Param("workOrderId") String workOrderId,
        Pageable pageable
    );

    // ========================
    // Statistics
    // ========================

    @Query("SELECT COUNT(m) FROM Model m")
    long countAll();

    @Query("SELECT COUNT(m) FROM Model m WHERE m.verificationStatus = :status")
    long countByStatus(@Param("status") ModelStatus status);

    @Query("SELECT COUNT(m) FROM Model m WHERE m.verificationStatus = 'PENDING'")
    long countPending();

    @Query("SELECT COUNT(m) FROM Model m WHERE m.verificationStatus = 'VERIFIED'")
    long countVerified();

    @Query("SELECT COUNT(m) FROM Model m WHERE m.verificationStatus = 'REJECTED'")
    long countRejected();

    // ========================
    // Next number generation
    // ========================

    @Query("SELECT m.modelNumber FROM Model m ORDER BY m.id DESC LIMIT 1")
    Optional<String> findLatestModelNumber();
}
