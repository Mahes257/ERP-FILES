package com.vishatech.erp.repository;

import com.vishatech.erp.entity.Country;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CountryRepository extends JpaRepository<Country, Long> {

    /** All countries ordered by name (the ERP country dropdown order). */
    List<Country> findAllByOrderByNameAsc();

    Optional<Country> findByNameIgnoreCase(String name);

    boolean existsByNameIgnoreCase(String name);
}
