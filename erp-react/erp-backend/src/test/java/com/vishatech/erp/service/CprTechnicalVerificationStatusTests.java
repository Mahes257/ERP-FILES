package com.vishatech.erp.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.vishatech.erp.config.SpringContext;
import com.vishatech.erp.dto.TechnicalVerificationResponse;
import com.vishatech.erp.entity.Cpr;
import com.vishatech.erp.entity.CprTechnicalVerification;
import com.vishatech.erp.entity.EditHistory;
import com.vishatech.erp.entity.TechnicalVerificationStatus;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.purchase.api.PurchaseRequisitionIngressPort;
import com.vishatech.erp.repository.CostWorkoutRepository;
import com.vishatech.erp.repository.CprItemRepository;
import com.vishatech.erp.repository.CprRepository;
import com.vishatech.erp.repository.CprTechnicalVerificationDocumentRepository;
import com.vishatech.erp.repository.CprTechnicalVerificationRepository;
import com.vishatech.erp.crm.repository.CustomerRepository;
import com.vishatech.erp.repository.EditHistoryRepository;
import com.vishatech.erp.util.AuditContext;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationContext;

/**
 * Unit tests for the Technical Verification STATUS transition behind the
 * "Verified" action on the CPR Technical Verification page
 * ({@code CprTechnicalVerificationService#updateStatus} with
 * {@code VERIFICATION_COMPLETED}).
 *
 * <p>These pin the contract the frontend button relies on:
 *
 * <ol>
 *   <li>a record that is currently {@code UNDER_VERIFICATION} can be verified, and
 *       the transition persists the status plus the audit fields
 *       ({@code verifiedBy} / {@code verificationDate});</li>
 *   <li>the transition is accepted from that state only — every other state is
 *       rejected, so repeating the action (idempotency) or verifying an
 *       unverified draft never writes anything;</li>
 *   <li>only the record addressed by the request is touched; a sibling record is
 *       never modified;</li>
 *   <li>the change is recorded in the shared ERP edit history;</li>
 *   <li>the pre-existing gate that a technical file must be available before
 *       verification can start is untouched.</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class CprTechnicalVerificationStatusTests {

    private static final Long TV_ID = 9L;

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
    @Mock
    private EditHistoryRepository editHistoryRepository;

    private CprTechnicalVerificationService service;

    @BeforeEach
    void setUp() {
        service = new CprTechnicalVerificationService(
                tvRepository, docRepository, cprRepository, cprItemRepository, fileStorageService,
                documentRepositoryService, costWorkoutRepository, costWorkoutService,
                purchaseRequisitionIngressPort, customerRepository, auditContext,
                "http://localhost:8080");
        lenient().when(auditContext.currentUserName()).thenReturn("Admin User");
        // The service continues with the value returned by save(); the mocked
        // repository echoes the entity it was handed, like JPA does.
        lenient().when(tvRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        // updateStatus records its change through EditHistoryService, which is
        // reached through the static SpringContext holder in production. Wire the
        // REAL service (so the real diff/version logic runs) over a mocked
        // repository, which keeps the test free of a database.
        ApplicationContext context = mock(ApplicationContext.class);
        when(context.getBean(EditHistoryService.class))
                .thenReturn(new EditHistoryService(editHistoryRepository));
        new SpringContext().setApplicationContext(context);
    }

    @AfterEach
    void tearDown() {
        // Never leak the fake context into other test classes in the same JVM.
        new SpringContext().setApplicationContext(null);
    }

    // ---------------------------------------------------------------- fixtures

    private CprTechnicalVerification stubRow(Long id, String tvNo, TechnicalVerificationStatus status,
                                             String fileStatus) {
        Cpr cpr = new Cpr();
        cpr.setId(27L);
        cpr.setPrNo("CPR-2026-000024(2)");
        cpr.setDepartment("Sales");
        cpr.setRequestedBy("Admin User");
        cpr.setClientName("Apex Industries");
        cpr.setCompany("Apex Industries");

        CprTechnicalVerification tv = new CprTechnicalVerification();
        tv.setId(id);
        tv.setTvNo(tvNo);
        tv.setCpr(cpr);
        tv.setCprItemId(35L);
        tv.setItemDescription("Row One Item");
        tv.setDivision("TEAM");
        tv.setFileStatus(fileStatus);
        tv.setStatus(status);

        lenient().when(tvRepository.findById(id)).thenReturn(Optional.of(tv));
        return tv;
    }

    private CprTechnicalVerification capturedSavedRow() {
        ArgumentCaptor<CprTechnicalVerification> saved =
                ArgumentCaptor.forClass(CprTechnicalVerification.class);
        verify(tvRepository, times(1)).save(saved.capture());
        return saved.getValue();
    }

    // ------------------------------------------------- UNDER_VERIFICATION -> VERIFIED

    @Test
    void verifyingAnUnderVerificationRecordPersistsStatusAndAuditFields() {
        CprTechnicalVerification tv = stubRow(TV_ID, "TV-2026-0007",
                TechnicalVerificationStatus.UNDER_VERIFICATION, "AVAILABLE");

        TechnicalVerificationResponse response =
                service.updateStatus(TV_ID, "VERIFICATION_COMPLETED", null);

        assertThat(response.status()).isEqualTo("VERIFICATION_COMPLETED");
        assertThat(response.id()).isEqualTo(TV_ID);

        CprTechnicalVerification saved = capturedSavedRow();
        assertThat(saved).isSameAs(tv);
        assertThat(saved.getStatus()).isEqualTo(TechnicalVerificationStatus.VERIFICATION_COMPLETED);
        assertThat(saved.getVerifiedBy()).isEqualTo("Admin User");
        assertThat(saved.getVerificationDate()).isEqualTo(LocalDate.now());
    }

    @Test
    void verificationIsRecordedInTheSharedEditHistory() {
        stubRow(TV_ID, "TV-2026-0007", TechnicalVerificationStatus.UNDER_VERIFICATION, "AVAILABLE");

        service.updateStatus(TV_ID, "VERIFICATION_COMPLETED", null);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<EditHistory>> rows = ArgumentCaptor.forClass(List.class);
        verify(editHistoryRepository).saveAll(rows.capture());
        assertThat(rows.getValue())
                .anySatisfy(row -> {
                    assertThat(row.getField()).isEqualTo("status");
                    assertThat(row.getOldValue()).isEqualTo("UNDER_VERIFICATION");
                    assertThat(row.getNewValue()).isEqualTo("VERIFICATION_COMPLETED");
                    assertThat(row.getRecordId()).isEqualTo(TV_ID);
                });
    }

    // ------------------------------------------------- invalid / repeat attempts

    @Test
    void verifyingIsRejectedFromEveryStateOtherThanUnderVerification() {
        for (TechnicalVerificationStatus state : new TechnicalVerificationStatus[] {
                TechnicalVerificationStatus.DRAFT,
                TechnicalVerificationStatus.PENDING_FILE,
                TechnicalVerificationStatus.REJECTED,
                TechnicalVerificationStatus.APPROVED,
                TechnicalVerificationStatus.FORWARDED_TO_COST_WORKOUT }) {
            CprTechnicalVerification tv = stubRow(TV_ID, "TV-2026-0007", state, "AVAILABLE");

            assertThatThrownBy(() -> service.updateStatus(TV_ID, "VERIFICATION_COMPLETED", null))
                    .isInstanceOf(BadRequestException.class)
                    .hasMessageContaining("Only records under verification can be accepted");

            // The record keeps its original status and nothing is written.
            assertThat(tv.getStatus()).isEqualTo(state);
            assertThat(tv.getVerifiedBy()).isNull();
            assertThat(tv.getVerificationDate()).isNull();
        }
        verify(tvRepository, never()).save(any());
        verify(editHistoryRepository, never()).saveAll(any());
    }

    @Test
    void repeatingVerificationOnAnAlreadyVerifiedRecordChangesNothing() {
        CprTechnicalVerification tv = stubRow(TV_ID, "TV-2026-0007",
                TechnicalVerificationStatus.VERIFICATION_COMPLETED, "AVAILABLE");

        assertThatThrownBy(() -> service.updateStatus(TV_ID, "VERIFICATION_COMPLETED", null))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Only records under verification can be accepted");

        assertThat(tv.getStatus()).isEqualTo(TechnicalVerificationStatus.VERIFICATION_COMPLETED);
        verify(tvRepository, never()).save(any());
        verify(editHistoryRepository, never()).saveAll(any());
    }

    // ------------------------------------------------- record scoping & file gate

    @Test
    void verifyingOneRecordLeavesItsSiblingUntouched() {
        CprTechnicalVerification target = stubRow(TV_ID, "TV-2026-0007",
                TechnicalVerificationStatus.UNDER_VERIFICATION, "AVAILABLE");
        CprTechnicalVerification sibling = stubRow(8L, "TV-2026-0006",
                TechnicalVerificationStatus.DRAFT, "AVAILABLE");

        service.updateStatus(TV_ID, "VERIFICATION_COMPLETED", null);

        // Exactly one row is written, and it is the addressed one.
        CprTechnicalVerification saved = capturedSavedRow();
        assertThat(saved).isSameAs(target);
        assertThat(saved.getTvNo()).isEqualTo("TV-2026-0007");
        assertThat(sibling.getStatus()).isEqualTo(TechnicalVerificationStatus.DRAFT);
        assertThat(sibling.getVerifiedBy()).isNull();
        assertThat(sibling.getVerificationDate()).isNull();
    }

    @Test
    void startingVerificationStillRequiresAnAvailableFile() {
        CprTechnicalVerification tv = stubRow(TV_ID, "TV-2026-0007",
                TechnicalVerificationStatus.DRAFT, "MISSING");

        assertThatThrownBy(() -> service.updateStatus(TV_ID, "UNDER_VERIFICATION", null))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("A technical file must be available before verification can start");

        assertThat(tv.getStatus()).isEqualTo(TechnicalVerificationStatus.DRAFT);
        verify(tvRepository, never()).save(any());
    }
}
