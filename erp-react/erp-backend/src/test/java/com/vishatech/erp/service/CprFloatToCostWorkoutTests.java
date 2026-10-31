package com.vishatech.erp.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.vishatech.erp.dto.CostWorkoutRequest;
import com.vishatech.erp.dto.CostWorkoutResponse;
import com.vishatech.erp.crm.repository.CustomerRepository;
import com.vishatech.erp.crm.service.CustomerService;
import com.vishatech.erp.entity.Cpr;
import com.vishatech.erp.entity.CprFloatDestination;
import com.vishatech.erp.entity.CprItem;
import com.vishatech.erp.entity.CprStatus;
import com.vishatech.erp.entity.CprTechnicalVerification;
import com.vishatech.erp.entity.TechnicalVerificationStatus;
import com.vishatech.erp.repository.CostWorkoutRepository;
import com.vishatech.erp.repository.CprRepository;
import com.vishatech.erp.repository.CprTechnicalVerificationRepository;
import com.vishatech.erp.util.AuditContext;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * The CPR Admin float → Cost Workout request (CprService#floatCpr, destination CW).
 *
 * <p>A CPR holds what the CUSTOMER asked for; the Cost Workout is the company's
 * own costing of the same job. The destination must therefore carry the CPR's
 * HEADER and the CPR link only: the CPR's material/item rows (and the CPR's item
 * grid configuration) stay in the CPR and never appear in the Cost Workout's
 * item/material section, which opens on its own single blank row.
 *
 * <p>These tests pin the request mapping at the boundary where the Cost Workout is
 * created, and they pin that the source CPR keeps its items untouched.
 */
class CprFloatToCostWorkoutTests {

    private static final Long CPR_ID = 23L;
    private static final String PR_NO = "CPR-2026-000023";
    private static final String ITEM_TEXT = "MS Plate 5mm";
    private static final String ITEM_DRAWING = "DRW-101";
    private static final Long CW_ID = 91L;
    private static final String CW_NO = "CW-2026-000091";

    private record Harness(CprService service,
                           CprRepository cprRepository,
                           CprTechnicalVerificationRepository tvRepository,
                           CostWorkoutService costWorkoutService) {
    }

    private Harness harness() {
        CprRepository cprRepository = mock(CprRepository.class);
        CprTechnicalVerificationRepository tvRepository = mock(CprTechnicalVerificationRepository.class);
        CostWorkoutService costWorkoutService = mock(CostWorkoutService.class);
        AuditContext auditContext = mock(AuditContext.class);
        when(auditContext.currentUserName()).thenReturn("Admin User");

        CprService service = new CprService(
                cprRepository,
                mock(FileStorageService.class),
                mock(QuotationService.class),
                mock(CostWorkoutRepository.class),
                auditContext,
                mock(DocumentRepositoryService.class),
                mock(PrReferenceService.class),
                tvRepository,
                costWorkoutService,
                mock(CustomerService.class),
                mock(CustomerRepository.class),
                mock(com.vishatech.erp.crm.service.LeadService.class),
                "http://localhost:8080");
        return new Harness(service, cprRepository, tvRepository, costWorkoutService);
    }

    /** A technically-verified CPR with one real material item. */
    private Cpr verifiedCpr(String itemDescription) {
        CprItem item = new CprItem();
        item.setId(28L);
        item.setDrawingNo(ITEM_DRAWING);
        item.setDescription(itemDescription);
        item.setQty(new BigDecimal("10"));
        item.setUnit("Nos");
        item.setEstimatedCost(new BigDecimal("250.00"));
        item.setRemarks("Ground finish");

        Cpr cpr = new Cpr();
        cpr.setId(CPR_ID);
        cpr.setPrNo(PR_NO);
        cpr.setStatus(CprStatus.APPROVED);
        cpr.setLatestRevision(true);
        cpr.setDepartment("Sales");
        cpr.setRequestedBy("Requester User");
        cpr.setClientId(7L);
        cpr.setClientName("Apex Industries");
        cpr.setCompany("Apex Industries");
        cpr.setContactPerson("Contact Person");
        cpr.setPhone("+91 90000 00000");
        cpr.setEmail("apex@example.com");
        cpr.setGst("33ABCDE1234F1Z5");
        cpr.setPan("ABCDE1234F");
        cpr.setBillingAddress("Chennai, Tamil Nadu, India");
        cpr.setShippingAddress("Chennai, Tamil Nadu, India");
        cpr.setProfitPercent(new BigDecimal("10"));
        cpr.setItemColumnsJson("[{\"id\":\"custom1\",\"label\":\"Heat No.\",\"system\":false}]");
        cpr.setItems(new ArrayList<>(List.of(item)));
        return cpr;
    }

    private CprTechnicalVerification verifiedRow() {
        CprTechnicalVerification row = new CprTechnicalVerification();
        row.setId(1L);
        row.setTvNo("TV-2026-0001");
        row.setStatus(TechnicalVerificationStatus.VERIFICATION_COMPLETED);
        row.setCprItemId(28L);
        return row;
    }

    private CostWorkoutResponse createdCostWorkout() {
        CostWorkoutResponse response = mock(CostWorkoutResponse.class);
        when(response.id()).thenReturn(CW_ID);
        when(response.cwNo()).thenReturn(CW_NO);
        when(response.status()).thenReturn("draft");
        return response;
    }

