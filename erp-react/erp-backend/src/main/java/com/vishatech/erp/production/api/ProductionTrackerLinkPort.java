package com.vishatech.erp.production.api;

import java.util.Optional;

/**
 * The published Production contract for the one question Sales has to ask before it
 * permanently deletes a Customer Purchase Order: is a Production tracker still
 * linked to this order?
 *
 * <p><b>Why this exists.</b> {@code service.SalesOrderService} purges a CPO and its
 * whole revision chain for good — the row, plus its timeline, history, attachments,
 * edit history and revision snapshots. A Production tracker is <em>not</em> part of
 * that chain: it lives in {@code production_trackers}, points at the CPO through
 * {@code sales_order_id} (and denormalises its number), and carries the shop-floor
 * progress the tracker workflow owns. Hard-deleting the CPO underneath a live
 * tracker orphans it, so permanent deletion has to be refused while the link exists.
 * Answering that requires the tracker table — Production's own persistence — which
 * Sales must not read.
 *
 * <p><b>Boundary.</b> This interface carries no Production entity, repository, DTO or
 * service type — only the tracker's id — so a caller outside the module can depend on
 * it without depending on Production persistence, and the architecture rule
 * {@code outside_does_not_depend_on_production_persistence} stays intact. It is
 * implemented by {@code service.production.ProductionTrackerService}, the
 * production-owned reader of the tracker table, and the answer travels in-process
 * (no HTTP hop, no extra port, no new process).
 *
 * <p><b>What counts as linked.</b> {@code sales_order_id} is the primary link; a
 * tracker created without one stores only the denormalised CPO number, so the
 * implementation also matches that number when the tracker carries no id. Deciding
 * which rows count is the module's business, which is why this contract takes only
 * the Sales Order id and returns only the tracker id.
 */
public interface ProductionTrackerLinkPort {

    /**
     * The id of the Production tracker linked to this Sales Order.
     *
     * @param  salesOrderId the CPO's primary key, or {@code null}
     * @return the linked tracker's id, or {@link Optional#empty()} when no tracker is
     *         linked (and for a {@code null} id)
     */
    Optional<Long> linkedTrackerId(Long salesOrderId);
}
