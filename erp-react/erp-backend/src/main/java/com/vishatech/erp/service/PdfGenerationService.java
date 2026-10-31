package com.vishatech.erp.service;

import static com.vishatech.erp.pdf.DocumentHtml.displayValue;
import static com.vishatech.erp.pdf.DocumentHtml.dt;
import static com.vishatech.erp.pdf.DocumentHtml.esc;
import static com.vishatech.erp.pdf.DocumentHtml.ftr;
import static com.vishatech.erp.pdf.DocumentHtml.hdr;
import static com.vishatech.erp.pdf.DocumentHtml.info;
import static com.vishatech.erp.pdf.DocumentHtml.labels;
import static com.vishatech.erp.pdf.DocumentHtml.recordDetails;

import com.vishatech.erp.entity.*;
import com.vishatech.erp.repository.*;
import com.vishatech.erp.pdf.DocumentHtml;
import com.vishatech.erp.pdf.DocumentView;
import com.vishatech.erp.production.api.ProductionDocumentPort;
import com.vishatech.erp.crm.entity.Contact;
import com.vishatech.erp.crm.entity.Customer;
import com.vishatech.erp.crm.entity.FollowUp;
import com.vishatech.erp.crm.entity.Lead;
import com.vishatech.erp.crm.repository.CustomerRepository;
import com.vishatech.erp.crm.repository.FollowUpRepository;
import com.vishatech.erp.crm.repository.LeadRepository;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.xhtmlrenderer.pdf.ITextRenderer;

@Service
public class PdfGenerationService {

    private static final Logger LOG = LoggerFactory.getLogger(PdfGenerationService.class);

    private final QuotationRepository quotationRepository;
    private final InvoiceRepository invoiceRepository;
    private final SalesContractRepository salesContractRepository;
    private final SalesOrderRepository salesOrderRepository;
    private final ProformaInvoiceRepository proformaInvoiceRepository;
    private final DeliveryChallanRepository deliveryChallanRepository;
    private final CreditNoteRepository creditNoteRepository;
    private final PaymentReceiptRepository paymentReceiptRepository;
    private final LeadRepository leadRepository;
    private final CustomerRepository customerRepository;
    private final FollowUpRepository followUpRepository;
    private final CprRepository cprRepository;
    private final CprTechnicalVerificationRepository cprTechnicalVerificationRepository;
    private final CostWorkoutRepository costWorkoutRepository;
    private final ProfitWorkoutRepository profitWorkoutRepository;
    /**
     * The production-owned documents (tracker, quality inspection, packing list)
     * are read by the module that owns them: this port replaces the three
     * Production repositories this service used to inject. The other seventeen
     * documents are still built here from their own module's repositories.
     */
    private final ProductionDocumentPort productionDocuments;

    public PdfGenerationService(
            QuotationRepository quotationRepository, InvoiceRepository invoiceRepository,
            SalesContractRepository salesContractRepository, SalesOrderRepository salesOrderRepository,
            ProformaInvoiceRepository proformaInvoiceRepository, DeliveryChallanRepository deliveryChallanRepository,
            CreditNoteRepository creditNoteRepository, PaymentReceiptRepository paymentReceiptRepository,
            LeadRepository leadRepository, CustomerRepository customerRepository,
            FollowUpRepository followUpRepository, CprRepository cprRepository,
            CprTechnicalVerificationRepository cprTechnicalVerificationRepository,
            CostWorkoutRepository costWorkoutRepository, ProfitWorkoutRepository profitWorkoutRepository,
            ProductionDocumentPort productionDocuments) {
        this.quotationRepository = quotationRepository;
        this.invoiceRepository = invoiceRepository;
        this.salesContractRepository = salesContractRepository;
        this.salesOrderRepository = salesOrderRepository;
        this.proformaInvoiceRepository = proformaInvoiceRepository;
        this.deliveryChallanRepository = deliveryChallanRepository;
        this.creditNoteRepository = creditNoteRepository;
        this.paymentReceiptRepository = paymentReceiptRepository;
        this.leadRepository = leadRepository;
        this.customerRepository = customerRepository;
        this.followUpRepository = followUpRepository;
        this.cprRepository = cprRepository;
        this.cprTechnicalVerificationRepository = cprTechnicalVerificationRepository;
        this.costWorkoutRepository = costWorkoutRepository;
        this.profitWorkoutRepository = profitWorkoutRepository;
        this.productionDocuments = productionDocuments;
    }

    /**
     * Build the document HTML for a module record without rendering it.
     *
     * Exposed so the document repository can fingerprint the content and avoid
     * creating a new version when nothing about the source record changed (the
     * rendered PDF bytes themselves are not stable — they embed a creation
     * timestamp).
     *
     * @return the HTML, or null when the module has no generated document
     */
    @Transactional(readOnly = true)
    public String buildHtml(String module, Long recordId) {
        if (module == null || module.isBlank() || recordId == null) {
            return null;
        }
        try {
            return switch (module.toLowerCase()) {
                case "quotation" -> generateQuotationHtml(recordId);
                case "invoice" -> generateInvoiceHtml(recordId);
                case "salescontract" -> generateSalesContractHtml(recordId);
                case "salesorder" -> generateSalesOrderHtml(recordId);
                case "proformainvoice" -> generateProformaInvoiceHtml(recordId);
                case "deliverychallan" -> generateDeliveryChallanHtml(recordId);
                case "creditnote" -> generateCreditNoteHtml(recordId);
                case "paymentreceipt" -> generatePaymentReceiptHtml(recordId);
                case "lead" -> generateLeadHtml(recordId);
                case "client" -> generateClientHtml(recordId);
                case "followup" -> generateFollowUpHtml(recordId);
                case "cpr" -> generateCprHtml(recordId);
                case "cprtechnicalverification" -> generateCprTechVerHtml(recordId);
                case "costworkout" -> generateCostWorkoutHtml(recordId);
                case "profitworkout" -> generateProfitWorkoutHtml(recordId);
                case "productiontracker" -> renderDocument(productionDocuments.productionTracker(recordId));
                case "qualityinspection" -> null;
                case "packinglist" -> renderDocument(productionDocuments.packingList(recordId));
                default -> null;
            };
        } catch (Exception e) {
            LOG.warn("Document HTML build failed for {} #{}: {}", module, recordId, e.getMessage());
            return null;
        }
    }

