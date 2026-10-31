package com.vishatech.erp.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;

import com.vishatech.erp.dto.SalesOrderNextNumberResponse;
import com.vishatech.erp.repository.SalesOrderRepository;
import java.time.Year;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.InjectMocks;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Regression tests for Customer Purchase Order document numbering.
 *
 * <p>A CPO can be born in four different places — the CPO form itself, a
 * Quotation conversion, a Sales Contract conversion and a Proforma Invoice
 * conversion — and each one used to own a private counter with its own format.
 * That produced two user-visible defects in the CPO list, which shows every row
 * as one numbered series:
 *
 * <ol>
 *   <li><b>Ragged width</b> — the conversion paths emitted {@code CPO-2026-00003}
 *       (5 digits) while the form and the legacy rows emitted
 *       {@code CPO-2026-000001} (6 digits), so the same series rendered as
 *       {@code CPO-2026-00003} next to {@code CPO-2026-000001}. The form's own
 *       placeholder is {@code CPO-YYYY-XXXXXX}.</li>
 *   <li><b>Split sequence</b> — stored legacy rows still read
 *       {@code SO-2026-000NNNNNN} (the frontend only renames them to {@code CPO-}
 *       for display), and the form's generator counted a different prefix than the
 *       conversion paths. Two generators could therefore hand out the same number
 *       twice — a stored {@code SO-2026-000004} and a generated
 *       {@code CPO-2026-00004} both display as CPO number 4, and once the width
 *       is aligned they collide as the same visible string.</li>
 * </ol>
 *
 * <p>These tests pin the contract that fixes both: every path scans the
 * {@code CPO-} <em>and</em> legacy {@code SO-} prefixes of the current year and
 * always answers {@code CPO-YYYY-NNNNNN}; and every path agrees on the next
 * number for the same data, so the series can never drift or repeat.
 */
@ExtendWith(MockitoExtension.class)
class SalesDocumentNumberSequenceTests {

    /** Canonical format every path must produce: prefix, 4-digit year, 6-digit sequence. */
    private static final String CANONICAL_CPO = "CPO-" + Year.now().getValue() + "-\\d{6}";

    @Mock
    private SalesOrderRepository salesOrderRepository;

    @InjectMocks
    private SalesOrderService salesOrderService;

    @InjectMocks
    private QuotationService quotationService;

    @InjectMocks
    private SalesContractService salesContractService;

    @InjectMocks
    private ProformaInvoiceService proformaInvoiceService;

    @BeforeEach
    void stubExistingNumbers() {
        // The real production data this defect was found on: one legacy SO- row
        // (stored prefix) plus two conversion-created CPO- rows, the older of which
        // was written with the old 5-digit padding.
        lenient().when(salesOrderRepository.findAllSoNos())
                .thenReturn(List.of("SO-2026-000001", "CPO-2026-00002", "CPO-2026-00003"));
        lenient().when(salesOrderRepository.count()).thenReturn(3L);
    }

    /**
     * Runs a conversion service's (private) CPO number builder against the stubbed
     * repository, bypassing the heavy document-conversion pipeline it sits under.
     * The number allocation itself is what these tests pin.
     */
    private String nextCpoFrom(Object service) {
        Object number = ReflectionTestUtils.invokeMethod(service, "buildSoNumber");
        return String.valueOf(number);
    }

    @Test
    void formNextNumberIsCanonicalCpoFormat() {
        SalesOrderNextNumberResponse next = salesOrderService.getNextNumber();

        assertThat(next.soNo()).matches(CANONICAL_CPO);
        assertThat(next.soNo()).isEqualTo("CPO-" + Year.now().getValue() + "-000004");
    }

    @Test
    void everyCreationPathProducesTheCanonicalCpoFormat() {
        assertThat(nextCpoFrom(quotationService)).matches(CANONICAL_CPO);
        assertThat(nextCpoFrom(salesContractService)).matches(CANONICAL_CPO);
        assertThat(nextCpoFrom(proformaInvoiceService)).matches(CANONICAL_CPO);
    }

    @Test
    void noPathEmitsTheLegacySoPrefixAnyMore() {
        // A stored SO- row must never be echoed back out as a new CPO number; the
        // prefix is what made the form and the conversion paths drift apart.
        assertThat(nextCpoFrom(proformaInvoiceService)).startsWith("CPO-");
        assertThat(nextCpoFrom(quotationService)).startsWith("CPO-");
        assertThat(nextCpoFrom(salesContractService)).startsWith("CPO-");
        assertThat(salesOrderService.getNextNumber().soNo()).startsWith("CPO-");
    }

    @Test
    void allPathsAgreeOnTheSameNextNumberForTheSameData() {
        // One shared sequence. If any generator ignored a prefix this diverges.
        String fromForm = salesOrderService.getNextNumber().soNo();
        String fromQuotation = nextCpoFrom(quotationService);
        String fromContract = nextCpoFrom(salesContractService);
        String fromProforma = nextCpoFrom(proformaInvoiceService);

        assertThat(fromQuotation).isEqualTo(fromForm);
        assertThat(fromContract).isEqualTo(fromForm);
        assertThat(fromProforma).isEqualTo(fromForm);
    }

    @Test
    void aLegacySoRowStillBlocksItsNumberFromBeingReissued() {
        // Highest suffix lives on a legacy SO- row, and no CPO- row is close to it.
        // The new number must clear the legacy sequence, otherwise a stored
        // SO-2026-000009 and a fresh CPO-2026-000009 would both render as CPO 9.
        lenient().when(salesOrderRepository.findAllSoNos())
                .thenReturn(List.of("SO-2026-000009", "CPO-2026-00001"));
        lenient().when(salesOrderRepository.count()).thenReturn(2L);

        String fromForm = salesOrderService.getNextNumber().soNo();
        String fromQuotation = nextCpoFrom(quotationService);

        assertThat(fromForm).isEqualTo("CPO-" + Year.now().getValue() + "-000010");
        assertThat(fromQuotation).isEqualTo(fromForm);
    }

    @Test
    void proposedNumberIsNotAlreadyInUseWhenDisplayedCanonically() {
        // The list shows legacy SO- rows as CPO- (display-only rename), so the
        // comparison has to be made on the displayed form, not the stored form.
        String proposed = salesOrderService.getNextNumber().soNo();

        for (String existing : List.of("SO-2026-000001", "CPO-2026-00002", "CPO-2026-00003")) {
            String displayed = existing.startsWith("SO-")
                    ? "CPO-" + existing.substring(3)
                    : existing;
            assertThat(displayed).isNotEqualTo(proposed);
        }
    }

    @Test
    void otherYearsDoNotConsumeTheCurrentYearSequence() {
        // Only the current year's numbers share the sequence; a 2025 CPO must not
        // push this year's counter forward.
        lenient().when(salesOrderRepository.findAllSoNos())
                .thenReturn(List.of("CPO-2025-000500", "CPO-2026-000002"));
        lenient().when(salesOrderRepository.count()).thenReturn(2L);

        assertThat(salesOrderService.getNextNumber().soNo())
                .isEqualTo("CPO-" + Year.now().getValue() + "-000003");
    }

    @Test
    void malformedNumbersAreIgnoredRatherThanBreakingNumbering() {
        lenient().when(salesOrderRepository.findAllSoNos())
                .thenReturn(List.of("SO-2026-000001", "CPO-2026-NOTANUMBER", "CPO-2026-00004"));
        lenient().when(salesOrderRepository.count()).thenReturn(3L);

        assertThat(salesOrderService.getNextNumber().soNo())
                .isEqualTo("CPO-" + Year.now().getValue() + "-000005");
    }
}
