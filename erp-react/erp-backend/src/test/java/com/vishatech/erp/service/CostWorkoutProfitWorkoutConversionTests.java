package com.vishatech.erp.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.vishatech.erp.dto.ConversionResult;
import com.vishatech.erp.dto.CostWorkoutCategoryRequest;
import com.vishatech.erp.dto.CostWorkoutItemRequest;
import com.vishatech.erp.dto.CostWorkoutRequest;
import com.vishatech.erp.dto.CostWorkoutResponse;
import com.vishatech.erp.dto.ProfitWorkoutResponse;
import com.vishatech.erp.entity.CostWorkout;
import com.vishatech.erp.entity.CostWorkoutStatus;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.CostWorkoutRepository;
import com.vishatech.erp.repository.CprRepository;
import com.vishatech.erp.repository.CwMasterDataRepository;
import com.vishatech.erp.util.AuditContext;
import com.vishatech.erp.crm.entity.Lead;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/**
 * Regression tests for {@code CostWorkoutService#convertToProfitWorkout}.
 *
 * <p>The conversion is <b>status-independent</b>: the endpoint
 * ({@code POST /v1/cost-workouts/{id}/convert-to-profit-workout}) previously
 * answered 400 ("Only approved Cost Workouts can be converted to a Profit
 * Workout") for anything that was not APPROVED, so a Draft / Submitted /
 * Completed / Rejected / Archived Cost Workout could never be converted even
 * though the list action is offered for every row.
 *
 * <p>These tests pin:
 *
 * <ol>
 *   <li>every value of {@link CostWorkoutStatus} converts successfully;</li>
 *   <li>DRAFT and APPROVED both convert (the workflow relies on APPROVED);</li>
 *   <li>the genuine validations are untouched: a missing Cost Workout still
 *       fails, and the sibling Cost Workout → Quotation conversion still
 *       requires APPROVED;</li>
 *   <li>one CW → one PW idempotency holds for every status (no duplicate Profit
 *       Workout is ever generated and the existing link is returned).</li>
 * </ol>
 */
class CostWorkoutProfitWorkoutConversionTests {

    private static final Long CW_ID = 42L;
    private static final Long MISSING_CW_ID = 999L;
    private static final String CW_NO = "CW-2026-000042";
    private static final Long PW_ID = 77L;
    private static final String PW_NO = "PW-2026-000077";

    /**
     * One freshly-wired service per scenario so every test (and every status in
     * the parameter loops) starts from clean collaborators.
     */
    private record Harness(
            CostWorkoutService service,
            CostWorkoutRepository costWorkoutRepository,
            ProfitWorkoutService profitWorkoutService,
            QuotationService quotationService) {
    }

    private Harness harness() {
        CostWorkoutRepository costWorkoutRepository = mock(CostWorkoutRepository.class);
        CwMasterDataRepository masterDataRepository = mock(CwMasterDataRepository.class);
        CprRepository cprRepository = mock(CprRepository.class);
        AuditContext auditContext = mock(AuditContext.class);
        QuotationService quotationService = mock(QuotationService.class);
        ProfitWorkoutService profitWorkoutService = mock(ProfitWorkoutService.class);
        DocumentRepositoryService documentRepositoryService = mock(DocumentRepositoryService.class);
        CostWorkoutService service = new CostWorkoutService(
                costWorkoutRepository, masterDataRepository, cprRepository, auditContext,
                quotationService, profitWorkoutService, documentRepositoryService);
        return new Harness(service, costWorkoutRepository, profitWorkoutService, quotationService);
    }

    private CostWorkout costWorkout(CostWorkoutStatus status) {
        CostWorkout cw = new CostWorkout();
        cw.setId(CW_ID);
        cw.setCwNo(CW_NO);
        cw.setStatus(status);
        cw.setPreparedBy("Admin User");
        cw.setCprId(23L);
        cw.setCprRef("CPR-2026-000023");
        return cw;
    }

