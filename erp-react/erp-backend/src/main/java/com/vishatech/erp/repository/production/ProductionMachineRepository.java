package com.vishatech.erp.repository.production;

import com.vishatech.erp.entity.production.ProductionMachine;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Machine master (Production → Settings → Machines). */
@Repository
public interface ProductionMachineRepository extends JpaRepository<ProductionMachine, Long> {

    List<ProductionMachine> findAllByOrderByMachineCodeAsc();

    List<ProductionMachine> findByDepartmentOrderByMachineCodeAsc(String department);

    Optional<ProductionMachine> findByMachineCode(String machineCode);

    boolean existsByMachineCode(String machineCode);
}
