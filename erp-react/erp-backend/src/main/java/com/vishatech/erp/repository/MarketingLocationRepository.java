package com.vishatech.erp.repository;

import com.vishatech.erp.entity.MarketingLocation;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface MarketingLocationRepository extends JpaRepository<MarketingLocation, Long> {

    List<MarketingLocation> findByStatusNotOrderByUpdatedAtDesc(String status);

    List<MarketingLocation> findByLocationTypeAndStatusNotOrderByUpdatedAtDesc(String type, String status);

    @Query("SELECT m FROM MarketingLocation m WHERE m.status <> :excludeStatus AND (" +
           "LOWER(m.locationName) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
           "LOWER(m.address) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
           "LOWER(m.city) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
           "LOWER(m.state) LIKE LOWER(CONCAT('%', :q, '%')))")
    List<MarketingLocation> search(@Param("q") String query, @Param("excludeStatus") String excludeStatus);
}
