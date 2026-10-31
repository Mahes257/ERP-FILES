package com.vishatech.erp.production;

import static org.assertj.core.api.Assertions.assertThat;

import com.vishatech.erp.dto.production.CreateProductionOrderRequest;
import com.vishatech.erp.dto.production.ProductionOrderDTO;
import com.vishatech.erp.dto.production.UpdateProductionOrderRequest;
import com.vishatech.erp.entity.SalesOrder;
import com.vishatech.erp.entity.production.OrderStatus;
import com.vishatech.erp.entity.production.Priority;
import com.vishatech.erp.entity.production.ProductionOrder;
import com.vishatech.erp.repository.SalesOrderRepository;
import com.vishatech.erp.repository.production.ProductionOrderRepository;
import com.vishatech.erp.sales.api.SalesOrderLookupPort;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.service.production.ProductionOrderService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * P6 — Work Order → CPO resolution through the published Sales port.
 *
 * <p>The resolution rules were contractual before the port existed and must not
 * change with it, so every branch is pinned here against a REAL database (H2 in
 * MySQL mode, real JPA, the real Spring wiring of the Sales adapter — no mocks):
 *
 * <ul>
 *   <li>a numeric CPO id resolves to the Sales Order's real primary key, number
 *       and customer, and auto-fills customer/customer code when the client left
 *       them blank;</li>
 *   <li>a legacy client that sent the SO number in the id field still resolves
 *       (that fallback is why the field is a {@code String});</li>
 *   <li>the SO number sent on its own resolves too;</li>
 *   <li>an unknown reference — numeric or not — is kept exactly as sent, because
 *       the reference is optional and must never fail the request;</li>
 *   <li>editing a Draft Work Order re-resolves the reference the same way.</li>
 * </ul>
 *
 * <p>The class also asserts the port resolves real rows in the running context,
 * which is what proves {@code sales.api.SalesOrderLookupAdapter} replaced the
 * Production service's former {@code SalesOrderRepository} dependency and not just
 * its compile-time signature.
 */
@SpringBootTest
class ProductionOrderCpoResolutionIntegrationTests extends AbstractSecurityTest {

    private static final long UNKNOWN_CPO_ID = 9_000_000_000L;

    @Autowired
    private ProductionOrderService productionOrders;

    @Autowired
    private ProductionOrderRepository orderRepository;

    @Autowired
    private SalesOrderRepository salesOrderRepository;

    @Autowired
    private SalesOrderLookupPort salesOrderLookup;

    /** A real CPO row, seeded through Sales' own persistence. */
    private SalesOrder seedCpo(String clientName, Long clientId, LocalDateTime orderDate) {
        SalesOrder cpo = new SalesOrder();
        cpo.setSoNo("SO-P6-" + Long.toString(System.nanoTime(), 36));
        cpo.setClientName(clientName);
        cpo.setClientId(clientId);
        cpo.setOrderDate(orderDate);
        return salesOrderRepository.save(cpo);
    }

    private ProductionOrderDTO createOrder(String salesOrderId, String salesOrderNumber,
                                           String customer, String customerCode) {
        CreateProductionOrderRequest request = CreateProductionOrderRequest.builder()
                .salesOrderId(salesOrderId)
                .salesOrderNumber(salesOrderNumber)
                .customer(customer)
                .customerCode(customerCode)
                .startDate(LocalDate.now())
                .dueDate(LocalDate.now().plusDays(10))
                .priority("Medium")
                .items(List.of(CreateProductionOrderRequest.CreateOrderItemRequest.builder()
                        .productName("CPO port product")
                        .productionType("Casting")
                        .quantity(3)
                        .build()))
                .build();
        return productionOrders.createOrder(request, "cpo-port-test");
    }

    // ------------------------------------------------------------------
    // The published port itself
    // ------------------------------------------------------------------

    @Test
    void thePublishedPortResolvesRealRowsInTheRunningContext() {
        SalesOrder cpo = seedCpo("Port Wiring Industries", 1234L,
                LocalDateTime.of(2026, 2, 3, 11, 45));

        SalesOrderLookupPort.SalesOrderRef byId = salesOrderLookup.findById(cpo.getId()).orElseThrow();
        SalesOrderLookupPort.SalesOrderRef bySoNo = salesOrderLookup.findBySoNo(cpo.getSoNo()).orElseThrow();

        assertThat(byId).isEqualTo(bySoNo);
        assertThat(byId.soNo()).isEqualTo(cpo.getSoNo());
        assertThat(byId.clientName()).isEqualTo("Port Wiring Industries");
        assertThat(byId.clientId()).isEqualTo(1234L);
        assertThat(byId.orderDate()).isEqualTo(LocalDateTime.of(2026, 2, 3, 11, 45));
        assertThat(salesOrderLookup.findById(UNKNOWN_CPO_ID)).isEmpty();
    }

    // ------------------------------------------------------------------
    // createOrder
    // ------------------------------------------------------------------

    @Test
    void aNumericCpoIdStoresTheRealPrimaryKeyAndAutoFillsTheCustomer() {
        SalesOrder cpo = seedCpo("Acme Industries", 4242L, LocalDateTime.of(2026, 1, 5, 10, 30));

        ProductionOrderDTO created = createOrder(String.valueOf(cpo.getId()), null, null, null);

        assertThat(created.getSalesOrderId()).isEqualTo(String.valueOf(cpo.getId()));
        assertThat(created.getSalesOrderNumber()).isEqualTo(cpo.getSoNo());
        assertThat(created.getCustomer()).isEqualTo("Acme Industries");
        assertThat(created.getCustomerCode()).isEqualTo("4242");
    }

