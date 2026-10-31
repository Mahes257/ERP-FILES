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
import com.vishatech.erp.dto.QuotationResponse;
import com.vishatech.erp.entity.ProfitWorkout;
import com.vishatech.erp.entity.ProfitWorkoutStatus;
import com.vishatech.erp.entity.Quotation;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.CostWorkoutRepository;
import com.vishatech.erp.repository.CwMasterDataRepository;
import com.vishatech.erp.repository.ProfitWorkoutRepository;
import com.vishatech.erp.repository.QuotationRepository;
import com.vishatech.erp.util.AuditContext;
import com.vishatech.erp.crm.repository.CustomerRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/**
 * Regression tests for {@code ProfitWorkoutService#convertToQuotation}.
 *
 * <p>The conversion is <b>status-independent</b>: the Profit Workout list offers
 * "Convert to Quotation" for every row, but the endpoint previously answered
 * 400 ("Only approved Profit Workouts can be converted to a quotation") for any
 * other status — so the always-visible action was unusable for nearly every
 * record and replaced the list with the global 400 page.
 *
 * <p>These tests pin that every {@link ProfitWorkoutStatus} converts, while the
 * genuine rules stay intact: a missing Profit Workout still fails and an
 * already-converted Profit Workout is rejected without creating a second
 * quotation.
 */
class ProfitWorkoutQuotationConversionTests {

    private static final Long PW_ID = 31L;
    private static final Long MISSING_PW_ID = 999L;
    private static final String PW_NO = "PW-2026-000031";
    private static final Long QTN_ID = 88L;
    private static final String QTN_NO = "QTN-2026-000088";

    private record Harness(
            ProfitWorkoutService service,
            ProfitWorkoutRepository profitWorkoutRepository,
            QuotationRepository quotationRepository,
            QuotationService quotationService) {
    }

    private Harness harness() {
        ProfitWorkoutRepository profitWorkoutRepository = mock(ProfitWorkoutRepository.class);
        CwMasterDataRepository masterDataRepository = mock(CwMasterDataRepository.class);
        AuditContext auditContext = mock(AuditContext.class);
        QuotationService quotationService = mock(QuotationService.class);
        QuotationRepository quotationRepository = mock(QuotationRepository.class);
        DocumentRepositoryService documentRepositoryService = mock(DocumentRepositoryService.class);
        CustomerRepository customerRepository = mock(CustomerRepository.class);
        CostWorkoutRepository costWorkoutRepository = mock(CostWorkoutRepository.class);
        ProfitWorkoutService service = new ProfitWorkoutService(
                profitWorkoutRepository, masterDataRepository, auditContext, quotationService,
                quotationRepository, documentRepositoryService, customerRepository,
                costWorkoutRepository);
        return new Harness(service, profitWorkoutRepository, quotationRepository, quotationService);
    }

    private ProfitWorkout profitWorkout(ProfitWorkoutStatus status) {
        ProfitWorkout pw = new ProfitWorkout();
        pw.setId(PW_ID);
        pw.setPwNo(PW_NO);
        pw.setStatus(status);
        pw.setPreparedBy("Admin User");
        return pw;
    }

    private QuotationResponse quotation() {
        QuotationResponse created = mock(QuotationResponse.class);
        when(created.id()).thenReturn(QTN_ID);
        when(created.quotationNo()).thenReturn(QTN_NO);
        return created;
    }

    /** Stubs a stored Profit Workout with no quotation yet and a successful conversion. */
    private void stubConversion(Harness h, ProfitWorkout pw) {
        QuotationResponse created = quotation();
        when(h.profitWorkoutRepository().findById(PW_ID)).thenReturn(Optional.of(pw));
        // The service reads the live quotations generated from this Profit Workout
        // (deleted ones are ignored), so the stub must use the same query.
        when(h.quotationRepository()
                .findLiveByReference(ProfitWorkoutService.QUOTATION_REF_PREFIX + PW_NO))
                .thenReturn(List.of());
        when(h.profitWorkoutRepository().save(any(ProfitWorkout.class))).thenAnswer(inv -> inv.getArgument(0));
        when(h.quotationService().createFromProfitWorkout(pw)).thenReturn(created);
    }

    // ------------------------------------------------- status independence

    @Test
    void everyProfitWorkoutStatusCanBeConvertedToAQuotation() {
        for (ProfitWorkoutStatus status : ProfitWorkoutStatus.values()) {
            Harness h = harness();
            ProfitWorkout pw = profitWorkout(status);
            stubConversion(h, pw);

            ConversionResult result = h.service().convertToQuotation(PW_ID);

            assertThat(result.module()).as("module for %s", status).isEqualTo("quotation");
            assertThat(result.id()).as("quotation id for %s", status).isEqualTo(QTN_ID);
            assertThat(result.number()).as("quotation number for %s", status).isEqualTo(QTN_NO);
            assertThat(result.message()).contains(QTN_NO).contains(PW_NO);
            verify(h.quotationService(), times(1)).createFromProfitWorkout(pw);
        }
    }

    @Test
    void draftProfitWorkoutConvertsSuccessfully() {
        Harness h = harness();
        ProfitWorkout pw = profitWorkout(ProfitWorkoutStatus.DRAFT);
        stubConversion(h, pw);

        ConversionResult result = h.service().convertToQuotation(PW_ID);

        assertThat(result.module()).isEqualTo("quotation");
        assertThat(result.number()).isEqualTo(QTN_NO);
        verify(h.quotationService()).createFromProfitWorkout(pw);
        verify(h.profitWorkoutRepository()).save(pw);
    }

    // ------------------------------------------------- genuine validations

    @Test
    void missingProfitWorkoutIsRejected() {
        Harness h = harness();
        when(h.profitWorkoutRepository().findById(MISSING_PW_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> h.service().convertToQuotation(MISSING_PW_ID))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessageContaining("Profit Workout not found");
        verify(h.quotationService(), never()).createFromProfitWorkout(any());
    }

    @Test
    void alreadyConvertedProfitWorkoutIsRejectedWithoutASecondQuotation() {
        Harness h = harness();
        stubConversion(h, profitWorkout(ProfitWorkoutStatus.DRAFT));
        Quotation existing = new Quotation();
        existing.setQuotationNo(QTN_NO);
        when(h.quotationRepository()
                .findLiveByReference(ProfitWorkoutService.QUOTATION_REF_PREFIX + PW_NO))
                .thenReturn(List.of(existing));

        assertThatThrownBy(() -> h.service().convertToQuotation(PW_ID))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("already converted to quotation")
                .hasMessageContaining(QTN_NO);
        verify(h.quotationService(), never()).createFromProfitWorkout(any());
    }
}
