package com.vishatech.erp.repository;

import com.vishatech.erp.entity.ProfitWorkout;
import com.vishatech.erp.entity.ProfitWorkoutStatus;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface ProfitWorkoutRepository extends JpaRepository<ProfitWorkout, Long>, JpaSpecificationExecutor<ProfitWorkout> {
    long countByStatus(ProfitWorkoutStatus status);

    /**
     * The Profit Workout created from a Cost Workout, if one still exists
     * (one CW → one PW). Deleted records do not block a new conversion.
     */
    Optional<ProfitWorkout> findFirstBySourceCwIdAndStatusNot(Long sourceCwId, ProfitWorkoutStatus status);

    /** Counts rows in the given status that are the CURRENT revision of their chain. */
    @Query("""
            SELECT COUNT(c) FROM ProfitWorkout c
            WHERE c.status = :status
              AND NOT EXISTS (
                SELECT 1 FROM ProfitWorkout newer
                WHERE COALESCE(newer.revisionOf, newer.id) = COALESCE(c.revisionOf, c.id)
                  AND newer.revision > c.revision
              )
            """)
    long countCurrentByStatus(@Param("status") ProfitWorkoutStatus status);

    long countByDepartmentIgnoreCase(String department);

    long countByPreparedByIgnoreCase(String preparedBy);

    boolean existsByPwNo(String pwNo);

    /** The Profit Workout with this document number (its own read, not the id). */
    Optional<ProfitWorkout> findByPwNo(String pwNo);

    /**
     * Same read as {@link #findByPwNo}, but takes a PESSIMISTIC_WRITE row lock on
     * the Profit Workout for the caller's transaction.
     *
     * <p>Used when a quotation is saved from the Profit Workout conversion —
     * prefill: two concurrent saves for the same source Profit Workout are
     * serialised, so the second one sees the committed quotation and is rejected
     * instead of creating a duplicate.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT pw FROM ProfitWorkout pw WHERE pw.pwNo = :pwNo")
    Optional<ProfitWorkout> findByPwNoForUpdate(@Param("pwNo") String pwNo);

    /**
     * The pw_no values starting with the given year prefix. A scalar projection,
     * not an entity query: Profit Workout numbering reads one column instead of
     * loading every aggregate (with its items and categories) in the table.
     */
    @Query("SELECT c.pwNo FROM ProfitWorkout c WHERE c.pwNo IS NOT NULL AND c.pwNo LIKE concat(:prefix, '%')")
    List<String> findPwNosWithPrefix(@Param("prefix") String prefix);

    @Query("SELECT COALESCE(SUM(c.grandTotal), 0) FROM ProfitWorkout c WHERE c.status NOT IN :excluded")
    BigDecimal sumGrandTotalExcluding(@Param("excluded") java.util.Collection<ProfitWorkoutStatus> excluded);

    /** Detach the given CPR from all linked Profit Workouts (keeps FK integrity). */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query("UPDATE ProfitWorkout cw SET cw.cpr = NULL WHERE cw.cpr.id = :cprId")
    int unlinkByCprId(@Param("cprId") Long cprId);

    List<ProfitWorkout> findByRevisionOfOrderByRevisionDesc(Long revisionOf);
}
