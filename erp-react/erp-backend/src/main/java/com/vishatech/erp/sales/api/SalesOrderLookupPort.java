package com.vishatech.erp.sales.api;

import java.time.LocalDateTime;
import java.util.Optional;

/**
 * Sales-owned, module-facing Sales Order (CPO) lookup contract: the only surface
 * another module may use to resolve a Sales Order reference.
 *
 * <p><b>Why this port exists.</b> Production's work-order service and its
 * production-tracker service used to inject {@code repository.SalesOrderRepository}
 * and hold {@code entity.SalesOrder} values purely to answer "which CPO is this
 * record filed against, and what are its number and customer?" — Sales
 * <em>persistence</em> instead of a Sales <em>capability</em>. The architecture rule
 * {@code production_services_do_not_depend_on_sales_internals} froze those edges
 * (audit recommendation P6); Production now depends on this interface and on the
 * neutral {@link SalesOrderRef} contract it publishes.
 *
 * <p><b>Ownership.</b> The {@code sales_orders} rows stay Sales-owned, so the
 * implementation lives on the Sales side
 * ({@code sales.api.SalesOrderLookupAdapter}) and only the {@code *Port} types in
 * this published package are exempt from the Sales-internals predicate. A consuming
 * module can inject this interface but cannot reference the adapter, the entity or
 * the repository by type.
 *
 * <p><b>Lookup semantics (unchanged).</b> {@link #findById(Long)} is a primary-key
 * lookup and {@link #findBySoNo(String)} is the Sales Order's canonical SO-number
 * lookup. Both return an empty {@link Optional} when nothing matches — resolving a
 * CPO is optional for Production, so an unknown reference keeps whatever the client
 * sent rather than failing the request. Matching is exact and case-sensitive,
 * because it is the same repository query the callers used before this port existed.
 *
 * <p><b>Transactions.</b> The implementation delegates to the existing repository
 * inside the caller's transaction (no {@code REQUIRED_NEW}, no asynchronous work, no
 * HTTP hop), so a lookup issued from inside a caller's transaction joins it exactly
 * as before.
 */
public interface SalesOrderLookupPort {

    /**
     * The resolved Sales Order, expressed without any Sales-internal type.
     *
     * @param id         Sales Order primary key
     * @param soNo       canonical SO number (the CPO number Production displays)
     * @param clientName denormalised customer name
     * @param clientId   customer master id, or {@code null} when unset
     * @param orderDate  the date the order was placed, or {@code null} when unset
     */
    record SalesOrderRef(
            Long id,
            String soNo,
            String clientName,
            Long clientId,
            LocalDateTime orderDate) {
    }

    /** The Sales Order with this primary key, or empty when there is none. */
    Optional<SalesOrderRef> findById(Long id);

    /** The Sales Order with this canonical SO number, or empty when there is none. */
    Optional<SalesOrderRef> findBySoNo(String soNo);
}
