package com.vishatech.erp.repository;

import com.vishatech.erp.entity.CwMasterData;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CwMasterDataRepository extends JpaRepository<CwMasterData, Long> {
    Optional<CwMasterData> findByDataKey(String dataKey);
}
