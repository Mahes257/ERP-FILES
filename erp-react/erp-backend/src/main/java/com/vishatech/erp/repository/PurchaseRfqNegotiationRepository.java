package com.vishatech.erp.repository;

import com.vishatech.erp.entity.PurchaseRfqNegotiation;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PurchaseRfqNegotiationRepository
        extends JpaRepository<PurchaseRfqNegotiation, Long> {

    List<PurchaseRfqNegotiation> findByRfqNoOrderByRoundNoAsc(String rfqNo);

    @Modifying
    @Query("delete from PurchaseRfqNegotiation n where n.rfqNo = :rfqNo")
    void deleteByRfqNo(@Param("rfqNo") String rfqNo);
}
