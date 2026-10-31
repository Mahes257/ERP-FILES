package com.vishatech.erp.repository;

import com.vishatech.erp.entity.CprTechnicalVerification;
import com.vishatech.erp.entity.TechnicalVerificationStatus;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface CprTechnicalVerificationRepository extends JpaRepository<CprTechnicalVerification, Long> {

    /** First item-level verification row for a CPR (legacy single-row access). */
    Optional<CprTechnicalVerification> findFirstByCprId(Long cprId);

    /** All item-level verification records for a CPR, stable by item insertion order. */
    List<CprTechnicalVerification> findAllByCprIdOrderByIdAsc(Long cprId);

    /**
     * All verification rows for a whole page of CPRs in ONE query.
     *
     * The CPR list shows the Technical-Verification / Admin-Approval gate per
     * row; resolving that per row would be an N+1 (one query per CPR). Callers
     * batch the ids of the page and group the result by {@code cpr.id}.
     */
    @Query("SELECT tv FROM CprTechnicalVerification tv WHERE tv.cpr.id IN :cprIds")
    List<CprTechnicalVerification> findAllByCprIdIn(@Param("cprIds") java.util.Collection<Long> cprIds);

    Optional<CprTechnicalVerification> findByTvNo(String tvNo);

    long countByStatus(TechnicalVerificationStatus status);

    long countByDivision(String division);

    long countByFileStatus(String fileStatus);

    long countByDivisionAndStatus(String division, TechnicalVerificationStatus status);

    long countByDivisionAndFileStatus(String division, String fileStatus);

    long countByForwardedToCostWorkout(boolean forwarded);

    long countByDivisionAndForwardedToCostWorkout(String division, boolean forwarded);

    @Query("SELECT tv FROM CprTechnicalVerification tv " +
           "LEFT JOIN FETCH tv.cpr c " +
           "WHERE (:division IS NULL OR tv.division = :division) " +
           "AND (:status IS NULL OR tv.status = :status) " +
           "AND (:search IS NULL OR " +
           "  LOWER(tv.tvNo) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "  OR LOWER(c.prNo) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "  OR LOWER(c.clientName) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "  OR LOWER(tv.itemNo) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "  OR LOWER(tv.drawingNumber) LIKE LOWER(CONCAT('%', :search, '%')))")
    Page<CprTechnicalVerification> findAllFiltered(
            @Param("division") String division,
            @Param("status") TechnicalVerificationStatus status,
            @Param("search") String search,
            Pageable pageable);

    @Query("SELECT tv FROM CprTechnicalVerification tv " +
           "LEFT JOIN FETCH tv.cpr c " +
           "WHERE LOWER(tv.tvNo) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "OR LOWER(c.prNo) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "OR LOWER(c.clientName) LIKE LOWER(CONCAT('%', :search, '%'))")
    Page<CprTechnicalVerification> search(@Param("search") String search, Pageable pageable);

    @Query("SELECT tv FROM CprTechnicalVerification tv " +
           "LEFT JOIN FETCH tv.cpr c " +
           "WHERE (:status IS NULL OR tv.status = :status) " +
           "AND (:search IS NULL OR " +
           "  LOWER(tv.tvNo) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "  OR LOWER(c.prNo) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "  OR LOWER(c.clientName) LIKE LOWER(CONCAT('%', :search, '%')))")
    Page<CprTechnicalVerification> findAllFilteredLegacy(
            @Param("status") TechnicalVerificationStatus status,
            @Param("search") String search,
            Pageable pageable);

    List<CprTechnicalVerification> findByCprIdAndDivision(Long cprId, String division);
}
