package com.vishatech.erp.service;
import com.vishatech.erp.dto.ConversionResult;

import com.vishatech.erp.dto.SalesAttachmentResponse;
import com.vishatech.erp.dto.SalesContractItemRequest;
import com.vishatech.erp.dto.SalesContractItemResponse;
import com.vishatech.erp.dto.SalesContractNextNumberResponse;
import com.vishatech.erp.dto.SalesContractRequest;
import com.vishatech.erp.dto.SalesContractResponse;
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
import com.vishatech.erp.entity.SalesContract;
import com.vishatech.erp.entity.SalesContractItem;
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
import com.vishatech.erp.repository.SalesAttachmentRepository;
import com.vishatech.erp.repository.SalesContractRepository;
import com.vishatech.erp.repository.SalesHistoryRepository;
import com.vishatech.erp.repository.SalesOrderRepository;
import com.vishatech.erp.repository.SalesTimelineRepository;
import com.vishatech.erp.crm.entity.Customer;
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
public class SalesContractService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final String MODULE = "sales-contract";
    /** Longest attachment category the shared store can label a file with. */
    private static final int MAX_ATTACHMENT_CATEGORY = 40;

    private final SalesContractRepository salesContractRepository;
    private final SalesTimelineRepository timelineRepository;
    private final SalesHistoryRepository historyRepository;
    private final SalesAttachmentRepository attachmentRepository;
    private final EditHistoryRepository editHistoryRepository;
    private final RecordRevisionRepository recordRevisionRepository;
    private final SalesOrderRepository salesOrderRepository;
    private final ProformaInvoiceRepository proformaInvoiceRepository;
    private final DeliveryChallanRepository deliveryChallanRepository;
    private final InvoiceRepository invoiceRepository;
    private final CreditNoteRepository creditNoteRepository;
    private final PaymentReceiptRepository paymentReceiptRepository;
    private final FileStorageService fileStorageService;
    private final DocumentRepositoryService documentRepositoryService;
    private final String baseUrl;

    public SalesContractService(SalesContractRepository salesContractRepository,
                                SalesTimelineRepository timelineRepository,
                                SalesHistoryRepository historyRepository,                                 SalesAttachmentRepository attachmentRepository,
                                 EditHistoryRepository editHistoryRepository,
                                 RecordRevisionRepository recordRevisionRepository,
                                 SalesOrderRepository salesOrderRepository,
                                ProformaInvoiceRepository proformaInvoiceRepository,
                                DeliveryChallanRepository deliveryChallanRepository,
                                InvoiceRepository invoiceRepository,
                                CreditNoteRepository creditNoteRepository,
                                PaymentReceiptRepository paymentReceiptRepository,
                                FileStorageService fileStorageService,
                                DocumentRepositoryService documentRepositoryService,
                                @Value("${app.base-url:http://localhost:8080}") String baseUrl) {
        this.salesContractRepository = salesContractRepository;
        this.timelineRepository = timelineRepository;
        this.historyRepository = historyRepository;
        this.attachmentRepository = attachmentRepository;
        this.editHistoryRepository = editHistoryRepository;
        this.recordRevisionRepository = recordRevisionRepository;
        this.salesOrderRepository = salesOrderRepository;
        this.proformaInvoiceRepository = proformaInvoiceRepository;
        this.deliveryChallanRepository = deliveryChallanRepository;
        this.invoiceRepository = invoiceRepository;
        this.creditNoteRepository = creditNoteRepository;
        this.paymentReceiptRepository = paymentReceiptRepository;
        this.fileStorageService = fileStorageService;
        this.documentRepositoryService = documentRepositoryService;
        this.baseUrl = baseUrl;
    }

    @Transactional(readOnly = true)
    public Page<SalesContractResponse> list(int page, int size, String search, String sort,
                                            String status, String client, String salesExecutive,
                                            String dateFrom, String dateTo,
                                            BigDecimal minAmount, BigDecimal maxAmount) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort));
        Specification<SalesContract> spec = buildSpecification(search, status, client, salesExecutive,
                dateFrom, dateTo, minAmount, maxAmount);
        return salesContractRepository.findAll(spec, pageable).map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public SalesContractResponse get(Long id) {
        return toResponseDetail(getContract(id));
    }

    @Transactional(readOnly = true)
    public SalesContractNextNumberResponse getNextNumber() {
        long next = nextSequence();
        return new SalesContractNextNumberResponse(buildNo(next), next);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> stats() {
        List<String> excluded = List.of("archived", "deleted");
        Map<String, Object> stats = new LinkedHashMap<>();
        long active = 0;
        // Count only the CURRENT revision of each chain so KPI cards match
        // the list rows (older revisions are surfaced through the Document
        // Workflow dropdown, never as separate list rows).
        for (String status : List.of("draft", "submitted", "approved", "active", "completed", "cancelled")) {
            long count = salesContractRepository.countCurrentByStatus(status);
            stats.put(status.replace(" ", ""), count);
            active += count;
        }
        long underReview = salesContractRepository.countCurrentByStatus("under review");
        stats.put("underreview", underReview);
        active += underReview;
        stats.put("total", active);
        stats.put("active", active);
        stats.put("archived", salesContractRepository.countCurrentByStatus("archived"));
        stats.put("deleted", salesContractRepository.countCurrentByStatus("deleted"));
        stats.put("totalAmt", salesContractRepository.sumGrandTotalExcluding(excluded));
        return stats;
    }

    public SalesContractResponse create(SalesContractRequest request, boolean draft) {
        SalesContract contract = new SalesContract();
        if (request.scNo() != null && !request.scNo().isBlank()) {
            if (salesContractRepository.existsByScNo(request.scNo().trim())) {
                throw new BadRequestException("Contract number already exists: " + request.scNo());
            }
            contract.setScNo(request.scNo().trim());
        } else {
            contract.setScNo(buildNo(nextSequence()));
        }
        applyRequest(contract, request);
        if (draft) {
            contract.setStatus("draft");
        } else if (request.status() != null && !request.status().isBlank()) {
            contract.setStatus(normalizeStatus(request.status()));
        } else {
            contract.setStatus("draft");
        }
        recalcTotals(contract);
        SalesContract saved = salesContractRepository.save(contract);
        addTimeline(saved, "created", "Sales Contract created",
                "Sales Contract '" + saved.getScNo() + "' was created.");
        addHistory(saved, "Sales Contract", null, saved.getScNo(), currentUserName());
        syncRecordDocumentQuietly(
                "Sales Contract", saved.getId(), saved.getScNo(), "Sales Contract", saved.getScNo(),
                saved.getClientId(), saved.getClientName(), saved.getStatus());
        return toResponse(saved);
    }

    /**
     * Every edit creates a NEW revision row (BASE(N)); the previous version is
     * never deleted or overwritten. Only the latest revision is editable.
     */
    public SalesContractResponse update(Long id, SalesContractRequest request) {
        SalesContract current = getContract(id);
        if (!current.isLatestRevision()) {
            throw new BadRequestException("Only the latest revision can be edited");
        }
        Long baseId = current.getRevisionOf() != null ? current.getRevisionOf() : current.getId();
        int nextRev = maxRevisionOfChain(baseId) + 1;

        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(current);
        Map<String, String> before = editHistory.snapshot(current);
        before.put("itemsFingerprint", EditHistoryService.itemsFingerprint(current));

        SalesContract revision = new SalesContract();
        copyForRevision(revision, current);
        applyRequest(revision, request);
        if (request.status() != null && !request.status().isBlank()) {
            revision.setStatus(normalizeStatus(request.status()));
        }
        recalcTotals(revision);

        // No-op guard: saving without touching persisted business data must
        // NOT fabricate a revision (autosave retried, refresh, no-change save).
        Map<String, String> after = editHistory.snapshot(revision);
        after.put("itemsFingerprint", EditHistoryService.itemsFingerprint(revision));
        if (EditHistoryService.isNoOpEdit(before, after)) {
            return toResponseDetail(current);
        }

        revision.setScNo(RevisionSupport.nextRevisionNumber(
                RevisionSupport.baseNumber(current.getScNo()), nextRev));
        revision.setRevisionOf(baseId);
        revision.setRevision(nextRev);
        revision.setRevisionDate(java.time.LocalDateTime.now());
        revision.setLatestRevision(true);

        current.setLatestRevision(false);
        salesContractRepository.save(current);
        SalesContract saved = salesContractRepository.saveAndFlush(revision);
        addTimeline(saved, "revision", "Revision " + nextRev + " created",
                "Revision '" + saved.getScNo() + "' created from '" + current.getScNo()
                        + "' by " + currentUserName() + ".");
        editHistory.recordEdit("sales-contract", saved.getId(), editBefore, editHistory.snapshot(saved));
        syncRecordDocumentQuietly(
                "Sales Contract", saved.getId(), saved.getScNo(), "Sales Contract", saved.getScNo(),
                saved.getClientId(), saved.getClientName(), saved.getStatus());
        return toResponseDetail(saved);
    }

    public SalesContractResponse delete(Long id) {
        SalesContract contract = getContract(id);
        RevisionSupport.requireLatest(contract.isLatestRevision());
        contract.setStatus("deleted");
        contract.setArchivedAt(LocalDateTime.now());
        addTimeline(contract, "deleted", "Sales Contract deleted",
                "Sales Contract was moved to trash by " + currentUserName() + ".");
        addHistory(contract, "Status", null, "Deleted", currentUserName());
        SalesContract saved = salesContractRepository.save(contract);
        syncRecordDocumentQuietly(saved);
        return toResponse(saved);
    }

    // ---------------------------------------------------------------------
    // Document-mirror integration.
    //
    // SOURCE mirrors every Sales Contract into the Documents module through
    // DocumentRepositoryService#syncRecordDocumentQuietly /
    // purgeRecordDocumentsQuietly. TARGET's Documents module is protected in
    // this task and does not expose those methods, so these thin shims keep the
    // SOURCE call structure while leaving the Documents module untouched.
    // Attachments still register through registerFromAttachment, which the
    // TARGET Documents module already provides.
    // ---------------------------------------------------------------------

    /** Mirror the central Documents repository with the current record state. */
    private void syncRecordDocumentQuietly(SalesContract c) {
        syncRecordDocumentQuietly(
                "Sales Contract", c.getId(), c.getScNo(), "Sales Contract", c.getScNo(),
                c.getClientId(), c.getClientName(), c.getStatus());
    }

    /** Intentionally no-op — see note above. */
    private void syncRecordDocumentQuietly(String module, Long recordId, String code, String docType,
                                           String docNo, Long customerId, String clientName, String status) {
        // Intentionally no-op — TARGET's Documents module is protected.
    }

    /** Intentionally no-op — see note above. */
    private void purgeRecordDocumentsQuietly(String module, Long recordId) {
        // Intentionally no-op — TARGET's Documents module is protected.
    }

    public SalesContractResponse restore(Long id) {
        SalesContract contract = getContract(id);
        RevisionSupport.requireLatest(contract.isLatestRevision());
        String previous = contract.getStatus();
        String target = ("deleted".equals(previous) || "archived".equals(previous)) ? "draft" : previous;
        contract.setStatus(target);
        contract.setArchivedAt(null);
        addTimeline(contract, "restored", "Sales Contract restored",
                "Sales Contract was restored by " + currentUserName() + ".");
        addHistory(contract, "Status", titleCase(previous), titleCase(target), currentUserName());
        SalesContract saved = salesContractRepository.save(contract);
        syncRecordDocumentQuietly(saved);
        return toResponse(saved);
    }

    public SalesContractResponse archive(Long id) {
        SalesContract contract = getContract(id);
        RevisionSupport.requireLatest(contract.isLatestRevision());
        contract.setStatus("archived");
        contract.setArchivedAt(LocalDateTime.now());
        addTimeline(contract, "archived", "Sales Contract archived",
                "Sales Contract was archived by " + currentUserName() + ".");
        addHistory(contract, "Status", null, "Archived", currentUserName());
        SalesContract saved = salesContractRepository.save(contract);
        syncRecordDocumentQuietly(saved);
        return toResponse(saved);
    }

    public SalesContractResponse changeStatus(Long id, String status) {
        SalesContract contract = getContract(id);
        RevisionSupport.requireLatest(contract.isLatestRevision());
        String normalized = normalizeStatus(status);
        if ("deleted".equals(contract.getStatus())) {
            throw new BadRequestException("Cannot change status of a deleted Sales Contract");
        }
        contract.setStatus(normalized);
        addTimeline(contract, "status", "Status changed",
                "Status changed to '" + titleCase(normalized) + "' by " + currentUserName() + ".");
        addHistory(contract, "Status", null, titleCase(normalized), currentUserName());
        SalesContract saved = salesContractRepository.save(contract);
        syncRecordDocumentQuietly(saved);
        return toResponse(saved);
    }

    public SalesContractResponse approve(Long id) {
        SalesContract contract = getContract(id);
        RevisionSupport.requireLatest(contract.isLatestRevision());
        if ("deleted".equals(contract.getStatus())) {
            throw new BadRequestException("Cannot approve a deleted Sales Contract");
        }
        contract.setStatus("approved");
        addTimeline(contract, "approved", "Sales Contract approved",
                "Sales Contract approved by " + currentUserName() + ".");
        addHistory(contract, "Status", null, "Approved", currentUserName());
        SalesContract saved = salesContractRepository.save(contract);
        syncRecordDocumentQuietly(saved);
        return toResponse(saved);
    }

    public SalesContractResponse duplicate(Long id) {
        SalesContract source = getContract(id);
        SalesContract copy = new SalesContract();
        copy.setScNo(buildNo(nextSequence()));
        copy.setPoRef(source.getPoRef());
        copy.setLeadNo(source.getLeadNo());
        copy.setQtnRef(source.getQtnRef());
        copy.setCurrency(source.getCurrency());
        copy.setClientId(source.getClientId());
        copy.setClientName(source.getClientName());
        copy.setContactPerson(source.getContactPerson());
        copy.setEmail(source.getEmail());
        copy.setPhone(source.getPhone());
        copy.setCity(source.getCity());
        copy.setState(source.getState());
        copy.setBillingAddress(source.getBillingAddress());
        copy.setShippingAddress(source.getShippingAddress());
        copy.setGstin(source.getGstin());
        copy.setPan(source.getPan());
        copy.setPaymentTerms(source.getPaymentTerms());
        copy.setDeliveryTerms(source.getDeliveryTerms());
        copy.setSalesExecutive(source.getSalesExecutive());
        copy.setDuration(source.getDuration());
        copy.setWarranty(source.getWarranty());
        copy.setCommercialTerms(source.getCommercialTerms());
        copy.setScope(source.getScope());
        copy.setExclusions(source.getExclusions());
        copy.setRemarks(source.getRemarks());
        copy.setDiscount(source.getDiscount());
        copy.setCharges(source.getCharges());
        copy.setStatus("draft");
        copy.setContractDate(LocalDateTime.now());
        for (SalesContractItem sourceItem : source.getItems()) {
            SalesContractItem item = new SalesContractItem();
            copyItem(item, sourceItem);
            copy.addItem(item);
        }
        recalcTotals(copy);
        SalesContract saved = salesContractRepository.save(copy);
        addTimeline(saved, "created", "Sales Contract created",
                "Duplicated from Sales Contract '" + source.getScNo() + "'.");
        addHistory(saved, "Sales Contract", null, saved.getScNo(), currentUserName());
        syncRecordDocumentQuietly(saved);
        return toResponse(saved);
    }

    public int bulkArchive(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            SalesContract contract = getContract(id);
            if (!"archived".equals(contract.getStatus()) && !"deleted".equals(contract.getStatus())) {
                contract.setStatus("archived");
                contract.setArchivedAt(LocalDateTime.now());
                addTimeline(contract, "archived", "Sales Contract archived",
                        "Sales Contract was archived by " + currentUserName() + ".");
                SalesContract saved = salesContractRepository.save(contract);
                syncRecordDocumentQuietly(saved);
                count++;
            }
        }
        return count;
    }

    public int bulkRestore(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            SalesContract contract = getContract(id);
            if ("archived".equals(contract.getStatus()) || "deleted".equals(contract.getStatus())) {
                contract.setStatus("draft");
                contract.setArchivedAt(null);
                addTimeline(contract, "restored", "Sales Contract restored",
                        "Sales Contract was restored by " + currentUserName() + ".");
                SalesContract saved = salesContractRepository.save(contract);
                syncRecordDocumentQuietly(saved);
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
            SalesContract contract = getContract(id);
            if (!"deleted".equals(contract.getStatus())) {
                contract.setStatus("deleted");
                contract.setArchivedAt(LocalDateTime.now());
                addTimeline(contract, "deleted", "Sales Contract deleted",
                        "Sales Contract was moved to trash by " + currentUserName() + ".");
                addHistory(contract, "Status", null, "Deleted", currentUserName());
                SalesContract saved = salesContractRepository.save(contract);
                syncRecordDocumentQuietly(saved);
                count++;
            }
        }
        return count;
    }

    public int bulkPermanentDelete(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            SalesContract contract = getContract(id);
            // Remove the whole revision chain (base row + every revision row).
            Long baseId = contract.getRevisionOf() != null ? contract.getRevisionOf() : contract.getId();
            List<SalesContract> chain = new java.util.ArrayList<>();
            salesContractRepository.findById(baseId).ifPresent(chain::add);
            chain.addAll(salesContractRepository.findByRevisionOfOrderByRevisionDesc(baseId));
            for (SalesContract sc : chain) {
                // Purge related rows so no orphaned attachments/timeline/history/
                // edit-history/revision-snapshots survive the hard delete.
                timelineRepository.deleteByModuleTypeAndModuleId(MODULE, sc.getId());
                historyRepository.deleteByModuleTypeAndModuleId(MODULE, sc.getId());
                attachmentRepository.deleteByModuleTypeAndModuleId(MODULE, sc.getId());
                editHistoryRepository.deleteByModuleTypeAndRecordId(MODULE, sc.getId());
                recordRevisionRepository.deleteByModuleTypeAndRecordId(MODULE, sc.getId());
                purgeRecordDocumentsQuietly("Sales Contract", sc.getId());
            }
            salesContractRepository.deleteAll(chain);
            count++;
        }
        return count;
    }

    private boolean isNotBlank(String value) {
        return value != null && !value.isBlank();
    }

    /** Sales Contract → Customer Purchase Order conversion. */
    public ConversionResult convertToSalesOrder(Long id) {
        SalesContract contract = getContract(id);
        if (isNotBlank(contract.getConvertedToSo())) {
            throw new BadRequestException("Contract already converted to Customer Purchase Order " + contract.getConvertedToSo());
        }
        SalesOrder so = new SalesOrder();
        so.setSoNo(buildSoNumber());
        so.setScRef(contract.getScNo());
        so.setLeadNo(contract.getLeadNo());
        so.setQtnRef(contract.getQtnRef());
        so.setOrderDate(LocalDateTime.now());
        so.setStatus("draft");
        so.setCurrency(contract.getCurrency() == null ? "INR" : contract.getCurrency());
        so.setClientId(contract.getClientId());
        so.setClientName(contract.getClientName());
        so.setContactPerson(contract.getContactPerson());
        so.setEmail(contract.getEmail());
        so.setPhone(contract.getPhone());
        so.setCity(contract.getCity());
        so.setState(contract.getState());
        so.setBillingAddress(contract.getBillingAddress());
        so.setShippingAddress(contract.getShippingAddress());
        so.setGstin(contract.getGstin());
        so.setPan(contract.getPan());
        so.setPaymentTerms(contract.getPaymentTerms());
        so.setDeliveryTerms(contract.getDeliveryTerms());
        so.setSalesExecutive(contract.getSalesExecutive());
        so.setTerms(contract.getCommercialTerms());
        so.setRemarks(contract.getRemarks());
        for (SalesContractItem sourceItem : contract.getItems()) {
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
        so.setSubTotal(contract.getSubTotal());
        so.setDiscount(contract.getDiscount());
        so.setTaxTotal(contract.getTaxTotal());
        so.setCgstTotal(contract.getCgstTotal());
        so.setSgstTotal(contract.getSgstTotal());
        so.setCharges(contract.getCharges());
        so.setGrandTotal(contract.getGrandTotal());        SalesOrder savedSo = salesOrderRepository.save(so);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, contract.getId(), "sales-order", savedSo.getId());

        addTargetTimeline("sales-order", savedSo.getId(), "created", "Customer Purchase Order created",
                "Customer Purchase Order '" + savedSo.getSoNo() + "' created from Sales Contract '" + contract.getScNo() + "'.");
        addTargetHistory("sales-order", savedSo.getId(), "Customer Purchase Order", savedSo.getSoNo(), currentUserName());

        contract.setConvertedToSo(so.getSoNo());
        addTimeline(contract, "converted", "Converted to Customer Purchase Order",
                "Sales Contract converted to Customer Purchase Order " + so.getSoNo() + ".");
        addHistory(contract, "Status", null, "Converted", currentUserName());
        salesContractRepository.save(contract);
        return new ConversionResult("sales-order", savedSo.getId(), savedSo.getSoNo(), "Customer Purchase Order " + savedSo.getSoNo() + " created from Sales Contract " + contract.getScNo());
    }

    /** Sales Contract → Proforma Invoice conversion. */
    public ConversionResult convertToProforma(Long id) {
        SalesContract contract = getContract(id);
        if (isNotBlank(contract.getConvertedToPi())) {
            throw new BadRequestException("Contract already converted to Proforma Invoice " + contract.getConvertedToPi());
        }
        ProformaInvoice pi = new ProformaInvoice();
        pi.setPiNo(buildPiNumber());
        pi.setPiDate(LocalDateTime.now());
        pi.setStatus("draft");
        pi.setSource("sales-contract");
        pi.setSourceRef(contract.getScNo());
        pi.setClientId(contract.getClientId());
        pi.setClientName(contract.getClientName());
        pi.setContactPerson(contract.getContactPerson());
        pi.setEmail(contract.getEmail());
        pi.setPhone(contract.getPhone());
        pi.setGstin(contract.getGstin());
        pi.setPan(contract.getPan());
        pi.setBillingAddress(contract.getBillingAddress());
        pi.setShippingAddress(contract.getShippingAddress());
        pi.setValidTill(contract.getValidity());
        pi.setTerms(contract.getCommercialTerms());
        pi.setNotes(contract.getRemarks());
        for (SalesContractItem sourceItem : contract.getItems()) {
            ProformaInvoiceItem item = new ProformaInvoiceItem();
            item.setDescription(sourceItem.getDescription());
            item.setSku(sourceItem.getSku());
            item.setHsn(sourceItem.getHsn());
            item.setUom(sourceItem.getUom());
            item.setQty(sourceItem.getQty());
            item.setRate(sourceItem.getRate());
            item.setDiscountPct(sourceItem.getDiscountPct());
            item.setGstRate(sourceItem.getGstRate());
            pi.addItem(item);
        }
        pi.setSubTotal(contract.getSubTotal());
        pi.setDiscount(contract.getDiscount());
        pi.setDiscountPct(contract.getDiscountPct());
        pi.setTaxTotal(contract.getTaxTotal());
        pi.setCgstTotal(contract.getCgstTotal());
        pi.setSgstTotal(contract.getSgstTotal());
        pi.setCharges(contract.getCharges());
        pi.setGrandTotal(contract.getGrandTotal());
        ProformaInvoice savedPi = proformaInvoiceRepository.save(pi);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, contract.getId(), "proforma-invoice", savedPi.getId());
        addTargetTimeline("proforma-invoice", savedPi.getId(), "created", "Proforma Invoice created",
                "Proforma Invoice '" + savedPi.getPiNo() + "' created from Sales Contract '" + contract.getScNo() + "'.");
        addTargetHistory("proforma-invoice", savedPi.getId(), "Proforma Invoice", savedPi.getPiNo(), currentUserName());

        contract.setConvertedToPi(savedPi.getPiNo());
        addTimeline(contract, "converted", "Converted to Proforma Invoice",
                "Sales Contract converted to Proforma Invoice " + savedPi.getPiNo() + ".");
        addHistory(contract, "Status", null, "Converted", currentUserName());
        salesContractRepository.save(contract);
        return new ConversionResult("proforma-invoice", savedPi.getId(), savedPi.getPiNo(), "Proforma Invoice " + savedPi.getPiNo() + " created from Sales Contract " + contract.getScNo());
    }

    /** Sales Contract → Delivery Challan conversion. */
    public ConversionResult convertToDeliveryChallan(Long id) {
        SalesContract contract = getContract(id);
        if (isNotBlank(contract.getConvertedToDc())) {
            throw new BadRequestException("Contract already converted to Delivery Challan " + contract.getConvertedToDc());
        }
        DeliveryChallan dc = new DeliveryChallan();
        dc.setDcNo(buildDcNumber());
        dc.setDcDate(LocalDateTime.now());
        dc.setStatus("draft");
        dc.setScRef(contract.getScNo());
        dc.setClientId(contract.getClientId());
        dc.setClientName(contract.getClientName());
        dc.setContactPerson(contract.getContactPerson());
        dc.setEmail(contract.getEmail());
        dc.setPhone(contract.getPhone());
        dc.setBillingAddress(contract.getBillingAddress());
        dc.setShippingAddress(contract.getShippingAddress());
        dc.setCity(contract.getCity());
        dc.setState(contract.getState());
        dc.setTerms(contract.getCommercialTerms());
        dc.setNotes(contract.getRemarks());
        for (SalesContractItem sourceItem : contract.getItems()) {
            DeliveryChallanItem item = new DeliveryChallanItem();
            item.setDescription(sourceItem.getDescription());
            item.setSku(sourceItem.getSku());
            item.setHsn(sourceItem.getHsn());
            item.setUom(sourceItem.getUom());
            item.setQty(sourceItem.getQty());
            item.setRate(sourceItem.getRate());
            item.setDiscountPct(sourceItem.getDiscountPct());
            item.setGstRate(sourceItem.getGstRate());
            dc.addItem(item);
        }
        dc.setSubTotal(contract.getSubTotal());
        dc.setDiscount(contract.getDiscount());
        dc.setTaxTotal(contract.getTaxTotal());
        dc.setCgstTotal(contract.getCgstTotal());
        dc.setSgstTotal(contract.getSgstTotal());
        dc.setCharges(contract.getCharges());
        dc.setGrandTotal(contract.getGrandTotal());
        DeliveryChallan savedDc = deliveryChallanRepository.save(dc);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, contract.getId(), "delivery-challan", savedDc.getId());
        addTargetTimeline("delivery-challan", savedDc.getId(), "created", "Delivery Challan created",
                "Delivery Challan '" + savedDc.getDcNo() + "' created from Sales Contract '" + contract.getScNo() + "'.");
        addTargetHistory("delivery-challan", savedDc.getId(), "Delivery Challan", savedDc.getDcNo(), currentUserName());

        contract.setConvertedToDc(savedDc.getDcNo());
        addTimeline(contract, "converted", "Converted to Delivery Challan",
                "Sales Contract converted to Delivery Challan " + savedDc.getDcNo() + ".");
        addHistory(contract, "Status", null, "Converted", currentUserName());
        salesContractRepository.save(contract);
        return new ConversionResult("delivery-challan", savedDc.getId(), savedDc.getDcNo(), "Delivery Challan " + savedDc.getDcNo() + " created from Sales Contract " + contract.getScNo());
    }

    /** Sales Contract → Invoice conversion. */
    public ConversionResult convertToInvoice(Long id) {
        SalesContract contract = getContract(id);
        if (isNotBlank(contract.getConvertedToInvoice())) {
            throw new BadRequestException("Contract already converted to Invoice " + contract.getConvertedToInvoice());
        }
        Invoice invoice = new Invoice();
        invoice.setInvoiceNo(buildInvoiceNumber());
        invoice.setInvoiceDate(LocalDateTime.now());
        invoice.setStatus("draft");
        invoice.setSource("sales-contract");
        invoice.setSourceRef(contract.getScNo());
        invoice.setClientId(contract.getClientId());
        invoice.setClientName(contract.getClientName());
        invoice.setContactPerson(contract.getContactPerson());
        invoice.setEmail(contract.getEmail());
        invoice.setPhone(contract.getPhone());
        invoice.setGstin(contract.getGstin());
        invoice.setPan(contract.getPan());
        invoice.setBillingAddress(contract.getBillingAddress());
        invoice.setShippingAddress(contract.getShippingAddress());
        invoice.setTerms(contract.getCommercialTerms());
        invoice.setNotes(contract.getRemarks());
        for (SalesContractItem sourceItem : contract.getItems()) {
            InvoiceItem item = new InvoiceItem();
            item.setDescription(sourceItem.getDescription());
            item.setSku(sourceItem.getSku());
            item.setHsn(sourceItem.getHsn());
            item.setUom(sourceItem.getUom());
            item.setQty(sourceItem.getQty());
            item.setRate(sourceItem.getRate());
            item.setDiscountPct(sourceItem.getDiscountPct());
            item.setGstRate(sourceItem.getGstRate());
            invoice.addItem(item);
        }
        invoice.setSubTotal(contract.getSubTotal());
        invoice.setDiscount(contract.getDiscount());
        invoice.setTaxTotal(contract.getTaxTotal());
        invoice.setCgstTotal(contract.getCgstTotal());
        invoice.setSgstTotal(contract.getSgstTotal());
        invoice.setCharges(contract.getCharges());
        invoice.setGrandTotal(contract.getGrandTotal());
        Invoice savedInv = invoiceRepository.save(invoice);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, contract.getId(), "invoice", savedInv.getId());
        addTargetTimeline("invoice", savedInv.getId(), "created", "Invoice created",
                "Invoice '" + savedInv.getInvoiceNo() + "' created from Sales Contract '" + contract.getScNo() + "'.");
        addTargetHistory("invoice", savedInv.getId(), "Invoice", savedInv.getInvoiceNo(), currentUserName());

        contract.setConvertedToInvoice(savedInv.getInvoiceNo());
        addTimeline(contract, "converted", "Converted to Invoice",
                "Sales Contract converted to Invoice " + savedInv.getInvoiceNo() + ".");
        addHistory(contract, "Status", null, "Converted", currentUserName());
        salesContractRepository.save(contract);
        return new ConversionResult("invoice", savedInv.getId(), savedInv.getInvoiceNo(), "Invoice " + savedInv.getInvoiceNo() + " created from Sales Contract " + contract.getScNo());
    }

    /** Sales Contract → Credit Note conversion. */
    public ConversionResult convertToCreditNote(Long id) {
        SalesContract contract = getContract(id);
        if (isNotBlank(contract.getConvertedToCn())) {
            throw new BadRequestException("Contract already converted to Credit Note " + contract.getConvertedToCn());
        }
        CreditNote cn = new CreditNote();
        cn.setCnNo(buildCnNumber());
        cn.setCnDate(LocalDateTime.now());
        cn.setStatus("draft");
        cn.setSource("sales-contract");
        cn.setSourceRef(contract.getScNo());
        cn.setReason("Sales Contract converted to Credit Note");
        cn.setReasonDetail("Credit Note generated from Sales Contract " + contract.getScNo());
        cn.setInventoryImpact("none");
        cn.setClientId(contract.getClientId());
        cn.setClientName(contract.getClientName());
        cn.setContactPerson(contract.getContactPerson());
        cn.setEmail(contract.getEmail());
        cn.setPhone(contract.getPhone());
        cn.setGstin(contract.getGstin());
        for (SalesContractItem sourceItem : contract.getItems()) {
            CreditNoteItem item = new CreditNoteItem();
            item.setDescription(sourceItem.getDescription());
            item.setSku(sourceItem.getSku());
            item.setHsn(sourceItem.getHsn());
            item.setUom(sourceItem.getUom());
            item.setQty(sourceItem.getQty());
            item.setRate(sourceItem.getRate());
            item.setDiscountPct(sourceItem.getDiscountPct());
            item.setGstRate(sourceItem.getGstRate());
            cn.addItem(item);
        }
        cn.setSubTotal(contract.getSubTotal());
        cn.setDiscount(contract.getDiscount());
        cn.setTaxTotal(contract.getTaxTotal());
        cn.setCgstTotal(contract.getCgstTotal());
        cn.setSgstTotal(contract.getSgstTotal());
        cn.setCharges(contract.getCharges());
        cn.setGrandTotal(contract.getGrandTotal());
        cn.setRefundAmount(contract.getGrandTotal());
        CreditNote savedCn = creditNoteRepository.save(cn);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, contract.getId(), "credit-note", savedCn.getId());
        addTargetTimeline("credit-note", savedCn.getId(), "created", "Credit Note created",
                "Credit Note '" + savedCn.getCnNo() + "' created from Sales Contract '" + contract.getScNo() + "'.");
        addTargetHistory("credit-note", savedCn.getId(), "Credit Note", savedCn.getCnNo(), currentUserName());

        contract.setConvertedToCn(savedCn.getCnNo());
        addTimeline(contract, "converted", "Converted to Credit Note",
                "Sales Contract converted to Credit Note " + savedCn.getCnNo() + ".");
        addHistory(contract, "Status", null, "Converted", currentUserName());
        salesContractRepository.save(contract);
        return new ConversionResult("credit-note", savedCn.getId(), savedCn.getCnNo(), "Credit Note " + savedCn.getCnNo() + " created from Sales Contract " + contract.getScNo());
    }

    /** Sales Contract → Payment Receipt conversion. */
    public ConversionResult convertToPaymentReceipt(Long id) {
        SalesContract contract = getContract(id);
        if (isNotBlank(contract.getConvertedToPr())) {
            throw new BadRequestException("Contract already converted to Payment Receipt " + contract.getConvertedToPr());
        }
        PaymentReceipt receipt = new PaymentReceipt();
        receipt.setReceiptNo(buildPrNumber());
        receipt.setPaymentDate(LocalDateTime.now());
        receipt.setStatus("draft");
        receipt.setSource("sales-contract");
        receipt.setInvoiceRef(contract.getScNo());
        receipt.setClientId(contract.getClientId());
        receipt.setClientName(contract.getClientName());
        receipt.setContactPerson(contract.getContactPerson());
        receipt.setEmail(contract.getEmail());
        receipt.setPhone(contract.getPhone());
        receipt.setGstin(contract.getGstin());
        receipt.setAmount(contract.getGrandTotal());
        receipt.setRemarks("Payment receipt generated from Sales Contract " + contract.getScNo());
        PaymentReceipt savedPr = paymentReceiptRepository.save(receipt);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, contract.getId(), "payment-receipt", savedPr.getId());
        addTargetTimeline("payment-receipt", savedPr.getId(), "created", "Payment Receipt created",
                "Payment Receipt '" + savedPr.getReceiptNo() + "' created from Sales Contract '" + contract.getScNo() + "'.");
        addTargetHistory("payment-receipt", savedPr.getId(), "Payment Receipt", savedPr.getReceiptNo(), currentUserName());

        contract.setConvertedToPr(savedPr.getReceiptNo());
        addTimeline(contract, "converted", "Converted to Payment Receipt",
                "Sales Contract converted to Payment Receipt " + savedPr.getReceiptNo() + ".");
        addHistory(contract, "Status", null, "Converted", currentUserName());
        salesContractRepository.save(contract);
        return new ConversionResult("payment-receipt", savedPr.getId(), savedPr.getReceiptNo(), "Payment Receipt " + savedPr.getReceiptNo() + " created from Sales Contract " + contract.getScNo());
    }

    @Transactional(readOnly = true)
    public List<SalesContractResponse> export(String search, String status, String client, String salesExecutive,
                                              String dateFrom, String dateTo, BigDecimal minAmount, BigDecimal maxAmount) {
        Specification<SalesContract> spec = buildSpecification(search, status, client, salesExecutive,
                dateFrom, dateTo, minAmount, maxAmount);
        return salesContractRepository.findAll(spec).stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public String buildCsv(List<SalesContractResponse> contracts) {
        StringBuilder sb = new StringBuilder();
        sb.append("Contract No,Date,Client,Status,Items,Amount,Created\n");
        for (SalesContractResponse c : contracts) {
            sb.append(escapeCsv(c.scNo())).append(',')
              .append(escapeCsv(c.date())).append(',')
              .append(escapeCsv(c.clientName())).append(',')
              .append(escapeCsv(c.status())).append(',')
              .append(c.itemsCount() == null ? "" : c.itemsCount()).append(',')
              .append(c.grandTotal() == null ? "" : c.grandTotal().toPlainString()).append(',')
              .append(escapeCsv(c.createdAt())).append('\n');
        }
        return sb.toString();
    }

    @Transactional(readOnly = true)
    public List<SalesTimelineResponse> getTimeline(Long id) {
        getContract(id);
        return timelineRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, id)
                .stream().map(this::timelineResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SalesHistoryResponse> getHistory(Long id) {
        getContract(id);
        return historyRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, id)
                .stream().map(this::historyResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SalesAttachmentResponse> getAttachments(Long id) {
        getContract(id);
        return attachmentRepository.findByModuleTypeAndModuleIdOrderByUploadedAtAsc(MODULE, id)
                .stream().map(this::attachmentResponse).toList();
    }

    public SalesAttachmentResponse addAttachment(Long id, MultipartFile file) {
        return addAttachment(id, file, null);
    }

    /**
     * Store one contract attachment, labelled with its category when the file
     * carries one — the Upload Documents panel offers E-Sign (digitally signed)
     * and Scanned Copy (a scan of the signed/physical contract). The category is
     * optional and stays null for an unlabelled upload, so the shared attachment
     * store is unchanged for every other sales module. Nothing else about the
     * upload path moves: the file is stored once by the shared file storage, the
     * row is still the single source of truth for the attachment, and the
     * document register is still fed from it.
     */
    public SalesAttachmentResponse addAttachment(Long id, MultipartFile file, String category) {
        SalesContract c = getContract(id);
        String storedName = fileStorageService.store(file);
        SalesAttachment attachment = new SalesAttachment();
        attachment.setModuleType(MODULE);
        attachment.setModuleId(id);
        attachment.setName(file.getOriginalFilename());
        attachment.setStoredName(storedName);
        attachment.setContentType(file.getContentType());
        attachment.setSize(file.getSize());
        attachment.setUrl(baseUrl + "/v1/files/" + storedName);
        attachment.setAttachmentCategory(normalizeAttachmentCategory(category));
        attachment.setUploadedBy(currentUserName());
        SalesAttachment saved = attachmentRepository.save(attachment);
        addTimeline(id, "attachment", "File attached", file.getOriginalFilename());
        documentRepositoryService.registerFromAttachment(
                file.getOriginalFilename(), "Sales Contract", id,
                c.getScNo(), c.getClientId(), c.getClientName(),
                baseUrl + "/v1/files/" + storedName,
                file.getContentType(), file.getSize(),
                currentUserName(), DocumentVisibility.TEAM_ONLY);
        return attachmentResponse(saved);
    }

    public void deleteAttachment(Long id, Long attachmentId) {
        getContract(id);
        SalesAttachment attachment = attachmentRepository.findById(attachmentId)
                .filter(a -> MODULE.equals(a.getModuleType()) && id.equals(a.getModuleId()))
                .orElseThrow(() -> new ResourceNotFoundException("Attachment not found with id: " + attachmentId));
        attachmentRepository.delete(attachment);
    }

    private void copyForRevision(SalesContract copy, SalesContract source) {
        org.springframework.beans.BeanUtils.copyProperties(source, copy,
                "id", "items", "timeline", "revisionOf", "revision", "revisionDate", "latestRevision", "createdAt", "updatedAt", "archivedAt");
        for (SalesContractItem sourceItem : source.getItems()) {
            SalesContractItem item = new SalesContractItem();
            org.springframework.beans.BeanUtils.copyProperties(sourceItem, item,
                    "id", "salesContract", "createdAt");
            copy.addItem(item);
        }
    }

    private int maxRevisionOfChain(Long baseId) {
        return salesContractRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .mapToInt(SalesContract::getRevision)
                .max()
                .orElse(0);
    }

    /** Detail response — also carries the full revision chain for the UI. */
    private SalesContractResponse toResponseDetail(SalesContract contract) {
        return toResponse(contract, revisionChain(contract));
    }

    private List<RevisionInfo> revisionChain(SalesContract contract) {
        Long baseId = contract.getRevisionOf() != null ? contract.getRevisionOf() : contract.getId();
        List<RevisionInfo> chain = new ArrayList<>();
        salesContractRepository.findById(baseId).ifPresent(q -> chain.add(revisionInfo(q)));
        salesContractRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .sorted(java.util.Comparator.comparingInt(SalesContract::getRevision))
                .forEach(q -> chain.add(revisionInfo(q)));
        return chain;
    }

    private RevisionInfo revisionInfo(SalesContract contract) {
        return new RevisionInfo(
                contract.getId(),
                contract.getScNo(),
                contract.getRevision(),
                contract.getStatus(),
                contract.getRevisionDate() == null
                        ? (contract.getCreatedAt() == null ? null : contract.getCreatedAt().toString())
                        : contract.getRevisionDate().toString(),
                contract.isLatestRevision());
    }

    /** When the latest revision is deleted, the previous one becomes latest. */
    private void promotePreviousRevision(SalesContract removed) {
        if (!removed.isLatestRevision()) {
            return;
        }
        Long baseId = removed.getRevisionOf() != null ? removed.getRevisionOf() : removed.getId();
        // Highest remaining revision row first (revision >= 1).
        salesContractRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .filter(q -> !q.getId().equals(removed.getId()))
                .filter(q -> !"deleted".equals(q.getStatus()))
                .findFirst()
                .ifPresentOrElse(q -> {
                    q.setLatestRevision(true);
                    salesContractRepository.save(q);
                    removed.setLatestRevision(false);
                    salesContractRepository.save(removed);
                }, () -> salesContractRepository.findById(baseId).ifPresent(q -> {
                    // Fall back to the base row (revision 0) when no revision rows remain.
                    if (!q.getId().equals(removed.getId()) && !"deleted".equals(q.getStatus())) {
                        q.setLatestRevision(true);
                        salesContractRepository.save(q);
                        removed.setLatestRevision(false);
                        salesContractRepository.save(removed);
                    }
                }));
    }

    /** List/export response - carries no revision chain (avoids N+1). */
    private SalesContractResponse toResponse(SalesContract entity) {
        return toResponse(entity, List.of());
    }

    private SalesContractResponse toResponse(SalesContract contract, List<RevisionInfo> revisions) {
        List<SalesContractItemResponse> itemResponses = contract.getItems().stream().map(this::itemResponse).toList();
        BigDecimal totalQty = itemResponses.stream()
                .map(SalesContractItemResponse::qty)
                .filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new SalesContractResponse(
                contract.getId(), contract.getScNo(), contract.getPoRef(),
                contract.getContractDate() == null ? null : contract.getContractDate().toLocalDate().toString(),
                contract.getLeadNo(), contract.getQtnRef(), contract.getStatus(), contract.getCurrency(),
                contract.getTaxType(), contract.getHsnView(),
                contract.getClientId(), contract.getClientName(), contract.getContactPerson(),
                contract.getEmail(), contract.getPhone(), contract.getCity(), contract.getState(),
                contract.getBillingAddress(), contract.getShippingAddress(), contract.getGstin(),
                contract.getPan(), contract.getPaymentTerms(), contract.getDeliveryTerms(),
                contract.getSalesExecutive(),
                contract.getValidity() == null ? null : contract.getValidity().toLocalDate().toString(),
                contract.getDuration(), contract.getWarranty(), contract.getCommercialTerms(),
                contract.getScope(), contract.getExclusions(), contract.getRemarks(),
                contract.getSubTotal(), contract.getDiscount(), contract.getDiscountPct(),
                contract.getCgstTotal(), contract.getSgstTotal(), contract.getTaxTotal(),
                contract.getCharges(), contract.getGrandTotal(),
                itemResponses.size(), totalQty, contract.getConvertedToSo(),
                contract.getConvertedToPi(), contract.getConvertedToDc(), contract.getConvertedToInvoice(),
                contract.getConvertedToCn(), contract.getConvertedToPr(),
                contract.getContractDate() == null
                        ? (contract.getCreatedAt() == null ? null : contract.getCreatedAt().toLocalDate().toString())
                        : contract.getContractDate().toLocalDate().toString(),
                contract.getCreatedAt() == null ? null : contract.getCreatedAt().toString(),
                contract.getUpdatedAt() == null ? null : contract.getUpdatedAt().toString(),
                contract.getArchivedAt() == null ? null : contract.getArchivedAt().toString(),
                itemResponses,
                attachmentRepository.findByModuleTypeAndModuleIdOrderByUploadedAtAsc(MODULE, contract.getId())
                        .stream().map(this::attachmentResponse).toList(),
                timelineRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, contract.getId())
                        .stream().map(this::timelineResponse).toList(),
                historyRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, contract.getId())
                        .stream().map(this::historyResponse).toList(),
                contract.getRevision(),
                contract.getRevisionOf(),
                contract.isLatestRevision(),
                contract.getRevisionDate() == null ? null : contract.getRevisionDate().toString(),
                revisions
        );
    }

    private SalesContractItemResponse itemResponse(SalesContractItem item) {
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
        return new SalesContractItemResponse(item.getId(), item.getDescription(), item.getSku(), item.getDrawingNo(), item.getMaterial(), item.getDelivery(), item.getHsn(),
                item.getUom(), qty, rate, discPct, gst,
                gross.setScale(2, RoundingMode.HALF_UP), discAmt.setScale(2, RoundingMode.HALF_UP),
                net.setScale(2, RoundingMode.HALF_UP), cgst.setScale(2, RoundingMode.HALF_UP),
                sgst.setScale(2, RoundingMode.HALF_UP), total.setScale(2, RoundingMode.HALF_UP));
    }

    /**
     * The category a contract attachment is stored with: blank means "no
     * category" (null), and a value longer than the column is refused rather
     * than silently truncated, so a wrong label is never stored half-written.
     */
    private String normalizeAttachmentCategory(String category) {
        if (category == null || category.isBlank()) {
            return null;
        }
        String value = category.trim();
        if (value.length() > MAX_ATTACHMENT_CATEGORY) {
            throw new BadRequestException(
                    "Attachment category exceeds maximum length of " + MAX_ATTACHMENT_CATEGORY + " characters");
        }
        return value;
    }

    private SalesAttachmentResponse attachmentResponse(SalesAttachment attachment) {
        return new SalesAttachmentResponse(attachment.getId(), attachment.getName(), attachment.getContentType(),
                attachment.getSize(), attachment.getUrl(),
                attachment.getUploadedAt() == null ? null : attachment.getUploadedAt().toString(),
                attachment.getUploadedBy(),
                attachment.getAttachmentCategory());
    }

    private SalesTimelineResponse timelineResponse(SalesTimeline entry) {
        return new SalesTimelineResponse(entry.getId(), entry.getType(), entry.getTitle(), entry.getDetail(),
                entry.getCreatedAt() == null ? null : entry.getCreatedAt().toString());
    }

    private SalesHistoryResponse historyResponse(SalesHistory entry) {
        return new SalesHistoryResponse(entry.getId(), entry.getField(), entry.getOldValue(), entry.getNewValue(),
                entry.getChangedBy(), entry.getCreatedAt() == null ? null : entry.getCreatedAt().toString());
    }

    private SalesContract getContract(Long id) {
        return salesContractRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Sales Contract not found with id: " + id));
    }

    private void applyRequest(SalesContract contract, SalesContractRequest request) {
        contract.setPoRef(request.poRef());
        contract.setContractDate(parseDate(request.contractDate()));
        contract.setLeadNo(request.leadNo());
        contract.setQtnRef(request.qtnRef());
        contract.setCurrency(request.currency());
        contract.setTaxType(request.taxType());
        contract.setHsnView(request.hsnView());
        contract.setClientId(request.clientId());
        contract.setClientName(request.clientName());
        contract.setContactPerson(request.contactPerson());
        contract.setEmail(request.email());
        contract.setPhone(request.phone());
        contract.setCity(request.city());
        contract.setState(request.state());
        contract.setBillingAddress(request.billingAddress());
        contract.setShippingAddress(request.shippingAddress());
        contract.setGstin(request.gstin());
        contract.setPan(request.pan());
        contract.setPaymentTerms(request.paymentTerms());
        contract.setDeliveryTerms(request.deliveryTerms());
        contract.setSalesExecutive(request.salesExecutive());
        contract.setValidity(parseDate(request.validity()));
        contract.setDuration(request.duration());
        contract.setWarranty(request.warranty());
        contract.setCommercialTerms(request.commercialTerms());
        contract.setScope(request.scope());
        contract.setExclusions(request.exclusions());
        contract.setRemarks(request.remarks());
        contract.setDiscount(request.discount() == null ? BigDecimal.ZERO : request.discount());
        contract.setCharges(request.charges() == null ? BigDecimal.ZERO : request.charges());
        contract.getItems().clear();
        if (request.items() != null) {
            for (SalesContractItemRequest itemRequest : request.items()) {
                if (itemRequest == null) {
                    continue;
                }
                SalesContractItem item = new SalesContractItem();
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
                contract.addItem(item);
            }
        }
    }

    private void copyItem(SalesContractItem target, SalesContractItem source) {
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

    private void recalcTotals(SalesContract contract) {
        BigDecimal subTotal = BigDecimal.ZERO;
        BigDecimal cgstTotal = BigDecimal.ZERO;
        BigDecimal sgstTotal = BigDecimal.ZERO;
        for (SalesContractItem item : contract.getItems()) {
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
        contract.setSubTotal(subTotal.setScale(2, RoundingMode.HALF_UP));
        contract.setCgstTotal(cgstTotal.setScale(2, RoundingMode.HALF_UP));
        contract.setSgstTotal(sgstTotal.setScale(2, RoundingMode.HALF_UP));
        BigDecimal taxTotal = cgstTotal.add(sgstTotal);
        contract.setTaxTotal(taxTotal.setScale(2, RoundingMode.HALF_UP));
        BigDecimal discount = nvl(contract.getDiscount(), BigDecimal.ZERO);
        BigDecimal charges = nvl(contract.getCharges(), BigDecimal.ZERO);
        BigDecimal grand = subTotal.add(taxTotal).subtract(discount).add(charges);
        if (grand.compareTo(BigDecimal.ZERO) < 0) {
            grand = BigDecimal.ZERO;
        }
        contract.setGrandTotal(grand.setScale(2, RoundingMode.HALF_UP));
        if (subTotal.compareTo(BigDecimal.ZERO) > 0 && discount.compareTo(BigDecimal.ZERO) > 0) {
            contract.setDiscountPct(discount.multiply(BigDecimal.valueOf(100))
                    .divide(subTotal, 2, RoundingMode.HALF_UP));
        } else {
            contract.setDiscountPct(BigDecimal.ZERO);
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
    private Predicate latestPerChainPredicate(jakarta.persistence.criteria.Root<SalesContract> root, jakarta.persistence.criteria.CriteriaQuery<?> query, jakarta.persistence.criteria.CriteriaBuilder cb) {
        Subquery<Long> newer = query.subquery(Long.class);
        jakarta.persistence.criteria.Root<SalesContract> newerRoot = newer.from(SalesContract.class);
        newer.select(newerRoot.get("id"));
        newer.where(cb.and(
                cb.equal(newerRoot.get("revisionOf"),
                        cb.coalesce(root.get("revisionOf"), root.get("id"))),
                cb.greaterThan(cb.coalesce(newerRoot.get("revision"), 0),
                        cb.coalesce(root.get("revision"), 0))));
        return cb.or(cb.isTrue(root.get("latestRevision")), cb.not(cb.exists(newer)));
    }

    private Specification<SalesContract> buildSpecification(String search, String status, String client,
                                                            String salesExecutive, String dateFrom, String dateTo,
                                                            BigDecimal minAmount, BigDecimal maxAmount) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(latestPerChainPredicate(root, query, cb));
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("scNo")), like),
                        cb.like(cb.lower(root.get("clientName")), like),
                        cb.like(cb.lower(root.get("leadNo")), like),
                        cb.like(cb.lower(root.get("salesExecutive")), like),
                        cb.like(cb.lower(root.get("qtnRef")), like),
                        cb.like(cb.lower(cb.toString(root.get("poRef"))), like)
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
            if (salesExecutive != null && !salesExecutive.isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("salesExecutive")), salesExecutive.trim().toLowerCase()));
            }
            if (dateFrom != null && !dateFrom.isBlank()) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("contractDate"), LocalDate.parse(dateFrom).atStartOfDay()));
            }
            if (dateTo != null && !dateTo.isBlank()) {
                predicates.add(cb.lessThanOrEqualTo(root.get("contractDate"), LocalDate.parse(dateTo).atTime(23, 59, 59)));
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
            case "clientName", "salesExecutive", "contractDate", "validity", "grandTotal", "status", "createdAt",
                 "updatedAt", "scNo" -> "scNo".equals(field) ? "scNo" : field;
            case "id" -> "scNo";
            default -> "createdAt";
        };
        boolean asc = parts.length > 1 && "asc".equalsIgnoreCase(parts[1]);
        return Sort.by(asc ? Sort.Direction.ASC : Sort.Direction.DESC, mapped);
    }

    private long nextSequence() {
        long count = salesContractRepository.count();
        long maxSuffix = 0;
        String prefix = "SC-" + Year.now().getValue() + "-";
        for (String no : salesContractRepository.findAllScNos()) {
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
        return String.format("SC-%d-%06d", Year.now().getValue(), sequence);
    }

    private String buildSoNumber() {
        long maxSuffix = 0;
        // Customer Purchase Order numbers are canonical CPO-YYYY-NNNNNN whatever
        // Sales Execution document created them. Legacy SO-YYYY-NNNNNN rows share
        // the same sequence (they only display as CPO-), so both prefixes are
        // scanned - otherwise the two generators drift apart and can hand out the
        // same number twice (CPO-2026-00004 vs SO-2026-000004).
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

    private String buildPiNumber() {
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
        return String.format("PI-%d-%06d", Year.now().getValue(), Math.max(proformaInvoiceRepository.count(), maxSuffix) + 1);
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
            case "submitted" -> "submitted";
            case "under_review", "under review" -> "under review";
            case "approved" -> "approved";
            case "active" -> "active";
            case "completed" -> "completed";
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

    private void addTimeline(SalesContract contract, String type, String title, String detail) {
        SalesTimeline entry = new SalesTimeline();
        entry.setModuleType(MODULE);
        entry.setModuleId(contract.getId());
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

    private void addHistory(SalesContract contract, String field, String oldValue, String newValue, String changedBy) {
        SalesHistory entry = new SalesHistory();
        entry.setModuleType(MODULE);
        entry.setModuleId(contract.getId());
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
