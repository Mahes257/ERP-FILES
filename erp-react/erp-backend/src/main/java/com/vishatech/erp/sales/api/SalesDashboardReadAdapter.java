package com.vishatech.erp.sales.api;

import com.vishatech.erp.dashboard.dto.SalesCounts;
import com.vishatech.erp.dashboard.port.SalesDashboardPort;
import com.vishatech.erp.service.CreditNoteService;
import com.vishatech.erp.service.DeliveryChallanService;
import com.vishatech.erp.service.InvoiceService;
import com.vishatech.erp.service.PaymentReceiptService;
import com.vishatech.erp.service.ProformaInvoiceService;
import com.vishatech.erp.service.QuotationService;
import com.vishatech.erp.service.SalesContractService;
import com.vishatech.erp.service.SalesOrderService;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Sales-owned implementation of {@link SalesDashboardPort}.
 *
 * <p>Every number comes from the owning document's own {@code stats()} document,
 * in the order the dashboard has always called them, and the key extraction is
 * the same one the dashboard used to do inline. Nothing here aggregates in
 * Java: the sales module remains the only place that knows how a quotation,
 * contract, customer purchase order, invoice, challan, proforma invoice,
 * credit note or payment receipt is counted.
 */
@Service
public class SalesDashboardReadAdapter implements SalesDashboardPort {

    private final QuotationService quotationService;
    private final SalesContractService salesContractService;
    private final SalesOrderService salesOrderService;
    private final CreditNoteService creditNoteService;
    private final InvoiceService invoiceService;
    private final DeliveryChallanService deliveryChallanService;
    private final ProformaInvoiceService proformaInvoiceService;
    private final PaymentReceiptService paymentReceiptService;

    public SalesDashboardReadAdapter(QuotationService quotationService,
                                     SalesContractService salesContractService,
                                     SalesOrderService salesOrderService,
                                     CreditNoteService creditNoteService,
                                     InvoiceService invoiceService,
                                     DeliveryChallanService deliveryChallanService,
                                     ProformaInvoiceService proformaInvoiceService,
                                     PaymentReceiptService paymentReceiptService) {
        this.quotationService = quotationService;
        this.salesContractService = salesContractService;
        this.salesOrderService = salesOrderService;
        this.creditNoteService = creditNoteService;
        this.invoiceService = invoiceService;
        this.deliveryChallanService = deliveryChallanService;
        this.proformaInvoiceService = proformaInvoiceService;
        this.paymentReceiptService = paymentReceiptService;
    }

    @Override
    public SalesCounts counts() {
        Map<String, Object> quotation = quotationService.stats();
        Map<String, Object> contract = salesContractService.stats();
        Map<String, Object> order = salesOrderService.stats();
        Map<String, Object> creditNote = creditNoteService.stats();
        Map<String, Object> invoice = invoiceService.stats();
        Map<String, Object> deliveryChallan = deliveryChallanService.stats();
        Map<String, Object> proformaInvoice = proformaInvoiceService.stats();
        Map<String, Object> paymentReceipt = paymentReceiptService.stats();

        return new SalesCounts(
                num(quotation, "total"),
                num(quotation, "draft"),
                num(quotation, "pendingapproval"),
                num(quotation, "approved"),
                num(quotation, "rejected"),
                num(quotation, "converted"),
                num(contract, "total"),
                num(contract, "draft"),
                num(contract, "underreview"),
                num(contract, "submitted"),
                num(contract, "approved"),
                num(contract, "active"),
                num(contract, "completed"),
                num(contract, "cancelled"),
                num(order, "total"),
                num(order, "draft"),
                num(order, "pendingreview"),
                num(order, "approved"),
                num(order, "inprogress"),
                num(order, "completed"),
                num(order, "cancelled"),
                num(creditNote, "total"),
                num(creditNote, "draft"),
                num(creditNote, "pendingapproval"),
                num(creditNote, "approved"),
                num(invoice, "total"),
                num(invoice, "overdue"),
                num(invoice, "partial"),
                num(invoice, "paid"),
                num(invoice, "pendingapproval"),
                num(invoice, "approved"),
                num(deliveryChallan, "total"),
                num(deliveryChallan, "pendingapproval"),
                num(deliveryChallan, "approved"),
                num(proformaInvoice, "total"),
                num(proformaInvoice, "pendingapproval"),
                num(proformaInvoice, "approved"),
                num(paymentReceipt, "total"),
                num(paymentReceipt, "pendingapproval"),
                num(paymentReceipt, "received"),
                num(paymentReceipt, "partial"),
                num(paymentReceipt, "cancelled"));
    }

    /** Safe long extraction from a stats document (missing or odd keys are zero). */
    private static long num(Map<String, Object> stats, String key) {
        Object value = stats.get(key);
        return value instanceof Number ? ((Number) value).longValue() : 0L;
    }
}
