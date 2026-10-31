package com.vishatech.erp.service;

import com.vishatech.erp.dto.PurchaseDtos;
import com.vishatech.erp.purchase.api.PurchaseRequisitionIngressPort;
import com.vishatech.erp.purchase.api.PurchaseRequisitionIngressRequest;
import com.vishatech.erp.purchase.api.PurchaseRequisitionIngressResult;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * Purchase-owned adapter behind {@link PurchaseRequisitionIngressPort}.
 *
 * <p><b>Delegation path (the whole of it).</b> Published request → this adapter's
 * mapping onto the requisition service's own payload → the existing
 * {@link PurchaseRequisitionService#create} → the created record's id and PR
 * number back through {@link PurchaseRequisitionIngressResult}. Nothing else:
 * validation, PR-number allocation, persistence, totals, the draft/approval
 * status and the Purchase timeline entry all remain exactly where the
 * requisition API already put them, because this adapter calls the very same
 * method that API calls.
 *
 * <p><b>Why the mapping lives here.</b> {@code PurchaseRequisitionRequestWrapper}
 * and {@code PurchaseItemRequest} are Purchase's internal payload — a long
 * positional constructor plus the nulls Purchase means by "not supplied by this
 * caller". Building that belongs to Purchase, not to a converting module, which
 * is why the request contract carries named values and this class does the
 * positional assembly.
 *
 * <p><b>Transactions.</b> Deliberately not annotated: the delegated
 * {@code PurchaseRequisitionService.create} is {@code @Transactional} with the
 * default {@code REQUIRED} propagation, so a conversion that calls this inside
 * its own transaction still commits or rolls back as a single unit. Adding a
 * boundary here would silently split CPR's conversion from its requisition.
 *
 * <p><b>Not part of the published surface.</b> Only the {@code
 * com.vishatech.erp.purchase.api} package is; this adapter is internal Purchase
 * code (its name is not just cosmetic — the architecture rule treats any
 * Purchase-prefixed class outside that package as internal, so no other module
 * can inject or call this class directly).
 */
@Service
public class PurchaseRequisitionIngressAdapter implements PurchaseRequisitionIngressPort {

    private final PurchaseRequisitionService purchaseRequisitionService;

    public PurchaseRequisitionIngressAdapter(PurchaseRequisitionService purchaseRequisitionService) {
        this.purchaseRequisitionService = purchaseRequisitionService;
    }

    /** Raises the requisition through the existing service and returns its id and PR number. */
    @Override
    public PurchaseRequisitionIngressResult createRequisition(PurchaseRequisitionIngressRequest request) {
        PurchaseDtos.PurchaseRequisitionResponse created =
                purchaseRequisitionService.create(toRequisitionPayload(request));
        return new PurchaseRequisitionIngressResult(created.id(), created.prNo());
    }

    /**
     * Maps the published contract onto the requisition service's payload.
     *
     * <p>Fields the ingress contract does not carry are passed as {@code null}
     * exactly as the pre-port conversion passed them — Purchase's own defaults
     * fill them in ({@code applyRequest}/{@code create}) — so the persisted
     * requisition is identical to the one the conversion produced before the
     * boundary existed. The PR number and workflow status are deliberately left
     * {@code null}: Purchase allocates the number and starts the record as a
     * draft.
     */
    private PurchaseRequisitionService.PurchaseRequisitionRequestWrapper toRequisitionPayload(
            PurchaseRequisitionIngressRequest request) {
        List<PurchaseDtos.PurchaseItemRequest> items = request.items().stream()
                .map(line -> new PurchaseDtos.PurchaseItemRequest(
                        line.itemCode(),
                        line.product(),
                        null,
                        null,
                        line.uom(),
                        line.qty(),
                        null,
                        null,
                        null,
                        line.remarks(),
                        line.specification(),
                        line.requiredDate()))
                .toList();

        return new PurchaseRequisitionService.PurchaseRequisitionRequestWrapper(
                null,
                request.title(),
                request.prType(),
                request.department(),
                request.project(),
                request.requester(),
                null,
                null,
                request.currency(),
                request.priority(),
                null,
                null,
                null,
                null,
                null,
                null,
                request.deliveryAddress(),
                request.company(),
                null,
                request.date(),
                request.requiredDate(),
                null,
                null,
                null,
                request.notes(),
                request.internalNotes(),
                items,
                null,
                null);
    }
}