    /** Render already-built document HTML to PDF bytes (null on failure). */
    public byte[] toPdf(String html) {
        if (html == null) {
            return null;
        }
        try {
            return htmlToPdf(html);
        } catch (Exception e) {
            LOG.warn("PDF rendering failed: {}", e.getMessage());
            return null;
        }
    }

    public byte[] generatePdf(String module, Long recordId) {
        return toPdf(buildHtml(module, recordId));
    }

    public byte[] generateQualityInspectionPdf(String recordId) {
        return toPdf(buildQualityInspectionHtml(recordId));
    }

    private byte[] htmlToPdf(String html) throws Exception {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        ITextRenderer renderer = new ITextRenderer();
        renderer.setDocumentFromString(html);
        renderer.layout();
        renderer.createPDF(bos);
        return bos.toByteArray();
    }

    // ==================== Common helpers ====================
    private String totals(String[][] rows) {
        StringBuilder sb = new StringBuilder("<table style='width:300px;margin-left:auto;'>");
        for (String[] r : rows) {
            boolean bold = r.length > 2 && "b".equals(r[2]);
            sb.append(bold ? "<tr class='tot'>" : "<tr>");
            sb.append("<td style='width:160px;'>").append(esc(r[0])).append("</td><td style='text-align:right;'>").append(esc(r[1])).append("</td></tr>");
        }
        return sb.append("</table>").toString();
    }

    /**
     * Per-item attribute table listing the fields captured on the item form
     * that the commercial columns above do not already show.
     *
     * Only attributes that actually carry data for this document become
     * columns, so a partly filled item form never produces a page of blanks.
     */
    private String itemDetails(java.util.Collection<?> items, java.util.LinkedHashMap<String, String> columns) {
        if (items == null || items.isEmpty() || columns == null || columns.isEmpty()) {
            return "";
        }
        java.util.List<java.util.Map<String, String>> values = new java.util.ArrayList<>();
        java.util.LinkedHashSet<String> used = new java.util.LinkedHashSet<>();
        for (Object item : items) {
            java.util.Map<String, String> row = new java.util.LinkedHashMap<>();
            org.springframework.beans.BeanWrapperImpl wrapper = new org.springframework.beans.BeanWrapperImpl(item);
            for (String property : columns.keySet()) {
                String text = null;
                try {
                    text = displayValue(wrapper.getPropertyValue(property));
                } catch (Exception missing) {
                    // Property not present on this item type — omit the column.
                }
                if (text != null && !text.isBlank()) {
                    row.put(property, text);
                    used.add(property);
                }
            }
            values.add(row);
        }
        if (used.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder("<h2>Item Details</h2><table><thead><tr><th>#</th>");
        for (String property : used) {
            sb.append("<th>").append(esc(columns.get(property))).append("</th>");
        }
        sb.append("</tr></thead><tbody>");
        int serial = 1;
        for (java.util.Map<String, String> row : values) {
            sb.append("<tr><td>").append(serial++).append("</td>");
            for (String property : used) {
                sb.append("<td>").append(esc(row.get(property))).append("</td>");
            }
            sb.append("</tr>");
        }
        return sb.append("</tbody></table>").toString();
    }

    private java.util.LinkedHashMap<String, String> col(String... pairs) {
        java.util.LinkedHashMap<String, String> map = new java.util.LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            map.put(pairs[i], pairs[i + 1]);
        }
        return map;
    }

    private static final com.fasterxml.jackson.databind.ObjectMapper CPR_ITEM_JSON =
            new com.fasterxml.jackson.databind.ObjectMapper();

    /** The CPR's saved user-defined item columns (custom only, configured order). */
    private java.util.List<com.vishatech.erp.dto.CprItemColumn> cprCustomColumns(Cpr cpr) {
        if (cpr.getItemColumnsJson() == null || cpr.getItemColumnsJson().isBlank()) {
            return java.util.List.of();
        }
        try {
            java.util.List<com.vishatech.erp.dto.CprItemColumn> cols = CPR_ITEM_JSON.readValue(
                    cpr.getItemColumnsJson(),
                    new com.fasterxml.jackson.core.type.TypeReference<java.util.List<com.vishatech.erp.dto.CprItemColumn>>() {
                    });
            if (cols == null) return java.util.List.of();
            return cols.stream()
                    .filter(c -> c != null && c.id() != null && !Boolean.TRUE.equals(c.system()) && !Boolean.TRUE.equals(c.hidden()))
                    .collect(java.util.stream.Collectors.toList());
        } catch (Exception e) {
            return java.util.List.of();
        }
    }

