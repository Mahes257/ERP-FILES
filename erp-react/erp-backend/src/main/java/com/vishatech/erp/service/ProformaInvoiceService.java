package com.vishatech.erp.service;
import com.vishatech.erp.dto.ConversionResult;
import com.vishatech.erp.dto.DeliveryChallanRequest;
import com.vishatech.erp.dto.DeliveryChallanResponse;

import com.vishatech.erp.dto.InvoiceItemRequest;
import com.vishatech.erp.dto.ProformaInvoiceItemRequest;
import com.vishatech.erp.dto.ProformaInvoiceItemResponse;
import com.vishatech.erp.dto.ProformaInvoiceNextNumberResponse;
import com.vishatech.erp.dto.ProformaInvoiceRequest;
import com.vishatech.erp.dto.ProformaInvoiceResponse;
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
import com.vishatech.erp.entity.ProformaInvoice;
import com.vishatech.erp.entity.ProformaInvoiceItem;
import com.vishatech.erp.entity.DocumentVisibility;
import com.vishatech.erp.entity.SalesAttachment;
import com.vishatech.erp.entity.SalesHistory;
import com.vishatech.erp.entity.SalesOrder;
import com.vishatech.erp.entity.SalesOrderItem;
import com.vishatech.erp.entity.SalesTimeline;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.CreditNoteRepository;
import com.vishatech.erp.repository.DeliveryChallanRepository;
import com.vishatech.erp.repository.EditHistoryRepository;
import com.vishatech.erp.repository.InvoiceRepository;
import com.vishatech.erp.repository.PaymentReceiptRepository;
import com.vishatech.erp.repository.ProformaInvoiceRepository;
import com.vishatech.erp.repository.RecordRevisionRepository;
import com.vishatech.erp.repository.SalesOrderRepository;
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
public class ProformaInvoiceService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final String MODULE = "proforma-invoice";

    private final ProformaInvoiceRepository proformaInvoiceRepository;
    private final SalesOrderRepository salesOrderRepository;
    private final DeliveryChallanRepository deliveryChallanRepository;
    private final SalesTimelineRepository timelineRepository;
    private final SalesHistoryRepository historyRepository;
    private final SalesAttachmentRepository attachmentRepository;
    private final EditHistoryRepository editHistoryRepository;
    private final RecordRevisionRepository recordRevisionRepository;
    private final InvoiceRepository invoiceRepository;
    private final CreditNoteRepository creditNoteRepository;
    private final PaymentReceiptRepository paymentReceiptRepository;
    private final FileStorageService fileStorageService;
    private final DocumentRepositoryService documentRepositoryService;
    private final DeliveryChallanService deliveryChallanService;
    private final String baseUrl;

    public ProformaInvoiceService(ProformaInvoiceRepository proformaInvoiceRepository,
                                  SalesOrderRepository salesOrderRepository,
                                  DeliveryChallanRepository deliveryChallanRepository,
                                  SalesTimelineRepository timelineRepository,
                                  SalesHistoryRepository historyRepository,
                                  SalesAttachmentRepository attachmentRepository,
                                  EditHistoryRepository editHistoryRepository,
                                  RecordRevisionRepository recordRevisionRepository,
                                  InvoiceRepository invoiceRepository,
                                  CreditNoteRepository creditNoteRepository,
                                  PaymentReceiptRepository paymentReceiptRepository,
                                  FileStorageService fileStorageService,
                                  DocumentRepositoryService documentRepositoryService,
                                  DeliveryChallanService deliveryChallanService,
                                  @Value("${app.base-url:http://localhost:8080}") String baseUrl) {
        this.proformaInvoiceRepository = proformaInvoiceRepository;
        this.salesOrderRepository = salesOrderRepository;
        this.deliveryChallanRepository = deliveryChallanRepository;
        this.timelineRepository = timelineRepository;
        this.historyRepository = historyRepository;
        this.attachmentRepository = attachmentRepository;
        this.editHistoryRepository = editHistoryRepository;
        this.recordRevisionRepository = recordRevisionRepository;
        this.invoiceRepository = invoiceRepository;
        this.creditNoteRepository = creditNoteRepository;
        this.paymentReceiptRepository = paymentReceiptRepository;
        this.fileStorageService = fileStorageService;
        this.documentRepositoryService = documentRepositoryService;
        this.deliveryChallanService = deliveryChallanService;
        this.baseUrl = baseUrl;
    }

    @Transactional(readOnly = true)
    public Page<ProformaInvoiceResponse> list(int page, int size, String search, String sort,
                                              String status, String client, String dateFrom, String dateTo,
                                              BigDecimal minAmount, BigDecimal maxAmount) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort));
        Specification<ProformaInvoice> spec = buildSpecification(search, status, client, dateFrom, dateTo, minAmount, maxAmount);
        return proformaInvoiceRepository.findAll(spec, pageable).map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public ProformaInvoiceResponse get(Long id) {
        return toResponseDetail(getPi(id));
    }

    @Transactional(readOnly = true)
    public ProformaInvoiceNextNumberResponse getNextNumber() {
        long next = nextSequence();
        return new ProformaInvoiceNextNumberResponse(buildNo(next), next);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> stats() {
        List<String> excluded = List.of("archived", "deleted");
        Map<String, Object> stats = new LinkedHashMap<>();
        long active = 0;
        // Count only the CURRENT revision of each chain so KPI cards match
        // the list rows (older revisions are surfaced through the Document
        // Workflow dropdown, never as separate list rows).
        for (String status : List.of("draft", "sent", "paid", "overdue", "accepted", "expired", "converted", "cancelled")) {
            long count = proformaInvoiceRepository.countCurrentByStatus(status);
            stats.put(status.replace(" ", ""), count);
            active += count;
        }
        stats.put("total", active);
        stats.put("active", active);
        stats.put("archived", proformaInvoiceRepository.countCurrentByStatus("archived"));
        stats.put("deleted", proformaInvoiceRepository.countCurrentByStatus("deleted"));
        stats.put("totalAmt", proformaInvoiceRepository.sumGrandTotalExcluding(excluded));
        return stats;
    }

    public ProformaInvoiceResponse create(ProformaInvoiceRequest request, boolean draft) {
        ProformaInvoice pi = new ProformaInvoice();
        if (request.piNo() != null && !request.piNo().isBlank()) {
            if (proformaInvoiceRepository.existsByPiNo(request.piNo().trim())) {
                throw new BadRequestException("Proforma Invoice number already exists: " + request.piNo());
            }
            pi.setPiNo(request.piNo().trim());
        } else {
            pi.setPiNo(buildNo(nextSequence()));
        }
        applyRequest(pi, request);
        if (draft) {
            pi.setStatus("draft");
        } else if (request.status() != null && !request.status().isBlank()) {
            pi.setStatus(normalizeStatus(request.status()));
        } else {
            pi.setStatus("draft");
        }
        recalcTotals(pi);
        // Persist first so the generated id is available for timeline/history rows
        // (their module_id column is NOT NULL).
        ProformaInvoice saved = proformaInvoiceRepository.saveAndFlush(pi);
        addTimeline(saved, "created", "Proforma Invoice created",
                "Proforma Invoice '" + saved.getPiNo() + "' was created.");
        addHistory(saved, "Proforma Invoice", null, saved.getPiNo(), currentUserName());
        return toResponse(saved);
    }

    /**
     * Every edit creates a NEW revision row (BASE(N)); the previous version is
     * never deleted or overwritten. Only the latest revision is editable.
     */
    public ProformaInvoiceResponse update(Long id, ProformaInvoiceRequest request) {
        ProformaInvoice current = getPi(id);
        if (!current.isLatestRevision()) {
            throw new BadRequestException("Only the latest revision can be edited");
        }
        Long baseId = current.getRevisionOf() != null ? current.getRevisionOf() : current.getId();
        int nextRev = maxRevisionOfChain(baseId) + 1;

        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(current);

        ProformaInvoice revision = new ProformaInvoice();
        copyForRevision(revision, current);
        applyRequest(revision, request);
        if (request.status() != null && !request.status().isBlank()) {
            revision.setStatus(normalizeStatus(request.status()));
        }
        recalcTotals(revision);
        revision.setPiNo(RevisionSupport.nextRevisionNumber(
                RevisionSupport.baseNumber(current.getPiNo()), nextRev));
        revision.setRevisionOf(baseId);
        revision.setRevision(nextRev);
        revision.setRevisionDate(java.time.LocalDateTime.now());
        revision.setLatestRevision(true);

        current.setLatestRevision(false);
        proformaInvoiceRepository.save(current);
        ProformaInvoice saved = proformaInvoiceRepository.saveAndFlush(revision);
        addTimeline(saved, "revision", "Revision " + nextRev + " created",
                "Revision '" + saved.getPiNo() + "' created from '" + current.getPiNo()
                        + "' by " + currentUserName() + ".");
        editHistory.recordEdit("proforma-invoice", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponseDetail(saved);
    }

    public ProformaInvoiceResponse delete(Long id) {
        ProformaInvoice pi = getPi(id);
        RevisionSupport.requireLatest(pi.isLatestRevision());
        pi.setStatus("deleted");
        pi.setArchivedAt(LocalDateTime.now());
        addTimeline(pi, "deleted", "Proforma Invoice deleted",
                "Proforma Invoice was moved to trash by " + currentUserName() + ".");
        addHistory(pi, "Status", null, "Deleted", currentUserName());
        return toResponse(proformaInvoiceRepository.save(pi));
    }

    public ProformaInvoiceResponse restore(Long id) {
        ProformaInvoice pi = getPi(id);
        RevisionSupport.requireLatest(pi.isLatestRevision());
        String previous = pi.getStatus();
        String target = ("deleted".equals(previous) || "archived".equals(previous)) ? "draft" : previous;
        pi.setStatus(target);
        pi.setArchivedAt(null);
        addTimeline(pi, "restored", "Proforma Invoice restored",
                "Proforma Invoice was restored by " + currentUserName() + ".");
        addHistory(pi, "Status", titleCase(previous), titleCase(target), currentUserName());
        return toResponse(proformaInvoiceRepository.save(pi));
    }

    public ProformaInvoiceResponse archive(Long id) {
        ProformaInvoice pi = getPi(id);
        RevisionSupport.requireLatest(pi.isLatestRevision());
        pi.setStatus("archived");
        pi.setArchivedAt(LocalDateTime.now());
        addTimeline(pi, "archived", "Proforma Invoice archived",
                "Proforma Invoice was archived by " + currentUserName() + ".");
        addHistory(pi, "Status", null, "Archived", currentUserName());
        return toResponse(proformaInvoiceRepository.save(pi));
    }

    public ProformaInvoiceResponse changeStatus(Long id, String status) {
        ProformaInvoice pi = getPi(id);
        RevisionSupport.requireLatest(pi.isLatestRevision());
        String normalized = normalizeStatus(status);
        if ("deleted".equals(pi.getStatus())) {
            throw new BadRequestException("Cannot change status of a deleted Proforma Invoice");
        }
        pi.setStatus(normalized);
        addTimeline(pi, "status", "Status changed",
                "Status changed to '" + titleCase(normalized) + "' by " + currentUserName() + ".");
        addHistory(pi, "Status", null, titleCase(normalized), currentUserName());
        return toResponse(proformaInvoiceRepository.save(pi));
    }

    public ProformaInvoiceResponse send(Long id) {
        ProformaInvoice pi = getPi(id);
        RevisionSupport.requireLatest(pi.isLatestRevision());
        if ("draft".equals(pi.getStatus())) {
            pi.setStatus("sent");
            addTimeline(pi, "sent", "Proforma Invoice sent",
                    "Proforma Invoice sent to " + (pi.getEmail() == null ? "client" : pi.getEmail()) + ".");
            addHistory(pi, "Status", "Draft", "Sent", currentUserName());
        }
        return toResponse(proformaInvoiceRepository.save(pi));
    }

    public ProformaInvoiceResponse duplicate(Long id) {
        ProformaInvoice source = getPi(id);
        ProformaInvoice copy = new ProformaInvoice();
        copy.setPiNo(buildNo(nextSequence()));
        copy.setReferenceNo(source.getReferenceNo());
        copy.setContractNo(source.getContractNo());
        copy.setAppendixPoNo(source.getAppendixPoNo());
        copy.setSource(source.getSource());
        copy.setSourceRef(source.getSourceRef());
        copy.setClientId(source.getClientId());
        copy.setClientName(source.getClientName());
        copy.setContactPerson(source.getContactPerson());
        copy.setGstin(source.getGstin());
        copy.setPan(source.getPan());
        copy.setEmail(source.getEmail());
        copy.setPhone(source.getPhone());
        copy.setBillingAddress(source.getBillingAddress());
        copy.setShippingAddress(source.getShippingAddress());
        copy.setBankName(source.getBankName());
        copy.setBankAcctName(source.getBankAcctName());
        copy.setBankAccount(source.getBankAccount());
        copy.setBankIfsc(source.getBankIfsc());
        copy.setBankBranch(source.getBankBranch());
        copy.setBankType(source.getBankType());
        copy.setBankUpi(source.getBankUpi());
        copy.setConsigneeName(source.getConsigneeName());
        copy.setConsigneeAddress(source.getConsigneeAddress());
        copy.setConsigneeCountry(source.getConsigneeCountry());
        copy.setExporterName(source.getExporterName());
        copy.setExporterAddress(source.getExporterAddress());
        copy.setExporterEmail(source.getExporterEmail());
        copy.setExporterPhone(source.getExporterPhone());
        copy.setExporterGstin(source.getExporterGstin());
        copy.setExporterPan(source.getExporterPan());
        copy.setExporterState(source.getExporterState());
        copy.setBuyerName(source.getBuyerName());
        copy.setBuyerAddress(source.getBuyerAddress());
        copy.setBuyerCountry(source.getBuyerCountry());
        copy.setBuyerSameAsConsignee(source.isBuyerSameAsConsignee());
        copy.setCountryOfOrigin(source.getCountryOfOrigin());
        copy.setCountryOfFinalDestination(source.getCountryOfFinalDestination());
        copy.setPreCarriageBy(source.getPreCarriageBy());
        copy.setPlaceOfReceipt(source.getPlaceOfReceipt());
        copy.setVesselFlightNo(source.getVesselFlightNo());
        copy.setPortOfLoading(source.getPortOfLoading());
        copy.setPortOfDischarge(source.getPortOfDischarge());
        copy.setPlaceOfDelivery(source.getPlaceOfDelivery());
        copy.setTermsOfDelivery(source.getTermsOfDelivery());
        copy.setPaymentTerms(source.getPaymentTerms());
        copy.setHsCode(source.getHsCode());
        copy.setCommodity(source.getCommodity());
        copy.setCurrency(source.getCurrency());
        copy.setTaxTreatment(source.getTaxTreatment());
        copy.setPackingDetails(source.getPackingDetails());
        copy.setAuthorizedSignatory(source.getAuthorizedSignatory());
        copy.setDesignation(source.getDesignation());
        copy.setPlace(source.getPlace());
        copy.setAuthorizationDate(source.getAuthorizationDate());
        copy.setCompanyStamp(source.getCompanyStamp());
        copy.setInvoiceNo(source.getInvoiceNo());
        copy.setInvoiceDate(source.getInvoiceDate());
        copy.setBuyersOrderNo(source.getBuyersOrderNo());
        copy.setBuyersOrderDate(source.getBuyersOrderDate());
        copy.setPackageMarksNos(source.getPackageMarksNos());
        copy.setPackageNoKindPkgs(source.getPackageNoKindPkgs());
        copy.setPackageDimensions(source.getPackageDimensions());
        copy.setTotalPackages(source.getTotalPackages());
        copy.setTotalQty(source.getTotalQty());
        copy.setNetWeight(source.getNetWeight());
        copy.setGrossWeight(source.getGrossWeight());
        copy.setDeclaration(source.getDeclaration());
        copy.setTerms(source.getTerms());
        copy.setNotes(source.getNotes());
        copy.setCharges(source.getCharges());
        copy.setDiscount(source.getDiscount());
        copy.setDiscountPct(source.getDiscountPct());
        copy.setValidTill(source.getValidTill());
        copy.setShipSameAsBill(source.isShipSameAsBill());
        copy.setStatus("draft");
        copy.setPiDate(LocalDateTime.now());
        for (ProformaInvoiceItem sourceItem : source.getItems()) {
            ProformaInvoiceItem item = new ProformaInvoiceItem();
            copyItem(item, sourceItem);
            copy.addItem(item);
        }
        recalcTotals(copy);
        // Persist first so the generated id is available for timeline/history rows
        // (their module_id column is NOT NULL).
        ProformaInvoice saved = proformaInvoiceRepository.saveAndFlush(copy);
        addTimeline(saved, "created", "Proforma Invoice created",
                "Duplicated from Proforma Invoice '" + source.getPiNo() + "'.");
        addHistory(saved, "Proforma Invoice", null, saved.getPiNo(), currentUserName());
        return toResponse(saved);
    }

    public int bulkArchive(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            ProformaInvoice pi = getPi(id);
            if (!"archived".equals(pi.getStatus()) && !"deleted".equals(pi.getStatus())) {
                pi.setStatus("archived");
                pi.setArchivedAt(LocalDateTime.now());
                addTimeline(pi, "archived", "Proforma Invoice archived",
                        "Proforma Invoice was archived by " + currentUserName() + ".");
                proformaInvoiceRepository.save(pi);
                count++;
            }
        }
        return count;
    }

    public int bulkRestore(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            ProformaInvoice pi = getPi(id);
            if ("archived".equals(pi.getStatus()) || "deleted".equals(pi.getStatus())) {
                pi.setStatus("draft");
                pi.setArchivedAt(null);
                addTimeline(pi, "restored", "Proforma Invoice restored",
                        "Proforma Invoice was restored by " + currentUserName() + ".");
                proformaInvoiceRepository.save(pi);
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
            ProformaInvoice pi = getPi(id);
            if (!"deleted".equals(pi.getStatus())) {
                pi.setStatus("deleted");
                pi.setArchivedAt(LocalDateTime.now());
                addTimeline(pi, "deleted", "Proforma Invoice deleted",
                        "Proforma Invoice was moved to trash by " + currentUserName() + ".");
                addHistory(pi, "Status", null, "Deleted", currentUserName());
                proformaInvoiceRepository.save(pi);
                count++;
            }
        }
        return count;
    }

    public int bulkPermanentDelete(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            ProformaInvoice pi = getPi(id);
            // Remove the whole revision chain (base row + every revision row).
            Long baseId = pi.getRevisionOf() != null ? pi.getRevisionOf() : pi.getId();
            List<ProformaInvoice> chain = new java.util.ArrayList<>();
            proformaInvoiceRepository.findById(baseId).ifPresent(chain::add);
            chain.addAll(proformaInvoiceRepository.findByRevisionOfOrderByRevisionDesc(baseId));
            for (ProformaInvoice p : chain) {
                // Purge related rows so no orphaned attachments/timeline/history/
                // edit-history/revision-snapshots survive the hard delete.
                timelineRepository.deleteByModuleTypeAndModuleId(MODULE, p.getId());
                historyRepository.deleteByModuleTypeAndModuleId(MODULE, p.getId());
                attachmentRepository.deleteByModuleTypeAndModuleId(MODULE, p.getId());
                editHistoryRepository.deleteByModuleTypeAndRecordId(MODULE, p.getId());
                recordRevisionRepository.deleteByModuleTypeAndRecordId(MODULE, p.getId());
            }
            proformaInvoiceRepository.deleteAll(chain);
            count++;
        }
        return count;
    }

    /** Proforma Invoice → Sales Order conversion (ERP: Convert to Sales Order). */
    public ConversionResult convertToSalesOrder(Long id) {
        ProformaInvoice pi = getPi(id);
        if (pi.getConvertedToSo() != null && !pi.getConvertedToSo().isBlank()) {
            throw new BadRequestException("Proforma Invoice already converted to " + pi.getConvertedToSo());
        }
        SalesOrder so = new SalesOrder();
        so.setSoNo(buildSoNumber());
        so.setOrderDate(LocalDateTime.now());
        so.setStatus("draft");
        so.setQtnRef(pi.getPiNo());
        so.setClientId(pi.getClientId());
        so.setClientName(pi.getClientName());
        so.setContactPerson(pi.getContactPerson());
        so.setEmail(pi.getEmail());
        so.setPhone(pi.getPhone());
        so.setBillingAddress(pi.getBillingAddress());
        so.setShippingAddress(pi.getShippingAddress());
        so.setGstin(pi.getGstin());
        so.setPan(pi.getPan());
        so.setTerms(pi.getTerms());
        so.setRemarks(pi.getNotes());
        for (ProformaInvoiceItem sourceItem : pi.getItems()) {
            SalesOrderItem item = new SalesOrderItem();
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
            so.addItem(item);
        }
        so.setSubTotal(pi.getSubTotal());
        so.setDiscount(pi.getDiscount());
        so.setDiscountPct(pi.getDiscountPct());
        so.setCgstTotal(pi.getCgstTotal());
        so.setSgstTotal(pi.getSgstTotal());
        so.setTaxTotal(pi.getTaxTotal());
        so.setCharges(pi.getCharges());
        so.setGrandTotal(pi.getGrandTotal());        salesOrderRepository.save(so);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, pi.getId(), "sales-order", so.getId());

        pi.setStatus("converted");
        pi.setConvertedToSo(so.getSoNo());
        addTimeline(pi, "converted", "Converted to Sales Order",
                "Proforma Invoice converted to Sales Order " + so.getSoNo() + ".");
        addHistory(pi, "Status", null, "Converted", currentUserName());
        proformaInvoiceRepository.save(pi);
        return new ConversionResult("sales-order", so.getId(), so.getSoNo(), "Sales Order " + so.getSoNo() + " created from Proforma Invoice " + pi.getPiNo());
    }

    /** Proforma Invoice → Delivery Challan conversion (ERP: Generate Delivery Challan). */
    public ConversionResult generateDeliveryChallan(Long id) {
        ProformaInvoice pi = getPi(id);
        if (pi.getConvertedToDc() != null && !pi.getConvertedToDc().isBlank()) {
            throw new BadRequestException("Proforma Invoice already converted to " + pi.getConvertedToDc());
        }
        DeliveryChallan dc = new DeliveryChallan();
        dc.setDcNo(buildDcNumber());
        dc.setDcDate(LocalDateTime.now());
        dc.setStatus("draft");
        dc.setSoRef(pi.getSourceRef());
        dc.setScRef(pi.getReferenceNo());
        dc.setClientId(pi.getClientId());
        dc.setClientName(pi.getClientName());
        dc.setContactPerson(pi.getContactPerson());
        dc.setEmail(pi.getEmail());
        dc.setPhone(pi.getPhone());
        dc.setBillingAddress(pi.getBillingAddress());
        dc.setShippingAddress(pi.getShippingAddress());
        dc.setNotes(pi.getNotes());
        dc.setTerms(pi.getTerms());
        for (ProformaInvoiceItem sourceItem : pi.getItems()) {
            DeliveryChallanItem item = new DeliveryChallanItem();
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
            dc.addItem(item);
        }
        dc.setSubTotal(pi.getSubTotal());
        dc.setDiscount(pi.getDiscount());
        dc.setDiscountPct(pi.getDiscountPct());
        dc.setCgstTotal(pi.getCgstTotal());
        dc.setSgstTotal(pi.getSgstTotal());
        dc.setTaxTotal(pi.getTaxTotal());
        dc.setCharges(pi.getCharges());
        dc.setGrandTotal(pi.getGrandTotal());
        DeliveryChallan savedDc = deliveryChallanRepository.save(dc);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, pi.getId(), "delivery-challan", savedDc.getId());
        // Traceability follows the Customer Purchase Order → Delivery Challan
        // convention: the created Delivery Challan carries its own timeline and
        // history entry naming the source document it was generated from.
        addTargetTimeline("delivery-challan", savedDc.getId(), "created", "Delivery Challan created",
                "Delivery Challan '" + savedDc.getDcNo() + "' created from Proforma Invoice '" + pi.getPiNo() + "'.");
        addTargetHistory("delivery-challan", savedDc.getId(), "Delivery Challan", savedDc.getDcNo(), currentUserName());

        pi.setStatus("converted");
        pi.setConvertedToDc(dc.getDcNo());
        addTimeline(pi, "converted", "Delivery Challan generated",
                "Delivery Challan " + dc.getDcNo() + " was generated from this Proforma Invoice.");
        addHistory(pi, "Status", null, "Converted", currentUserName());
        proformaInvoiceRepository.save(pi);
        return new ConversionResult("delivery-challan", dc.getId(), dc.getDcNo(), "Delivery Challan " + dc.getDcNo() + " created from Proforma Invoice " + pi.getPiNo());
    }

    /**
     * Proforma Invoice → Delivery Challan, created from the FORM the user
     * reviewed (Actions ⋮ → Convert to Delivery Challan → Delivery Challan form
     * → Save).
     *
     * Unlike {@link #generateDeliveryChallan(Long)} the challan is not built
     * here from the Proforma Invoice columns: the request IS the challan the
     * user saw and (optionally) edited in the Delivery Challan form — its
     * quantities, status, transport and dispatch details, and its line items are
     * persisted exactly as submitted. The source Proforma Invoice only fills the
     * fields the form left blank (see {@link #withSourceDefaults}), so a
     * form-created challan keeps the same source traceability as a one-click
     * conversion without ever duplicating or inventing data.
     *
     * One transaction: the challan and the source document's conversion pointers
     * are written together or not at all. The existing one-Delivery-Challan-per-
     * Proforma-Invoice rule is enforced here exactly as the one-click conversion
     * enforces it (this ERP does not dispatch a Proforma Invoice partially), so a
     * repeated click or a retried request can never create a second challan.
     */
    @Transactional
    public DeliveryChallanResponse createDeliveryChallan(Long id, DeliveryChallanRequest request) {
        ProformaInvoice pi = getPi(id);
        if (isNotBlank(pi.getConvertedToDc())) {
            throw new BadRequestException("Proforma Invoice already converted to " + pi.getConvertedToDc());
        }
        DeliveryChallanResponse created = deliveryChallanService.create(withSourceDefaults(request, pi), false);
        // Traceability follows the Customer Purchase Order → Delivery Challan
        // convention: the created Delivery Challan carries its own timeline and
        // history entry naming the source document it was generated from.
        addTargetTimeline("delivery-challan", created.id(), "created", "Delivery Challan created",
                "Delivery Challan '" + created.dcNo() + "' created from Proforma Invoice '" + pi.getPiNo() + "'.");
        addTargetHistory("delivery-challan", created.id(), "Delivery Challan", created.dcNo(), currentUserName());

        pi.setStatus("converted");
        pi.setConvertedToDc(created.dcNo());
        addTimeline(pi, "converted", "Delivery Challan generated",
                "Delivery Challan " + created.dcNo() + " was generated from this Proforma Invoice.");
        addHistory(pi, "Status", null, "Converted", currentUserName());
        proformaInvoiceRepository.save(pi);
        return created;
    }

    /**
     * Fills only the fields the submitted form left blank with what the source
     * Proforma Invoice already knows. Anything the user (or the prefilled form)
     * provided always wins, nothing is invented, and no financial total is
     * copied across — the Delivery Challan service recomputes the challan's
     * totals from its own line items.
     */
    private DeliveryChallanRequest withSourceDefaults(DeliveryChallanRequest request, ProformaInvoice pi) {
        return new DeliveryChallanRequest(
                request.dcNo(),
                firstNonBlank(request.soRef(), pi.getSourceRef()),
                request.dcDate(),
                firstNonBlank(request.scRef(), pi.getReferenceNo()),
                request.status(),
                request.clientId() != null ? request.clientId() : pi.getClientId(),
                firstNonBlank(request.clientName(), pi.getClientName()),
                firstNonBlank(request.contactPerson(), pi.getContactPerson()),
                firstNonBlank(request.email(), pi.getEmail()),
                firstNonBlank(request.phone(), pi.getPhone()),
                firstNonBlank(request.billingAddress(), pi.getBillingAddress()),
                firstNonBlank(request.shippingAddress(), pi.getShippingAddress()),
                request.city(),
                request.state(),
                request.transportCompany(),
                request.vehicleNumber(),
                request.driverName(),
                request.driverPhone(),
                request.lrNumber(),
                request.ewayBill(),
                request.dispatchDate(),
                request.deliveryDate(),
                firstNonBlank(request.notes(), pi.getNotes()),
                firstNonBlank(request.terms(), pi.getTerms()),
                firstNonBlank(request.taxType(), pi.getTaxType()),
                firstNonBlank(request.hsnView(), pi.getHsnView()),
                request.discount(),
                request.charges(),
                request.items());
    }

    private String firstNonBlank(String preferred, String fallback) {
        if (isNotBlank(preferred)) {
            return preferred;
        }
        return isNotBlank(fallback) ? fallback : preferred;
    }

    /** Proforma Invoice → Invoice conversion. */
    public ConversionResult convertToInvoice(Long id) {
        ProformaInvoice pi = getPi(id);
        if (isNotBlank(pi.getConvertedToInvoice())) {
            // Duplicate-conversion protection: never create a second Invoice.
            // Return the existing one so the user can open it.
            Invoice existing = invoiceRepository.findByInvoiceNo(pi.getConvertedToInvoice()).orElse(null);
            if (existing != null) {
                return new ConversionResult("invoice", existing.getId(), existing.getInvoiceNo(),
                        "An Invoice has already been created from this Proforma Invoice.");
            }
            throw new BadRequestException("An Invoice has already been created from this Proforma Invoice.");
        }
        Invoice invoice = new Invoice();
        invoice.setInvoiceNo(buildInvoiceNumber());
        invoice.setInvoiceDate(LocalDateTime.now());
        invoice.setStatus("draft");
        invoice.setSource("pi");
        invoice.setSourceRef(pi.getPiNo());
        invoice.setClientId(pi.getClientId());
        invoice.setClientName(pi.getClientName());
        invoice.setContactPerson(pi.getContactPerson());
        invoice.setEmail(pi.getEmail());
        invoice.setPhone(pi.getPhone());
        invoice.setGstin(pi.getGstin());
        invoice.setPan(pi.getPan());
        invoice.setBillingAddress(pi.getBillingAddress());
        invoice.setShippingAddress(pi.getShippingAddress());
        invoice.setBankName(pi.getBankName());
        invoice.setBankAccount(pi.getBankAccount());
        invoice.setBankIfsc(pi.getBankIfsc());
        invoice.setBankBranch(pi.getBankBranch());
        invoice.setBankType(pi.getBankType());
        invoice.setBankUpi(pi.getBankUpi());
        invoice.setBankSwift(pi.getBankSwift());
        invoice.setBankAddress(pi.getBankAddress());
        invoice.setTerms(pi.getTerms());
        invoice.setNotes(pi.getNotes());
        invoice.setReferenceNo(pi.getReferenceNo());
        invoice.setContractNo(pi.getContractNo());
        invoice.setContractDate(pi.getContractDate());
        invoice.setAppendixNo(pi.getAppendixPoNo());
        invoice.setAppendixDate(pi.getAppendixDate());
        invoice.setExporterRef(pi.getExporterRef());
        invoice.setConsigneeName(pi.getConsigneeName());
        invoice.setConsigneeAddress(pi.getConsigneeAddress());
        invoice.setConsigneeCountry(pi.getConsigneeCountry());
        invoice.setConsigneeSameAsBuyer(pi.isBuyerSameAsConsignee());
        invoice.setBuyerCountry(pi.getBuyerCountry());
        invoice.setCountryOfOrigin(pi.getCountryOfOrigin());
        invoice.setCountryOfFinalDestination(pi.getCountryOfFinalDestination());
        invoice.setPreCarriageBy(pi.getPreCarriageBy());
        invoice.setPlaceOfReceipt(pi.getPlaceOfReceipt());
        invoice.setVesselFlightNo(pi.getVesselFlightNo());
        invoice.setPortOfLoading(pi.getPortOfLoading());
        invoice.setPortOfDischarge(pi.getPortOfDischarge());
        invoice.setPortOfDelivery(pi.getPlaceOfDelivery());
        invoice.setTermsOfDelivery(pi.getTermsOfDelivery());
        invoice.setPaymentTerms(pi.getPaymentTerms());
        invoice.setHsCode(pi.getHsCode());
        invoice.setCommodity(pi.getCommodity());
        invoice.setCurrency(pi.getCurrency());
        invoice.setTaxTreatment(pi.getTaxTreatment());
        invoice.setPackingDetails(pi.getPackingDetails());
        invoice.setAuthorizedSignatory(pi.getAuthorizedSignatory());
        invoice.setDesignation(pi.getDesignation());
        invoice.setPlace(pi.getPlace());
        invoice.setAuthorizationDate(pi.getAuthorizationDate());
        invoice.setPoNo(pi.getBuyersOrderNo());
        invoice.setPoDate(pi.getBuyersOrderDate());
        for (ProformaInvoiceItem sourceItem : pi.getItems()) {
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
            item.setManufacturer(sourceItem.getManufacturer());
            item.setCountryOfOrigin(sourceItem.getCountryOfOrigin());
            invoice.addItem(item);
        }
        invoice.setSubTotal(pi.getSubTotal());
        invoice.setDiscount(pi.getDiscount());
        invoice.setDiscountPct(pi.getDiscountPct());
        invoice.setTaxTotal(pi.getTaxTotal());
        invoice.setCgstTotal(pi.getCgstTotal());
        invoice.setSgstTotal(pi.getSgstTotal());
        invoice.setCharges(pi.getCharges());
        invoice.setGrandTotal(pi.getGrandTotal());
        invoiceRepository.save(invoice);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, pi.getId(), "invoice", invoice.getId());

        pi.setStatus("converted");
        pi.setConvertedToInvoice(invoice.getInvoiceNo());
        addTimeline(pi, "converted", "Converted to Invoice",
                "Proforma Invoice converted to Invoice " + invoice.getInvoiceNo() + ".");
        addHistory(pi, "Status", null, "Converted", currentUserName());
        proformaInvoiceRepository.save(pi);
        return new ConversionResult("invoice", invoice.getId(), invoice.getInvoiceNo(), "Invoice " + invoice.getInvoiceNo() + " created from Proforma Invoice " + pi.getPiNo());
    }

    private boolean isNotBlank(String value) {
        return value != null && !value.isBlank();
    }

    /** Proforma Invoice → Credit Note conversion. */
    public ConversionResult convertToCreditNote(Long id) {
        ProformaInvoice pi = getPi(id);
        if (isNotBlank(pi.getConvertedToCn())) {
            throw new BadRequestException("Proforma Invoice already converted to Credit Note " + pi.getConvertedToCn());
        }
        CreditNote cn = new CreditNote();
        cn.setCnNo(buildCnNumber());
        cn.setCnDate(LocalDateTime.now());
        cn.setStatus("draft");
        cn.setSource("proforma-invoice");
        cn.setSourceRef(pi.getPiNo());
        cn.setReason("Proforma Invoice converted to Credit Note");
        cn.setReasonDetail("Credit Note generated from Proforma Invoice " + pi.getPiNo());
        cn.setInventoryImpact("none");
        cn.setClientId(pi.getClientId());
        cn.setClientName(pi.getClientName());
        cn.setContactPerson(pi.getContactPerson());
        cn.setEmail(pi.getEmail());
        cn.setPhone(pi.getPhone());
        cn.setGstin(pi.getGstin());
        cn.setCurrency(pi.getCurrency());
        cn.setTerms(pi.getTerms());
        cn.setRemarks(pi.getNotes());
        cn.setDiscountPct(pi.getDiscountPct());
        for (ProformaInvoiceItem sourceItem : pi.getItems()) {
            CreditNoteItem item = new CreditNoteItem();
            item.setDescription(sourceItem.getDescription());
            item.setSku(sourceItem.getSku());
            item.setHsn(sourceItem.getHsn());
            item.setUom(sourceItem.getUom());
            item.setQty(sourceItem.getQty());
            item.setRate(sourceItem.getRate());
            item.setDiscountPct(sourceItem.getDiscountPct());
            item.setGstRate(sourceItem.getGstRate());
            item.setDrawingNo(sourceItem.getDrawingNo());
            item.setMaterial(sourceItem.getMaterial());
            item.setDelivery(sourceItem.getDelivery());
            cn.addItem(item);
        }
        cn.setSubTotal(pi.getSubTotal());
        cn.setDiscount(pi.getDiscount());
        cn.setTaxTotal(pi.getTaxTotal());
        cn.setCgstTotal(pi.getCgstTotal());
        cn.setSgstTotal(pi.getSgstTotal());
        cn.setCharges(pi.getCharges());
        cn.setGrandTotal(pi.getGrandTotal());
        cn.setRefundAmount(pi.getGrandTotal());
        CreditNote savedCn = creditNoteRepository.save(cn);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, pi.getId(), "credit-note", savedCn.getId());
        addTargetTimeline("credit-note", savedCn.getId(), "created", "Credit Note created",
                "Credit Note '" + savedCn.getCnNo() + "' created from Proforma Invoice '" + pi.getPiNo() + "'.");
        addTargetHistory("credit-note", savedCn.getId(), "Credit Note", savedCn.getCnNo(), currentUserName());

        pi.setConvertedToCn(savedCn.getCnNo());
        addTimeline(pi, "converted", "Converted to Credit Note",
                "Proforma Invoice converted to Credit Note " + savedCn.getCnNo() + ".");
        addHistory(pi, "Status", null, "Converted", currentUserName());
        proformaInvoiceRepository.save(pi);
        return new ConversionResult("credit-note", savedCn.getId(), savedCn.getCnNo(), "Credit Note " + savedCn.getCnNo() + " created from Proforma Invoice " + pi.getPiNo());
    }

    /** Proforma Invoice → Payment Receipt conversion. */
    public ConversionResult convertToPaymentReceipt(Long id) {
        ProformaInvoice pi = getPi(id);
        if (isNotBlank(pi.getConvertedToPr())) {
            throw new BadRequestException("Proforma Invoice already converted to Payment Receipt " + pi.getConvertedToPr());
        }
        PaymentReceipt receipt = new PaymentReceipt();
        receipt.setReceiptNo(buildPrNumber());
        receipt.setPaymentDate(LocalDateTime.now());
        receipt.setStatus("draft");
        receipt.setSource("proforma-invoice");
        receipt.setInvoiceRef(pi.getPiNo());
        receipt.setClientId(pi.getClientId());
        receipt.setClientName(pi.getClientName());
        receipt.setContactPerson(pi.getContactPerson());
        receipt.setEmail(pi.getEmail());
        receipt.setPhone(pi.getPhone());
        receipt.setGstin(pi.getGstin());
        receipt.setCompanyName(pi.getExporterName());
        receipt.setCompanyGstin(pi.getExporterGstin());
        receipt.setCompanyPan(pi.getExporterPan());
        receipt.setCompanyState(pi.getExporterState());
        receipt.setCompanyAddress(pi.getExporterAddress());
        receipt.setBankName(pi.getBankName());
        receipt.setBranch(pi.getBankBranch());
        receipt.setReferenceNo(pi.getReferenceNo());
        receipt.setAmount(pi.getGrandTotal());
        receipt.setRemarks("Payment receipt generated from Proforma Invoice " + pi.getPiNo());
        PaymentReceipt savedPr = paymentReceiptRepository.save(receipt);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, pi.getId(), "payment-receipt", savedPr.getId());
        addTargetTimeline("payment-receipt", savedPr.getId(), "created", "Payment Receipt created",
                "Payment Receipt '" + savedPr.getReceiptNo() + "' created from Proforma Invoice '" + pi.getPiNo() + "'.");
        addTargetHistory("payment-receipt", savedPr.getId(), "Payment Receipt", savedPr.getReceiptNo(), currentUserName());

        pi.setConvertedToPr(savedPr.getReceiptNo());
        addTimeline(pi, "converted", "Converted to Payment Receipt",
                "Proforma Invoice converted to Payment Receipt " + savedPr.getReceiptNo() + ".");
        addHistory(pi, "Status", null, "Converted", currentUserName());
        proformaInvoiceRepository.save(pi);
        return new ConversionResult("payment-receipt", savedPr.getId(), savedPr.getReceiptNo(), "Payment Receipt " + savedPr.getReceiptNo() + " created from Proforma Invoice " + pi.getPiNo());
    }

    @Transactional(readOnly = true)
    public List<ProformaInvoiceResponse> export(String search, String status, String client,
                                                String dateFrom, String dateTo,
                                                BigDecimal minAmount, BigDecimal maxAmount) {
        Specification<ProformaInvoice> spec = buildSpecification(search, status, client, dateFrom, dateTo, minAmount, maxAmount);
        return proformaInvoiceRepository.findAll(spec).stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public String buildCsv(List<ProformaInvoiceResponse> pis) {
        StringBuilder sb = new StringBuilder();
        sb.append("PI No,Date,Client,Reference,Status,Items,Amount,Created\n");
        for (ProformaInvoiceResponse p : pis) {
            sb.append(escapeCsv(p.piNo())).append(',')
              .append(escapeCsv(p.date())).append(',')
              .append(escapeCsv(p.clientName())).append(',')
              .append(escapeCsv(p.referenceNo())).append(',')
              .append(escapeCsv(p.status())).append(',')
              .append(p.itemsCount() == null ? "" : p.itemsCount()).append(',')
              .append(p.grandTotal() == null ? "" : p.grandTotal().toPlainString()).append(',')
              .append(escapeCsv(p.createdAt())).append('\n');
        }
        return sb.toString();
    }

    @Transactional(readOnly = true)
    public List<SalesTimelineResponse> getTimeline(Long id) {
        getPi(id);
        return timelineRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, id)
                .stream().map(this::timelineResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SalesHistoryResponse> getHistory(Long id) {
        getPi(id);
        return historyRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, id)
                .stream().map(this::historyResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SalesAttachmentResponse> getAttachments(Long id) {
        getPi(id);
        return attachmentRepository.findByModuleTypeAndModuleIdOrderByUploadedAtAsc(MODULE, id)
                .stream().map(this::attachmentResponse).toList();
    }

    public SalesAttachmentResponse addAttachment(Long id, MultipartFile file) {
        ProformaInvoice pi = getPi(id);
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
                file.getOriginalFilename(), "Proforma Invoice", id,
                pi.getPiNo(), pi.getClientId(), pi.getClientName(),
                baseUrl + "/v1/files/" + storedName,
                file.getContentType(), file.getSize(),
                currentUserName(), DocumentVisibility.TEAM_ONLY);
        return attachmentResponse(saved);
    }

    public void deleteAttachment(Long id, Long attachmentId) {
        getPi(id);
        SalesAttachment attachment = attachmentRepository.findById(attachmentId)
                .filter(a -> MODULE.equals(a.getModuleType()) && id.equals(a.getModuleId()))
                .orElseThrow(() -> new ResourceNotFoundException("Attachment not found with id: " + attachmentId));
        attachmentRepository.delete(attachment);
    }

    private void copyForRevision(ProformaInvoice copy, ProformaInvoice source) {
        org.springframework.beans.BeanUtils.copyProperties(source, copy,
                "id", "items", "timeline", "revisionOf", "revision", "revisionDate", "latestRevision", "createdAt", "updatedAt", "archivedAt");
        for (ProformaInvoiceItem sourceItem : source.getItems()) {
            ProformaInvoiceItem item = new ProformaInvoiceItem();
            org.springframework.beans.BeanUtils.copyProperties(sourceItem, item,
                    "id", "proformaInvoice", "createdAt");
            copy.addItem(item);
        }
    }

    private int maxRevisionOfChain(Long baseId) {
        return proformaInvoiceRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .mapToInt(ProformaInvoice::getRevision)
                .max()
                .orElse(0);
    }

    /** Detail response — also carries the full revision chain for the UI. */
    private ProformaInvoiceResponse toResponseDetail(ProformaInvoice pi) {
        return toResponse(pi, revisionChain(pi));
    }

    private List<RevisionInfo> revisionChain(ProformaInvoice pi) {
        Long baseId = pi.getRevisionOf() != null ? pi.getRevisionOf() : pi.getId();
        List<RevisionInfo> chain = new ArrayList<>();
        proformaInvoiceRepository.findById(baseId).ifPresent(q -> chain.add(revisionInfo(q)));
        proformaInvoiceRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .sorted(java.util.Comparator.comparingInt(ProformaInvoice::getRevision))
                .forEach(q -> chain.add(revisionInfo(q)));
        return chain;
    }

    private RevisionInfo revisionInfo(ProformaInvoice pi) {
        return new RevisionInfo(
                pi.getId(),
                pi.getPiNo(),
                pi.getRevision(),
                pi.getStatus(),
                pi.getRevisionDate() == null
                        ? (pi.getCreatedAt() == null ? null : pi.getCreatedAt().toString())
                        : pi.getRevisionDate().toString(),
                pi.isLatestRevision());
    }

    /** When the latest revision is deleted, the previous one becomes latest. */
    private void promotePreviousRevision(ProformaInvoice removed) {
        if (!removed.isLatestRevision()) {
            return;
        }
        Long baseId = removed.getRevisionOf() != null ? removed.getRevisionOf() : removed.getId();
        // Highest remaining revision row first (revision >= 1).
        proformaInvoiceRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .filter(q -> !q.getId().equals(removed.getId()))
                .filter(q -> !"deleted".equals(q.getStatus()))
                .findFirst()
                .ifPresentOrElse(q -> {
                    q.setLatestRevision(true);
                    proformaInvoiceRepository.save(q);
                    removed.setLatestRevision(false);
                    proformaInvoiceRepository.save(removed);
                }, () -> proformaInvoiceRepository.findById(baseId).ifPresent(q -> {
                    // Fall back to the base row (revision 0) when no revision rows remain.
                    if (!q.getId().equals(removed.getId()) && !"deleted".equals(q.getStatus())) {
                        q.setLatestRevision(true);
                        proformaInvoiceRepository.save(q);
                        removed.setLatestRevision(false);
                        proformaInvoiceRepository.save(removed);
                    }
                }));
    }

    /** List/export response - carries no revision chain (avoids N+1). */
    private ProformaInvoiceResponse toResponse(ProformaInvoice entity) {
        return toResponse(entity, List.of());
    }

    private ProformaInvoiceResponse toResponse(ProformaInvoice pi, List<RevisionInfo> revisions) {
        List<ProformaInvoiceItemResponse> itemResponses = pi.getItems().stream().map(this::itemResponse).toList();
        BigDecimal totalQty = itemResponses.stream()
                .map(ProformaInvoiceItemResponse::qty)
                .filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new ProformaInvoiceResponse(
                pi.getId(), pi.getPiNo(),
                pi.getPiDate() == null ? null : pi.getPiDate().toLocalDate().toString(),
                pi.getReferenceNo(),
                pi.getValidTill() == null ? null : pi.getValidTill().toLocalDate().toString(),
                pi.getSource(), pi.getSourceRef(), pi.getStatus(),
                pi.getClientId(), pi.getClientName(), pi.getContactPerson(),
                pi.getGstin(), pi.getPan(), pi.getEmail(), pi.getPhone(),
                pi.getBillingAddress(), pi.isShipSameAsBill(), pi.getShippingAddress(),
                pi.getBankName(), pi.getBankAcctName(), pi.getBankAccount(), pi.getBankIfsc(), pi.getBankBranch(),
                pi.getBankType(), pi.getBankUpi(), pi.getBankSwift(), pi.getBankAddress(),
                pi.getConsigneeName(), pi.getConsigneeAddress(), pi.getConsigneeCountry(), pi.getTerms(),
                pi.getTaxType(), pi.getHsnView(), pi.getNotes(),
                pi.getCurrency(), pi.getTaxTreatment(), pi.getPackingDetails(),
                pi.getAuthorizedSignatory(), pi.getDesignation(), pi.getPlace(),
                pi.getAuthorizationDate() == null ? null : pi.getAuthorizationDate().toLocalDate().toString(),
                pi.getCompanyStamp(),
                pi.getSubTotal(), pi.getDiscount(), pi.getDiscountPct(),
                pi.getCgstTotal(), pi.getSgstTotal(), pi.getTaxTotal(),
                pi.getCharges(), pi.getGrandTotal(),
                itemResponses.size(), totalQty, pi.getConvertedToInvoice(),
                pi.getConvertedToSo(), pi.getConvertedToDc(), pi.getConvertedToCn(), pi.getConvertedToPr(),
                pi.getPiDate() == null
                        ? (pi.getCreatedAt() == null ? null : pi.getCreatedAt().toLocalDate().toString())
                        : pi.getPiDate().toLocalDate().toString(),
                pi.getCreatedAt() == null ? null : pi.getCreatedAt().toString(),
                pi.getUpdatedAt() == null ? null : pi.getUpdatedAt().toString(),
                pi.getArchivedAt() == null ? null : pi.getArchivedAt().toString(),
                itemResponses,
                attachmentRepository.findByModuleTypeAndModuleIdOrderByUploadedAtAsc(MODULE, pi.getId())
                        .stream().map(this::attachmentResponse).toList(),
                timelineRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, pi.getId())
                        .stream().map(this::timelineResponse).toList(),
                historyRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, pi.getId())
                        .stream().map(this::historyResponse).toList(),
                pi.getRevision(),
                pi.getRevisionOf(),
                pi.isLatestRevision(),
                pi.getRevisionDate() == null ? null : pi.getRevisionDate().toString(),
                revisions,
                pi.getContractNo(),
                pi.getContractDate() == null ? null : pi.getContractDate().toLocalDate().toString(),
                pi.getAppendixPoNo(),
                pi.getAppendixDate() == null ? null : pi.getAppendixDate().toLocalDate().toString(),
                pi.getExporterRef(),
                pi.getExporterName(),
                pi.getExporterAddress(),
                pi.getExporterEmail(),
                pi.getExporterPhone(),
                pi.getExporterGstin(),
                pi.getExporterPan(),
                pi.getExporterState(),
                pi.getBuyerName(),
                pi.getBuyerAddress(),
                pi.getBuyerCountry(),
                pi.isBuyerSameAsConsignee(),
                pi.getCountryOfOrigin(),
                pi.getCountryOfFinalDestination(),
                pi.getPreCarriageBy(),
                pi.getPlaceOfReceipt(),
                pi.getVesselFlightNo(),
                pi.getPortOfLoading(),
                pi.getPortOfDischarge(),
                pi.getPlaceOfDelivery(),
                pi.getTermsOfDelivery(),
                pi.getPaymentTerms(),
                pi.getHsCode(),
                pi.getCommodity(),
                pi.getInvoiceNo(),
                pi.getInvoiceDate() == null ? null : pi.getInvoiceDate().toLocalDate().toString(),
                pi.getBuyersOrderNo(),
                pi.getBuyersOrderDate() == null ? null : pi.getBuyersOrderDate().toLocalDate().toString(),
                pi.getPackageMarksNos(),
                pi.getPackageNoKindPkgs(),
                pi.getPackageDimensions(),
                pi.getTotalPackages(),
                pi.getNetWeight(),
                pi.getGrossWeight(),
                pi.getDeclaration()
        );
    }

    private ProformaInvoiceItemResponse itemResponse(ProformaInvoiceItem item) {
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
        return new ProformaInvoiceItemResponse(item.getId(), item.getDescription(), item.getSku(), item.getDrawingNo(), item.getMaterial(), item.getDelivery(), item.getHsn(),
                item.getMarksNos(), item.getNoKindPkgs(), item.getManufacturer(), item.getCountryOfOrigin(),
                item.getUom(), qty, rate, discPct, gst,
                gross.setScale(2, RoundingMode.HALF_UP), discAmt.setScale(2, RoundingMode.HALF_UP),
                net.setScale(2, RoundingMode.HALF_UP), cgst.setScale(2, RoundingMode.HALF_UP),
                sgst.setScale(2, RoundingMode.HALF_UP), total.setScale(2, RoundingMode.HALF_UP),
                nvl(item.getNetWeight(), BigDecimal.ZERO), nvl(item.getGrossWeight(), BigDecimal.ZERO));
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

    private ProformaInvoice getPi(Long id) {
        return proformaInvoiceRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Proforma Invoice not found with id: " + id));
    }

    private void applyRequest(ProformaInvoice pi, ProformaInvoiceRequest request) {
        pi.setPiDate(parseDate(request.piDate()));
        pi.setReferenceNo(request.referenceNo());
        pi.setContractNo(request.contractNo());
        pi.setContractDate(parseDate(request.contractDate()));
        pi.setAppendixPoNo(request.appendixPoNo());
        pi.setAppendixDate(parseDate(request.appendixDate()));
        pi.setExporterRef(request.exporterRef());
        pi.setExporterName(request.exporterName());
        pi.setExporterAddress(request.exporterAddress());
        pi.setExporterEmail(request.exporterEmail());
        pi.setExporterPhone(request.exporterPhone());
        pi.setExporterGstin(request.exporterGstin());
        pi.setExporterPan(request.exporterPan());
        pi.setExporterState(request.exporterState());
        pi.setBuyerName(request.buyerName());
        pi.setBuyerAddress(request.buyerAddress());
        pi.setBuyerCountry(request.buyerCountry());
        pi.setBuyerSameAsConsignee(Boolean.TRUE.equals(request.buyerSameAsConsignee()));
        pi.setCountryOfOrigin(request.countryOfOrigin());
        pi.setCountryOfFinalDestination(request.countryOfFinalDestination());
        pi.setPreCarriageBy(request.preCarriageBy());
        pi.setPlaceOfReceipt(request.placeOfReceipt());
        pi.setVesselFlightNo(request.vesselFlightNo());
        pi.setPortOfLoading(request.portOfLoading());
        pi.setPortOfDischarge(request.portOfDischarge());
        pi.setPlaceOfDelivery(request.placeOfDelivery());
        pi.setTermsOfDelivery(request.termsOfDelivery());
        pi.setPaymentTerms(request.paymentTerms());
        pi.setHsCode(request.hsCode());
        pi.setCommodity(request.commodity());
        // ---- Packing List fields (only populated for packing-list documents) ----
        pi.setInvoiceNo(request.invoiceNo());
        pi.setInvoiceDate(parseDate(request.invoiceDate()));
        pi.setBuyersOrderNo(request.buyersOrderNo());
        pi.setBuyersOrderDate(parseDate(request.buyersOrderDate()));
        pi.setPackageMarksNos(request.packageMarksNos());
        pi.setPackageNoKindPkgs(request.packageNoKindPkgs());
        pi.setPackageDimensions(request.packageDimensions());
        pi.setTotalPackages(request.totalPackages() == null ? BigDecimal.ZERO : request.totalPackages());
        pi.setTotalQty(request.totalQty() == null ? BigDecimal.ZERO : request.totalQty());
        pi.setNetWeight(request.netWeight() == null ? BigDecimal.ZERO : request.netWeight());
        pi.setGrossWeight(request.grossWeight() == null ? BigDecimal.ZERO : request.grossWeight());
        pi.setDeclaration(request.declaration());
        pi.setValidTill(parseDate(request.validTill()));
        pi.setSource(request.source());
        pi.setSourceRef(request.sourceRef());
        pi.setClientId(request.clientId());
        pi.setClientName(request.clientName());
        pi.setContactPerson(request.contactPerson());
        pi.setGstin(request.gstin());
        pi.setPan(request.pan());
        pi.setEmail(request.email());
        pi.setPhone(request.phone());
        pi.setBillingAddress(request.billingAddress());
        pi.setShipSameAsBill(Boolean.TRUE.equals(request.shipSameAsBill()));
        pi.setShippingAddress(request.shippingAddress());
        pi.setBankName(request.bankName());
        pi.setBankAcctName(request.bankAcctName());
        pi.setBankAccount(request.bankAccount());
        pi.setBankIfsc(request.bankIfsc());
        pi.setBankBranch(request.bankBranch());
        pi.setBankType(request.bankType());
        pi.setBankUpi(request.bankUpi());
        pi.setBankSwift(request.bankSwift());
        pi.setBankAddress(request.bankAddress());
        pi.setConsigneeName(request.consigneeName());
        pi.setConsigneeAddress(request.consigneeAddress());
        pi.setConsigneeCountry(request.consigneeCountry());
        pi.setTerms(request.terms());
        pi.setTaxType(request.taxType());
        pi.setHsnView(request.hsnView());
        pi.setNotes(request.notes());
        pi.setCurrency(request.currency());
        pi.setTaxTreatment(request.taxTreatment());
        pi.setPackingDetails(request.packingDetails());
        pi.setAuthorizedSignatory(request.authorizedSignatory());
        pi.setDesignation(request.designation());
        pi.setPlace(request.place());
        pi.setAuthorizationDate(parseDate(request.authorizationDate()));
        pi.setCompanyStamp(request.companyStamp());
        pi.setCharges(request.charges() == null ? BigDecimal.ZERO : request.charges());
        // ERP proforma uses a PERCENTAGE discount (Discount % input with a
        // Discount Amount display); recalcTotals converts it to the flat
        // amount persisted on the entity.
        pi.setDiscountPct(request.discountPct() == null ? BigDecimal.ZERO : request.discountPct());
        pi.getItems().clear();
        if (request.items() != null) {
            for (ProformaInvoiceItemRequest itemRequest : request.items()) {
                if (itemRequest == null) {
                    continue;
                }
                ProformaInvoiceItem item = new ProformaInvoiceItem();
                item.setDescription(itemRequest.description());
                item.setSku(itemRequest.sku());
                item.setDrawingNo(itemRequest.drawingNo());
                item.setMaterial(itemRequest.material());
                item.setDelivery(itemRequest.delivery());
                item.setHsn(itemRequest.hsn());
                item.setMarksNos(itemRequest.marksNos());
                item.setNoKindPkgs(itemRequest.noKindPkgs());
                item.setManufacturer(itemRequest.manufacturer());
                item.setCountryOfOrigin(itemRequest.countryOfOrigin());
                item.setUom(itemRequest.uom());
                item.setQty(nvl(itemRequest.qty(), BigDecimal.ONE));
                item.setRate(nvl(itemRequest.rate(), BigDecimal.ZERO));
                item.setDiscountPct(nvl(itemRequest.discountPct(), BigDecimal.ZERO));
                item.setGstRate(nvl(itemRequest.gstRate(), BigDecimal.ZERO));
                item.setNetWeight(nvl(itemRequest.netWeight(), BigDecimal.ZERO));
                item.setGrossWeight(nvl(itemRequest.grossWeight(), BigDecimal.ZERO));
                pi.addItem(item);
            }
        }
    }

    private void copyItem(ProformaInvoiceItem target, ProformaInvoiceItem source) {
        target.setDescription(source.getDescription());
        target.setSku(source.getSku());
        target.setDrawingNo(source.getDrawingNo());
        target.setMaterial(source.getMaterial());
        target.setDelivery(source.getDelivery());
        target.setHsn(source.getHsn());
        target.setMarksNos(source.getMarksNos());
        target.setNoKindPkgs(source.getNoKindPkgs());
        target.setManufacturer(source.getManufacturer());
        target.setCountryOfOrigin(source.getCountryOfOrigin());
        target.setUom(source.getUom());
        target.setQty(source.getQty());
        target.setRate(source.getRate());
        target.setDiscountPct(source.getDiscountPct());
        target.setGstRate(source.getGstRate());
        target.setNetWeight(source.getNetWeight());
        target.setGrossWeight(source.getGrossWeight());
    }

    private void recalcTotals(ProformaInvoice pi) {
        BigDecimal subTotal = BigDecimal.ZERO;
        BigDecimal cgstTotal = BigDecimal.ZERO;
        BigDecimal sgstTotal = BigDecimal.ZERO;
        for (ProformaInvoiceItem item : pi.getItems()) {
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
        pi.setSubTotal(subTotal.setScale(2, RoundingMode.HALF_UP));
        pi.setCgstTotal(cgstTotal.setScale(2, RoundingMode.HALF_UP));
        pi.setSgstTotal(sgstTotal.setScale(2, RoundingMode.HALF_UP));
        BigDecimal taxTotal = cgstTotal.add(sgstTotal);
        pi.setTaxTotal(taxTotal.setScale(2, RoundingMode.HALF_UP));
        // ERP proforma: Discount (%) → Discount Amount = SubTotal × pct / 100;
        // Grand Total = SubTotal + Tax − Discount Amount + Charges.
        BigDecimal pct = nvl(pi.getDiscountPct(), BigDecimal.ZERO);
        BigDecimal discount = subTotal.multiply(pct)
                .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        BigDecimal charges = nvl(pi.getCharges(), BigDecimal.ZERO);
        BigDecimal grand = subTotal.add(taxTotal).subtract(discount).add(charges);
        if (grand.compareTo(BigDecimal.ZERO) < 0) {
            grand = BigDecimal.ZERO;
        }
        pi.setDiscount(discount);
        pi.setDiscountPct(pct);
        pi.setGrandTotal(grand.setScale(2, RoundingMode.HALF_UP));
        // Packing List aggregates — computed from the line items whenever the
        // rows carry weights; otherwise the stored header values are kept.
        BigDecimal totalQty = BigDecimal.ZERO;
        BigDecimal netWeight = BigDecimal.ZERO;
        BigDecimal grossWeight = BigDecimal.ZERO;
        for (ProformaInvoiceItem item : pi.getItems()) {
            totalQty = totalQty.add(nvl(item.getQty(), BigDecimal.ZERO));
            netWeight = netWeight.add(nvl(item.getNetWeight(), BigDecimal.ZERO));
            grossWeight = grossWeight.add(nvl(item.getGrossWeight(), BigDecimal.ZERO));
        }
        if (netWeight.compareTo(BigDecimal.ZERO) > 0 || grossWeight.compareTo(BigDecimal.ZERO) > 0) {
            pi.setTotalQty(totalQty.setScale(3, RoundingMode.HALF_UP));
            pi.setNetWeight(netWeight.setScale(3, RoundingMode.HALF_UP));
            pi.setGrossWeight(grossWeight.setScale(3, RoundingMode.HALF_UP));
        } else if (totalQty.compareTo(BigDecimal.ZERO) > 0 && pi.getTotalQty().signum() == 0) {
            pi.setTotalQty(totalQty.setScale(3, RoundingMode.HALF_UP));
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
    private Predicate latestPerChainPredicate(jakarta.persistence.criteria.Root<ProformaInvoice> root, jakarta.persistence.criteria.CriteriaQuery<?> query, jakarta.persistence.criteria.CriteriaBuilder cb) {
        Subquery<Long> newer = query.subquery(Long.class);
        jakarta.persistence.criteria.Root<ProformaInvoice> newerRoot = newer.from(ProformaInvoice.class);
        newer.select(newerRoot.get("id"));
        newer.where(cb.and(
                cb.equal(newerRoot.get("revisionOf"),
                        cb.coalesce(root.get("revisionOf"), root.get("id"))),
                cb.greaterThan(cb.coalesce(newerRoot.get("revision"), 0),
                        cb.coalesce(root.get("revision"), 0))));
        return cb.or(cb.isTrue(root.get("latestRevision")), cb.not(cb.exists(newer)));
    }

    private Specification<ProformaInvoice> buildSpecification(String search, String status, String client,
                                                              String dateFrom, String dateTo,
                                                              BigDecimal minAmount, BigDecimal maxAmount) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(latestPerChainPredicate(root, query, cb));
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("piNo")), like),
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
                predicates.add(cb.greaterThanOrEqualTo(root.get("piDate"), LocalDate.parse(dateFrom).atStartOfDay()));
            }
            if (dateTo != null && !dateTo.isBlank()) {
                predicates.add(cb.lessThanOrEqualTo(root.get("piDate"), LocalDate.parse(dateTo).atTime(23, 59, 59)));
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
            case "clientName", "piDate", "validTill", "grandTotal", "status", "createdAt", "updatedAt", "piNo"
                    -> "piNo".equals(field) ? "piNo" : field;
            case "id" -> "piNo";
            default -> "createdAt";
        };
        boolean asc = parts.length > 1 && "asc".equalsIgnoreCase(parts[1]);
        return Sort.by(asc ? Sort.Direction.ASC : Sort.Direction.DESC, mapped);
    }

    private long nextSequence() {
        long count = proformaInvoiceRepository.count();
        long maxSuffix = 0;
        String prefix = "PI-" + Year.now().getValue() + "-";
        for (String no : proformaInvoiceRepository.findAllPiNos()) {
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
        return String.format("PI-%d-%06d", Year.now().getValue(), sequence);
    }

    private String buildSoNumber() {
        long maxSuffix = 0;
        // Canonical Customer Purchase Order number: CPO-YYYY-NNNNNN, shared with
        // every other conversion path. Both the current CPO- and the legacy SO-
        // prefixes are scanned so this generator can never reissue a number that
        // another Sales Execution document already handed out.
        String prefix = "CPO-" + Year.now().getValue() + "-";
        String legacyPrefix = "SO-" + Year.now().getValue() + "-";
        for (String no : salesOrderRepository.findAllSoNos()) {
            if (no == null) continue;
            String matched = no.startsWith(prefix) ? prefix : (no.startsWith(legacyPrefix) ? legacyPrefix : null);
            if (matched == null) continue;
            try {
                maxSuffix = Math.max(maxSuffix, Long.parseLong(no.substring(matched.length())));
            } catch (NumberFormatException ignored) {
                // skip malformed numbers
            }
        }
        return String.format("CPO-%d-%06d", Year.now().getValue(), Math.max(salesOrderRepository.count(), maxSuffix) + 1);
    }

    private String buildDcNumber() {
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
        return String.format("DC-%d-%06d", Year.now().getValue(), Math.max(deliveryChallanRepository.count(), maxSuffix) + 1);
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
            case "sent" -> "sent";
            case "partial_paid", "partial paid" -> "partial paid";
            case "paid" -> "paid";
            case "overdue" -> "overdue";
            case "accepted" -> "accepted";
            case "expired" -> "expired";
            case "cancelled" -> "cancelled";
            case "converted" -> "converted";
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

    private void addTimeline(ProformaInvoice pi, String type, String title, String detail) {
        SalesTimeline entry = new SalesTimeline();
        entry.setModuleType(MODULE);
        entry.setModuleId(pi.getId());
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

    private void addHistory(ProformaInvoice pi, String field, String oldValue, String newValue, String changedBy) {
        SalesHistory entry = new SalesHistory();
        entry.setModuleType(MODULE);
        entry.setModuleId(pi.getId());
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
