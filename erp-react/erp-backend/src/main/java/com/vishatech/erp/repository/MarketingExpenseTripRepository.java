package com.vishatech.erp.repository;

import com.vishatech.erp.entity.MarketingExpenseTrip;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

public interface MarketingExpenseTripRepository extends JpaRepository<MarketingExpenseTrip, Long>,
        JpaSpecificationExecutor<MarketingExpenseTrip> {

    List<MarketingExpenseTrip> findByMarketerUserIdOrderByCreatedAtDesc(Long marketerUserId);

    List<MarketingExpenseTrip> findByMarketerOrderByCreatedAtDesc(String marketer);

    List<MarketingExpenseTrip> findByStatusOrderByCreatedAtDesc(String status);

    @Query("select count(t) from MarketingExpenseTrip t where t.status = :status and t.deleted = false")
    long countByStatus(String status);

    @Query("select count(t) from MarketingExpenseTrip t where t.approvalStatus = :status and t.deleted = false")
    long countByApprovalStatus(String status);

    List<MarketingExpenseTrip> findByStartDateBetween(java.time.LocalDate start, java.time.LocalDate end);
}
