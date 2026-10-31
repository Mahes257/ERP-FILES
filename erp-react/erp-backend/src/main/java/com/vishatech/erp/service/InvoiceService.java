package com.vishatech.erp.service;
import com.vishatech.erp.dto.ConversionResult;

import com.vishatech.erp.dto.CreditNoteItemRequest;
import com.vishatech.erp.dto.InvoiceItemRequest;
import com.vishatech.erp.dto.InvoiceItemResponse;
import com.vishatech.erp.dto.InvoiceNextNumberResponse;
import com.vishatech.erp.dto.InvoiceRequest;
import com.vishatech.erp.dto.InvoiceResponse;
import com.vishatech.erp.dto.SalesAttachmentResponse;
import com.vishatech.erp.dto.SalesHistoryResponse;
import com.vishatech.erp.dto.SalesTimelineResponse;
import com.vishatech.erp.dto.RevisionInfo;
import com.vishatech.erp.entity.CreditNote;
import com.vishatech.erp.entity.CreditNoteItem;
import com.vishatech.erp.entity.Invoice;
import com.vishatech.erp.entity.InvoiceItem;
import com.vishatech.erp.entity.PaymentReceipt;
import com.vishatech.erp.entity.DocumentVisibility;
import com.vishatech.erp.entity.SalesAttachment;
import com.vishatech.erp.entity.SalesHistory;
import com.vishatech.erp.entity.SalesTimeline;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.CreditNoteRepository;
import com.vishatech.erp.repository.EditHistoryRepository;
import com.vishatech.erp.repository.InvoiceRepository;
import com.vishatech.erp.repository.PaymentReceiptRepository;
import com.vishatech.erp.repository.RecordRevisionRepository;
import com.vishatech.erp.repository.SalesAttachmentRepository;
import com.vishatech.erp.repository.SalesHistoryRepository;
import com.vishatech.erp.repository.SalesTimelineRepository;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Subquery;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Year;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@Transactional
public class InvoiceService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final String MODULE = "invoice";

    private final InvoiceRepository invoiceRepository;
    private final SalesTimelineRepository timelineRepository;
    private final SalesHistoryRepository historyRepository;
    private final SalesAttachmentRepository attachmentRepository;
    private final EditHistoryRepository editHistoryRepository;
    private final RecordRevisionRepository recordRevisionRepository;
    private final PaymentReceiptRepository paymentReceiptRepository;
    private final CreditNoteRepository creditNoteRepository;
    private final FileStorageService fileStorageService;
    private final DocumentRepositoryService documentRepositoryService;
    private final String baseUrl;

    public InvoiceService(InvoiceRepository invoiceRepository,
                          SalesTimelineRepository timelineRepository,
                          SalesHistoryRepository historyRepository,
                          SalesAttachmentRepository attachmentRepository,
                          EditHistoryRepository editHistoryRepository,
                          RecordRevisionRepository recordRevisionRepository,
                          PaymentReceiptRepository paymentReceiptRepository,
                          CreditNoteRepository creditNoteRepository,
                          FileStorageService fileStorageService,
                          DocumentRepositoryService documentRepositoryService,
                          @Value("${app.base-url:http://localhost:8080}") String baseUrl) {
        this.invoiceRepository = invoiceRepository;
        this.timelineRepository = timelineRepository;
        this.historyRepository = historyRepository;
        this.attachmentRepository = attachmentRepository;
        this.editHistoryRepository = editHistoryRepository;
        this.recordRevisionRepository = recordRevisionRepository;
        this.paymentReceiptRepository = paymentReceiptRepository;
        this.creditNoteRepository = creditNoteRepository;
        this.fileStorageService = fileStorageService;
        this.documentRepositoryService = documentRepositoryService;
        this.baseUrl = baseUrl;
    }

    @Transactional(readOnly = true)
    public Page<InvoiceResponse> list(int page, int size, String search, String sort,
                                      String status, String client, String dateFrom, String dateTo,
                                      BigDecimal minAmount, BigDecimal maxAmount) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort));
        Specification<Invoice> spec = buildSpecification(search, status, client, dateFrom, dateTo, minAmount, maxAmount);
        return invoiceRepository.findAll(spec, pageable).map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public InvoiceResponse get(Long id) {
        return toResponseDetail(getInvoice(id));
    }

    @Transactional(readOnly = true)
    public InvoiceNextNumberResponse getNextNumber() {
        long next = nextSequence();
        return new InvoiceNextNumberResponse(buildNo(next), next);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> stats() {
        List<String> excluded = List.of("archived", "deleted");
        Map<String, Object> stats = new LinkedHashMap<>();
        long active = 0;
        // Count only the CURRENT revision of each chain so KPI cards match
        // the list rows (older revisions are surfaced through the Document
        // Workflow dropdown, never as separate list rows).
        for (String status : List.of("draft", "issued", "sent", "partial", "paid", "overdue", "cancelled")) {
            long count = invoiceRepository.countCurrentByStatus(status);
            stats.put(status.replace(" ", ""), count);
            active += count;
        }
        stats.put("total", active);
        stats.put("active", active);
        stats.put("archived", invoiceRepository.countCurrentByStatus("archived"));
        stats.put("deleted", invoiceRepository.countCurrentByStatus("deleted"));
        stats.put("totalAmt", invoiceRepository.sumGrandTotalExcluding(excluded));
        return stats;
    }

    public InvoiceResponse create(InvoiceRequest request, boolean draft) {
        Invoice invoice = new Invoice();
        if (request.invoiceNo() != null && !request.invoiceNo().isBlank()) {
            if (invoiceRepository.existsByInvoiceNo(request.invoiceNo().trim())) {
                throw new BadRequestException("Invoice number already exists: " + request.invoiceNo());
            }
            invoice.setInvoiceNo(request.invoiceNo().trim());
        } else {
            invoice.setInvoiceNo(buildNo(nextSequence()));
        }
        applyRequest(invoice, request);
        if (draft) {
            invoice.setStatus("draft");
        } else if (request.status() != null && !request.status().isBlank()) {
            invoice.setStatus(normalizeStatus(request.status()));
        } else {
            invoice.setStatus("draft");
        }
        if (request.paymentStatus() != null && !request.paymentStatus().isBlank()) {
            invoice.setPaymentStatus(request.paymentStatus().trim().toLowerCase());
        } else {
            invoice.setPaymentStatus("paid".equals(invoice.getStatus()) ? "paid"
                    : "overdue".equals(invoice.getStatus()) ? "overdue" : "unpaid");
        }
        recalcTotals(invoice);
        Invoice saved = invoiceRepository.save(invoice);
        addTimeline(saved, "created", "Invoice created",
                "Invoice '" + saved.getInvoiceNo() + "' was created.");
        addHistory(saved, "Invoice", null, saved.getInvoiceNo(), currentUserName());
        return toResponse(saved);
    }

    /**
     * Every edit creates a NEW revision row (BASE(N)); the previous version is
     * never deleted or overwritten. Only the latest revision is editable.
     */
    public InvoiceResponse update(Long id, InvoiceRequest request) {
        Invoice current = getInvoice(id);
        if (!current.isLatestRevision()) {
            throw new BadRequestException("Only the latest revision can be edited");
        }
        Long baseId = current.getRevisionOf() != null ? current.getRevisionOf() : current.getId();
        int nextRev = maxRevisionOfChain(baseId) + 1;

        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(current);

        Invoice revision = new Invoice();
        copyForRevision(revision, current);
        applyRequest(revision, request);
        if (request.status() != null && !request.status().isBlank()) {
            revision.setStatus(normalizeStatus(request.status()));
        }
        if (request.paymentStatus() != null && !request.paymentStatus().isBlank()) {
            revision.setPaymentStatus(request.paymentStatus().trim().toLowerCase());
        } else {
            revision.setPaymentStatus("paid".equals(revision.getStatus()) ? "paid"
                    : "overdue".equals(revision.getStatus()) ? "overdue" : "unpaid");
        }
        recalcTotals(revision);
        revision.setInvoiceNo(RevisionSupport.nextRevisionNumber(
                RevisionSupport.baseNumber(current.getInvoiceNo()), nextRev));
        revision.setRevisionOf(baseId);
        revision.setRevision(nextRev);
        revision.setRevisionDate(java.time.LocalDateTime.now());
        revision.setLatestRevision(true);

        current.setLatestRevision(false);
        invoiceRepository.save(current);
        Invoice saved = invoiceRepository.saveAndFlush(revision);
        addTimeline(saved, "revision", "Revision " + nextRev + " created",
                "Revision '" + saved.getInvoiceNo() + "' created from '" + current.getInvoiceNo()
                        + "' by " + currentUserName() + ".");
        editHistory.recordEdit("invoice", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponseDetail(saved);
    }

    public InvoiceResponse delete(Long id) {
        Invoice invoice = getInvoice(id);
        RevisionSupport.requireLatest(invoice.isLatestRevision());
        invoice.setStatus("deleted");
        invoice.setArchivedAt(LocalDateTime.now());
        addTimeline(invoice, "deleted", "Invoice deleted",
                "Invoice was moved to trash by " + currentUserName() + ".");
        addHistory(invoice, "Status", null, "Deleted", currentUserName());
        return toResponse(invoiceRepository.save(invoice));
    }

    public InvoiceResponse restore(Long id) {
        Invoice invoice = getInvoice(id);
        RevisionSupport.requireLatest(invoice.isLatestRevision());
        String previous = invoice.getStatus();
        String target = ("deleted".equals(previous) || "archived".equals(previous)) ? "draft" : previous;
        invoice.setStatus(target);
        invoice.setArchivedAt(null);
        addTimeline(invoice, "restored", "Invoice restored",
                "Invoice was restored by " + currentUserName() + ".");
        addHistory(invoice, "Status", titleCase(previous), titleCase(target), currentUserName());
        return toResponse(invoiceRepository.save(invoice));
    }

    public InvoiceResponse archive(Long id) {
        Invoice invoice = getInvoice(id);
        RevisionSupport.requireLatest(invoice.isLatestRevision());
        invoice.setStatus("archived");
        invoice.setArchivedAt(LocalDateTime.now());
        addTimeline(invoice, "archived", "Invoice archived",
                "Invoice was archived by " + currentUserName() + ".");
        addHistory(invoice, "Status", null, "Archived", currentUserName());
        return toResponse(invoiceRepository.save(invoice));
    }

    public InvoiceResponse changeStatus(Long id, String status) {
        Invoice invoice = getInvoice(id);
        RevisionSupport.requireLatest(invoice.isLatestRevision());
        String normalized = normalizeStatus(status);
        if ("deleted".equals(invoice.getStatus())) {
            throw new BadRequestException("Cannot change status of a deleted Invoice");
        }
        invoice.setStatus(normalized);
        if ("paid".equals(normalized)) {
            invoice.setPaymentStatus("paid");
        } else if ("overdue".equals(normalized)) {
            invoice.setPaymentStatus("overdue");
        }
        addTimeline(invoice, "status", "Status changed",
                "Status changed to '" + titleCase(normalized) + "' by " + currentUserName() + ".");
        addHistory(invoice, "Status", null, titleCase(normalized), currentUserName());
        return toResponse(invoiceRepository.save(invoice));
    }

    public InvoiceResponse markPaid(Long id) {
        Invoice invoice = getInvoice(id);
        RevisionSupport.requireLatest(invoice.isLatestRevision());
        invoice.setStatus("paid");
        invoice.setPaymentStatus("paid");
        addTimeline(invoice, "paid", "Invoice marked paid",
                "Invoice marked as Paid by " + currentUserName() + ".");
        addHistory(invoice, "Status", null, "Paid", currentUserName());
        return toResponse(invoiceRepository.save(invoice));
    }

    public InvoiceResponse send(Long id) {
        Invoice invoice = getInvoice(id);
        RevisionSupport.requireLatest(invoice.isLatestRevision());
        if ("draft".equals(invoice.getStatus())) {
            invoice.setStatus("sent");
            addTimeline(invoice, "sent", "Invoice sent",
                    "Invoice sent to " + (invoice.getEmail() == null ? "client" : invoice.getEmail()) + ".");
            addHistory(invoice, "Status", "Draft", "Sent", currentUserName());
        }
        return toResponse(invoiceRepository.save(invoice));
    }

    public InvoiceResponse duplicate(Long id) {
        Invoice source = getInvoice(id);
        Invoice copy = new Invoice();
        copy.setInvoiceNo(buildNo(nextSequence()));
        copy.setInvoiceType(source.getInvoiceType());
        copy.setCompanyName(source.getCompanyName());
        copy.setCompanyGstin(source.getCompanyGstin());
        copy.setCompanyPan(source.getCompanyPan());
        copy.setCompanyState(source.getCompanyState());
        copy.setCompanyAddress(source.getCompanyAddress());
        copy.setCompanyEmail(source.getCompanyEmail());
        copy.setCompanyPhone(source.getCompanyPhone());
        copy.setLutArn(source.getLutArn());
        copy.setReferenceNo(source.getReferenceNo());
        copy.setContractNo(source.getContractNo());
        copy.setContractDate(source.getContractDate());
        copy.setAppendixNo(source.getAppendixNo());
        copy.setAppendixDate(source.getAppendixDate());
        copy.setExporterRef(source.getExporterRef());
        copy.setPoNo(source.getPoNo());
        copy.setPoDate(source.getPoDate());
        copy.setSource(source.getSource());
        copy.setSourceRef(source.getSourceRef());
        copy.setBankName(source.getBankName());
        copy.setBankAccount(source.getBankAccount());
        copy.setBankIfsc(source.getBankIfsc());
        copy.setBankBranch(source.getBankBranch());
        copy.setBankType(source.getBankType());
        copy.setBankUpi(source.getBankUpi());
        copy.setBankSwift(source.getBankSwift());
        copy.setBankAddress(source.getBankAddress());
        copy.setClientId(source.getClientId());
        copy.setClientName(source.getClientName());
        copy.setContactPerson(source.getContactPerson());
        copy.setGstin(source.getGstin());
        copy.setPan(source.getPan());
        copy.setEmail(source.getEmail());
        copy.setPhone(source.getPhone());
        copy.setBillingAddress(source.getBillingAddress());
        copy.setShippingAddress(source.getShippingAddress());
        copy.setBuyerCountry(source.getBuyerCountry());
        copy.setConsigneeName(source.getConsigneeName());
        copy.setConsigneeAddress(source.getConsigneeAddress());
        copy.setConsigneeCountry(source.getConsigneeCountry());
        copy.setConsigneeSameAsBuyer(source.isConsigneeSameAsBuyer());
        copy.setTerms(source.getTerms());
        copy.setNotes(source.getNotes());
        copy.setCountryOfOrigin(source.getCountryOfOrigin());
        copy.setCountryOfFinalDestination(source.getCountryOfFinalDestination());
        copy.setPreCarriageBy(source.getPreCarriageBy());
        copy.setPlaceOfReceipt(source.getPlaceOfReceipt());
        copy.setVesselFlightNo(source.getVesselFlightNo());
        copy.setPortOfLoading(source.getPortOfLoading());
        copy.setPortOfDischarge(source.getPortOfDischarge());
        copy.setPortOfDelivery(source.getPortOfDelivery());
        copy.setHsCode(source.getHsCode());
        copy.setCommodity(source.getCommodity());
        copy.setTermsOfDelivery(source.getTermsOfDelivery());
        copy.setPaymentTerms(source.getPaymentTerms());
        copy.setCurrency(source.getCurrency());
        copy.setTaxTreatment(source.getTaxTreatment());
        copy.setPackingDetails(source.getPackingDetails());
        copy.setAuthorizedSignatory(source.getAuthorizedSignatory());
        copy.setDesignation(source.getDesignation());
        copy.setPlace(source.getPlace());
        copy.setAuthorizationDate(source.getAuthorizationDate());
        copy.setDiscountPct(source.getDiscountPct());
        copy.setCharges(source.getCharges());
        copy.setStatus("draft");
        copy.setPaymentStatus("unpaid");
        copy.setInvoiceDate(LocalDateTime.now());
        for (InvoiceItem sourceItem : source.getItems()) {
            InvoiceItem item = new InvoiceItem();
            copyItem(item, sourceItem);
            copy.addItem(item);
        }
        recalcTotals(copy);
        Invoice saved = invoiceRepository.save(copy);
        addTimeline(saved, "created", "Invoice created",
                "Duplicated from Invoice '" + source.getInvoiceNo() + "'.");
        addHistory(saved, "Invoice", null, saved.getInvoiceNo(), currentUserName());
        return toResponse(saved);
    }

    public int bulkArchive(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            Invoice invoice = getInvoice(id);
            if (!"archived".equals(invoice.getStatus()) && !"deleted".equals(invoice.getStatus())) {
                invoice.setStatus("archived");
                invoice.setArchivedAt(LocalDateTime.now());
                addTimeline(invoice, "archived", "Invoice archived",
                        "Invoice was archived by " + currentUserName() + ".");
                invoiceRepository.save(invoice);
                count++;
            }
        }
        return count;
    }

    public int bulkRestore(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            Invoice invoice = getInvoice(id);
            if ("archived".equals(invoice.getStatus()) || "deleted".equals(invoice.getStatus())) {
                invoice.setStatus("draft");
                invoice.setArchivedAt(null);
                addTimeline(invoice, "restored", "Invoice restored",
                        "Invoice was restored by " + currentUserName() + ".");
                invoiceRepository.save(invoice);
                count++;
            }
        }
        return count;
    }

    public int bulkDelete(List<Long> ids) {
        // Soft delete for trash parity with the single-delete endpoint: rows are
        // marked status="deleted" (and restorable) instead of being removed from
        // MySQL. Previously this hard-deleted rows while the UI said "trash".
        int count = 0;
        for (Long id : ids) {
            Invoice invoice = getInvoice(id);
            if (!"deleted".equals(invoice.getStatus())) {
                invoice.setStatus("deleted");
                invoice.setArchivedAt(LocalDateTime.now());
                addTimeline(invoice, "deleted", "Invoice deleted",
                        "Invoice was moved to trash by " + currentUserName() + ".");
                addHistory(invoice, "Status", null, "Deleted", currentUserName());
                invoiceRepository.save(invoice);
                count++;
            }
        }
        return count;
    }

    public int bulkPermanentDelete(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            Invoice invoice = getInvoice(id);
            // Remove the whole revision chain (base row + every revision row).
            Long baseId = invoice.getRevisionOf() != null ? invoice.getRevisionOf() : invoice.getId();
            List<Invoice> chain = new java.util.ArrayList<>();
            invoiceRepository.findById(baseId).ifPresent(chain::add);
            chain.addAll(invoiceRepository.findByRevisionOfOrderByRevisionDesc(baseId));
            for (Invoice inv : chain) {
                // Purge related rows so no orphaned attachments/timeline/history/
                // edit-history/revision-snapshots survive the hard delete.
                timelineRepository.deleteByModuleTypeAndModuleId(MODULE, inv.getId());
                historyRepository.deleteByModuleTypeAndModuleId(MODULE, inv.getId());
                attachmentRepository.deleteByModuleTypeAndModuleId(MODULE, inv.getId());
                editHistoryRepository.deleteByModuleTypeAndRecordId(MODULE, inv.getId());
                recordRevisionRepository.deleteByModuleTypeAndRecordId(MODULE, inv.getId());
            }
            invoiceRepository.deleteAll(chain);
            count++;
        }
        return count;
    }

    /** Invoice → Payment Receipt conversion. */
    public ConversionResult generatePaymentReceipt(Long id) {
        Invoice invoice = getInvoice(id);
        if ("deleted".equals(invoice.getStatus())) {
            throw new BadRequestException("Cannot generate a receipt from a deleted Invoice");
        }
        if (invoice.getConvertedToReceipt() != null && !invoice.getConvertedToReceipt().isBlank()) {
            throw new BadRequestException("Invoice already generated Payment Receipt " + invoice.getConvertedToReceipt());
        }
        PaymentReceipt receipt = new PaymentReceipt();
        receipt.setReceiptNo(buildReceiptNumber());
        receipt.setCompanyName(invoice.getCompanyName());
        receipt.setCompanyGstin(invoice.getCompanyGstin());
        receipt.setCompanyPan(invoice.getCompanyPan());
        receipt.setCompanyState(invoice.getCompanyState());
        receipt.setCompanyAddress(invoice.getCompanyAddress());
        receipt.setClientId(invoice.getClientId());
        receipt.setClientName(invoice.getClientName());
        receipt.setContactPerson(invoice.getContactPerson());
        receipt.setGstin(invoice.getGstin());
        receipt.setEmail(invoice.getEmail());
        receipt.setPhone(invoice.getPhone());
        receipt.setPaymentDate(LocalDateTime.now());
        receipt.setStatus("received");
        receipt.setSource("inv");
        receipt.setInvoiceRef(invoice.getInvoiceNo());
        receipt.setAmount(invoice.getGrandTotal());        paymentReceiptRepository.save(receipt);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, invoice.getId(), "payment-receipt", receipt.getId());

        invoice.setConvertedToReceipt(receipt.getReceiptNo());
        invoice.setStatus("paid");
        invoice.setPaymentStatus("paid");
        addTimeline(invoice, "paid", "Payment received",
                "Payment receipt " + receipt.getReceiptNo() + " generated. Invoice marked as Paid.");
        addHistory(invoice, "Status", null, "Paid", currentUserName());
        invoiceRepository.save(invoice);
        return new ConversionResult("payment-receipt", receipt.getId(), receipt.getReceiptNo(), "Payment Receipt " + receipt.getReceiptNo() + " created from Invoice " + invoice.getInvoiceNo());
    }

    /** Invoice → Credit Note conversion. */
    public ConversionResult convertToCreditNote(Long id) {
        Invoice invoice = getInvoice(id);
        if (invoice.getConvertedToCreditNote() != null && !invoice.getConvertedToCreditNote().isBlank()) {
            // Duplicate-conversion protection: never create a second Credit
            // Note. Return the existing one so the user can open it.
            CreditNote existing = creditNoteRepository.findByCnNo(invoice.getConvertedToCreditNote()).orElse(null);
            if (existing != null) {
                return new ConversionResult("credit-note", existing.getId(), existing.getCnNo(),
                        "A Credit Note has already been created from this Invoice.");
            }
            throw new BadRequestException("A Credit Note has already been created from this Invoice.");
        }
        CreditNote cn = new CreditNote();
        cn.setCnNo(buildCnNumber());
        cn.setCnDate(LocalDateTime.now());
        cn.setStatus("draft");
        cn.setSource("inv");
        cn.setSourceRef(invoice.getInvoiceNo());
        cn.setReason("Invoice converted to Credit Note");
        cn.setReasonDetail("Credit Note generated from Invoice " + invoice.getInvoiceNo());
        cn.setInventoryImpact("none");
        cn.setTaxType(invoice.getTaxType());
        cn.setHsnView(invoice.getHsnView());
        cn.setCurrency(invoice.getCurrency());
        cn.setTerms(invoice.getTerms());
        cn.setRemarks(invoice.getNotes());
        cn.setCompanyName(invoice.getCompanyName());
        cn.setCompanyGstin(invoice.getCompanyGstin());
        cn.setCompanyPan(invoice.getCompanyPan());
        cn.setCompanyState(invoice.getCompanyState());
        cn.setCompanyAddress(invoice.getCompanyAddress());
        cn.setClientId(invoice.getClientId());
        cn.setClientName(invoice.getClientName());
        cn.setContactPerson(invoice.getContactPerson());
        cn.setGstin(invoice.getGstin());
        cn.setEmail(invoice.getEmail());
        cn.setPhone(invoice.getPhone());
        for (InvoiceItem sourceItem : invoice.getItems()) {
            CreditNoteItem item = new CreditNoteItem();
            item.setDescription(sourceItem.getDescription());
            item.setSku(sourceItem.getSku());
            item.setDrawingNo(sourceItem.getDrawingNo());
            item.setMaterial(sourceItem.getMaterial());
            item.setDelivery(sourceItem.getDelivery());
            item.setHsn(sourceItem.getHsn());
            item.setUom(sourceItem.getUom());
            item.setQty(sourceItem.getQty());
            item.setRate(sourceItem.getRate());
            item.setDiscountPct(sourceItem.getDiscountPct());
            item.setGstRate(sourceItem.getGstRate());
            cn.addItem(item);
        }
        cn.setSubTotal(invoice.getSubTotal());
        cn.setDiscount(invoice.getDiscount());
        cn.setDiscountPct(invoice.getDiscountPct());
        cn.setTaxTotal(invoice.getTaxTotal());
        cn.setCgstTotal(invoice.getCgstTotal());
        cn.setSgstTotal(invoice.getSgstTotal());
        cn.setCharges(invoice.getCharges());
        cn.setGrandTotal(invoice.getGrandTotal());
        cn.setRefundAmount(invoice.getGrandTotal());
        CreditNote savedCn = creditNoteRepository.save(cn);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, invoice.getId(), "credit-note", savedCn.getId());
        // Traceability follows the Sales Order / Proforma Invoice → Credit Note
        // convention: the created Credit Note carries its own timeline and
        // history entry naming the Invoice it was generated from.
        addTargetTimeline("credit-note", savedCn.getId(), "created", "Credit Note created",
                "Credit Note '" + savedCn.getCnNo() + "' created from Invoice '" + invoice.getInvoiceNo() + "'.");
        addTargetHistory("credit-note", savedCn.getId(), "Credit Note", savedCn.getCnNo(), currentUserName());

        invoice.setConvertedToCreditNote(savedCn.getCnNo());
        addTimeline(invoice, "converted", "Credit Note created",
                "Credit Note " + savedCn.getCnNo() + " was created from this Invoice.");
        invoiceRepository.save(invoice);
        return new ConversionResult("credit-note", savedCn.getId(), savedCn.getCnNo(), "Credit Note " + savedCn.getCnNo() + " created from Invoice " + invoice.getInvoiceNo());
    }

    @Transactional(readOnly = true)
    public List<InvoiceResponse> export(String search, String status, String client,
                                        String dateFrom, String dateTo,
                                        BigDecimal minAmount, BigDecimal maxAmount) {
        Specification<Invoice> spec = buildSpecification(search, status, client, dateFrom, dateTo, minAmount, maxAmount);
        return invoiceRepository.findAll(spec).stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public String buildCsv(List<InvoiceResponse> invoices) {
        StringBuilder sb = new StringBuilder();
        sb.append("Invoice No,Date,Due Date,Client,Status,Payment Status,Items,Amount,Created\n");
        for (InvoiceResponse i : invoices) {
            sb.append(escapeCsv(i.invoiceNo())).append(',')
              .append(escapeCsv(i.date())).append(',')
              .append(escapeCsv(i.dueDate())).append(',')
              .append(escapeCsv(i.clientName())).append(',')
              .append(escapeCsv(i.status())).append(',')
              .append(escapeCsv(i.paymentStatus())).append(',')
              .append(i.itemsCount() == null ? "" : i.itemsCount()).append(',')
              .append(i.grandTotal() == null ? "" : i.grandTotal().toPlainString()).append(',')
              .append(escapeCsv(i.createdAt())).append('\n');
        }
        return sb.toString();
    }

    @Transactional(readOnly = true)
    public List<SalesTimelineResponse> getTimeline(Long id) {
        getInvoice(id);
        return timelineRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, id)
                .stream().map(this::timelineResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SalesHistoryResponse> getHistory(Long id) {
        getInvoice(id);
        return historyRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, id)
                .stream().map(this::historyResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SalesAttachmentResponse> getAttachments(Long id) {
        getInvoice(id);
        return attachmentRepository.findByModuleTypeAndModuleIdOrderByUploadedAtAsc(MODULE, id)
                .stream().map(this::attachmentResponse).toList();
    }

    public SalesAttachmentResponse addAttachment(Long id, MultipartFile file) {
        Invoice inv = getInvoice(id);
        String storedName = fileStorageService.store(file);
        SalesAttachment attachment = new SalesAttachment();
        attachment.setModuleType(MODULE);
        attachment.setModuleId(id);
        attachment.setName(file.getOriginalFilename());
        attachment.setStoredName(storedName);
        attachment.setContentType(file.getContentType());
        attachment.setSize(file.getSize());
        attachment.setUrl(baseUrl + "/v1/files/" + storedName);
        SalesAttachment saved = attachmentRepository.save(attachment);
        addTimeline(id, "attachment", "File attached", file.getOriginalFilename());
        documentRepositoryService.registerFromAttachment(
                file.getOriginalFilename(), "Invoice", id,
                inv.getInvoiceNo(), inv.getClientId(), inv.getClientName(),
                baseUrl + "/v1/files/" + storedName,
                file.getContentType(), file.getSize(),
                currentUserName(), DocumentVisibility.TEAM_ONLY);
        return attachmentResponse(saved);
    }

    public void deleteAttachment(Long id, Long attachmentId) {
        getInvoice(id);
        SalesAttachment attachment = attachmentRepository.findById(attachmentId)
                .filter(a -> MODULE.equals(a.getModuleType()) && id.equals(a.getModuleId()))
                .orElseThrow(() -> new ResourceNotFoundException("Attachment not found with id: " + attachmentId));
        attachmentRepository.delete(attachment);
    }

    private void copyForRevision(Invoice copy, Invoice source) {
        org.springframework.beans.BeanUtils.copyProperties(source, copy,
                "id", "items", "timeline", "revisionOf", "revision", "revisionDate", "latestRevision", "createdAt", "updatedAt", "archivedAt");
        for (InvoiceItem sourceItem : source.getItems()) {
            InvoiceItem item = new InvoiceItem();
            org.springframework.beans.BeanUtils.copyProperties(sourceItem, item,
                    "id", "invoice", "createdAt");
            copy.addItem(item);
        }
    }

    private int maxRevisionOfChain(Long baseId) {
        return invoiceRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .mapToInt(Invoice::getRevision)
                .max()
                .orElse(0);
    }

    /** Detail response — also carries the full revision chain for the UI. */
    private InvoiceResponse toResponseDetail(Invoice invoice) {
        return toResponse(invoice, revisionChain(invoice));
    }

    private List<RevisionInfo> revisionChain(Invoice invoice) {
        Long baseId = invoice.getRevisionOf() != null ? invoice.getRevisionOf() : invoice.getId();
        List<RevisionInfo> chain = new ArrayList<>();
        invoiceRepository.findById(baseId).ifPresent(q -> chain.add(revisionInfo(q)));
        invoiceRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .sorted(java.util.Comparator.comparingInt(Invoice::getRevision))
                .forEach(q -> chain.add(revisionInfo(q)));
        return chain;
    }

    private RevisionInfo revisionInfo(Invoice invoice) {
        return new RevisionInfo(
                invoice.getId(),
                invoice.getInvoiceNo(),
                invoice.getRevision(),
                invoice.getStatus(),
                invoice.getRevisionDate() == null
                        ? (invoice.getCreatedAt() == null ? null : invoice.getCreatedAt().toString())
                        : invoice.getRevisionDate().toString(),
                invoice.isLatestRevision());
    }

    /** When the latest revision is deleted, the previous one becomes latest. */
    private void promotePreviousRevision(Invoice removed) {
        if (!removed.isLatestRevision()) {
            return;
        }
        Long baseId = removed.getRevisionOf() != null ? removed.getRevisionOf() : removed.getId();
        // Highest remaining revision row first (revision >= 1).
        invoiceRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .filter(q -> !q.getId().equals(removed.getId()))
                .filter(q -> !"deleted".equals(q.getStatus()))
                .findFirst()
                .ifPresentOrElse(q -> {
                    q.setLatestRevision(true);
                    invoiceRepository.save(q);
                    removed.setLatestRevision(false);
                    invoiceRepository.save(removed);
                }, () -> invoiceRepository.findById(baseId).ifPresent(q -> {
                    // Fall back to the base row (revision 0) when no revision rows remain.
                    if (!q.getId().equals(removed.getId()) && !"deleted".equals(q.getStatus())) {
                        q.setLatestRevision(true);
                        invoiceRepository.save(q);
                        removed.setLatestRevision(false);
                        invoiceRepository.save(removed);
                    }
                }));
    }

    /** List/export response - carries no revision chain (avoids N+1). */
    private InvoiceResponse toResponse(Invoice entity) {
        return toResponse(entity, List.of());
    }

    private InvoiceResponse toResponse(Invoice invoice, List<RevisionInfo> revisions) {
        List<InvoiceItemResponse> itemResponses = invoice.getItems().stream().map(this::itemResponse).toList();
        BigDecimal totalQty = itemResponses.stream()
                .map(InvoiceItemResponse::qty)
                .filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new InvoiceResponse(
                invoice.getId(), invoice.getInvoiceNo(),
                invoice.getInvoiceType(),
                invoice.getCompanyName(), invoice.getCompanyGstin(), invoice.getCompanyPan(),
                invoice.getCompanyState(), invoice.getCompanyAddress(),
                invoice.getCompanyEmail(), invoice.getCompanyPhone(), invoice.getLutArn(),
                invoice.getInvoiceDate() == null ? null : invoice.getInvoiceDate().toLocalDate().toString(),
                invoice.getDueDate() == null ? null : invoice.getDueDate().toLocalDate().toString(),
                invoice.getReferenceNo(),
                invoice.getContractNo(),
                invoice.getContractDate() == null ? null : invoice.getContractDate().toLocalDate().toString(),
                invoice.getAppendixNo(),
                invoice.getAppendixDate() == null ? null : invoice.getAppendixDate().toLocalDate().toString(),
                invoice.getExporterRef(),
                invoice.getPoNo(),
                invoice.getPoDate() == null ? null : invoice.getPoDate().toLocalDate().toString(),
                invoice.getSource(), invoice.getSourceRef(),
                invoice.getStatus(), invoice.getPaymentStatus(),
                invoice.getBankName(), invoice.getBankAccount(), invoice.getBankIfsc(),
                invoice.getBankBranch(), invoice.getBankType(), invoice.getBankUpi(),
                invoice.getBankSwift(), invoice.getBankAddress(),
                invoice.getClientId(), invoice.getClientName(), invoice.getContactPerson(),
                invoice.getGstin(), invoice.getPan(), invoice.getEmail(), invoice.getPhone(),
                invoice.getBillingAddress(), invoice.isShipSameAsBill(), invoice.getShippingAddress(),
                invoice.getBuyerCountry(),
                invoice.getConsigneeName(), invoice.getConsigneeAddress(),
                invoice.getConsigneeCountry(), invoice.isConsigneeSameAsBuyer(),
                invoice.getTerms(),
                invoice.getTaxType(), invoice.getHsnView(), invoice.getNotes(),
                invoice.getCountryOfOrigin(), invoice.getCountryOfFinalDestination(),
                invoice.getPreCarriageBy(), invoice.getPlaceOfReceipt(),
                invoice.getVesselFlightNo(), invoice.getPortOfLoading(),
                invoice.getPortOfDischarge(), invoice.getPortOfDelivery(),
                invoice.getHsCode(), invoice.getCommodity(),
                invoice.getTermsOfDelivery(), invoice.getPaymentTerms(),
                invoice.getCurrency(), invoice.getTaxTreatment(), invoice.getPackingDetails(),
                invoice.getAuthorizedSignatory(), invoice.getDesignation(), invoice.getPlace(),
                invoice.getAuthorizationDate() == null ? null : invoice.getAuthorizationDate().toLocalDate().toString(),
                invoice.getSubTotal(), invoice.getDiscount(), invoice.getDiscountPct(),
                invoice.getCgstTotal(), invoice.getSgstTotal(), invoice.getTaxTotal(),
                invoice.getCharges(), invoice.getRoundOff(), invoice.getGrandTotal(),
                itemResponses.size(), totalQty,
                invoice.getConvertedToReceipt(), invoice.getConvertedToCreditNote(),
                invoice.getInvoiceDate() == null
                        ? (invoice.getCreatedAt() == null ? null : invoice.getCreatedAt().toLocalDate().toString())
                        : invoice.getInvoiceDate().toLocalDate().toString(),
                invoice.getCreatedAt() == null ? null : invoice.getCreatedAt().toString(),
                invoice.getUpdatedAt() == null ? null : invoice.getUpdatedAt().toString(),
                invoice.getArchivedAt() == null ? null : invoice.getArchivedAt().toString(),
                itemResponses,
                attachmentRepository.findByModuleTypeAndModuleIdOrderByUploadedAtAsc(MODULE, invoice.getId())
                        .stream().map(this::attachmentResponse).toList(),
                timelineRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, invoice.getId())
                        .stream().map(this::timelineResponse).toList(),
                historyRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, invoice.getId())
                        .stream().map(this::historyResponse).toList(),
                invoice.getRevision(),
                invoice.getRevisionOf(),
                invoice.isLatestRevision(),
                invoice.getRevisionDate() == null ? null : invoice.getRevisionDate().toString(),
                revisions
        );
    }

    private InvoiceItemResponse itemResponse(InvoiceItem item) {
        BigDecimal qty = nvl(item.getQty(), BigDecimal.ONE);
        BigDecimal rate = nvl(item.getRate(), BigDecimal.ZERO);
        BigDecimal discPct = nvl(item.getDiscountPct(), BigDecimal.ZERO);
        BigDecimal gst = nvl(item.getGstRate(), BigDecimal.ZERO);
        BigDecimal gross = qty.multiply(rate);
        BigDecimal discAmt = gross.multiply(discPct).divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP);
        BigDecimal net = gross.subtract(discAmt);
        BigDecimal cgst = net.multiply(gst).divide(BigDecimal.valueOf(200), 4, RoundingMode.HALF_UP);
        BigDecimal sgst = net.multiply(gst).divide(BigDecimal.valueOf(200), 4, RoundingMode.HALF_UP);
        BigDecimal total = net.add(cgst).add(sgst);
        return new InvoiceItemResponse(item.getId(), item.getDescription(), item.getSku(), item.getDrawingNo(), item.getMaterial(), item.getDelivery(), item.getHsn(),
                item.getManufacturer(), item.getCountryOfOrigin(), item.getUom(), qty, rate, discPct, gst,
                gross.setScale(2, RoundingMode.HALF_UP), discAmt.setScale(2, RoundingMode.HALF_UP),
                net.setScale(2, RoundingMode.HALF_UP), cgst.setScale(2, RoundingMode.HALF_UP),
                sgst.setScale(2, RoundingMode.HALF_UP), total.setScale(2, RoundingMode.HALF_UP));
    }

    private SalesAttachmentResponse attachmentResponse(SalesAttachment attachment) {
        return new SalesAttachmentResponse(attachment.getId(), attachment.getName(), attachment.getContentType(),
                attachment.getSize(), attachment.getUrl(),
                attachment.getUploadedAt() == null ? null : attachment.getUploadedAt().toString());
    }

    private SalesTimelineResponse timelineResponse(SalesTimeline entry) {
        return new SalesTimelineResponse(entry.getId(), entry.getType(), entry.getTitle(), entry.getDetail(),
                entry.getCreatedAt() == null ? null : entry.getCreatedAt().toString());
    }

    private SalesHistoryResponse historyResponse(SalesHistory entry) {
        return new SalesHistoryResponse(entry.getId(), entry.getField(), entry.getOldValue(), entry.getNewValue(),
                entry.getChangedBy(), entry.getCreatedAt() == null ? null : entry.getCreatedAt().toString());
    }

    private Invoice getInvoice(Long id) {
        return invoiceRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Invoice not found with id: " + id));
    }

    private void applyRequest(Invoice invoice, InvoiceRequest request) {
        invoice.setInvoiceType(request.invoiceType());
        invoice.setCompanyName(request.companyName());
        invoice.setCompanyGstin(request.companyGstin());
        invoice.setCompanyPan(request.companyPan());
        invoice.setCompanyState(request.companyState());
        invoice.setCompanyAddress(request.companyAddress());
        invoice.setCompanyEmail(request.companyEmail());
        invoice.setCompanyPhone(request.companyPhone());
        invoice.setLutArn(request.lutArn());
        invoice.setInvoiceDate(parseDate(request.invoiceDate()));
        invoice.setDueDate(parseDate(request.dueDate()));
        invoice.setReferenceNo(request.referenceNo());
        invoice.setContractNo(request.contractNo());
        invoice.setContractDate(parseDate(request.contractDate()));
        invoice.setAppendixNo(request.appendixNo());
        invoice.setAppendixDate(parseDate(request.appendixDate()));
        invoice.setExporterRef(request.exporterRef());
        invoice.setPoNo(request.poNo());
        invoice.setPoDate(parseDate(request.poDate()));
        invoice.setSource(request.source());
        invoice.setSourceRef(request.sourceRef());
        invoice.setBankName(request.bankName());
        invoice.setBankAccount(request.bankAccount());
        invoice.setBankIfsc(request.bankIfsc());
        invoice.setBankBranch(request.bankBranch());
        invoice.setBankType(request.bankType());
        invoice.setBankUpi(request.bankUpi());
        invoice.setBankSwift(request.bankSwift());
        invoice.setBankAddress(request.bankAddress());
        invoice.setClientId(request.clientId());
        invoice.setClientName(request.clientName());
        invoice.setContactPerson(request.contactPerson());
        invoice.setGstin(request.gstin());
        invoice.setPan(request.pan());
        invoice.setEmail(request.email());
        invoice.setPhone(request.phone());
        invoice.setBillingAddress(request.billingAddress());
        invoice.setShipSameAsBill(Boolean.TRUE.equals(request.shipSameAsBill()));
        invoice.setShippingAddress(request.shippingAddress());
        invoice.setBuyerCountry(request.buyerCountry());
        invoice.setConsigneeName(request.consigneeName());
        invoice.setConsigneeAddress(request.consigneeAddress());
        invoice.setConsigneeCountry(request.consigneeCountry());
        invoice.setConsigneeSameAsBuyer(Boolean.TRUE.equals(request.consigneeSameAsBuyer()));
        invoice.setTerms(request.terms());
        invoice.setTaxType(request.taxType());
        invoice.setHsnView(request.hsnView());
        invoice.setNotes(request.notes());
        invoice.setCountryOfOrigin(request.countryOfOrigin());
        invoice.setCountryOfFinalDestination(request.countryOfFinalDestination());
        invoice.setPreCarriageBy(request.preCarriageBy());
        invoice.setPlaceOfReceipt(request.placeOfReceipt());
        invoice.setVesselFlightNo(request.vesselFlightNo());
        invoice.setPortOfLoading(request.portOfLoading());
        invoice.setPortOfDischarge(request.portOfDischarge());
        invoice.setPortOfDelivery(request.portOfDelivery());
        invoice.setHsCode(request.hsCode());
        invoice.setCommodity(request.commodity());
        invoice.setTermsOfDelivery(request.termsOfDelivery());
        invoice.setPaymentTerms(request.paymentTerms());
        invoice.setCurrency(request.currency());
        invoice.setTaxTreatment(request.taxTreatment());
        invoice.setPackingDetails(request.packingDetails());
        invoice.setAuthorizedSignatory(request.authorizedSignatory());
        invoice.setDesignation(request.designation());
        invoice.setPlace(request.place());
        invoice.setAuthorizationDate(parseDate(request.authorizationDate()));
        invoice.setDiscountPct(request.discountPct() == null ? BigDecimal.ZERO : request.discountPct());
        invoice.setCharges(request.charges() == null ? BigDecimal.ZERO : request.charges());
        invoice.getItems().clear();
        if (request.items() != null) {
            for (InvoiceItemRequest itemRequest : request.items()) {
                if (itemRequest == null) {
                    continue;
                }
                InvoiceItem item = new InvoiceItem();
                item.setDescription(itemRequest.description());
                item.setSku(itemRequest.sku());
                item.setDrawingNo(itemRequest.drawingNo());
                item.setMaterial(itemRequest.material());
                item.setDelivery(itemRequest.delivery());
                item.setHsn(itemRequest.hsn());
                item.setManufacturer(itemRequest.manufacturer());
                item.setCountryOfOrigin(itemRequest.countryOfOrigin());
                item.setUom(itemRequest.uom());
                item.setQty(nvl(itemRequest.qty(), BigDecimal.ONE));
                item.setRate(nvl(itemRequest.rate(), BigDecimal.ZERO));
                item.setDiscountPct(nvl(itemRequest.discountPct(), BigDecimal.ZERO));
                item.setGstRate(nvl(itemRequest.gstRate(), BigDecimal.ZERO));
                invoice.addItem(item);
            }
        }
    }

    private void copyItem(InvoiceItem target, InvoiceItem source) {
        target.setDescription(source.getDescription());
        target.setSku(source.getSku());
        target.setDrawingNo(source.getDrawingNo());
        target.setMaterial(source.getMaterial());
        target.setDelivery(source.getDelivery());
        target.setHsn(source.getHsn());
        target.setManufacturer(source.getManufacturer());
        target.setCountryOfOrigin(source.getCountryOfOrigin());
        target.setUom(source.getUom());
        target.setQty(source.getQty());
        target.setRate(source.getRate());
        target.setDiscountPct(source.getDiscountPct());
        target.setGstRate(source.getGstRate());
    }

    private void recalcTotals(Invoice invoice) {
        boolean exportMode = "export".equals(invoice.getInvoiceType()) || "sez".equals(invoice.getInvoiceType());
        // Export under LUT / Bond — supply is made without payment of IGST, so
        // the tax totals stay zero regardless of any stray item GST rate.
        boolean lutNoIgst = exportMode && invoice.getTaxTreatment() != null
                && String.valueOf(invoice.getTaxTreatment()).toLowerCase().contains("lut");
        BigDecimal subTotal = BigDecimal.ZERO;
        BigDecimal cgstTotal = BigDecimal.ZERO;
        BigDecimal sgstTotal = BigDecimal.ZERO;
        for (InvoiceItem item : invoice.getItems()) {
            BigDecimal qty = nvl(item.getQty(), BigDecimal.ONE);
            BigDecimal rate = nvl(item.getRate(), BigDecimal.ZERO);
            BigDecimal discPct = nvl(item.getDiscountPct(), BigDecimal.ZERO);
            BigDecimal gst = lutNoIgst ? BigDecimal.ZERO : nvl(item.getGstRate(), BigDecimal.ZERO);
            BigDecimal gross = qty.multiply(rate);
            BigDecimal discAmt = gross.multiply(discPct).divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP);
            BigDecimal net = gross.subtract(discAmt);
            BigDecimal cgst = net.multiply(gst).divide(BigDecimal.valueOf(200), 4, RoundingMode.HALF_UP);
            BigDecimal sgst = net.multiply(gst).divide(BigDecimal.valueOf(200), 4, RoundingMode.HALF_UP);
            subTotal = subTotal.add(net);
            cgstTotal = cgstTotal.add(cgst);
            sgstTotal = sgstTotal.add(sgst);
        }
        invoice.setSubTotal(subTotal.setScale(2, RoundingMode.HALF_UP));
        invoice.setCgstTotal(cgstTotal.setScale(2, RoundingMode.HALF_UP));
        invoice.setSgstTotal(sgstTotal.setScale(2, RoundingMode.HALF_UP));
        BigDecimal taxTotal = cgstTotal.add(sgstTotal);
        invoice.setTaxTotal(taxTotal.setScale(2, RoundingMode.HALF_UP));
        BigDecimal discountPct = nvl(invoice.getDiscountPct(), BigDecimal.ZERO);
        BigDecimal discount = subTotal.multiply(discountPct).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        invoice.setDiscount(discount);
        BigDecimal charges = nvl(invoice.getCharges(), BigDecimal.ZERO);
        BigDecimal grand = subTotal.add(taxTotal).subtract(discount).add(charges);
        if (grand.compareTo(BigDecimal.ZERO) < 0) {
            grand = BigDecimal.ZERO;
        }
        if (exportMode) {
            // Foreign-currency export invoices keep exact decimals (no rounding).
            invoice.setRoundOff(BigDecimal.ZERO.setScale(2));
            invoice.setGrandTotal(grand.setScale(2, RoundingMode.HALF_UP));
        } else {
            // Round off to the nearest rupee, store the difference like the original ERP
            BigDecimal rounded = grand.setScale(0, RoundingMode.HALF_UP);
            invoice.setRoundOff(rounded.subtract(grand).setScale(2, RoundingMode.HALF_UP));
            invoice.setGrandTotal(rounded);
        }
    }

    /**
     * Predicate keeping only the CURRENT row of each revision chain. A row is
     * kept when it is flagged latestRevision OR no other row in the same chain
     * (chain key = revisionOf, or the row id for the base) carries a strictly
     * higher revision number. Legacy base rows without a revision chain always
     * survive this filter, so the main list never shows older revisions as
     * separate rows (they remain reachable via the revision-history dropdown).
     */
    private Predicate latestPerChainPredicate(jakarta.persistence.criteria.Root<Invoice> root, jakarta.persistence.criteria.CriteriaQuery<?> query, jakarta.persistence.criteria.CriteriaBuilder cb) {
        Subquery<Long> newer = query.subquery(Long.class);
        jakarta.persistence.criteria.Root<Invoice> newerRoot = newer.from(Invoice.class);
        newer.select(newerRoot.get("id"));
        newer.where(cb.and(
                cb.equal(newerRoot.get("revisionOf"),
                        cb.coalesce(root.get("revisionOf"), root.get("id"))),
                cb.greaterThan(cb.coalesce(newerRoot.get("revision"), 0),
                        cb.coalesce(root.get("revision"), 0))));
        return cb.or(cb.isTrue(root.get("latestRevision")), cb.not(cb.exists(newer)));
    }

    private Specification<Invoice> buildSpecification(String search, String status, String client,
                                                      String dateFrom, String dateTo,
                                                      BigDecimal minAmount, BigDecimal maxAmount) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(latestPerChainPredicate(root, query, cb));
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("invoiceNo")), like),
                        cb.like(cb.lower(root.get("clientName")), like),
                        cb.like(cb.lower(root.get("referenceNo")), like),
                        cb.like(cb.lower(root.get("sourceRef")), like),
                        cb.like(cb.lower(cb.toString(root.get("contactPerson"))), like)
                ));
            }
            if (status != null && !status.isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("status")), status.trim().toLowerCase()));
            } else {
                predicates.add(cb.not(root.get("status").in("archived", "deleted")));
            }
            if (client != null && !client.isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("clientName")), client.trim().toLowerCase()));
            }
            if (dateFrom != null && !dateFrom.isBlank()) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("invoiceDate"), LocalDate.parse(dateFrom).atStartOfDay()));
            }
            if (dateTo != null && !dateTo.isBlank()) {
                predicates.add(cb.lessThanOrEqualTo(root.get("invoiceDate"), LocalDate.parse(dateTo).atTime(23, 59, 59)));
            }
            if (minAmount != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("grandTotal"), minAmount));
            }
            if (maxAmount != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("grandTotal"), maxAmount));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Sort buildSort(String sort) {
        if (sort == null || sort.isBlank()) {
            return Sort.by(Sort.Direction.DESC, "createdAt");
        }
        String[] parts = sort.split(",");
        String field = parts[0];
        String mapped = switch (field) {
            case "clientName", "invoiceDate", "dueDate", "grandTotal", "status", "createdAt", "updatedAt", "invoiceNo"
                    -> "invoiceNo".equals(field) ? "invoiceNo" : field;
            case "id" -> "invoiceNo";
            default -> "createdAt";
        };
        boolean asc = parts.length > 1 && "asc".equalsIgnoreCase(parts[1]);
        return Sort.by(asc ? Sort.Direction.ASC : Sort.Direction.DESC, mapped);
    }

    private long nextSequence() {
        long count = invoiceRepository.count();
        long maxSuffix = 0;
        String prefix = "INV-" + Year.now().getValue() + "-";
        for (String no : invoiceRepository.findAllInvoiceNos()) {
            if (no != null && no.startsWith(prefix)) {
                try {
                    maxSuffix = Math.max(maxSuffix, Long.parseLong(no.substring(prefix.length())));
                } catch (NumberFormatException ignored) {
                    // skip malformed numbers
                }
            }
        }
        return Math.max(count, maxSuffix) + 1;
    }

    private String buildNo(long sequence) {
        return String.format("INV-%d-%06d", Year.now().getValue(), sequence);
    }

    private String buildReceiptNumber() {
        long maxSuffix = 0;
        String prefix = "PR-" + Year.now().getValue() + "-";
        for (String no : paymentReceiptRepository.findAllReceiptNos()) {
            if (no != null && no.startsWith(prefix)) {
                try {
                    maxSuffix = Math.max(maxSuffix, Long.parseLong(no.substring(prefix.length())));
                } catch (NumberFormatException ignored) {
                    // skip malformed numbers
                }
            }
        }
        return String.format("PR-%d-%06d", Year.now().getValue(), Math.max(paymentReceiptRepository.count(), maxSuffix) + 1);
    }

    private String buildCnNumber() {
        long maxSuffix = 0;
        String prefix = "CN-" + Year.now().getValue() + "-";
        for (String no : creditNoteRepository.findAllCnNos()) {
            if (no != null && no.startsWith(prefix)) {
                try {
                    maxSuffix = Math.max(maxSuffix, Long.parseLong(no.substring(prefix.length())));
                } catch (NumberFormatException ignored) {
                    // skip malformed numbers
                }
            }
        }
        return String.format("CN-%d-%06d", Year.now().getValue(), Math.max(creditNoteRepository.count(), maxSuffix) + 1);
    }

    private LocalDateTime parseDate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            if (value.length() <= 10) {
                return LocalDate.parse(value, DATE_FMT).atStartOfDay();
            }
            return LocalDateTime.parse(value);
        } catch (Exception e) {
            return null;
        }
    }

    private String normalizeStatus(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase().replace(" ", "_");
        return switch (normalized) {
            case "sent" -> "sent";
            case "partial_paid", "partial paid" -> "partial paid";
            case "paid" -> "paid";
            case "overdue" -> "overdue";
            case "cancelled" -> "cancelled";
            case "archived" -> "archived";
            case "deleted" -> "deleted";
            default -> "draft";
        };
    }

    private String titleCase(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String normalized = value.replace("_", " ");
        return normalized.substring(0, 1).toUpperCase() + normalized.substring(1).toLowerCase();
    }

    private String escapeCsv(String value) {
        if (value == null) {
            return "";
        }
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }

    private BigDecimal nvl(BigDecimal value, BigDecimal fallback) {
        return value == null ? fallback : value;
    }

    private String currentUserName() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getName() != null && !"anonymousUser".equals(auth.getName())) {
            return auth.getName();
        }
        return "System";
    }

    private void addTimeline(Invoice invoice, String type, String title, String detail) {
        SalesTimeline entry = new SalesTimeline();
        entry.setModuleType(MODULE);
        entry.setModuleId(invoice.getId());
        entry.setType(type);
        entry.setTitle(title);
        entry.setDetail(detail);
        timelineRepository.save(entry);
    }

    private void addTimeline(Long id, String type, String title, String detail) {
        SalesTimeline entry = new SalesTimeline();
        entry.setModuleType(MODULE);
        entry.setModuleId(id);
        entry.setType(type);
        entry.setTitle(title);
        entry.setDetail(detail);
        timelineRepository.save(entry);
    }

    private void addHistory(Invoice invoice, String field, String oldValue, String newValue, String changedBy) {
        SalesHistory entry = new SalesHistory();
        entry.setModuleType(MODULE);
        entry.setModuleId(invoice.getId());
        entry.setField(field);
        entry.setOldValue(oldValue);
        entry.setNewValue(newValue);
        entry.setChangedBy(changedBy);
        historyRepository.save(entry);
    }

    /** Adds a timeline entry for a document created by a conversion (different module). */
    private void addTargetTimeline(String module, Long id, String type, String title, String detail) {
        SalesTimeline entry = new SalesTimeline();
        entry.setModuleType(module);
        entry.setModuleId(id);
        entry.setType(type);
        entry.setTitle(title);
        entry.setDetail(detail);
        timelineRepository.save(entry);
    }

    /** Adds a history entry for a document created by a conversion (different module). */
    private void addTargetHistory(String module, Long id, String field, String newValue, String changedBy) {
        SalesHistory entry = new SalesHistory();
        entry.setModuleType(module);
        entry.setModuleId(id);
        entry.setField(field);
        entry.setOldValue(null);
        entry.setNewValue(newValue);
        entry.setChangedBy(changedBy);
        historyRepository.save(entry);
    }
}
