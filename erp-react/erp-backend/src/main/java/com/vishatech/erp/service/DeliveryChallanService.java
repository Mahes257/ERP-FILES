package com.vishatech.erp.service;
import com.vishatech.erp.dto.ConversionResult;

import com.vishatech.erp.dto.DeliveryChallanItemRequest;
import com.vishatech.erp.dto.DeliveryChallanItemResponse;
import com.vishatech.erp.dto.DeliveryChallanNextNumberResponse;
import com.vishatech.erp.dto.DeliveryChallanRequest;
import com.vishatech.erp.dto.DeliveryChallanResponse;
import com.vishatech.erp.dto.SalesAttachmentResponse;
import com.vishatech.erp.dto.SalesHistoryResponse;
import com.vishatech.erp.dto.SalesTimelineResponse;
import com.vishatech.erp.dto.RevisionInfo;
import com.vishatech.erp.entity.CreditNote;
import com.vishatech.erp.entity.CreditNoteItem;
import com.vishatech.erp.entity.DeliveryChallan;
import com.vishatech.erp.entity.DeliveryChallanItem;
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
import com.vishatech.erp.repository.DeliveryChallanRepository;
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
public class DeliveryChallanService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final String MODULE = "delivery-challan";

    private final DeliveryChallanRepository deliveryChallanRepository;
    private final InvoiceRepository invoiceRepository;
    private final CreditNoteRepository creditNoteRepository;
    private final PaymentReceiptRepository paymentReceiptRepository;
    private final SalesTimelineRepository timelineRepository;
    private final SalesHistoryRepository historyRepository;
    private final SalesAttachmentRepository attachmentRepository;
    private final EditHistoryRepository editHistoryRepository;
    private final RecordRevisionRepository recordRevisionRepository;
    private final FileStorageService fileStorageService;
    private final DocumentRepositoryService documentRepositoryService;
    private final String baseUrl;

    public DeliveryChallanService(DeliveryChallanRepository deliveryChallanRepository,
                                  InvoiceRepository invoiceRepository,
                                  CreditNoteRepository creditNoteRepository,
                                  PaymentReceiptRepository paymentReceiptRepository,
                                  SalesTimelineRepository timelineRepository,
                                  SalesHistoryRepository historyRepository,
                                  SalesAttachmentRepository attachmentRepository,
                                  EditHistoryRepository editHistoryRepository,
                                  RecordRevisionRepository recordRevisionRepository,
                                  FileStorageService fileStorageService,
                                  DocumentRepositoryService documentRepositoryService,
                                  @Value("${app.base-url:http://localhost:8080}") String baseUrl) {
        this.deliveryChallanRepository = deliveryChallanRepository;
        this.invoiceRepository = invoiceRepository;
        this.creditNoteRepository = creditNoteRepository;
        this.paymentReceiptRepository = paymentReceiptRepository;
        this.timelineRepository = timelineRepository;
        this.historyRepository = historyRepository;
        this.attachmentRepository = attachmentRepository;
        this.editHistoryRepository = editHistoryRepository;
        this.recordRevisionRepository = recordRevisionRepository;
        this.fileStorageService = fileStorageService;
        this.documentRepositoryService = documentRepositoryService;
        this.baseUrl = baseUrl;
    }

    @Transactional(readOnly = true)
    public Page<DeliveryChallanResponse> list(int page, int size, String search, String sort,
                                              String status, String client, String soRef,
                                              String dateFrom, String dateTo,
                                              BigDecimal minAmount, BigDecimal maxAmount) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort));
        Specification<DeliveryChallan> spec = buildSpecification(search, status, client, soRef,
                dateFrom, dateTo, minAmount, maxAmount);
        return deliveryChallanRepository.findAll(spec, pageable).map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public DeliveryChallanResponse get(Long id) {
        return toResponseDetail(getDc(id));
    }

    @Transactional(readOnly = true)
    public DeliveryChallanNextNumberResponse getNextNumber() {
        long next = nextSequence();
        return new DeliveryChallanNextNumberResponse(buildNo(next), next);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> stats() {
        List<String> excluded = List.of("archived", "deleted");
        Map<String, Object> stats = new LinkedHashMap<>();
        long active = 0;
        // Count only the CURRENT revision of each chain so KPI cards match
        // the list rows (older revisions are surfaced through the Document
        // Workflow dropdown, never as separate list rows).
        for (String status : List.of("draft", "packed", "dispatched", "in transit", "delivered", "cancelled")) {
            long count = deliveryChallanRepository.countCurrentByStatus(status);
            stats.put(status.replace(" ", ""), count);
            active += count;
        }
        stats.put("total", active);
        stats.put("active", active);
        stats.put("archived", deliveryChallanRepository.countCurrentByStatus("archived"));
        stats.put("deleted", deliveryChallanRepository.countCurrentByStatus("deleted"));
        stats.put("totalAmt", deliveryChallanRepository.sumGrandTotalExcluding(excluded));
        return stats;
    }

    public DeliveryChallanResponse create(DeliveryChallanRequest request, boolean draft) {
        DeliveryChallan dc = new DeliveryChallan();
        if (request.dcNo() != null && !request.dcNo().isBlank()) {
            if (deliveryChallanRepository.existsByDcNo(request.dcNo().trim())) {
                throw new BadRequestException("Delivery Challan number already exists: " + request.dcNo());
            }
            dc.setDcNo(request.dcNo().trim());
        } else {
            dc.setDcNo(buildNo(nextSequence()));
        }
        applyRequest(dc, request);
        if (draft) {
            dc.setStatus("draft");
        } else if (request.status() != null && !request.status().isBlank()) {
            dc.setStatus(normalizeStatus(request.status()));
        } else {
            dc.setStatus("draft");
        }
        recalcTotals(dc);
        // Persist first so the generated id is available for timeline/history rows
        // (their module_id column is NOT NULL).
        DeliveryChallan saved = deliveryChallanRepository.saveAndFlush(dc);
        addTimeline(saved, "created", "Delivery Challan created",
                "Delivery Challan '" + saved.getDcNo() + "' was created.");
        addHistory(saved, "Delivery Challan", null, saved.getDcNo(), currentUserName());
        return toResponse(saved);
    }

    /**
     * Every edit creates a NEW revision row (BASE(N)); the previous version is
     * never deleted or overwritten. Only the latest revision is editable.
     */
    public DeliveryChallanResponse update(Long id, DeliveryChallanRequest request) {
        DeliveryChallan current = getDc(id);
        if (!current.isLatestRevision()) {
            throw new BadRequestException("Only the latest revision can be edited");
        }
        Long baseId = current.getRevisionOf() != null ? current.getRevisionOf() : current.getId();
        int nextRev = maxRevisionOfChain(baseId) + 1;

        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(current);

        DeliveryChallan revision = new DeliveryChallan();
        copyForRevision(revision, current);
        applyRequest(revision, request);
        if (request.status() != null && !request.status().isBlank()) {
            revision.setStatus(normalizeStatus(request.status()));
        }
        recalcTotals(revision);
        revision.setDcNo(RevisionSupport.nextRevisionNumber(
                RevisionSupport.baseNumber(current.getDcNo()), nextRev));
        revision.setRevisionOf(baseId);
        revision.setRevision(nextRev);
        revision.setRevisionDate(java.time.LocalDateTime.now());
        revision.setLatestRevision(true);

        current.setLatestRevision(false);
        deliveryChallanRepository.save(current);
        DeliveryChallan saved = deliveryChallanRepository.saveAndFlush(revision);
        addTimeline(saved, "revision", "Revision " + nextRev + " created",
                "Revision '" + saved.getDcNo() + "' created from '" + current.getDcNo()
                        + "' by " + currentUserName() + ".");
        editHistory.recordEdit("delivery-challan", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponseDetail(saved);
    }

    public DeliveryChallanResponse delete(Long id) {
        DeliveryChallan dc = getDc(id);
        RevisionSupport.requireLatest(dc.isLatestRevision());
        dc.setStatus("deleted");
        dc.setArchivedAt(LocalDateTime.now());
        addTimeline(dc, "deleted", "Delivery Challan deleted",
                "Delivery Challan was moved to trash by " + currentUserName() + ".");
        addHistory(dc, "Status", null, "Deleted", currentUserName());
        return toResponse(deliveryChallanRepository.save(dc));
    }

    public DeliveryChallanResponse restore(Long id) {
        DeliveryChallan dc = getDc(id);
        RevisionSupport.requireLatest(dc.isLatestRevision());
        String previous = dc.getStatus();
        String target = ("deleted".equals(previous) || "archived".equals(previous)) ? "draft" : previous;
        dc.setStatus(target);
        dc.setArchivedAt(null);
        addTimeline(dc, "restored", "Delivery Challan restored",
                "Delivery Challan was restored by " + currentUserName() + ".");
        addHistory(dc, "Status", titleCase(previous), titleCase(target), currentUserName());
        return toResponse(deliveryChallanRepository.save(dc));
    }

    public DeliveryChallanResponse archive(Long id) {
        DeliveryChallan dc = getDc(id);
        RevisionSupport.requireLatest(dc.isLatestRevision());
        dc.setStatus("archived");
        dc.setArchivedAt(LocalDateTime.now());
        addTimeline(dc, "archived", "Delivery Challan archived",
                "Delivery Challan was archived by " + currentUserName() + ".");
        addHistory(dc, "Status", null, "Archived", currentUserName());
        return toResponse(deliveryChallanRepository.save(dc));
    }

    public DeliveryChallanResponse changeStatus(Long id, String status) {
        DeliveryChallan dc = getDc(id);
        RevisionSupport.requireLatest(dc.isLatestRevision());
        String normalized = normalizeStatus(status);
        if ("deleted".equals(dc.getStatus())) {
            throw new BadRequestException("Cannot change status of a deleted Delivery Challan");
        }
        dc.setStatus(normalized);
        addTimeline(dc, "status", "Status changed",
                "Status changed to '" + titleCase(normalized) + "' by " + currentUserName() + ".");
        addHistory(dc, "Status", null, titleCase(normalized), currentUserName());
        return toResponse(deliveryChallanRepository.save(dc));
    }

    public DeliveryChallanResponse duplicate(Long id) {
        DeliveryChallan source = getDc(id);
        DeliveryChallan copy = new DeliveryChallan();
        copy.setDcNo(buildNo(nextSequence()));
        copy.setSoRef(source.getSoRef());
        copy.setScRef(source.getScRef());
        copy.setClientId(source.getClientId());
        copy.setClientName(source.getClientName());
        copy.setContactPerson(source.getContactPerson());
        copy.setEmail(source.getEmail());
        copy.setPhone(source.getPhone());
        copy.setBillingAddress(source.getBillingAddress());
        copy.setShippingAddress(source.getShippingAddress());
        copy.setCity(source.getCity());
        copy.setState(source.getState());
        copy.setTransportCompany(source.getTransportCompany());
        copy.setVehicleNumber(source.getVehicleNumber());
        copy.setDriverName(source.getDriverName());
        copy.setDriverPhone(source.getDriverPhone());
        copy.setLrNumber(source.getLrNumber());
        copy.setEwayBill(source.getEwayBill());
        copy.setNotes(source.getNotes());
        copy.setTerms(source.getTerms());
        copy.setDiscount(source.getDiscount());
        copy.setCharges(source.getCharges());
        copy.setDispatchDate(source.getDispatchDate());
        copy.setDeliveryDate(source.getDeliveryDate());
        copy.setStatus("draft");
        copy.setDcDate(LocalDateTime.now());
        for (DeliveryChallanItem sourceItem : source.getItems()) {
            DeliveryChallanItem item = new DeliveryChallanItem();
            copyItem(item, sourceItem);
            copy.addItem(item);
        }
        recalcTotals(copy);
        // Persist first so the generated id is available for timeline/history rows
        // (their module_id column is NOT NULL).
        DeliveryChallan saved = deliveryChallanRepository.saveAndFlush(copy);
        addTimeline(saved, "created", "Delivery Challan created",
                "Duplicated from Delivery Challan '" + source.getDcNo() + "'.");
        addHistory(saved, "Delivery Challan", null, saved.getDcNo(), currentUserName());
        return toResponse(saved);
    }

    public int bulkArchive(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            DeliveryChallan dc = getDc(id);
            if (!"archived".equals(dc.getStatus()) && !"deleted".equals(dc.getStatus())) {
                dc.setStatus("archived");
                dc.setArchivedAt(LocalDateTime.now());
                addTimeline(dc, "archived", "Delivery Challan archived",
                        "Delivery Challan was archived by " + currentUserName() + ".");
                deliveryChallanRepository.save(dc);
                count++;
            }
        }
        return count;
    }

    public int bulkRestore(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            DeliveryChallan dc = getDc(id);
            if ("archived".equals(dc.getStatus()) || "deleted".equals(dc.getStatus())) {
                dc.setStatus("draft");
                dc.setArchivedAt(null);
                addTimeline(dc, "restored", "Delivery Challan restored",
                        "Delivery Challan was restored by " + currentUserName() + ".");
                deliveryChallanRepository.save(dc);
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
            DeliveryChallan dc = getDc(id);
            if (!"deleted".equals(dc.getStatus())) {
                dc.setStatus("deleted");
                dc.setArchivedAt(LocalDateTime.now());
                addTimeline(dc, "deleted", "Delivery Challan deleted",
                        "Delivery Challan was moved to trash by " + currentUserName() + ".");
                addHistory(dc, "Status", null, "Deleted", currentUserName());
                deliveryChallanRepository.save(dc);
                count++;
            }
        }
        return count;
    }

    public int bulkPermanentDelete(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            DeliveryChallan dc = getDc(id);
            // Remove the whole revision chain (base row + every revision row).
            Long baseId = dc.getRevisionOf() != null ? dc.getRevisionOf() : dc.getId();
            List<DeliveryChallan> chain = new java.util.ArrayList<>();
            deliveryChallanRepository.findById(baseId).ifPresent(chain::add);
            chain.addAll(deliveryChallanRepository.findByRevisionOfOrderByRevisionDesc(baseId));
            for (DeliveryChallan d : chain) {
                // Purge related rows so no orphaned attachments/timeline/history/
                // edit-history/revision-snapshots survive the hard delete.
                timelineRepository.deleteByModuleTypeAndModuleId(MODULE, d.getId());
                historyRepository.deleteByModuleTypeAndModuleId(MODULE, d.getId());
                attachmentRepository.deleteByModuleTypeAndModuleId(MODULE, d.getId());
                editHistoryRepository.deleteByModuleTypeAndRecordId(MODULE, d.getId());
                recordRevisionRepository.deleteByModuleTypeAndRecordId(MODULE, d.getId());
            }
            deliveryChallanRepository.deleteAll(chain);
            count++;
        }
        return count;
    }

    /** Delivery Challan → Invoice conversion (ERP: Generate Invoice). */
    public ConversionResult convertToInvoice(Long id) {
        DeliveryChallan dc = getDc(id);
        if (dc.getConvertedToInvoice() != null && !dc.getConvertedToInvoice().isBlank()) {
            throw new BadRequestException("Delivery Challan already converted to " + dc.getConvertedToInvoice());
        }
        Invoice invoice = new Invoice();
        invoice.setInvoiceNo(buildInvoiceNumber());
        invoice.setInvoiceDate(LocalDateTime.now());
        invoice.setStatus("draft");
        invoice.setSource("dc");
        invoice.setSourceRef(dc.getDcNo());
        invoice.setClientId(dc.getClientId());
        invoice.setClientName(dc.getClientName());
        invoice.setContactPerson(dc.getContactPerson());
        invoice.setEmail(dc.getEmail());
        invoice.setPhone(dc.getPhone());
        invoice.setBillingAddress(dc.getBillingAddress());
        invoice.setShippingAddress(dc.getShippingAddress());
        invoice.setTerms(dc.getTerms());
        invoice.setNotes(dc.getNotes());
        for (DeliveryChallanItem sourceItem : dc.getItems()) {
            InvoiceItem item = new InvoiceItem();
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
            invoice.addItem(item);
        }
        invoice.setSubTotal(dc.getSubTotal());
        invoice.setDiscount(dc.getDiscount());
        invoice.setDiscountPct(dc.getDiscountPct());
        invoice.setTaxTotal(dc.getTaxTotal());
        invoice.setCgstTotal(dc.getCgstTotal());
        invoice.setSgstTotal(dc.getSgstTotal());
        invoice.setCharges(dc.getCharges());
        invoice.setGrandTotal(dc.getGrandTotal());        Invoice savedInvoice = invoiceRepository.save(invoice);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, dc.getId(), "invoice", savedInvoice.getId());

        addTargetTimeline("invoice", savedInvoice.getId(), "created", "Invoice created",
                "Invoice '" + savedInvoice.getInvoiceNo() + "' created from Delivery Challan '" + dc.getDcNo() + "'.");
        addTargetHistory("invoice", savedInvoice.getId(), "Invoice", savedInvoice.getInvoiceNo(), currentUserName());

        dc.setStatus("converted");
        dc.setConvertedToInvoice(invoice.getInvoiceNo());
        addTimeline(dc, "converted", "Converted to Invoice",
                "Delivery Challan converted to Invoice " + invoice.getInvoiceNo() + ".");
        addHistory(dc, "Status", null, "Converted", currentUserName());
        deliveryChallanRepository.save(dc);
        return new ConversionResult("invoice", savedInvoice.getId(), savedInvoice.getInvoiceNo(), "Invoice " + savedInvoice.getInvoiceNo() + " created from Delivery Challan " + dc.getDcNo());
    }

    private boolean isNotBlank(String value) {
        return value != null && !value.isBlank();
    }

    /** Delivery Challan → Credit Note conversion. */
    public ConversionResult convertToCreditNote(Long id) {
        DeliveryChallan dc = getDc(id);
        if (isNotBlank(dc.getConvertedToCn())) {
            throw new BadRequestException("Delivery Challan already converted to Credit Note " + dc.getConvertedToCn());
        }
        CreditNote cn = new CreditNote();
        cn.setCnNo(buildCnNumber());
        cn.setCnDate(LocalDateTime.now());
        cn.setStatus("draft");
        cn.setSource("delivery-challan");
        cn.setSourceRef(dc.getDcNo());
        cn.setTaxType(dc.getTaxType());
        cn.setHsnView(dc.getHsnView());
        cn.setTerms(dc.getTerms());
        cn.setRemarks(dc.getNotes());
        cn.setReason("Delivery Challan converted to Credit Note");
        cn.setReasonDetail("Credit Note generated from Delivery Challan " + dc.getDcNo());
        cn.setInventoryImpact("none");
        cn.setClientId(dc.getClientId());
        cn.setClientName(dc.getClientName());
        cn.setContactPerson(dc.getContactPerson());
        cn.setEmail(dc.getEmail());
        cn.setPhone(dc.getPhone());
        for (DeliveryChallanItem sourceItem : dc.getItems()) {
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
        cn.setSubTotal(dc.getSubTotal());
        cn.setDiscount(dc.getDiscount());
        cn.setTaxTotal(dc.getTaxTotal());
        cn.setCgstTotal(dc.getCgstTotal());
        cn.setSgstTotal(dc.getSgstTotal());
        cn.setCharges(dc.getCharges());
        cn.setGrandTotal(dc.getGrandTotal());
        cn.setRefundAmount(dc.getGrandTotal());
        CreditNote savedCn = creditNoteRepository.save(cn);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, dc.getId(), "credit-note", savedCn.getId());
        addTargetTimeline("credit-note", savedCn.getId(), "created", "Credit Note created",
                "Credit Note '" + savedCn.getCnNo() + "' created from Delivery Challan '" + dc.getDcNo() + "'.");
        addTargetHistory("credit-note", savedCn.getId(), "Credit Note", savedCn.getCnNo(), currentUserName());

        dc.setStatus("converted");
        dc.setConvertedToCn(savedCn.getCnNo());
        addTimeline(dc, "converted", "Converted to Credit Note",
                "Delivery Challan converted to Credit Note " + savedCn.getCnNo() + ".");
        addHistory(dc, "Status", null, "Converted", currentUserName());
        deliveryChallanRepository.save(dc);
        return new ConversionResult("credit-note", savedCn.getId(), savedCn.getCnNo(), "Credit Note " + savedCn.getCnNo() + " created from Delivery Challan " + dc.getDcNo());
    }

    /** Delivery Challan → Payment Receipt conversion. */
    public ConversionResult convertToPaymentReceipt(Long id) {
        DeliveryChallan dc = getDc(id);
        if (isNotBlank(dc.getConvertedToPr())) {
            throw new BadRequestException("Delivery Challan already converted to Payment Receipt " + dc.getConvertedToPr());
        }
        PaymentReceipt receipt = new PaymentReceipt();
        receipt.setReceiptNo(buildPrNumber());
        receipt.setPaymentDate(LocalDateTime.now());
        receipt.setStatus("draft");
        receipt.setSource("delivery-challan");
        receipt.setInvoiceRef(dc.getDcNo());
        receipt.setClientId(dc.getClientId());
        receipt.setClientName(dc.getClientName());
        receipt.setContactPerson(dc.getContactPerson());
        receipt.setEmail(dc.getEmail());
        receipt.setPhone(dc.getPhone());
        receipt.setAmount(dc.getGrandTotal());
        receipt.setRemarks("Payment receipt generated from Delivery Challan " + dc.getDcNo());
        PaymentReceipt savedPr = paymentReceiptRepository.save(receipt);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, dc.getId(), "payment-receipt", savedPr.getId());
        addTargetTimeline("payment-receipt", savedPr.getId(), "created", "Payment Receipt created",
                "Payment Receipt '" + savedPr.getReceiptNo() + "' created from Delivery Challan '" + dc.getDcNo() + "'.");
        addTargetHistory("payment-receipt", savedPr.getId(), "Payment Receipt", savedPr.getReceiptNo(), currentUserName());

        dc.setStatus("converted");
        dc.setConvertedToPr(savedPr.getReceiptNo());
        addTimeline(dc, "converted", "Converted to Payment Receipt",
                "Delivery Challan converted to Payment Receipt " + savedPr.getReceiptNo() + ".");
        addHistory(dc, "Status", null, "Converted", currentUserName());
        deliveryChallanRepository.save(dc);
        return new ConversionResult("payment-receipt", savedPr.getId(), savedPr.getReceiptNo(), "Payment Receipt " + savedPr.getReceiptNo() + " created from Delivery Challan " + dc.getDcNo());
    }

    @Transactional(readOnly = true)
    public List<DeliveryChallanResponse> export(String search, String status, String client, String soRef,
                                                String dateFrom, String dateTo,
                                                BigDecimal minAmount, BigDecimal maxAmount) {
        Specification<DeliveryChallan> spec = buildSpecification(search, status, client, soRef,
                dateFrom, dateTo, minAmount, maxAmount);
        return deliveryChallanRepository.findAll(spec).stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public String buildCsv(List<DeliveryChallanResponse> dcs) {
        StringBuilder sb = new StringBuilder();
        sb.append("DC No,Date,Sales Order,Client,Status,Items,Amount,Created\n");
        for (DeliveryChallanResponse d : dcs) {
            sb.append(escapeCsv(d.dcNo())).append(',')
              .append(escapeCsv(d.date())).append(',')
              .append(escapeCsv(d.soRef())).append(',')
              .append(escapeCsv(d.clientName())).append(',')
              .append(escapeCsv(d.status())).append(',')
              .append(d.itemsCount() == null ? "" : d.itemsCount()).append(',')
              .append(d.grandTotal() == null ? "" : d.grandTotal().toPlainString()).append(',')
              .append(escapeCsv(d.createdAt())).append('\n');
        }
        return sb.toString();
    }

    @Transactional(readOnly = true)
    public List<SalesTimelineResponse> getTimeline(Long id) {
        getDc(id);
        return timelineRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, id)
                .stream().map(this::timelineResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SalesHistoryResponse> getHistory(Long id) {
        getDc(id);
        return historyRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, id)
                .stream().map(this::historyResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SalesAttachmentResponse> getAttachments(Long id) {
        getDc(id);
        return attachmentRepository.findByModuleTypeAndModuleIdOrderByUploadedAtAsc(MODULE, id)
                .stream().map(this::attachmentResponse).toList();
    }

    public SalesAttachmentResponse addAttachment(Long id, MultipartFile file) {
        DeliveryChallan dc = getDc(id);
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
                file.getOriginalFilename(), "Delivery Challan", id,
                dc.getDcNo(), dc.getClientId(), dc.getClientName(),
                baseUrl + "/v1/files/" + storedName,
                file.getContentType(), file.getSize(),
                currentUserName(), DocumentVisibility.TEAM_ONLY);
        return attachmentResponse(saved);
    }

    public void deleteAttachment(Long id, Long attachmentId) {
        getDc(id);
        SalesAttachment attachment = attachmentRepository.findById(attachmentId)
                .filter(a -> MODULE.equals(a.getModuleType()) && id.equals(a.getModuleId()))
                .orElseThrow(() -> new ResourceNotFoundException("Attachment not found with id: " + attachmentId));
        attachmentRepository.delete(attachment);
    }

    private void copyForRevision(DeliveryChallan copy, DeliveryChallan source) {
        org.springframework.beans.BeanUtils.copyProperties(source, copy,
                "id", "items", "timeline", "revisionOf", "revision", "revisionDate", "latestRevision", "createdAt", "updatedAt", "archivedAt");
        for (DeliveryChallanItem sourceItem : source.getItems()) {
            DeliveryChallanItem item = new DeliveryChallanItem();
            org.springframework.beans.BeanUtils.copyProperties(sourceItem, item,
                    "id", "deliveryChallan", "createdAt");
            copy.addItem(item);
        }
    }

    private int maxRevisionOfChain(Long baseId) {
        return deliveryChallanRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .mapToInt(DeliveryChallan::getRevision)
                .max()
                .orElse(0);
    }

    /** Detail response — also carries the full revision chain for the UI. */
    private DeliveryChallanResponse toResponseDetail(DeliveryChallan dc) {
        return toResponse(dc, revisionChain(dc));
    }

    private List<RevisionInfo> revisionChain(DeliveryChallan dc) {
        Long baseId = dc.getRevisionOf() != null ? dc.getRevisionOf() : dc.getId();
        List<RevisionInfo> chain = new ArrayList<>();
        deliveryChallanRepository.findById(baseId).ifPresent(q -> chain.add(revisionInfo(q)));
        deliveryChallanRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .sorted(java.util.Comparator.comparingInt(DeliveryChallan::getRevision))
                .forEach(q -> chain.add(revisionInfo(q)));
        return chain;
    }

    private RevisionInfo revisionInfo(DeliveryChallan dc) {
        return new RevisionInfo(
                dc.getId(),
                dc.getDcNo(),
                dc.getRevision(),
                dc.getStatus(),
                dc.getRevisionDate() == null
                        ? (dc.getCreatedAt() == null ? null : dc.getCreatedAt().toString())
                        : dc.getRevisionDate().toString(),
                dc.isLatestRevision());
    }

    /** When the latest revision is deleted, the previous one becomes latest. */
    private void promotePreviousRevision(DeliveryChallan removed) {
        if (!removed.isLatestRevision()) {
            return;
        }
        Long baseId = removed.getRevisionOf() != null ? removed.getRevisionOf() : removed.getId();
        // Highest remaining revision row first (revision >= 1).
        deliveryChallanRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .filter(q -> !q.getId().equals(removed.getId()))
                .filter(q -> !"deleted".equals(q.getStatus()))
                .findFirst()
                .ifPresentOrElse(q -> {
                    q.setLatestRevision(true);
                    deliveryChallanRepository.save(q);
                    removed.setLatestRevision(false);
                    deliveryChallanRepository.save(removed);
                }, () -> deliveryChallanRepository.findById(baseId).ifPresent(q -> {
                    // Fall back to the base row (revision 0) when no revision rows remain.
                    if (!q.getId().equals(removed.getId()) && !"deleted".equals(q.getStatus())) {
                        q.setLatestRevision(true);
                        deliveryChallanRepository.save(q);
                        removed.setLatestRevision(false);
                        deliveryChallanRepository.save(removed);
                    }
                }));
    }

    /** List/export response - carries no revision chain (avoids N+1). */
    private DeliveryChallanResponse toResponse(DeliveryChallan entity) {
        return toResponse(entity, List.of());
    }

    private DeliveryChallanResponse toResponse(DeliveryChallan dc, List<RevisionInfo> revisions) {
        List<DeliveryChallanItemResponse> itemResponses = dc.getItems().stream().map(this::itemResponse).toList();
        BigDecimal totalQty = itemResponses.stream()
                .map(DeliveryChallanItemResponse::qty)
                .filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new DeliveryChallanResponse(
                dc.getId(), dc.getDcNo(), dc.getSoRef(),
                dc.getDcDate() == null ? null : dc.getDcDate().toLocalDate().toString(),
                dc.getScRef(), dc.getStatus(),
                dc.getClientId(), dc.getClientName(), dc.getContactPerson(),
                dc.getEmail(), dc.getPhone(), dc.getBillingAddress(), dc.getShippingAddress(),
                dc.getCity(), dc.getState(), dc.getTransportCompany(), dc.getVehicleNumber(),
                dc.getDriverName(), dc.getDriverPhone(), dc.getLrNumber(), dc.getEwayBill(),
                dc.getDispatchDate() == null ? null : dc.getDispatchDate().toLocalDate().toString(),
                dc.getDeliveryDate() == null ? null : dc.getDeliveryDate().toLocalDate().toString(),
                dc.getNotes(), dc.getTerms(),
                dc.getTaxType(), dc.getHsnView(),
                dc.getSubTotal(), dc.getDiscount(), dc.getDiscountPct(),
                dc.getCgstTotal(), dc.getSgstTotal(), dc.getTaxTotal(),
                dc.getCharges(), dc.getGrandTotal(), dc.getConvertedToInvoice(), dc.getConvertedToCn(), dc.getConvertedToPr(),
                itemResponses.size(), totalQty,
                dc.getDcDate() == null
                        ? (dc.getCreatedAt() == null ? null : dc.getCreatedAt().toLocalDate().toString())
                        : dc.getDcDate().toLocalDate().toString(),
                dc.getCreatedAt() == null ? null : dc.getCreatedAt().toString(),
                dc.getUpdatedAt() == null ? null : dc.getUpdatedAt().toString(),
                dc.getArchivedAt() == null ? null : dc.getArchivedAt().toString(),
                itemResponses,
                attachmentRepository.findByModuleTypeAndModuleIdOrderByUploadedAtAsc(MODULE, dc.getId())
                        .stream().map(this::attachmentResponse).toList(),
                timelineRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, dc.getId())
                        .stream().map(this::timelineResponse).toList(),
                historyRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, dc.getId())
                        .stream().map(this::historyResponse).toList(),
                dc.getRevision(),
                dc.getRevisionOf(),
                dc.isLatestRevision(),
                dc.getRevisionDate() == null ? null : dc.getRevisionDate().toString(),
                revisions
        );
    }

    private DeliveryChallanItemResponse itemResponse(DeliveryChallanItem item) {
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
        return new DeliveryChallanItemResponse(item.getId(), item.getDescription(), item.getSku(), item.getDrawingNo(), item.getMaterial(), item.getDelivery(), item.getHsn(),
                item.getUom(), qty, rate, discPct, gst,
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

    private DeliveryChallan getDc(Long id) {
        return deliveryChallanRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Delivery Challan not found with id: " + id));
    }

    private void applyRequest(DeliveryChallan dc, DeliveryChallanRequest request) {
        dc.setSoRef(request.soRef());
        dc.setDcDate(parseDate(request.dcDate()));
        dc.setScRef(request.scRef());
        dc.setClientId(request.clientId());
        dc.setClientName(request.clientName());
        dc.setContactPerson(request.contactPerson());
        dc.setEmail(request.email());
        dc.setPhone(request.phone());
        dc.setBillingAddress(request.billingAddress());
        dc.setShippingAddress(request.shippingAddress());
        dc.setCity(request.city());
        dc.setState(request.state());
        dc.setTransportCompany(request.transportCompany());
        dc.setVehicleNumber(request.vehicleNumber());
        dc.setDriverName(request.driverName());
        dc.setDriverPhone(request.driverPhone());
        dc.setLrNumber(request.lrNumber());
        dc.setEwayBill(request.ewayBill());
        dc.setDispatchDate(parseDate(request.dispatchDate()));
        dc.setDeliveryDate(parseDate(request.deliveryDate()));
        dc.setNotes(request.notes());
        dc.setTerms(request.terms());
        dc.setTaxType(request.taxType());
        dc.setHsnView(request.hsnView());
        dc.setDiscount(request.discount() == null ? BigDecimal.ZERO : request.discount());
        dc.setCharges(request.charges() == null ? BigDecimal.ZERO : request.charges());
        dc.getItems().clear();
        if (request.items() != null) {
            for (DeliveryChallanItemRequest itemRequest : request.items()) {
                if (itemRequest == null) {
                    continue;
                }
                DeliveryChallanItem item = new DeliveryChallanItem();
                item.setDescription(itemRequest.description());
                item.setSku(itemRequest.sku());
                item.setDrawingNo(itemRequest.drawingNo());
                item.setMaterial(itemRequest.material());
                item.setDelivery(itemRequest.delivery());
                item.setHsn(itemRequest.hsn());
                item.setUom(itemRequest.uom());
                item.setQty(nvl(itemRequest.qty(), BigDecimal.ONE));
                item.setRate(nvl(itemRequest.rate(), BigDecimal.ZERO));
                item.setDiscountPct(nvl(itemRequest.discountPct(), BigDecimal.ZERO));
                item.setGstRate(nvl(itemRequest.gstRate(), BigDecimal.ZERO));
                dc.addItem(item);
            }
        }
    }

    private void copyItem(DeliveryChallanItem target, DeliveryChallanItem source) {
        target.setDescription(source.getDescription());
        target.setSku(source.getSku());
        target.setDrawingNo(source.getDrawingNo());
        target.setMaterial(source.getMaterial());
        target.setDelivery(source.getDelivery());
        target.setHsn(source.getHsn());
        target.setUom(source.getUom());
        target.setQty(source.getQty());
        target.setRate(source.getRate());
        target.setDiscountPct(source.getDiscountPct());
        target.setGstRate(source.getGstRate());
    }

    private void recalcTotals(DeliveryChallan dc) {
        BigDecimal subTotal = BigDecimal.ZERO;
        BigDecimal cgstTotal = BigDecimal.ZERO;
        BigDecimal sgstTotal = BigDecimal.ZERO;
        for (DeliveryChallanItem item : dc.getItems()) {
            BigDecimal qty = nvl(item.getQty(), BigDecimal.ONE);
            BigDecimal rate = nvl(item.getRate(), BigDecimal.ZERO);
            BigDecimal discPct = nvl(item.getDiscountPct(), BigDecimal.ZERO);
            BigDecimal gst = nvl(item.getGstRate(), BigDecimal.ZERO);
            BigDecimal gross = qty.multiply(rate);
            BigDecimal discAmt = gross.multiply(discPct).divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP);
            BigDecimal net = gross.subtract(discAmt);
            BigDecimal cgst = net.multiply(gst).divide(BigDecimal.valueOf(200), 4, RoundingMode.HALF_UP);
            BigDecimal sgst = net.multiply(gst).divide(BigDecimal.valueOf(200), 4, RoundingMode.HALF_UP);
            subTotal = subTotal.add(net);
            cgstTotal = cgstTotal.add(cgst);
            sgstTotal = sgstTotal.add(sgst);
        }
        dc.setSubTotal(subTotal.setScale(2, RoundingMode.HALF_UP));
        dc.setCgstTotal(cgstTotal.setScale(2, RoundingMode.HALF_UP));
        dc.setSgstTotal(sgstTotal.setScale(2, RoundingMode.HALF_UP));
        BigDecimal taxTotal = cgstTotal.add(sgstTotal);
        dc.setTaxTotal(taxTotal.setScale(2, RoundingMode.HALF_UP));
        BigDecimal discount = nvl(dc.getDiscount(), BigDecimal.ZERO);
        BigDecimal charges = nvl(dc.getCharges(), BigDecimal.ZERO);
        BigDecimal grand = subTotal.add(taxTotal).subtract(discount).add(charges);
        if (grand.compareTo(BigDecimal.ZERO) < 0) {
            grand = BigDecimal.ZERO;
        }
        dc.setGrandTotal(grand.setScale(2, RoundingMode.HALF_UP));
        if (subTotal.compareTo(BigDecimal.ZERO) > 0 && discount.compareTo(BigDecimal.ZERO) > 0) {
            dc.setDiscountPct(discount.multiply(BigDecimal.valueOf(100))
                    .divide(subTotal, 2, RoundingMode.HALF_UP));
        } else {
            dc.setDiscountPct(BigDecimal.ZERO);
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
    private Predicate latestPerChainPredicate(jakarta.persistence.criteria.Root<DeliveryChallan> root, jakarta.persistence.criteria.CriteriaQuery<?> query, jakarta.persistence.criteria.CriteriaBuilder cb) {
        Subquery<Long> newer = query.subquery(Long.class);
        jakarta.persistence.criteria.Root<DeliveryChallan> newerRoot = newer.from(DeliveryChallan.class);
        newer.select(newerRoot.get("id"));
        newer.where(cb.and(
                cb.equal(newerRoot.get("revisionOf"),
                        cb.coalesce(root.get("revisionOf"), root.get("id"))),
                cb.greaterThan(cb.coalesce(newerRoot.get("revision"), 0),
                        cb.coalesce(root.get("revision"), 0))));
        return cb.or(cb.isTrue(root.get("latestRevision")), cb.not(cb.exists(newer)));
    }

    private Specification<DeliveryChallan> buildSpecification(String search, String status, String client,
                                                              String soRef, String dateFrom, String dateTo,
                                                              BigDecimal minAmount, BigDecimal maxAmount) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(latestPerChainPredicate(root, query, cb));
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("dcNo")), like),
                        cb.like(cb.lower(root.get("clientName")), like),
                        cb.like(cb.lower(root.get("soRef")), like),
                        cb.like(cb.lower(root.get("scRef")), like),
                        cb.like(cb.lower(cb.toString(root.get("transportCompany"))), like),
                        cb.like(cb.lower(cb.toString(root.get("vehicleNumber"))), like)
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
            if (soRef != null && !soRef.isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("soRef")), soRef.trim().toLowerCase()));
            }
            if (dateFrom != null && !dateFrom.isBlank()) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("dcDate"), LocalDate.parse(dateFrom).atStartOfDay()));
            }
            if (dateTo != null && !dateTo.isBlank()) {
                predicates.add(cb.lessThanOrEqualTo(root.get("dcDate"), LocalDate.parse(dateTo).atTime(23, 59, 59)));
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
            case "clientName", "soRef", "dcDate", "dispatchDate", "deliveryDate", "grandTotal", "status", "createdAt",
                 "updatedAt", "dcNo" -> "dcNo".equals(field) ? "dcNo" : field;
            case "id" -> "dcNo";
            default -> "createdAt";
        };
        boolean asc = parts.length > 1 && "asc".equalsIgnoreCase(parts[1]);
        return Sort.by(asc ? Sort.Direction.ASC : Sort.Direction.DESC, mapped);
    }

    private long nextSequence() {
        long count = deliveryChallanRepository.count();
        long maxSuffix = 0;
        String prefix = "DC-" + Year.now().getValue() + "-";
        for (String no : deliveryChallanRepository.findAllDcNos()) {
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
        return String.format("DC-%d-%06d", Year.now().getValue(), sequence);
    }

    private String buildInvoiceNumber() {
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
        return String.format("INV-%d-%06d", Year.now().getValue(), Math.max(invoiceRepository.count(), maxSuffix) + 1);
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

    private String buildPrNumber() {
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
            case "packed" -> "packed";
            case "dispatched" -> "dispatched";
            case "in_transit", "in transit" -> "in transit";
            case "delivered" -> "delivered";
            case "accepted" -> "accepted";
            case "converted" -> "converted";
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

    private void addTimeline(DeliveryChallan dc, String type, String title, String detail) {
        SalesTimeline entry = new SalesTimeline();
        entry.setModuleType(MODULE);
        entry.setModuleId(dc.getId());
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

    private void addHistory(DeliveryChallan dc, String field, String oldValue, String newValue, String changedBy) {
        SalesHistory entry = new SalesHistory();
        entry.setModuleType(MODULE);
        entry.setModuleId(dc.getId());
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
