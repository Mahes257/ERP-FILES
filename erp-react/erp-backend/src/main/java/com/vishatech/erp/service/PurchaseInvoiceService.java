package com.vishatech.erp.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.Notification;
import com.vishatech.erp.entity.PurchaseGrn;
import com.vishatech.erp.entity.PurchaseGrnItem;
import com.vishatech.erp.entity.PurchaseInvoice;
import com.vishatech.erp.entity.PurchaseOrder;
import com.vishatech.erp.entity.PurchaseOrderItem;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.PurchaseGrnRepository;
import com.vishatech.erp.repository.PurchaseInvoiceRepository;
import com.vishatech.erp.repository.PurchaseOrderRepository;
import com.vishatech.erp.util.AuditContext;
import com.vishatech.erp.util.PurchaseNumbering;
import jakarta.persistence.criteria.Predicate;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class PurchaseInvoiceService {
    private static final BigDecimal ZERO = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
    private final PurchaseInvoiceRepository invoices;
    private final PurchaseOrderRepository orders;
    private final PurchaseGrnRepository grns;
    private final PurchaseNumbering numbering;
    private final AuditContext audit;
    private final PurchaseSupportService support;
    private final PurchaseNotificationPublisher notifications;
    private final ObjectMapper mapper = new ObjectMapper();

    public PurchaseInvoiceService(PurchaseInvoiceRepository invoices, PurchaseOrderRepository orders,
                                  PurchaseGrnRepository grns, PurchaseNumbering numbering,
                                  AuditContext audit, PurchaseSupportService support,
                                  PurchaseNotificationPublisher notifications) {
        this.invoices = invoices;
        this.orders = orders;
        this.grns = grns;
        this.numbering = numbering;
        this.audit = audit;
        this.support = support;
        this.notifications = notifications;
    }

    @Transactional(readOnly = true)
    public Page<Map<String, Object>> list(int page, int size, String search, String status, String sort) {
        Sort ordering = Sort.by(Sort.Direction.DESC, "createdAt");
        if (sort != null && !sort.isBlank()) {
            String field = sort.startsWith("-") ? sort.substring(1) : sort;
            ordering = Sort.by(sort.startsWith("-") ? Sort.Direction.DESC : Sort.Direction.ASC,
                    switch (field) {
                        case "invoiceDate", "dueDate", "status", "total", "invoiceNo" -> field;
                        default -> "createdAt";
                    });
        }
        PageRequest pageRequest = PageRequest.of(Math.max(0, page), Math.min(Math.max(size, 1), 200), ordering);
        boolean hasSearch = search != null && !search.isBlank();
        boolean hasStatus = status != null && !status.isBlank() && !"All".equalsIgnoreCase(status.trim());
        Page<PurchaseInvoice> pageData = (hasSearch || hasStatus)
                ? invoices.findAll(invoiceSpec(search, hasStatus ? status : null), pageRequest)
                : invoices.findAll(pageRequest);
        return pageData.map(this::toResponse);
    }

    /** Free-text + lifecycle-status filter for the invoice list/queues. */
    private static Specification<PurchaseInvoice> invoiceSpec(String search, String status) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (status != null && !status.isBlank() && !"All".equalsIgnoreCase(status.trim())) {
                predicates.add(cb.equal(root.get("status"), status.trim()));
            }
            if (search != null && !search.isBlank()) {
                String pattern = "%" + search.trim().toLowerCase(Locale.ROOT) + "%";
                List<Predicate> matches = new ArrayList<>();
                for (String field : List.of("invoiceNo", "vendorInvoiceNo", "vendor", "poNo", "grnNo", "status", "vendorReference")) {
                    matches.add(cb.like(cb.lower(root.<String>get(field)), pattern));
                }
                predicates.add(cb.or(matches.toArray(new Predicate[0])));
            }
            return predicates.isEmpty() ? cb.conjunction() : cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    @Transactional(readOnly = true)
    public Map<String, Object> get(Long id) {
        return toResponse(find(id));
    }

    public void delete(Long id) {
        PurchaseInvoice invoice = find(id);
        if (!"Draft".equals(invoice.getStatus()) && !"Rejected".equals(invoice.getStatus())) {
            throw new BadRequestException("Only draft or rejected invoices can be deleted");
        }
        invoices.delete(invoice);
    }

    public Map<String, Object> create(Map<String, Object> body) {
        String poNo = text(body, "poNo");
        PurchaseOrder order = orders.findByPoNo(poNo)
                .orElseThrow(() -> new ResourceNotFoundException("Purchase order not found: " + poNo));
        String vendor = text(body, "vendor");
        if (vendor.isBlank()) vendor = order.getVendor();
        requireSame(vendor, order.getVendor(), "Invoice supplier must match the purchase order supplier");
        String vendorInvoiceNo = required(body, "vendorInvoiceNo");
        if (!invoices.findByVendorAndVendorInvoiceNo(vendor, vendorInvoiceNo).isEmpty()) {
            throw new BadRequestException("Supplier invoice number already exists for this supplier");
        }
        String invoiceNo = text(body, "invoiceNo");
        if (invoiceNo.isBlank()) {
            invoiceNo = numbering.nextInvoiceNo(numbering.maxSequence(
                    invoices.findAll().stream().map(PurchaseInvoice::getInvoiceNo).toList(), "VINV"));
        }
        if (invoices.existsByInvoiceNo(invoiceNo)) throw new BadRequestException("Invoice number already exists");

        PurchaseInvoice invoice = new PurchaseInvoice();
        invoice.setInvoiceNo(invoiceNo);
        invoice.setVendorInvoiceNo(vendorInvoiceNo);
        invoice.setVendor(vendor);
        invoice.setVendorEmail(text(body, "vendorEmail"));
        invoice.setPoNo(poNo);
        invoice.setGrnNo(text(body, "grnNo"));
        invoice.setVendorReference(text(body, "vendorReference"));
        invoice.setInvoiceType(defaultText(body, "invoiceType", "Standard"));
        invoice.setInvoiceDate(defaultText(body, "invoiceDate", LocalDate.now().toString()));
        invoice.setDueDate(text(body, "dueDate"));
        invoice.setCurrency(defaultText(body, "currency", order.getCurrency() == null ? "INR" : order.getCurrency()));
        invoice.setGstType(text(body, "gstType"));
        invoice.setDiscount(decimal(body, "discount"));
        invoice.setCharges(decimal(body, "charges"));
        invoice.setFreight(decimal(body, "freight"));
        invoice.setGst(decimal(body, "gst"));
        invoice.setNotes(text(body, "notes"));
        invoice.setItemsJson(json(body.get("items")));
        invoice.setAttachmentsJson(json(body.get("attachments")));
        calculateTotals(invoice, body);
        invoice.setStatus("Draft");
        invoice.setMatchStatus("Pending Match");
        invoice.setPaymentStatus("Unpaid");
        appendApproval(invoice, "created", "", "");
        PurchaseInvoice saved = invoices.save(invoice);
        support.log(PurchaseSupportService.DOC_PO, order.getId(), "invoice", "Invoice created", saved.getInvoiceNo());
        support.log("INVOICE", saved.getId(), "created", "Invoice created", saved.getInvoiceNo());
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<?> activity(Long id) {
        find(id);
        return support.activity("INVOICE", id);
    }

    public Map<String, Object> update(Long id, Map<String, Object> body) {
        PurchaseInvoice invoice = find(id);
        if (!List.of("Draft", "Rejected").contains(invoice.getStatus())) {
            throw new BadRequestException("Only draft or rejected invoices can be edited");
        }
        if (body.containsKey("vendorInvoiceNo")) {
            String no = required(body, "vendorInvoiceNo");
            if (!no.equalsIgnoreCase(invoice.getVendorInvoiceNo())
                    && !invoices.findByVendorAndVendorInvoiceNo(invoice.getVendor(), no).isEmpty()) {
                throw new BadRequestException("Supplier invoice number already exists for this supplier");
            }
            invoice.setVendorInvoiceNo(no);
        }
        if (body.containsKey("grnNo")) invoice.setGrnNo(text(body, "grnNo"));
        if (body.containsKey("invoiceDate")) invoice.setInvoiceDate(text(body, "invoiceDate"));
        if (body.containsKey("dueDate")) invoice.setDueDate(text(body, "dueDate"));
        if (body.containsKey("notes")) invoice.setNotes(text(body, "notes"));
        if (body.containsKey("items")) invoice.setItemsJson(json(body.get("items")));
        if (body.containsKey("attachments")) invoice.setAttachmentsJson(json(body.get("attachments")));
        if (body.containsKey("discount")) invoice.setDiscount(decimal(body, "discount"));
        if (body.containsKey("charges")) invoice.setCharges(decimal(body, "charges"));
        if (body.containsKey("freight")) invoice.setFreight(decimal(body, "freight"));
        if (body.containsKey("gst")) invoice.setGst(decimal(body, "gst"));
        calculateTotals(invoice, body);
        invoice.setMatchStatus("Pending Match");
        return toResponse(invoices.save(invoice));
    }

    /** Next invoice number derived from the DATABASE — the create form pre-fills its number from here (the local store is empty in API mode, which used to hand out an already-used number and 400 on save). */
    @Transactional(readOnly = true)
    public Map<String, Object> nextNumber() {
        List<String> numbers = invoices.findAll().stream().map(PurchaseInvoice::getInvoiceNo).toList();
        long max = numbering.maxSequence(numbers, "VINV");
        return Map.of("invoiceNo", numbering.nextInvoiceNo(max), "nextNumber", max + 1);
    }

    public Map<String, Object> submit(Long id) {
        PurchaseInvoice invoice = find(id);
        transition(invoice, "Draft", "Submitted");
        Map<String, Object> match = match(id);
        invoice.setMatchStatus((String) match.get("status"));
        appendApproval(invoice, "submitted", "", "");
        support.log(PurchaseSupportService.DOC_INVOICE, invoice.getId(), "submit",
                "Invoice submitted", "", "Draft", "Submitted");
        // Settings → Notifications "Invoice pending verification": the invoice now
        // sits in the verification queue (status Submitted) until it is approved.
        notifications.publish(PurchaseNotificationPublisher.EVENT_INVOICE_SUBMITTED,
                "Invoice " + invoice.getInvoiceNo() + " awaiting verification",
                "Invoice " + invoice.getInvoiceNo() + " from " + invoice.getVendor()
                        + " was submitted and is awaiting verification.",
                invoice.getId(), "PurchaseInvoice");
        if (!"Matched".equals(match.get("status"))) {
            notifications.publish(PurchaseNotificationPublisher.EVENT_INVOICE_MISMATCH,
                    "Invoice " + invoice.getInvoiceNo() + " " + match.get("status"),
                    "Invoice " + invoice.getInvoiceNo() + " from " + invoice.getVendor()
                            + " did not pass the three-way match (" + match.get("status")
                            + ") — resolve it before approval.",
                    invoice.getId(), "PurchaseInvoice", Notification.Priority.HIGH);
        }
        return toResponse(invoices.save(invoice));
    }

    public Map<String, Object> approve(Long id, String comments) {
        PurchaseInvoice invoice = find(id);
        transition(invoice, "Submitted", "Approved");
        Map<String, Object> match = match(id);
        if (!"Matched".equals(match.get("status"))) {
            throw new BadRequestException("Invoice cannot be approved: three-way match is " + match.get("status"));
        }
        invoice.setMatchStatus("Matched");
        appendApproval(invoice, "approved", audit.currentUserName(), comments);
        support.log(PurchaseSupportService.DOC_INVOICE, invoice.getId(), "approve",
                "Invoice approved", comments, "Submitted", "Approved");
        notifications.publish(PurchaseNotificationPublisher.EVENT_INVOICE_APPROVAL,
                "Invoice " + invoice.getInvoiceNo() + " approved",
                "Invoice " + invoice.getInvoiceNo() + " from " + invoice.getVendor()
                        + " was approved by " + audit.currentUserName() + ".",
                invoice.getId(), "PurchaseInvoice");
        return toResponse(invoices.save(invoice));
    }

    public Map<String, Object> reject(Long id, String comments) {
        PurchaseInvoice invoice = find(id);
        transition(invoice, "Submitted", "Rejected");
        invoice.setNotes(comments);
        appendApproval(invoice, "rejected", audit.currentUserName(), comments);
        support.log(PurchaseSupportService.DOC_INVOICE, invoice.getId(), "reject",
                "Invoice rejected", comments, "Submitted", "Rejected");
        return toResponse(invoices.save(invoice));
    }

    @Transactional(readOnly = true)
    public Map<String, Object> match(Long id) {
        PurchaseInvoice invoice = find(id);
        PurchaseOrder order = orders.findByPoNo(invoice.getPoNo())
                .orElseThrow(() -> new ResourceNotFoundException("Purchase order not found: " + invoice.getPoNo()));
        List<Map<String, Object>> reasons = new ArrayList<>();
        List<Map<String, Object>> details = new ArrayList<>();
        PurchaseGrn grn = invoice.getGrnNo() == null || invoice.getGrnNo().isBlank()
                ? null : grns.findByGrnNo(invoice.getGrnNo()).orElse(null);
        if (grn == null) reasons.add(reason("GRN", "Referenced GRN was not found"));
        requireSame(invoice.getVendor(), order.getVendor(), "Invoice supplier does not match the purchase order supplier");
        List<Map<String, Object>> invoiceItems = parseList(invoice.getItemsJson());
        if (invoiceItems.isEmpty()) reasons.add(reason("items", "Invoice must contain at least one line item"));
        for (Map<String, Object> line : invoiceItems) {
            String product = text(line, "product");
            PurchaseOrderItem poItem = order.getItems().stream()
                    .filter(item -> item.getProduct().equalsIgnoreCase(product)
                            || (!text(line, "itemCode").isBlank() && text(line, "itemCode").equalsIgnoreCase(item.getItemCode())))
                    .findFirst().orElse(null);
            BigDecimal invoiceQty = decimal(line, "qty");
            BigDecimal invoiceRate = firstDecimal(line, "rate", "price");
            BigDecimal receivedQty = grn == null ? ZERO : grn.getItems().stream()
                    .filter(item -> item.getProduct().equalsIgnoreCase(product))
                    .map(PurchaseGrnItem::getReceivedQty).findFirst().orElse(ZERO);
            Map<String, Object> detail = new LinkedHashMap<>();
            detail.put("product", product); detail.put("invoiceQty", invoiceQty); detail.put("invoiceRate", invoiceRate);
            detail.put("poQty", poItem == null ? ZERO : poItem.getQty());
            detail.put("poRate", poItem == null ? ZERO : poItem.getRate());
            detail.put("grnQty", receivedQty);
            if (poItem == null) reasons.add(reason(product, "Invoice line is not present on the purchase order"));
            else {
                if (invoiceQty.compareTo(receivedQty) > 0) reasons.add(reason(product, "Invoice quantity exceeds received quantity"));
                if (invoiceRate.compareTo(poItem.getRate()) != 0) reasons.add(reason(product, "Invoice unit price differs from purchase order"));
            }
            details.add(detail);
        }
        String status = reasons.isEmpty() ? "Matched" : (grn == null ? "Pending Match" : "Mismatch");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("status", status); result.put("matched", "Matched".equals(status));
        result.put("reasons", reasons); result.put("details", details);
        return result;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> stats() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", invoices.count());
        BigDecimal totalPayable = ZERO;
        BigDecimal dueAmount = ZERO;
        BigDecimal overdueAmount = ZERO;
        BigDecimal paidAmount = ZERO;
        long partiallyPaid = 0;
        long dueInvoices = 0;
        long overdueInvoices = 0;
        for (PurchaseInvoice invoice : invoices.findAll()) {
            BigDecimal outstanding = outstanding(invoice);
            BigDecimal paid = nz(invoice.getPaidAmount());
            totalPayable = totalPayable.add(outstanding);
            paidAmount = paidAmount.add(paid);
            if (outstanding.signum() > 0) {
                if (isOverdue(invoice)) {
                    overdueAmount = overdueAmount.add(outstanding);
                    overdueInvoices++;
                } else {
                    dueAmount = dueAmount.add(outstanding);
                    dueInvoices++;
                }
            }
            if (paid.signum() > 0 && outstanding.signum() > 0) partiallyPaid++;
        }
        result.put("totalPayable", totalPayable);
        result.put("payableValue", totalPayable);
        result.put("dueAmount", dueAmount);
        result.put("overdueAmount", overdueAmount);
        result.put("paidAmount", paidAmount);
        result.put("paidValue", paidAmount);
        result.put("partiallyPaid", partiallyPaid);
        result.put("dueInvoices", dueInvoices);
        result.put("overdueInvoices", overdueInvoices);
        for (String status : List.of("Draft", "Submitted", "Approved", "Rejected", "Paid")) {
            result.put(status.toLowerCase(Locale.ROOT), invoices.findAll().stream().filter(i -> status.equals(i.getStatus())).count());
        }
        /* The invoice KPI cards (Invoice Management, Payment Approval, Vendor
         * Payment) read these exact keys. They are aliases of the canonical
         * figures above, supplied here so a KPI can never show 0 just because
         * the card's key casing differs from the response key. */
        result.put("Paid", result.get("paid"));
        result.put("Approved", result.get("approved"));
        result.put("pendingApproval", result.get("submitted"));
        result.put("outstanding", totalPayable);
        return result;
    }

    public Map<String, Object> recordPayment(Long id, Map<String, Object> body) {
        PurchaseInvoice invoice = find(id);
        if (!List.of("Approved", "Partially Paid", "Overdue").contains(invoice.getStatus())) {
            throw new BadRequestException("Only approved invoices with an outstanding balance can be paid");
        }
        Map<String, Object> match = match(id);
        if (!"Matched".equals(match.get("status"))) {
            throw new BadRequestException("Payment blocked: invoice is " + match.get("status"));
        }
        BigDecimal due = outstanding(invoice);
        if (due.signum() <= 0) throw new BadRequestException("Invoice has no outstanding balance");
        boolean full = !body.containsKey("full") || Boolean.parseBoolean(String.valueOf(body.get("full")));
        BigDecimal amount = full ? due : decimal(body, "amount");
        if (amount.signum() <= 0) throw new BadRequestException("Payment amount must be positive");
        if (amount.compareTo(due) > 0) throw new BadRequestException("Payment exceeds outstanding balance");
        String paymentNo = text(body, "paymentNo");
        if (paymentNo.isBlank()) paymentNo = "PAY-" + System.currentTimeMillis();
        List<Map<String, Object>> ledger = parseList(invoice.getPaymentsJson());
        final String requestedPaymentNo = paymentNo;
        if (ledger.stream().anyMatch(p -> requestedPaymentNo.equals(text(p, "paymentNo")))) {
            throw new BadRequestException("Payment reference already exists");
        }
        Map<String, Object> payment = new LinkedHashMap<>();
        payment.put("paymentNo", paymentNo);
        payment.put("invoiceId", invoice.getId());
        payment.put("invoiceNo", invoice.getInvoiceNo());
        payment.put("vendor", invoice.getVendor());
        payment.put("amount", amount);
        payment.put("currency", defaultText(body, "currency", invoice.getCurrency()));
        payment.put("method", defaultText(body, "method", "Bank Transfer"));
        payment.put("transactionReference", text(body, "transactionReference"));
        payment.put("paymentDate", defaultText(body, "paymentDate", LocalDate.now().toString()));
        payment.put("bank", text(body, "bank"));
        payment.put("remarks", text(body, "notes"));
        payment.put("status", "Active");
        payment.put("paidBy", audit.currentUserName());
        ledger.add(payment);
        invoice.setPaymentsJson(json(ledger));
        BigDecimal paid = nz(invoice.getPaidAmount()).add(amount);
        invoice.setPaidAmount(paid);
        invoice.setPaymentStatus(paid.compareTo(invoice.getTotal()) >= 0 ? "PAID" : "PARTIALLY_PAID");
        invoice.setStatus(paid.compareTo(invoice.getTotal()) >= 0 ? "Paid" : "Partially Paid");
        invoices.save(invoice);
        support.log("INVOICE", invoice.getId(), "payment", "Payment recorded", paymentNo);
        support.log(PurchaseSupportService.DOC_INVOICE, invoice.getId(), "payment",
                "Payment recorded", paymentNo + " — " + amount + " " + invoice.getCurrency(),
                null, "Paid".equals(invoice.getStatus()) ? "Paid" : "Partially Paid");
        return toResponse(invoice);
    }

    @Transactional
    public Map<String, Object> generateAdvice(Long id) {
        PurchaseInvoice invoice = find(id);
        if (!"Paid".equals(invoice.getStatus()) || outstanding(invoice).signum() > 0) {
            throw new BadRequestException("Advice can only be generated for fully paid invoices");
        }
        if (invoice.getAdviceStatus() != null && !invoice.getAdviceStatus().isBlank()) {
            throw new BadRequestException("Advice already exists for this invoice");
        }
        invoice.setAdviceStatus("Issued");
        invoices.save(invoice);
        support.log(PurchaseSupportService.DOC_INVOICE, invoice.getId(), "advice-generated",
                "Payment advice generated", latestPaymentNo(invoice), "Paid", "Paid");
        return toResponse(invoice);
    }

    @Transactional
    public Map<String, Object> sendAdvice(Long id) {
        PurchaseInvoice invoice = find(id);
        if (invoice.getAdviceStatus() == null || invoice.getAdviceStatus().isBlank()) {
            throw new BadRequestException("No payment advice to send — generate advice first");
        }
        invoice.setAdviceStatus("Sent");
        invoices.save(invoice);
        support.log(PurchaseSupportService.DOC_INVOICE, invoice.getId(), "advice-sent",
                "Payment advice sent", latestPaymentNo(invoice), "Paid", "Paid");
        return toResponse(invoice);
    }

    public Map<String, Object> reversePayment(Long id, String paymentNo, String reason) {
        PurchaseInvoice invoice = find(id);
        List<Map<String, Object>> ledger = parseList(invoice.getPaymentsJson());
        Map<String, Object> payment = ledger.stream()
                .filter(p -> paymentNo.equals(text(p, "paymentNo")))
                .findFirst().orElseThrow(() -> new ResourceNotFoundException("Payment not found: " + paymentNo));
        if ("Reversed".equalsIgnoreCase(text(payment, "status"))) {
            throw new BadRequestException("Payment has already been reversed");
        }
        payment.put("status", "Reversed");
        payment.put("reversedBy", audit.currentUserName());
        payment.put("reversedAt", LocalDateTime.now().toString());
        payment.put("reversalReason", reason == null ? "" : reason);
        BigDecimal paid = nz(invoice.getPaidAmount()).subtract(decimal(payment, "amount")).max(ZERO);
        invoice.setPaidAmount(paid);
        invoice.setPaymentStatus(paid.signum() == 0 ? "UNPAID" : "PARTIALLY_PAID");
        invoice.setStatus(paid.signum() == 0 ? (isOverdue(invoice) ? "Overdue" : "Approved") : "Partially Paid");
        invoice.setPaymentsJson(json(ledger));
        invoices.save(invoice);
        support.log("INVOICE", invoice.getId(), "payment-reversed", "Payment reversed", paymentNo);
        return toResponse(invoice);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> paymentLedger(String search) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (PurchaseInvoice invoice : invoices.findAll()) {
            for (Map<String, Object> payment : parseList(invoice.getPaymentsJson())) {
                if (search != null && !search.isBlank()) {
                    String haystack = (text(payment, "paymentNo") + " " + invoice.getInvoiceNo() + " "
                            + invoice.getVendor() + " " + text(payment, "transactionReference")).toLowerCase(Locale.ROOT);
                    if (!haystack.contains(search.toLowerCase(Locale.ROOT))) continue;
                }
                Map<String, Object> row = new LinkedHashMap<>(payment);
                row.put("invoiceId", invoice.getId());
                row.put("invoiceNo", invoice.getInvoiceNo());
                row.put("vendor", invoice.getVendor());
                rows.add(row);
            }
        }
        return Map.of("data", rows, "total", rows.size());
    }

    private PurchaseInvoice find(Long id) { return invoices.findById(id).orElseThrow(() -> new ResourceNotFoundException("Purchase invoice not found: " + id)); }
    private BigDecimal outstanding(PurchaseInvoice invoice) { return nz(invoice.getTotal()).subtract(nz(invoice.getPaidAmount())).max(ZERO); }
    private boolean isOverdue(PurchaseInvoice invoice) {
        if (invoice.getDueDate() == null || invoice.getDueDate().isBlank() || outstanding(invoice).signum() <= 0) return false;
        try { return LocalDate.parse(invoice.getDueDate()).isBefore(LocalDate.now()); }
        catch (Exception e) { return false; }
    }
    private void transition(PurchaseInvoice invoice, String expected, String next) { if (!expected.equals(invoice.getStatus())) throw new BadRequestException("Cannot transition invoice from " + invoice.getStatus() + " to " + next); invoice.setStatus(next); }
    private void calculateTotals(PurchaseInvoice invoice, Map<String, Object> body) {
        BigDecimal subtotal = ZERO;
        for (Map<String, Object> line : parseList(invoice.getItemsJson())) subtotal = subtotal.add(decimal(line, "qty").multiply(firstDecimal(line, "rate", "price")));
        /* When no line items exist (manual entry), fall back to the
           header-level amount supplied by the form. */
        if (subtotal.signum() == 0) subtotal = decimal(body, "amount");
        BigDecimal discount = nz(invoice.getDiscount()); BigDecimal tax = nz(invoice.getGst()); BigDecimal charges = nz(invoice.getCharges()).add(nz(invoice.getFreight()));
        invoice.setAmount(subtotal.setScale(2, RoundingMode.HALF_UP));
        invoice.setTotal(subtotal.subtract(discount).add(tax).add(charges).setScale(2, RoundingMode.HALF_UP));
    }
    private void appendApproval(PurchaseInvoice i, String action, String actor, String comments) { List<Map<String,Object>> h=parseList(i.getApprovalHistoryJson()); Map<String,Object> e=new LinkedHashMap<>();e.put("action",action);e.put("approver",actor);e.put("comments",comments);e.put("timestamp",LocalDateTime.now().toString());h.add(e);i.setApprovalHistoryJson(json(h)); }
    private Map<String,Object> toResponse(PurchaseInvoice i){Map<String,Object>m=new LinkedHashMap<>();m.put("id",i.getId());m.put("invoiceNo",i.getInvoiceNo());m.put("vendorInvoiceNo",i.getVendorInvoiceNo());m.put("vendor",i.getVendor());m.put("poNo",i.getPoNo());m.put("grnNo",i.getGrnNo());m.put("invoiceDate",i.getInvoiceDate());m.put("dueDate",i.getDueDate());m.put("currency",i.getCurrency());m.put("amount",i.getAmount());m.put("subtotal",i.getAmount());m.put("discount",i.getDiscount());m.put("gst",i.getGst());m.put("charges",i.getCharges());m.put("freight",i.getFreight());m.put("total",i.getTotal());m.put("grandTotal",i.getTotal());m.put("status",i.getStatus());m.put("matchStatus",i.getMatchStatus());    m.put("paymentStatus", outstanding(i).signum() == 0 ? "PAID" : (nz(i.getPaidAmount()).signum() > 0 ? "PARTIALLY_PAID" : (isOverdue(i) ? "OVERDUE" : "DUE")));m.put("paidAmount",nz(i.getPaidAmount()));m.put("outstanding",outstanding(i));m.put("paymentReference", latestPaymentReference(i));m.put("paymentDate", latestPaymentDate(i));m.put("paymentNo", latestPaymentNo(i));m.put("paymentMethod", latestPaymentMethod(i));m.put("paymentBank", latestPaymentBank(i));m.put("adviceStatus", i.getAdviceStatus());m.put("notes",i.getNotes());m.put("items",parseList(i.getItemsJson()));m.put("attachments",parseList(i.getAttachmentsJson()));m.put("approvalHistory",parseList(i.getApprovalHistoryJson()));return m;}
    private Map<String,Object> latestPayment(PurchaseInvoice i){List<Map<String,Object>> p=parseList(i.getPaymentsJson());return p.isEmpty()?new LinkedHashMap<>():p.get(p.size()-1);}
    private String latestPaymentReference(PurchaseInvoice i){return text(latestPayment(i),"transactionReference");}
    private String latestPaymentDate(PurchaseInvoice i){return text(latestPayment(i),"paymentDate");}
    private String latestPaymentNo(PurchaseInvoice i){return text(latestPayment(i),"paymentNo");}
    private String latestPaymentMethod(PurchaseInvoice i){return text(latestPayment(i),"method");}
    private String latestPaymentBank(PurchaseInvoice i){return text(latestPayment(i),"bank");}
    private Map<String,Object> reason(String field,String message){return Map.of("field",field,"message",message);}
    private String required(Map<String,Object> m,String key){String v=text(m,key);if(v.isBlank())throw new BadRequestException(key+" is required");return v;}
    private String text(Map<String,Object> m,String key){Object v=m.get(key);return v==null?"":String.valueOf(v).trim();}
    private String defaultText(Map<String,Object> m,String k,String d){String v=text(m,k);return v.isBlank()?d:v;}
    private void requireSame(String a,String b,String message){if(a==null||b==null||!a.trim().equalsIgnoreCase(b.trim()))throw new BadRequestException(message);}
    private BigDecimal decimal(Map<String,Object> m,String k){String v=text(m,k);if(v.isBlank())return ZERO;try{return new BigDecimal(v);}catch(NumberFormatException e){throw new BadRequestException("Invalid amount: "+k);}}
    private BigDecimal firstDecimal(Map<String,Object> m,String... keys){for(String k:keys)if(!text(m,k).isBlank())return decimal(m,k);return ZERO;}
    private BigDecimal nz(BigDecimal v){return v==null?ZERO:v;}
    private String json(Object o){try{return o==null?null:mapper.writeValueAsString(o);}catch(Exception e){throw new BadRequestException("Invalid JSON payload");}}
    private List<Map<String,Object>> parseList(String raw){if(raw==null||raw.isBlank())return new ArrayList<>();try{return mapper.readValue(raw,new TypeReference<List<Map<String,Object>>>(){});}catch(Exception e){throw new BadRequestException("Invalid invoice item payload");}}
}
