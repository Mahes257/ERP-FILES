package com.vishatech.erp.sales.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.vishatech.erp.dashboard.dto.SalesCounts;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.service.CreditNoteService;
import com.vishatech.erp.service.DeliveryChallanService;
import com.vishatech.erp.service.InvoiceService;
import com.vishatech.erp.service.PaymentReceiptService;
import com.vishatech.erp.service.ProformaInvoiceService;
import com.vishatech.erp.service.QuotationService;
import com.vishatech.erp.service.SalesContractService;
import com.vishatech.erp.service.SalesOrderService;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

/**
 * Equivalence tests for {@link SalesDashboardReadAdapter}: every value it
 * publishes must equal the corresponding key of the owning document's own
 * {@code stats()} document, which is what the dashboard read before the port
 * existed.
 */
@SpringBootTest
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class SalesDashboardReadAdapterTests extends AbstractSecurityTest {

    @Autowired
    private SalesDashboardReadAdapter adapter;

    @Autowired
    private QuotationService quotationService;

    @Autowired
    private SalesContractService salesContractService;

    @Autowired
    private SalesOrderService salesOrderService;

    @Autowired
    private CreditNoteService creditNoteService;

    @Autowired
    private InvoiceService invoiceService;

    @Autowired
    private DeliveryChallanService deliveryChallanService;

    @Autowired
    private ProformaInvoiceService proformaInvoiceService;

    @Autowired
    private PaymentReceiptService paymentReceiptService;

    @Test
    void quotationCountsMatchTheQuotationDocument() {
        Map<String, Object> doc = quotationService.stats();
        SalesCounts counts = adapter.counts();

        assertThat(counts.totalQuotations()).isEqualTo(num(doc, "total"));
        assertThat(counts.draftQuotations()).isEqualTo(num(doc, "draft"));
        assertThat(counts.pendingApprovalQuotations()).isEqualTo(num(doc, "pendingapproval"));
        assertThat(counts.approvedQuotations()).isEqualTo(num(doc, "approved"));
        assertThat(counts.rejectedQuotations()).isEqualTo(num(doc, "rejected"));
        assertThat(counts.convertedQuotations()).isEqualTo(num(doc, "converted"));
    }

    @Test
    void contractCountsMatchTheContractDocument() {
        Map<String, Object> doc = salesContractService.stats();
        SalesCounts counts = adapter.counts();

        assertThat(counts.totalSalesContracts()).isEqualTo(num(doc, "total"));
        assertThat(counts.draftSalesContracts()).isEqualTo(num(doc, "draft"));
        assertThat(counts.underReviewSalesContracts()).isEqualTo(num(doc, "underreview"));
        assertThat(counts.submittedSalesContracts()).isEqualTo(num(doc, "submitted"));
        assertThat(counts.approvedSalesContracts()).isEqualTo(num(doc, "approved"));
        assertThat(counts.activeSalesContracts()).isEqualTo(num(doc, "active"));
        assertThat(counts.completedSalesContracts()).isEqualTo(num(doc, "completed"));
        assertThat(counts.cancelledSalesContracts()).isEqualTo(num(doc, "cancelled"));
    }

    @Test
    void orderCountsMatchTheOrderDocument() {
        Map<String, Object> doc = salesOrderService.stats();
        SalesCounts counts = adapter.counts();

        assertThat(counts.totalSalesOrders()).isEqualTo(num(doc, "total"));
        assertThat(counts.draftSalesOrders()).isEqualTo(num(doc, "draft"));
        assertThat(counts.pendingReviewSalesOrders()).isEqualTo(num(doc, "pendingreview"));
        assertThat(counts.approvedSalesOrders()).isEqualTo(num(doc, "approved"));
        assertThat(counts.inProgressSalesOrders()).isEqualTo(num(doc, "inprogress"));
        assertThat(counts.completedSalesOrders()).isEqualTo(num(doc, "completed"));
        assertThat(counts.cancelledSalesOrders()).isEqualTo(num(doc, "cancelled"));
    }

    @Test
    void creditNoteInvoiceChallanProformaAndReceiptCountsMatchTheirDocuments() {
        Map<String, Object> creditNote = creditNoteService.stats();
        Map<String, Object> invoice = invoiceService.stats();
        Map<String, Object> challan = deliveryChallanService.stats();
        Map<String, Object> proforma = proformaInvoiceService.stats();
        Map<String, Object> receipt = paymentReceiptService.stats();

        SalesCounts counts = adapter.counts();

        assertThat(counts.totalCreditNotes()).isEqualTo(num(creditNote, "total"));
        assertThat(counts.draftCreditNotes()).isEqualTo(num(creditNote, "draft"));
        assertThat(counts.pendingApprovalCreditNotes()).isEqualTo(num(creditNote, "pendingapproval"));
        assertThat(counts.approvedCreditNotes()).isEqualTo(num(creditNote, "approved"));

        assertThat(counts.totalInvoices()).isEqualTo(num(invoice, "total"));
        assertThat(counts.overdueInvoices()).isEqualTo(num(invoice, "overdue"));
        assertThat(counts.partialInvoices()).isEqualTo(num(invoice, "partial"));
        assertThat(counts.paidInvoices()).isEqualTo(num(invoice, "paid"));
        assertThat(counts.pendingApprovalInvoices()).isEqualTo(num(invoice, "pendingapproval"));
        assertThat(counts.approvedInvoices()).isEqualTo(num(invoice, "approved"));

        assertThat(counts.totalDeliveryChallans()).isEqualTo(num(challan, "total"));
        assertThat(counts.pendingApprovalDeliveryChallans()).isEqualTo(num(challan, "pendingapproval"));
        assertThat(counts.approvedDeliveryChallans()).isEqualTo(num(challan, "approved"));

        assertThat(counts.totalProformaInvoices()).isEqualTo(num(proforma, "total"));
        assertThat(counts.pendingApprovalProformaInvoices()).isEqualTo(num(proforma, "pendingapproval"));
        assertThat(counts.approvedProformaInvoices()).isEqualTo(num(proforma, "approved"));

        assertThat(counts.totalPaymentReceipts()).isEqualTo(num(receipt, "total"));
        assertThat(counts.pendingApprovalPaymentReceipts()).isEqualTo(num(receipt, "pendingapproval"));
        assertThat(counts.receivedPaymentReceipts()).isEqualTo(num(receipt, "received"));
        assertThat(counts.partialPaymentReceipts()).isEqualTo(num(receipt, "partial"));
        assertThat(counts.cancelledPaymentReceipts()).isEqualTo(num(receipt, "cancelled"));
    }

    private static long num(Map<String, Object> stats, String key) {
        Object value = stats.get(key);
        return value instanceof Number ? ((Number) value).longValue() : 0L;
    }
}
