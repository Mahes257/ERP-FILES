package com.vishatech.erp.service.production;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.vishatech.erp.dto.production.PagedResponse;
import com.vishatech.erp.dto.production.ProductionOrderDTO;
import com.vishatech.erp.repository.production.ProductionOrderRepository;
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
import org.springframework.data.domain.Pageable;

/**
 * Unit tests for the Work Order list paging contract
 * ({@code ProductionOrderService#getOrders} → {@code GET /production-orders}).
 *
 * <p>The Production Orders screen must be able to page safely: whatever page
 * and size a caller asks for, the service clamps them (page ≥ 0, 1 ≤ size ≤
 * 100) before touching the database, and the response always reports
 * totalElements / totalPages for the filtered set.
 */
@ExtendWith(MockitoExtension.class)
class ProductionOrderPagingTests {

    private static final int MAX_PAGE_SIZE = 100;

    @Mock
    private ProductionOrderRepository orderRepository;

    @InjectMocks
    private ProductionOrderService productionOrderService;

    /** Echo the requested Pageable back, exactly like Spring Data does. */
    private void stubEmptyPage() {
        when(orderRepository.searchOrders(
                ArgumentMatchers.<String>any(), any(Pageable.class)))
                .thenAnswer(invocation -> {
                    Pageable requested = invocation.getArgument(1);
                    return new PageImpl<>(List.of(), requested, 0);
                });
    }

    private PagedResponse<ProductionOrderDTO> list(int page, int size) {
        return productionOrderService.getOrders(
                null, null, null, null, null, null,
                null, null, null, null,
                page, size, null, null);
    }

    private Pageable capturedPageable() {
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(orderRepository, times(1)).searchOrders(ArgumentMatchers.<String>any(), pageable.capture());
        return pageable.getValue();
    }

    @Test
    void pageSizeIsClampedToTheMaximum() {
        stubEmptyPage();

        PagedResponse<ProductionOrderDTO> response = list(0, 5000);

        assertThat(capturedPageable().getPageSize()).isEqualTo(MAX_PAGE_SIZE);
        assertThat(response.getSize()).isEqualTo(MAX_PAGE_SIZE);
    }

    @Test
    void theMaximumPageSizeIsStillHonouredExactly() {
        stubEmptyPage();

        PagedResponse<ProductionOrderDTO> response = list(0, MAX_PAGE_SIZE);

        assertThat(capturedPageable().getPageSize()).isEqualTo(MAX_PAGE_SIZE);
        assertThat(response.getSize()).isEqualTo(MAX_PAGE_SIZE);
    }

    @Test
    void aDefaultSizedPageIsPassedThroughUnchanged() {
        stubEmptyPage();

        PagedResponse<ProductionOrderDTO> response = list(0, 25);

        assertThat(capturedPageable().getPageSize()).isEqualTo(25);
        assertThat(response.getSize()).isEqualTo(25);
    }

    @Test
    void invalidPageSizesFallBackToOne() {
        stubEmptyPage();

        assertThat(list(0, 0).getSize()).isEqualTo(1);
        assertThat(list(0, -10).getSize()).isEqualTo(1);
    }

    @Test
    void negativePageNumbersAreClampedToTheFirstPage() {
        stubEmptyPage();

        PagedResponse<ProductionOrderDTO> response = list(-3, 25);

        assertThat(capturedPageable().getPageNumber()).isZero();
        assertThat(response.getPage()).isZero();
    }

    @Test
    void laterPagesAreRequestedAtTheRightOffset() {
        stubEmptyPage();

        productionOrderService.getOrders(
                null, null, null, null, null, null,
                null, null, null, null,
                3, 25, null, null);

        Pageable requested = capturedPageable();
        assertThat(requested.getPageNumber()).isEqualTo(3);
        assertThat(requested.getOffset()).isEqualTo(75);
    }

    @Test
    void anEmptyResultIsReportedAsAnEmptyFirstAndLastPage() {
        stubEmptyPage();

        PagedResponse<ProductionOrderDTO> response = list(0, 25);

        assertThat(response.getContent()).isEmpty();
        assertThat(response.getTotalElements()).isZero();
        assertThat(response.getTotalPages()).isZero();
        assertThat(response.isFirst()).isTrue();
        assertThat(response.isLast()).isTrue();
    }
}
