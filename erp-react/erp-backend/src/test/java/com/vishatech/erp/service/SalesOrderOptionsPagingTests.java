package com.vishatech.erp.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.vishatech.erp.dto.SalesOrderOptionResponse;
import com.vishatech.erp.entity.SalesOrder;
import com.vishatech.erp.repository.SalesOrderRepository;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.ArgumentMatchers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;

/**
 * Unit tests for the slim CPO option feed
 * ({@code SalesOrderService#listOptions} / {@code GET /sales-orders/options}).
 *
 * <p>This endpoint exists so Production pickers stop walking every page of
 * {@code /sales-orders} (each row carrying items, attachments, timeline and
 * history). The tests pin the two properties that make that safe:
 *
 * <ol>
 *   <li>one request, one bounded page — the server decides the maximum, a
 *       client can never ask for an unbounded dump;</li>
 *   <li>one grouped item-count query — mapping option rows must not fall back
 *       to N lazy collection loads, and an empty page must not query at all.</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class SalesOrderOptionsPagingTests {

    /** Mirror of SalesOrderService.MAX_CPO_OPTIONS — the endpoint's hard cap. */
    private static final int CAP = 2000;

    @Mock
    private SalesOrderRepository salesOrderRepository;

    @InjectMocks
    private SalesOrderService salesOrderService;

    private static SalesOrder order(Long id, String soNo, Long clientId, String clientName, LocalDateTime orderDate) {
        SalesOrder order = new SalesOrder();
        order.setId(id);
        order.setSoNo(soNo);
        order.setClientId(clientId);
        order.setClientName(clientName);
        order.setOrderDate(orderDate);
        return order;
    }

    private void stubPage(Page<SalesOrder> page) {
        when(salesOrderRepository.findAll(
                ArgumentMatchers.<Specification<SalesOrder>>any(), any(Pageable.class)))
                .thenReturn(page);
    }

    @Test
    void optionFeedAsksForOneBoundedPageAndNeverMoreThanTheCap() {
        stubPage(new PageImpl<>(List.of()));

        salesOrderService.listOptions(null);

        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(salesOrderRepository, times(1)).findAll(
                ArgumentMatchers.<Specification<SalesOrder>>any(), pageable.capture());
        assertThat(pageable.getValue().getPageNumber()).isZero();
        assertThat(pageable.getValue().getPageSize()).isEqualTo(CAP);
    }

    @Test
    void optionFeedReturnsOnlyTheRowsOfThePageItRequested() {
        SalesOrder first = order(1L, "SO-2026-000001", 7L, "Acme Industries",
                LocalDateTime.of(2026, 1, 5, 10, 30));
        SalesOrder second = order(2L, "SO-2026-000002", null, null, null);
        stubPage(new PageImpl<>(List.of(first, second)));
        when(salesOrderRepository.countItemsByOrderIds(anyCollection()))
                .thenReturn(Collections.singletonList(new Object[] { 1L, 3L }));

        List<SalesOrderOptionResponse> options = salesOrderService.listOptions("acme");

        assertThat(options).hasSize(2);
        assertThat(options.get(0)).isEqualTo(
                new SalesOrderOptionResponse(1L, "SO-2026-000001", 7L, "Acme Industries", "2026-01-05", 3));
        // Orders absent from the grouped count simply have no items.
        assertThat(options.get(1).itemCount()).isZero();
        assertThat(options.get(1).clientId()).isNull();
        assertThat(options.get(1).clientName()).isNull();
        assertThat(options.get(1).orderDate()).isNull();
    }

    @Test
    void optionFeedCountsItemsInOneGroupedQueryForExactlyThePageIds() {
        SalesOrder first = order(11L, "SO-2026-000011", null, null, null);
        SalesOrder second = order(12L, "SO-2026-000012", null, null, null);
        stubPage(new PageImpl<>(List.of(first, second)));
        when(salesOrderRepository.countItemsByOrderIds(anyCollection()))
                .thenReturn(Collections.singletonList(new Object[] { 12L, 5L }));

        List<SalesOrderOptionResponse> options = salesOrderService.listOptions(null);

        ArgumentCaptor<java.util.Collection<Long>> ids = ArgumentCaptor.forClass(java.util.Collection.class);
        verify(salesOrderRepository, times(1)).countItemsByOrderIds(ids.capture());
        assertThat(ids.getValue()).containsExactly(11L, 12L);
        assertThat(options.get(0).itemCount()).isZero();
        assertThat(options.get(1).itemCount()).isEqualTo(5);
    }

    @Test
    void emptyResultSkipsTheCountQueryEntirely() {
        stubPage(new PageImpl<>(List.of()));

        assertThat(salesOrderService.listOptions(null)).isEmpty();

        verify(salesOrderRepository, never()).countItemsByOrderIds(anyCollection());
    }

    @Test
    void aTruncatedFeedStillReturnsAtMostTheCappedPage() {
        // 5 000 matching Sales Orders: the feed warns and serves only the caps' worth.
        stubPage(new PageImpl<>(List.of(order(1L, "SO-2026-000001", null, null, null)),
                PageRequest.of(0, CAP), 5000));
        when(salesOrderRepository.countItemsByOrderIds(anyCollection()))
                .thenReturn(Collections.singletonList(new Object[] { 1L, 1L }));

        assertThat(salesOrderService.listOptions(null)).hasSize(1);
    }

    @Test
    void searchTermIsForwardedToTheRepositoryQuery() {
        stubPage(new PageImpl<>(List.of()));

        // A search term must not turn into a second/looping request either.
        salesOrderService.listOptions("SO-2026-000042");

        verify(salesOrderRepository, times(1)).findAll(
                ArgumentMatchers.<Specification<SalesOrder>>any(), any(Pageable.class));
        verify(salesOrderRepository, never()).findBySoNo(anyString());
    }
}
