package com.vishatech.erp.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.vishatech.erp.entity.Quotation;
import com.vishatech.erp.entity.SalesOrder;
import com.vishatech.erp.crm.repository.FollowUpRepository;
import com.vishatech.erp.repository.QuotationRepository;
import com.vishatech.erp.repository.SalesHistoryRepository;
import com.vishatech.erp.repository.SalesOrderRepository;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.InjectMocks;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Regression tests for the Quotation list's <em>PO Status</em> cell.
 *
 * <p>Editing a quotation creates a revision row whose {@code quotation_no} carries
 * a revision suffix ({@code QTN-2026-000002(1)}). Two things then disagreed:
 *
 * <ul>
 *   <li>the list keys a row by its <b>chain original</b> number, because that is
 *       what the PO Status filter and every linked-document screen match on;</li>
 *   <li>the Quotation → Customer Purchase Order conversion stored the
 *       <b>converted row's own</b> number in {@code sales_orders.qtn_ref}.</li>
 * </ul>
 *
 * <p>A quotation that was edited before being converted therefore matched nothing
 * and rendered "Not Released" although its CPO existed — while the same record
 * matched fine through the PO Status filter, so the cell and the filter disagreed
 * about the same row. These tests pin the fix on both sides: the conversion now
 * records the chain original, and the list resolves a legacy suffixed reference
 * back onto its chain original in one batched query.
 */
@ExtendWith(MockitoExtension.class)
class QuotationPoStatusLinkageTests {

    @Mock
    private QuotationRepository quotationRepository;

    @Mock
    private SalesOrderRepository salesOrderRepository;

    @Mock
    private FollowUpRepository followUpRepository;

    @Mock
    private SalesHistoryRepository historyRepository;

    @InjectMocks
    private QuotationService quotationService;

    private static Quotation quotation(Long id, String no, Long revisionOf, boolean latest) {
        Quotation q = new Quotation();
        q.setId(id);
        q.setQuotationNo(no);
        q.setRevisionOf(revisionOf);
        q.setLatestRevision(latest);
        return q;
    }

    private static SalesOrder cpo(Long id, String soNo, String qtnRef, String status) {
        SalesOrder o = new SalesOrder();
        o.setId(id);
        o.setSoNo(soNo);
        o.setQtnRef(qtnRef);
        o.setStatus(status);
        o.setLatestRevision(true);
        return o;
    }

    @SuppressWarnings("unchecked")
    private Map<Long, Object> summarize(List<Quotation> rows) {
        Object result = ReflectionTestUtils.invokeMethod(quotationService, "buildRowSummaries", rows);
        return (Map<Long, Object>) result;
    }

    private static Object field(Object summary, String name) {
        return ReflectionTestUtils.invokeMethod(summary, name);
    }

    @Test
    void aCpoConvertedFromARevisionRowIsStillShownOnTheQuotation() {
        // Page row is the revision; the CPO (created before the conversion stopped
        // recording revision-suffixed refs) points at the suffixed number.
        Quotation revision = quotation(8L, "QTN-2026-000002(1)", 7L, true);
        Quotation base = quotation(7L, "QTN-2026-000002", null, false);

        when(quotationRepository.findAllById(anyCollection())).thenReturn(List.of(base));
        when(quotationRepository.findByRevisionOfIn(anyCollection())).thenReturn(List.of(revision));
        when(salesOrderRepository.findCurrentByQtnRefIn(anyCollection()))
                .thenReturn(List.of(cpo(4L, "CPO-2026-00003", "QTN-2026-000002(1)", "draft")));
        when(followUpRepository.findActiveByQuotationIdIn(anyCollection())).thenReturn(List.of());
        when(historyRepository.findByModuleTypeAndModuleIdInOrderByCreatedAtAsc(anyString(), anyCollection()))
                .thenReturn(List.of());

        Map<Long, Object> summaries = summarize(List.of(revision));

        Object row = summaries.get(8L);
        assertThat(row).isNotNull();
        assertThat(field(row, "poStatus")).isEqualTo("released");
        assertThat(field(row, "poNo")).isEqualTo("CPO-2026-00003");
        assertThat(field(row, "poRawStatus")).isEqualTo("draft");

        // The matched CPO's own qtn_ref is the suffixed number, so the batched
        // lookup must actually ASK for it — matching in Java alone would not help
        // against the real database, which would never return that row.
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Collection<String>> requestedKeys = ArgumentCaptor.forClass(Collection.class);
        verify(salesOrderRepository).findCurrentByQtnRefIn(requestedKeys.capture());
        assertThat(requestedKeys.getValue())
                .contains("QTN-2026-000002", "QTN-2026-000002(1)");
    }

