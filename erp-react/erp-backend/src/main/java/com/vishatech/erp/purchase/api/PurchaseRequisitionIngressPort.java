package com.vishatech.erp.purchase.api;

/**
 * Purchase-owned ingress port: the only surface another module may use to raise a
 * Purchase Requisition.
 *
 * <p><b>Why this port exists.</b> CPR's technical-verification conversion used to
 * inject {@code service.PurchaseRequisitionService} and build
 * {@code PurchaseDtos.PurchaseItemRequest} /
 * {@code PurchaseRequisitionService.PurchaseRequisitionRequestWrapper} itself,
 * which made CPR depend on Purchase <em>implementation</em> types — a
 * business-module-to-business-module dependency the architecture suite now
 * forbids. CPR depends on this interface and its published request/response
 * contract instead; nothing about Purchase's record, payload, numbering,
 * validation or persistence leaks across the boundary.
 *
 * <p><b>Ownership.</b> This package ({@code com.vishatech.erp.purchase.api}) is
 * the module's published ingress surface. Everything else Purchase-owned —
 * {@code PurchaseRequisitionService}, its request wrapper, {@code PurchaseDtos},
 * the entities, repositories and the adapter that implements this port — stays
 * internal, and the architecture rule
 * {@code cpr_does_not_depend_on_purchase_internals} enforces exactly that
 * distinction.
 *
 * <p><b>Transactions.</b> The implementation delegates to the existing
 * requisition service, which is {@code @Transactional} with the default
 * {@code REQUIRED} propagation, so a call made from inside a caller's transaction
 * — as CPR's conversion is — <b>joins</b> that transaction. CPR's conversion and
 * the requisition it raises therefore still commit or roll back as one unit; the
 * port introduces no new transaction boundary, no asynchronous work and no HTTP
 * hop.
 *
 * <p><b>Validation and numbering stay inside Purchase.</b> The implementation
 * runs the same validation, the same PR-number allocation and the same
 * persistence the requisition API uses, so a request that would be rejected
 * through {@code POST /api/purchase/requisitions} is rejected here with the same
 * exception and message.
 */
public interface PurchaseRequisitionIngressPort {

    /**
     * Raises a new Purchase Requisition from a converted technical-verification
     * item.
     *
     * @param request the verified item and its provenance, expressed in the
     *                published ingress contract
     * @return the created requisition's id and generated PR number
     * @throws com.vishatech.erp.exception.BadRequestException if Purchase's own
     *         requisition validation rejects the request (missing currency, a
     *         required date before the request date, an item without a description
     *         or quantity, …)
     */
    PurchaseRequisitionIngressResult createRequisition(PurchaseRequisitionIngressRequest request);
}
