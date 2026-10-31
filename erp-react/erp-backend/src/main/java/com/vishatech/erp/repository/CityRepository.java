package com.vishatech.erp.repository;

import com.vishatech.erp.entity.City;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CityRepository extends JpaRepository<City, Long> {

    /** Cities of one district, active first then alphabetical. */
    @Query("select c from City c where c.district.id = :districtId " +
            "order by case when c.status = 'Active' then 0 else 1 end, c.name asc")
    List<City> findByDistrictOrdered(@Param("districtId") Long districtId);

    /**
     * Every city/town in one state (across all its districts), active first
     * then alphabetical. Powers the state-level City/Town dropdown, which must
     * expose the COMPLETE master for the selected state. The caller dedupes
     * names, since a town can legitimately appear in more than one district.
     */
    @Query("select c from City c where c.district.state.id = :stateId " +
            "order by case when c.status = 'Active' then 0 else 1 end, c.name asc")
    List<City> findByStateOrdered(@Param("stateId") Long stateId);

    /** Server-side city search inside one state (large datasets / type-ahead). */
    @Query("select c from City c where c.district.state.id = :stateId " +
            "and lower(c.name) like lower(concat('%', :q, '%')) " +
            "order by case when c.status = 'Active' then 0 else 1 end, c.name asc")
    Page<City> searchByState(@Param("stateId") Long stateId,
                             @Param("q") String q,
                             Pageable pageable);

    Optional<City> findByDistrictIdAndNameIgnoreCase(Long districtId, String name);

    boolean existsByDistrictIdAndNameIgnoreCase(Long districtId, String name);

    long countByDistrictId(Long districtId);

    /**
     * Global city search across a country (admin Location Master search box).
     * Active rows first; page size is capped by the caller.
     */
    @Query("select c from City c where c.district.state.country.id = :countryId " +
            "and lower(c.name) like lower(concat('%', :q, '%')) " +
            "order by case when c.status = 'Active' then 0 else 1 end, c.name asc")
    Page<City> searchByCountry(@Param("countryId") Long countryId,
                               @Param("q") String q,
                               Pageable pageable);

    /** Exact (case-insensitive) city lookup inside one state — used to validate saved combinations. */
    @Query("select c from City c where c.district.state.id = :stateId " +
            "and lower(c.name) = lower(:name)")
    List<City> searchByStateAndName(@Param("stateId") Long stateId, @Param("name") String name);
}