    private ProfitWorkoutResponse profitWorkout() {
        ProfitWorkoutResponse created = mock(ProfitWorkoutResponse.class);
        when(created.id()).thenReturn(PW_ID);
        when(created.pwNo()).thenReturn(PW_NO);
        return created;
    }

    /** Stubs the persisted Cost Workout and the destination Profit Workout. */
    private void stubConversion(Harness h, CostWorkout cw) {
        // Built BEFORE the outer when(...) — stubbing a second mock inside an
        // unfinished stubbing is what Mockito reports as UnfinishedStubbing.
        ProfitWorkoutResponse created = profitWorkout();
        // The conversion takes the CW row lock (race-safe one-CW→one-PW).
        when(h.costWorkoutRepository().findByIdForUpdate(CW_ID)).thenReturn(Optional.of(cw));
        when(h.costWorkoutRepository().save(any(CostWorkout.class))).thenAnswer(inv -> inv.getArgument(0));
        when(h.profitWorkoutService().createFromCostWorkout(cw)).thenReturn(created);
    }

    // ------------------------------------------------- status independence

    @Test
    void everyCostWorkoutStatusCanBeConvertedToAProfitWorkout() {
        for (CostWorkoutStatus status : CostWorkoutStatus.values()) {
            Harness h = harness();
            CostWorkout cw = costWorkout(status);
            stubConversion(h, cw);

            ConversionResult result = h.service().convertToProfitWorkout(CW_ID);

            assertThat(result.module()).as("module for %s", status).isEqualTo("profit-workout");
            assertThat(result.id()).as("destination id for %s", status).isEqualTo(PW_ID);
            assertThat(result.number()).as("destination number for %s", status).isEqualTo(PW_NO);
            assertThat(result.message()).as("message for %s", status)
                    .isEqualTo("Profit Workout " + PW_NO + " created from Cost Workout " + CW_NO);

            // The destination was really created and the source carries the link.
            verify(h.profitWorkoutService(), times(1)).createFromCostWorkout(cw);
            assertThat(cw.getConvertedToPw()).as("back-link for %s", status).isEqualTo(PW_NO);
            assertThat(cw.getConvertedToPwId()).as("back-link id for %s", status).isEqualTo(PW_ID);
            // Converting never rewrites the source status.
            assertThat(cw.getStatus()).as("source status kept for %s", status).isEqualTo(status);
            verify(h.costWorkoutRepository(), times(1)).save(cw);
        }
    }

    @Test
    void draftCostWorkoutConvertsWithoutApproval() {
        Harness h = harness();
        CostWorkout cw = costWorkout(CostWorkoutStatus.DRAFT);
        stubConversion(h, cw);

        ConversionResult result = h.service().convertToProfitWorkout(CW_ID);

        assertThat(result.number()).isEqualTo(PW_NO);
        verify(h.profitWorkoutService(), times(1)).createFromCostWorkout(cw);
    }

    @Test
    void approvedCostWorkoutStillConverts() {
        Harness h = harness();
        CostWorkout cw = costWorkout(CostWorkoutStatus.APPROVED);
        stubConversion(h, cw);

        ConversionResult result = h.service().convertToProfitWorkout(CW_ID);

        assertThat(result.number()).isEqualTo(PW_NO);
        verify(h.profitWorkoutService(), times(1)).createFromCostWorkout(cw);
    }

    // ------------------------------------------------------ idempotency

    @Test
    void anAlreadyConvertedCostWorkoutIsNeverConvertedTwiceForAnyStatus() {
        for (CostWorkoutStatus status : CostWorkoutStatus.values()) {
            Harness h = harness();
            CostWorkout cw = costWorkout(status);
            // Exactly what the first conversion leaves behind.
            cw.setConvertedToPw(PW_NO);
            cw.setConvertedToPwId(PW_ID);
            when(h.costWorkoutRepository().findByIdForUpdate(CW_ID)).thenReturn(Optional.of(cw));

            ConversionResult result = h.service().convertToProfitWorkout(CW_ID);

            verify(h.profitWorkoutService(), never()).createFromCostWorkout(any());
            verify(h.costWorkoutRepository(), never()).save(any(CostWorkout.class));
            assertThat(result.number()).as("existing number for %s", status).isEqualTo(PW_NO);
            assertThat(result.id()).as("existing id for %s", status).isEqualTo(PW_ID);
            assertThat(result.message()).as("message for %s", status).contains("already exists");
        }
    }

