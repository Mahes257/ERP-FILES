package com.vishatech.erp.repository;

import com.vishatech.erp.entity.ExchangeRate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ExchangeRateRepository extends JpaRepository<ExchangeRate, Long> {

    List<ExchangeRate> findByBaseCurrency(String baseCurrency);

    /** Bulk-deletes all cached rates for a base so the refresh can rebuild them idempotently. */
    @Modifying
    @Query("delete from ExchangeRate e where e.baseCurrency = :base")
    void deleteByBaseCurrency(@Param("base") String baseCurrency);

    Optional<ExchangeRate> findTopByOrderByFetchedAtDesc();
}
