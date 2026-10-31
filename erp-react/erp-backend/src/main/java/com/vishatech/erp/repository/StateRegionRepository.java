package com.vishatech.erp.repository;

import com.vishatech.erp.entity.StateRegion;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StateRegionRepository extends JpaRepository<StateRegion, Long> {

    /** States of one country, active first then alphabetical. */
    @Query("select s from StateRegion s where s.country.id = :countryId " +
            "order by case when s.status = 'Active' then 0 else 1 end, s.name asc")
    List<StateRegion> findByCountryOrdered(@Param("countryId") Long countryId);

    Optional<StateRegion> findByCountryIdAndNameIgnoreCase(Long countryId, String name);

    boolean existsByCountryIdAndNameIgnoreCase(Long countryId, String name);

    long countByCountryId(Long countryId);
}