    @Test
    void aCpoReferencingTheChainNumberDirectlyStillMatches() {
        // The shape produced after the fix, and the shape of unedited quotations.
        Quotation plain = quotation(9L, "QTN-2026-000004", null, true);

        when(salesOrderRepository.findCurrentByQtnRefIn(anyCollection()))
                .thenReturn(List.of(cpo(6L, "CPO-2026-000005", "QTN-2026-000004", "draft")));
        when(followUpRepository.findActiveByQuotationIdIn(anyCollection())).thenReturn(List.of());
        when(historyRepository.findByModuleTypeAndModuleIdInOrderByCreatedAtAsc(anyString(), anyCollection()))
                .thenReturn(List.of());

        Map<Long, Object> summaries = summarize(List.of(plain));

        assertThat(field(summaries.get(9L), "poStatus")).isEqualTo("released");
        assertThat(field(summaries.get(9L), "poNo")).isEqualTo("CPO-2026-000005");
    }

    @Test
    void aQuotationWithNoCpoStillReportsNoPurchaseOrder() {
        Quotation plain = quotation(10L, "QTN-2026-000010", null, true);

        when(salesOrderRepository.findCurrentByQtnRefIn(anyCollection())).thenReturn(List.of());
        when(followUpRepository.findActiveByQuotationIdIn(anyCollection())).thenReturn(List.of());
        when(historyRepository.findByModuleTypeAndModuleIdInOrderByCreatedAtAsc(anyString(), anyCollection()))
                .thenReturn(List.of());

        Map<Long, Object> summaries = summarize(List.of(plain));

        assertThat(field(summaries.get(10L), "poStatus")).isNull();
        assertThat(field(summaries.get(10L), "poNo")).isNull();
    }

    @Test
    void revisionLookupIsBatchedOncePerPageNotOncePerRow() {
        Quotation first = quotation(8L, "QTN-2026-000002(1)", 7L, true);
        Quotation second = quotation(12L, "QTN-2026-000003(2)", 11L, true);
        Quotation firstBase = quotation(7L, "QTN-2026-000002", null, false);
        Quotation secondBase = quotation(11L, "QTN-2026-000003", null, false);

        when(quotationRepository.findAllById(anyCollection()))
                .thenReturn(List.of(firstBase, secondBase));
        when(quotationRepository.findByRevisionOfIn(anyCollection())).thenReturn(List.of(first, second));
        when(salesOrderRepository.findCurrentByQtnRefIn(anyCollection())).thenReturn(List.of());
        when(followUpRepository.findActiveByQuotationIdIn(anyCollection())).thenReturn(List.of());
        when(historyRepository.findByModuleTypeAndModuleIdInOrderByCreatedAtAsc(anyString(), anyCollection()))
                .thenReturn(List.of());

        summarize(List.of(first, second));

        verify(quotationRepository, times(1)).findByRevisionOfIn(anyCollection());
        verify(salesOrderRepository, times(1)).findCurrentByQtnRefIn(anyCollection());
    }

    @Test
    void convertingARevisionRowReferencesTheChainOriginalNumber() {
        Quotation revision = quotation(8L, "QTN-2026-000002(1)", 7L, true);
        Quotation base = quotation(7L, "QTN-2026-000002", null, false);
        when(quotationRepository.findById(7L)).thenReturn(java.util.Optional.of(base));

        Object ref = ReflectionTestUtils.invokeMethod(quotationService, "chainOriginalNo", revision);

        assertThat(ref).isEqualTo("QTN-2026-000002");
    }

    @Test
    void convertingANonRevisionRowKeepsItsOwnNumber() {
        Quotation plain = quotation(9L, "QTN-2026-000004", null, true);

        Object ref = ReflectionTestUtils.invokeMethod(quotationService, "chainOriginalNo", plain);

        assertThat(ref).isEqualTo("QTN-2026-000004");
    }
}
