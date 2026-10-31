package com.vishatech.erp.sales.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import com.vishatech.erp.entity.SalesOrder;
import com.vishatech.erp.repository.SalesOrderRepository;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * P6 — the published Sales Order lookup contract.
 *
 * <p>{@link SalesOrderLookupPort} is the only Sales surface Production may depend
 * on, so its semantics have to be pinned where they cannot drift from the
 * repository they replaced: an exact primary-key lookup, an exact SO-number
 * lookup, an empty result when nothing matches, and a value mapper that carries
 * every field the callers used to read off the entity. The mapper is the part a
 * refactor can silently break — Production reads the number, the customer, the
 * customer id and the order date — so each one is asserted by name here.
 */
@ExtendWith(MockitoExtension.class)
class SalesOrderLookupAdapterTests {

    @Mock
    private SalesOrderRepository salesOrderRepository;

    @InjectMocks
    private SalesOrderLookupAdapter adapter;

    private static SalesOrder order() {
        SalesOrder order = new SalesOrder();
        order.setId(4711L);
        order.setSoNo("SO-2026-000471");
        order.setClientId(88L);
        order.setClientName("Acme Industries");
        order.setOrderDate(LocalDateTime.of(2026, 3, 4, 9, 15));
        return order;
    }

    @Test
    void findByIdPublishesEveryFieldTheCallersRead() {
        when(salesOrderRepository.findById(4711L)).thenReturn(Optional.of(order()));

        SalesOrderLookupPort.SalesOrderRef ref = adapter.findById(4711L).orElseThrow();

        assertThat(ref.id()).isEqualTo(4711L);
        assertThat(ref.soNo()).isEqualTo("SO-2026-000471");
        assertThat(ref.clientId()).isEqualTo(88L);
        assertThat(ref.clientName()).isEqualTo("Acme Industries");
        assertThat(ref.orderDate()).isEqualTo(LocalDateTime.of(2026, 3, 4, 9, 15));
    }

    @Test
    void findBySoNoPublishesEveryFieldTheCallersRead() {
        when(salesOrderRepository.findBySoNo("SO-2026-000471")).thenReturn(Optional.of(order()));

        SalesOrderLookupPort.SalesOrderRef ref = adapter.findBySoNo("SO-2026-000471").orElseThrow();

        assertThat(ref.id()).isEqualTo(4711L);
        assertThat(ref.soNo()).isEqualTo("SO-2026-000471");
        assertThat(ref.clientName()).isEqualTo("Acme Industries");
    }

    @Test
    void anUnsetFieldStaysNullRatherThanBeingInvented() {
        SalesOrder bare = new SalesOrder();
        bare.setId(7L);
        bare.setSoNo("SO-2026-000007");
        when(salesOrderRepository.findById(7L)).thenReturn(Optional.of(bare));

        SalesOrderLookupPort.SalesOrderRef ref = adapter.findById(7L).orElseThrow();

        assertThat(ref.clientId()).isNull();
        assertThat(ref.clientName()).isNull();
        assertThat(ref.orderDate()).isNull();
    }

    @Test
    void anUnknownReferenceIsEmptyRatherThanAnError() {
        when(salesOrderRepository.findById(999L)).thenReturn(Optional.empty());
        when(salesOrderRepository.findBySoNo("SO-UNKNOWN")).thenReturn(Optional.empty());

        assertThat(adapter.findById(999L)).isEmpty();
        assertThat(adapter.findBySoNo("SO-UNKNOWN")).isEmpty();
    }

    @Test
    void theLookupIsExactAndNeverNormalisesTheReference() {
        when(salesOrderRepository.findBySoNo(" so-2026-000471 ")).thenReturn(Optional.empty());

        assertThat(adapter.findBySoNo(" so-2026-000471 ")).isEmpty();

        // The reference reaches the repository byte-for-byte: no trim, no case fold.
        verify(salesOrderRepository).findBySoNo(" so-2026-000471 ");
        verifyNoMoreInteractions(salesOrderRepository);
    }

    @Test
    void aMissingReferenceNeverReachesTheDatabase() {
        assertThat(adapter.findById(null)).isEmpty();
        assertThat(adapter.findBySoNo(null)).isEmpty();

        verify(salesOrderRepository, never()).findById(org.mockito.ArgumentMatchers.any());
        verify(salesOrderRepository, never()).findBySoNo(org.mockito.ArgumentMatchers.anyString());
    }
}
