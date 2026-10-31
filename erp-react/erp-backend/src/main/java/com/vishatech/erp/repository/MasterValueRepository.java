package com.vishatech.erp.repository;

import com.vishatech.erp.entity.MasterValue;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MasterValueRepository extends JpaRepository<MasterValue, Long> {

    List<MasterValue> findByMasterKeyOrderByValueAsc(String masterKey);

    Optional<MasterValue> findByMasterKeyAndValueIgnoreCase(String masterKey, String value);

    boolean existsByMasterKeyAndValueIgnoreCase(String masterKey, String value);

    long countByMasterKey(String masterKey);
}