    /** One item's custom column cell values ({columnId: value}). */
    private java.util.Map<String, String> parseCprItemCustomFields(CprItem item) {
        if (item.getCustomFieldsJson() == null || item.getCustomFieldsJson().isBlank()) {
            return java.util.Map.of();
        }
        try {
            java.util.Map<String, String> map = CPR_ITEM_JSON.readValue(item.getCustomFieldsJson(),
                    new com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String, String>>() {
                    });
            return map == null ? java.util.Map.of() : map;
        } catch (Exception e) {
            return java.util.Map.of();
        }
    }

    /** Item attributes shared by the order-to-cash documents. */
    private java.util.LinkedHashMap<String, String> lineItemColumns() {
        return col("sku", "SKU", "drawingNo", "Drawing No", "material", "Material",
                "delivery", "Delivery", "manufacturer", "Manufacturer",
                "countryOfOrigin", "Country of Origin");
    }

    private String fmt(BigDecimal v) { return v != null ? "Rs. " + String.format("%,.2f", v) : "-"; }
    private String fmtN(BigDecimal v) { return v != null ? String.format("%,.3f", v) : "-"; }
    private String d2(BigDecimal v) { return v != null ? String.format("%.2f", v) : "-"; }

    // ==================== QUOTATION ====================
    private String generateQuotationHtml(Long id) {
        Quotation q = quotationRepository.findById(id).orElse(null);
        if (q == null) return null;
        String h = hdr("QUOTATION", q.getQuotationNo(), dt(q.getQuotationDate()));
        String[][] meta = {
            {"Valid Until", dt(q.getValidUntil())}, {"Status", q.getStatus()},
            {"Client", q.getClientName()}, {"Contact", q.getContactPerson()},
            {"Email", q.getEmail()}, {"Phone", q.getPhone()},
            {"Billing Address", q.getBillingAddress()}, {"Shipping Address", q.getShippingAddress()},
            {"GSTIN", q.getGstin()}, {"PAN", q.getPan()},
            {"Tax Type", q.getTaxType()}, {"Currency", q.getCurrency()},
            {"Sales Person", q.getSalesPerson()}, {"Payment Terms", q.getPaymentTerms()},
            {"Delivery Terms", q.getDeliveryTerms()}, {"Remarks", q.getRemarks()},
        };
        h += info(meta);
        if (q.getItems() != null && !q.getItems().isEmpty()) {
            h += "<h2>Items</h2><table><thead><tr><th>#</th><th>Description</th><th>HSN</th><th>UOM</th><th>Qty</th><th>Rate</th><th>Disc%</th><th>GST%</th><th>Amount</th></tr></thead><tbody>";
            int sl = 1;
            for (QuotationItem i : q.getItems()) {
                BigDecimal amt = i.getQty() != null && i.getRate() != null ? i.getQty().multiply(i.getRate()) : null;
                h += "<tr><td>" + sl++ + "</td><td>" + esc(i.getDescription()) + "</td><td>" + esc(i.getHsn()) + "</td><td>" + esc(i.getUom()) + "</td><td>" + fmtN(i.getQty()) + "</td><td>" + fmt(i.getRate()) + "</td><td>" + d2(i.getDiscountPct()) + "</td><td>" + d2(i.getGstRate()) + "</td><td>" + fmt(amt) + "</td></tr>";
            }
            h += "</tbody></table>";
            h += itemDetails(q.getItems(), col("productName", "Product", "sku", "SKU",
                    "drawingNo", "Drawing No", "material", "Material", "delivery", "Delivery",
                    "batchCode", "Batch", "expiryDate", "Expiry"));
        }
        h += "<h2>Totals</h2>" + totals(new String[][]{
            {"Sub Total", fmt(q.getSubTotal())}, {"Discount", fmt(q.getDiscount())},
            {"CGST", fmt(q.getCgstTotal())}, {"SGST", fmt(q.getSgstTotal())},
            {"Tax Total", fmt(q.getTaxTotal())}, {"Charges", fmt(q.getCharges())},
            {"Grand Total", fmt(q.getGrandTotal()), "b"},
        });
        if (q.getTerms() != null && !q.getTerms().isBlank()) h += "<h2>Terms &amp; Conditions</h2><p>" + esc(q.getTerms()) + "</p>";
        h += recordDetails(q, labels(meta));
        return h + ftr();
    }

