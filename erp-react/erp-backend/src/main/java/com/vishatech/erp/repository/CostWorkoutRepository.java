package com.vishatech.erp.repository;

import com.vishatech.erp.entity.CostWorkout;
import com.vishatech.erp.entity.CostWorkoutStatus;
import jakarta.persistence.LockModeType;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface CostWorkoutRepository extends JpaRepository<CostWorkout, Long>, JpaSpecificationExecutor<CostWorkout> {
    long countByStatus(CostWorkoutStatus status);

    /** Counts rows in the given status that are the CURRENT revision of their chain. */
    @Query("""
            SELECT COUNT(c) FROM CostWorkout c
            WHERE c.status = :status
              AND NOT EXISTS (
                SELECT 1 FROM CostWorkout newer
                WHERE COALESCE(newer.revisionOf, newer.id) = COALESCE(c.revisionOf, c.id)
                  AND newer.revision > c.revision
              )
            """)
    long countCurrentByStatus(@Param("status") CostWorkoutStatus status);

    long countByDepartmentIgnoreCase(String department);

    long countByPreparedByIgnoreCase(String preparedBy);

    boolean existsByCwNo(String cwNo);

    /**
     * Same read as {@link #findById(Object)}, but takes a PESSIMISTIC_WRITE row
     * lock on the Cost Workout for the caller's transaction.
     *
     * <p>Used by the Cost Workout → Profit Workout conversion so two concurrent
     * saves for the SAME source Cost Workout are serialised: the second request
     * blocks until the first commits, then sees its conversion back-link and is
     * rejected with the normal duplicate error. A plain read could not give this
     * guarantee, and a UNIQUE constraint on {@code profit_workouts.source_cw_id}
     * is not an option: every edit of a Profit Workout inserts a NEW revision row
     * that keeps the source reference, so one converted Cost Workout legitimately
     * owns several {@code source_cw_id} rows (the conversion head plus its
     * revision chain), and the relationship deliberately also ignores soft-deleted
     * Profit Workouts.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT cw FROM CostWorkout cw WHERE cw.id = :id")
    Optional<CostWorkout> findByIdForUpdate(@Param("id") Long id);

    /**
     * The same locking read, addressed by document number — the reference a
     * conversion-prefilled form carries (a quotation stores
     * {@code source_cw} as the CW number, not its id).
     *
     * <p>Used by the quotation save so the Cost Workout → Quotation conversion
     * is serialised on the source row: two concurrent saves for the same Cost
     * Workout queue on this lock, and the loser sees the winner's committed
     * conversion and is rejected with the normal 409 instead of creating a
     * second quotation.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT cw FROM CostWorkout cw WHERE cw.cwNo = :cwNo")
    Optional<CostWorkout> findByCwNoForUpdate(@Param("cwNo") String cwNo);

    /**
     * The cw_no values starting with the given year prefix. A scalar projection,
     * not an entity query: Cost Workout numbering reads one column instead of
     * loading every aggregate (with its items and categories) in the table.
     */
    @Query("SELECT c.cwNo FROM CostWorkout c WHERE c.cwNo IS NOT NULL AND c.cwNo LIKE concat(:prefix, '%')")
    List<String> findCwNosWithPrefix(@Param("prefix") String prefix);

    @Query("SELECT COALESCE(SUM(c.grandTotal), 0) FROM CostWorkout c WHERE c.status NOT IN :excluded")
    BigDecimal sumGrandTotalExcluding(@Param("excluded") java.util.Collection<CostWorkoutStatus> excluded);

    /** Detach the given CPR from all linked Cost Workouts (keeps FK integrity). */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query("UPDATE CostWorkout cw SET cw.cpr = NULL WHERE cw.cpr.id = :cprId")
    int unlinkByCprId(@Param("cprId") Long cprId);

    List<CostWorkout> findByRevisionOfOrderByRevisionDesc(Long revisionOf);

    /**
     * Cost analysis by category, grouped in the database.
     *
     * <p>Returns one row per stored category spelling: {@code [category, count,
     * amount, firstCategoryId]}. The report service merges a null/blank category
     * into "Material Cost" and drops "Lead Time" (non-monetary) exactly as the
     * previous Java loop did, but without loading every Cost Workout, item and
     * category entity into the persistence context. Archived/deleted Cost
     * Workouts are excluded in SQL.
     */
    @Query("""
            SELECT cat.category, COUNT(cat),
                   SUM(COALESCE(cat.qty, 0) * COALESCE(cat.rate, 0)), MIN(cat.id)
            FROM CostWorkoutCategory cat
            WHERE cat.item.costWorkout.status NOT IN :excluded
              AND (cat.category IS NULL OR LOWER(TRIM(cat.category)) <> 'lead time')
            GROUP BY cat.category
            ORDER BY MIN(cat.id)
            """)
    List<Object[]> sumCostByCategory(@Param("excluded") java.util.Collection<CostWorkoutStatus> excluded);
}
