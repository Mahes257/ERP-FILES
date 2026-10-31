package com.vishatech.erp.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.vishatech.erp.dto.CostWorkoutItemRequest;
import com.vishatech.erp.dto.CostWorkoutRequest;
import com.vishatech.erp.dto.CostWorkoutResponse;
import com.vishatech.erp.purchase.api.PurchaseRequisitionIngressPort;
import com.vishatech.erp.purchase.api.PurchaseRequisitionIngressRequest;
import com.vishatech.erp.purchase.api.PurchaseRequisitionIngressResult;
import com.vishatech.erp.dto.TechnicalVerificationConversionResponse;
import com.vishatech.erp.entity.Cpr;
import com.vishatech.erp.entity.CprItem;
import com.vishatech.erp.entity.CprTechnicalVerification;
import com.vishatech.erp.crm.entity.Customer;
import com.vishatech.erp.entity.TechnicalVerificationStatus;
import com.vishatech.erp.repository.CostWorkoutRepository;
import com.vishatech.erp.repository.CprItemRepository;
import com.vishatech.erp.repository.CprRepository;
import com.vishatech.erp.repository.CprTechnicalVerificationDocumentRepository;
import com.vishatech.erp.repository.CprTechnicalVerificationRepository;
import com.vishatech.erp.crm.repository.CustomerRepository;
import com.vishatech.erp.util.AuditContext;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * Unit tests for the ITEM-LEVEL CPR conversion performed by the item-row CW / PR
 * buttons ({@code CprTechnicalVerificationService#convertItemToCostWorkout} and
 * {@code #convertItemToPurchaseRequisition}).
 *
 * <p>These pin the request MAPPING — the boundary where the CPR item, the CPR
 * header and the client are turned into a Purchase Requisition / Cost Workout
 * request:
 *
 * <ol>
 *   <li>the requisition is raised in the CPR <b>client's own currency</b>, never a
 *       hardcoded one, because Purchase's own requisition validation rejects a
 *       request without a currency ("Currency is required") — the bug that made
 *       the item-level PR conversion fail;</li>
 *   <li>the destination carries only THIS item's real values (description,
 *       quantity, unit, estimated cost) — sibling items are never carried across;</li>
 *   <li>converting twice is idempotent (no duplicate Cost Workout / Requisition).</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class CprItemConversionTests {

    private static final Long TV_ID = 1L;
    private static final Long CPR_ID = 23L;
    private static final Long CPR_ITEM_ID = 28L;
    private static final Long CLIENT_ID = 5L;

    @Mock
    private CprTechnicalVerificationRepository tvRepository;
    @Mock
    private CprTechnicalVerificationDocumentRepository docRepository;
    @Mock
    private CprRepository cprRepository;
    @Mock
    private CprItemRepository cprItemRepository;
    @Mock
    private FileStorageService fileStorageService;
    @Mock
    private DocumentRepositoryService documentRepositoryService;
    @Mock
    private CostWorkoutRepository costWorkoutRepository;
    @Mock
    private CostWorkoutService costWorkoutService;
    @Mock
    private PurchaseRequisitionIngressPort purchaseRequisitionIngressPort;
    @Mock
    private CustomerRepository customerRepository;
    @Mock
    private AuditContext auditContext;

    private CprTechnicalVerificationService service;
    private CprTechnicalVerification tv;

    @BeforeEach
    void setUp() {
        service = new CprTechnicalVerificationService(
                tvRepository, docRepository, cprRepository, cprItemRepository, fileStorageService,
                documentRepositoryService, costWorkoutRepository, costWorkoutService,
                purchaseRequisitionIngressPort, customerRepository, auditContext,
                "http://localhost:8080");
        lenient().when(auditContext.currentUserName()).thenReturn("Admin User");
    }

    // ---------------------------------------------------------------- fixtures

    private void stubRow(String clientCurrency, String cprPriority) {
        CprItem item = new CprItem();
        item.setId(CPR_ITEM_ID);
        item.setDrawingNo("TEST-DRW-UI");
        item.setDescription("Test Item");
        item.setQty(new BigDecimal("2"));
        item.setUnit("Nos");
        item.setEstimatedCost(new BigDecimal("1000.00"));
        item.setRemarks("Test CPR Item");

        Cpr cpr = new Cpr();
        cpr.setId(CPR_ID);
        cpr.setPrNo("CPR-2026-000023");
        cpr.setDepartment("Sales");
        cpr.setRequestedBy("Admin User");
        cpr.setClientId(CLIENT_ID);
        cpr.setClientName("Apex Industries");
        cpr.setCompany("Apex Industries");
        cpr.setShippingAddress("Chennai, Tamil Nadu, India");
        cpr.setPriority(cprPriority);
        cpr.setRequiredDate(LocalDateTime.of(2026, 10, 10, 0, 0));
        cpr.setItems(List.of(item));

        tv = new CprTechnicalVerification();
        tv.setId(TV_ID);
        tv.setTvNo("TV-2026-0002");
        tv.setCpr(cpr);
        tv.setCprItemId(CPR_ITEM_ID);
        tv.setItemNo("TEST-DRW-UI");
        tv.setDrawingNumber("TEST-DRW-UI");
        tv.setItemDescription("Test Item");
        tv.setStatus(TechnicalVerificationStatus.DRAFT);

        Customer customer = new Customer();
        customer.setId(CLIENT_ID);
        customer.setBusinessName("Apex Industries");
        customer.setCurrency(clientCurrency);

        lenient().when(tvRepository.findById(TV_ID)).thenReturn(Optional.of(tv));
        lenient().when(cprRepository.findById(CPR_ID)).thenReturn(Optional.of(cpr));
        lenient().when(cprItemRepository.findById(CPR_ITEM_ID)).thenReturn(Optional.of(item));
        lenient().when(customerRepository.findById(CLIENT_ID)).thenReturn(Optional.of(customer));
    }

    private void stubCreatedRequisition(Long id, String prNo) {
        // The port answers with an immutable value record, not a mutable
        // response DTO: a caller cannot reach into Purchase's record at all.
        when(purchaseRequisitionIngressPort.createRequisition(any()))
                .thenReturn(new PurchaseRequisitionIngressResult(id, prNo));
    }

    private PurchaseRequisitionIngressRequest capturedRequisitionRequest() {
        ArgumentCaptor<PurchaseRequisitionIngressRequest> request =
                ArgumentCaptor.forClass(PurchaseRequisitionIngressRequest.class);
        verify(purchaseRequisitionIngressPort, times(1)).createRequisition(request.capture());
        return request.getValue();
    }

    // ------------------------------------------------------- PR (currency fix)

    @Test
    void prConversionRaisesTheRequisitionInTheCprClientsOwnCurrency() {
        stubRow("USD", "High");
        stubCreatedRequisition(13L, "PR-2026-0010");

        TechnicalVerificationConversionResponse result = service.convertItemToPurchaseRequisition(TV_ID);

        PurchaseRequisitionIngressRequest request = capturedRequisitionRequest();
        // The exact value the Purchase Requisition service validates — it must be the
        // client's configured currency, not a hardcoded one.
        assertThat(request.currency()).isEqualTo("USD");

        // The rest of the request still describes this CPR / item.
        assertThat(request.prType()).isEqualTo("CPR");
        assertThat(request.title()).isEqualTo("Test Item");
        assertThat(request.department()).isEqualTo("Sales");
        assertThat(request.requester()).isEqualTo("Admin User");
        assertThat(request.priority()).isEqualTo("High");
        assertThat(request.company()).isEqualTo("Apex Industries");
        assertThat(request.deliveryAddress()).isEqualTo("Chennai, Tamil Nadu, India");
        assertThat(request.date()).isEqualTo(LocalDate.now().toString());
        // The CPR's own deadline (10 Oct 2026) has already passed. It can no
        // longer be forwarded: Purchase rejects a required date before the
        // request date, which used to fail this whole conversion with a 400.
        // The requisition is raised today, so it is due on its own request date.
        assertThat(request.requiredDate()).isEqualTo(LocalDate.now().toString());
        // The published contract carries no workflow status or PR number: Purchase
        // starts the requisition as a draft and numbers it itself, so nothing a
        // caller sends can decide either.
        assertThat(request.internalNotes()).isEqualTo("CPR CPR-2026-000023 / TV TV-2026-0002");
        assertThat(request.notes())
                .isEqualTo("Raised from CPR-2026-000023 / TV-2026-0002 / item TEST-DRW-UI by Admin User.");

        // Exactly ONE line, carrying THIS row's real item data.
        assertThat(request.items()).hasSize(1);
        PurchaseRequisitionIngressRequest.Line line = request.items().get(0);
        assertThat(line.itemCode()).isEqualTo("TEST-DRW-UI");
        assertThat(line.product()).isEqualTo("Test Item");
        assertThat(line.uom()).isEqualTo("Nos");
        assertThat(line.qty()).isEqualByComparingTo("2");
        assertThat(line.remarks()).isEqualTo("Test CPR Item");

        // The backend responds with the real destination and links it on the row.
        assertThat(result.destination()).isEqualTo("PR");
        assertThat(result.destinationId()).isEqualTo(13L);
        assertThat(result.destinationNo()).isEqualTo("PR-2026-0010");
        assertThat(result.alreadyConverted()).isFalse();
        assertThat(result.itemCount()).isEqualTo(1);
        assertThat(tv.isForwardedToPurchaseRequisition()).isTrue();
        assertThat(tv.getPurchaseRequisitionId()).isEqualTo(13L);
        assertThat(tv.getPurchaseRequisitionPrNo()).isEqualTo("PR-2026-0010");
        assertThat(tv.getStatus()).isEqualTo(TechnicalVerificationStatus.FORWARDED_TO_PURCHASE_REQUISITION);
        verify(tvRepository, times(1)).save(tv);
    }

    @Test
    void prConversionFallsBackToTheErpDefaultOnlyWhenTheClientHasNoCurrency() {
        stubRow("", null);
        stubCreatedRequisition(14L, "PR-2026-0011");

        service.convertItemToPurchaseRequisition(TV_ID);

        PurchaseRequisitionIngressRequest request = capturedRequisitionRequest();
        // Blank client currency -> the same "INR" default the Purchase module's own
        // requisition form uses.
        assertThat(request.currency()).isEqualTo("INR");
        // A CPR saved without a priority still converts, with the Purchase module's
        // own default rather than a refusal.
        assertThat(request.priority()).isEqualTo("Medium");
    }

    @Test
    void prConversionKeepsACprDeadlineThatIsStillAhead() {
        stubRow("INR", "Medium");
        LocalDate ahead = LocalDate.now().plusDays(10);
        tv.getCpr().setRequiredDate(ahead.atStartOfDay());
        stubCreatedRequisition(16L, "PR-2026-0013");

        service.convertItemToPurchaseRequisition(TV_ID);

        PurchaseRequisitionIngressRequest request = capturedRequisitionRequest();
        // A deadline that is still ahead travels unchanged — only a past or
        // missing one is replaced by the requisition's own request date.
        assertThat(request.requiredDate()).isEqualTo(ahead.toString());
        assertThat(LocalDate.parse(request.requiredDate()))
                .isAfterOrEqualTo(LocalDate.parse(request.date()));
    }

    @Test
    void prConversionLeavesACostWorkoutStatusIntactWhenTheItemIsAlsoCosted() {
        stubRow("INR", "Medium");
        stubCreatedRequisition(15L, "PR-2026-0012");
        // Exactly what the CW conversion leaves behind: the destination flag, the
        // linked Cost Workout and the row status.
        tv.setForwardedToCostWorkout(true);
        tv.setCostWorkoutId(2L);
        tv.setCostWorkoutCwNo("CW-2026-000003");
        tv.setStatus(TechnicalVerificationStatus.FORWARDED_TO_COST_WORKOUT);

        service.convertItemToPurchaseRequisition(TV_ID);

        // The CW destination keeps owning the row status; the PR link is additive.
        assertThat(tv.getStatus()).isEqualTo(TechnicalVerificationStatus.FORWARDED_TO_COST_WORKOUT);
        assertThat(tv.getPurchaseRequisitionId()).isEqualTo(15L);
        assertThat(tv.isForwardedToPurchaseRequisition()).isTrue();
    }

    // ----------------------------------------------------------- CW (unchanged)

    @Test
    void costWorkoutConversionCarriesThisItemsQuantityUnitAndEstimatedCost() {
        stubRow("INR", "Medium");
        CostWorkoutResponse created = mock(CostWorkoutResponse.class);
        lenient().when(created.id()).thenReturn(2L);
        lenient().when(created.cwNo()).thenReturn("CW-2026-000003");
        when(costWorkoutService.create(any(), anyBoolean())).thenReturn(created);

        TechnicalVerificationConversionResponse result = service.convertItemToCostWorkout(TV_ID);

        ArgumentCaptor<CostWorkoutRequest> request = ArgumentCaptor.forClass(CostWorkoutRequest.class);
        verify(costWorkoutService, times(1)).create(request.capture(), anyBoolean());
        CostWorkoutRequest cw = request.getValue();

        assertThat(cw.cprId()).isEqualTo(CPR_ID);
        assertThat(cw.items()).hasSize(1);
        CostWorkoutItemRequest line = cw.items().get(0);
        // The drawing number is folded into the description — the CW item has no
        // drawing column of its own.
        assertThat(line.description()).isEqualTo("SKU TEST-DRW-UI — Test Item");
        // The brief CPR Description is the CPR item's own description, kept
        // separate from (and never derived from) the folded CW description.
        assertThat(line.cprDescription()).isEqualTo("Test Item");
        assertThat(line.qty()).isEqualByComparingTo("2");
        assertThat(line.unit()).isEqualTo("Nos");
        assertThat(line.categories()).hasSize(1);
        assertThat(line.categories().get(0).category()).isEqualTo("Material Cost");
        assertThat(line.categories().get(0).rate()).isEqualByComparingTo("1000.00");
        assertThat(line.categories().get(0).notes()).isEqualTo("Test CPR Item");

        assertThat(result.destination()).isEqualTo("CW");
        assertThat(result.destinationId()).isEqualTo(2L);
        assertThat(tv.getCostWorkoutId()).isEqualTo(2L);
        assertThat(tv.getCostWorkoutCwNo()).isEqualTo("CW-2026-000003");
        assertThat(tv.isForwardedToCostWorkout()).isTrue();
        assertThat(tv.getForwardedBy()).isEqualTo("Admin User");
        assertThat(tv.getStatus()).isEqualTo(TechnicalVerificationStatus.FORWARDED_TO_COST_WORKOUT);
    }

    @Test
    void costWorkoutConversionKeepsTheSpecificationEvenWithoutAnEstimatedCost() {
        stubRow("INR", "Medium");
        // A CPR item captured before any costing exists: no estimate, but the spec
        // and remarks ARE the item's description on the CPR.
        CprItem item = tv.getCpr().getItems().get(0);
        item.setEstimatedCost(null);
        item.setSpecification("SPEC SHEET 42");
        item.setRemarks("HANDLE WITH CARE");
        CostWorkoutResponse created = mock(CostWorkoutResponse.class);
        lenient().when(created.id()).thenReturn(3L);
        lenient().when(created.cwNo()).thenReturn("CW-2026-000004");
        when(costWorkoutService.create(any(), anyBoolean())).thenReturn(created);

        service.convertItemToCostWorkout(TV_ID);

        ArgumentCaptor<CostWorkoutRequest> request = ArgumentCaptor.forClass(CostWorkoutRequest.class);
        verify(costWorkoutService, times(1)).create(request.capture(), anyBoolean());
        CostWorkoutItemRequest line = request.getValue().items().get(0);
        // The Cost Workout item always opens with the same single "Material Cost"
        // row the CW form creates — the conversion used to drop the row (and with it
        // the CPR specification / remarks) whenever there was no cost estimate.
        assertThat(line.categories()).hasSize(1);
        assertThat(line.categories().get(0).category()).isEqualTo("Material Cost");
        assertThat(line.categories().get(0).rate()).isEqualByComparingTo("0");
        assertThat(line.categories().get(0).unit()).isEqualTo("Nos");
        assertThat(line.categories().get(0).notes()).isEqualTo("SPEC SHEET 42");
    }

    @Test
    void convertingTheSameItemTwiceNeverCreatesASecondDestination() {
        stubRow("INR", "Medium");
        CostWorkoutResponse created = mock(CostWorkoutResponse.class);
        lenient().when(created.id()).thenReturn(2L);
        lenient().when(created.cwNo()).thenReturn("CW-2026-000003");
        when(costWorkoutService.create(any(), anyBoolean())).thenReturn(created);

        service.convertItemToCostWorkout(TV_ID);
        TechnicalVerificationConversionResponse second = service.convertItemToCostWorkout(TV_ID);

        verify(costWorkoutService, times(1)).create(any(), anyBoolean());
        assertThat(second.alreadyConverted()).isTrue();
        assertThat(second.destinationId()).isEqualTo(2L);
        assertThat(second.message()).contains("already converted");
    }
}
