package com.vishatech.erp.repository.production;

import com.vishatech.erp.entity.production.Drawing;
import com.vishatech.erp.entity.production.DrawingStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DrawingRepository extends JpaRepository<Drawing, Long> {

    Optional<Drawing> findByDrawingNumber(String drawingNumber);

    boolean existsByDrawingNumber(String drawingNumber);

    List<Drawing> findByWorkOrderId(String workOrderId);

    List<Drawing> findByWorkOrderIdAndWorkOrderItemId(String workOrderId, String workOrderItemId);

    void deleteByWorkOrderId(String workOrderId);

    // ========================
    // Search
    // ========================

    @Query("""
        SELECT d FROM Drawing d
        WHERE (:search IS NULL OR :search = '' OR
            LOWER(d.drawingNumber) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(d.fileName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(d.workOrderId) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(d.itemName) LIKE LOWER(CONCAT('%', :search, '%'))
        )
    """)
    Page<Drawing> searchDrawings(@Param("search") String search, Pageable pageable);

    // ========================
    // Filtered search
    // ========================

    @Query("""
        SELECT d FROM Drawing d
        WHERE (:search IS NULL OR :search = '' OR
            LOWER(d.drawingNumber) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(d.fileName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(d.workOrderId) LIKE LOWER(CONCAT('%', :search, '%'))
        )
        AND (:status IS NULL OR d.verificationStatus = :status)
        AND (:workOrderId IS NULL OR d.workOrderId = :workOrderId)
    """)
    Page<Drawing> findFiltered(
        @Param("search") String search,
        @Param("status") DrawingStatus status,
        @Param("workOrderId") String workOrderId,
        Pageable pageable
    );

    // ========================
    // Statistics
    // ========================

    @Query("SELECT COUNT(d) FROM Drawing d")
    long countAll();

    @Query("SELECT COUNT(d) FROM Drawing d WHERE d.verificationStatus = :status")
    long countByStatus(@Param("status") DrawingStatus status);

    @Query("SELECT COUNT(d) FROM Drawing d WHERE d.verificationStatus = 'PENDING'")
    long countPending();

    @Query("SELECT COUNT(d) FROM Drawing d WHERE d.verificationStatus = 'VERIFIED'")
    long countVerified();

    @Query("SELECT COUNT(d) FROM Drawing d WHERE d.verificationStatus = 'REJECTED'")
    long countRejected();

    // ========================
    // Next number generation
    // ========================

    @Query("SELECT d.drawingNumber FROM Drawing d ORDER BY d.id DESC LIMIT 1")
    Optional<String> findLatestDrawingNumber();
}
