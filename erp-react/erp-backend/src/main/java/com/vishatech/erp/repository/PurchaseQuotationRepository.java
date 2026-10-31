package com.vishatech.erp.repository;

import com.vishatech.erp.entity.PurchaseQuotation;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PurchaseQuotationRepository extends JpaRepository<PurchaseQuotation, Long> {

    List<PurchaseQuotation> findByRfqNoOrderByScoreDesc(String rfqNo);

    /**
     * Quotation count per RFQ number, in ONE grouped query.
     *
     * <p>The RFQ list shows how many quotations have come back for each row. That
     * count used to be read with a per-row {@code findByRfqNo...size()} call, i.e.
     * one extra select per RFQ on every list load; this returns the whole page's
     * counts at once. Rows are {@code [rfqNo, count]}.
     */
    @Query("""
            SELECT q.rfqNo, COUNT(q)
              FROM PurchaseQuotation q
             WHERE q.rfqNo IN :rfqNos
             GROUP BY q.rfqNo
            """)
    List<Object[]> countByRfqNos(@Param("rfqNos") Collection<String> rfqNos);

    /** Every quotation, best score first — used when no RFQ filter is supplied. */
    List<PurchaseQuotation> findAllByOrderByScoreDesc();

    boolean existsByQuotationNo(String quotationNo);
}
