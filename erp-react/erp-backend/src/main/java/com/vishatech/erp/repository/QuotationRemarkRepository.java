package com.vishatech.erp.repository;

import com.vishatech.erp.entity.QuotationRemark;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuotationRemarkRepository extends JpaRepository<QuotationRemark, Long> {

    /** Newest remark first — the order the Overview Remarks table shows. */
    List<QuotationRemark> findByQuotationIdOrderByCreatedAtDescIdDesc(Long quotationId);

    void deleteByQuotationId(Long quotationId);
}