    private CostWorkoutRequest capturedFloatRequest(Harness h, Cpr cpr) {
        // Built BEFORE the outer when(...) — stubbing a second mock inside an
        // unfinished stubbing is what Mockito reports as UnfinishedStubbing.
        CostWorkoutResponse created = createdCostWorkout();
        when(h.cprRepository().findById(CPR_ID)).thenReturn(Optional.of(cpr));
        when(h.tvRepository().findAllByCprIdOrderByIdAsc(CPR_ID))
                .thenReturn(new ArrayList<>(List.of(verifiedRow())));
        when(h.cprRepository().save(any(Cpr.class))).thenAnswer(inv -> inv.getArgument(0));
        when(h.cprRepository().findByRevisionOfOrderByRevisionDesc(any())).thenReturn(List.of());
        when(h.costWorkoutService().create(any(CostWorkoutRequest.class), eq(true)))
                .thenReturn(created);

        h.service().floatCpr(CPR_ID, "CW", "Approved for costing");

        ArgumentCaptor<CostWorkoutRequest> captor = ArgumentCaptor.forClass(CostWorkoutRequest.class);
        org.mockito.Mockito.verify(h.costWorkoutService()).create(captor.capture(), eq(true));
        return captor.getValue();
    }

    @Test
    void theFloatedCostWorkoutCarriesTheCprHeaderAndLinkButNoCprMaterial() {
        Harness h = harness();
        Cpr cpr = verifiedCpr(ITEM_TEXT);

        CostWorkoutRequest request = capturedFloatRequest(h, cpr);

        // ---- the CPR reference and header information travel ----
        assertThat(request.cprRef()).isEqualTo(PR_NO);
        assertThat(request.linkedCpr()).isEqualTo(PR_NO);
        assertThat(request.cprId()).isEqualTo(CPR_ID);
        assertThat(request.customerName()).isEqualTo("Apex Industries");
        assertThat(request.company()).isEqualTo("Apex Industries");
        assertThat(request.contactPerson()).isEqualTo("Contact Person");
        assertThat(request.email()).isEqualTo("apex@example.com");
        assertThat(request.phone()).isEqualTo("+91 90000 00000");
        assertThat(request.gst()).isEqualTo("33ABCDE1234F1Z5");
        assertThat(request.pan()).isEqualTo("ABCDE1234F");
        assertThat(request.billingAddress()).isEqualTo("Chennai, Tamil Nadu, India");
        assertThat(request.department()).isEqualTo("Sales");
        assertThat(request.preparedBy()).isEqualTo("Requester User");
        assertThat(request.profitPct()).isEqualByComparingTo("10");
        assertThat(request.remarks()).isEqualTo("Approved for costing");

        // ---- the CPR's material rows do NOT travel ----
        assertThat(request.items()).hasSize(1);
        assertThat(request.items().get(0).description()).isEmpty();
        assertThat(request.items().get(0).qty()).isEqualByComparingTo("1");
        assertThat(request.items().get(0).unit()).isEqualTo("Nos");
        assertThat(request.items().get(0).categories()).hasSize(1);
        assertThat(request.items().get(0).categories().get(0).category()).isEqualTo("Material Cost");
        assertThat(request.items().get(0).categories().get(0).rate()).isEqualByComparingTo("0");
        // No CPR item value leaks into the Cost Workout payload in any form.
        String payload = request.toString();
        assertThat(payload).doesNotContain(ITEM_TEXT);
        assertThat(payload).doesNotContain(ITEM_DRAWING);
        assertThat(payload).doesNotContain("Ground finish");
        assertThat(payload).doesNotContain("250");

        // ---- the CPR's own item grid configuration is not copied either ----
        assertThat(request.itemColumnsJson()).isNull();
    }

    @Test
    void theSourceCprKeepsItsItemsAndCarriesTheCostWorkoutLink() {
        Harness h = harness();
        Cpr cpr = verifiedCpr(ITEM_TEXT);

        capturedFloatRequest(h, cpr);

        // The CPR is not modified in its items, only linked to the destination.
        assertThat(cpr.getItems()).hasSize(1);
        assertThat(cpr.getItems().get(0).getDescription()).isEqualTo(ITEM_TEXT);
        assertThat(cpr.getItems().get(0).getDrawingNo()).isEqualTo(ITEM_DRAWING);
        assertThat(cpr.getItems().get(0).getQty()).isEqualByComparingTo("10");
        assertThat(cpr.getItems().get(0).getEstimatedCost()).isEqualByComparingTo("250.00");
        assertThat(cpr.getItems().get(0).getRemarks()).isEqualTo("Ground finish");

        assertThat(cpr.getCostWorkoutId()).isEqualTo(CW_ID);
        assertThat(cpr.getCostWorkoutCwNo()).isEqualTo(CW_NO);
        assertThat(cpr.getStatus()).isEqualTo(CprStatus.COST_WORKOUT);
        assertThat(cpr.getFloatDestination()).isEqualTo(CprFloatDestination.CW);
    }

    @Test
    void aCprWithoutItemDescriptionsStillFloatsToABlankCostWorkout() {
        // The old request builder refused to float a CPR whose items had no
        // description ("add at least one item before floating it to Cost
        // Workout"). That guard existed only because the items were copied into
        // the Cost Workout; the Cost Workout now starts blank, so the float must
        // not depend on the CPR's material text any more.
        Harness h = harness();
        Cpr cpr = verifiedCpr(null);

        CostWorkoutRequest request = capturedFloatRequest(h, cpr);

        assertThat(request.cprId()).isEqualTo(CPR_ID);
        assertThat(request.items()).hasSize(1);
        assertThat(request.items().get(0).description()).isEmpty();
        assertThat(cpr.getStatus()).isEqualTo(CprStatus.COST_WORKOUT);
    }
}
