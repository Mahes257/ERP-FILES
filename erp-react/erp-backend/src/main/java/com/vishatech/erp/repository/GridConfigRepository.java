package com.vishatech.erp.repository;

import com.vishatech.erp.entity.GridConfig;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GridConfigRepository extends JpaRepository<GridConfig, Long> {

    Optional<GridConfig> findByGridKey(String gridKey);
}