    // ==================== INVOICE ====================
    private String generateInvoiceHtml(Long id) {
        Invoice inv = invoiceRepository.findById(id).orElse(null);
        if (inv == null) return null;
        String h = hdr("INVOICE", inv.getInvoiceNo(), dt(inv.getInvoiceDate()));
        String[][] meta = {
            {"Due Date", dt(inv.getDueDate())}, {"Status", inv.getStatus()}, {"Payment Status", inv.getPaymentStatus()},
            {"Client", inv.getClientName()}, {"Contact", inv.getContactPerson()},
            {"Billing Address", inv.getBillingAddress()}, {"Shipping Address", inv.getShippingAddress()},
            {"GSTIN", inv.getGstin()}, {"PAN", inv.getPan()},
            {"Invoice Type", inv.getInvoiceType()}, {"Tax Type", inv.getTaxType()},
            {"Currency", inv.getCurrency()}, {"Payment Terms", inv.getPaymentTerms()},
            {"PO No", inv.getPoNo()}, {"Reference No", inv.getReferenceNo()},
            {"Bank", inv.getBankName()}, {"Account", inv.getBankAccount()}, {"IFSC", inv.getBankIfsc()},
        };
        h += info(meta);
        if (inv.getItems() != null && !inv.getItems().isEmpty()) {
            h += "<h2>Items</h2><table><thead><tr><th>#</th><th>Description</th><th>HSN</th><th>UOM</th><th>Qty</th><th>Rate</th><th>Disc%</th><th>GST%</th><th>Amount</th></tr></thead><tbody>";
            int sl = 1;
            for (InvoiceItem i : inv.getItems()) {
                BigDecimal amt = i.getQty() != null && i.getRate() != null ? i.getQty().multiply(i.getRate()) : null;
                h += "<tr><td>" + sl++ + "</td><td>" + esc(i.getDescription()) + "</td><td>" + esc(i.getHsn()) + "</td><td>" + esc(i.getUom()) + "</td><td>" + fmtN(i.getQty()) + "</td><td>" + fmt(i.getRate()) + "</td><td>" + d2(i.getDiscountPct()) + "</td><td>" + d2(i.getGstRate()) + "</td><td>" + fmt(amt) + "</td></tr>";
            }
            h += "</tbody></table>";
            h += itemDetails(inv.getItems(), lineItemColumns());
        }
        h += "<h2>Totals</h2>" + totals(new String[][]{
            {"Sub Total", fmt(inv.getSubTotal())}, {"Discount", fmt(inv.getDiscount())},
            {"CGST", fmt(inv.getCgstTotal())}, {"SGST", fmt(inv.getSgstTotal())},
            {"Tax Total", fmt(inv.getTaxTotal())}, {"Charges", fmt(inv.getCharges())},
            {"Round Off", fmt(inv.getRoundOff())}, {"Grand Total", fmt(inv.getGrandTotal()), "b"},
        });
        if (inv.getNotes() != null && !inv.getNotes().isBlank()) h += "<h2>Notes</h2><p>" + esc(inv.getNotes()) + "</p>";
        h += recordDetails(inv, labels(meta));
        return h + ftr();
    }

    // ==================== SALES CONTRACT ====================
    private String generateSalesContractHtml(Long id) {
        SalesContract sc = salesContractRepository.findById(id).orElse(null);
        if (sc == null) return null;
        String h = hdr("SALES CONTRACT", sc.getScNo(), dt(sc.getContractDate()));
        String[][] meta = {
            {"Status", sc.getStatus()}, {"Client", sc.getClientName()},
            {"Contact", sc.getContactPerson()}, {"Email", sc.getEmail()},
            {"GSTIN", sc.getGstin()}, {"PAN", sc.getPan()},
            {"Payment Terms", sc.getPaymentTerms()}, {"Delivery Terms", sc.getDeliveryTerms()},
            {"Sales Executive", sc.getSalesExecutive()}, {"Currency", sc.getCurrency()},
            {"Validity", dt(sc.getValidity())}, {"Duration", sc.getDuration()},
            {"Warranty", sc.getWarranty()}, {"PO Ref", sc.getPoRef()}, {"Qtn Ref", sc.getQtnRef()},
        };
        h += info(meta);
        if (sc.getItems() != null && !sc.getItems().isEmpty()) {
            h += "<h2>Items</h2><table><thead><tr><th>#</th><th>Description</th><th>HSN</th><th>UOM</th><th>Qty</th><th>Rate</th><th>Disc%</th><th>GST%</th></tr></thead><tbody>";
            int sl = 1;
            for (SalesContractItem i : sc.getItems()) {
                h += "<tr><td>" + sl++ + "</td><td>" + esc(i.getDescription()) + "</td><td>" + esc(i.getHsn()) + "</td><td>" + esc(i.getUom()) + "</td><td>" + fmtN(i.getQty()) + "</td><td>" + fmt(i.getRate()) + "</td><td>" + d2(i.getDiscountPct()) + "</td><td>" + d2(i.getGstRate()) + "</td></tr>";
            }
            h += "</tbody></table>";
            h += itemDetails(sc.getItems(), lineItemColumns());
        }
        h += "<h2>Totals</h2>" + totals(new String[][]{
            {"Sub Total", fmt(sc.getSubTotal())}, {"Discount", fmt(sc.getDiscount())},
            {"CGST", fmt(sc.getCgstTotal())}, {"SGST", fmt(sc.getSgstTotal())},
            {"Tax Total", fmt(sc.getTaxTotal())}, {"Charges", fmt(sc.getCharges())},
            {"Grand Total", fmt(sc.getGrandTotal()), "b"},
        });
        if (sc.getScope() != null && !sc.getScope().isBlank()) h += "<h2>Scope</h2><p>" + esc(sc.getScope()) + "</p>";
        if (sc.getExclusions() != null && !sc.getExclusions().isBlank()) h += "<h2>Exclusions</h2><p>" + esc(sc.getExclusions()) + "</p>";
        if (sc.getCommercialTerms() != null && !sc.getCommercialTerms().isBlank()) h += "<h2>Commercial Terms</h2><p>" + esc(sc.getCommercialTerms()) + "</p>";
        h += recordDetails(sc, labels(meta));
        return h + ftr();
    }