    // ---------------------------------- approval never creates a Profit Workout

    /**
     * Approving a Cost Workout moves it to APPROVED and nothing else: creation,
     * saving and approval must never generate a Profit Workout. The Profit
     * Workout is produced only by the explicit conversion endpoint
     * (covered above), never by a side effect of approval.
     */
    @Test
    void approvingACostWorkoutDoesNotCreateAProfitWorkout() {
        Harness h = harness();
        CostWorkout cw = costWorkout(CostWorkoutStatus.SUBMITTED);
        when(h.costWorkoutRepository().findById(CW_ID)).thenReturn(Optional.of(cw));
        when(h.costWorkoutRepository().save(any(CostWorkout.class))).thenAnswer(inv -> inv.getArgument(0));

        CostWorkoutResponse response = h.service().approve(CW_ID, "approved by test");

        assertThat(response.status()).isEqualTo("approved");
        assertThat(cw.getConvertedToPw()).isNull();
        assertThat(cw.getConvertedToPwId()).isNull();
        verify(h.profitWorkoutService(), never()).createFromCostWorkout(any());
        verify(h.costWorkoutRepository(), times(1)).save(cw);
    }

    /**
     * Creating (and saving) a Cost Workout persists only the Cost Workout: no
     * Profit Workout is generated by the create path. This is the invariant the
     * whole module relies on — Profit Workouts come from the explicit conversion
     * endpoint alone.
     */
    @Test
    void creatingACostWorkoutNeverCreatesAProfitWorkout() {
        Harness h = harness();
        CostWorkoutRequest request = new CostWorkoutRequest(
                CW_NO, "2026-10-09", "completed", "Admin User", null, "Engineering", "Lead-1",
                "Acme", null, null, null, null, null, null, null, null, null, null, null,
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.valueOf(18),
                List.of(new CostWorkoutItemRequest("Widget", null, BigDecimal.ONE, "Nos",
                        List.of(new CostWorkoutCategoryRequest("Material Cost", BigDecimal.ONE, "Nos",
                                BigDecimal.TEN, null)),
                        null,
                        // No item-level documents in this conversion case.
                        null)),
                null, null);
        when(h.costWorkoutRepository().existsByCwNo(CW_NO)).thenReturn(false);
        when(h.costWorkoutRepository().save(any(CostWorkout.class))).thenAnswer(inv -> {
            CostWorkout saved = inv.getArgument(0);
            saved.setId(CW_ID);
            return saved;
        });

        CostWorkoutResponse response = h.service().create(request, false);

        assertThat(response.cwNo()).isEqualTo(CW_NO);
        assertThat(response.convertedToPw()).isNull();
        verify(h.profitWorkoutService(), never()).createFromCostWorkout(any());
    }

    // ---------------------------------------------- validation preserved

    @Test
    void conversionStillFailsWhenTheCostWorkoutDoesNotExist() {
        Harness h = harness();
        when(h.costWorkoutRepository().findById(MISSING_CW_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> h.service().convertToProfitWorkout(MISSING_CW_ID))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessageContaining("Cost Workout not found");

        verify(h.profitWorkoutService(), never()).createFromCostWorkout(any());
    }

    @Test
    void quotationConversionStillRequiresApproval() {
        Harness h = harness();
        CostWorkout cw = costWorkout(CostWorkoutStatus.DRAFT);
        // The conversion takes the CW row lock (findByIdForUpdate), so that is the
        // read the service performs before the approval check.
        when(h.costWorkoutRepository().findByIdForUpdate(CW_ID)).thenReturn(Optional.of(cw));

        assertThatThrownBy(() -> h.service().convertToQuotation(CW_ID))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Only approved Cost Workouts");

        verify(h.quotationService(), never()).createFromCostWorkout(any());
    }
}