    @Test
    void aCustomerSuppliedByTheClientIsNeverOverwrittenByTheCpo() {
        SalesOrder cpo = seedCpo("Acme Industries", 4242L, LocalDateTime.of(2026, 1, 5, 10, 30));

        ProductionOrderDTO created = createOrder(
                String.valueOf(cpo.getId()), null, "Client Supplied Customer", "CUST-9");

        assertThat(created.getCustomer()).isEqualTo("Client Supplied Customer");
        assertThat(created.getCustomerCode()).isEqualTo("CUST-9");
        // …while the CPO reference itself is still resolved to the real key.
        assertThat(created.getSalesOrderId()).isEqualTo(String.valueOf(cpo.getId()));
    }

    @Test
    void aLegacyClientSendingTheSoNumberInTheIdFieldStillResolves() {
        SalesOrder cpo = seedCpo("Legacy Industries", 555L, LocalDateTime.of(2025, 12, 1, 8, 0));

        ProductionOrderDTO created = createOrder(cpo.getSoNo(), null, null, null);

        assertThat(created.getSalesOrderId()).isEqualTo(String.valueOf(cpo.getId()));
        assertThat(created.getSalesOrderNumber()).isEqualTo(cpo.getSoNo());
        assertThat(created.getCustomer()).isEqualTo("Legacy Industries");
    }

    @Test
    void theSalesOrderNumberFieldAloneAlsoResolves() {
        SalesOrder cpo = seedCpo("Number Field Industries", null, LocalDateTime.of(2025, 11, 2, 8, 0));

        ProductionOrderDTO created = createOrder(null, cpo.getSoNo(), null, null);

        assertThat(created.getSalesOrderId()).isEqualTo(String.valueOf(cpo.getId()));
        assertThat(created.getSalesOrderNumber()).isEqualTo(cpo.getSoNo());
        assertThat(created.getCustomer()).isEqualTo("Number Field Industries");
        // The CPO has no customer id, so the code stays absent instead of "null".
        assertThat(created.getCustomerCode()).isNull();
    }

    @Test
    void anUnknownNumericReferenceIsKeptExactlyAsSent() {
        String unknownSoNo = "SO-P6-" + Long.toString(System.nanoTime(), 36);

        ProductionOrderDTO created = createOrder(String.valueOf(UNKNOWN_CPO_ID), unknownSoNo, null, null);

        assertThat(created.getSalesOrderId()).isEqualTo(String.valueOf(UNKNOWN_CPO_ID));
        assertThat(created.getSalesOrderNumber()).isEqualTo(unknownSoNo);
        assertThat(created.getCustomer()).isNull();
    }

    @Test
    void aNonNumericUnknownReferenceKeepsTheNumberFallbackBehavior() {
        String unknownSoNo = "SO-P6-" + Long.toString(System.nanoTime(), 36);

        ProductionOrderDTO created = createOrder("SO-NOT-A-NUMBER", unknownSoNo, null, null);

        assertThat(created.getSalesOrderId()).isEqualTo("SO-NOT-A-NUMBER");
        assertThat(created.getSalesOrderNumber()).isEqualTo(unknownSoNo);
    }

    // ------------------------------------------------------------------
    // updateOrder
    // ------------------------------------------------------------------

    @Test
    void editingADraftWorkOrderReResolvesTheCpoReference() {
        SalesOrder cpo = seedCpo("Draft Edit Industries", 71L, LocalDateTime.of(2026, 4, 4, 9, 0));
        ProductionOrder draft = orderRepository.save(ProductionOrder.builder()
                .workOrder("WO-" + Long.toString(System.nanoTime(), 36))
                .department("Casting")
                .status(OrderStatus.DRAFT)
                .priority(Priority.MEDIUM)
                .startDate(LocalDate.now())
                .dueDate(LocalDate.now().plusDays(7))
                .quantity(1)
                .progress(0)
                .build());

        ProductionOrderDTO updated = productionOrders.updateOrder(draft.getId(),
                UpdateProductionOrderRequest.builder().salesOrderNumber(cpo.getSoNo()).build());

        assertThat(updated.getSalesOrderId()).isEqualTo(String.valueOf(cpo.getId()));
        assertThat(updated.getSalesOrderNumber()).isEqualTo(cpo.getSoNo());
    }

    @Test
    void editingWithoutACpoReferenceLeavesTheStoredReferenceAlone() {
        SalesOrder cpo = seedCpo("Untouched Industries", 72L, LocalDateTime.of(2026, 4, 5, 9, 0));
        ProductionOrder draft = orderRepository.save(ProductionOrder.builder()
                .workOrder("WO-" + Long.toString(System.nanoTime(), 36))
                .department("Casting")
                .salesOrderId(String.valueOf(cpo.getId()))
                .salesOrderNumber(cpo.getSoNo())
                .status(OrderStatus.DRAFT)
                .priority(Priority.MEDIUM)
                .startDate(LocalDate.now())
                .dueDate(LocalDate.now().plusDays(7))
                .quantity(1)
                .progress(0)
                .build());

        ProductionOrderDTO updated = productionOrders.updateOrder(draft.getId(),
                UpdateProductionOrderRequest.builder().remarks("no cpo reference in this edit").build());

        assertThat(updated.getSalesOrderId()).isEqualTo(String.valueOf(cpo.getId()));
        assertThat(updated.getSalesOrderNumber()).isEqualTo(cpo.getSoNo());
    }
}