    // ==================== CUSTOMER PURCHASE ORDER ====================
    private String generateSalesOrderHtml(Long id) {
        SalesOrder so = salesOrderRepository.findById(id).orElse(null);
        if (so == null) return null;
        String cpoNo = so.getSoNo() != null && so.getSoNo().startsWith("SO-")
                ? "CPO-" + so.getSoNo().substring(3) : so.getSoNo();
        String h = hdr("CUSTOMER PURCHASE ORDER", cpoNo, dt(so.getOrderDate()));
        String[][] meta = {
            {"Status", so.getStatus()}, {"Client", so.getClientName()},
            {"Contact", so.getContactPerson()}, {"Email", so.getEmail()},
            {"GSTIN", so.getGstin()}, {"Payment Terms", so.getPaymentTerms()},
            {"Delivery Terms", so.getDeliveryTerms()}, {"Currency", so.getCurrency()},
            {"Customer PO", so.getCustomerPo()}, {"Qtn Ref", so.getQtnRef()},
            {"SC Ref", so.getScRef()},
        };
        h += info(meta);
        if (so.getItems() != null && !so.getItems().isEmpty()) {
            h += "<h2>Items</h2><table><thead><tr><th>#</th><th>Description</th><th>HSN</th><th>UOM</th><th>Qty</th><th>Rate</th><th>Disc%</th><th>GST%</th></tr></thead><tbody>";
            int sl = 1;
            for (SalesOrderItem i : so.getItems()) {
                h += "<tr><td>" + sl++ + "</td><td>" + esc(i.getDescription()) + "</td><td>" + esc(i.getHsn()) + "</td><td>" + esc(i.getUom()) + "</td><td>" + fmtN(i.getQty()) + "</td><td>" + fmt(i.getRate()) + "</td><td>" + d2(i.getDiscountPct()) + "</td><td>" + d2(i.getGstRate()) + "</td></tr>";
            }
            h += "</tbody></table>";
            h += itemDetails(so.getItems(), lineItemColumns());
        }
        h += "<h2>Totals</h2>" + totals(new String[][]{
            {"Sub Total", fmt(so.getSubTotal())}, {"Discount", fmt(so.getDiscount())},
            {"CGST", fmt(so.getCgstTotal())}, {"SGST", fmt(so.getSgstTotal())},
            {"Tax Total", fmt(so.getTaxTotal())}, {"Grand Total", fmt(so.getGrandTotal()), "b"},
        });
        h += recordDetails(so, labels(meta));
        return h + ftr();
    }

    // ==================== PROFORMA INVOICE ====================
    private String generateProformaInvoiceHtml(Long id) {
        ProformaInvoice pi = proformaInvoiceRepository.findById(id).orElse(null);
        if (pi == null) return null;
        String h = hdr("PROFORMA INVOICE", pi.getPiNo(), dt(pi.getPiDate()));
        String[][] meta = {
            {"Valid Till", dt(pi.getValidTill())}, {"Status", pi.getStatus()},
            {"Client", pi.getClientName()}, {"Contact", pi.getContactPerson()},
            {"GSTIN", pi.getGstin()}, {"PAN", pi.getPan()},
            {"Billing Address", pi.getBillingAddress()}, {"Shipping Address", pi.getShippingAddress()},
            {"Payment Terms", pi.getPaymentTerms()}, {"Currency", pi.getCurrency()},
            {"Tax Type", pi.getTaxType()}, {"Source", pi.getSource()}, {"Source Ref", pi.getSourceRef()},
            {"Bank", pi.getBankName()}, {"Account", pi.getBankAccount()}, {"IFSC", pi.getBankIfsc()},
        };
        h += info(meta);
        if (pi.getItems() != null && !pi.getItems().isEmpty()) {
            h += "<h2>Items</h2><table><thead><tr><th>#</th><th>Description</th><th>HSN</th><th>UOM</th><th>Qty</th><th>Rate</th><th>Disc%</th><th>GST%</th></tr></thead><tbody>";
            int sl = 1;
            for (ProformaInvoiceItem i : pi.getItems()) {
                h += "<tr><td>" + sl++ + "</td><td>" + esc(i.getDescription()) + "</td><td>" + esc(i.getHsn()) + "</td><td>" + esc(i.getUom()) + "</td><td>" + fmtN(i.getQty()) + "</td><td>" + fmt(i.getRate()) + "</td><td>" + d2(i.getDiscountPct()) + "</td><td>" + d2(i.getGstRate()) + "</td></tr>";
            }
            h += "</tbody></table>";
            h += itemDetails(pi.getItems(), col("sku", "SKU", "drawingNo", "Drawing No",
                    "material", "Material", "delivery", "Delivery",
                    "marksNos", "Marks &amp; Nos", "noKindPkgs", "No. &amp; Kind of Pkgs",
                    "manufacturer", "Manufacturer", "countryOfOrigin", "Country of Origin"));
        }
        h += "<h2>Totals</h2>" + totals(new String[][]{
            {"Sub Total", fmt(pi.getSubTotal())}, {"Discount", fmt(pi.getDiscount())},
            {"CGST", fmt(pi.getCgstTotal())}, {"SGST", fmt(pi.getSgstTotal())},
            {"Tax Total", fmt(pi.getTaxTotal())}, {"Charges", fmt(pi.getCharges())},
            {"Grand Total", fmt(pi.getGrandTotal()), "b"},
        });
        if (pi.getNotes() != null && !pi.getNotes().isBlank()) h += "<h2>Notes</h2><p>" + esc(pi.getNotes()) + "</p>";
        h += recordDetails(pi, labels(meta));
        return h + ftr();
    }

