package com.vishatech.erp.service;
import com.vishatech.erp.dto.ConversionResult;

import com.vishatech.erp.dto.CreditNoteItemRequest;
import com.vishatech.erp.dto.CreditNoteItemResponse;
import com.vishatech.erp.dto.CreditNoteNextNumberResponse;
import com.vishatech.erp.dto.CreditNoteRequest;
import com.vishatech.erp.dto.CreditNoteResponse;
import com.vishatech.erp.dto.SalesAttachmentResponse;
import com.vishatech.erp.dto.SalesHistoryResponse;
import com.vishatech.erp.dto.SalesTimelineResponse;
import com.vishatech.erp.dto.RevisionInfo;
import com.vishatech.erp.entity.CreditNote;
import com.vishatech.erp.entity.CreditNoteItem;
import com.vishatech.erp.entity.DeliveryChallan;
import com.vishatech.erp.entity.Invoice;
import com.vishatech.erp.entity.PaymentReceipt;
import com.vishatech.erp.entity.ProformaInvoice;
import com.vishatech.erp.entity.SalesOrder;
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
import com.vishatech.erp.repository.ProformaInvoiceRepository;
import com.vishatech.erp.repository.SalesOrderRepository;
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
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
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
public class CreditNoteService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final String MODULE = "credit-note";

    /**
     * The Credit Note list's RESOLVED-ONLY sort keys: CPO No. (cpoNo),
     * Dispatch Date (dispatchDate), Due Date (dueDate) and Due Date Exceeded
     * (dueDateExceeded). None of them is a column of {@code credit_notes} —
     * each is derived from the documents the note points at (and, for the
     * overdue flag, from the note's own settlement state) — so SQL has nothing
     * to order by and they are sorted on their resolved values instead. See
     * {@link #listSortedByDerivedValue}.
     */
    private static final Set<String> DERIVED_SORT_KEYS =
            Set.of("cpono", "dispatchdate", "duedate", "duedateexceeded");

    /**
     * Bound of the derived-sort path, which resolves the whole filtered result
     * set before the requested page is sliced out of it. A larger set is refused
     * with a message that tells the user to narrow the filters, rather than
     * answered with an order that only looks right within a single page.
     */
    private static final int MAX_DERIVED_SORT_ROWS = 5000;

    private final CreditNoteRepository creditNoteRepository;
    private final SalesTimelineRepository timelineRepository;
    private final SalesHistoryRepository historyRepository;
    private final SalesAttachmentRepository attachmentRepository;
    private final EditHistoryRepository editHistoryRepository;
    private final RecordRevisionRepository recordRevisionRepository;
    private final PaymentReceiptRepository paymentReceiptRepository;
    // Linked-document reads (CPO No. / Dispatch Date / Due Date) — read-only
    // lookups of the documents a credit note points at, never writes.
    private final SalesOrderRepository salesOrderRepository;
    private final DeliveryChallanRepository deliveryChallanRepository;
    private final InvoiceRepository invoiceRepository;
    private final ProformaInvoiceRepository proformaInvoiceRepository;
    private final FileStorageService fileStorageService;
    private final DocumentRepositoryService documentRepositoryService;
    private final String baseUrl;

    public CreditNoteService(CreditNoteRepository creditNoteRepository,
                             SalesTimelineRepository timelineRepository,
                             SalesHistoryRepository historyRepository,
                             SalesAttachmentRepository attachmentRepository,
                             EditHistoryRepository editHistoryRepository,
                             RecordRevisionRepository recordRevisionRepository,
                             PaymentReceiptRepository paymentReceiptRepository,
                             SalesOrderRepository salesOrderRepository,
                             DeliveryChallanRepository deliveryChallanRepository,
                             InvoiceRepository invoiceRepository,
                             ProformaInvoiceRepository proformaInvoiceRepository,
                          FileStorageService fileStorageService,
                          DocumentRepositoryService documentRepositoryService,
                          @Value("${app.base-url:http://localhost:8080}") String baseUrl) {
        this.creditNoteRepository = creditNoteRepository;
        this.timelineRepository = timelineRepository;
        this.historyRepository = historyRepository;
        this.attachmentRepository = attachmentRepository;
        this.editHistoryRepository = editHistoryRepository;
        this.recordRevisionRepository = recordRevisionRepository;
        this.paymentReceiptRepository = paymentReceiptRepository;
        this.salesOrderRepository = salesOrderRepository;
        this.deliveryChallanRepository = deliveryChallanRepository;
        this.invoiceRepository = invoiceRepository;
        this.proformaInvoiceRepository = proformaInvoiceRepository;
        this.fileStorageService = fileStorageService;
        this.documentRepositoryService = documentRepositoryService;
        this.baseUrl = baseUrl;
    }

    @Transactional(readOnly = true)
    public Page<CreditNoteResponse> list(int page, int size, String search, String sort,
                                         String status, String client, String reason,
                                         String dateFrom, String dateTo,
                                         BigDecimal minAmount, BigDecimal maxAmount) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Specification<CreditNote> spec = buildSpecification(search, status, client, reason,
                dateFrom, dateTo, minAmount, maxAmount);

        // Two sort paths, one rule: the order is always decided on the WHOLE
        // filtered set, and only then is the requested page cut out of it.
        if (isDerivedSortKey(sort)) {
            return listSortedByDerivedValue(safePage, safeSize, spec, sort);
        }

        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort));
        Page<CreditNote> page1 = creditNoteRepository.findAll(spec, pageable);
        // The CPO / dispatch / due-date columns are resolved for the WHOLE page
        // in one pass (one lookup per distinct linked document, not one per
        // row) — the same "no N+1" rule the Quotation list follows for its PO
        // Status column.
        Map<Long, LinkInfo> links = resolveLinks(page1.getContent());
        return page1.map(cn -> toResponse(cn, List.of(), links.get(cn.getId())));
    }

    /**
     * Sorts the Credit Note list on a derived column — CPO No., Dispatch Date,
     * Due Date or Due Date Exceeded.
     *
     * <p>Those four have no column in {@code credit_notes}: each one is
     * resolved, per note, from the documents that note points at (and the
     * overdue flag additionally from the note's own settlement state and its
     * source invoice's payment state). They therefore cannot be handed to JPA
     * as an ORDER BY field, and writing the whole derivation out as a JPQL sort
     * expression would be a second copy of business rules this service already
     * owns.
     *
     * <p>So the RESOLVED values are sorted — in memory, over the COMPLETE
     * filtered set, resolved with the very same batched {@link #resolveLinks}
     * pass the normal path uses (still one lookup per distinct linked document,
     * never one per row) — and only then is the requested page sliced out. That
     * is what keeps pagination honest: page 2 continues page 1's order instead
     * of being an independent sort of its own rows. It is the same
     * whole-set-then-page shape the purchase vendor list already uses.
     *
     * <p>Trade-off, stated plainly: this path materialises the filtered set
     * rather than one page of it, so it costs more memory and one wider lookup
     * batch than the database-side path above. Credit notes are a low-volume,
     * heavily filtered document, so that is affordable; {@link
     * #MAX_DERIVED_SORT_ROWS} bounds it regardless, and a larger set is refused
     * with an actionable message instead of a silently wrong order. Every
     * stored column (document number, date, customer, amount, status, terms,
     * destination reached date, …) keeps the database-side path and never pays
     * this cost.
     */
    @Transactional(readOnly = true)
    private Page<CreditNoteResponse> listSortedByDerivedValue(int safePage, int safeSize,
                                                              Specification<CreditNote> spec,
                                                              String sort) {
        // A deterministic base order underneath the derived one, so notes that
        // share a resolved value (two notes without a due date, say) keep one
        // stable relative order in every page and on every request.
        List<CreditNote> all = creditNoteRepository.findAll(spec,
                Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")));
        if (all.size() > MAX_DERIVED_SORT_ROWS) {
            throw new BadRequestException("Sorting by this column resolves the linked documents of every "
                    + "matching credit note, so it is limited to " + MAX_DERIVED_SORT_ROWS
                    + " rows. Narrow the filters (for example a date range) and sort again.");
        }
        Map<Long, LinkInfo> links = resolveLinks(all);
        List<CreditNoteResponse> sorted = new ArrayList<>(all.size());
        all.forEach(cn -> sorted.add(toResponse(cn, List.of(), links.get(cn.getId()))));
        sorted.sort(derivedComparator(sort));
        int from = Math.min(safePage * safeSize, sorted.size());
        int to = Math.min(from + safeSize, sorted.size());
        return new PageImpl<>(sorted.subList(from, to), PageRequest.of(safePage, safeSize),
                sorted.size());
    }

    /** True when the requested sort field is one of the resolved-only columns. */
    private boolean isDerivedSortKey(String sort) {
        return sort != null && !sort.isBlank() && DERIVED_SORT_KEYS.contains(sortField(sort));
    }

    /** The field half of a {@code field,direction} sort request, lower-cased. */
    private String sortField(String sort) {
        return sort.split(",")[0].trim().toLowerCase(Locale.ROOT);
    }

    /**
     * Whether a sort request asks for ascending order. This is the service's
     * existing convention, shared with {@link #buildSort}: the direction has to
     * be spelled {@code asc}; anything else — including an omitted direction —
     * means descending.
     */
    private boolean isAscending(String sort) {
        String[] parts = sort.split(",");
        return parts.length > 1 && "asc".equalsIgnoreCase(parts[1].trim());
    }

    /**
     * Orders resolved credit-note rows on the SAME values their cells show: the
     * resolved CPO number, dispatch date, due date and overdue flag — never on a
     * stored field that merely looks similar.
     *
     * <p>Missing values (the table's {@code —}) always sort LAST, in both
     * directions, so an unlinked note never heads a list of real dates and never
     * buries one either. Ties fall back to the credit-note number and then the
     * row id, which makes the order total: the same notes keep the same relative
     * order on every page. Dates are compared as their ISO-8601 text
     * ({@code yyyy-MM-dd}), which is chronological by construction because that
     * is exactly how the resolver emits them.
     */
    private Comparator<CreditNoteResponse> derivedComparator(String sort) {
        boolean asc = isAscending(sort);
        Comparator<String> text =
                Comparator.nullsLast(asc ? Comparator.<String>naturalOrder() : Comparator.<String>reverseOrder());
        Comparator<Boolean> flag =
                Comparator.nullsLast(asc ? Comparator.<Boolean>naturalOrder() : Comparator.<Boolean>reverseOrder());
        Comparator<CreditNoteResponse> byValue = switch (sortField(sort)) {
            case "cpono" -> Comparator.<CreditNoteResponse, String>comparing(
                    row -> blankToNull(row.cpoNo()), text);
            case "dispatchdate" -> Comparator.<CreditNoteResponse, String>comparing(
                    row -> blankToNull(row.dispatchDate()), text);
            case "duedate" -> Comparator.<CreditNoteResponse, String>comparing(
                    row -> blankToNull(row.dueDate()), text);
            case "duedateexceeded" -> Comparator.comparing(
                    CreditNoteResponse::dueDateExceeded, flag);
            default -> (a, b) -> 0;
        };
        return byValue
                .thenComparing(CreditNoteResponse::cnNo, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(CreditNoteResponse::id, Comparator.nullsLast(Comparator.naturalOrder()));
    }

    @Transactional(readOnly = true)
    public CreditNoteResponse get(Long id) {
        return toResponseDetail(getCn(id));
    }

    @Transactional(readOnly = true)
    public CreditNoteNextNumberResponse getNextNumber() {
        long next = nextSequence();
        return new CreditNoteNextNumberResponse(buildNo(next), next);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> stats() {
        List<String> excluded = List.of("archived", "deleted");
        Map<String, Object> stats = new LinkedHashMap<>();
        long active = 0;
        // Count only the CURRENT revision of each chain so KPI cards match
        // the list rows (older revisions are surfaced through the Document
        // Workflow dropdown, never as separate list rows).
        for (String status : List.of("draft", "pending approval", "approved", "issued", "adjusted", "refunded", "cancelled")) {
            long count = creditNoteRepository.countCurrentByStatus(status);
            stats.put(status.replace(" ", ""), count);
            active += count;
        }
        stats.put("total", active);
        stats.put("active", active);
        stats.put("archived", creditNoteRepository.countCurrentByStatus("archived"));
        stats.put("deleted", creditNoteRepository.countCurrentByStatus("deleted"));
        stats.put("totalAmt", creditNoteRepository.sumGrandTotalExcluding(excluded));
        return stats;
    }

    public CreditNoteResponse create(CreditNoteRequest request, boolean draft) {
        CreditNote cn = new CreditNote();
        if (request.cnNo() != null && !request.cnNo().isBlank()) {
            if (creditNoteRepository.existsByCnNo(request.cnNo().trim())) {
                throw new BadRequestException("Credit Note number already exists: " + request.cnNo());
            }
            cn.setCnNo(request.cnNo().trim());
        } else {
            cn.setCnNo(buildNo(nextSequence()));
        }
        applyRequest(cn, request);
        if (draft) {
            cn.setStatus("draft");
        } else if (request.status() != null && !request.status().isBlank()) {
            cn.setStatus(normalizeStatus(request.status()));
        } else {
            cn.setStatus("draft");
        }
        recalcTotals(cn);
        CreditNote saved = creditNoteRepository.save(cn);
        addTimeline(saved, "created", "Credit Note created",
                "Credit Note '" + saved.getCnNo() + "' was created.");
        addHistory(saved, "Credit Note", null, saved.getCnNo(), currentUserName());
        return toResponse(saved);
    }

    /**
     * Every edit creates a NEW revision row (BASE(N)); the previous version is
     * never deleted or overwritten. Only the latest revision is editable.
     */
    public CreditNoteResponse update(Long id, CreditNoteRequest request) {
        CreditNote current = getCn(id);
        if (!current.isLatestRevision()) {
            throw new BadRequestException("Only the latest revision can be edited");
        }
        Long baseId = current.getRevisionOf() != null ? current.getRevisionOf() : current.getId();
        int nextRev = maxRevisionOfChain(baseId) + 1;

        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(current);

        CreditNote revision = new CreditNote();
        copyForRevision(revision, current);
        applyRequest(revision, request);
        if (request.status() != null && !request.status().isBlank()) {
            revision.setStatus(normalizeStatus(request.status()));
        }
        recalcTotals(revision);
        revision.setCnNo(RevisionSupport.nextRevisionNumber(
                RevisionSupport.baseNumber(current.getCnNo()), nextRev));
        revision.setRevisionOf(baseId);
        revision.setRevision(nextRev);
        revision.setRevisionDate(java.time.LocalDateTime.now());
        revision.setLatestRevision(true);

        current.setLatestRevision(false);
        creditNoteRepository.save(current);
        CreditNote saved = creditNoteRepository.saveAndFlush(revision);
        addTimeline(saved, "revision", "Revision " + nextRev + " created",
                "Revision '" + saved.getCnNo() + "' created from '" + current.getCnNo()
                        + "' by " + currentUserName() + ".");
        editHistory.recordEdit("credit-note", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponseDetail(saved);
    }

    public CreditNoteResponse delete(Long id) {
        CreditNote cn = getCn(id);
        RevisionSupport.requireLatest(cn.isLatestRevision());
        cn.setStatus("deleted");
        cn.setArchivedAt(LocalDateTime.now());
        addTimeline(cn, "deleted", "Credit Note deleted",
                "Credit Note was moved to trash by " + currentUserName() + ".");
        addHistory(cn, "Status", null, "Deleted", currentUserName());
        return toResponse(creditNoteRepository.save(cn));
    }

    public CreditNoteResponse restore(Long id) {
        CreditNote cn = getCn(id);
        RevisionSupport.requireLatest(cn.isLatestRevision());
        String previous = cn.getStatus();
        String target = ("deleted".equals(previous) || "archived".equals(previous)) ? "draft" : previous;
        cn.setStatus(target);
        cn.setArchivedAt(null);
        addTimeline(cn, "restored", "Credit Note restored",
                "Credit Note was restored by " + currentUserName() + ".");
        addHistory(cn, "Status", titleCase(previous), titleCase(target), currentUserName());
        return toResponse(creditNoteRepository.save(cn));
    }

    public CreditNoteResponse archive(Long id) {
        CreditNote cn = getCn(id);
        RevisionSupport.requireLatest(cn.isLatestRevision());
        cn.setStatus("archived");
        cn.setArchivedAt(LocalDateTime.now());
        addTimeline(cn, "archived", "Credit Note archived",
                "Credit Note was archived by " + currentUserName() + ".");
        addHistory(cn, "Status", null, "Archived", currentUserName());
        return toResponse(creditNoteRepository.save(cn));
    }

    public CreditNoteResponse changeStatus(Long id, String status) {
        CreditNote cn = getCn(id);
        RevisionSupport.requireLatest(cn.isLatestRevision());
        String normalized = normalizeStatus(status);
        if ("deleted".equals(cn.getStatus())) {
            throw new BadRequestException("Cannot change status of a deleted Credit Note");
        }
        cn.setStatus(normalized);
        addTimeline(cn, "status", "Status changed",
                "Status changed to '" + titleCase(normalized) + "' by " + currentUserName() + ".");
        addHistory(cn, "Status", null, titleCase(normalized), currentUserName());
        return toResponse(creditNoteRepository.save(cn));
    }

    public CreditNoteResponse approve(Long id) {
        CreditNote cn = getCn(id);
        RevisionSupport.requireLatest(cn.isLatestRevision());
        if ("deleted".equals(cn.getStatus())) {
            throw new BadRequestException("Cannot approve a deleted Credit Note");
        }
        cn.setStatus("approved");
        addTimeline(cn, "approved", "Credit Note approved",
                "Credit Note approved by " + currentUserName() + ".");
        addHistory(cn, "Status", null, "Approved", currentUserName());
        return toResponse(creditNoteRepository.save(cn));
    }

    public CreditNoteResponse issue(Long id) {
        CreditNote cn = getCn(id);
        cn.setStatus("issued");
        addTimeline(cn, "issued", "Credit Note issued",
                "Credit Note issued by " + currentUserName() + ".");
        addHistory(cn, "Status", null, "Issued", currentUserName());
        return toResponse(creditNoteRepository.save(cn));
    }

    public CreditNoteResponse duplicate(Long id) {
        CreditNote source = getCn(id);
        CreditNote copy = new CreditNote();
        copy.setCnNo(buildNo(nextSequence()));
        copy.setSource(source.getSource());
        copy.setSourceRef(source.getSourceRef());
        copy.setSourceDate(source.getSourceDate());
        copy.setSettlementMethod(source.getSettlementMethod());
        copy.setReason(source.getReason());
        copy.setReasonDetail(source.getReasonDetail());
        copy.setInventoryImpact(source.getInventoryImpact());
        copy.setReturnQty(source.getReturnQty());
        copy.setCompanyName(source.getCompanyName());
        copy.setCompanyGstin(source.getCompanyGstin());
        copy.setCompanyPan(source.getCompanyPan());
        copy.setCompanyState(source.getCompanyState());
        copy.setCompanyAddress(source.getCompanyAddress());
        copy.setClientId(source.getClientId());
        copy.setClientName(source.getClientName());
        copy.setContactPerson(source.getContactPerson());
        copy.setGstin(source.getGstin());
        copy.setEmail(source.getEmail());
        copy.setPhone(source.getPhone());
        copy.setCurrency(source.getCurrency());
        copy.setTerms(source.getTerms());
        copy.setRemarks(source.getRemarks());
        copy.setDiscountPct(source.getDiscountPct());
        copy.setCharges(source.getCharges());
        copy.setStatus("draft");
        copy.setCnDate(LocalDateTime.now());
        for (CreditNoteItem sourceItem : source.getItems()) {
            CreditNoteItem item = new CreditNoteItem();
            copyItem(item, sourceItem);
            copy.addItem(item);
        }
        recalcTotals(copy);
        CreditNote saved = creditNoteRepository.save(copy);
        addTimeline(saved, "created", "Credit Note created",
                "Duplicated from Credit Note '" + source.getCnNo() + "'.");
        addHistory(saved, "Credit Note", null, saved.getCnNo(), currentUserName());
        return toResponse(saved);
    }

    public int bulkArchive(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            CreditNote cn = getCn(id);
            if (!"archived".equals(cn.getStatus()) && !"deleted".equals(cn.getStatus())) {
                cn.setStatus("archived");
                cn.setArchivedAt(LocalDateTime.now());
                addTimeline(cn, "archived", "Credit Note archived",
                        "Credit Note was archived by " + currentUserName() + ".");
                creditNoteRepository.save(cn);
                count++;
            }
        }
        return count;
    }

    public int bulkRestore(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            CreditNote cn = getCn(id);
            if ("archived".equals(cn.getStatus()) || "deleted".equals(cn.getStatus())) {
                cn.setStatus("draft");
                cn.setArchivedAt(null);
                addTimeline(cn, "restored", "Credit Note restored",
                        "Credit Note was restored by " + currentUserName() + ".");
                creditNoteRepository.save(cn);
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
            CreditNote cn = getCn(id);
            if (!"deleted".equals(cn.getStatus())) {
                cn.setStatus("deleted");
                cn.setArchivedAt(LocalDateTime.now());
                addTimeline(cn, "deleted", "Credit Note deleted",
                        "Credit Note was moved to trash by " + currentUserName() + ".");
                addHistory(cn, "Status", null, "Deleted", currentUserName());
                creditNoteRepository.save(cn);
                count++;
            }
        }
        return count;
    }

    public int bulkPermanentDelete(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            CreditNote cn = getCn(id);
            // Remove the whole revision chain (base row + every revision row).
            Long baseId = cn.getRevisionOf() != null ? cn.getRevisionOf() : cn.getId();
            List<CreditNote> chain = new java.util.ArrayList<>();
            creditNoteRepository.findById(baseId).ifPresent(chain::add);
            chain.addAll(creditNoteRepository.findByRevisionOfOrderByRevisionDesc(baseId));
            for (CreditNote c : chain) {
                // Purge related rows so no orphaned attachments/timeline/history/
                // edit-history/revision-snapshots survive the hard delete.
                timelineRepository.deleteByModuleTypeAndModuleId(MODULE, c.getId());
                historyRepository.deleteByModuleTypeAndModuleId(MODULE, c.getId());
                attachmentRepository.deleteByModuleTypeAndModuleId(MODULE, c.getId());
                editHistoryRepository.deleteByModuleTypeAndRecordId(MODULE, c.getId());
                recordRevisionRepository.deleteByModuleTypeAndRecordId(MODULE, c.getId());
            }
            creditNoteRepository.deleteAll(chain);
            count++;
        }
        return count;
    }

    /** Credit Note → Payment Receipt conversion. */
    public ConversionResult convertToPaymentReceipt(Long id) {
        CreditNote cn = getCn(id);
        if (cn.getConvertedToPr() != null && !cn.getConvertedToPr().isBlank()) {
            // Duplicate-conversion protection: never create a second Payment
            // Receipt. Return the existing one so the user can open it.
            PaymentReceipt existing = paymentReceiptRepository.findByReceiptNo(cn.getConvertedToPr()).orElse(null);
            if (existing != null) {
                return new ConversionResult("payment-receipt", existing.getId(), existing.getReceiptNo(),
                        "A Payment Receipt has already been created from this Credit Note.");
            }
            throw new BadRequestException("A Payment Receipt has already been created from this Credit Note.");
        }
        PaymentReceipt receipt = new PaymentReceipt();
        receipt.setReceiptNo(buildPrNumber());
        receipt.setPaymentDate(LocalDateTime.now());
        receipt.setStatus("draft");
        receipt.setSource("credit-note");
        receipt.setInvoiceRef(cn.getSourceRef() != null && !cn.getSourceRef().isBlank() ? cn.getSourceRef() : cn.getCnNo());
        receipt.setCompanyName(cn.getCompanyName());
        receipt.setCompanyGstin(cn.getCompanyGstin());
        receipt.setCompanyPan(cn.getCompanyPan());
        receipt.setCompanyState(cn.getCompanyState());
        receipt.setCompanyAddress(cn.getCompanyAddress());
        receipt.setClientId(cn.getClientId());
        receipt.setClientName(cn.getClientName());
        receipt.setContactPerson(cn.getContactPerson());
        receipt.setEmail(cn.getEmail());
        receipt.setPhone(cn.getPhone());
        receipt.setGstin(cn.getGstin());
        receipt.setAmount(cn.getRefundAmount() != null ? cn.getRefundAmount() : nvl(cn.getGrandTotal(), BigDecimal.ZERO));
        receipt.setRemarks("Payment receipt generated from Credit Note " + cn.getCnNo());
        PaymentReceipt savedPr = paymentReceiptRepository.save(receipt);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, cn.getId(), "payment-receipt", savedPr.getId());
        addTargetTimeline("payment-receipt", savedPr.getId(), "created", "Payment Receipt created",
                "Payment Receipt '" + savedPr.getReceiptNo() + "' created from Credit Note '" + cn.getCnNo() + "'.");
        addTargetHistory("payment-receipt", savedPr.getId(), "Payment Receipt", savedPr.getReceiptNo(), currentUserName());

        cn.setConvertedToPr(savedPr.getReceiptNo());
        addTimeline(cn, "converted", "Converted to Payment Receipt",
                "Credit Note converted to Payment Receipt " + savedPr.getReceiptNo() + ".");
        addHistory(cn, "Status", null, "Converted", currentUserName());
        creditNoteRepository.save(cn);
        return new ConversionResult("payment-receipt", savedPr.getId(), savedPr.getReceiptNo(), "Payment Receipt " + savedPr.getReceiptNo() + " created from Credit Note " + cn.getCnNo());
    }

    @Transactional(readOnly = true)
    public List<CreditNoteResponse> export(String search, String status, String client, String reason,
                                           String dateFrom, String dateTo,
                                           BigDecimal minAmount, BigDecimal maxAmount) {
        Specification<CreditNote> spec = buildSpecification(search, status, client, reason,
                dateFrom, dateTo, minAmount, maxAmount);
        List<CreditNote> rows = creditNoteRepository.findAll(spec);
        Map<Long, LinkInfo> links = resolveLinks(rows);
        return rows.stream().map(cn -> toResponse(cn, List.of(), links.get(cn.getId()))).toList();
    }

    @Transactional(readOnly = true)
    public String buildCsv(List<CreditNoteResponse> cns) {
        StringBuilder sb = new StringBuilder();
        // The linked-document columns are part of the export too, so the CSV holds
        // exactly what the table shows.
        sb.append("Credit Note No,Date,Client,Reason,Status,Items,Amount,CPO No,Dispatch Date,"
                + "Destination Reached Date,Terms,Due Date,Due Date Exceeded,Created\n");
        for (CreditNoteResponse c : cns) {
            sb.append(escapeCsv(c.cnNo())).append(',')
              .append(escapeCsv(c.date())).append(',')
              .append(escapeCsv(c.clientName())).append(',')
              .append(escapeCsv(c.reason())).append(',')
              .append(escapeCsv(c.status())).append(',')
              .append(c.itemsCount() == null ? "" : c.itemsCount()).append(',')
              .append(c.grandTotal() == null ? "" : c.grandTotal().toPlainString()).append(',')
              .append(escapeCsv(c.cpoNo())).append(',')
              .append(escapeCsv(c.dispatchDate())).append(',')
              .append(escapeCsv(c.destinationReachedDate())).append(',')
              .append(escapeCsv(c.terms())).append(',')
              .append(escapeCsv(c.dueDate())).append(',')
              .append(escapeCsv(Boolean.TRUE.equals(c.dueDateExceeded()) ? "Overdue" : "Not Overdue")).append(',')
              .append(escapeCsv(c.createdAt())).append('\n');
        }
        return sb.toString();
    }

    @Transactional(readOnly = true)
    public List<SalesTimelineResponse> getTimeline(Long id) {
        getCn(id);
        return timelineRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, id)
                .stream().map(this::timelineResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SalesHistoryResponse> getHistory(Long id) {
        getCn(id);
        return historyRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, id)
                .stream().map(this::historyResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SalesAttachmentResponse> getAttachments(Long id) {
        getCn(id);
        return attachmentRepository.findByModuleTypeAndModuleIdOrderByUploadedAtAsc(MODULE, id)
                .stream().map(this::attachmentResponse).toList();
    }

    public SalesAttachmentResponse addAttachment(Long id, MultipartFile file) {
        CreditNote cn = getCn(id);
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
                file.getOriginalFilename(), "Credit Note", id,
                cn.getCnNo(), cn.getClientId(), cn.getClientName(),
                baseUrl + "/v1/files/" + storedName,
                file.getContentType(), file.getSize(),
                currentUserName(), DocumentVisibility.TEAM_ONLY);
        return attachmentResponse(saved);
    }

    public void deleteAttachment(Long id, Long attachmentId) {
        getCn(id);
        SalesAttachment attachment = attachmentRepository.findById(attachmentId)
                .filter(a -> MODULE.equals(a.getModuleType()) && id.equals(a.getModuleId()))
                .orElseThrow(() -> new ResourceNotFoundException("Attachment not found with id: " + attachmentId));
        attachmentRepository.delete(attachment);
    }

    private void copyForRevision(CreditNote copy, CreditNote source) {
        org.springframework.beans.BeanUtils.copyProperties(source, copy,
                "id", "items", "timeline", "revisionOf", "revision", "revisionDate", "latestRevision", "createdAt", "updatedAt", "archivedAt");
        for (CreditNoteItem sourceItem : source.getItems()) {
            CreditNoteItem item = new CreditNoteItem();
            org.springframework.beans.BeanUtils.copyProperties(sourceItem, item,
                    "id", "creditNote", "createdAt");
            copy.addItem(item);
        }
    }

    private int maxRevisionOfChain(Long baseId) {
        return creditNoteRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .mapToInt(CreditNote::getRevision)
                .max()
                .orElse(0);
    }

    /** Detail response — also carries the full revision chain for the UI. */
    private CreditNoteResponse toResponseDetail(CreditNote cn) {
        return toResponse(cn, revisionChain(cn), resolveLinks(List.of(cn)).get(cn.getId()));
    }

    private List<RevisionInfo> revisionChain(CreditNote cn) {
        Long baseId = cn.getRevisionOf() != null ? cn.getRevisionOf() : cn.getId();
        List<RevisionInfo> chain = new ArrayList<>();
        creditNoteRepository.findById(baseId).ifPresent(q -> chain.add(revisionInfo(q)));
        creditNoteRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .sorted(java.util.Comparator.comparingInt(CreditNote::getRevision))
                .forEach(q -> chain.add(revisionInfo(q)));
        return chain;
    }

    private RevisionInfo revisionInfo(CreditNote cn) {
        return new RevisionInfo(
                cn.getId(),
                cn.getCnNo(),
                cn.getRevision(),
                cn.getStatus(),
                cn.getRevisionDate() == null
                        ? (cn.getCreatedAt() == null ? null : cn.getCreatedAt().toString())
                        : cn.getRevisionDate().toString(),
                cn.isLatestRevision());
    }

    /** When the latest revision is deleted, the previous one becomes latest. */
    private void promotePreviousRevision(CreditNote removed) {
        if (!removed.isLatestRevision()) {
            return;
        }
        Long baseId = removed.getRevisionOf() != null ? removed.getRevisionOf() : removed.getId();
        // Highest remaining revision row first (revision >= 1).
        creditNoteRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .filter(q -> !q.getId().equals(removed.getId()))
                .filter(q -> !"deleted".equals(q.getStatus()))
                .findFirst()
                .ifPresentOrElse(q -> {
                    q.setLatestRevision(true);
                    creditNoteRepository.save(q);
                    removed.setLatestRevision(false);
                    creditNoteRepository.save(removed);
                }, () -> creditNoteRepository.findById(baseId).ifPresent(q -> {
                    // Fall back to the base row (revision 0) when no revision rows remain.
                    if (!q.getId().equals(removed.getId()) && !"deleted".equals(q.getStatus())) {
                        q.setLatestRevision(true);
                        creditNoteRepository.save(q);
                        removed.setLatestRevision(false);
                        creditNoteRepository.save(removed);
                    }
                }));
    }

    /** List/export response - carries no revision chain (avoids N+1). */
    private CreditNoteResponse toResponse(CreditNote entity) {
        return toResponse(entity, List.of(), resolveLinks(List.of(entity)).get(entity.getId()));
    }

    private CreditNoteResponse toResponse(CreditNote cn, List<RevisionInfo> revisions) {
        return toResponse(cn, revisions, resolveLinks(List.of(cn)).get(cn.getId()));
    }

    private CreditNoteResponse toResponse(CreditNote cn, List<RevisionInfo> revisions, LinkInfo links) {
        List<CreditNoteItemResponse> itemResponses = cn.getItems().stream().map(this::itemResponse).toList();
        BigDecimal totalQty = itemResponses.stream()
                .map(CreditNoteItemResponse::qty)
                .filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new CreditNoteResponse(
                cn.getId(), cn.getCnNo(),
                cn.getCnDate() == null ? null : cn.getCnDate().toLocalDate().toString(),
                cn.getStatus(), cn.getSource(), cn.getSourceRef(),
                cn.getSourceDate() == null ? null : cn.getSourceDate().toLocalDate().toString(),
                links == null ? null : links.cpoNo(),
                links == null ? null : links.dispatchDate(),
                cn.getDispatchDateOverride() == null
                        ? null : cn.getDispatchDateOverride().toLocalDate().toString(),
                links == null ? null : links.resolvedDispatchDate(),
                cn.getDestinationReachedDate() == null ? null : cn.getDestinationReachedDate().toLocalDate().toString(),
                links == null ? null : links.dueDate(),
                cn.getDueDateOverride() == null
                        ? null : cn.getDueDateOverride().toLocalDate().toString(),
                links == null ? null : links.resolvedDueDate(),
                links != null && links.dueDateExceeded(),
                cn.getSettlementMethod(), cn.getReason(),
                cn.getRefundAmount(), cn.getReturnQty(), cn.getReasonDetail(), cn.getInventoryImpact(),
                cn.getCompanyName(), cn.getCompanyGstin(), cn.getCompanyPan(), cn.getCompanyState(),
                cn.getCompanyAddress(),
                cn.getClientId(), cn.getClientName(), cn.getContactPerson(),
                cn.getGstin(),
                cn.getTaxType(), cn.getHsnView(), cn.getEmail(), cn.getPhone(),
                cn.getCurrency(), cn.getTerms(), cn.getRemarks(),
                cn.getSubTotal(), cn.getDiscount(), cn.getDiscountPct(),
                cn.getCgstTotal(), cn.getSgstTotal(), cn.getTaxTotal(),
                cn.getCharges(), cn.getGrandTotal(),
                itemResponses.size(), totalQty, cn.getConvertedToPr(),
                cn.getCnDate() == null
                        ? (cn.getCreatedAt() == null ? null : cn.getCreatedAt().toLocalDate().toString())
                        : cn.getCnDate().toLocalDate().toString(),
                cn.getCreatedAt() == null ? null : cn.getCreatedAt().toString(),
                cn.getUpdatedAt() == null ? null : cn.getUpdatedAt().toString(),
                cn.getArchivedAt() == null ? null : cn.getArchivedAt().toString(),
                itemResponses,
                attachmentRepository.findByModuleTypeAndModuleIdOrderByUploadedAtAsc(MODULE, cn.getId())
                        .stream().map(this::attachmentResponse).toList(),
                timelineRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, cn.getId())
                        .stream().map(this::timelineResponse).toList(),
                historyRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, cn.getId())
                        .stream().map(this::historyResponse).toList(),
                cn.getRevision(),
                cn.getRevisionOf(),
                cn.isLatestRevision(),
                cn.getRevisionDate() == null ? null : cn.getRevisionDate().toString(),
                revisions
        );
    }

    private CreditNoteItemResponse itemResponse(CreditNoteItem item) {
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
        return new CreditNoteItemResponse(item.getId(), item.getDescription(), item.getSku(), item.getDrawingNo(), item.getMaterial(), item.getDelivery(), item.getHsn(),
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

    // ===== Linked-document columns ==========================================
    //
    // CPO No. / Dispatch Date / Due Date / Due Date Exceeded are NOT stored on
    // the credit note: they are facts the linked documents already own, so they
    // are resolved from those documents (the source document the note names,
    // and the relationships that document records). Nothing is copied into the
    // credit note and nothing is invented — a note with no such relationship
    // simply has no value to show.
    //
    //   CPO No.       the Customer Purchase Order (sales order, whose own list
    //                 and view label it "CPO No") the note traces back to
    //   Dispatch Date the linked Delivery Challan's dispatch date
    //   Due Date      the linked invoice's due date, else the linked CPO's
    //                 delivery date (the value the CPO module itself labels
    //                 "Due Date")
    //   Due Date Exceeded  due date passed AND the amount is still outstanding
    //
    // Dispatch Date and Due Date additionally honour the note's OWN manual
    // override columns ({@code dispatch_date_override} / {@code due_date_override}):
    // when the linked document records nothing (or records something the user
    // must correct), the value entered on the credit note is the one shown — and
    // for the due date it is also the one the derived overdue flag is calculated
    // from. A null override always means "resolve it from the link", so nothing
    // changes for notes nobody overrode, and the linked documents are never
    // written to. CPO No. and Due Date Exceeded have no override by design: the
    // first IS the document relationship, the second is a calculation.

    /**
     * Linked-document values a credit note does not store itself.
     *
     * <p>{@code dispatchDate} / {@code dueDate} are the EFFECTIVE values the
     * table, the export and the overdue flag use — the note's own override when
     * it has one, otherwise the resolved one. {@code resolvedDispatchDate} /
     * {@code resolvedDueDate} are always the AUTOMATIC values from the linked
     * documents, so the form can show the linked date again the moment an
     * override is cleared without a re-read.
     */
    private record LinkInfo(String cpoNo, String dispatchDate, String resolvedDispatchDate,
                            String dueDate, String resolvedDueDate, boolean dueDateExceeded) {}

    /**
     * Resolves the linked-document values for a whole page of credit notes.
     *
     * <p>Every distinct source document of the page is fetched in ONE batched
     * query per document type, then one further batch resolves the relationships
     * those documents carry (CPO reference, converted-to references, exact
     * reverse links by credit-note number). The cost therefore stays bounded by
     * the number of documents on the page rather than growing per row.
     */
    private Map<Long, LinkInfo> resolveLinks(List<CreditNote> notes) {
        if (notes == null || notes.isEmpty()) {
            return Map.of();
        }
        // ---- the source documents the page points at ----
        Set<String> invoiceRefs = new LinkedHashSet<>();
        Set<String> dcRefs = new LinkedHashSet<>();
        Set<String> soRefs = new LinkedHashSet<>();
        Set<String> piRefs = new LinkedHashSet<>();
        Set<String> qtnRefs = new LinkedHashSet<>();
        Set<String> scRefs = new LinkedHashSet<>();
        Set<String> cnNos = new LinkedHashSet<>();
        for (CreditNote cn : notes) {
            if (cn.getCnNo() != null) {
                cnNos.add(cn.getCnNo());
            }
            String ref = blankToNull(cn.getSourceRef());
            if (ref == null) {
                continue;
            }
            switch (sourceCode(cn.getSource())) {
                case "inv" -> invoiceRefs.add(ref);
                case "dc" -> dcRefs.add(ref);
                case "so" -> soRefs.add(ref);
                case "pi" -> piRefs.add(ref);
                case "quotation" -> qtnRefs.add(ref);
                case "sales-contract" -> scRefs.add(ref);
                default -> { }
            }
        }

        Map<String, Invoice> invoices = new HashMap<>();
        Map<String, DeliveryChallan> challans = new HashMap<>();
        Map<String, SalesOrder> orders = new HashMap<>();
        Map<String, ProformaInvoice> proformas = new HashMap<>();

        // Walk the document chain until it stops yielding new documents (a note
        // may reach its CPO through invoice → delivery challan, proforma invoice
        // → CPO, and so on). Each pass loads ONLY the documents not loaded yet,
        // so the whole page costs at most four queries per hop, and the loop ends
        // as soon as no new reference appears.
        for (int hop = 0; hop < 4; hop++) {
            Set<String> invoiceNos = new LinkedHashSet<>(invoiceRefs);
            Set<String> dcNos = new LinkedHashSet<>(dcRefs);
            Set<String> soNos = new LinkedHashSet<>(soRefs);
            Set<String> piNos = new LinkedHashSet<>(piRefs);
            for (Invoice invoice : invoices.values()) {
                addIfPresent(invoiceNos, invoice.getInvoiceNo());
                switch (sourceCode(invoice.getSource())) {
                    case "so" -> addIfPresent(soNos, invoice.getSourceRef());
                    case "dc" -> addIfPresent(dcNos, invoice.getSourceRef());
                    case "pi" -> addIfPresent(piNos, invoice.getSourceRef());
                    default -> { }
                }
            }
            for (DeliveryChallan dc : challans.values()) {
                addIfPresent(dcNos, dc.getDcNo());
                addIfPresent(soNos, dc.getSoRef());
                addIfPresent(invoiceNos, dc.getConvertedToInvoice());
            }
            for (SalesOrder so : orders.values()) {
                addIfPresent(soNos, so.getSoNo());
                addIfPresent(invoiceNos, so.getConvertedToInv());
            }
            for (ProformaInvoice pi : proformas.values()) {
                addIfPresent(piNos, pi.getPiNo());
                addIfPresent(invoiceNos, pi.getConvertedToInvoice());
            }
            boolean grew = loadMissing(invoices, invoiceNos,
                    invoiceRepository::findCurrentByInvoiceNoIn, Invoice::getInvoiceNo);
            grew |= loadMissing(challans, dcNos,
                    deliveryChallanRepository::findCurrentByDcNoIn, DeliveryChallan::getDcNo);
            grew |= loadMissing(orders, soNos,
                    salesOrderRepository::findCurrentBySoNoIn, SalesOrder::getSoNo);
            grew |= loadMissing(proformas, piNos,
                    proformaInvoiceRepository::findCurrentByPiNoIn, ProformaInvoice::getPiNo);
            if (!grew) {
                break;
            }
        }

        // The invoice numbers the page can reach, used for the due date and for
        // the delivery challan that shipped against them.
        Set<String> invoiceNos = new LinkedHashSet<>(invoiceRefs);
        invoices.values().forEach(invoice -> addIfPresent(invoiceNos, invoice.getInvoiceNo()));
        orders.values().forEach(so -> addIfPresent(invoiceNos, so.getConvertedToInv()));
        challans.values().forEach(dc -> addIfPresent(invoiceNos, dc.getConvertedToInvoice()));
        proformas.values().forEach(pi -> addIfPresent(invoiceNos, pi.getConvertedToInvoice()));
        loadMissing(invoices, invoiceNos, invoiceRepository::findCurrentByInvoiceNoIn, Invoice::getInvoiceNo);
        Map<String, DeliveryChallan> challanByInvoice = batchLookup(invoiceNos,
                deliveryChallanRepository::findCurrentByConvertedToInvoiceIn,
                DeliveryChallan::getConvertedToInvoice);
        mergeMissing(challans, challanByInvoice);

        // A delivery challan may already carry the CPO that was not reachable
        // through the invoice, so resolve the CPO references once more.
        Set<String> soNos = new LinkedHashSet<>(soRefs);
        challans.values().forEach(dc -> addIfPresent(soNos, dc.getSoRef()));
        orders.values().forEach(so -> addIfPresent(soNos, so.getSoNo()));
        loadMissing(orders, soNos, salesOrderRepository::findCurrentBySoNoIn, SalesOrder::getSoNo);

        // The Delivery Challan that shipped each CPO (its own so_ref points back
        // at the order). This is how a credit note reaches its dispatch date
        // when its own chain does not name a challan — a CPO that has already
        // been delivered is dispatched by definition of that record.
        Set<String> cpoNos = new LinkedHashSet<>();
        orders.values().forEach(so -> addIfPresent(cpoNos, so.getSoNo()));
        Map<String, DeliveryChallan> challanBySoRef = new HashMap<>();
        if (!cpoNos.isEmpty()) {
            for (DeliveryChallan dc : deliveryChallanRepository.findCurrentBySoRefIn(cpoNos)) {
                String key = blankToNull(dc.getSoRef());
                if (key == null) {
                    continue;
                }
                DeliveryChallan current = challanBySoRef.get(key);
                if (current == null || preferredChallan(dc, current)) {
                    challanBySoRef.put(key, dc);
                }
            }
        }
        mergeMissing(challans, challanBySoRef);

        // Exact reverse links ("this credit note was created from me") — a match
        // is always a real relationship because the credit-note number is unique.
        Map<String, SalesOrder> orderByCn = batchLookup(cnNos,
                salesOrderRepository::findCurrentByConvertedToCnIn, SalesOrder::getConvertedToCn);
        Map<String, DeliveryChallan> challanByCn = batchLookup(cnNos,
                deliveryChallanRepository::findCurrentByConvertedToCnIn, DeliveryChallan::getConvertedToCn);
        mergeMissing(challans, challanByCn);
        Map<String, SalesOrder> orderByInvoice = batchLookup(invoiceNos,
                salesOrderRepository::findCurrentByConvertedToInvIn, SalesOrder::getConvertedToInv);
        Map<String, SalesOrder> orderByQtnRef = batchLookup(qtnRefs,
                salesOrderRepository::findCurrentByQtnRefIn, SalesOrder::getQtnRef);
        Map<String, SalesOrder> orderByScRef = batchLookup(scRefs,
                salesOrderRepository::findCurrentByScRefIn, SalesOrder::getScRef);
        mergeMissing(orders, orderByInvoice);
        mergeMissing(orders, orderByQtnRef);
        mergeMissing(orders, orderByScRef);

        LinkLookups lookups = new LinkLookups(invoices, challans, orders, proformas,
                orderByCn, challanByCn, orderByInvoice, orderByQtnRef, orderByScRef,
                challanByInvoice, challanBySoRef);
        Map<Long, LinkInfo> resolved = new HashMap<>();
        for (CreditNote cn : notes) {
            resolved.put(cn.getId(), linkInfo(cn, lookups));
        }
        return resolved;
    }

    /** The batched lookups one page's credit notes resolve their links from. */
    private record LinkLookups(
            Map<String, Invoice> invoices,
            Map<String, DeliveryChallan> challans,
            Map<String, SalesOrder> orders,
            Map<String, ProformaInvoice> proformas,
            Map<String, SalesOrder> orderByCn,
            Map<String, DeliveryChallan> challanByCn,
            Map<String, SalesOrder> orderByInvoice,
            Map<String, SalesOrder> orderByQtnRef,
            Map<String, SalesOrder> orderByScRef,
            Map<String, DeliveryChallan> challanByInvoice,
            Map<String, DeliveryChallan> challanBySoRef) {}

    /** Resolves the linked-document values of ONE credit note from the batches above. */
    private LinkInfo linkInfo(CreditNote cn, LinkLookups lookups) {
        Map<String, Invoice> invoices = lookups.invoices();
        Map<String, DeliveryChallan> challans = lookups.challans();
        Map<String, SalesOrder> orders = lookups.orders();
        Map<String, ProformaInvoice> proformas = lookups.proformas();
        Map<String, SalesOrder> orderByCn = lookups.orderByCn();
        Map<String, DeliveryChallan> challanByCn = lookups.challanByCn();
        Map<String, SalesOrder> orderByInvoice = lookups.orderByInvoice();
        Map<String, SalesOrder> orderByQtnRef = lookups.orderByQtnRef();
        Map<String, SalesOrder> orderByScRef = lookups.orderByScRef();
        Map<String, DeliveryChallan> challanByInvoice = lookups.challanByInvoice();

        String code = sourceCode(cn.getSource());
        String ref = blankToNull(cn.getSourceRef());

        Invoice invoice = "inv".equals(code) && ref != null ? invoices.get(ref) : null;
        DeliveryChallan challan = "dc".equals(code) && ref != null ? challans.get(ref) : null;
        SalesOrder order = "so".equals(code) && ref != null ? orders.get(ref) : null;
        ProformaInvoice proforma = "pi".equals(code) && ref != null ? proformas.get(ref) : null;
        if ("pi".equals(code) && proforma != null) {
            // A proforma invoice points at its own source document.
            if ("so".equals(sourceCode(proforma.getSource()))) {
                order = blankToNull(proforma.getSourceRef()) == null ? null : orders.get(proforma.getSourceRef());
            } else if ("dc".equals(sourceCode(proforma.getSource()))) {
                challan = blankToNull(proforma.getSourceRef()) == null ? null : challans.get(proforma.getSourceRef());
            }
        }

        // ---- CPO (Customer Purchase Order) ----
        if (order == null && challan != null) {
            order = blankToNull(challan.getSoRef()) == null ? null : orders.get(challan.getSoRef());
        }
        if (order == null && invoice != null) {
            order = orderByInvoice.get(invoice.getInvoiceNo());
            if (order == null && "so".equals(sourceCode(invoice.getSource()))) {
                order = blankToNull(invoice.getSourceRef()) == null ? null : orders.get(invoice.getSourceRef());
            }
            if (order == null && "dc".equals(sourceCode(invoice.getSource()))) {
                DeliveryChallan viaInvoice = blankToNull(invoice.getSourceRef()) == null ? null : challans.get(invoice.getSourceRef());
                order = viaInvoice == null || blankToNull(viaInvoice.getSoRef()) == null
                        ? null : orders.get(viaInvoice.getSoRef());
            }
            if (order == null && "pi".equals(sourceCode(invoice.getSource()))) {
                ProformaInvoice viaInvoice = blankToNull(invoice.getSourceRef()) == null ? null : proformas.get(invoice.getSourceRef());
                if (viaInvoice != null && "so".equals(sourceCode(viaInvoice.getSource()))) {
                    order = blankToNull(viaInvoice.getSourceRef()) == null ? null : orders.get(viaInvoice.getSourceRef());
                }
            }
        }
        if (order == null && proforma != null) {
            order = blankToNull(proforma.getSourceRef()) == null ? null : orders.get(proforma.getSourceRef());
        }
        if (order == null && "quotation".equals(code) && ref != null) {
            order = orderByQtnRef.get(ref);
        }
        if (order == null && "sales-contract".equals(code) && ref != null) {
            order = orderByScRef.get(ref);
        }
        if (order == null && cn.getCnNo() != null) {
            // Exact reverse link: the CPO that recorded THIS credit note number.
            order = orderByCn.get(cn.getCnNo());
        }

        // ---- Delivery Challan (dispatch date) ----
        if (challan == null && cn.getCnNo() != null) {
            challan = challanByCn.get(cn.getCnNo());
        }
        String invoiceNo = invoice != null ? invoice.getInvoiceNo() : null;
        if (invoiceNo == null && order != null) {
            invoiceNo = blankToNull(order.getConvertedToInv());
        }
        if (challan == null && invoiceNo != null) {
            challan = challanByInvoice.get(invoiceNo);
        }
        if (challan == null && order != null && order.getSoNo() != null) {
            // The challan that shipped this CPO (its so_ref points back at it).
            challan = lookups.challanBySoRef().get(order.getSoNo());
        }
        if (invoice == null && invoiceNo != null) {
            invoice = invoices.get(invoiceNo);
        }

        // ---- Dispatch date ----
        // The linked challan owns the dispatch date; the note's own override,
        // when it has one, wins over it (the challan is never modified). Both are
        // reported: the effective value for display/export, the resolved one so
        // the form can fall back to it when an override is cleared.
        String resolvedDispatchDate = challan == null || challan.getDispatchDate() == null
                ? null : challan.getDispatchDate().toLocalDate().toString();
        String dispatchDate = cn.getDispatchDateOverride() == null
                ? resolvedDispatchDate : cn.getDispatchDateOverride().toLocalDate().toString();

        // ---- Due date ----
        // The note's own override IS the authoritative due date when one is
        // saved: it REPLACES the resolved value here, so the list, the detail
        // page, the CSV export and the derived overdue flag below all read one
        // and the same date. Null override = the invoice's due date, else the
        // CPO's delivery date.
        LocalDate resolvedDueDate = null;
        if (invoice != null && invoice.getDueDate() != null) {
            resolvedDueDate = invoice.getDueDate().toLocalDate();
        } else if (order != null && order.getDeliveryDate() != null) {
            // The CPO module presents its delivery date as the order's due date.
            resolvedDueDate = order.getDeliveryDate().toLocalDate();
        }
        LocalDate dueDate = cn.getDueDateOverride() != null
                ? cn.getDueDateOverride().toLocalDate() : resolvedDueDate;

        // ---- Due Date Exceeded ----
        // Exceeded only when the due date has passed AND the amount is still
        // outstanding: the credit is not settled yet (not refunded/adjusted/
        // cancelled/archived/deleted and never converted to a payment receipt),
        // it carries a positive amount, and its source invoice is not fully paid.
        // It is measured against the AUTHORITATIVE due date above — the note's own
        // override when one is saved — so overriding the date moves the flag with
        // it instead of letting the two disagree, and the flag itself is never
        // user-settable.
        boolean settled = isSettledCreditNote(cn);
        boolean sourceFullyPaid = invoice != null && isFullyPaidInvoice(invoice);
        boolean positiveAmount = cn.getGrandTotal() != null && cn.getGrandTotal().signum() > 0;
        boolean exceeded = dueDate != null
                && dueDate.isBefore(LocalDate.now())
                && positiveAmount
                && !settled
                && !sourceFullyPaid;

        return new LinkInfo(
                order == null ? null : order.getSoNo(),
                dispatchDate,
                resolvedDispatchDate,
                dueDate == null ? null : dueDate.toString(),
                resolvedDueDate == null ? null : resolvedDueDate.toString(),
                exceeded);
    }

    /** A credit note whose credit is already settled is never overdue. */
    private boolean isSettledCreditNote(CreditNote cn) {
        String status = cn.getStatus() == null ? "" : cn.getStatus().trim().toLowerCase();
        if (List.of("refunded", "adjusted", "cancelled", "archived", "deleted").contains(status)) {
            return true;
        }
        return blankToNull(cn.getConvertedToPr()) != null;
    }

    /** A fully paid (or no longer collectable) source invoice leaves nothing outstanding. */
    private boolean isFullyPaidInvoice(Invoice invoice) {
        String payment = invoice.getPaymentStatus() == null ? "" : invoice.getPaymentStatus().trim().toLowerCase();
        if ("paid".equals(payment)) {
            return true;
        }
        String status = invoice.getStatus() == null ? "" : invoice.getStatus().trim().toLowerCase();
        return List.of("paid", "cancelled", "archived", "deleted").contains(status);
    }

    /** Normalises a stored source value (short code or legacy label) to its ERP code. */
    private String sourceCode(String source) {
        String value = source == null ? "" : source.trim().toLowerCase();
        return switch (value) {
            case "inv", "invoice" -> "inv";
            case "dc", "delivery-challan", "delivery challan", "challan" -> "dc";
            case "so", "sales-order", "sales order", "cpo" -> "so";
            case "pi", "proforma-invoice", "proforma invoice", "proforma" -> "pi";
            case "quotation" -> "quotation";
            case "sales-contract", "sales contract", "contract" -> "sales-contract";
            default -> "";
        };
    }

    private void addIfPresent(Collection<String> target, String value) {
        String normalized = blankToNull(value);
        if (normalized != null) {
            target.add(normalized);
        }
    }

    /** ONE query for a whole set of keys (no query at all for an empty set). */
    private <T, K> Map<K, T> batchLookup(Collection<String> keys,
                                         Function<Collection<String>, List<T>> loader,
                                         Function<T, K> keyFn) {
        Map<K, T> result = new HashMap<>();
        if (keys == null || keys.isEmpty()) {
            return result;
        }
        for (T row : loader.apply(keys)) {
            K key = keyFn.apply(row);
            if (key != null) {
                result.putIfAbsent(key, row);
            }
        }
        return result;
    }

    /**
     * Loads the keys that are NOT in {@code target} yet, in one query, and
     * reports whether anything new arrived (the chain walk stops when nothing
     * does).
     */
    private <T, K> boolean loadMissing(Map<K, T> target, Collection<String> keys,
                                       Function<Collection<String>, List<T>> loader,
                                       Function<T, K> keyFn) {
        if (keys == null || keys.isEmpty()) {
            return false;
        }
        Set<String> pending = new LinkedHashSet<>();
        for (String key : keys) {
            String normalized = blankToNull(key);
            if (normalized != null && !target.containsKey(normalized)) {
                pending.add(normalized);
            }
        }
        if (pending.isEmpty()) {
            return false;
        }
        Map<K, T> loaded = batchLookup(pending, loader, keyFn);
        mergeMissing(target, loaded);
        return !loaded.isEmpty();
    }

    /** Adds entries the target does not have yet, keeping the first value seen. */
    private <T, K> void mergeMissing(Map<K, T> target, Map<K, T> extra) {
        if (extra == null || extra.isEmpty()) {
            return;
        }
        extra.forEach(target::putIfAbsent);
    }

    /**
     * Which of two challans of the same CPO answers for the dispatch date: the
     * one that actually records a dispatch date wins, then the newest record.
     */
    private boolean preferredChallan(DeliveryChallan candidate, DeliveryChallan current) {
        boolean candidateDated = candidate.getDispatchDate() != null;
        boolean currentDated = current.getDispatchDate() != null;
        if (candidateDated != currentDated) {
            return candidateDated;
        }
        long candidateId = candidate.getId() == null ? 0L : candidate.getId();
        long currentId = current.getId() == null ? 0L : current.getId();
        return candidateId > currentId;
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private CreditNote getCn(Long id) {
        return creditNoteRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Credit Note not found with id: " + id));
    }

    private void applyRequest(CreditNote cn, CreditNoteRequest request) {
        cn.setCnDate(parseDate(request.cnDate()));
        cn.setSource(request.source());
        cn.setSourceRef(request.sourceRef());
        cn.setSourceDate(parseDate(request.sourceDate()));
        cn.setDestinationReachedDate(parseDate(request.destinationReachedDate()));
        // The note's own manual overrides of the linked-document dates. An
        // absent/blank value clears the override (parseDate answers null), which
        // is exactly the "fall back to the linked document" state — the linked
        // documents themselves are never written to.
        cn.setDispatchDateOverride(parseDate(request.dispatchDateOverride()));
        cn.setDueDateOverride(parseDate(request.dueDateOverride()));
        cn.setSettlementMethod(request.settlementMethod());
        cn.setReason(request.reason());
        cn.setRefundAmount(request.refundAmount() == null ? BigDecimal.ZERO : request.refundAmount());
        cn.setReturnQty(request.returnQty() == null ? BigDecimal.ZERO : request.returnQty());
        cn.setReasonDetail(request.reasonDetail());
        cn.setInventoryImpact(request.inventoryImpact());
        cn.setCompanyName(request.companyName());
        cn.setCompanyGstin(request.companyGstin());
        cn.setCompanyPan(request.companyPan());
        cn.setCompanyState(request.companyState());
        cn.setCompanyAddress(request.companyAddress());
        cn.setClientId(request.clientId());
        cn.setClientName(request.clientName());
        cn.setContactPerson(request.contactPerson());
        cn.setGstin(request.gstin());
        cn.setTaxType(request.taxType());
        cn.setHsnView(request.hsnView());
        cn.setEmail(request.email());
        cn.setPhone(request.phone());
        cn.setCurrency(request.currency());
        cn.setTerms(request.terms());
        cn.setRemarks(request.remarks());
        cn.setDiscountPct(request.discountPct() == null ? BigDecimal.ZERO : request.discountPct());
        cn.setCharges(request.charges() == null ? BigDecimal.ZERO : request.charges());
        cn.getItems().clear();
        if (request.items() != null) {
            for (CreditNoteItemRequest itemRequest : request.items()) {
                if (itemRequest == null) {
                    continue;
                }
                CreditNoteItem item = new CreditNoteItem();
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
                cn.addItem(item);
            }
        }
    }

    private void copyItem(CreditNoteItem target, CreditNoteItem source) {
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

    private void recalcTotals(CreditNote cn) {
        BigDecimal subTotal = BigDecimal.ZERO;
        BigDecimal cgstTotal = BigDecimal.ZERO;
        BigDecimal sgstTotal = BigDecimal.ZERO;
        for (CreditNoteItem item : cn.getItems()) {
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
        cn.setSubTotal(subTotal.setScale(2, RoundingMode.HALF_UP));
        cn.setCgstTotal(cgstTotal.setScale(2, RoundingMode.HALF_UP));
        cn.setSgstTotal(sgstTotal.setScale(2, RoundingMode.HALF_UP));
        BigDecimal taxTotal = cgstTotal.add(sgstTotal);
        cn.setTaxTotal(taxTotal.setScale(2, RoundingMode.HALF_UP));
        BigDecimal discountPct = nvl(cn.getDiscountPct(), BigDecimal.ZERO);
        BigDecimal discount = subTotal.multiply(discountPct).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        cn.setDiscount(discount);
        BigDecimal charges = nvl(cn.getCharges(), BigDecimal.ZERO);
        BigDecimal grand = subTotal.add(taxTotal).subtract(discount).add(charges);
        if (grand.compareTo(BigDecimal.ZERO) < 0) {
            grand = BigDecimal.ZERO;
        }
        cn.setGrandTotal(grand.setScale(2, RoundingMode.HALF_UP));
    }

    /**
     * Predicate keeping only the CURRENT row of each revision chain. A row is
     * kept when it is flagged latestRevision OR no other row in the same chain
     * (chain key = revisionOf, or the row id for the base) carries a strictly
     * higher revision number. Legacy base rows without a revision chain always
     * survive this filter, so the main list never shows older revisions as
     * separate rows (they remain reachable via the revision-history dropdown).
     */
    private Predicate latestPerChainPredicate(jakarta.persistence.criteria.Root<CreditNote> root, jakarta.persistence.criteria.CriteriaQuery<?> query, jakarta.persistence.criteria.CriteriaBuilder cb) {
        Subquery<Long> newer = query.subquery(Long.class);
        jakarta.persistence.criteria.Root<CreditNote> newerRoot = newer.from(CreditNote.class);
        newer.select(newerRoot.get("id"));
        newer.where(cb.and(
                cb.equal(newerRoot.get("revisionOf"),
                        cb.coalesce(root.get("revisionOf"), root.get("id"))),
                cb.greaterThan(cb.coalesce(newerRoot.get("revision"), 0),
                        cb.coalesce(root.get("revision"), 0))));
        return cb.or(cb.isTrue(root.get("latestRevision")), cb.not(cb.exists(newer)));
    }

    private Specification<CreditNote> buildSpecification(String search, String status, String client,
                                                         String reason, String dateFrom, String dateTo,
                                                         BigDecimal minAmount, BigDecimal maxAmount) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(latestPerChainPredicate(root, query, cb));
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("cnNo")), like),
                        cb.like(cb.lower(root.get("clientName")), like),
                        cb.like(cb.lower(root.get("sourceRef")), like),
                        cb.like(cb.lower(cb.toString(root.get("reason"))), like),
                        // Terms is a stored credit-note column, so it is searchable
                        // like the others; NULL terms can never match, which is the
                        // same behaviour as an empty value.
                        cb.like(cb.lower(root.get("terms")), like)
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
            if (reason != null && !reason.isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("reason")), reason.trim().toLowerCase()));
            }
            if (dateFrom != null && !dateFrom.isBlank()) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("cnDate"), LocalDate.parse(dateFrom).atStartOfDay()));
            }
            if (dateTo != null && !dateTo.isBlank()) {
                predicates.add(cb.lessThanOrEqualTo(root.get("cnDate"), LocalDate.parse(dateTo).atTime(23, 59, 59)));
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
            // The STORED credit-note columns. The four resolved-only columns
            // (CPO No. / Dispatch Date / Due Date / Due Date Exceeded) never
            // reach this method — list() routes them to the derived-sort path,
            // which orders on the values the table actually shows.
            case "clientName", "cnDate", "grandTotal", "status", "reason", "createdAt", "updatedAt", "cnNo",
                 "terms", "destinationReachedDate", "sourceDate"
                    -> "cnNo".equals(field) ? "cnNo" : field;
            case "id" -> "cnNo";
            default -> "createdAt";
        };
        boolean asc = isAscending(sort);
        return Sort.by(asc ? Sort.Direction.ASC : Sort.Direction.DESC, mapped);
    }

    private long nextSequence() {
        long count = creditNoteRepository.count();
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
        return Math.max(count, maxSuffix) + 1;
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

    private String buildNo(long sequence) {
        return String.format("CN-%d-%06d", Year.now().getValue(), sequence);
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
            case "pending_approval", "pending approval" -> "pending approval";
            case "approved" -> "approved";
            case "issued" -> "issued";
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

    private void addTimeline(CreditNote cn, String type, String title, String detail) {
        SalesTimeline entry = new SalesTimeline();
        entry.setModuleType(MODULE);
        entry.setModuleId(cn.getId());
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

    private void addHistory(CreditNote cn, String field, String oldValue, String newValue, String changedBy) {
        SalesHistory entry = new SalesHistory();
        entry.setModuleType(MODULE);
        entry.setModuleId(cn.getId());
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
