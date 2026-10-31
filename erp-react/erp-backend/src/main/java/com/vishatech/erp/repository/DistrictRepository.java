package com.vishatech.erp.repository;

import com.vishatech.erp.entity.District;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DistrictRepository extends JpaRepository<District, Long> {

    /** Districts of one state, active first then alphabetical. */
    @Query("select d from District d where d.state.id = :stateId " +
            "order by case when d.status = 'Active' then 0 else 1 end, d.name asc")
    List<District> findByStateOrdered(@Param("stateId") Long stateId);

    Optional<District> findByStateIdAndNameIgnoreCase(Long stateId, String name);

    boolean existsByStateIdAndNameIgnoreCase(Long stateId, String name);

    long countByStateId(Long stateId);

    /** Find a district whose name OR comma-separated aliases match the given name (case-insensitive). */
    @Query("select d from District d where d.state.id = :stateId and " +
            "(lower(d.name) = lower(:name) or lower(d.aliases) like concat('%', lower(:name), '%'))")
    Optional<District> findByStateIdAndNameOrAlias(@Param("stateId") Long stateId, @Param("name") String name);
}
