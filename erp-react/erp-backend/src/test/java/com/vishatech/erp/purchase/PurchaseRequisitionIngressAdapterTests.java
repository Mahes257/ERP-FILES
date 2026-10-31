package com.vishatech.erp.purchase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.vishatech.erp.dto.PurchaseDtos;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.purchase.api.PurchaseRequisitionIngressRequest;
import com.vishatech.erp.purchase.api.PurchaseRequisitionIngressResult;
import com.vishatech.erp.service.PurchaseRequisitionIngressAdapter;
import com.vishatech.erp.service.PurchaseRequisitionService;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * P3 — the Purchase-owned adapter behind
 * {@link com.vishatech.erp.purchase.api.PurchaseRequisitionIngressPort}.
 *
 * <p>These tests pin the two things the adapter must do and the one thing it
 * must not:
 *
 * <ol>
 *   <li><b>Delegate, not re-implement.</b> Every call ends in the existing
 *       {@link PurchaseRequisitionService#create}, i.e. the same method the
 *       requisition REST API uses — so validation, PR-number allocation, totals
 *       and persistence are untouched by the new boundary.</li>
 *   <li><b>Map the published contract onto the payload Purchase already
 *       persisted.</b> Each published field must land on the same internal field
 *       the pre-port conversion set, so the stored requisition is identical.</li>
 *   <li><b>Not invent Purchase's own fields.</b> The PR number, the workflow
 *       status, the money fields and the workflow columns stay {@code null} so
 *       Purchase keeps deciding them (draft status, generated number,
 *       zero-defaulted money).</li>
 * </ol>
 *
 * <p>No database and no Spring context: the service is a mock, so the assertions
 * are about the exact payload handed over.
 */
@ExtendWith(MockitoExtension.class)
class PurchaseRequisitionIngressAdapterTests {

    @Mock
    private PurchaseRequisitionService purchaseRequisitionService;

    private PurchaseRequisitionIngressAdapter adapter;

    @BeforeEach
    void setUp() {
        adapter = new PurchaseRequisitionIngressAdapter(purchaseRequisitionService);
    }

    /** A fully populated published request, as the CPR conversion builds it. */
    private static PurchaseRequisitionIngressRequest request() {
        return new PurchaseRequisitionIngressRequest(
                "Test Item",
                "CPR",
                "Sales",
                "Apex Industries",
                "Admin User",
                "USD",
                "High",
                "Chennai, Tamil Nadu, India",
                "Apex Industries",
                "2026-10-14",
                "2026-10-24",
                "Raised from CPR-2026-000023 / TV-2026-0002 by Admin User.",
                "CPR CPR-2026-000023 / TV TV-2026-0002",
                List.of(new PurchaseRequisitionIngressRequest.Line(
                        "TEST-DRW-UI",
                        "Test Item",
                        "Nos",
                        new BigDecimal("2"),
                        "Test CPR Item",
                        "EN8",
                        "2026-10-24")));
    }

    private void stubCreatedRequisition(Long id, String prNo) {
        PurchaseDtos.PurchaseRequisitionResponse created =
                mock(PurchaseDtos.PurchaseRequisitionResponse.class);
        when(created.id()).thenReturn(id);
        when(created.prNo()).thenReturn(prNo);
        when(purchaseRequisitionService.create(any())).thenReturn(created);
    }

    private PurchaseRequisitionService.PurchaseRequisitionRequestWrapper capturedPayload() {
        ArgumentCaptor<PurchaseRequisitionService.PurchaseRequisitionRequestWrapper> captor =
                ArgumentCaptor.forClass(PurchaseRequisitionService.PurchaseRequisitionRequestWrapper.class);
        verify(purchaseRequisitionService, times(1)).create(captor.capture());
        return captor.getValue();
    }

    @Test
    void theAdapterDelegatesToTheExistingCreationLogicAndReturnsItsIdAndPrNumber() {
        stubCreatedRequisition(77L, "PR-2026-0077");

        PurchaseRequisitionIngressResult result = adapter.createRequisition(request());

        // The id and the PR number are the created record's own — not echoed back
        // from the request, which never carries either.
        assertThat(result.requisitionId()).isEqualTo(77L);
        assertThat(result.prNo()).isEqualTo("PR-2026-0077");
    }

    @Test
    void everyPublishedFieldLandsOnThePayloadPurchaseAlreadyPersisted() {
        stubCreatedRequisition(78L, "PR-2026-0078");

        adapter.createRequisition(request());

        PurchaseRequisitionService.PurchaseRequisitionRequestWrapper payload = capturedPayload();
        assertThat(payload.title()).isEqualTo("Test Item");
        assertThat(payload.prType()).isEqualTo("CPR");
        assertThat(payload.department()).isEqualTo("Sales");
        assertThat(payload.project()).isEqualTo("Apex Industries");
        assertThat(payload.requester()).isEqualTo("Admin User");
        assertThat(payload.currency()).isEqualTo("USD");
        assertThat(payload.priority()).isEqualTo("High");
        assertThat(payload.deliveryAddress()).isEqualTo("Chennai, Tamil Nadu, India");
        assertThat(payload.company()).isEqualTo("Apex Industries");
        assertThat(payload.date()).isEqualTo("2026-10-14");
        assertThat(payload.expectedDate()).isEqualTo("2026-10-24");
        assertThat(payload.notes()).isEqualTo("Raised from CPR-2026-000023 / TV-2026-0002 by Admin User.");
        assertThat(payload.internalNotes()).isEqualTo("CPR CPR-2026-000023 / TV TV-2026-0002");

        assertThat(payload.items()).hasSize(1);
        PurchaseDtos.PurchaseItemRequest line = payload.items().get(0);
        assertThat(line.itemCode()).isEqualTo("TEST-DRW-UI");
        assertThat(line.product()).isEqualTo("Test Item");
        assertThat(line.uom()).isEqualTo("Nos");
        assertThat(line.qty()).isEqualByComparingTo("2");
        assertThat(line.remarks()).isEqualTo("Test CPR Item");
        assertThat(line.specification()).isEqualTo("EN8");
        assertThat(line.requiredDate()).isEqualTo("2026-10-24");
    }

    @Test
    void purchaseKeepsOwnershipOfEveryFieldTheContractDoesNotPublish() {
        stubCreatedRequisition(79L, "PR-2026-0079");

        adapter.createRequisition(request());

        PurchaseRequisitionService.PurchaseRequisitionRequestWrapper payload = capturedPayload();
        // Numbering, workflow status, workflow columns and money: Purchase decides
        // these (generated PR number, DRAFT status, zero-defaulted money), so the
        // adapter must not pass a value for any of them.
        assertThat(payload.prNo()).isNull();
        assertThat(payload.status()).isNull();
        assertThat(payload.buyer()).isNull();
        assertThat(payload.vendor()).isNull();
        assertThat(payload.terms()).isNull();
        assertThat(payload.gstType()).isNull();
        assertThat(payload.incoterm()).isNull();
        assertThat(payload.transportMode()).isNull();
        assertThat(payload.warehouse()).isNull();
        assertThat(payload.costCenter()).isNull();
        assertThat(payload.location()).isNull();
        assertThat(payload.branch()).isNull();
        assertThat(payload.discount()).isNull();
        assertThat(payload.charges()).isNull();

        PurchaseDtos.PurchaseItemRequest line = payload.items().get(0);
        assertThat(line.category()).isNull();
        assertThat(line.hsn()).isNull();
        assertThat(line.rate()).isNull();
        assertThat(line.discount()).isNull();
        assertThat(line.gstRate()).isNull();
    }

    @Test
    void existingRequisitionValidationFailuresPropagateUnchanged() {
        // The very failure the pre-port conversion had to work around: Purchase's
        // own validation. It must still be Purchase that raises it, with its own
        // message, through the new boundary.
        when(purchaseRequisitionService.create(any()))
                .thenThrow(new BadRequestException("Currency is required"));

        assertThatThrownBy(() -> adapter.createRequisition(request()))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Currency is required");
    }

    @Test
    void anEmptyItemListIsPassedThroughToPurchaseRatherThanDefaultedHere() {
        stubCreatedRequisition(80L, "PR-2026-0080");

        adapter.createRequisition(new PurchaseRequisitionIngressRequest(
                "Test Item", "CPR", "Sales", null, "Admin User", "INR", "Medium",
                null, null, "2026-10-14", "2026-10-24", null, null, List.of()));

        // Purchase's "At least one requisition item is required" rule is the one that
        // decides this, not the adapter.
        assertThat(capturedPayload().items()).isEmpty();
    }
}
