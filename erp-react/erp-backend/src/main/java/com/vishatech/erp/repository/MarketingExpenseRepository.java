package com.vishatech.erp.repository;

import com.vishatech.erp.entity.MarketingExpense;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MarketingExpenseRepository extends JpaRepository<MarketingExpense, Long> {

    List<MarketingExpense> findByTripIdOrderByExpenseDateAscExpenseTimeAscIdAsc(Long tripId);

    List<MarketingExpense> findByTripIdAndExpenseTypeOrderByExpenseDateAscIdAsc(Long tripId, String expenseType);

    /** All expenses of the given trips (used by dashboard scoping — <= trip count rows). */
    List<MarketingExpense> findByTripIdIn(java.util.Collection<Long> tripIds);

    long countByTripId(Long tripId);

    void deleteByTripId(Long tripId);

    /** Find potential duplicates: same trip, same date, same type, same amount, excluding a given expense ID. */
    @Query("SELECT e FROM MarketingExpense e WHERE e.tripId = :tripId AND e.expenseDate = :expenseDate AND e.expenseType = :expenseType AND e.amount = :amount AND e.id <> :excludeId")
    List<MarketingExpense> findPotentialDuplicates(@Param("tripId") Long tripId, @Param("expenseDate") LocalDate expenseDate, @Param("expenseType") String expenseType, @Param("amount") BigDecimal amount, @Param("excludeId") Long excludeId);

    /** Total amount across all trips for summary. */
    @Query("SELECT COALESCE(SUM(e.amount), 0) FROM MarketingExpense e")
    BigDecimal sumAllExpenses();

    /** Total WITH BILL amount across all trips. */
    @Query("SELECT COALESCE(SUM(e.amount), 0) FROM MarketingExpense e WHERE e.billStatus = 'WITH BILL'")
    BigDecimal sumWithBillExpenses();

    /** Total WITHOUT BILL amount across all trips. */
    @Query("SELECT COALESCE(SUM(e.amount), 0) FROM MarketingExpense e WHERE e.billStatus = 'WITHOUT BILL'")
    BigDecimal sumWithoutBillExpenses();
}