    // ==================== DELIVERY CHALLAN ====================
    private String generateDeliveryChallanHtml(Long id) {
        DeliveryChallan dc = deliveryChallanRepository.findById(id).orElse(null);
        if (dc == null) return null;
        String h = hdr("DELIVERY CHALLAN", dc.getDcNo(), dt(dc.getDcDate()));
        String[][] meta = {
            {"Status", dc.getStatus()}, {"Client", dc.getClientName()},
            {"Contact", dc.getContactPerson()}, {"Billing Address", dc.getBillingAddress()},
            {"Shipping Address", dc.getShippingAddress()},
            {"SO Ref", dc.getSoRef()}, {"SC Ref", dc.getScRef()},
            {"Transport", dc.getTransportCompany()}, {"Vehicle No", dc.getVehicleNumber()},
            {"Driver", dc.getDriverName()}, {"E-Way Bill", dc.getEwayBill()},
            {"LR No", dc.getLrNumber()}, {"Dispatch Date", dt(dc.getDispatchDate())},
            {"Delivery Date", dt(dc.getDeliveryDate())},
        };
        h += info(meta);
        if (dc.getItems() != null && !dc.getItems().isEmpty()) {
            h += "<h2>Items</h2><table><thead><tr><th>#</th><th>Description</th><th>HSN</th><th>UOM</th><th>Qty</th><th>Rate</th><th>Disc%</th><th>GST%</th></tr></thead><tbody>";
            int sl = 1;
            for (DeliveryChallanItem i : dc.getItems()) {
                h += "<tr><td>" + sl++ + "</td><td>" + esc(i.getDescription()) + "</td><td>" + esc(i.getHsn()) + "</td><td>" + esc(i.getUom()) + "</td><td>" + fmtN(i.getQty()) + "</td><td>" + fmt(i.getRate()) + "</td><td>" + d2(i.getDiscountPct()) + "</td><td>" + d2(i.getGstRate()) + "</td></tr>";
            }
            h += "</tbody></table>";
            h += itemDetails(dc.getItems(), lineItemColumns());
        }
        h += "<h2>Totals</h2>" + totals(new String[][]{
            {"Sub Total", fmt(dc.getSubTotal())}, {"Discount", fmt(dc.getDiscount())},
            {"CGST", fmt(dc.getCgstTotal())}, {"SGST", fmt(dc.getSgstTotal())},
            {"Tax Total", fmt(dc.getTaxTotal())}, {"Grand Total", fmt(dc.getGrandTotal()), "b"},
        });
        if (dc.getNotes() != null && !dc.getNotes().isBlank()) h += "<h2>Notes</h2><p>" + esc(dc.getNotes()) + "</p>";
        h += recordDetails(dc, labels(meta));
        return h + ftr();
    }

    // ==================== CREDIT NOTE ====================
    private String generateCreditNoteHtml(Long id) {
        CreditNote cn = creditNoteRepository.findById(id).orElse(null);
        if (cn == null) return null;
        String h = hdr("CREDIT NOTE", cn.getCnNo(), dt(cn.getCnDate()));
        String[][] meta = {
            {"Status", cn.getStatus()}, {"Client", cn.getClientName()},
            {"Contact", cn.getContactPerson()}, {"GSTIN", cn.getGstin()},
            {"Source", cn.getSource()}, {"Source Ref", cn.getSourceRef()},
            {"Reason", cn.getReason()}, {"Settlement Method", cn.getSettlementMethod()},
            {"Tax Type", cn.getTaxType()}, {"Currency", cn.getCurrency()},
        };
        h += info(meta);
        if (cn.getItems() != null && !cn.getItems().isEmpty()) {
            h += "<h2>Items</h2><table><thead><tr><th>#</th><th>Description</th><th>HSN</th><th>UOM</th><th>Qty</th><th>Rate</th><th>Disc%</th><th>GST%</th></tr></thead><tbody>";
            int sl = 1;
            for (CreditNoteItem i : cn.getItems()) {
                h += "<tr><td>" + sl++ + "</td><td>" + esc(i.getDescription()) + "</td><td>" + esc(i.getHsn()) + "</td><td>" + esc(i.getUom()) + "</td><td>" + fmtN(i.getQty()) + "</td><td>" + fmt(i.getRate()) + "</td><td>" + d2(i.getDiscountPct()) + "</td><td>" + d2(i.getGstRate()) + "</td></tr>";
            }
            h += "</tbody></table>";
            h += itemDetails(cn.getItems(), lineItemColumns());
        }
        h += "<h2>Totals</h2>" + totals(new String[][]{
            {"Sub Total", fmt(cn.getSubTotal())}, {"Discount", fmt(cn.getDiscount())},
            {"CGST", fmt(cn.getCgstTotal())}, {"SGST", fmt(cn.getSgstTotal())},
            {"Tax Total", fmt(cn.getTaxTotal())}, {"Grand Total", fmt(cn.getGrandTotal()), "b"},
        });
        if (cn.getReasonDetail() != null && !cn.getReasonDetail().isBlank()) h += "<h2>Reason Detail</h2><p>" + esc(cn.getReasonDetail()) + "</p>";
        h += recordDetails(cn, labels(meta));
        return h + ftr();
    }

    // ==================== PAYMENT RECEIPT ====================
    private String generatePaymentReceiptHtml(Long id) {
        PaymentReceipt pr = paymentReceiptRepository.findById(id).orElse(null);
        if (pr == null) return null;
        String h = hdr("PAYMENT RECEIPT", pr.getReceiptNo(), dt(pr.getPaymentDate()));
        String[][] meta = {
            {"Status", pr.getStatus()}, {"Client", pr.getClientName()},
            {"Contact", pr.getContactPerson()}, {"GSTIN", pr.getGstin()},
            {"Amount", fmt(pr.getAmount())}, {"Payment Mode", pr.getPaymentMode()},
            {"Bank", pr.getBankName()}, {"Branch", pr.getBranch()},
            {"Cheque / Tx No", pr.getChequeTx()}, {"Reference No", pr.getReferenceNo()},
            {"Invoice Ref", pr.getInvoiceRef()}, {"Source", pr.getSource()},
        };
        h += info(meta);
        if (pr.getRemarks() != null && !pr.getRemarks().isBlank()) h += "<h2>Remarks</h2><p>" + esc(pr.getRemarks()) + "</p>";
        h += recordDetails(pr, labels(meta));
        return h + ftr();
    }

