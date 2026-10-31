package com.vishatech.erp.repository.production;

import com.vishatech.erp.entity.production.Acknowledgement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface AcknowledgementRepository extends JpaRepository<Acknowledgement, Long> {

    Optional<Acknowledgement> findByWorkOrderId(String workOrderId);

    void deleteByWorkOrderId(String workOrderId);
}
