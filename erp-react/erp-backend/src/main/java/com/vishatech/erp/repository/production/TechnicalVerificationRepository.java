package com.vishatech.erp.repository.production;

import com.vishatech.erp.entity.production.TVStatus;
import com.vishatech.erp.entity.production.TechnicalVerification;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TechnicalVerificationRepository extends JpaRepository<TechnicalVerification, Long> {

    Optional<TechnicalVerification> findByWorkOrderIdAndItemId(String workOrderId, String itemId);

    List<TechnicalVerification> findByWorkOrderId(String workOrderId);

    void deleteByWorkOrderId(String workOrderId);

    // ========================
    // Search
    // ========================

    @Query("""
        SELECT tv FROM TechnicalVerification tv
        WHERE (:search IS NULL OR :search = '' OR
            LOWER(tv.workOrderNumber) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(tv.itemProduct) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(tv.productionOrderNumber) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(tv.drawingNumber) LIKE LOWER(CONCAT('%', :search, '%'))
        )
    """)
    Page<TechnicalVerification> searchVerifications(@Param("search") String search, Pageable pageable);

    // ========================
    // Filtered search
    // ========================

    @Query("""
        SELECT tv FROM TechnicalVerification tv
        WHERE (:search IS NULL OR :search = '' OR
            LOWER(tv.workOrderNumber) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(tv.itemProduct) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(tv.productionOrderNumber) LIKE LOWER(CONCAT('%', :search, '%'))
        )
        AND (:status IS NULL OR tv.verificationStatus = :status)
        AND (:productionType IS NULL OR tv.productionType = :productionType)
    """)
    Page<TechnicalVerification> findFiltered(
        @Param("search") String search,
        @Param("status") TVStatus status,
        @Param("productionType") String productionType,
        Pageable pageable
    );

    // ========================
    // Statistics
    // ========================

    @Query("SELECT COUNT(tv) FROM TechnicalVerification tv WHERE tv.verificationStatus = :status")
    long countByStatus(@Param("status") TVStatus status);

    @Query("SELECT COUNT(tv) FROM TechnicalVerification tv")
    long countAll();

    @Query("SELECT COUNT(tv) FROM TechnicalVerification tv WHERE tv.verificationStatus = 'VERIFIED'")
    long countVerified();

    @Query("SELECT COUNT(tv) FROM TechnicalVerification tv WHERE tv.verificationStatus = 'REJECTED'")
    long countRejected();

    @Query("SELECT COUNT(tv) FROM TechnicalVerification tv WHERE tv.verificationStatus = 'PENDING'")
    long countPending();
}