    // ==================== LEAD ====================
    private String generateLeadHtml(Long id) {
        Lead lead = leadRepository.findById(id).orElse(null);
        if (lead == null) return null;
        String leadNo = "LEAD-" + String.format("%06d", lead.getId());
        String h = hdr("LEAD", leadNo, dt(lead.getCreatedAt()));
        String[][] meta = {
            {"Name", lead.getName()}, {"Company", lead.getCompany()},
            {"Title", lead.getTitle()}, {"Stage", lead.getStage() != null ? lead.getStage().name() : null},
            {"Status", lead.getStatus() != null ? lead.getStatus().name() : null},
            {"Source", lead.getSource()}, {"Email", lead.getEmail()},
            {"Phone", lead.getPhone()}, {"Owner", lead.getOwner()},
            {"Value", fmt(lead.getValue())}, {"Priority", lead.getPriority()},
            {"Industry", lead.getIndustry()}, {"Business Type", lead.getBusinessType()},
            {"Address", lead.getAddress()}, {"City", lead.getCity()},
            {"State", lead.getState()}, {"Country", lead.getCountry()},
            {"Project", lead.getProject()}, {"Notes", lead.getInternalNotes()},
        };
        h += info(meta);
        h += recordDetails(lead, labels(meta));
        return h + ftr();
    }

    // ==================== CLIENT / CUSTOMER ====================
    private String generateClientHtml(Long id) {
        Customer c = customerRepository.findById(id).orElse(null);
        if (c == null) return null;
        String h = hdr("CLIENT", c.getClientCode() != null ? c.getClientCode() : "CLIENT-" + id, dt(c.getCreatedAt()));
        String[][] meta = {
            {"Business Name", c.getBusinessName()}, {"Alias", c.getAlias()},
            {"Contact Person", c.getContactPerson()}, {"Email", c.getEmail()},
            {"Phone", c.getPhone()}, {"GSTIN", c.getGstin()}, {"PAN", c.getPan()},
            {"Billing Address", c.getBillingAddress()}, {"Shipping Address", c.getShippingAddress()},
            {"Country", c.getCountry()}, {"Payment Terms", c.getPaymentTerms()},
            {"Credit Limit", fmt(c.getCreditLimit())}, {"Sales Person", c.getSalesPerson()},
            {"Category", c.getCategory()}, {"Industry", c.getIndustry()},
            {"Status", c.getStatus()}, {"Currency", c.getCurrency()},
            {"Bank", c.getBankName()}, {"Account Holder", c.getAccountHolderName()},
            {"Account No", c.getAccountNumber()}, {"IFSC", c.getIfsc()},
        };
        h += info(meta);
        h += recordDetails(c, labels(meta));
        return h + ftr();
    }

    // ==================== FOLLOW-UP ====================
    private String generateFollowUpHtml(Long id) {
        FollowUp fu = followUpRepository.findById(id).orElse(null);
        if (fu == null) return null;
        String h = hdr("FOLLOW-UP", "FU-" + id, dt(fu.getCreatedAt()));
        String[][] meta = {
            {"Subject", fu.getDiscussionSummary()}, {"Mode", fu.getMode()},
            {"Status", fu.getCurrentStatus()}, {"Priority", fu.getPriority()},
            {"Lead", fu.getLeadName()}, {"Client", fu.getCompanyName()},
            {"Assigned To", fu.getAssignTo()}, {"Follow-up Date", dt(fu.getFollowupDate())},
            {"Outcome", fu.getOutcome()}, {"Discussion", fu.getDiscussionSummary()},
            {"Customer Feedback", fu.getCustomerFeedback()}, {"Requirement", fu.getRequirement()},
        };
        h += info(meta);
        h += recordDetails(fu, labels(meta));
        return h + ftr();
    }

    // ==================== CPR ====================
    private String generateCprHtml(Long id) {
        Cpr cpr = cprRepository.findById(id).orElse(null);
        if (cpr == null) return null;
        String h = hdr("CPR (PURCHASE REQUISITION)", cpr.getPrNo(), dt(cpr.getPrDate()));
        String[][] meta = {
            {"Status", cpr.getStatus() != null ? cpr.getStatus().name() : null},
            {"Department", cpr.getDepartment()}, {"Requested By", cpr.getRequestedBy()},
            {"Client", cpr.getClientName()}, {"Company", cpr.getCompany()},
            {"Contact", cpr.getContactPerson()}, {"Email", cpr.getEmail()},
            {"Phone", cpr.getPhone()}, {"Priority", cpr.getPriority()},
            {"Quotation Deadline", cpr.getExtendedDeadline() != null ? cpr.getExtendedDeadline().toString() : (cpr.getQuotationDeadline() != null ? cpr.getQuotationDeadline().toString() : null)},
            {"Project", cpr.getProject()}, {"Lead No", cpr.getLeadNo()},
            {"Grand Total", fmt(cpr.getGrandTotal())},
        };
        h += info(meta);
        if (cpr.getItems() != null && !cpr.getItems().isEmpty()) {
            // The items table reflects the CPR's SAVED column configuration:
            // user-defined custom columns appear after the standard columns with
            // their configured labels and order (snapshot, not a live re-read).
            java.util.List<com.vishatech.erp.dto.CprItemColumn> customCols = cprCustomColumns(cpr);
            h += "<h2>Items</h2><table><thead><tr><th>#</th><th>Drawing No</th><th>Description</th><th>Specification</th><th>Qty</th><th>Unit</th><th>Est. Cost</th>";
            for (com.vishatech.erp.dto.CprItemColumn c : customCols) {
                h += "<th>" + esc(c.label()) + "</th>";
            }
            h += "</tr></thead><tbody>";
            int sl = 1;
            for (CprItem i : cpr.getItems()) {
                java.util.Map<String, String> custom = parseCprItemCustomFields(i);
                h += "<tr><td>" + sl++ + "</td><td>" + esc(i.getDrawingNo()) + "</td><td>" + esc(i.getDescription()) + "</td><td>" + esc(i.getSpecification()) + "</td><td>" + fmtN(i.getQty()) + "</td><td>" + esc(i.getUnit()) + "</td><td>" + fmt(i.getEstimatedCost()) + "</td>";
                for (com.vishatech.erp.dto.CprItemColumn c : customCols) {
                    h += "<td>" + esc(custom.get(c.id())) + "</td>";
                }
                h += "</tr>";
            }
            h += "</tbody></table>";
            h += itemDetails(cpr.getItems(), col("remarks", "Item Remarks", "fileName", "Attached File"));
        }
        if (cpr.getRemarks() != null && !cpr.getRemarks().isBlank()) h += "<h2>Remarks</h2><p>" + esc(cpr.getRemarks()) + "</p>";
        h += recordDetails(cpr, labels(meta));
        return h + ftr();
    }

