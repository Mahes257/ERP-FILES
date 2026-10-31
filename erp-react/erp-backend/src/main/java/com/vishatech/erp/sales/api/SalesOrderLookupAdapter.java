package com.vishatech.erp.sales.api;

import com.vishatech.erp.entity.SalesOrder;
import com.vishatech.erp.repository.SalesOrderRepository;
import java.util.Optional;
import org.springframework.stereotype.Service;

/**
 * Sales-owned implementation of {@link SalesOrderLookupPort}.
 *
 * <p>Mechanical delegation: each method performs exactly the repository call its
 * former Production callers made themselves — the same {@code findById} and
 * {@code findBySoNo} queries, the same empty result when nothing matches, the same
 * returned values, mapped into the published {@link SalesOrderRef} contract. No SQL,
 * no schema and no route changes.
 *
 * <p>Lives in the published Sales package next to {@code SalesDashboardReadAdapter},
 * but it is <em>not</em> part of the exempt surface: only {@code *Port} types are
 * exempt from the Sales-internals predicate, so a consuming module that injects this
 * adapter by type — instead of the port — is reported as a boundary violation.
 */
@Service
public class SalesOrderLookupAdapter implements SalesOrderLookupPort {

    private final SalesOrderRepository salesOrderRepository;

    public SalesOrderLookupAdapter(SalesOrderRepository salesOrderRepository) {
        this.salesOrderRepository = salesOrderRepository;
    }

    /** {@inheritDoc} */
    @Override
    public Optional<SalesOrderRef> findById(Long id) {
        if (id == null) {
            return Optional.empty();
        }
        return salesOrderRepository.findById(id).map(SalesOrderLookupAdapter::toRef);
    }

    /** {@inheritDoc} */
    @Override
    public Optional<SalesOrderRef> findBySoNo(String soNo) {
        if (soNo == null) {
            return Optional.empty();
        }
        return salesOrderRepository.findBySoNo(soNo).map(SalesOrderLookupAdapter::toRef);
    }

    /** The published contract view of a Sales Order — same fields, same values. */
    private static SalesOrderRef toRef(SalesOrder salesOrder) {
        return new SalesOrderRef(
                salesOrder.getId(),
                salesOrder.getSoNo(),
                salesOrder.getClientName(),
                salesOrder.getClientId(),
                salesOrder.getOrderDate());
    }
}
