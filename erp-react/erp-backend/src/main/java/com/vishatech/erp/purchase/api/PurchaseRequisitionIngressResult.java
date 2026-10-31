package com.vishatech.erp.purchase.api;

/**
 * The published result of {@link PurchaseRequisitionIngressPort}: exactly what a
 * calling module needs to link its own record to the requisition it caused —
 * the generated PR number and the created record's id.
 *
 * <p>This is deliberately not the requisition response DTO: a caller has no
 * business reading the requisition's internal fields, and the id plus PR number
 * are what the CPR technical-verification row stores
 * ({@code purchaseRequisitionId} / {@code purchaseRequisitionPrNo}).
 *
 * @param requisitionId id of the created requisition
 * @param prNo          the PR number Purchase generated for it
 */
public record PurchaseRequisitionIngressResult(Long requisitionId, String prNo) {
}
