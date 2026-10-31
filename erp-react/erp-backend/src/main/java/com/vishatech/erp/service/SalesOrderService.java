package com.vishatech.erp.service;
import com.vishatech.erp.dto.ConversionResult;

import com.vishatech.erp.dto.SalesAttachmentResponse;
import com.vishatech.erp.dto.SalesHistoryResponse;
import com.vishatech.erp.dto.SalesOrderItemRequest;
import com.vishatech.erp.dto.SalesOrderEActionListResponse;
import com.vishatech.erp.dto.SalesOrderEActionRequest;
import com.vishatech.erp.dto.SalesOrderEActionResponse;
import com.vishatech.erp.dto.SalesOrderItemResponse;
import com.vishatech.erp.dto.SalesOrderNextNumberResponse;
import com.vishatech.erp.dto.SalesOrderOptionResponse;
import com.vishatech.erp.dto.SalesOrderRequest;
import com.vishatech.erp.dto.SalesOrderResponse;
import com.vishatech.erp.dto.SalesTimelineResponse;
import com.vishatech.erp.dto.RevisionInfo;
import com.vishatech.erp.dto.RecordRevisionResponse;
import com.vishatech.erp.dto.EditHistoryGroupResponse;
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
import com.vishatech.erp.entity.SalesOrderEAction;
import com.vishatech.erp.entity.SalesOrderItem;
import com.vishatech.erp.entity.SalesTimeline;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ConflictException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.production.api.ProductionTrackerLinkPort;
import com.vishatech.erp.repository.CreditNoteRepository;
import com.vishatech.erp.repository.DeliveryChallanRepository;
import com.vishatech.erp.repository.EditHistoryRepository;
import com.vishatech.erp.repository.InvoiceRepository;
import com.vishatech.erp.repository.PaymentReceiptRepository;
import com.vishatech.erp.repository.ProformaInvoiceRepository;
import com.vishatech.erp.repository.RecordRevisionRepository;
import com.vishatech.erp.repository.SalesAttachmentRepository;
import com.vishatech.erp.repository.SalesHistoryRepository;
import com.vishatech.erp.repository.SalesOrderEActionRepository;
import com.vishatech.erp.repository.SalesOrderRepository;
import com.vishatech.erp.repository.SalesTimelineRepository;
import com.vishatech.erp.crm.entity.Customer;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Subquery;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Year;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
public class SalesOrderService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final String MODULE = "sales-order";

    /** Revision module key for E-Action snapshots — separate from its CPO. */
    private static final String E_ACTION_MODULE = "e-action";

    /**
     * Hard cap for the CPO option feed (see {@link #listOptions}). A picker or
     * filter never needs an unbounded list, and the cap keeps a single request
     * from turning into an arbitrarily large response.
     */
    private static final int MAX_CPO_OPTIONS = 2000;

    private static final Logger log = LoggerFactory.getLogger(SalesOrderService.class);

    private static final ObjectMapper CUSTOM_FIELDS_JSON = new ObjectMapper();

    private final SalesOrderRepository salesOrderRepository;
    private final SalesOrderEActionRepository eActionRepository;
    private final SalesTimelineRepository timelineRepository;
    private final SalesHistoryRepository historyRepository;
    private final SalesAttachmentRepository attachmentRepository;
    private final EditHistoryRepository editHistoryRepository;
    private final RecordRevisionRepository recordRevisionRepository;
    private final DeliveryChallanRepository deliveryChallanRepository;
    private final InvoiceRepository invoiceRepository;
    private final ProformaInvoiceRepository proformaInvoiceRepository;
    private final CreditNoteRepository creditNoteRepository;
    private final PaymentReceiptRepository paymentReceiptRepository;
    private final FileStorageService fileStorageService;
    private final DocumentRepositoryService documentRepositoryService;
    private final ProductionTrackerLinkPort productionTrackerLink;
    private final String baseUrl;

    public SalesOrderService(SalesOrderRepository salesOrderRepository,
                             SalesOrderEActionRepository eActionRepository,
                             SalesTimelineRepository timelineRepository,
                             SalesHistoryRepository historyRepository,
                             SalesAttachmentRepository attachmentRepository,
                             EditHistoryRepository editHistoryRepository,
                             RecordRevisionRepository recordRevisionRepository,
                             DeliveryChallanRepository deliveryChallanRepository,
                             InvoiceRepository invoiceRepository,
                             ProformaInvoiceRepository proformaInvoiceRepository,
                             CreditNoteRepository creditNoteRepository,
                             PaymentReceiptRepository paymentReceiptRepository,
                             FileStorageService fileStorageService,
                             DocumentRepositoryService documentRepositoryService,
                             ProductionTrackerLinkPort productionTrackerLink,
                             @Value("${app.base-url:http://localhost:8080}") String baseUrl) {
        this.salesOrderRepository = salesOrderRepository;
        this.eActionRepository = eActionRepository;
        this.timelineRepository = timelineRepository;
        this.historyRepository = historyRepository;
        this.attachmentRepository = attachmentRepository;
        this.editHistoryRepository = editHistoryRepository;
        this.recordRevisionRepository = recordRevisionRepository;
        this.deliveryChallanRepository = deliveryChallanRepository;
        this.invoiceRepository = invoiceRepository;
        this.proformaInvoiceRepository = proformaInvoiceRepository;
        this.creditNoteRepository = creditNoteRepository;
        this.paymentReceiptRepository = paymentReceiptRepository;
        this.fileStorageService = fileStorageService;
        this.documentRepositoryService = documentRepositoryService;
        this.productionTrackerLink = productionTrackerLink;
        this.baseUrl = baseUrl;
    }

    // ============================== Read ==============================

    @Transactional(readOnly = true)
    public Page<SalesOrderResponse> list(int page, int size, String search, String sort,
                                         String status, String client, String salesExecutive,
                                         String dateFrom, String dateTo,
                                         BigDecimal minAmount, BigDecimal maxAmount) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort));
        Specification<SalesOrder> spec = buildSpecification(search, status, client, salesExecutive,
                dateFrom, dateTo, minAmount, maxAmount);
        Page<SalesOrder> pageData = salesOrderRepository.findAll(spec, pageable);
        ChildCollections children = loadChildCollections(pageData.getContent());
        return pageData.map(salesOrder -> toResponse(salesOrder, List.of(), children));
    }

    /**
     * Children of a page of Sales Orders, keyed by Sales Order id.
     *
     * <p>Each row of the response carries its line items, E-Actions, attachments,
     * timeline and history. Those used to be assembled per row — a select for EVERY
     * Sales Order in the result — which is what made the list/export endpoints scale
     * with the row count. Here the whole page is loaded in a fixed number of queries:
     * the items are batched by {@code @BatchSize} on {@link SalesOrder#getItems()},
     * and each child table is read once with an {@code IN (ids)} query whose ordering
     * matches the single-record variant, so grouping by {@code moduleId} reproduces
     * exactly the previous payload.
     */
    private ChildCollections loadChildCollections(List<SalesOrder> orders) {
        List<Long> ids = orders.stream().map(SalesOrder::getId).filter(Objects::nonNull).toList();
        if (ids.isEmpty()) {
            return new ChildCollections(Map.of(), Map.of(), Map.of(), Map.of());
        }
        Map<Long, List<SalesOrderEActionResponse>> eActions = new HashMap<>();
        for (SalesOrderEAction action : eActionRepository.findBySalesOrderIdInOrderByIdAsc(ids)) {
            eActions.computeIfAbsent(action.getSalesOrder().getId(), key -> new ArrayList<>())
                    .add(eActionResponse(action));
        }
        Map<Long, List<SalesAttachmentResponse>> attachments = new HashMap<>();
        for (SalesAttachment attachment : attachmentRepository.findByModuleTypeAndModuleIdInOrderByUploadedAtAsc(MODULE, ids)) {
            attachments.computeIfAbsent(attachment.getModuleId(), key -> new ArrayList<>())
                    .add(attachmentResponse(attachment));
        }
        Map<Long, List<SalesTimelineResponse>> timeline = new HashMap<>();
        for (SalesTimeline entry : timelineRepository.findByModuleTypeAndModuleIdInOrderByCreatedAtAsc(MODULE, ids)) {
            timeline.computeIfAbsent(entry.getModuleId(), key -> new ArrayList<>())
                    .add(timelineResponse(entry));
        }
        Map<Long, List<SalesHistoryResponse>> history = new HashMap<>();
        for (SalesHistory entry : historyRepository.findByModuleTypeAndModuleIdInOrderByCreatedAtAsc(MODULE, ids)) {
            history.computeIfAbsent(entry.getModuleId(), key -> new ArrayList<>())
                    .add(historyResponse(entry));
        }
        return new ChildCollections(eActions, attachments, timeline, history);
    }

    /** Children of a page of Sales Orders, loaded once for the whole page. */
    private record ChildCollections(Map<Long, List<SalesOrderEActionResponse>> eActions,
                                    Map<Long, List<SalesAttachmentResponse>> attachments,
                                    Map<Long, List<SalesTimelineResponse>> timeline,
                                    Map<Long, List<SalesHistoryResponse>> history) {
    }

    /**
     * Lightweight CPO option feed for Production pickers/filters.
     *
     * <p>Replaces the old client-side behaviour of walking EVERY page of
     * {@code /sales-orders} — where each row was assembled with its items,
     * attachments, timeline and history — just to fill a dropdown. This serves
     * at most {@link #MAX_CPO_OPTIONS} slim rows in ONE request, applying the
     * same visibility rules as {@link #list(int, int, String, String, String,
     * String, String, String, String, java.math.BigDecimal, java.math.BigDecimal)}
     * (latest revision per chain, never archived/deleted), newest first.
     *
     * @param search optional free-text match on CPO number / customer / refs
     */
    @Transactional(readOnly = true)
    public List<SalesOrderOptionResponse> listOptions(String search) {
        Specification<SalesOrder> spec = buildSpecification(search, null, null, null, null, null, null, null);
        Page<SalesOrder> page = salesOrderRepository.findAll(
                spec, PageRequest.of(0, MAX_CPO_OPTIONS, buildSort(null)));
        if (page.getTotalElements() > MAX_CPO_OPTIONS) {
            log.warn("CPO option feed truncated: {} matching Customer Purchase Orders, returning the {} most recent.",
                    page.getTotalElements(), MAX_CPO_OPTIONS);
        }
        List<SalesOrder> orders = page.getContent();
        Map<Long, Integer> itemCounts = itemCountsByOrderIds(
                orders.stream().map(SalesOrder::getId).toList());
        return orders.stream()
                .map(so -> new SalesOrderOptionResponse(
                        so.getId(),
                        so.getSoNo(),
                        so.getClientId(),
                        so.getClientName(),
                        so.getOrderDate() == null ? null : so.getOrderDate().toLocalDate().toString(),
                        itemCounts.getOrDefault(so.getId(), 0)))
                .toList();
    }

    /** Item counts for the given Sales Orders in one grouped query (no N+1). */
    private Map<Long, Integer> itemCountsByOrderIds(List<Long> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<Long, Integer> counts = new HashMap<>();
        for (Object[] row : salesOrderRepository.countItemsByOrderIds(ids)) {
            counts.put((Long) row[0], ((Number) row[1]).intValue());
        }
        return counts;
    }

    @Transactional(readOnly = true)
    public SalesOrderResponse get(Long id) {
        return toResponseDetail(getSalesOrder(id));
    }

    @Transactional(readOnly = true)
    public SalesOrderNextNumberResponse getNextNumber() {
        long next = nextSequence();
        return new SalesOrderNextNumberResponse(buildNo(next), next);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> stats() {
        List<String> excluded = List.of("archived", "deleted");
        Map<String, Object> stats = new LinkedHashMap<>();
        long active = 0;
        // Count only the CURRENT revision of each chain so KPI cards match
        // the list rows (older revisions are surfaced through the Document
        // Workflow dropdown, never as separate list rows).
        for (String status : List.of("draft", "pending review", "approved", "in progress", "completed", "cancelled")) {
            long count = salesOrderRepository.countCurrentByStatus(status);
            stats.put(status.replace(" ", ""), count);
            active += count;
        }
        stats.put("total", active);
        stats.put("active", active);
        stats.put("archived", salesOrderRepository.countCurrentByStatus("archived"));
        stats.put("deleted", salesOrderRepository.countCurrentByStatus("deleted"));
        stats.put("totalAmt", salesOrderRepository.sumGrandTotalExcluding(excluded));
        return stats;
    }

    // ============================== Write ==============================

    public SalesOrderResponse create(SalesOrderRequest request, boolean draft) {
        SalesOrder salesOrder = new SalesOrder();
        if (request.soNo() != null && !request.soNo().isBlank()) {
            if (salesOrderRepository.existsBySoNo(request.soNo().trim())) {
                throw new BadRequestException("Customer Purchase Order number already exists: " + request.soNo());
            }
            salesOrder.setSoNo(request.soNo().trim());
        } else {
            salesOrder.setSoNo(buildNo(nextSequence()));
        }
        applyRequest(salesOrder, request);
        if (draft) {
            salesOrder.setStatus("draft");
        } else if (request.status() != null && !request.status().isBlank()) {
            salesOrder.setStatus(normalizeStatus(request.status()));
        } else {
            salesOrder.setStatus("draft");
        }
        recalcTotals(salesOrder);
        SalesOrder saved = salesOrderRepository.save(salesOrder);
        addTimeline(saved, "created", "Customer Purchase Order created",
                "Customer Purchase Order '" + saved.getSoNo() + "' was created.");
        addHistory(saved, "Customer Purchase Order", null, saved.getSoNo(), currentUserName());
        return toResponse(saved);
    }

    /**
     * Every edit creates a NEW revision row (BASE(N)); the previous version is
     * never deleted or overwritten. Only the latest revision is editable.
     */
    public SalesOrderResponse update(Long id, SalesOrderRequest request) {
        SalesOrder current = getSalesOrder(id);
        if (!current.isLatestRevision()) {
            throw new BadRequestException("Only the latest revision can be edited");
        }
        Long baseId = current.getRevisionOf() != null ? current.getRevisionOf() : current.getId();
        int nextRev = maxRevisionOfChain(baseId) + 1;

        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(current);
        Map<String, String> before = editHistory.snapshot(current);
        before.put("itemsFingerprint", EditHistoryService.itemsFingerprint(current));
        // E-Action rows are part of the document too — a change that only adds,
        // edits or removes an E-Action must still create a revision.
        before.put("eActionsFingerprint", EditHistoryService.collectionFingerprint(current, "getEActions"));

        SalesOrder revision = new SalesOrder();
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
        after.put("eActionsFingerprint", EditHistoryService.collectionFingerprint(revision, "getEActions"));
        if (EditHistoryService.isNoOpEdit(before, after)) {
            return toResponseDetail(current);
        }

        revision.setSoNo(RevisionSupport.nextRevisionNumber(
                RevisionSupport.baseNumber(current.getSoNo()), nextRev));
        revision.setRevisionOf(baseId);
        revision.setRevision(nextRev);
        revision.setRevisionDate(java.time.LocalDateTime.now());
        revision.setLatestRevision(true);

        current.setLatestRevision(false);
        salesOrderRepository.save(current);
        SalesOrder saved = salesOrderRepository.saveAndFlush(revision);
        addTimeline(saved, "revision", "Revision " + nextRev + " created",
                "Revision '" + saved.getSoNo() + "' created from '" + current.getSoNo()
                        + "' by " + currentUserName() + ".");
        editHistory.recordEdit("sales-order", saved.getId(), editBefore, editHistory.snapshot(saved));
        syncRecordDocumentQuietly(saved);
        return toResponseDetail(saved);
    }

    // ---------------------------------------------------------------------
    // Document-mirror integration.
    //
    // SOURCE mirrors every Customer Purchase Order into the Documents module
    // through DocumentRepositoryService#syncRecordDocumentQuietly. TARGET's
    // Documents module is protected in this task and does not expose that
    // method, so this thin shim keeps the SOURCE call structure while leaving
    // the Documents module untouched.
    // ---------------------------------------------------------------------

    /** Mirror the central Documents repository with the current record state. */
    private void syncRecordDocumentQuietly(SalesOrder so) {
        syncRecordDocumentQuietly(
                "Customer Purchase Order", so.getId(), so.getSoNo(), "Customer Purchase Order", so.getSoNo(),
                so.getClientId(), so.getClientName(), so.getStatus());
    }

    /** Intentionally no-op — see note above. */
    private void syncRecordDocumentQuietly(String module, Long recordId, String code, String docType,
                                           String docNo, Long customerId, String clientName, String status) {
        // Intentionally no-op — TARGET's Documents module is protected.
    }

    public SalesOrderResponse delete(Long id) {
        SalesOrder salesOrder = getSalesOrder(id);
        RevisionSupport.requireLatest(salesOrder.isLatestRevision());
        salesOrder.setStatus("deleted");
        salesOrder.setArchivedAt(LocalDateTime.now());
        addTimeline(salesOrder, "deleted", "Customer Purchase Order deleted",
                "Customer Purchase Order was moved to trash by " + currentUserName() + ".");
        addHistory(salesOrder, "Status", null, "Deleted", currentUserName());
        return toResponse(salesOrderRepository.save(salesOrder));
    }

    public SalesOrderResponse restore(Long id) {
        SalesOrder salesOrder = getSalesOrder(id);
        RevisionSupport.requireLatest(salesOrder.isLatestRevision());
        String previous = salesOrder.getStatus();
        String target = ("deleted".equals(previous) || "archived".equals(previous)) ? "draft" : previous;
        salesOrder.setStatus(target);
        salesOrder.setArchivedAt(null);
        addTimeline(salesOrder, "restored", "Customer Purchase Order restored",
                "Customer Purchase Order was restored by " + currentUserName() + ".");
        addHistory(salesOrder, "Status", titleCase(previous), titleCase(target), currentUserName());
        return toResponse(salesOrderRepository.save(salesOrder));
    }

    public SalesOrderResponse archive(Long id) {
        SalesOrder salesOrder = getSalesOrder(id);
        RevisionSupport.requireLatest(salesOrder.isLatestRevision());
        salesOrder.setStatus("archived");
        salesOrder.setArchivedAt(LocalDateTime.now());
        addTimeline(salesOrder, "archived", "Customer Purchase Order archived",
                "Customer Purchase Order was archived by " + currentUserName() + ".");
        addHistory(salesOrder, "Status", null, "Archived", currentUserName());
        return toResponse(salesOrderRepository.save(salesOrder));
    }

    public SalesOrderResponse changeStatus(Long id, String status) {
        SalesOrder salesOrder = getSalesOrder(id);
        RevisionSupport.requireLatest(salesOrder.isLatestRevision());
        String normalized = normalizeStatus(status);
        if ("deleted".equals(salesOrder.getStatus())) {
            throw new BadRequestException("Cannot change status of a deleted Customer Purchase Order");
        }
        salesOrder.setStatus(normalized);
        addTimeline(salesOrder, "status", "Status changed",
                "Status changed to '" + titleCase(normalized) + "' by " + currentUserName() + ".");
        addHistory(salesOrder, "Status", null, titleCase(normalized), currentUserName());
        return toResponse(salesOrderRepository.save(salesOrder));
    }

    public SalesOrderResponse approve(Long id) {
        SalesOrder salesOrder = getSalesOrder(id);
        RevisionSupport.requireLatest(salesOrder.isLatestRevision());
        if ("deleted".equals(salesOrder.getStatus())) {
            throw new BadRequestException("Cannot approve a deleted Customer Purchase Order");
        }
        salesOrder.setStatus("approved");
        addTimeline(salesOrder, "approved", "Customer Purchase Order approved",
                "Customer Purchase Order approved by " + currentUserName() + ".");
        addHistory(salesOrder, "Status", null, "Approved", currentUserName());
        return toResponse(salesOrderRepository.save(salesOrder));
    }

    public SalesOrderResponse cancel(Long id) {
        SalesOrder salesOrder = getSalesOrder(id);
        RevisionSupport.requireLatest(salesOrder.isLatestRevision());
        if ("deleted".equals(salesOrder.getStatus())) {
            throw new BadRequestException("Cannot cancel a deleted Customer Purchase Order");
        }
        salesOrder.setStatus("cancelled");
        addTimeline(salesOrder, "cancelled", "Customer Purchase Order cancelled",
                "Customer Purchase Order cancelled by " + currentUserName() + ".");
        addHistory(salesOrder, "Status", null, "Cancelled", currentUserName());
        return toResponse(salesOrderRepository.save(salesOrder));
    }

    public SalesOrderResponse duplicate(Long id) {
        SalesOrder source = getSalesOrder(id);
        SalesOrder copy = new SalesOrder();
        copy.setSoNo(buildNo(nextSequence()));
        copy.setCustomerPo(source.getCustomerPo());
        copy.setLeadNo(source.getLeadNo());
        copy.setScRef(source.getScRef());
        copy.setQtnRef(source.getQtnRef());
        copy.setCurrency(source.getCurrency());
        copy.setPriority(source.getPriority());
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
        copy.setSalesExecutive(source.getSalesExecutive());
        copy.setDeliveryTerms(source.getDeliveryTerms());
        copy.setTerms(source.getTerms());
        copy.setRemarks(source.getRemarks());
        copy.setDiscount(source.getDiscount());
        copy.setCharges(source.getCharges());
        copy.setStatus("draft");
        copy.setOrderDate(LocalDateTime.now());
        for (SalesOrderItem sourceItem : source.getItems()) {
            SalesOrderItem item = new SalesOrderItem();
            copyItem(item, sourceItem);
            copy.addItem(item);
        }
        for (SalesOrderEAction sourceAction : source.getEActions()) {
            SalesOrderEAction action = new SalesOrderEAction();
            org.springframework.beans.BeanUtils.copyProperties(sourceAction, action,
                    "id", "salesOrder", "createdAt");
            copy.addEAction(action);
        }
        recalcTotals(copy);
        SalesOrder saved = salesOrderRepository.save(copy);
        addTimeline(saved, "created", "Customer Purchase Order created",
                "Duplicated from Customer Purchase Order '" + source.getSoNo() + "'.");
        addHistory(saved, "Customer Purchase Order", null, saved.getSoNo(), currentUserName());
        return toResponse(saved);
    }

    public int bulkArchive(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            SalesOrder salesOrder = getSalesOrder(id);
            if (!"archived".equals(salesOrder.getStatus()) && !"deleted".equals(salesOrder.getStatus())) {
                salesOrder.setStatus("archived");
                salesOrder.setArchivedAt(LocalDateTime.now());
                addTimeline(salesOrder, "archived", "Customer Purchase Order archived",
                        "Customer Purchase Order was archived by " + currentUserName() + ".");
                salesOrderRepository.save(salesOrder);
                count++;
            }
        }
        return count;
    }

    public int bulkRestore(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            SalesOrder salesOrder = getSalesOrder(id);
            if ("archived".equals(salesOrder.getStatus()) || "deleted".equals(salesOrder.getStatus())) {
                salesOrder.setStatus("draft");
                salesOrder.setArchivedAt(null);
                addTimeline(salesOrder, "restored", "Customer Purchase Order restored",
                        "Customer Purchase Order was restored by " + currentUserName() + ".");
                salesOrderRepository.save(salesOrder);
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
            SalesOrder salesOrder = getSalesOrder(id);
            if (!"deleted".equals(salesOrder.getStatus())) {
                salesOrder.setStatus("deleted");
                salesOrder.setArchivedAt(LocalDateTime.now());
                addTimeline(salesOrder, "deleted", "Customer Purchase Order deleted",
                        "Customer Purchase Order was moved to trash by " + currentUserName() + ".");
                addHistory(salesOrder, "Status", null, "Deleted", currentUserName());
                salesOrderRepository.save(salesOrder);
                count++;
            }
        }
        return count;
    }

    public int bulkPermanentDelete(List<Long> ids) {
        // Pass 1 — resolve every revision chain and refuse the request if any row is
        // still linked to a Production tracker. No row has been removed at this point,
        // so a bulk call that mixes deletable and tracker-linked CPOs cannot leave a
        // partial purge behind. The link is read through the published
        // ProductionTrackerLinkPort — Sales never touches Production's tables — and it
        // covers every row of the chain, not just the row named in the request.
        List<List<SalesOrder>> chains = new ArrayList<>();
        for (Long id : ids) {
            SalesOrder salesOrder = getSalesOrder(id);
            // Remove the whole revision chain (base row + every revision row).
            Long baseId = salesOrder.getRevisionOf() != null ? salesOrder.getRevisionOf() : salesOrder.getId();
            List<SalesOrder> chain = new ArrayList<>();
            salesOrderRepository.findById(baseId).ifPresent(chain::add);
            chain.addAll(salesOrderRepository.findByRevisionOfOrderByRevisionDesc(baseId));
            for (SalesOrder so : chain) {
                Optional<Long> linkedTracker = productionTrackerLink.linkedTrackerId(so.getId());
                if (linkedTracker.isPresent()) {
                    throw trackerLinkedConflict(so, linkedTracker.get());
                }
            }
            chains.add(chain);
        }

        // Pass 2 — purge.
        int count = 0;
        for (List<SalesOrder> chain : chains) {
            for (SalesOrder so : chain) {
                // Purge related rows so no orphaned attachments/timeline/history/
                // edit-history/revision-snapshots survive the hard delete.
                timelineRepository.deleteByModuleTypeAndModuleId(MODULE, so.getId());
                historyRepository.deleteByModuleTypeAndModuleId(MODULE, so.getId());
                attachmentRepository.deleteByModuleTypeAndModuleId(MODULE, so.getId());
                editHistoryRepository.deleteByModuleTypeAndRecordId(MODULE, so.getId());
                recordRevisionRepository.deleteByModuleTypeAndRecordId(MODULE, so.getId());
            }
            salesOrderRepository.deleteAll(chain);
            count++;
        }
        return count;
    }

    /**
     * The stable 409 message for a CPO that is still tracked: it names the order and the
     * tracker that has to go first, so the caller knows exactly what to remove.
     */
    private ConflictException trackerLinkedConflict(SalesOrder salesOrder, Long trackerId) {
        return new ConflictException("Customer Purchase Order '" + salesOrder.getSoNo()
                + "' cannot be permanently deleted because Production tracker #" + trackerId
                + " is still linked to it. Remove the tracker first.");
    }

    // ============================== Conversions ==============================

    public SalesOrderResponse generateDeliveryChallan(Long id) {
        SalesOrder salesOrder = getSalesOrder(id);
        if ("deleted".equals(salesOrder.getStatus())) {
            throw new BadRequestException("Cannot generate a Delivery Challan from a deleted Customer Purchase Order");
        }
        if (isNotBlank(salesOrder.getConvertedToDc())) {
            throw new BadRequestException("Customer Purchase Order already generated Delivery Challan " + salesOrder.getConvertedToDc());
        }
        DeliveryChallan dc = new DeliveryChallan();
        dc.setDcNo(buildModuleNumber("DC-", deliveryChallanRepository.count(),
                maxSuffixOf("DC-", deliveryChallanRepository.findAllDcNos())));
        dc.setSoRef(salesOrder.getSoNo());
        dc.setScRef(salesOrder.getScRef());
        dc.setDcDate(LocalDateTime.now());
        dc.setStatus("draft");
        dc.setClientId(salesOrder.getClientId());
        dc.setClientName(salesOrder.getClientName());
        dc.setContactPerson(salesOrder.getContactPerson());
        dc.setEmail(salesOrder.getEmail());
        dc.setPhone(salesOrder.getPhone());
        dc.setBillingAddress(salesOrder.getBillingAddress());
        dc.setShippingAddress(salesOrder.getShippingAddress());
        dc.setCity(salesOrder.getCity());
        dc.setState(salesOrder.getState());
        dc.setTerms(salesOrder.getTerms());
        dc.setNotes(salesOrder.getRemarks());
        for (SalesOrderItem sourceItem : salesOrder.getItems()) {
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
        dc.setSubTotal(salesOrder.getSubTotal());
        dc.setDiscount(salesOrder.getDiscount());
        dc.setTaxTotal(salesOrder.getTaxTotal());
        dc.setCgstTotal(salesOrder.getCgstTotal());
        dc.setSgstTotal(salesOrder.getSgstTotal());
        dc.setCharges(salesOrder.getCharges());
        dc.setGrandTotal(salesOrder.getGrandTotal());
        DeliveryChallan savedDc = deliveryChallanRepository.save(dc);

        addTargetTimeline("delivery-challan", savedDc.getId(), "created", "Delivery Challan created",
                "Delivery Challan '" + savedDc.getDcNo() + "' created from Customer Purchase Order '" + salesOrder.getSoNo() + "'.");
        addTargetHistory("delivery-challan", savedDc.getId(), "Delivery Challan", savedDc.getDcNo(), currentUserName());

        salesOrder.setConvertedToDc(dc.getDcNo());
        addTimeline(salesOrder, "converted", "Delivery Challan generated",
                "Delivery Challan " + dc.getDcNo() + " was generated from this Customer Purchase Order.");
        return toResponse(salesOrderRepository.save(salesOrder));
    }

    public ConversionResult convertToProforma(Long id) {
        SalesOrder salesOrder = getSalesOrder(id);
        if (isNotBlank(salesOrder.getConvertedToProforma())) {
            throw new BadRequestException("Customer Purchase Order already converted to Proforma Invoice " + salesOrder.getConvertedToProforma());
        }
        ProformaInvoice pi = new ProformaInvoice();
        pi.setPiNo(buildModuleNumber("PI-", proformaInvoiceRepository.count(),
                maxSuffixOf("PI-", proformaInvoiceRepository.findAllPiNos())));
        pi.setPiDate(LocalDateTime.now());
        pi.setStatus("draft");
        pi.setSource("so");
        pi.setSourceRef(salesOrder.getSoNo());
        pi.setClientId(salesOrder.getClientId());
        pi.setClientName(salesOrder.getClientName());
        pi.setContactPerson(salesOrder.getContactPerson());
        pi.setEmail(salesOrder.getEmail());
        pi.setPhone(salesOrder.getPhone());
        pi.setGstin(salesOrder.getGstin());
        pi.setPan(salesOrder.getPan());
        pi.setBillingAddress(salesOrder.getBillingAddress());
        pi.setShippingAddress(salesOrder.getShippingAddress());
        pi.setCurrency(salesOrder.getCurrency());
        pi.setPaymentTerms(salesOrder.getPaymentTerms());
        pi.setTermsOfDelivery(salesOrder.getDeliveryTerms());
        pi.setTerms(salesOrder.getTerms());
        pi.setTaxType(salesOrder.getTaxType());
        pi.setHsnView(salesOrder.getHsnView());
        pi.setNotes(salesOrder.getRemarks());
        for (SalesOrderItem sourceItem : salesOrder.getItems()) {
            ProformaInvoiceItem item = new ProformaInvoiceItem();
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
            pi.addItem(item);
        }
        pi.setSubTotal(salesOrder.getSubTotal());
        pi.setDiscount(salesOrder.getDiscount());
        BigDecimal soSubTotal = nvl(salesOrder.getSubTotal(), BigDecimal.ZERO);
        if (soSubTotal.compareTo(BigDecimal.ZERO) > 0) {
            // Sales Order stores a flat discount; Proforma Invoice is percentage-based.
            pi.setDiscountPct(nvl(salesOrder.getDiscount(), BigDecimal.ZERO)
                    .multiply(BigDecimal.valueOf(100))
                    .divide(soSubTotal, 2, RoundingMode.HALF_UP));
        } else {
            pi.setDiscountPct(BigDecimal.ZERO);
        }
        pi.setTaxTotal(salesOrder.getTaxTotal());
        pi.setCgstTotal(salesOrder.getCgstTotal());
        pi.setSgstTotal(salesOrder.getSgstTotal());
        pi.setCharges(salesOrder.getCharges());
        pi.setGrandTotal(salesOrder.getGrandTotal());
        ProformaInvoice savedPi = proformaInvoiceRepository.save(pi);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, salesOrder.getId(), "proforma-invoice", savedPi.getId());

        addTargetTimeline("proforma-invoice", savedPi.getId(), "created", "Proforma Invoice created",
                "Proforma Invoice '" + savedPi.getPiNo() + "' created from Customer Purchase Order '" + salesOrder.getSoNo() + "'.");
        addTargetHistory("proforma-invoice", savedPi.getId(), "Proforma Invoice", savedPi.getPiNo(), currentUserName());

        salesOrder.setConvertedToProforma(pi.getPiNo());
        addTimeline(salesOrder, "converted", "Proforma Invoice created",
                "Proforma Invoice " + pi.getPiNo() + " was created from this Customer Purchase Order.");
        salesOrderRepository.save(salesOrder);
        return new ConversionResult("proforma-invoice", savedPi.getId(), savedPi.getPiNo(), "Proforma Invoice " + savedPi.getPiNo() + " created from Customer Purchase Order " + salesOrder.getSoNo());
    }

    public ConversionResult convertToInvoice(Long id) {
        SalesOrder salesOrder = getSalesOrder(id);
        if (isNotBlank(salesOrder.getConvertedToInv())) {
            throw new BadRequestException("Customer Purchase Order already converted to Invoice " + salesOrder.getConvertedToInv());
        }
        Invoice invoice = new Invoice();
        invoice.setInvoiceNo(buildModuleNumber("INV-", invoiceRepository.count(),
                maxSuffixOf("INV-", invoiceRepository.findAllInvoiceNos())));
        invoice.setInvoiceDate(LocalDateTime.now());
        invoice.setStatus("draft");
        invoice.setSource("so");
        invoice.setSourceRef(salesOrder.getSoNo());
        invoice.setClientId(salesOrder.getClientId());
        invoice.setClientName(salesOrder.getClientName());
        invoice.setContactPerson(salesOrder.getContactPerson());
        invoice.setEmail(salesOrder.getEmail());
        invoice.setPhone(salesOrder.getPhone());
        invoice.setGstin(salesOrder.getGstin());
        invoice.setPan(salesOrder.getPan());
        invoice.setBillingAddress(salesOrder.getBillingAddress());
        invoice.setShippingAddress(salesOrder.getShippingAddress());
        for (SalesOrderItem sourceItem : salesOrder.getItems()) {
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
        invoice.setSubTotal(salesOrder.getSubTotal());
        invoice.setDiscount(salesOrder.getDiscount());
        invoice.setTaxTotal(salesOrder.getTaxTotal());
        invoice.setCgstTotal(salesOrder.getCgstTotal());
        invoice.setSgstTotal(salesOrder.getSgstTotal());
        invoice.setCharges(salesOrder.getCharges());
        invoice.setGrandTotal(salesOrder.getGrandTotal());        Invoice savedInvoice = invoiceRepository.save(invoice);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, salesOrder.getId(), "invoice", savedInvoice.getId());

        addTargetTimeline("invoice", savedInvoice.getId(), "created", "Invoice created",
                "Invoice '" + savedInvoice.getInvoiceNo() + "' created from Customer Purchase Order '" + salesOrder.getSoNo() + "'.");
        addTargetHistory("invoice", savedInvoice.getId(), "Invoice", savedInvoice.getInvoiceNo(), currentUserName());

        salesOrder.setConvertedToInv(invoice.getInvoiceNo());
        addTimeline(salesOrder, "converted", "Invoice created",
                "Invoice " + invoice.getInvoiceNo() + " was created from this Customer Purchase Order.");
        salesOrderRepository.save(salesOrder);
        return new ConversionResult("invoice", savedInvoice.getId(), savedInvoice.getInvoiceNo(), "Invoice " + savedInvoice.getInvoiceNo() + " created from Customer Purchase Order " + salesOrder.getSoNo());
    }

    private boolean isNotBlank(String value) {
        return value != null && !value.isBlank();
    }

    /** Sales Order → Credit Note conversion. */
    public ConversionResult convertToCreditNote(Long id) {
        SalesOrder salesOrder = getSalesOrder(id);
        if (isNotBlank(salesOrder.getConvertedToCn())) {
            throw new BadRequestException("Customer Purchase Order already converted to Credit Note " + salesOrder.getConvertedToCn());
        }
        CreditNote cn = new CreditNote();
        cn.setCnNo(buildModuleNumber("CN-", creditNoteRepository.count(),
                maxSuffixOf("CN-", creditNoteRepository.findAllCnNos())));
        cn.setCnDate(LocalDateTime.now());
        cn.setStatus("draft");
        cn.setSource("sales-order");
        cn.setSourceRef(salesOrder.getSoNo());
        cn.setReason("Customer Purchase Order converted to Credit Note");
        cn.setReasonDetail("Credit Note generated from Customer Purchase Order " + salesOrder.getSoNo());
        cn.setInventoryImpact("none");
        cn.setClientId(salesOrder.getClientId());
        cn.setClientName(salesOrder.getClientName());
        cn.setContactPerson(salesOrder.getContactPerson());
        cn.setEmail(salesOrder.getEmail());
        cn.setPhone(salesOrder.getPhone());
        cn.setGstin(salesOrder.getGstin());
        for (SalesOrderItem sourceItem : salesOrder.getItems()) {
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
        cn.setSubTotal(salesOrder.getSubTotal());
        cn.setDiscount(salesOrder.getDiscount());
        cn.setTaxTotal(salesOrder.getTaxTotal());
        cn.setCgstTotal(salesOrder.getCgstTotal());
        cn.setSgstTotal(salesOrder.getSgstTotal());
        cn.setCharges(salesOrder.getCharges());
        cn.setGrandTotal(salesOrder.getGrandTotal());
        cn.setRefundAmount(salesOrder.getGrandTotal());
        CreditNote savedCn = creditNoteRepository.save(cn);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, salesOrder.getId(), "credit-note", savedCn.getId());
        addTargetTimeline("credit-note", savedCn.getId(), "created", "Credit Note created",
                "Credit Note '" + savedCn.getCnNo() + "' created from Customer Purchase Order '" + salesOrder.getSoNo() + "'.");
        addTargetHistory("credit-note", savedCn.getId(), "Credit Note", savedCn.getCnNo(), currentUserName());

        salesOrder.setConvertedToCn(savedCn.getCnNo());
        addTimeline(salesOrder, "converted", "Converted to Credit Note",
                "Customer Purchase Order converted to Credit Note " + savedCn.getCnNo() + ".");
        addHistory(salesOrder, "Status", null, "Converted", currentUserName());
        salesOrderRepository.save(salesOrder);
        return new ConversionResult("credit-note", savedCn.getId(), savedCn.getCnNo(), "Credit Note " + savedCn.getCnNo() + " created from Customer Purchase Order " + salesOrder.getSoNo());
    }

    /** Sales Order → Payment Receipt conversion. */
    public ConversionResult convertToPaymentReceipt(Long id) {
        SalesOrder salesOrder = getSalesOrder(id);
        if (isNotBlank(salesOrder.getConvertedToPr())) {
            throw new BadRequestException("Customer Purchase Order already converted to Payment Receipt " + salesOrder.getConvertedToPr());
        }
        PaymentReceipt receipt = new PaymentReceipt();
        receipt.setReceiptNo(buildModuleNumber("PR-", paymentReceiptRepository.count(),
                maxSuffixOf("PR-", paymentReceiptRepository.findAllReceiptNos())));
        receipt.setPaymentDate(LocalDateTime.now());
        receipt.setStatus("draft");
        receipt.setSource("sales-order");
        receipt.setInvoiceRef(salesOrder.getSoNo());
        receipt.setClientId(salesOrder.getClientId());
        receipt.setClientName(salesOrder.getClientName());
        receipt.setContactPerson(salesOrder.getContactPerson());
        receipt.setEmail(salesOrder.getEmail());
        receipt.setPhone(salesOrder.getPhone());
        receipt.setGstin(salesOrder.getGstin());
        receipt.setAmount(salesOrder.getGrandTotal());
        receipt.setRemarks("Payment receipt generated from Customer Purchase Order " + salesOrder.getSoNo());
        PaymentReceipt savedPr = paymentReceiptRepository.save(receipt);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, salesOrder.getId(), "payment-receipt", savedPr.getId());
        addTargetTimeline("payment-receipt", savedPr.getId(), "created", "Payment Receipt created",
                "Payment Receipt '" + savedPr.getReceiptNo() + "' created from Customer Purchase Order '" + salesOrder.getSoNo() + "'.");
        addTargetHistory("payment-receipt", savedPr.getId(), "Payment Receipt", savedPr.getReceiptNo(), currentUserName());

        salesOrder.setConvertedToPr(savedPr.getReceiptNo());
        addTimeline(salesOrder, "converted", "Converted to Payment Receipt",
                "Customer Purchase Order converted to Payment Receipt " + savedPr.getReceiptNo() + ".");
        addHistory(salesOrder, "Status", null, "Converted", currentUserName());
        salesOrderRepository.save(salesOrder);
        return new ConversionResult("payment-receipt", savedPr.getId(), savedPr.getReceiptNo(), "Payment Receipt " + savedPr.getReceiptNo() + " created from Customer Purchase Order " + salesOrder.getSoNo());
    }

    // ============================== Export ==============================

    @Transactional(readOnly = true)
    public List<SalesOrderResponse> export(String search, String status, String client, String salesExecutive,
                                           String dateFrom, String dateTo, BigDecimal minAmount, BigDecimal maxAmount) {
        Specification<SalesOrder> spec = buildSpecification(search, status, client, salesExecutive,
                dateFrom, dateTo, minAmount, maxAmount);
        List<SalesOrder> orders = salesOrderRepository.findAll(spec);
        ChildCollections children = loadChildCollections(orders);
        return orders.stream().map(salesOrder -> toResponse(salesOrder, List.of(), children)).toList();
    }

    @Transactional(readOnly = true)
    public String buildCsv(List<SalesOrderResponse> salesOrders) {
        StringBuilder sb = new StringBuilder();
        sb.append("Customer Purchase Order No,Date,Client,Status,Priority,Items,Amount,Created\n");
        for (SalesOrderResponse o : salesOrders) {
            sb.append(escapeCsv(o.soNo())).append(',')
              .append(escapeCsv(o.date())).append(',')
              .append(escapeCsv(o.clientName())).append(',')
              .append(escapeCsv(o.status())).append(',')
              .append(escapeCsv(o.priority())).append(',')
              .append(o.itemsCount() == null ? "" : o.itemsCount()).append(',')
              .append(o.grandTotal() == null ? "" : o.grandTotal().toPlainString()).append(',')
              .append(escapeCsv(o.createdAt())).append('\n');
        }
        return sb.toString();
    }

    // ============================== Sub-resources ==============================

    @Transactional(readOnly = true)
    public List<SalesTimelineResponse> getTimeline(Long id) {
        getSalesOrder(id);
        return timelineRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, id)
                .stream().map(this::timelineResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SalesHistoryResponse> getHistory(Long id) {
        getSalesOrder(id);
        return historyRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, id)
                .stream().map(this::historyResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SalesAttachmentResponse> getAttachments(Long id) {
        getSalesOrder(id);
        return attachmentRepository.findByModuleTypeAndModuleIdOrderByUploadedAtAsc(MODULE, id)
                .stream().map(this::attachmentResponse).toList();
    }

    public SalesAttachmentResponse addAttachment(Long id, MultipartFile file) {
        SalesOrder so = getSalesOrder(id);
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
                file.getOriginalFilename(), "Customer Purchase Order", id,
                so.getSoNo(), so.getClientId(), so.getClientName(),
                baseUrl + "/v1/files/" + storedName,
                file.getContentType(), file.getSize(),
                currentUserName(), DocumentVisibility.TEAM_ONLY);
        return attachmentResponse(saved);
    }

    public void deleteAttachment(Long id, Long attachmentId) {
        getSalesOrder(id);
        SalesAttachment attachment = attachmentRepository.findById(attachmentId)
                .filter(a -> MODULE.equals(a.getModuleType()) && id.equals(a.getModuleId()))
                .orElseThrow(() -> new ResourceNotFoundException("Attachment not found with id: " + attachmentId));
        attachmentRepository.delete(attachment);
    }

    // ============================== Mapping ==============================

    private void copyForRevision(SalesOrder copy, SalesOrder source) {
        // NOTE: the JavaBean property name derived from getEActions() is "EActions"
        // (Introspector.decapitalize leaves it unchanged because the first two
        // characters are upper-case), so BOTH spellings must be excluded -
        // otherwise the source's eActions LIST is aliased into the copy and the
        // rows are shared between revisions.
        org.springframework.beans.BeanUtils.copyProperties(source, copy,
                "id", "items", "eActions", "EActions", "timeline", "revisionOf", "revision", "revisionDate", "latestRevision", "createdAt", "updatedAt", "archivedAt");
        for (SalesOrderItem sourceItem : source.getItems()) {
            SalesOrderItem item = new SalesOrderItem();
            org.springframework.beans.BeanUtils.copyProperties(sourceItem, item,
                    "id", "salesOrder", "createdAt");
            copy.addItem(item);
        }
        for (SalesOrderEAction sourceAction : source.getEActions()) {
            SalesOrderEAction action = new SalesOrderEAction();
            org.springframework.beans.BeanUtils.copyProperties(sourceAction, action,
                    "id", "salesOrder", "createdAt");
            copy.addEAction(action);
        }
    }

    private int maxRevisionOfChain(Long baseId) {
        return salesOrderRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .mapToInt(SalesOrder::getRevision)
                .max()
                .orElse(0);
    }

    /** Detail response — also carries the full revision chain for the UI. */
    private SalesOrderResponse toResponseDetail(SalesOrder salesOrder) {
        return toResponse(salesOrder, revisionChain(salesOrder));
    }

    private List<RevisionInfo> revisionChain(SalesOrder salesOrder) {
        Long baseId = salesOrder.getRevisionOf() != null ? salesOrder.getRevisionOf() : salesOrder.getId();
        List<RevisionInfo> chain = new ArrayList<>();
        salesOrderRepository.findById(baseId).ifPresent(q -> chain.add(revisionInfo(q)));
        salesOrderRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .sorted(java.util.Comparator.comparingInt(SalesOrder::getRevision))
                .forEach(q -> chain.add(revisionInfo(q)));
        return chain;
    }

    private RevisionInfo revisionInfo(SalesOrder salesOrder) {
        return new RevisionInfo(
                salesOrder.getId(),
                salesOrder.getSoNo(),
                salesOrder.getRevision(),
                salesOrder.getStatus(),
                salesOrder.getRevisionDate() == null
                        ? (salesOrder.getCreatedAt() == null ? null : salesOrder.getCreatedAt().toString())
                        : salesOrder.getRevisionDate().toString(),
                salesOrder.isLatestRevision());
    }

    /** When the latest revision is deleted, the previous one becomes latest. */
    private void promotePreviousRevision(SalesOrder removed) {
        if (!removed.isLatestRevision()) {
            return;
        }
        Long baseId = removed.getRevisionOf() != null ? removed.getRevisionOf() : removed.getId();
        // Highest remaining revision row first (revision >= 1).
        salesOrderRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .filter(q -> !q.getId().equals(removed.getId()))
                .filter(q -> !"deleted".equals(q.getStatus()))
                .findFirst()
                .ifPresentOrElse(q -> {
                    q.setLatestRevision(true);
                    salesOrderRepository.save(q);
                    removed.setLatestRevision(false);
                    salesOrderRepository.save(removed);
                }, () -> salesOrderRepository.findById(baseId).ifPresent(q -> {
                    // Fall back to the base row (revision 0) when no revision rows remain.
                    if (!q.getId().equals(removed.getId()) && !"deleted".equals(q.getStatus())) {
                        q.setLatestRevision(true);
                        salesOrderRepository.save(q);
                        removed.setLatestRevision(false);
                        salesOrderRepository.save(removed);
                    }
                }));
    }

    /** List/export response - carries no revision chain (avoids N+1). */
    private SalesOrderResponse toResponse(SalesOrder entity) {
        return toResponse(entity, List.of());
    }

    private SalesOrderResponse toResponse(SalesOrder salesOrder, List<RevisionInfo> revisions) {
        return toResponse(salesOrder, revisions, null);
    }

    /**
     * @param children children already loaded for the page being mapped (list and
     *                 export paths), or {@code null} for a single record, which then
     *                 reads its own attachments/timeline/history.
     */
    private SalesOrderResponse toResponse(SalesOrder salesOrder, List<RevisionInfo> revisions, ChildCollections children) {
        List<SalesOrderItemResponse> itemResponses = salesOrder.getItems().stream().map(this::itemResponse).toList();
        BigDecimal totalQty = itemResponses.stream()
                .map(SalesOrderItemResponse::qty)
                .filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new SalesOrderResponse(
                salesOrder.getId(), salesOrder.getSoNo(), salesOrder.getCustomerPo(),
                salesOrder.getOrderDate() == null ? null : salesOrder.getOrderDate().toLocalDate().toString(),
                salesOrder.getLeadNo(), salesOrder.getScRef(), salesOrder.getQtnRef(),
                salesOrder.getStatus(), salesOrder.getCurrency(),
                salesOrder.getTaxType(), salesOrder.getHsnView(), salesOrder.getPriority(),
                salesOrder.getClientId(), salesOrder.getClientName(), salesOrder.getContactPerson(),
                salesOrder.getEmail(), salesOrder.getPhone(), salesOrder.getCity(), salesOrder.getState(),
                salesOrder.getBillingAddress(), salesOrder.getShippingAddress(), salesOrder.getGstin(),
                salesOrder.getPan(), salesOrder.getPaymentTerms(), salesOrder.getSalesExecutive(),
                salesOrder.getDeliveryDate() == null ? null : salesOrder.getDeliveryDate().toLocalDate().toString(),
                salesOrder.getDeliveryTerms(), salesOrder.getTerms(), salesOrder.getRemarks(),
                salesOrder.getReleaseMethod(), salesOrder.getReleaseRequired(), salesOrder.getActionType(),
                salesOrder.getReleaseDate() == null ? null : salesOrder.getReleaseDate().toLocalDate().toString(),
                salesOrder.getReleaseToDepartment(), salesOrder.getParticipationRequired(),
                salesOrder.getAssignedTo(), salesOrder.getDepartmentTeam(),
                salesOrder.getActionDeadline() == null ? null : salesOrder.getActionDeadline().toLocalDate().toString(),
                salesOrder.getActionRemarks(), salesOrder.getActionInstructions(),
                salesOrder.getSubTotal(), salesOrder.getDiscount(), salesOrder.getDiscountPct(),
                salesOrder.getCgstTotal(), salesOrder.getSgstTotal(), salesOrder.getTaxTotal(),
                salesOrder.getCharges(), salesOrder.getGrandTotal(),
                itemResponses.size(), totalQty,
                salesOrder.getConvertedToInv(), salesOrder.getConvertedToDc(), salesOrder.getConvertedToProforma(),
                salesOrder.getConvertedToCn(), salesOrder.getConvertedToPr(),
                salesOrder.getOrderDate() == null
                        ? (salesOrder.getCreatedAt() == null ? null : salesOrder.getCreatedAt().toLocalDate().toString())
                        : salesOrder.getOrderDate().toLocalDate().toString(),
                salesOrder.getCreatedAt() == null ? null : salesOrder.getCreatedAt().toString(),
                salesOrder.getUpdatedAt() == null ? null : salesOrder.getUpdatedAt().toString(),
                salesOrder.getArchivedAt() == null ? null : salesOrder.getArchivedAt().toString(),
                itemResponses,
                children == null
                        ? salesOrder.getEActions().stream().map(this::eActionResponse).toList()
                        : children.eActions().getOrDefault(salesOrder.getId(), List.of()),
                children == null
                        ? attachmentRepository.findByModuleTypeAndModuleIdOrderByUploadedAtAsc(MODULE, salesOrder.getId())
                                .stream().map(this::attachmentResponse).toList()
                        : children.attachments().getOrDefault(salesOrder.getId(), List.of()),
                children == null
                        ? timelineRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, salesOrder.getId())
                                .stream().map(this::timelineResponse).toList()
                        : children.timeline().getOrDefault(salesOrder.getId(), List.of()),
                children == null
                        ? historyRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, salesOrder.getId())
                                .stream().map(this::historyResponse).toList()
                        : children.history().getOrDefault(salesOrder.getId(), List.of()),
                salesOrder.getRevision(),
                salesOrder.getRevisionOf(),
                salesOrder.isLatestRevision(),
                salesOrder.getRevisionDate() == null ? null : salesOrder.getRevisionDate().toString(),
                revisions
        );
    }

    // ==================== E-Actions (standalone view) ====================

    /**
     * E-Action / Participation rows across ALL Customer Purchase Orders, paged
     * and filtered. It reads exactly the {@code sales_order_e_actions} rows the
     * CPO Create/Edit form writes - a VIEW over the existing data, never a
     * second E-Action implementation.
     */
    @Transactional(readOnly = true)
    public Page<SalesOrderEActionListResponse> listEActions(int page, int size, String search, String cpoNo,
                                                           String status, String participantTeam,
                                                           String dateFrom, String dateTo) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize,
                Sort.by(Sort.Order.desc("requestedOn"), Sort.Order.desc("id")));
        return eActionRepository.findAllFiltered(
                        filterValue(search), filterValue(cpoNo), filterValue(status), filterValue(participantTeam),
                        parseDate(dateFrom), parseDate(dateTo), pageable)
                .map(this::eActionListResponse);
    }

    /** One E-Action with its CPO context - the standalone E-Action view page. */
    @Transactional(readOnly = true)
    public SalesOrderEActionListResponse getEAction(Long actionId) {
        SalesOrderEAction action = eActionRepository.findById(actionId)
                .orElseThrow(() -> new ResourceNotFoundException("E-Action not found: " + actionId));
        return eActionListResponse(action);
    }

    /** Real per-status counts for the E-Actions summary cards. */
    @Transactional(readOnly = true)
    public Map<String, Object> eActionStats() {
        Map<String, Long> byStatus = new LinkedHashMap<>();
        long total = 0L;
        for (Object[] row : eActionRepository.countGroupedByStatus()) {
            String status = row[0] == null ? "Not set" : String.valueOf(row[0]);
            long count = row[1] == null ? 0L : ((Number) row[1]).longValue();
            byStatus.put(status, count);
            total += count;
        }
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", total);
        stats.put("byStatus", byStatus);
        return stats;
    }

    /**
     * Picker / filter options, taken from the values actually stored in MySQL:
     * the current CPOs (same records the CPO list shows), plus the participant
     * teams and statuses present on existing E-Actions.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> eActionFilterOptions() {
        List<SalesOrder> orders = salesOrderRepository.findCurrentForOptions(PageRequest.of(0, 500));
        Map<Long, Integer> itemCounts = itemCountsByOrderIds(
                orders.stream().map(SalesOrder::getId).toList());
        List<SalesOrderOptionResponse> cpos = orders.stream()
                .map(o -> new SalesOrderOptionResponse(
                        o.getId(), o.getSoNo(), o.getClientId(), o.getClientName(),
                        o.getOrderDate() == null ? null : o.getOrderDate().toLocalDate().toString(),
                        itemCounts.getOrDefault(o.getId(), 0)))
                .toList();
        return Map.of(
                "cpos", cpos,
                "participantTeams", eActionRepository.findDistinctParticipantTeams(),
                "statuses", eActionRepository.findDistinctStatuses());
    }

    /** Create one E-Action on an existing CPO (same table the CPO form uses). */
    public SalesOrderEActionListResponse createEAction(Long salesOrderId, SalesOrderEActionRequest request) {
        return createEAction(request, salesOrderId);
    }

    /**
     * Create one E-Action addressed by the payload itself: either an EXISTING CPO
     * ({@code salesOrderId}) or — when the order is not one of the CPO records in
     * this system — a manually entered CPO reference ({@code cpoReference}).
     *
     * <p>Nothing is invented behind the user's back: the typed reference is
     * stored as text on this E-Action row and no Customer Purchase Order record
     * is created for it.
     */
    public SalesOrderEActionListResponse createEAction(SalesOrderEActionRequest request) {
        if (request == null) {
            throw new BadRequestException("E-Action payload is required");
        }
        return createEAction(request, request.salesOrderId());
    }

    /**
     * Single create path: resolve the row's CPO address (existing record or typed
     * reference), then write the business fields. Persist the row explicitly and
     * flush, so the generated id is part of the response (IDENTITY generation
     * assigns it on INSERT).
     */
    private SalesOrderEActionListResponse createEAction(SalesOrderEActionRequest request, Long salesOrderId) {
        if (request == null) {
            throw new BadRequestException("E-Action payload is required");
        }
        SalesOrderEAction action = new SalesOrderEAction();
        linkEAction(action, salesOrderId, request.cpoReference());
        applyEAction(action, request);
        return eActionListResponse(eActionRepository.saveAndFlush(action));
    }

    /**
     * Update one E-Action by its own id — the standalone endpoints, and the only
     * way to edit a row whose CPO is a manual reference (no order aggregate
     * carries it). The CPO address is only re-pointed when the payload actually
     * names one, so an edit that leaves the field untouched keeps the link it
     * already had.
     */
    public SalesOrderEActionListResponse updateEAction(Long actionId, SalesOrderEActionRequest request) {
        if (request == null) {
            throw new BadRequestException("E-Action payload is required");
        }
        SalesOrderEAction action = eActionRepository.findById(actionId)
                .orElseThrow(() -> new ResourceNotFoundException("E-Action not found: " + actionId));
        Map<String, String> before = eActionSnapshot(action);
        if (request.salesOrderId() != null || hasText(request.cpoReference())) {
            linkEAction(action, request.salesOrderId(), request.cpoReference());
        }
        applyEAction(action, request);
        SalesOrderEAction saved = eActionRepository.saveAndFlush(action);
        // A no-change submission keeps the existing history untouched; a genuine
        // change preserves the state that was replaced before anything is read back.
        recordEActionRevision(saved, before);
        return eActionListResponse(saved);
    }

    /** Every immutable revision snapshot of one E-Action, oldest first. */
    @Transactional(readOnly = true)
    public List<RecordRevisionResponse> eActionRevisions(Long actionId) {
        requireEAction(actionId);
        return RecordRevisionService.get().list(E_ACTION_MODULE, actionId);
    }

    /** Field-level edit history of one E-Action, grouped newest first. */
    @Transactional(readOnly = true)
    public List<EditHistoryGroupResponse> eActionEditHistory(Long actionId) {
        requireEAction(actionId);
        return EditHistoryService.get().getHistory(E_ACTION_MODULE, actionId);
    }

    private void requireEAction(Long actionId) {
        if (actionId == null || !eActionRepository.existsById(actionId)) {
            throw new ResourceNotFoundException("E-Action not found: " + actionId);
        }
    }

    /**
     * Point an E-Action at exactly one of its two possible CPO addresses: an
     * EXISTING Customer Purchase Order, or a manually entered CPO reference.
     * A CPO id wins (that is the real relationship the CPO pages read); a blank
     * one and a blank reference leave the row as it is — and a brand new row
     * with neither is rejected instead of being stored unaddressable.
     */
    private void linkEAction(SalesOrderEAction action, Long salesOrderId, String cpoReference) {
        if (salesOrderId != null) {
            SalesOrder order = salesOrderRepository.findById(salesOrderId)
                    .orElseThrow(() -> new ResourceNotFoundException("Customer purchase order not found: " + salesOrderId));
            action.setSalesOrder(order);
            action.setCpoReference(null);
            return;
        }
        if (hasText(cpoReference)) {
            action.setSalesOrder(null);
            action.setCpoReference(cpoReference.trim());
            return;
        }
        if (action.getSalesOrder() == null && !hasText(action.getCpoReference())) {
            throw new BadRequestException(
                    "Select an existing Customer Purchase Order or enter the CPO reference this E-Action belongs to.");
        }
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    /** Update one E-Action of a CPO, leaving the order's other rows untouched. */
    public SalesOrderEActionListResponse updateEAction(Long salesOrderId, Long actionId,
                                                      SalesOrderEActionRequest request) {
        SalesOrder order = salesOrderRepository.findById(salesOrderId)
                .orElseThrow(() -> new ResourceNotFoundException("Customer purchase order not found: " + salesOrderId));
        SalesOrderEAction action = order.getEActions().stream()
                .filter(a -> actionId.equals(a.getId()))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("E-Action not found: " + actionId));
        Map<String, String> before = eActionSnapshot(action);
        applyEAction(action, request);
        salesOrderRepository.saveAndFlush(order);
        recordEActionRevision(action, before);
        return eActionListResponse(action);
    }

    /**
     * Full scalar state of an E-Action, plus the linked CPO number. The CPO is a
     * lazy association (not a scalar) so without this key re-pointing the row
     * from one existing CPO to another would look like no change at all.
     */
    private Map<String, String> eActionSnapshot(SalesOrderEAction action) {
        Map<String, String> snapshot = new LinkedHashMap<>(EditHistoryService.get().snapshot(action));
        SalesOrder order = action.getSalesOrder();
        snapshot.put("cpoNo", order == null ? "" : order.getSoNo());
        return snapshot;
    }

    /**
     * Persists exactly one revision for a genuine E-Action change, after the
     * update has been written successfully. Retried/no-op submissions compare
     * equal and record nothing; failed updates never reach this method.
     */
    private void recordEActionRevision(SalesOrderEAction action, Map<String, String> before) {
        if (action == null || action.getId() == null || before == null) {
            return;
        }
        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> after = eActionSnapshot(action);
        if (EditHistoryService.isNoOpEdit(before, after)) {
            return;
        }
        RecordRevisionService.get().recordSnapshot(E_ACTION_MODULE, action.getId(), before);
        editHistory.recordEdit(E_ACTION_MODULE, action.getId(), before, after);
    }

    /** Remove one E-Action from a CPO (orphanRemoval deletes the row). */
    public void deleteEAction(Long salesOrderId, Long actionId) {
        SalesOrder order = salesOrderRepository.findById(salesOrderId)
                .orElseThrow(() -> new ResourceNotFoundException("Customer purchase order not found: " + salesOrderId));
        boolean removed = order.getEActions().removeIf(a -> actionId.equals(a.getId()));
        if (!removed) {
            throw new ResourceNotFoundException("E-Action not found: " + actionId);
        }
        salesOrderRepository.save(order);
    }

    /**
     * Remove one E-Action by its own id — including a row raised against a
     * manually entered CPO reference, which no order aggregate holds.
     */
    public void deleteEAction(Long actionId) {
        SalesOrderEAction action = eActionRepository.findById(actionId)
                .orElseThrow(() -> new ResourceNotFoundException("E-Action not found: " + actionId));
        eActionRepository.delete(action);
    }

    private void applyEAction(SalesOrderEAction action, SalesOrderEActionRequest request) {
        if (request == null) {
            throw new BadRequestException("E-Action payload is required");
        }
        action.setParticipantTeam(request.participantTeam());
        action.setAssignedAction(request.assignedAction());
        action.setAssignedTo(request.assignedTo());
        action.setStatus(request.status());
        action.setRequestedOn(parseDate(request.requestedOn()));
        action.setStartedOn(parseDate(request.startedOn()));
        action.setCompletedOn(parseDate(request.completedOn()));
        action.setResult(request.result());
        action.setRemarks(request.remarks());
        action.setCustomFieldsJson(writeCustomFields(request.customFields()));
    }

    /** Row shape for the standalone E-Actions view (fields + CPO context). */
    private SalesOrderEActionListResponse eActionListResponse(SalesOrderEAction action) {
        SalesOrder order = action.getSalesOrder();
        return new SalesOrderEActionListResponse(
                action.getId(),
                order == null ? null : order.getId(),
                order == null ? null : order.getSoNo(),
                order == null ? null : order.getClientName(),
                action.getParticipantTeam(), action.getAssignedAction(), action.getAssignedTo(), action.getStatus(),
                action.getRequestedOn() == null ? null : action.getRequestedOn().toLocalDate().toString(),
                action.getStartedOn() == null ? null : action.getStartedOn().toLocalDate().toString(),
                action.getCompletedOn() == null ? null : action.getCompletedOn().toLocalDate().toString(),
                action.getResult(), action.getRemarks(),
                readCustomFields(action.getCustomFieldsJson()),
                action.getCreatedAt() == null ? null : action.getCreatedAt().toString(),
                action.getCpoReference());
    }

    /** Blank query params are "no filter". */
    private String filterValue(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private SalesOrderEActionResponse eActionResponse(SalesOrderEAction action) {
        return new SalesOrderEActionResponse(
                action.getId(), action.getParticipantTeam(), action.getAssignedAction(), action.getAssignedTo(),
                action.getStatus(),
                action.getRequestedOn() == null ? null : action.getRequestedOn().toLocalDate().toString(),
                action.getStartedOn() == null ? null : action.getStartedOn().toLocalDate().toString(),
                action.getCompletedOn() == null ? null : action.getCompletedOn().toLocalDate().toString(),
                action.getResult(), action.getRemarks(),
                readCustomFields(action.getCustomFieldsJson()));
    }

    private SalesOrderItemResponse itemResponse(SalesOrderItem item) {
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
        return new SalesOrderItemResponse(item.getId(), item.getDescription(), item.getSku(), item.getDrawingNo(), item.getMaterial(), item.getDelivery(), item.getHsn(),
                item.getUom(), qty, rate, discPct, gst,
                gross.setScale(2, RoundingMode.HALF_UP), discAmt.setScale(2, RoundingMode.HALF_UP),
                net.setScale(2, RoundingMode.HALF_UP), cgst.setScale(2, RoundingMode.HALF_UP),
                sgst.setScale(2, RoundingMode.HALF_UP), total.setScale(2, RoundingMode.HALF_UP),
                readCustomFields(item.getCustomFieldsJson()));
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

    // ============================== Helpers ==============================

    private SalesOrder getSalesOrder(Long id) {
        return salesOrderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Customer Purchase Order not found with id: " + id));
    }

    private void applyRequest(SalesOrder salesOrder, SalesOrderRequest request) {
        salesOrder.setCustomerPo(request.customerPo());
        salesOrder.setOrderDate(parseDate(request.orderDate()));
        salesOrder.setLeadNo(request.leadNo());
        salesOrder.setScRef(request.scRef());
        salesOrder.setQtnRef(request.qtnRef());
        salesOrder.setCurrency(request.currency());
        salesOrder.setTaxType(request.taxType());
        salesOrder.setHsnView(request.hsnView());
        salesOrder.setPriority(request.priority());
        salesOrder.setClientId(request.clientId());
        salesOrder.setClientName(request.clientName());
        salesOrder.setContactPerson(request.contactPerson());
        salesOrder.setEmail(request.email());
        salesOrder.setPhone(request.phone());
        salesOrder.setCity(request.city());
        salesOrder.setState(request.state());
        salesOrder.setBillingAddress(request.billingAddress());
        salesOrder.setShippingAddress(request.shippingAddress());
        salesOrder.setGstin(request.gstin());
        salesOrder.setPan(request.pan());
        salesOrder.setPaymentTerms(request.paymentTerms());
        salesOrder.setSalesExecutive(request.salesExecutive());
        salesOrder.setDeliveryDate(parseDate(request.deliveryDate()));
        salesOrder.setDeliveryTerms(request.deliveryTerms());
        salesOrder.setTerms(request.terms());
        salesOrder.setRemarks(request.remarks());
        // ---- Release & Procurement Method ----
        salesOrder.setReleaseMethod(request.releaseMethod());
        salesOrder.setReleaseRequired(request.releaseRequired());
        salesOrder.setActionType(request.actionType());
        salesOrder.setReleaseDate(parseDate(request.releaseDate()));
        salesOrder.setReleaseToDepartment(request.releaseToDepartment());
        salesOrder.setParticipationRequired(request.participationRequired());
        salesOrder.setAssignedTo(request.assignedTo());
        salesOrder.setDepartmentTeam(request.departmentTeam());
        salesOrder.setActionDeadline(parseDate(request.actionDeadline()));
        salesOrder.setActionRemarks(request.actionRemarks());
        salesOrder.setActionInstructions(request.actionInstructions());
        salesOrder.setDiscount(request.discount() == null ? BigDecimal.ZERO : request.discount());
        salesOrder.setCharges(request.charges() == null ? BigDecimal.ZERO : request.charges());
        salesOrder.getItems().clear();
        if (request.items() != null) {
            for (SalesOrderItemRequest itemRequest : request.items()) {
                if (itemRequest == null) {
                    continue;
                }
                SalesOrderItem item = new SalesOrderItem();
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
                item.setCustomFieldsJson(writeCustomFields(itemRequest.customFields()));
                salesOrder.addItem(item);
            }
        }
        // E-Actions / Participation - the whole set is replaced by the payload
        // (the grid is authoritative), exactly like the item rows. A payload
        // that omits the field entirely (an older client) leaves the existing
        // records untouched instead of silently wiping them; an explicit empty
        // list (the form clearing the last row) does remove them.
        if (request.eActions() != null) {
            salesOrder.getEActions().clear();
            for (SalesOrderEActionRequest actionRequest : request.eActions()) {
                if (actionRequest == null) {
                    continue;
                }
                SalesOrderEAction action = new SalesOrderEAction();
                action.setParticipantTeam(actionRequest.participantTeam());
                action.setAssignedAction(actionRequest.assignedAction());
                action.setAssignedTo(actionRequest.assignedTo());
                action.setStatus(actionRequest.status());
                action.setRequestedOn(parseDate(actionRequest.requestedOn()));
                action.setStartedOn(parseDate(actionRequest.startedOn()));
                action.setCompletedOn(parseDate(actionRequest.completedOn()));
                action.setResult(actionRequest.result());
                action.setRemarks(actionRequest.remarks());
                action.setCustomFieldsJson(writeCustomFields(actionRequest.customFields()));
                salesOrder.addEAction(action);
            }
        }
    }

    /** Persist a row's custom-column values as JSON (null when there are none). */
    private String writeCustomFields(Map<String, String> fields) {
        if (fields == null || fields.isEmpty()) {
            return null;
        }
        Map<String, String> cleaned = new LinkedHashMap<>();
        fields.forEach((k, v) -> {
            if (k != null && !k.isBlank() && v != null && !v.isEmpty()) {
                cleaned.put(k, v);
            }
        });
        if (cleaned.isEmpty()) {
            return null;
        }
        try {
            return CUSTOM_FIELDS_JSON.writeValueAsString(cleaned);
        } catch (Exception e) {
            return null;
        }
    }

    /** Read a row's custom-column values back out of its stored JSON. */
    private Map<String, String> readCustomFields(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            Map<String, String> parsed = CUSTOM_FIELDS_JSON.readValue(json, new TypeReference<LinkedHashMap<String, String>>() {});
            return parsed == null ? Map.of() : parsed;
        } catch (Exception e) {
            return Map.of();
        }
    }

    private void copyItem(SalesOrderItem target, SalesOrderItem source) {
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

    private void recalcTotals(SalesOrder salesOrder) {
        BigDecimal subTotal = BigDecimal.ZERO;
        BigDecimal cgstTotal = BigDecimal.ZERO;
        BigDecimal sgstTotal = BigDecimal.ZERO;
        for (SalesOrderItem item : salesOrder.getItems()) {
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
        salesOrder.setSubTotal(subTotal.setScale(2, RoundingMode.HALF_UP));
        salesOrder.setCgstTotal(cgstTotal.setScale(2, RoundingMode.HALF_UP));
        salesOrder.setSgstTotal(sgstTotal.setScale(2, RoundingMode.HALF_UP));
        BigDecimal taxTotal = cgstTotal.add(sgstTotal);
        salesOrder.setTaxTotal(taxTotal.setScale(2, RoundingMode.HALF_UP));
        BigDecimal discount = nvl(salesOrder.getDiscount(), BigDecimal.ZERO);
        BigDecimal charges = nvl(salesOrder.getCharges(), BigDecimal.ZERO);
        BigDecimal grand = subTotal.add(taxTotal).subtract(discount).add(charges);
        if (grand.compareTo(BigDecimal.ZERO) < 0) {
            grand = BigDecimal.ZERO;
        }
        salesOrder.setGrandTotal(grand.setScale(2, RoundingMode.HALF_UP));
        if (subTotal.compareTo(BigDecimal.ZERO) > 0 && discount.compareTo(BigDecimal.ZERO) > 0) {
            salesOrder.setDiscountPct(discount.multiply(BigDecimal.valueOf(100))
                    .divide(subTotal, 2, RoundingMode.HALF_UP));
        } else {
            salesOrder.setDiscountPct(BigDecimal.ZERO);
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
    private Predicate latestPerChainPredicate(jakarta.persistence.criteria.Root<SalesOrder> root, jakarta.persistence.criteria.CriteriaQuery<?> query, jakarta.persistence.criteria.CriteriaBuilder cb) {
        Subquery<Long> newer = query.subquery(Long.class);
        jakarta.persistence.criteria.Root<SalesOrder> newerRoot = newer.from(SalesOrder.class);
        newer.select(newerRoot.get("id"));
        newer.where(cb.and(
                cb.equal(newerRoot.get("revisionOf"),
                        cb.coalesce(root.get("revisionOf"), root.get("id"))),
                cb.greaterThan(cb.coalesce(newerRoot.get("revision"), 0),
                        cb.coalesce(root.get("revision"), 0))));
        return cb.or(cb.isTrue(root.get("latestRevision")), cb.not(cb.exists(newer)));
    }

    private Specification<SalesOrder> buildSpecification(String search, String status, String client,
                                                         String salesExecutive, String dateFrom, String dateTo,
                                                         BigDecimal minAmount, BigDecimal maxAmount) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(latestPerChainPredicate(root, query, cb));
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("soNo")), like),
                        cb.like(cb.lower(root.get("clientName")), like),
                        cb.like(cb.lower(root.get("leadNo")), like),
                        cb.like(cb.lower(root.get("salesExecutive")), like),
                        cb.like(cb.lower(root.get("scRef")), like),
                        cb.like(cb.lower(root.get("qtnRef")), like),
                        cb.like(cb.lower(cb.toString(root.get("customerPo"))), like)
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
                predicates.add(cb.greaterThanOrEqualTo(root.get("orderDate"), LocalDate.parse(dateFrom).atStartOfDay()));
            }
            if (dateTo != null && !dateTo.isBlank()) {
                predicates.add(cb.lessThanOrEqualTo(root.get("orderDate"), LocalDate.parse(dateTo).atTime(23, 59, 59)));
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
            case "clientName", "salesExecutive", "orderDate", "deliveryDate", "grandTotal", "status", "priority",
                 "createdAt", "updatedAt", "soNo" -> "soNo".equals(field) ? "soNo" : field;
            case "id" -> "soNo";
            default -> "createdAt";
        };
        boolean asc = parts.length > 1 && "asc".equalsIgnoreCase(parts[1]);
        return Sort.by(asc ? Sort.Direction.ASC : Sort.Direction.DESC, mapped);
    }

    private long nextSequence() {
        long count = salesOrderRepository.count();
        long maxSuffix = 0;
        // One sequence for Customer Purchase Orders, shared with every conversion
        // path (Quotation / Sales Contract / Proforma Invoice). Both the canonical
        // CPO- prefix and the legacy SO- prefix are scanned, so a directly created
        // CPO can never collide with a converted one.
        String prefix = buildNoPrefix();
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
        return Math.max(count, maxSuffix) + 1;
    }

    private String buildNoPrefix() {
        return "CPO-" + Year.now().getValue() + "-";
    }

    private String buildNo(long sequence) {
        return String.format("CPO-%d-%06d", Year.now().getValue(), sequence);
    }

    private String buildModuleNumber(String prefix, long baseCount, long maxSuffix) {
        long sequence = Math.max(baseCount, maxSuffix) + 1;
        return String.format("%s%d-%06d", prefix, Year.now().getValue(), sequence);
    }

    private long maxSuffixOf(String prefix, Iterable<String> numbers) {
        long maxSuffix = 0;
        String p = prefix + Year.now().getValue() + "-";
        for (String no : numbers) {
            if (no != null && no.startsWith(p)) {
                try {
                    maxSuffix = Math.max(maxSuffix, Long.parseLong(no.substring(p.length())));
                } catch (NumberFormatException ignored) {
                    // skip malformed numbers
                }
            }
        }
        return maxSuffix;
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
            case "pending_review", "pending review" -> "pending review";
            case "in_progress", "in progress" -> "in progress";
            case "approved" -> "approved";
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

    private void addTimeline(SalesOrder salesOrder, String type, String title, String detail) {
        SalesTimeline entry = new SalesTimeline();
        entry.setModuleType(MODULE);
        entry.setModuleId(salesOrder.getId());
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

    private void addHistory(SalesOrder salesOrder, String field, String oldValue, String newValue, String changedBy) {
        SalesHistory entry = new SalesHistory();
        entry.setModuleType(MODULE);
        entry.setModuleId(salesOrder.getId());
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