    // ==================== CPR TECHNICAL VERIFICATION ====================
    private String generateCprTechVerHtml(Long id) {
        CprTechnicalVerification tv = cprTechnicalVerificationRepository.findById(id).orElse(null);
        if (tv == null) return null;
        String h = hdr("TECHNICAL VERIFICATION", tv.getTvNo(), dt(tv.getCreatedAt()));
        String[][] meta = {
            {"Status", tv.getStatus() != null ? tv.getStatus().name() : null},
            {"Drawing No", tv.getDrawingNumber()}, {"Item Description", tv.getItemDescription()},
            {"Division", tv.getDivision()}, {"Verified By", tv.getVerifiedBy()},
            {"Technical Remarks", tv.getTechnicalRemarks()},
        };
        h += info(meta);
        h += recordDetails(tv, labels(meta));
        return h + ftr();
    }

    // ==================== COST WORKOUT ====================
    private String generateCostWorkoutHtml(Long id) {
        CostWorkout cw = costWorkoutRepository.findById(id).orElse(null);
        if (cw == null) return null;
        String h = hdr("COST WORKOUT", cw.getCwNo(), dt(cw.getCwDate()));
        String[][] meta = {
            {"Status", cw.getStatus() != null ? cw.getStatus().name() : null},
            {"CPR Ref", cw.getCprRef()}, {"Client", cw.getCustomerName()},
            {"Prepared By", cw.getPreparedBy()}, {"Department", cw.getDepartment()},
            {"Grand Total", fmt(cw.getGrandTotal())}, {"Selling Price", fmt(cw.getSellingPrice())},
            {"Remarks", cw.getRemarks()},
        };
        h += info(meta);
        h += recordDetails(cw, labels(meta));
        return h + ftr();
    }

    // ==================== PROFIT WORKOUT ====================
    private String generateProfitWorkoutHtml(Long id) {
        ProfitWorkout pw = profitWorkoutRepository.findById(id).orElse(null);
        if (pw == null) return null;
        String h = hdr("PROFIT WORKOUT", pw.getPwNo(), dt(pw.getPwDate()));
        String[][] meta = {
            {"Status", pw.getStatus() != null ? pw.getStatus().name() : null},
            {"CPR Ref", pw.getCprRef()}, {"Client", pw.getCustomerName()},
            {"Prepared By", pw.getPreparedBy()}, {"Department", pw.getDepartment()},
            {"Profit %", d2(pw.getProfitPct())}, {"Profit Amount", fmt(pw.getProfitAmt())},
            {"Grand Total", fmt(pw.getGrandTotal())}, {"Selling Price", fmt(pw.getSellingPrice())},
            {"Remarks", pw.getRemarks()},
        };
        h += info(meta);
        h += recordDetails(pw, labels(meta));
        return h + ftr();
    }

    // ============ PRODUCTION DOCUMENTS (published port) ============
    //
    // The tracker, the quality inspection and the packing list are Production's
    // own documents: their records, their labels and their "complete record
    // details" are read and described by the owning module through
    // ProductionDocumentPort, and rendered here with the same shared toolkit
    // every other document uses (com.vishatech.erp.pdf.DocumentHtml). Only the
    // data moved — the document HTML is assembled exactly as it always was, so
    // the produced documents are unchanged.

    /**
     * Renders a module-published document.
     *
     * @return the document HTML, or null when the module has no such record —
     *         the "missing record means no document" behaviour every module has
     */
    private String renderDocument(Optional<DocumentView> document) {
        return document.map(DocumentHtml::render).orElse(null);
    }

    // ==================== QC (String PK) ====================
    @Transactional(readOnly = true)
    public String buildQualityInspectionHtml(String id) {
        try {
            return renderDocument(productionDocuments.qualityInspection(id));
        } catch (Exception e) {
            LOG.warn("Quality inspection HTML build failed for {}: {}", id, e.getMessage());
            return null;
        }
    }

    // ==================== GENERIC ====================
    private String generateGenericHtml(String module, Long id) {
        String h = hdr(module.toUpperCase(), module.toUpperCase() + "-" + id, dt(LocalDateTime.now()));
        h += "<p>Document for " + esc(module) + " record #" + id + "</p>";
        return h + ftr();
    }
}
