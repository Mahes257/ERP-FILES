package com.vishatech.erp.service;
import com.vishatech.erp.dto.ConversionResult;

import com.vishatech.erp.dto.QuotationFollowUpSummary;
import com.vishatech.erp.dto.QuotationItemRequest;
import com.vishatech.erp.dto.QuotationItemResponse;
import com.vishatech.erp.dto.QuotationNextNumberResponse;
import com.vishatech.erp.dto.QuotationRemarkRequest;
import com.vishatech.erp.dto.QuotationRemarkResponse;
import com.vishatech.erp.dto.QuotationRequest;
import com.vishatech.erp.dto.QuotationResponse;
import com.vishatech.erp.dto.RevisionInfo;
import com.vishatech.erp.dto.SalesAttachmentResponse;
import com.vishatech.erp.dto.SalesHistoryResponse;
import com.vishatech.erp.dto.SalesTimelineResponse;
import com.vishatech.erp.util.ItemGridJson;
import com.vishatech.erp.entity.Cpr;
import com.vishatech.erp.entity.CprItem;
import com.vishatech.erp.entity.CreditNote;
import com.vishatech.erp.entity.CreditNoteItem;
import com.vishatech.erp.entity.DeliveryChallan;
import com.vishatech.erp.entity.DeliveryChallanItem;
import com.vishatech.erp.entity.Invoice;
import com.vishatech.erp.entity.InvoiceItem;
import com.vishatech.erp.entity.PaymentReceipt;
import com.vishatech.erp.entity.ProformaInvoice;
import com.vishatech.erp.entity.ProformaInvoiceItem;
import com.vishatech.erp.entity.Quotation;
import com.vishatech.erp.entity.QuotationItem;
import com.vishatech.erp.entity.QuotationRemark;
import com.vishatech.erp.crm.entity.Customer;
import com.vishatech.erp.entity.DocumentVisibility;
import com.vishatech.erp.crm.entity.FollowUp;
import com.vishatech.erp.entity.SalesAttachment;
import com.vishatech.erp.entity.SalesHistory;
import com.vishatech.erp.entity.SalesContract;
import com.vishatech.erp.entity.SalesContractItem;
import com.vishatech.erp.entity.SalesOrder;
import com.vishatech.erp.entity.SalesOrderItem;
import com.vishatech.erp.entity.SalesTimeline;
import com.vishatech.erp.entity.CostWorkout;
import com.vishatech.erp.entity.CostWorkoutStatus;
import com.vishatech.erp.entity.ProfitWorkout;
import com.vishatech.erp.entity.ProfitWorkoutTimeline;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.DuplicateResourceException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.CreditNoteRepository;
import com.vishatech.erp.crm.repository.CustomerRepository;
import com.vishatech.erp.repository.DeliveryChallanRepository;
import com.vishatech.erp.repository.EditHistoryRepository;
import com.vishatech.erp.crm.repository.FollowUpRepository;
import com.vishatech.erp.repository.InvoiceRepository;
import com.vishatech.erp.repository.PaymentReceiptRepository;
import com.vishatech.erp.repository.ProformaInvoiceRepository;
import com.vishatech.erp.repository.QuotationRemarkRepository;
import com.vishatech.erp.repository.QuotationRepository;
import com.vishatech.erp.repository.RecordRevisionRepository;
import com.vishatech.erp.repository.SalesContractRepository;
import com.vishatech.erp.repository.SalesAttachmentRepository;
import com.vishatech.erp.repository.SalesHistoryRepository;
import com.vishatech.erp.repository.SalesOrderRepository;
import com.vishatech.erp.repository.SalesTimelineRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Year;
import java.time.format.DateTimeFormatter;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.HashMap;
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
public class QuotationService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final String MODULE = "quotation";

    private final QuotationRepository quotationRepository;
    private final SalesTimelineRepository timelineRepository;
    private final SalesHistoryRepository historyRepository;
    private final SalesAttachmentRepository attachmentRepository;
    private final EditHistoryRepository editHistoryRepository;
    private final RecordRevisionRepository recordRevisionRepository;
    private final SalesOrderRepository salesOrderRepository;
    /** Quotation follow-ups — only read, for the list's Follow-up Status column. */
    private final FollowUpRepository followUpRepository;
    private final ProformaInvoiceRepository proformaInvoiceRepository;
    private final InvoiceRepository invoiceRepository;
    private final CreditNoteRepository creditNoteRepository;
    private final PaymentReceiptRepository paymentReceiptRepository;
    private final DeliveryChallanRepository deliveryChallanRepository;
    private final SalesContractRepository salesContractRepository;
    private final FileStorageService fileStorageService;
    private final DocumentRepositoryService documentRepositoryService;
    private final com.vishatech.erp.repository.CprRepository cprRepository;
    private final QuotationRemarkRepository quotationRemarkRepository;
    /** Reference PR No resolver — a CPR is optional, a direct PR reference is enough. */
    private final PrReferenceService prReferenceService;
    /** Resolves the ACTUAL client of a converted record, for the currency + client link. */
    private final CustomerRepository customerRepository;
    /** A closed CRM lead can no longer be the source of a new quotation. */
    private final com.vishatech.erp.crm.service.LeadService leadService;
    /**
     * Source Cost Workout rows are read under a PESSIMISTIC_WRITE lock so two
     * concurrent saves can never produce two quotations for one Cost Workout.
     */
    private final com.vishatech.erp.repository.CostWorkoutRepository costWorkoutRepository;
    /**
     * Source Profit Workout rows are read under a PESSIMISTIC_WRITE lock so two
     * concurrent saves can never produce two quotations for one Profit Workout.
     */
    private final com.vishatech.erp.repository.ProfitWorkoutRepository profitWorkoutRepository;
    private final String baseUrl;

    @PersistenceContext
    private EntityManager entityManager;

    public QuotationService(QuotationRepository quotationRepository,
                            SalesTimelineRepository timelineRepository,
                            SalesHistoryRepository historyRepository,
                            SalesAttachmentRepository attachmentRepository,
                            EditHistoryRepository editHistoryRepository,
                            RecordRevisionRepository recordRevisionRepository,
                            SalesOrderRepository salesOrderRepository,
                            FollowUpRepository followUpRepository,
                            ProformaInvoiceRepository proformaInvoiceRepository,
                            InvoiceRepository invoiceRepository,
                            CreditNoteRepository creditNoteRepository,
                            PaymentReceiptRepository paymentReceiptRepository,
                            DeliveryChallanRepository deliveryChallanRepository,
                            SalesContractRepository salesContractRepository,
                            FileStorageService fileStorageService,
                            DocumentRepositoryService documentRepositoryService,
                            com.vishatech.erp.repository.CprRepository cprRepository,
                            QuotationRemarkRepository quotationRemarkRepository,
                            PrReferenceService prReferenceService,
                            CustomerRepository customerRepository,
                            com.vishatech.erp.crm.service.LeadService leadService,
                            com.vishatech.erp.repository.CostWorkoutRepository costWorkoutRepository,
                            com.vishatech.erp.repository.ProfitWorkoutRepository profitWorkoutRepository,
                            @Value("${app.base-url:http://localhost:8080}") String baseUrl) {
        this.quotationRepository = quotationRepository;
        this.timelineRepository = timelineRepository;
        this.historyRepository = historyRepository;
        this.attachmentRepository = attachmentRepository;
        this.editHistoryRepository = editHistoryRepository;
        this.recordRevisionRepository = recordRevisionRepository;
        this.salesOrderRepository = salesOrderRepository;
        this.followUpRepository = followUpRepository;
        this.proformaInvoiceRepository = proformaInvoiceRepository;
        this.invoiceRepository = invoiceRepository;
        this.creditNoteRepository = creditNoteRepository;
        this.paymentReceiptRepository = paymentReceiptRepository;
        this.deliveryChallanRepository = deliveryChallanRepository;
        this.salesContractRepository = salesContractRepository;
        this.fileStorageService = fileStorageService;
        this.documentRepositoryService = documentRepositoryService;
        this.cprRepository = cprRepository;
        this.quotationRemarkRepository = quotationRemarkRepository;
        this.prReferenceService = prReferenceService;
        this.customerRepository = customerRepository;
        this.leadService = leadService;
        this.costWorkoutRepository = costWorkoutRepository;
        this.profitWorkoutRepository = profitWorkoutRepository;
        this.baseUrl = baseUrl;
    }

    /**
     * The currency of a converted document must be the ACTUAL currency configured on
     * that record's client — never a hardcoded value. The conversion entry points used
     * to hardcode "INR", so a USD / EUR / GBP client's quotation was created in INR and
     * every amount on it (and on every document converted from it) then rendered with
     * ₹. Resolves from the linked client and falls back to INR only when the client
     * genuinely has no currency configured.
     */
    private String resolveClientCurrency(Long clientId) {
        if (clientId == null) {
            return "INR";
        }
        return customerRepository.findById(clientId)
                .map(Customer::getCurrency)
                .filter(currency -> currency != null && !currency.isBlank())
                .map(currency -> currency.trim().toUpperCase())
                .orElse("INR");
    }

    /** Null-safe client id of the CPR a conversion originates from. */
    private static Long cprClientId(com.vishatech.erp.entity.Cpr cpr) {
        return cpr == null ? null : cpr.getClientId();
    }

    // ============================== Read ==============================

    @Transactional(readOnly = true)
    public Page<QuotationResponse> list(int page, int size, String search, String sort,
                                        String status, String client, String salesPerson,
                                        String dateFrom, String dateTo, String validTill,
                                        BigDecimal minAmount, BigDecimal maxAmount) {
        return list(page, size, search, sort, status, client, salesPerson,
                dateFrom, dateTo, validTill, minAmount, maxAmount, null, null);
    }

    /**
     * Paged list. The per-row Follow-up / PO / Created-By summaries are resolved
     * for the WHOLE page in three batched queries, so the list never issues one
     * query per quotation (no N+1).
     */
    @Transactional(readOnly = true)
    public Page<QuotationResponse> list(int page, int size, String search, String sort,
                                        String status, String client, String salesPerson,
                                        String dateFrom, String dateTo, String validTill,
                                        BigDecimal minAmount, BigDecimal maxAmount,
                                        String followUpStatus, String poStatus) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort));
        Specification<Quotation> spec = buildSpecification(search, status, client, salesPerson,
                dateFrom, dateTo, validTill, minAmount, maxAmount, followUpStatus, poStatus);
        Page<Quotation> found = quotationRepository.findAll(spec, pageable);
        Map<Long, RowSummary> summaries = buildRowSummaries(found.getContent());
        return found.map(q -> toResponse(q, List.of(), summaries.get(q.getId())));
    }

    @Transactional(readOnly = true)
    public QuotationResponse get(Long id) {
        return toResponseDetail(getQuotation(id));
    }

    @Transactional(readOnly = true)
    public QuotationNextNumberResponse getNextNumber() {
        long next = nextSequence();
        return new QuotationNextNumberResponse(buildNo(next), next);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> stats() {
        List<String> excluded = List.of("archived", "deleted");
        // Count only the latest row of each revision chain so the KPI cards
        // match the list rows (older revisions are surfaced through the
        // Quotation No dropdown, never as separate quotations).
        List<Quotation> latest = quotationRepository.findAll(latestPerChainSpec());
        Map<String, Long> counts = new HashMap<>();
        BigDecimal totalAmt = BigDecimal.ZERO;
        for (Quotation q : latest) {
            String status = q.getStatus() == null ? "" : q.getStatus();
            counts.merge(status, 1L, Long::sum);
            if (!excluded.contains(status) && q.getGrandTotal() != null) {
                totalAmt = totalAmt.add(q.getGrandTotal());
            }
        }
        Map<String, Object> stats = new LinkedHashMap<>();
        long active = 0;
        for (String status : List.of("draft", "submitted", "pending approval", "approved", "sent", "viewed", "accepted", "rejected", "negotiation", "expired", "cancelled")) {
            long count = counts.getOrDefault(status, 0L);
            stats.put(status.replace(" ", ""), count);
            active += count;
        }
        // "Converted" is a CONVERSION fact, not a lifecycle status: count the
        // quotations that really carry a downstream document reference so the
        // KPI card and the status filter stay meaningful now that conversion no
        // longer rewrites the quotation's status.
        stats.put("converted", latest.stream().filter(this::hasAnyConversion).count());
        stats.put("total", active);
        stats.put("active", active);
        stats.put("archived", counts.getOrDefault("archived", 0L));
        stats.put("deleted", counts.getOrDefault("deleted", 0L));
        stats.put("totalAmt", totalAmt);
        return stats;
    }

    /**
     * Predicate keeping only the CURRENT row of each revision chain. A row is
     * kept when it is flagged {@code latestRevision} (the editable current
     * version, e.g. after a soft delete promoted the previous revision) OR no
     * other row in the same chain (chain key = revisionOf, or the row id for
     * the base) carries a strictly higher revision number. Legacy base rows
     * without a revision chain always survive this filter.
     */
    private Specification<Quotation> latestPerChainSpec() {
        return (root, query, cb) -> latestPerChainPredicate(root, query, cb);
    }

    /**
     * Builds the correlated NOT EXISTS predicate that de-duplicates revision
     * chains. Shared by the list specification and the stats counts so they
     * always agree on which rows represent a quotation.
     */
    private Predicate latestPerChainPredicate(Root<Quotation> root, jakarta.persistence.criteria.CriteriaQuery<?> query, jakarta.persistence.criteria.CriteriaBuilder cb) {
        Subquery<Long> newer = query.subquery(Long.class);
        Root<Quotation> newerRoot = newer.from(Quotation.class);
        newer.select(newerRoot.get("id"));
        newer.where(cb.and(
                cb.equal(newerRoot.get("revisionOf"),
                        cb.coalesce(root.get("revisionOf"), root.get("id"))),
                cb.greaterThan(cb.coalesce(newerRoot.get("revision"), 0),
                        cb.coalesce(root.get("revision"), 0))));
        // Keep the row when it is flagged latest OR no newer revision exists
        // in its chain. This preserves the delete → promote flow: after the
        // latest revision is soft-deleted, the promoted previous revision
        // (latestRevision=true) must remain visible and editable.
        return cb.or(cb.isTrue(root.get("latestRevision")), cb.not(cb.exists(newer)));
    }

    // ============================== Write ==============================

    public QuotationResponse create(QuotationRequest request, boolean draft) {
        // Closed-lead lifecycle rule: no new quotation (draft included) may be
        // started from a closed CRM lead, whether via the UI or the API.
        leadService.assertLeadReferenceOpen(request.leadNo());
        // One Cost Workout → one quotation. This is the save of the CW-prefilled
        // form (?sourceCw=<cwId>), which carries the Cost Workout number in the
        // request; the source row is locked for the rest of this transaction so
        // the legacy /cost-workouts/{id}/convert-to-quotation endpoint cannot win
        // the same conversion concurrently. Validation failures throw BEFORE the
        // quotation row is written, and the link is only recorded after the
        // quotation is saved, so a failed save never marks the CW converted.
        CostWorkout sourceCw = lockConvertibleCostWorkout(request.sourceCw());
        // One Profit Workout → one quotation, on the same terms: the source PW row
        // is locked for this transaction, so the conversion-prefilled form's save
        // and a retry/double click cannot both pass the duplicate check.
        ProfitWorkout sourcePw = lockConvertibleProfitWorkout(request.sourcePw());
        Quotation quotation = new Quotation();
        if (request.quotationNo() != null && !request.quotationNo().isBlank()) {
            if (quotationRepository.existsByQuotationNo(request.quotationNo().trim())) {
                throw new BadRequestException("Quotation number already exists: " + request.quotationNo());
            }
            quotation.setQuotationNo(request.quotationNo().trim());
        } else {
            quotation.setQuotationNo(buildNo(nextSequence()));
        }
        // Mirror the create-form validation for non-draft saves so an empty
        // payload cannot create a blank quotation. Draft saves stay lenient.
        if (!draft) {
            if (request.clientName() == null || request.clientName().isBlank()) {
                throw new BadRequestException("Client name is required");
            }
            if (request.items() == null || request.items().isEmpty()) {
                throw new BadRequestException("At least one item is required");
            }
        }
        applyRequest(quotation, request);
        if (sourcePw != null) {
            // The Profit Workout ↔ Quotation link is this reference (the existing
            // contract: ProfitWorkoutService#convertedQtnFor reads it back), so the
            // backend writes it from the resolved source, never from the payload.
            quotation.setReference(ProfitWorkoutService.QUOTATION_REF_PREFIX + sourcePw.getPwNo());
        }
        if (draft) {
            quotation.setStatus("draft");
        } else if (request.status() != null && !request.status().isBlank()) {
            quotation.setStatus(normalizeStatus(request.status()));
        } else {
            quotation.setStatus("draft");
        }
        recalcTotals(quotation);
        // Persist first so the generated id is available for timeline/history rows
        // (their module_id column is NOT NULL).
        Quotation saved = quotationRepository.saveAndFlush(quotation);
        addTimeline(saved, "created", "Quotation created",
                "Quotation '" + saved.getQuotationNo() + "' was created.");
        addHistory(saved, "Quotation", null, saved.getQuotationNo(), currentUserName());
        syncRecordDocumentQuietly(
                "Quotation", saved.getId(), saved.getQuotationNo(), "Quotation", saved.getQuotationNo(),
                saved.getClientId(), saved.getClientName(), saved.getStatus());
        if (sourceCw != null) {
            linkConvertedCostWorkout(sourceCw, saved);
        }
        if (sourcePw != null) {
            linkConvertedProfitWorkout(sourcePw, saved);
        }
        return toResponseDetail(saved);
    }

    /**
     * Resolves the Cost Workout a quotation is being created from and enforces
     * the CW → Quotation business rules (one CW → one non-deleted quotation).
     * Returns null when the request carries no source Cost Workout, so ordinary
     * quotation creation is unaffected.
     *
     * <p>Race safety: the CW row is locked FOR UPDATE as the first statement of
     * this (transactional) create, so two concurrent saves for the same Cost
     * Workout cannot both pass the duplicate check — the second one waits for the
     * first to commit, then sees the committed quotation and gets the normal 409.
     */
    private CostWorkout lockConvertibleCostWorkout(String sourceCwNo) {
        if (sourceCwNo == null || sourceCwNo.isBlank()) {
            return null;
        }
        String cwNo = sourceCwNo.trim();
        CostWorkout cw = costWorkoutRepository.findByCwNoForUpdate(cwNo)
                .orElseThrow(() -> new BadRequestException(
                        "Cost Workout not found: " + cwNo + ". Clear the Source Cost Workout field to save the quotation without one."));
        if (cw.getStatus() != CostWorkoutStatus.APPROVED) {
            throw new BadRequestException("Only approved Cost Workouts can be converted to a quotation (current: "
                    + (cw.getStatus() == null ? "unknown" : cw.getStatus().name().toLowerCase()) + ")");
        }
        if (cw.getConvertedToQtn() != null && !cw.getConvertedToQtn().isBlank()) {
            throw new DuplicateResourceException("Quotation " + cw.getConvertedToQtn()
                    + " already exists for Cost Workout " + cw.getCwNo());
        }
        assertNoQuotationForCostWorkout(cw);
        return cw;
    }

    /**
     * Rejects a second quotation for a Cost Workout. The CW back-link alone is not
     * enough: quotations created before the link existed (or whose link was never
     * written) still carry the source Cost Workout in {@code source_cw}.
     */
    public void assertNoQuotationForCostWorkout(CostWorkout cw) {
        if (cw == null || cw.getCwNo() == null || cw.getCwNo().isBlank()) {
            return;
        }
        quotationRepository.findLiveBySourceCw(cw.getCwNo()).stream().findFirst().ifPresent(existing -> {
            throw new DuplicateResourceException("Quotation " + existing.getQuotationNo()
                    + " already exists for Cost Workout " + cw.getCwNo());
        });
    }

    /**
     * Records the CW → Quotation relationship on the source Cost Workout (the
     * existing {@code convertedToQtn} back-link plus a timeline entry). Called
     * with the CW row already locked by this transaction, right after the
     * quotation is saved, so both rows commit (or roll back) together.
     */
    private void linkConvertedCostWorkout(CostWorkout cw, Quotation quotation) {
        cw.setConvertedToQtn(quotation.getQuotationNo());
        com.vishatech.erp.entity.CostWorkoutTimeline entry = new com.vishatech.erp.entity.CostWorkoutTimeline();
        entry.setType("converted");
        entry.setTitle("Converted to quotation");
        entry.setDetail("Cost Workout converted to quotation " + quotation.getQuotationNo() + ".");
        cw.addTimeline(entry);
        costWorkoutRepository.save(cw);
    }

    /**
     * Resolves the Profit Workout a quotation is being created from and rejects a
     * duplicate conversion (one PW → one quotation). Returns null for a plain
     * create, so ordinary quotation creation stays untouched.
     *
     * <p>Eligibility is deliberately NOT invented here: the Profit Workout
     * conversion has always been status-independent, and the only existing rule is
     * the single-quotation link. The check reads the same field the legacy
     * endpoint and the PW list use ({@code reference} = the conversion prefix plus
     * the PW number), so both paths agree. The row lock (taken first) makes the
     * check race-safe.
     */
    private ProfitWorkout lockConvertibleProfitWorkout(String sourcePwNo) {
        if (sourcePwNo == null || sourcePwNo.isBlank()) {
            return null;
        }
        String pwNo = sourcePwNo.trim();
        ProfitWorkout pw = profitWorkoutRepository.findByPwNoForUpdate(pwNo)
                .orElseThrow(() -> new BadRequestException(
                        "Profit Workout not found: " + pwNo + ". Clear the source Profit Workout to save the quotation without one."));
        quotationRepository.findLiveByReference(ProfitWorkoutService.QUOTATION_REF_PREFIX + pw.getPwNo())
                .stream().findFirst().ifPresent(existing -> {
                    throw new DuplicateResourceException("Quotation " + existing.getQuotationNo()
                            + " already exists for Profit Workout " + pw.getPwNo());
                });
        return pw;
    }

    /**
     * Records the PW → Quotation relationship on the source Profit Workout (the
     * same timeline entry the legacy conversion writes). The quotation side of the
     * link is its reference, already stored with the quotation.
     */
    private void linkConvertedProfitWorkout(ProfitWorkout pw, Quotation quotation) {
        ProfitWorkoutTimeline entry = new ProfitWorkoutTimeline();
        entry.setType("converted");
        entry.setTitle("Converted to quotation");
        entry.setDetail("Profit Workout converted to quotation " + quotation.getQuotationNo() + ".");
        pw.addTimeline(entry);
        profitWorkoutRepository.save(pw);
    }

    /**
     * Every edit creates a NEW revision row; the previous version is never
     * deleted or overwritten. Only the latest revision is editable.
     * The revised data is persisted as {@code BASE(N)} (e.g. INV-00001(2))
     * and the old row is flagged as not-latest — both rows stay in MySQL.
     */
    public QuotationResponse update(Long id, QuotationRequest request) {
        Quotation current = getQuotation(id);
        if (!current.isLatestRevision()) {
            throw new BadRequestException("Only the latest revision can be edited");
        }
        Long baseId = current.getRevisionOf() != null ? current.getRevisionOf() : current.getId();
        int maxRev = maxRevisionOfChain(baseId);
        int nextRev = maxRev + 1;

        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> before = editHistory.snapshot(current);
        before.put("itemsFingerprint", EditHistoryService.itemsFingerprint(current));
        // editBefore (without the items fingerprint) still feeds edit_history.
        Map<String, String> editBefore = editHistory.snapshot(current);

        // Deep-copy the current row into a NEW revision row.
        Quotation revision = new Quotation();
        copyForRevision(revision, current);
        applyRequest(revision, request);
        // The source Cost Workout is the document's origin, not an editable field:
        // keeping it on every revision is what lets one CW claim exactly one
        // quotation, and it stops an edit from linking a second quotation to a
        // Cost Workout that already has one.
        revision.setSourceCw(current.getSourceCw());
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

        revision.setQuotationNo(RevisionSupport.nextRevisionNumber(
                RevisionSupport.baseNumber(current.getQuotationNo()), nextRev));
        revision.setRevisionOf(baseId);
        revision.setRevision(nextRev);
        revision.setRevisionDate(LocalDateTime.now());
        revision.setLatestRevision(true);

        current.setLatestRevision(false);
        quotationRepository.save(current);
        Quotation saved = quotationRepository.saveAndFlush(revision);
        addTimeline(saved, "revision", "Revision " + nextRev + " created",
                "Revision '" + saved.getQuotationNo() + "' created from '" + current.getQuotationNo()
                        + "' by " + currentUserName() + ".");
        editHistory.recordEdit("quotation", saved.getId(), editBefore, editHistory.snapshot(saved));
        syncRecordDocumentQuietly(
                "Quotation", saved.getId(), saved.getQuotationNo(), "Quotation", saved.getQuotationNo(),
                saved.getClientId(), saved.getClientName(), saved.getStatus());
        return toResponseDetail(saved);
    }

    private int maxRevisionOfChain(Long baseId) {
        return quotationRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .mapToInt(Quotation::getRevision)
                .max()
                .orElse(0);
    }

    /** Copies every business field of a quotation into a new revision row. */
    private void copyForRevision(Quotation copy, Quotation source) {
        copyReferenceFields(copy, source);
        copy.setQuotationDate(source.getQuotationDate());
        copy.setDeliveryTerms(source.getDeliveryTerms());
        copy.setFreight(source.getFreight());
        copy.setInsurance(source.getInsurance());
        copy.setSignatureType(source.getSignatureType());
        copy.setSignatureLabel(source.getSignatureLabel());
        copy.setHsnView(source.getHsnView());
        copy.setDisplayUnit(source.getDisplayUnit());
        copy.setTaxSummary(source.getTaxSummary());
        copy.setHidePlace(source.getHidePlace());
        copy.setHsnSummary(source.getHsnSummary());
        copy.setOriginalImages(source.getOriginalImages());
        copy.setThumbnails(source.getThumbnails());
        copy.setDescFull(source.getDescFull());
        copy.setHideSubtotal(source.getHideSubtotal());
        copy.setShowSku(source.getShowSku());
        copy.setSerial(source.getSerial());
        copy.setBatch(source.getBatch());
        copy.setAdditionalInfo(source.getAdditionalInfo());
        copy.setContactEmail(source.getContactEmail());
        copy.setContactPhone(source.getContactPhone());
        copy.setCustomFields(source.getCustomFields());
        copy.setConvertedToSo(source.getConvertedToSo());
        copy.setConvertedToPi(source.getConvertedToPi());
        copy.setConvertedToInvoice(source.getConvertedToInvoice());
        copy.setConvertedToCn(source.getConvertedToCn());
        copy.setConvertedToPr(source.getConvertedToPr());
        copy.setConvertedToSc(source.getConvertedToSc());
        copy.setConvertedToDc(source.getConvertedToDc());
        for (QuotationItem sourceItem : source.getItems()) {
            QuotationItem item = new QuotationItem();
            copyItem(item, sourceItem);
            item.setDrawingNo(sourceItem.getDrawingNo());
            item.setMaterial(sourceItem.getMaterial());
            item.setLeadTime(sourceItem.getLeadTime());
            copy.addItem(item);
        }
    }

    public QuotationResponse delete(Long id) {
        Quotation quotation = getQuotation(id);
        RevisionSupport.requireLatest(quotation.isLatestRevision());
        quotation.setStatus("deleted");
        quotation.setArchivedAt(LocalDateTime.now());
        addTimeline(quotation, "deleted", "Quotation deleted",
                "Quotation was moved to trash by " + currentUserName() + ".");
        addHistory(quotation, "Status", null, "Deleted", currentUserName());
        Quotation saved = quotationRepository.save(quotation);
        syncRecordDocumentQuietly(saved);
        promotePreviousRevision(saved);
        return toResponseDetail(saved);
    }

    // ---------------------------------------------------------------------
    // Document-mirror integration.
    //
    // SOURCE keeps every quotation mirrored into the Documents module through
    // DocumentRepositoryService#syncRecordDocumentQuietly. TARGET's Documents
    // module is protected in this task and does not expose that method, so this
    // thin shim keeps the SOURCE call structure while leaving the Documents
    // module untouched. Quotation attachments continue to register through
    // registerFromAttachment, which the TARGET Documents module does provide.
    // ---------------------------------------------------------------------

    /** Mirror the central Documents repository with the current record state. */
    private void syncRecordDocumentQuietly(Quotation q) {
        syncRecordDocumentQuietly(
                "Quotation", q.getId(), q.getQuotationNo(), "Quotation", q.getQuotationNo(),
                q.getClientId(), q.getClientName(), q.getStatus());
    }

    /** Intentionally no-op — see note above. */
    private void syncRecordDocumentQuietly(String module, Long recordId, String code, String docType,
                                           String docNo, Long customerId, String clientName, String status) {
        // Intentionally no-op — TARGET's Documents module is protected.
    }

    /** When the latest revision is deleted, the previous one becomes latest. */
    private void promotePreviousRevision(Quotation removed) {
        if (!removed.isLatestRevision()) {
            return;
        }
        Long baseId = removed.getRevisionOf() != null ? removed.getRevisionOf() : removed.getId();
        // Highest remaining revision row first (revision >= 1).
        quotationRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .filter(q -> !q.getId().equals(removed.getId()))
                .filter(q -> !"deleted".equals(q.getStatus()))
                .findFirst()
                .ifPresentOrElse(q -> {
                    q.setLatestRevision(true);
                    quotationRepository.save(q);
                    removed.setLatestRevision(false);
                    quotationRepository.save(removed);
                }, () -> quotationRepository.findById(baseId).ifPresent(q -> {
                    // Fall back to the base row (revision 0) when no revision rows remain.
                    if (!q.getId().equals(removed.getId()) && !"deleted".equals(q.getStatus())) {
                        q.setLatestRevision(true);
                        quotationRepository.save(q);
                        removed.setLatestRevision(false);
                        quotationRepository.save(removed);
                    }
                }));
    }

    public QuotationResponse restore(Long id) {
        Quotation quotation = getQuotation(id);
        RevisionSupport.requireLatest(quotation.isLatestRevision());
        String previous = quotation.getStatus();
        String target = ("deleted".equals(previous) || "archived".equals(previous)) ? "draft" : previous;
        quotation.setStatus(target);
        quotation.setArchivedAt(null);
        addTimeline(quotation, "restored", "Quotation restored",
                "Quotation was restored by " + currentUserName() + ".");
        addHistory(quotation, "Status", titleCase(previous), titleCase(target), currentUserName());
        Quotation restored = quotationRepository.save(quotation);
        syncRecordDocumentQuietly(restored);
        return toResponse(restored);
    }

    public QuotationResponse archive(Long id) {
        Quotation quotation = getQuotation(id);
        RevisionSupport.requireLatest(quotation.isLatestRevision());
        quotation.setStatus("archived");
        quotation.setArchivedAt(LocalDateTime.now());
        addTimeline(quotation, "archived", "Quotation archived",
                "Quotation was archived by " + currentUserName() + ".");
        addHistory(quotation, "Status", null, "Archived", currentUserName());
        Quotation saved = quotationRepository.save(quotation);
        syncRecordDocumentQuietly(saved);
        return toResponse(saved);
    }

    public QuotationResponse changeStatus(Long id, String status, String remarks) {
        Quotation quotation = getQuotation(id);
        RevisionSupport.requireLatest(quotation.isLatestRevision());
        String normalized = normalizeStatus(status);
        if ("deleted".equals(quotation.getStatus())) {
            throw new BadRequestException("Cannot change status of a deleted quotation");
        }
        quotation.setStatus(normalized);
        if (remarks != null && !remarks.isBlank()) {
            addTimeline(quotation, "status", "Status changed",
                    "Status changed to '" + titleCase(normalized) + "' by " + currentUserName()
                            + ". Remarks: " + remarks.trim());
            addHistory(quotation, "Status", null, titleCase(normalized), currentUserName());
            addHistory(quotation, "Remarks", null, remarks.trim(), currentUserName());
        } else {
            addTimeline(quotation, "status", "Status changed",
                    "Status changed to '" + titleCase(normalized) + "' by " + currentUserName() + ".");
            addHistory(quotation, "Status", null, titleCase(normalized), currentUserName());
        }
        Quotation saved = quotationRepository.save(quotation);
        syncRecordDocumentQuietly(saved);
        return toResponse(saved);
    }

    public QuotationResponse duplicate(Long id) {
        Quotation source = getQuotation(id);
        Quotation copy = new Quotation();
        copy.setQuotationNo(buildNo(nextSequence()));
        copyReferenceFields(copy, source);
        // A duplicate is a NEW document, not another conversion of the same Cost
        // Workout: keeping the source reference would give that CW a second live
        // quotation (one CW → one quotation).
        copy.setSourceCw(null);
        // …and the Profit Workout conversion reference: a copy is a new document,
        // not another conversion, so it must not claim a quotation for that PW.
        if (copy.getReference() != null
                && copy.getReference().startsWith(ProfitWorkoutService.QUOTATION_REF_PREFIX)) {
            copy.setReference(null);
        }
        copy.setStatus("draft");
        copy.setQuotationDate(LocalDateTime.now());
        for (QuotationItem sourceItem : source.getItems()) {
            QuotationItem item = new QuotationItem();
            copyItem(item, sourceItem);
            copy.addItem(item);
        }
        recalcTotals(copy);
        Quotation saved = quotationRepository.saveAndFlush(copy);
        addTimeline(saved, "created", "Quotation created",
                "Duplicated from Quotation '" + source.getQuotationNo() + "'.");
        addHistory(saved, "Quotation", null, saved.getQuotationNo(), currentUserName());
        syncRecordDocumentQuietly(saved);
        return toResponseDetail(saved);
    }

    public int bulkArchive(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            Quotation quotation = getQuotation(id);
            if (!"archived".equals(quotation.getStatus()) && !"deleted".equals(quotation.getStatus())) {
                quotation.setStatus("archived");
                quotation.setArchivedAt(LocalDateTime.now());
                addTimeline(quotation, "archived", "Quotation archived",
                        "Quotation was archived by " + currentUserName() + ".");
                Quotation saved = quotationRepository.save(quotation);
                syncRecordDocumentQuietly(saved);
                count++;
            }
        }
        return count;
    }

    public int bulkRestore(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            Quotation quotation = getQuotation(id);
            if ("archived".equals(quotation.getStatus()) || "deleted".equals(quotation.getStatus())) {
                quotation.setStatus("draft");
                quotation.setArchivedAt(null);
                addTimeline(quotation, "restored", "Quotation restored",
                        "Quotation was restored by " + currentUserName() + ".");
                Quotation saved = quotationRepository.save(quotation);
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
            Quotation quotation = getQuotation(id);
            if (!"deleted".equals(quotation.getStatus())) {
                quotation.setStatus("deleted");
                quotation.setArchivedAt(LocalDateTime.now());
                addTimeline(quotation, "deleted", "Quotation deleted",
                        "Quotation was moved to trash by " + currentUserName() + ".");
                addHistory(quotation, "Status", null, "Deleted", currentUserName());
                Quotation saved = quotationRepository.save(quotation);
                syncRecordDocumentQuietly(saved);
                count++;
            }
        }
        return count;
    }

    public int bulkPermanentDelete(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            Quotation quotation = getQuotation(id);
            // Remove the whole revision chain (base row + every revision row).
            Long baseId = quotation.getRevisionOf() != null ? quotation.getRevisionOf() : quotation.getId();
            List<Quotation> chain = new ArrayList<>();
            quotationRepository.findById(baseId).ifPresent(chain::add);
            chain.addAll(quotationRepository.findByRevisionOfOrderByRevisionDesc(baseId));
            for (Quotation q : chain) {
                // Purge related rows so no orphaned attachments/timeline/history/
                // edit-history/revision-snapshots survive the hard delete.
                timelineRepository.deleteByModuleTypeAndModuleId(MODULE, q.getId());
                historyRepository.deleteByModuleTypeAndModuleId(MODULE, q.getId());
                attachmentRepository.deleteByModuleTypeAndModuleId(MODULE, q.getId());
                editHistoryRepository.deleteByModuleTypeAndRecordId(MODULE, q.getId());
                recordRevisionRepository.deleteByModuleTypeAndRecordId(MODULE, q.getId());
                // Remarks are quotation-scoped: purge them with the record so a
                // removed quotation leaves no orphaned remark rows behind.
                quotationRemarkRepository.deleteByQuotationId(q.getId());
            }
            quotationRepository.deleteAll(chain);
            count++;
        }
        return count;
    }

    /**
     * Creates a real Quotation row from a converted CPR. Used by the CPR module's
     * "Convert to Quotation" action so the quotation is persisted in MySQL and the
     * CPR is linked to the created quotation id/number.
     */
    public QuotationResponse createFromCpr(Cpr cpr) {
        Quotation quotation = new Quotation();
        quotation.setQuotationNo(buildNo(nextSequence()));
        quotation.setReference("Generated from CPR " + (cpr.getPrNo() == null ? "" : cpr.getPrNo()));
        quotation.setQuotationDate(LocalDateTime.now());
        quotation.setValidUntil(LocalDateTime.now().plusDays(30));
        quotation.setLeadNo(cpr.getLeadNo());
        quotation.setSourceCpr(cpr.getPrNo());
        quotation.setReferencePrNo(cpr.getReferencePrNo());
        quotation.setReferencePrSource(cpr.getReferencePrNo() != null && !cpr.getReferencePrNo().isBlank()
                ? com.vishatech.erp.entity.PrReference.SOURCE_CPR : null);
        quotation.setCprId(cpr.getId());
        quotation.setClientName(cpr.getClientName() != null ? cpr.getClientName() : cpr.getSourceLead());
        // Keep the real client link so the converted document is traceable back to the
        // customer record (and so the currency below resolves from that same client).
        quotation.setClientId(cpr.getClientId());
        quotation.setContactPerson(cpr.getContactPerson());
        quotation.setEmail(cpr.getEmail());
        quotation.setPhone(cpr.getPhone());
        quotation.setAddress(cpr.getBillingAddress());
        quotation.setGstin(cpr.getGst());
        quotation.setPan(cpr.getPan());
        quotation.setBillingAddress(cpr.getBillingAddress());
        quotation.setShipSameAsBill(true);
        quotation.setShippingAddress(cpr.getShippingAddress());
        quotation.setCurrency(resolveClientCurrency(cpr.getClientId()));
        quotation.setStatus("draft");
        quotation.setRemarks(cpr.getRemarks());
        quotation.setDiscount(BigDecimal.ZERO);
        quotation.setCharges(BigDecimal.ZERO);
        quotation.setFreight(BigDecimal.ZERO);
        quotation.setInsurance(BigDecimal.ZERO);
        if (cpr.getItems() != null) {
            for (CprItem cprItem : cpr.getItems()) {
                QuotationItem item = new QuotationItem();
                // CPR field mapping:
                //   specification (user-facing "Description") → quotation description
                //   description (user-facing "Material") → quotation material
                //   drawingNo (PR number) → quotation sku / item code
                item.setDescription(cprItem.getSpecification());
                item.setMaterial(cprItem.getDescription());
                item.setSku(cprItem.getDrawingNo());
                item.setHsn(null);
                item.setUom(cprItem.getUnit());
                item.setQty(nvl(cprItem.getQty(), BigDecimal.ONE));
                item.setRate(nvl(cprItem.getEstimatedCost(), BigDecimal.ZERO));
                item.setDiscountPct(BigDecimal.ZERO);
                // App-wide default GST rate (matches the Cost Workout default).
                item.setGstRate(BigDecimal.valueOf(18));
                // Preserve user-defined CPR item-grid columns: fold them into the
                // quotation item's free-text material field ("Label: value" pairs,
                // in configured order) so custom item information is never silently
                // discarded. Standard mapped fields (drawingNo -> sku, unit, qty,
                // rate) always take precedence.
                String folded = foldCprCustomFields(cpr, cprItem);
                if (folded != null && !folded.isBlank()) {
                    item.setMaterial(item.getMaterial() == null || item.getMaterial().isBlank()
                            ? folded
                            : item.getMaterial() + "; " + folded);
                }
                quotation.addItem(item);
            }
        }
        recalcTotals(quotation);
        // Persist first so the generated id is available for timeline/history rows
        // (their module_id column is NOT NULL).
        Quotation saved = quotationRepository.saveAndFlush(quotation);
        addTimeline(saved, "created", "Quotation created from CPR",
                "Quotation '" + saved.getQuotationNo() + "' was created from CPR '"
                        + (cpr.getPrNo() == null ? "" : cpr.getPrNo()) + "'.");
        addHistory(saved, "Quotation", null, saved.getQuotationNo(), currentUserName());
        return toResponse(saved);
    }

    private static final ObjectMapper CPR_ITEM_JSON = new ObjectMapper();

    /**
     * Folds a CPR item's user-defined custom column values into one
     * "Label: value; Label: value" string (configured column order, custom
     * columns only) so they survive CPR -> Quotation conversion without any
     * dedicated storage on QuotationItem.
     */
    private String foldCprCustomFields(Cpr cpr, CprItem cprItem) {
        Map<String, String> custom;
        if (cprItem.getCustomFieldsJson() == null || cprItem.getCustomFieldsJson().isBlank()) {
            return null;
        }
        try {
            custom = CPR_ITEM_JSON.readValue(cprItem.getCustomFieldsJson(),
                    new com.fasterxml.jackson.core.type.TypeReference<Map<String, String>>() {
                    });
        } catch (Exception e) {
            return null;
        }
        if (custom == null || custom.isEmpty()) {
            return null;
        }
        // id -> label for custom columns, in configured order.
        java.util.LinkedHashMap<String, String> ordered = new java.util.LinkedHashMap<>();
        if (cpr.getItemColumnsJson() != null && !cpr.getItemColumnsJson().isBlank()) {
            try {
                List<com.vishatech.erp.dto.CprItemColumn> cols = CPR_ITEM_JSON.readValue(
                        cpr.getItemColumnsJson(),
                        new com.fasterxml.jackson.core.type.TypeReference<List<com.vishatech.erp.dto.CprItemColumn>>() {
                        });
                if (cols != null) {
                    for (com.vishatech.erp.dto.CprItemColumn c : cols) {
                        if (c != null && c.id() != null && !Boolean.TRUE.equals(c.system()) && custom.containsKey(c.id())) {
                            ordered.put(c.id(), c.label() != null && !c.label().isBlank() ? c.label() : c.id());
                        }
                    }
                }
            } catch (Exception ignored) {
                // Column config unreadable — fall back to raw ids below.
            }
        }
        if (ordered.isEmpty()) {
            for (Map.Entry<String, String> e : custom.entrySet()) {
                ordered.put(e.getKey(), e.getKey());
            }
        }
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> e : ordered.entrySet()) {
            String value = custom.get(e.getKey());
            if (value == null || value.isBlank()) continue;
            if (sb.length() > 0) sb.append("; ");
            sb.append(e.getValue()).append(": ").append(value);
        }
        return sb.toString();
    }

    /**
     * POST /quotations/{id}/send — records the send event (email to client).
     * Mirrors the original ERP action; the actual email delivery is handled
     * by the mailto flow on the frontend.
     */
    public QuotationResponse send(Long id) {
        Quotation quotation = getQuotation(id);
        RevisionSupport.requireLatest(quotation.isLatestRevision());
        if ("draft".equals(quotation.getStatus())) {
            quotation.setStatus("sent");
            addTimeline(quotation, "sent", "Quotation sent",
                    "Quotation sent to " + (quotation.getEmail() == null ? "client" : quotation.getEmail()) + ".");
            addHistory(quotation, "Status", "Draft", "Sent", currentUserName());
        } else {
            addTimeline(quotation, "sent", "Quotation sent",
                    "Quotation was emailed to the client by " + currentUserName() + ".");
        }
        return toResponse(quotationRepository.save(quotation));
    }

    /**
     * Records that an EXISTING downstream document was created from this
     * quotation.
     *
     * The stand-alone Convert Quotation page builds the Sales Contract itself so
     * the user can set their own contract number, date and terms; it then links
     * the finished document back to the quotation through this endpoint rather
     * than overwriting the quotation's status (which is what used to make the
     * list show "converted" instead of the real lifecycle status).
     *
     * Only the quotation's conversion reference, its timeline and its audit trail
     * are touched. The lifecycle status (draft / submitted / sent / accepted / …)
     * is never changed here — Quotation Status and conversion state are separate
     * fields, and the list renders them in separate columns.
     */
    public QuotationResponse recordConversion(Long id, String target, String number) {
        Quotation quotation = getQuotation(id);
        RevisionSupport.requireLatest(quotation.isLatestRevision());
        String normalizedTarget = target == null ? "" : target.trim().toLowerCase().replace("_", "-");
        String documentNumber = number == null ? "" : number.trim();
        if (documentNumber.isEmpty()) {
            throw new BadRequestException("The converted document's number is required");
        }
        String label;
        switch (normalizedTarget) {
            case "sales-order", "so", "cpo", "customer-purchase-order" -> {
                quotation.setConvertedToSo(documentNumber);
                label = "Customer Purchase Order";
            }
            case "proforma", "proforma-invoice", "pi" -> {
                quotation.setConvertedToPi(documentNumber);
                label = "Proforma Invoice";
            }
            case "invoice" -> {
                quotation.setConvertedToInvoice(documentNumber);
                label = "Invoice";
            }
            case "credit-note", "cn" -> {
                quotation.setConvertedToCn(documentNumber);
                label = "Credit Note";
            }
            case "payment-receipt", "pr" -> {
                quotation.setConvertedToPr(documentNumber);
                label = "Payment Receipt";
            }
            case "sales-contract", "sc" -> {
                quotation.setConvertedToSc(documentNumber);
                label = "Sales Contract";
            }
            case "delivery-challan", "dc" -> {
                quotation.setConvertedToDc(documentNumber);
                label = "Delivery Challan";
            }
            default -> throw new BadRequestException("Unknown conversion target '" + target + "'");
        }
        addTimeline(quotation, "converted", "Converted to " + label,
                "Quotation converted to " + label + " " + documentNumber + ".");
        addHistory(quotation, label, null, documentNumber, currentUserName());
        return toResponse(quotationRepository.save(quotation));
    }

    /**
     * Quotation → Customer Purchase Order conversion. Creates a draft Customer
     * Purchase Order from the quotation and records the conversion on the
     * quotation's convertedToX reference. The quotation's own lifecycle status
     * is left untouched.
     */
    public ConversionResult convertToSalesOrder(Long id) {
        Quotation quotation = getQuotation(id);
        // Gated on the ACTUAL conversion history (per target), not on the
        // generic status: a quotation converted to another document type may
        // still be converted to a Customer Purchase Order.
        if (quotation.getConvertedToSo() != null) {
            throw new BadRequestException("Quotation is already converted to a Customer Purchase Order");
        }
        SalesOrder so = new SalesOrder();
        so.setSoNo(buildSoNumber());
        // Reference the CHAIN ORIGINAL's number, not this row's: a revision row
        // carries a suffixed number ("QTN-2026-000002(1)") that no other quotation
        // screen uses, and every reader (list PO Status, PO Status filter, linked
        // documents) matches on the chain original.
        so.setQtnRef(chainOriginalNo(quotation));
        so.setLeadNo(quotation.getLeadNo());
        so.setOrderDate(LocalDateTime.now());
        so.setStatus("draft");
        so.setCurrency(quotation.getCurrency() == null ? "INR" : quotation.getCurrency());
        so.setClientId(quotation.getClientId());
        so.setClientName(quotation.getClientName());
        so.setContactPerson(quotation.getContactPerson());
        so.setEmail(quotation.getEmail());
        so.setPhone(quotation.getPhone());
        so.setCity(quotation.getCity());
        so.setState(quotation.getState());
        so.setBillingAddress(quotation.getBillingAddress());
        so.setShippingAddress(quotation.getShippingAddress());
        so.setGstin(quotation.getGstin());
        so.setPan(quotation.getPan());
        so.setPaymentTerms(quotation.getPaymentTerms());
        so.setSalesExecutive(quotation.getSalesPerson());
        so.setTerms(quotation.getTerms());
        so.setRemarks(quotation.getRemarks());
        so.setTaxType(quotation.getTaxType());
        for (QuotationItem sourceItem : quotation.getItems()) {
            SalesOrderItem item = new SalesOrderItem();
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
            item.setDelivery(sourceItem.getLeadTime());
            so.addItem(item);
        }
        so.setSubTotal(quotation.getSubTotal());
        so.setDiscount(quotation.getDiscount());
        so.setTaxTotal(quotation.getTaxTotal());
        so.setCgstTotal(quotation.getCgstTotal());
        so.setSgstTotal(quotation.getSgstTotal());
        so.setCharges(quotation.getCharges());
        so.setGrandTotal(quotation.getGrandTotal());
        SalesOrder savedSo = salesOrderRepository.save(so);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, quotation.getId(), "sales-order", savedSo.getId());

        addTargetTimeline("sales-order", savedSo.getId(), "created", "Customer Purchase Order created",
                "Customer Purchase Order '" + savedSo.getSoNo() + "' created from Quotation '" + quotation.getQuotationNo() + "'.");
        addTargetHistory("sales-order", savedSo.getId(), "Customer Purchase Order", savedSo.getSoNo(), currentUserName());

        // NOTE: a conversion is recorded on the quotation's convertedTo* reference,
        // its timeline and its audit trail. It must NEVER overwrite the quotation's
        // own lifecycle status — Quotation Status and PO/conversion state are
        // separate fields (the list shows them in separate columns).
        quotation.setConvertedToSo(so.getSoNo());
        addTimeline(quotation, "converted", "Converted to Customer Purchase Order",
                "Quotation converted to Customer Purchase Order " + so.getSoNo() + ".");
        quotationRepository.save(quotation);
        return new ConversionResult("sales-order", savedSo.getId(), savedSo.getSoNo(), "Customer Purchase Order " + savedSo.getSoNo() + " created from Quotation " + quotation.getQuotationNo());
    }

    /** Quotation → Proforma Invoice conversion. */
    public ConversionResult convertToProforma(Long id) {
        Quotation quotation = getQuotation(id);
        if (quotation.getConvertedToPi() != null) {
            throw new BadRequestException("Quotation already converted to a Proforma Invoice");
        }
        ProformaInvoice pi = new ProformaInvoice();
        pi.setPiNo(buildPiNumber());
        pi.setPiDate(LocalDateTime.now());
        pi.setStatus("draft");
        pi.setSource("quotation");
        pi.setSourceRef(quotation.getQuotationNo());
        pi.setClientId(quotation.getClientId());
        pi.setClientName(quotation.getClientName());
        pi.setContactPerson(quotation.getContactPerson());
        pi.setEmail(quotation.getEmail());
        pi.setPhone(quotation.getPhone());
        pi.setGstin(quotation.getGstin());
        pi.setPan(quotation.getPan());
        pi.setBillingAddress(quotation.getBillingAddress());
        pi.setShippingAddress(quotation.getShippingAddress());
        pi.setValidTill(quotation.getValidUntil());
        pi.setTerms(quotation.getTerms());
        pi.setNotes(quotation.getRemarks());
        for (QuotationItem sourceItem : quotation.getItems()) {
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
        pi.setSubTotal(quotation.getSubTotal());
        pi.setDiscount(quotation.getDiscount());
        pi.setDiscountPct(quotation.getDiscountPct());
        pi.setTaxTotal(quotation.getTaxTotal());
        pi.setCgstTotal(quotation.getCgstTotal());
        pi.setSgstTotal(quotation.getSgstTotal());
        pi.setCharges(quotation.getCharges());
        pi.setGrandTotal(quotation.getGrandTotal());
        ProformaInvoice savedPi = proformaInvoiceRepository.save(pi);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, quotation.getId(), "proforma-invoice", savedPi.getId());
        addTargetTimeline("proforma-invoice", savedPi.getId(), "created", "Proforma Invoice created",
                "Proforma Invoice '" + savedPi.getPiNo() + "' created from Quotation '" + quotation.getQuotationNo() + "'.");
        addTargetHistory("proforma-invoice", savedPi.getId(), "Proforma Invoice", savedPi.getPiNo(), currentUserName());

        quotation.setConvertedToPi(savedPi.getPiNo());
        // NOTE: a conversion is recorded on the quotation's convertedTo* reference,
        // its timeline and its audit trail. It must NEVER overwrite the quotation's
        // own lifecycle status — Quotation Status and PO/conversion state are
        // separate fields (the list shows them in separate columns).
        addTimeline(quotation, "converted", "Converted to Proforma Invoice",
                "Quotation converted to Proforma Invoice " + savedPi.getPiNo() + ".");
        quotationRepository.save(quotation);
        return new ConversionResult("proforma-invoice", savedPi.getId(), savedPi.getPiNo(), "Proforma Invoice " + savedPi.getPiNo() + " created from Quotation " + quotation.getQuotationNo());
    }

    /** Quotation → Invoice conversion. */
    public ConversionResult convertToInvoice(Long id) {
        Quotation quotation = getQuotation(id);
        if (quotation.getConvertedToInvoice() != null) {
            throw new BadRequestException("Quotation already converted to an Invoice");
        }
        Invoice invoice = new Invoice();
        invoice.setInvoiceNo(buildInvoiceNumber());
        invoice.setInvoiceDate(LocalDateTime.now());
        invoice.setStatus("draft");
        invoice.setSource("quotation");
        invoice.setSourceRef(quotation.getQuotationNo());
        invoice.setCompanyName(quotation.getFromName() != null ? quotation.getFromName() : quotation.getFromCompany());
        invoice.setCompanyGstin(quotation.getFromGstin());
        invoice.setCompanyPan(quotation.getFromPan());
        invoice.setCompanyAddress(quotation.getFromAddress());
        invoice.setClientId(quotation.getClientId());
        invoice.setClientName(quotation.getClientName());
        invoice.setContactPerson(quotation.getContactPerson());
        invoice.setEmail(quotation.getEmail());
        invoice.setPhone(quotation.getPhone());
        invoice.setGstin(quotation.getGstin());
        invoice.setPan(quotation.getPan());
        invoice.setBillingAddress(quotation.getBillingAddress());
        invoice.setShippingAddress(quotation.getShippingAddress());
        invoice.setTerms(quotation.getTerms());
        invoice.setNotes(quotation.getRemarks());
        for (QuotationItem sourceItem : quotation.getItems()) {
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
        invoice.setSubTotal(quotation.getSubTotal());
        invoice.setDiscount(quotation.getDiscount());
        invoice.setTaxTotal(quotation.getTaxTotal());
        invoice.setCgstTotal(quotation.getCgstTotal());
        invoice.setSgstTotal(quotation.getSgstTotal());
        invoice.setCharges(quotation.getCharges());
        invoice.setGrandTotal(quotation.getGrandTotal());
        Invoice savedInv = invoiceRepository.save(invoice);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, quotation.getId(), "invoice", savedInv.getId());
        addTargetTimeline("invoice", savedInv.getId(), "created", "Invoice created",
                "Invoice '" + savedInv.getInvoiceNo() + "' created from Quotation '" + quotation.getQuotationNo() + "'.");
        addTargetHistory("invoice", savedInv.getId(), "Invoice", savedInv.getInvoiceNo(), currentUserName());

        quotation.setConvertedToInvoice(savedInv.getInvoiceNo());
        // NOTE: a conversion is recorded on the quotation's convertedTo* reference,
        // its timeline and its audit trail. It must NEVER overwrite the quotation's
        // own lifecycle status — Quotation Status and PO/conversion state are
        // separate fields (the list shows them in separate columns).
        addTimeline(quotation, "converted", "Converted to Invoice",
                "Quotation converted to Invoice " + savedInv.getInvoiceNo() + ".");
        quotationRepository.save(quotation);
        return new ConversionResult("invoice", savedInv.getId(), savedInv.getInvoiceNo(), "Invoice " + savedInv.getInvoiceNo() + " created from Quotation " + quotation.getQuotationNo());
    }

    /** Quotation → Credit Note conversion. */
    public ConversionResult convertToCreditNote(Long id) {
        Quotation quotation = getQuotation(id);
        if (quotation.getConvertedToCn() != null) {
            throw new BadRequestException("Quotation already converted to a Credit Note");
        }
        CreditNote cn = new CreditNote();
        cn.setCnNo(buildCnNumber());
        cn.setCnDate(LocalDateTime.now());
        cn.setStatus("draft");
        cn.setSource("quotation");
        cn.setSourceRef(quotation.getQuotationNo());
        cn.setCompanyName(quotation.getFromName() != null ? quotation.getFromName() : quotation.getFromCompany());
        cn.setCompanyGstin(quotation.getFromGstin());
        cn.setCompanyPan(quotation.getFromPan());
        cn.setCompanyAddress(quotation.getFromAddress());
        cn.setReason("Quotation converted to Credit Note");
        cn.setReasonDetail("Credit Note generated from Quotation " + quotation.getQuotationNo());
        cn.setInventoryImpact("none");
        cn.setClientId(quotation.getClientId());
        cn.setClientName(quotation.getClientName());
        cn.setContactPerson(quotation.getContactPerson());
        cn.setEmail(quotation.getEmail());
        cn.setPhone(quotation.getPhone());
        cn.setGstin(quotation.getGstin());
        for (QuotationItem sourceItem : quotation.getItems()) {
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
        cn.setSubTotal(quotation.getSubTotal());
        cn.setDiscount(quotation.getDiscount());
        cn.setTaxTotal(quotation.getTaxTotal());
        cn.setCgstTotal(quotation.getCgstTotal());
        cn.setSgstTotal(quotation.getSgstTotal());
        cn.setCharges(quotation.getCharges());
        cn.setGrandTotal(quotation.getGrandTotal());
        cn.setRefundAmount(quotation.getGrandTotal());
        CreditNote savedCn = creditNoteRepository.save(cn);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, quotation.getId(), "credit-note", savedCn.getId());
        addTargetTimeline("credit-note", savedCn.getId(), "created", "Credit Note created",
                "Credit Note '" + savedCn.getCnNo() + "' created from Quotation '" + quotation.getQuotationNo() + "'.");
        addTargetHistory("credit-note", savedCn.getId(), "Credit Note", savedCn.getCnNo(), currentUserName());

        quotation.setConvertedToCn(savedCn.getCnNo());
        // NOTE: a conversion is recorded on the quotation's convertedTo* reference,
        // its timeline and its audit trail. It must NEVER overwrite the quotation's
        // own lifecycle status — Quotation Status and PO/conversion state are
        // separate fields (the list shows them in separate columns).
        addTimeline(quotation, "converted", "Converted to Credit Note",
                "Quotation converted to Credit Note " + savedCn.getCnNo() + ".");
        quotationRepository.save(quotation);
        return new ConversionResult("credit-note", savedCn.getId(), savedCn.getCnNo(), "Credit Note " + savedCn.getCnNo() + " created from Quotation " + quotation.getQuotationNo());
    }

    /** Quotation → Payment Receipt conversion. */
    public ConversionResult convertToPaymentReceipt(Long id) {
        Quotation quotation = getQuotation(id);
        if (quotation.getConvertedToPr() != null) {
            throw new BadRequestException("Quotation already converted to a Payment Receipt");
        }
        PaymentReceipt receipt = new PaymentReceipt();
        receipt.setReceiptNo(buildPrNumber());
        receipt.setPaymentDate(LocalDateTime.now());
        receipt.setStatus("draft");
        receipt.setSource("quotation");
        receipt.setInvoiceRef(quotation.getQuotationNo());
        receipt.setCompanyName(quotation.getFromName() != null ? quotation.getFromName() : quotation.getFromCompany());
        receipt.setCompanyGstin(quotation.getFromGstin());
        receipt.setCompanyPan(quotation.getFromPan());
        receipt.setCompanyAddress(quotation.getFromAddress());
        receipt.setClientId(quotation.getClientId());
        receipt.setClientName(quotation.getClientName());
        receipt.setContactPerson(quotation.getContactPerson());
        receipt.setEmail(quotation.getEmail());
        receipt.setPhone(quotation.getPhone());
        receipt.setGstin(quotation.getGstin());
        receipt.setAmount(quotation.getGrandTotal());
        receipt.setRemarks("Payment receipt generated from Quotation " + quotation.getQuotationNo());
        PaymentReceipt savedPr = paymentReceiptRepository.save(receipt);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, quotation.getId(), "payment-receipt", savedPr.getId());
        addTargetTimeline("payment-receipt", savedPr.getId(), "created", "Payment Receipt created",
                "Payment Receipt '" + savedPr.getReceiptNo() + "' created from Quotation '" + quotation.getQuotationNo() + "'.");
        addTargetHistory("payment-receipt", savedPr.getId(), "Payment Receipt", savedPr.getReceiptNo(), currentUserName());

        quotation.setConvertedToPr(savedPr.getReceiptNo());
        // NOTE: a conversion is recorded on the quotation's convertedTo* reference,
        // its timeline and its audit trail. It must NEVER overwrite the quotation's
        // own lifecycle status — Quotation Status and PO/conversion state are
        // separate fields (the list shows them in separate columns).
        addTimeline(quotation, "converted", "Converted to Payment Receipt",
                "Quotation converted to Payment Receipt " + savedPr.getReceiptNo() + ".");
        quotationRepository.save(quotation);
        return new ConversionResult("payment-receipt", savedPr.getId(), savedPr.getReceiptNo(), "Payment Receipt " + savedPr.getReceiptNo() + " created from Quotation " + quotation.getQuotationNo());
    }

    /** Quotation → Delivery Challan conversion. */
    public ConversionResult convertToDeliveryChallan(Long id) {
        Quotation quotation = getQuotation(id);
        if (quotation.getConvertedToDc() != null) {
            throw new BadRequestException("Quotation already converted to a Delivery Challan");
        }
        DeliveryChallan dc = new DeliveryChallan();
        dc.setDcNo(buildDcNumber());
        dc.setDcDate(LocalDateTime.now());
        dc.setStatus("draft");
        dc.setClientId(quotation.getClientId());
        dc.setClientName(quotation.getClientName());
        dc.setContactPerson(quotation.getContactPerson());
        dc.setEmail(quotation.getEmail());
        dc.setPhone(quotation.getPhone());
        dc.setBillingAddress(quotation.getBillingAddress());
        dc.setShippingAddress(quotation.getShippingAddress());
        dc.setCity(quotation.getCity());
        dc.setState(quotation.getState());
        dc.setTerms(quotation.getTerms());
        dc.setNotes(quotation.getRemarks());
        for (QuotationItem sourceItem : quotation.getItems()) {
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
        dc.setSubTotal(quotation.getSubTotal());
        dc.setDiscount(quotation.getDiscount());
        dc.setTaxTotal(quotation.getTaxTotal());
        dc.setCgstTotal(quotation.getCgstTotal());
        dc.setSgstTotal(quotation.getSgstTotal());
        dc.setCharges(quotation.getCharges());
        dc.setGrandTotal(quotation.getGrandTotal());
        DeliveryChallan savedDc = deliveryChallanRepository.save(dc);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, quotation.getId(), "delivery-challan", savedDc.getId());
        addTargetTimeline("delivery-challan", savedDc.getId(), "created", "Delivery Challan created",
                "Delivery Challan '" + savedDc.getDcNo() + "' created from Quotation '" + quotation.getQuotationNo() + "'.");
        addTargetHistory("delivery-challan", savedDc.getId(), "Delivery Challan", savedDc.getDcNo(), currentUserName());

        // NOTE: a conversion is recorded on the quotation's convertedTo* reference,
        // its timeline and its audit trail. It must NEVER overwrite the quotation's
        // own lifecycle status — Quotation Status and PO/conversion state are
        // separate fields (the list shows them in separate columns).
        quotation.setConvertedToDc(savedDc.getDcNo());
        addTimeline(quotation, "converted", "Converted to Delivery Challan",
                "Quotation converted to Delivery Challan " + savedDc.getDcNo() + ".");
        quotationRepository.save(quotation);
        return new ConversionResult("delivery-challan", savedDc.getId(), savedDc.getDcNo(), "Delivery Challan " + savedDc.getDcNo() + " created from Quotation " + quotation.getQuotationNo());
    }

    /** Quotation → Sales Contract conversion. */
    public ConversionResult convertToSalesContract(Long id) {
        Quotation quotation = getQuotation(id);
        if (quotation.getConvertedToSc() != null) {
            throw new BadRequestException("Quotation already converted to a Sales Contract");
        }
        SalesContract sc = new SalesContract();
        sc.setScNo(buildScNumber());
        sc.setContractDate(LocalDateTime.now());
        sc.setStatus("draft");
        sc.setQtnRef(quotation.getQuotationNo());
        sc.setLeadNo(quotation.getLeadNo());
        sc.setCurrency(quotation.getCurrency() == null ? "INR" : quotation.getCurrency());
        sc.setTaxType(quotation.getTaxType());
        sc.setClientId(quotation.getClientId());
        sc.setClientName(quotation.getClientName());
        sc.setContactPerson(quotation.getContactPerson());
        sc.setEmail(quotation.getEmail());
        sc.setPhone(quotation.getPhone());
        sc.setCity(quotation.getCity());
        sc.setState(quotation.getState());
        sc.setBillingAddress(quotation.getBillingAddress());
        sc.setShippingAddress(quotation.getShippingAddress());
        sc.setGstin(quotation.getGstin());
        sc.setPan(quotation.getPan());
        sc.setPaymentTerms(quotation.getPaymentTerms());
        sc.setSalesExecutive(quotation.getSalesPerson());
        sc.setValidity(quotation.getValidUntil());
        sc.setCommercialTerms(quotation.getTerms());
        sc.setRemarks(quotation.getRemarks());
        for (QuotationItem sourceItem : quotation.getItems()) {
            SalesContractItem item = new SalesContractItem();
            item.setDescription(sourceItem.getDescription());
            item.setSku(sourceItem.getSku());
            item.setDrawingNo(sourceItem.getDrawingNo());
            item.setMaterial(sourceItem.getMaterial());
            item.setDelivery(sourceItem.getLeadTime());
            item.setHsn(sourceItem.getHsn());
            item.setUom(sourceItem.getUom());
            item.setQty(sourceItem.getQty());
            item.setRate(sourceItem.getRate());
            item.setDiscountPct(sourceItem.getDiscountPct());
            item.setGstRate(sourceItem.getGstRate());
            sc.addItem(item);
        }
        sc.setSubTotal(quotation.getSubTotal());
        sc.setDiscount(quotation.getDiscount());
        sc.setTaxTotal(quotation.getTaxTotal());
        sc.setCgstTotal(quotation.getCgstTotal());
        sc.setSgstTotal(quotation.getSgstTotal());
        sc.setCharges(quotation.getCharges());
        sc.setGrandTotal(quotation.getGrandTotal());
        SalesContract savedSc = salesContractRepository.save(sc);
        AttachmentTransfer.copyReferences(attachmentRepository, MODULE, quotation.getId(), "sales-contract", savedSc.getId());
        addTargetTimeline("sales-contract", savedSc.getId(), "created", "Sales Contract created",
                "Sales Contract '" + savedSc.getScNo() + "' created from Quotation '" + quotation.getQuotationNo() + "'.");
        addTargetHistory("sales-contract", savedSc.getId(), "Sales Contract", savedSc.getScNo(), currentUserName());

        quotation.setConvertedToSc(savedSc.getScNo());
        // NOTE: a conversion is recorded on the quotation's convertedTo* reference,
        // its timeline and its audit trail. It must NEVER overwrite the quotation's
        // own lifecycle status — Quotation Status and PO/conversion state are
        // separate fields (the list shows them in separate columns).
        addTimeline(quotation, "converted", "Converted to Sales Contract",
                "Quotation converted to Sales Contract " + savedSc.getScNo() + ".");
        quotationRepository.save(quotation);
        return new ConversionResult("sales-contract", savedSc.getId(), savedSc.getScNo(), "Sales Contract " + savedSc.getScNo() + " created from Quotation " + quotation.getQuotationNo());
    }

    /**
     * Creates a real Quotation row from a converted Cost Workout. Used by the
     * Cost Workout module's "Convert to Quotation" action so the quotation is
     * persisted in MySQL and the Cost Workout is linked to it.
     */
    public QuotationResponse createFromCostWorkout(com.vishatech.erp.entity.CostWorkout cw) {
        Quotation quotation = new Quotation();
        quotation.setQuotationNo(buildNo(nextSequence()));
        quotation.setReference("Generated from Cost Workout " + (cw.getCwNo() == null ? "" : cw.getCwNo()));
        quotation.setQuotationDate(LocalDateTime.now());
        quotation.setValidUntil(LocalDateTime.now().plusDays(30));
        quotation.setSourceCw(cw.getCwNo());
        // Lead / CPR source references
        quotation.setLeadNo(cw.getSourceLead() != null ? cw.getSourceLead() : "");
        if (cw.getCpr() != null) {
            quotation.setCprId(cw.getCpr().getId());
            quotation.setSourceCpr(cw.getCpr().getPrNo() != null ? cw.getCpr().getPrNo() : cw.getCprRef());
            if (cw.getCpr().getReferencePrNo() != null && !cw.getCpr().getReferencePrNo().isBlank()) {
                quotation.setReferencePrNo(cw.getCpr().getReferencePrNo());
                quotation.setReferencePrSource("CPR");
            }
        } else if (cw.getCprRef() != null && !cw.getCprRef().isBlank()) {
            quotation.setSourceCpr(cw.getCprRef());
        }
        // Customer information
        quotation.setClientName(cw.getCustomerName() != null ? cw.getCustomerName() : cw.getCompany());
        quotation.setClientId(cprClientId(cw.getCpr()));
        quotation.setContactPerson(cw.getContactPerson());
        quotation.setEmail(cw.getEmail());
        quotation.setPhone(cw.getPhone());
        quotation.setAddress(cw.getBillingAddress());
        quotation.setGstin(cw.getGst());
        quotation.setPan(cw.getPan());
        quotation.setBillingAddress(cw.getBillingAddress());
        quotation.setShipSameAsBill(true);
        quotation.setShippingAddress(cw.getShippingAddress());
        quotation.setCurrency(resolveClientCurrency(cprClientId(cw.getCpr())));
        quotation.setStatus("draft");
        quotation.setRemarks(cw.getRemarks());
        quotation.setDiscount(BigDecimal.ZERO);
        quotation.setDiscountPct(nvl(cw.getDiscountPct(), BigDecimal.ZERO));
        quotation.setCharges(BigDecimal.ZERO);
        quotation.setFreight(BigDecimal.ZERO);
        quotation.setInsurance(BigDecimal.ZERO);
        // Items — map ALL Cost Workout items into the quotation's own item grid.
        //
        // A Cost Workout item's material detail lives in three places and all of
        // it travels into fields the quotation item already has:
        //
        //   description / qty / unit   → productName, description, material, qty, uom
        //   its cost categories        → the item's cost (rate = category total ÷
        //                                qty, so the quotation line total equals the
        //                                Cost Workout's own item total) AND the
        //                                breakdown itself, kept visible as the item's
        //                                description detail rows [{label, value}]
        //   its "Lead Time" category   → the item's own leadTime field (that row is
        //                                excluded from the Cost Workout's amounts, so
        //                                it is never counted as money here either)
        //   its user-defined columns   → customFields (same per-row JSON shape the
        //                                grids already persist)
        //
        // No formula is invented: the mapped values are written as plain item
        // fields and recalcTotals() below applies the quotation's existing
        // pricing / tax / discount / total rules unchanged.
        if (cw.getItems() != null) {
            for (com.vishatech.erp.entity.CostWorkoutItem cwItem : cw.getItems()) {
                QuotationItem item = new QuotationItem();
                String description = cwItem.getDescription();
                item.setProductName(description);
                item.setDescription(description);
                item.setMaterial(description);
                item.setSku("");
                item.setHsn(null);
                item.setUom(cwItem.getUnit());
                BigDecimal cwItemQty = nvl(cwItem.getQty(), BigDecimal.ONE);
                item.setQty(cwItemQty);
                BigDecimal cwItemTotal = BigDecimal.ZERO;
                List<Map<String, String>> detailRows = new ArrayList<>();
                if (cwItem.getCategories() != null) {
                    for (com.vishatech.erp.entity.CostWorkoutCategory cat : cwItem.getCategories()) {
                        if (isLeadTimeCategory(cat)) {
                            item.setLeadTime(leadTimeValue(cat));
                            continue;
                        }
                        BigDecimal catAmt = cat.getAmount();
                        if (catAmt == null || catAmt.compareTo(BigDecimal.ZERO) == 0) {
                            catAmt = (cat.getQty() == null ? BigDecimal.ZERO : cat.getQty())
                                    .multiply(cat.getRate() == null ? BigDecimal.ZERO : cat.getRate());
                        }
                        cwItemTotal = cwItemTotal.add(catAmt);
                        detailRows.add(costDetailRow(cat, catAmt));
                    }
                }
                item.setRate(cwItemQty.compareTo(BigDecimal.ZERO) > 0
                        ? cwItemTotal.divide(cwItemQty, 2, RoundingMode.HALF_UP)
                        : cwItemTotal);
                item.setDescriptionRowsJson(ItemGridJson.writeList(detailRows));
                item.setCustomFieldsJson(ItemGridJson.writeMap(
                        ItemGridJson.readMap(cwItem.getCustomFieldsJson())));
                item.setDiscountPct(BigDecimal.ZERO);
                item.setGstRate(nvl(cw.getGstPct(), BigDecimal.valueOf(18)));
                quotation.addItem(item);
            }
        }
        recalcTotals(quotation);
        Quotation saved = quotationRepository.saveAndFlush(quotation);
        addTimeline(saved, "created", "Quotation created from Cost Workout",
                "Quotation '" + saved.getQuotationNo() + "' was created from Cost Workout '"
                        + (cw.getCwNo() == null ? "" : cw.getCwNo()) + "'.");
        addHistory(saved, "Quotation", null, saved.getQuotationNo(), currentUserName());
        return toResponse(saved);
    }

    /**
     * A Cost Workout "Lead Time" row is not a cost: the Cost Workout itself
     * excludes it from every amount (see CostWorkoutService#recalc). It carries
     * the delivery lead time, so it maps onto the quotation item's own free-text
     * Lead Time field instead of money.
     */
    private boolean isLeadTimeCategory(com.vishatech.erp.entity.CostWorkoutCategory cat) {
        return cat.getCategory() != null && "lead time".equalsIgnoreCase(cat.getCategory().trim());
    }

    /** The lead-time row as text: its Notes when written, else its qty + unit. */
    private String leadTimeValue(com.vishatech.erp.entity.CostWorkoutCategory cat) {
        if (cat.getNotes() != null && !cat.getNotes().isBlank()) {
            return cat.getNotes().trim();
        }
        if (cat.getQty() == null) {
            return null;
        }
        String qty = cat.getQty().stripTrailingZeros().toPlainString();
        return cat.getUnit() == null || cat.getUnit().isBlank() ? qty : qty + " " + cat.getUnit().trim();
    }

    /**
     * One Cost Workout cost category as a quotation item detail row
     * ({label: category, value: the cost line}), so the transferred item keeps
     * the material/cost breakdown visible in the quotation's item grid. The row
     * is presentation detail only — it never feeds the pricing calculation.
     */
    private Map<String, String> costDetailRow(com.vishatech.erp.entity.CostWorkoutCategory cat,
                                             BigDecimal amount) {
        String label = cat.getCategory() == null || cat.getCategory().isBlank()
                ? "Cost"
                : cat.getCategory().trim();
        StringBuilder value = new StringBuilder();
        if (cat.getQty() != null) {
            value.append(cat.getQty().stripTrailingZeros().toPlainString());
            if (cat.getUnit() != null && !cat.getUnit().isBlank()) {
                value.append(' ').append(cat.getUnit().trim());
            }
            value.append(" × ");
        }
        value.append(amount.setScale(2, RoundingMode.HALF_UP).toPlainString());
        if (cat.getNotes() != null && !cat.getNotes().isBlank()) {
            value.append(" — ").append(cat.getNotes().trim());
        }
        Map<String, String> row = new LinkedHashMap<>();
        row.put("label", label);
        row.put("value", value.toString());
        return row;
    }

    /**
     * Creates a real Quotation row from a converted Profit Workout. Used by the
     * Profit Workout module's "Convert to Quotation" action so the quotation is
     * persisted in MySQL and the Profit Workout is linked to it. Mirrors
     * createFromCostWorkout so the two conversions behave identically.
     */
    public QuotationResponse createFromProfitWorkout(com.vishatech.erp.entity.ProfitWorkout pw) {
        Quotation quotation = new Quotation();
        quotation.setQuotationNo(buildNo(nextSequence()));
        quotation.setReference("Generated from Profit Workout " + (pw.getPwNo() == null ? "" : pw.getPwNo()));
        quotation.setQuotationDate(LocalDateTime.now());
        quotation.setValidUntil(LocalDateTime.now().plusDays(30));
        // Lead / CPR source references — same mapping as createFromCostWorkout
        // so the quotation keeps the Profit Workout's customer, CPR number and
        // CPR id and the Quotation view can open the linked CPR.
        quotation.setLeadNo(pw.getSourceLead() != null ? pw.getSourceLead() : "");
        if (pw.getCpr() != null) {
            quotation.setCprId(pw.getCpr().getId());
            quotation.setSourceCpr(pw.getCpr().getPrNo() != null ? pw.getCpr().getPrNo() : pw.getCprRef());
            if (pw.getCpr().getReferencePrNo() != null && !pw.getCpr().getReferencePrNo().isBlank()) {
                quotation.setReferencePrNo(pw.getCpr().getReferencePrNo());
                quotation.setReferencePrSource("CPR");
            }
        } else if (pw.getCprRef() != null && !pw.getCprRef().isBlank()) {
            quotation.setSourceCpr(pw.getCprRef());
        }
        quotation.setClientName(pw.getCustomerName() != null ? pw.getCustomerName() : pw.getCompany());
        quotation.setClientId(cprClientId(pw.getCpr()));
        quotation.setContactPerson(pw.getContactPerson());
        quotation.setEmail(pw.getEmail());
        quotation.setPhone(pw.getPhone());
        quotation.setAddress(pw.getBillingAddress());
        quotation.setGstin(pw.getGst());
        quotation.setPan(pw.getPan());
        quotation.setBillingAddress(pw.getBillingAddress());
        quotation.setShipSameAsBill(true);
        quotation.setShippingAddress(pw.getShippingAddress());
        quotation.setCurrency(resolveClientCurrency(cprClientId(pw.getCpr())));
        quotation.setStatus("draft");
        quotation.setRemarks(pw.getRemarks());
        quotation.setDiscount(BigDecimal.ZERO);
        quotation.setCharges(BigDecimal.ZERO);
        quotation.setFreight(BigDecimal.ZERO);
        quotation.setInsurance(BigDecimal.ZERO);
        if (pw.getItems() != null) {
            for (com.vishatech.erp.entity.ProfitWorkoutItem pwItem : pw.getItems()) {
                QuotationItem item = new QuotationItem();
                item.setDescription(pwItem.getDescription());
                item.setSku(pwItem.getDescription());
                item.setHsn(null);
                item.setUom(pwItem.getUnit());
                BigDecimal pwItemQty = nvl(pwItem.getQty(), BigDecimal.ONE);
                item.setQty(pwItemQty);
                BigDecimal pwItemSelling = nvl(pwItem.getSelling(), BigDecimal.ZERO);
                item.setRate(pwItemQty.compareTo(BigDecimal.ZERO) > 0
                        ? pwItemSelling.divide(pwItemQty, 2, RoundingMode.HALF_UP)
                        : pwItemSelling);
                item.setDiscountPct(BigDecimal.ZERO);
                item.setGstRate(nvl(pw.getGstPct(), BigDecimal.valueOf(18)));
                quotation.addItem(item);
            }
        }
        recalcTotals(quotation);
        Quotation saved = quotationRepository.saveAndFlush(quotation);
        addTimeline(saved, "created", "Quotation created from Profit Workout",
                "Quotation '" + saved.getQuotationNo() + "' was created from Profit Workout '"
                        + (pw.getPwNo() == null ? "" : pw.getPwNo()) + "'.");
        addHistory(saved, "Quotation", null, saved.getQuotationNo(), currentUserName());
        return toResponse(saved);
    }

    // ============================== Export ==============================

    @Transactional(readOnly = true)
    public List<QuotationResponse> export(String search, String status, String client, String salesPerson,
                                          String dateFrom, String dateTo, String validTill,
                                          BigDecimal minAmount, BigDecimal maxAmount) {
        Specification<Quotation> spec = buildSpecification(search, status, client, salesPerson,
                dateFrom, dateTo, validTill, minAmount, maxAmount);
        List<Quotation> all = quotationRepository.findAll(spec);
        Map<Long, RowSummary> summaries = buildRowSummaries(all);
        return all.stream().map(q -> toResponse(q, List.of(), summaries.get(q.getId()))).toList();
    }

    @Transactional(readOnly = true)
    public String buildCsv(List<QuotationResponse> quotations) {
        StringBuilder sb = new StringBuilder();
        sb.append("Quotation No,Date,Client,Sales Person,Items,Amount,Valid Until,Status,Created\n");
        for (QuotationResponse q : quotations) {
            sb.append(escapeCsv(q.quotationNo())).append(',')
              .append(escapeCsv(q.date())).append(',')
              .append(escapeCsv(q.clientName())).append(',')
              .append(escapeCsv(q.salesPerson())).append(',')
              .append(q.itemsCount() == null ? "" : q.itemsCount()).append(',')
              .append(q.grandTotal() == null ? "" : q.grandTotal().toPlainString()).append(',')
              .append(escapeCsv(q.validUntil())).append(',')
              .append(escapeCsv(q.status())).append(',')
              .append(escapeCsv(q.createdAt())).append('\n');
        }
        return sb.toString();
    }

    // ============================== Sub-resources ==============================

    @Transactional(readOnly = true)
    public List<SalesTimelineResponse> getTimeline(Long id) {
        getQuotation(id);
        return timelineRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, id)
                .stream().map(this::timelineResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SalesHistoryResponse> getHistory(Long id) {
        getQuotation(id);
        return historyRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, id)
                .stream().map(this::historyResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SalesAttachmentResponse> getAttachments(Long id) {
        getQuotation(id);
        return attachmentRepository.findByModuleTypeAndModuleIdOrderByUploadedAtAsc(MODULE, id)
                .stream().map(this::attachmentResponse).toList();
    }

    public SalesAttachmentResponse addAttachment(Long id, MultipartFile file) {
        Quotation q = getQuotation(id);
        String storedName = fileStorageService.store(file);
        SalesAttachment attachment = new SalesAttachment();
        attachment.setModuleType(MODULE);
        attachment.setModuleId(id);
        attachment.setName(file.getOriginalFilename());
        attachment.setStoredName(storedName);
        attachment.setContentType(file.getContentType());
        attachment.setSize(file.getSize());
        attachment.setUrl(baseUrl + "/v1/files/" + storedName);
        attachment.setUploadedBy(currentUserName());
        SalesAttachment saved = attachmentRepository.save(attachment);
        addTimeline(id, "attachment", "File attached", file.getOriginalFilename());
        // Auto-register in centralized document repository
        documentRepositoryService.registerFromAttachment(
                file.getOriginalFilename(), "Quotation", id,
                q.getQuotationNo(), q.getClientId(), q.getClientName(),
                baseUrl + "/v1/files/" + storedName,
                file.getContentType(), file.getSize(),
                currentUserName(), DocumentVisibility.TEAM_ONLY);
        return attachmentResponse(saved);
    }

    public void deleteAttachment(Long id, Long attachmentId) {
        getQuotation(id);
        SalesAttachment attachment = attachmentRepository.findById(attachmentId)
                .filter(a -> MODULE.equals(a.getModuleType()) && id.equals(a.getModuleId()))
                .orElseThrow(() -> new ResourceNotFoundException("Attachment not found with id: " + attachmentId));
        attachmentRepository.delete(attachment);
    }

    // ============================== Mapping ==============================

    private QuotationResponse toResponse(Quotation quotation) {
        return toResponse(quotation, List.of(), buildRowSummaries(List.of(quotation)).get(quotation.getId()));
    }

    /** Detail response — also carries the full revision chain for the UI. */
    private QuotationResponse toResponseDetail(Quotation quotation) {
        return toResponse(quotation, revisionChain(quotation),
                buildRowSummaries(List.of(quotation)).get(quotation.getId()));
    }

    /**
     * Per-row list summaries resolved from the REAL related records:
     *  - createdBy      : author of the earliest audit entry (sales_history)
     *  - followUp*      : latest active quotation follow-up (followups.quotationId)
     *  - po*            : Customer Purchase Order linked by quotation number
     *                     (sales_orders.qtnRef)
     */
    private record RowSummary(String createdBy, String followUpStatus, String followUpDate,
                              Integer followUpCount, List<QuotationFollowUpSummary> followUps,
                              String poStatus, String poRawStatus,
                              String poNo, Long poId) {
    }

    /**
     * Reshapes one real follow-up row for the list's Follow-up Status dropdown
     * (the shared "FOLLOW-UP HISTORY" panel). Every value is a column of the
     * follow-up itself — nothing is derived — and the field names match the
     * entity so the shared component reads it exactly like a raw follow-up row.
     */
    private QuotationFollowUpSummary followUpSummary(FollowUp f) {
        return new QuotationFollowUpSummary(
                f.getId(),
                f.getFollowupDate() == null ? null : f.getFollowupDate().toString(),
                f.getMode(),
                f.getCurrentStatus(),
                f.getStatus());
    }

    private Map<Long, RowSummary> buildRowSummaries(List<Quotation> rows) {
        if (rows == null || rows.isEmpty()) {
            return Map.of();
        }
        List<Long> ids = rows.stream().map(Quotation::getId).filter(java.util.Objects::nonNull).distinct().toList();

        // A revision row carries a suffixed number ("QTN-…-000031(1)") while the
        // CPO (sales_orders.qtn_ref) and the original audit entries are keyed by
        // the CHAIN ORIGINAL, so the chain original is resolved explicitly and
        // both ids/numbers participate in the batched lookups.
        List<Long> baseIds = rows.stream().map(Quotation::getRevisionOf)
                .filter(java.util.Objects::nonNull).distinct().toList();
        Map<Long, Quotation> bases = new HashMap<>();
        if (!baseIds.isEmpty()) {
            quotationRepository.findAllById(baseIds).forEach(b -> bases.put(b.getId(), b));
        }

        Map<Long, String> poKeyByRow = new HashMap<>();
        Map<Long, Long> chainIdByRow = new HashMap<>();
        java.util.LinkedHashSet<Long> relatedIds = new java.util.LinkedHashSet<>(ids);
        for (Quotation q : rows) {
            Quotation base = q.getRevisionOf() == null ? null : bases.get(q.getRevisionOf());
            chainIdByRow.put(q.getId(), base == null ? q.getId() : base.getId());
            poKeyByRow.put(q.getId(), base == null ? q.getQuotationNo() : base.getQuotationNo());
            if (base != null) {
                relatedIds.add(base.getId());
            }
        }
        // A CPO converted from a REVISION row recorded that row's suffixed number
        // ("QTN-2026-000002(1)") in sales_orders.qtn_ref, while this list keys every
        // row by its chain original — so a revised quotation used to lose its PO
        // Status cell ("Not Released" although the CPO exists). Resolve the chain's
        // sibling revision numbers in one batched query so those CPOs still match,
        // and alias them back onto the chain original below.
        Map<String, String> refAlias = new HashMap<>();
        if (!bases.isEmpty()) {
            quotationRepository.findByRevisionOfIn(bases.keySet()).forEach(rev -> {
                Quotation base = bases.get(rev.getRevisionOf());
                if (base != null && rev.getQuotationNo() != null && base.getQuotationNo() != null) {
                    refAlias.put(rev.getQuotationNo(), base.getQuotationNo());
                }
            });
        }
        java.util.LinkedHashSet<String> poKeySet = new java.util.LinkedHashSet<>();
        poKeyByRow.values().stream().filter(java.util.Objects::nonNull).forEach(poKeySet::add);
        poKeySet.addAll(refAlias.keySet());
        List<String> poKeys = poKeySet.stream().toList();

        // One query per page for each of the three related data sets (no N+1).
        Map<Long, List<FollowUp>> followUpsByQuotation =
                relatedIds.isEmpty() ? Map.of() : followUpRepository.findActiveByQuotationIdIn(relatedIds).stream()
                        .filter(f -> f.getQuotationId() != null)
                        .collect(java.util.stream.Collectors.groupingBy(FollowUp::getQuotationId));
        Map<String, List<SalesOrder>> posByQuotationNo =
                poKeys.isEmpty() ? Map.of() : salesOrderRepository.findCurrentByQtnRefIn(poKeys).stream()
                        .filter(o -> o.getQtnRef() != null)
                        .collect(java.util.stream.Collectors.groupingBy(
                                o -> refAlias.getOrDefault(o.getQtnRef(), o.getQtnRef())));
        Map<Long, String> createdBy = new HashMap<>();
        if (!relatedIds.isEmpty()) {
            for (SalesHistory entry : historyRepository
                    .findByModuleTypeAndModuleIdInOrderByCreatedAtAsc(MODULE, relatedIds)) {
                if (entry.getChangedBy() != null) {
                    // Rows come oldest-first, so the first author seen created it.
                    createdBy.putIfAbsent(entry.getModuleId(), entry.getChangedBy());
                }
            }
        }

        Map<Long, RowSummary> summaries = new HashMap<>();
        for (Quotation q : rows) {
            // Follow-ups raised from this quotation (or from the chain original
            // before it was revised) — newest follow-up first is preserved by
            // the repository query, so the latest is picked explicitly.
            List<FollowUp> candidates = new ArrayList<>();
            candidates.addAll(followUpsByQuotation.getOrDefault(q.getId(), List.of()));
            Long chainId = chainIdByRow.get(q.getId());
            if (chainId != null && !chainId.equals(q.getId())) {
                candidates.addAll(followUpsByQuotation.getOrDefault(chainId, List.of()));
            }
            java.util.Comparator<FollowUp> newestFollowUpFirst = java.util.Comparator
                    .comparing(FollowUp::getFollowupDate, java.util.Comparator.nullsFirst(java.time.LocalDate::compareTo))
                    .thenComparing(FollowUp::getId, java.util.Comparator.nullsFirst(java.util.Comparator.<Long>naturalOrder()));
            FollowUp latest = candidates.stream().max(newestFollowUpFirst).orElse(null);
            // The records behind the count, newest first — same in-memory list the
            // count is taken from, so the cell and its dropdown can never disagree.
            List<QuotationFollowUpSummary> followUpRows = candidates.stream()
                    .sorted(newestFollowUpFirst.reversed())
                    .map(this::followUpSummary)
                    .toList();
            String poKey = poKeyByRow.get(q.getId());
            List<SalesOrder> pos = poKey == null ? List.of() : posByQuotationNo.getOrDefault(poKey, List.of());
            // One rule for BOTH the list cell and the PO Status filter: the
            // quotation is Released as soon as one current CPO is not cancelled,
            // and only Cancelled when every current CPO is cancelled. The CPO
            // shown is the newest non-cancelled one (matching what the
            // quotation's own convertedToSo points at).
            boolean anyActivePo = pos.stream().anyMatch(o -> !isCancelledPo(o));
            java.util.Comparator<SalesOrder> newestFirst = java.util.Comparator
                    .comparing(SalesOrder::getId, java.util.Comparator.nullsFirst(java.util.Comparator.<Long>naturalOrder()));
            SalesOrder po = pos.stream().filter(o -> isCancelledPo(o) != anyActivePo)
                    .max(newestFirst)
                    .orElse(null);
            String poStatus = pos.isEmpty() ? null : (anyActivePo ? "released" : "cancelled");
            Long createdById = chainIdByRow.get(q.getId());
            summaries.put(q.getId(), new RowSummary(
                    createdBy.get(createdById != null ? createdById : q.getId()),
                    latest == null ? null : latest.getStatus(),
                    latest == null || latest.getFollowupDate() == null ? null : latest.getFollowupDate().toString(),
                    candidates.isEmpty() ? null : candidates.size(),
                    followUpRows,
                    poStatus,
                    po == null ? null : po.getStatus(),
                    // The Customer Purchase Order module persists its records in
                    // the sales_orders table; the CPO's own document number is
                    // the so_no column (its primary identity, what every other
                    // CPO screen shows). customer_po is the CUSTOMER'S external
                    // PO reference free-text field — a different concept that is
                    // usually empty, and mapping it here made the PO Status
                    // column fall back to raw SO-… numbers or nothing.
                    po == null ? null : po.getSoNo(),
                    po == null ? null : po.getId()));
        }
        return summaries;
    }

    private List<RevisionInfo> revisionChain(Quotation quotation) {
        Long baseId = quotation.getRevisionOf() != null ? quotation.getRevisionOf() : quotation.getId();
        List<RevisionInfo> chain = new ArrayList<>();
        quotationRepository.findById(baseId).ifPresent(q -> chain.add(revisionInfo(q)));
        quotationRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .sorted(java.util.Comparator.comparingInt(Quotation::getRevision))
                .forEach(q -> chain.add(revisionInfo(q)));
        return chain;
    }

    private RevisionInfo revisionInfo(Quotation quotation) {
        return new RevisionInfo(
                quotation.getId(),
                quotation.getQuotationNo(),
                quotation.getRevision(),
                quotation.getStatus(),
                quotation.getRevisionDate() == null
                        ? (quotation.getCreatedAt() == null ? null : quotation.getCreatedAt().toString())
                        : quotation.getRevisionDate().toString(),
                quotation.isLatestRevision());
    }

    /** True when the quotation has been converted into at least one document. */
    private boolean hasAnyConversion(Quotation quotation) {
        return hasText(quotation.getConvertedToSo()) || hasText(quotation.getConvertedToPi())
                || hasText(quotation.getConvertedToInvoice()) || hasText(quotation.getConvertedToCn())
                || hasText(quotation.getConvertedToPr()) || hasText(quotation.getConvertedToSc())
                || hasText(quotation.getConvertedToDc());
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    /** "This conversion reference carries a real document number." */
    private static Predicate conversionMade(jakarta.persistence.criteria.CriteriaBuilder cb,
                                            Root<Quotation> root, String field) {
        return cb.and(cb.isNotNull(root.get(field)), cb.notEqual(root.get(field), ""));
    }

    private static boolean isCancelledPo(SalesOrder order) {
        return "cancelled".equalsIgnoreCase(order.getStatus());
    }

    private QuotationResponse toResponse(Quotation quotation, List<RevisionInfo> revisions, RowSummary summary) {
        RowSummary s = summary == null
                ? new RowSummary(null, null, null, null, List.of(), null, null, null, null)
                : summary;
        List<QuotationItemResponse> itemResponses = quotation.getItems().stream().map(this::itemResponse).toList();
        BigDecimal totalQty = itemResponses.stream()
                .map(QuotationItemResponse::qty)
                .filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new QuotationResponse(
                quotation.getId(),
                quotation.getQuotationNo(),
                quotation.getReference(),
                quotation.getQuotationDate() == null ? null : quotation.getQuotationDate().toLocalDate().toString(),
                quotation.getValidUntil() == null ? null : quotation.getValidUntil().toLocalDate().toString(),
                quotation.getLeadNo(),
                quotation.getSourceCw(),
                quotation.getSourceCpr(),
                quotation.getReferencePrNo(),
                quotation.getCprId(),
                quotation.getPrReferenceId(),
                quotation.getReferencePrSource(),
                quotation.getReferencePrSource() == null
                        ? null
                        : com.vishatech.erp.dto.PrReferenceResponse.labelFor(quotation.getReferencePrSource()),
                quotation.getFromCompany(),
                quotation.getFromName(),
                quotation.getFromAddress(),
                quotation.getFromGstin(),
                quotation.getFromPan(),
                quotation.getFromEmail(),
                quotation.getFromPhone(),
                quotation.getClientId(),
                quotation.getClientName(),
                quotation.getContactPerson(),
                quotation.getEmail(),
                quotation.getPhone(),
                quotation.getAddress(),
                quotation.getCity(),
                quotation.getState(),
                quotation.getPin(),
                quotation.getCountry(),
                quotation.getGstin(),
                quotation.getPan(),
                quotation.getBillingAddress(),
                quotation.getBillingCity(),
                quotation.getBillingState(),
                quotation.getBillingPin(),
                quotation.isShipSameAsBill(),
                quotation.getShippingAddress(),
                quotation.getShippingCity(),
                quotation.getShippingState(),
                quotation.getShippingPin(),
                quotation.getTaxType(),
                quotation.getCurrency(),
                quotation.getExchangeRate(),
                quotation.getBaseCurrency(),
                quotation.getNumberFormat(),
                quotation.getStatus(),
                quotation.getSalesPerson(),
                quotation.getPaymentTerms(),
                quotation.getRemarks(),
                quotation.getTerms(),
                quotation.getSubTotal(),
                quotation.getDiscount(),
                quotation.getDiscountPct(),
                quotation.getCgstTotal(),
                quotation.getSgstTotal(),
                quotation.getTaxTotal(),
                quotation.getCharges(),
                quotation.getDeliveryTerms(),
                quotation.getFreight(),
                quotation.getInsurance(),
                quotation.getSignatureType(),
                quotation.getSignatureLabel(),
                quotation.getHsnView(),
                quotation.getDisplayUnit(),
                quotation.getTaxSummary(),
                quotation.getHidePlace(),
                quotation.getHsnSummary(),
                quotation.getOriginalImages(),
                quotation.getThumbnails(),
                quotation.getDescFull(),
                quotation.getHideSubtotal(),
                quotation.getShowSku(),
                quotation.getSerial(),
                quotation.getBatch(),
                quotation.getAdditionalInfo(),
                quotation.getContactEmail(),
                quotation.getContactPhone(),
                quotation.getCustomFields(),
                quotation.getGrandTotal(),
                itemResponses.size(),
                totalQty,
                quotation.getConvertedToSo(),
                quotation.getConvertedToPi(),
                quotation.getConvertedToInvoice(),
                quotation.getConvertedToCn(),
                quotation.getConvertedToPr(),
                quotation.getConvertedToSc(),
                quotation.getConvertedToDc(),
                quotation.getQuotationDate() == null
                        ? (quotation.getCreatedAt() == null ? null : quotation.getCreatedAt().toLocalDate().toString())
                        : quotation.getQuotationDate().toLocalDate().toString(),
                quotation.getCreatedAt() == null ? null : quotation.getCreatedAt().toString(),
                quotation.getUpdatedAt() == null ? null : quotation.getUpdatedAt().toString(),
                quotation.getArchivedAt() == null ? null : quotation.getArchivedAt().toString(),
                itemResponses,
                attachmentRepository.findByModuleTypeAndModuleIdOrderByUploadedAtAsc(MODULE, quotation.getId())
                        .stream().map(this::attachmentResponse).toList(),
                timelineRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, quotation.getId())
                        .stream().map(this::timelineResponse).toList(),
                historyRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, quotation.getId())
                        .stream().map(this::historyResponse).toList(),
                quotation.getRevision(),
                quotation.getRevisionOf(),
                quotation.isLatestRevision(),
                quotation.getRevisionDate() == null ? null : quotation.getRevisionDate().toString(),
                revisions,
                s.createdBy(),
                s.followUpStatus(),
                s.followUpDate(),
                s.followUpCount(),
                s.followUps() == null ? List.of() : s.followUps(),
                s.poStatus(),
                s.poRawStatus(),
                s.poNo(),
                s.poId()
        );
    }

    private QuotationItemResponse itemResponse(QuotationItem item) {
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
        return new QuotationItemResponse(item.getId(), item.getProductId(), item.getProductName(), item.getDescription(), item.getSku(), item.getDrawingNo(),
                item.getMaterial(), item.getLeadTime(), item.getHsn(), item.getUom(), item.getBatchCode(),
                item.getExpiryDate(), qty, rate, discPct, gst,
                gross.setScale(2, RoundingMode.HALF_UP),
                discAmt.setScale(2, RoundingMode.HALF_UP),
                net.setScale(2, RoundingMode.HALF_UP),
                cgst.setScale(2, RoundingMode.HALF_UP),
                sgst.setScale(2, RoundingMode.HALF_UP),
                total.setScale(2, RoundingMode.HALF_UP),
                ItemGridJson.readMap(item.getCustomFieldsJson()),
                ItemGridJson.readList(item.getDescriptionRowsJson()));
    }

    private SalesAttachmentResponse attachmentResponse(SalesAttachment attachment) {
        return new SalesAttachmentResponse(attachment.getId(), attachment.getName(), attachment.getContentType(),
                attachment.getSize(), attachment.getUrl(),
                attachment.getUploadedAt() == null ? null : attachment.getUploadedAt().toString(),
                attachment.getUploadedBy());
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

    private Quotation getQuotation(Long id) {
        return quotationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Quotation not found with id: " + id));
    }

    /**
     * Reference PR No → origin relationship (backend-enforced).
     *
     * A quotation may be raised from ANY entry point, so all three cases are
     * valid and none of them forces a CPR to exist first:
     *
     * - blank ref → the PR reference is optional; clear the association
     *   (referencePrNo/cprId/prReferenceId/source = null).
     * - a live CPR carries the ref → link to that CPR (cprId set, source CPR);
     *   the saved quotation stores the canonical CPR value so
     *   Quotation → Open CPR always resolves.
     * - no CPR carries the ref → register/reuse a DIRECT pr_references row
     *   (source DIRECT) so a quotation can be started straight from a customer
     *   enquiry and the PR No is immediately selectable afterwards.
     *
     * Existing quotations keep their saved snapshot: the resolver only VALIDATES
     * and LINKS — field values the user saved are never overwritten from the CPR.
     */
    private void applyReferencePrLink(Quotation quotation, QuotationRequest request) {
        String ref = request.referencePrNo() == null ? null : request.referencePrNo().trim();
        if (ref == null || ref.isEmpty()) {
            quotation.setReferencePrNo(null);
            quotation.setCprId(null);
            quotation.setPrReferenceId(null);
            quotation.setReferencePrSource(null);
            return;
        }
        PrReferenceService.PrReferenceLink resolved = prReferenceService
                .resolveForQuotation(ref, request.clientId(), request.clientName());
        if (resolved == null) {
            // Unreachable for a non-blank ref, but never fail a save over the
            // optional PR reference: keep the typed value as a direct reference.
            quotation.setReferencePrNo(ref);
            quotation.setCprId(null);
            quotation.setPrReferenceId(null);
            quotation.setReferencePrSource(com.vishatech.erp.entity.PrReference.SOURCE_DIRECT);
            return;
        }
        quotation.setReferencePrNo(resolved.referencePrNo());
        quotation.setCprId(resolved.fromCpr() ? resolved.cprId() : null);
        quotation.setPrReferenceId(resolved.prReferenceId());
        quotation.setReferencePrSource(resolved.source());
    }

    private void applyRequest(Quotation quotation, QuotationRequest request) {
        quotation.setReference(request.reference());
        quotation.setQuotationDate(parseDate(request.quotationDate()));
        quotation.setValidUntil(parseDate(request.validUntil()));
        quotation.setLeadNo(request.leadNo());
        quotation.setSourceCw(request.sourceCw());
        quotation.setSourceCpr(request.sourceCpr());
        applyReferencePrLink(quotation, request);
        // From here on the quotation carries its own snapshot values; the CPR
        // reference fields above only VALIDATE + LINK (never overwrite snapshot
        // data), so later CPR edits cannot silently change saved quotations.
        quotation.setFromCompany(request.fromCompany());
        quotation.setFromName(request.fromName());
        quotation.setFromAddress(request.fromAddress());
        quotation.setFromGstin(request.fromGstin());
        quotation.setFromPan(request.fromPan());
        quotation.setFromEmail(request.fromEmail());
        quotation.setFromPhone(request.fromPhone());
        quotation.setClientId(request.clientId());
        quotation.setClientName(request.clientName());
        quotation.setContactPerson(request.contactPerson());
        quotation.setEmail(request.email());
        quotation.setPhone(request.phone());
        quotation.setAddress(request.address());
        quotation.setCity(request.city());
        quotation.setState(request.state());
        quotation.setPin(request.pin());
        quotation.setCountry(request.country());
        quotation.setGstin(request.gstin());
        quotation.setPan(request.pan());
        quotation.setBillingAddress(request.billingAddress());
        quotation.setBillingCity(request.billingCity());
        quotation.setBillingState(request.billingState());
        quotation.setBillingPin(request.billingPin());
        quotation.setShipSameAsBill(Boolean.TRUE.equals(request.shipSameAsBill()));
        quotation.setShippingAddress(request.shippingAddress());
        quotation.setShippingCity(request.shippingCity());
        quotation.setShippingState(request.shippingState());
        quotation.setShippingPin(request.shippingPin());
        quotation.setTaxType(request.taxType());
        quotation.setCurrency(request.currency());
        quotation.setExchangeRate(request.exchangeRate());
        quotation.setBaseCurrency(request.baseCurrency());
        quotation.setNumberFormat(request.numberFormat());
        quotation.setSalesPerson(request.salesPerson());
        quotation.setPaymentTerms(request.paymentTerms());
        quotation.setRemarks(request.remarks());
        quotation.setTerms(request.terms());
        quotation.setDiscount(request.discount() == null ? BigDecimal.ZERO : request.discount());
        quotation.setCharges(request.charges() == null ? BigDecimal.ZERO : request.charges());
        quotation.setDeliveryTerms(request.deliveryTerms());
        quotation.setFreight(request.freight() == null ? BigDecimal.ZERO : request.freight());
        quotation.setInsurance(request.insurance() == null ? BigDecimal.ZERO : request.insurance());
        quotation.setSignatureType(request.signatureType());
        quotation.setSignatureLabel(request.signatureLabel());
        quotation.setHsnView(request.hsnView());
        quotation.setDisplayUnit(request.displayUnit());
        quotation.setTaxSummary(request.taxSummary());
        quotation.setHidePlace(request.hidePlace());
        quotation.setHsnSummary(request.hsnSummary());
        quotation.setOriginalImages(request.originalImages());
        quotation.setThumbnails(request.thumbnails());
        quotation.setDescFull(request.descFull());
        quotation.setHideSubtotal(request.hideSubtotal());
        quotation.setShowSku(request.showSku());
        quotation.setSerial(request.serial());
        quotation.setBatch(request.batch());
        quotation.setAdditionalInfo(request.additionalInfo());
        quotation.setContactEmail(request.contactEmail());
        quotation.setContactPhone(request.contactPhone());
        quotation.setCustomFields(request.customFields());
        if (request.items() != null) {
            // Only replace items when the payload actually carries them, so a
            // partial update can never silently wipe persisted line items.
            quotation.getItems().clear();
            for (QuotationItemRequest itemRequest : request.items()) {
                if (itemRequest == null) {
                    continue;
                }
                QuotationItem item = new QuotationItem();
                item.setProductId(itemRequest.productId());
                item.setProductName(itemRequest.productName());
                item.setDescription(itemRequest.description());
                item.setSku(itemRequest.sku());
                item.setDrawingNo(itemRequest.drawingNo());
                item.setMaterial(itemRequest.material());
                item.setLeadTime(itemRequest.leadTime());
                // Serialize additional description rows [{label, value}] as JSON.
                item.setDescriptionRowsJson(ItemGridJson.writeList(itemRequest.descriptionRows()));
                item.setHsn(itemRequest.hsn());
                item.setUom(itemRequest.uom());
                item.setBatchCode(itemRequest.batchCode());
                item.setExpiryDate(itemRequest.expiryDate());
                item.setQty(nvl(itemRequest.qty(), BigDecimal.ONE));
                item.setRate(nvl(itemRequest.rate(), BigDecimal.ZERO));
                item.setDiscountPct(nvl(itemRequest.discountPct(), BigDecimal.ZERO));
                item.setGstRate(nvl(itemRequest.gstRate(), BigDecimal.ZERO));
                // Managed-grid custom column values for this row.
                item.setCustomFieldsJson(ItemGridJson.writeMap(itemRequest.customFields()));
                quotation.addItem(item);
            }
        }
    }

    private void copyReferenceFields(Quotation copy, Quotation source) {
        copy.setReference(source.getReference());
        copy.setValidUntil(source.getValidUntil());
        copy.setLeadNo(source.getLeadNo());
        copy.setSourceCw(source.getSourceCw());
        copy.setSourceCpr(source.getSourceCpr());
        copy.setReferencePrNo(source.getReferencePrNo());
        copy.setCprId(source.getCprId());
        copy.setPrReferenceId(source.getPrReferenceId());
        copy.setReferencePrSource(source.getReferencePrSource());
        copy.setFromCompany(source.getFromCompany());
        copy.setFromName(source.getFromName());
        copy.setFromAddress(source.getFromAddress());
        copy.setFromGstin(source.getFromGstin());
        copy.setFromPan(source.getFromPan());
        copy.setFromEmail(source.getFromEmail());
        copy.setFromPhone(source.getFromPhone());
        copy.setClientId(source.getClientId());
        copy.setClientName(source.getClientName());
        copy.setContactPerson(source.getContactPerson());
        copy.setEmail(source.getEmail());
        copy.setPhone(source.getPhone());
        copy.setAddress(source.getAddress());
        copy.setCity(source.getCity());
        copy.setState(source.getState());
        copy.setPin(source.getPin());
        copy.setCountry(source.getCountry());
        copy.setGstin(source.getGstin());
        copy.setPan(source.getPan());
        copy.setBillingAddress(source.getBillingAddress());
        copy.setBillingCity(source.getBillingCity());
        copy.setBillingState(source.getBillingState());
        copy.setBillingPin(source.getBillingPin());
        copy.setShipSameAsBill(source.isShipSameAsBill());
        copy.setShippingAddress(source.getShippingAddress());
        copy.setShippingCity(source.getShippingCity());
        copy.setShippingState(source.getShippingState());
        copy.setShippingPin(source.getShippingPin());
        copy.setTaxType(source.getTaxType());
        copy.setCurrency(source.getCurrency());
        copy.setExchangeRate(source.getExchangeRate());
        copy.setBaseCurrency(source.getBaseCurrency());
        copy.setNumberFormat(source.getNumberFormat());
        copy.setSalesPerson(source.getSalesPerson());
        copy.setPaymentTerms(source.getPaymentTerms());
        copy.setRemarks(source.getRemarks());
        copy.setTerms(source.getTerms());
        copy.setDiscount(source.getDiscount());
        copy.setCharges(source.getCharges());
    }

    private void copyItem(QuotationItem target, QuotationItem source) {
        target.setProductId(source.getProductId());
        target.setProductName(source.getProductName());
        target.setDescription(source.getDescription());
        target.setSku(source.getSku());
        target.setHsn(source.getHsn());
        target.setUom(source.getUom());
        target.setBatchCode(source.getBatchCode());
        target.setExpiryDate(source.getExpiryDate());
        target.setQty(source.getQty());
        target.setRate(source.getRate());
        target.setDiscountPct(source.getDiscountPct());
        target.setGstRate(source.getGstRate());
        // Duplicated/revisioned rows keep their managed-grid custom values.
        target.setCustomFieldsJson(source.getCustomFieldsJson());
        target.setDescriptionRowsJson(source.getDescriptionRowsJson());
    }

    /**
     * Exact calculation from the original ERP (js/quotation-create.js):
     * grossAmt = qty * rate; discAmt = grossAmt * disc%/100; netAmt = grossAmt - discAmt;
     * cgst = sgst = netAmt * gst/2/100; lineTotal = netAmt + cgst + sgst;
     * subTotal = Σ netAmt; grandTotal = subTotal + taxTotal - discount + charges.
     */
    private void recalcTotals(Quotation quotation) {
        BigDecimal subTotal = BigDecimal.ZERO;
        BigDecimal cgstTotal = BigDecimal.ZERO;
        BigDecimal sgstTotal = BigDecimal.ZERO;
        for (QuotationItem item : quotation.getItems()) {
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
        quotation.setSubTotal(subTotal.setScale(2, RoundingMode.HALF_UP));
        quotation.setCgstTotal(cgstTotal.setScale(2, RoundingMode.HALF_UP));
        quotation.setSgstTotal(sgstTotal.setScale(2, RoundingMode.HALF_UP));
        BigDecimal taxTotal = cgstTotal.add(sgstTotal);
        quotation.setTaxTotal(taxTotal.setScale(2, RoundingMode.HALF_UP));
        BigDecimal discount = nvl(quotation.getDiscount(), BigDecimal.ZERO);
        BigDecimal charges = nvl(quotation.getCharges(), BigDecimal.ZERO)
                .add(nvl(quotation.getFreight(), BigDecimal.ZERO))
                .add(nvl(quotation.getInsurance(), BigDecimal.ZERO));
        BigDecimal grand = subTotal.add(taxTotal).subtract(discount).add(charges);
        if (grand.compareTo(BigDecimal.ZERO) < 0) {
            grand = BigDecimal.ZERO;
        }
        quotation.setGrandTotal(grand.setScale(2, RoundingMode.HALF_UP));
        if (subTotal.compareTo(BigDecimal.ZERO) > 0 && discount.compareTo(BigDecimal.ZERO) > 0) {
            quotation.setDiscountPct(discount.multiply(BigDecimal.valueOf(100))
                    .divide(subTotal, 2, RoundingMode.HALF_UP));
        } else {
            quotation.setDiscountPct(BigDecimal.ZERO);
        }
    }

    private Specification<Quotation> buildSpecification(String search, String status, String client,
                                                        String salesPerson, String dateFrom, String dateTo,
                                                        String validTill,
                                                        BigDecimal minAmount, BigDecimal maxAmount) {
        return buildSpecification(search, status, client, salesPerson, dateFrom, dateTo, validTill,
                minAmount, maxAmount, null, null);
    }

    /**
     * Filter specification. `followUpStatus` and `poStatus` are resolved with
     * correlated EXISTS sub-queries so they filter the WHOLE server-side result
     * set (never a single loaded page) without N+1 round trips.
     */
    private Specification<Quotation> buildSpecification(String search, String status, String client,
                                                        String salesPerson, String dateFrom, String dateTo,
                                                        String validTill,
                                                        BigDecimal minAmount, BigDecimal maxAmount,
                                                        String followUpStatus, String poStatus) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            // Keep only the current row of each revision chain so the list shows
            // one row per quotation (older revisions are surfaced through the
            // Quotation No dropdown, never as separate list rows).
            predicates.add(latestPerChainPredicate(root, query, cb));
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("quotationNo")), like),
                        cb.like(cb.lower(root.get("clientName")), like),
                        cb.like(cb.lower(root.get("salesPerson")), like),
                        cb.like(cb.lower(root.get("leadNo")), like),
                        cb.like(cb.lower(cb.toString(root.get("reference"))), like),
                        // The list's Reference PR No. column is searchable too: the
                        // quotation's real source PR reference (CPR reference or a
                        // directly registered PR No.).
                        cb.like(cb.lower(cb.toString(root.get("referencePrNo"))), like),
                        cb.like(cb.lower(cb.toString(root.get("remarks"))), like)
                ));
            }
            if (status != null && status.isBlank() == false && "converted".equalsIgnoreCase(status.trim())) {
                // "Converted" is driven by the real conversion references, not by a
                // status value, so filtering by it lists the quotations that were
                // actually converted to another document.
                predicates.add(cb.or(
                        conversionMade(cb, root, "convertedToSo"), conversionMade(cb, root, "convertedToPi"),
                        conversionMade(cb, root, "convertedToInvoice"), conversionMade(cb, root, "convertedToCn"),
                        conversionMade(cb, root, "convertedToPr"), conversionMade(cb, root, "convertedToSc"),
                        conversionMade(cb, root, "convertedToDc")));
                predicates.add(cb.not(root.get("status").in("archived", "deleted")));
            } else if (status != null && !status.isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("status")), status.trim().toLowerCase()));
            } else {
                predicates.add(cb.not(root.get("status").in("archived", "deleted")));
            }
            if (client != null && !client.isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("clientName")), client.trim().toLowerCase()));
            }
            if (salesPerson != null && !salesPerson.isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("salesPerson")), salesPerson.trim().toLowerCase()));
            }
            if (dateFrom != null && !dateFrom.isBlank()) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("quotationDate"), LocalDate.parse(dateFrom).atStartOfDay()));
            }
            if (dateTo != null && !dateTo.isBlank()) {
                predicates.add(cb.lessThanOrEqualTo(root.get("quotationDate"), LocalDate.parse(dateTo).atTime(23, 59, 59)));
            }
            if (validTill != null && !validTill.isBlank()) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("validUntil"), LocalDate.parse(validTill).atStartOfDay()));
            }
            if (minAmount != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("grandTotal"), minAmount));
            }
            if (maxAmount != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("grandTotal"), maxAmount));
            }

            // ---- Follow-up Status (followups.quotationId) ----
            if (followUpStatus != null && !followUpStatus.isBlank()) {
                String wanted = followUpStatus.trim();
                boolean none = wanted.equalsIgnoreCase("none") || wanted.equalsIgnoreCase("no follow-up")
                        || wanted.equalsIgnoreCase("no followup");
                Subquery<Long> followUpSub = query.subquery(Long.class);
                Root<FollowUp> followUp = followUpSub.from(FollowUp.class);
                List<Predicate> followUpWhere = new ArrayList<>();
                followUpWhere.add(cb.equal(followUp.get("quotationId"), root.get("id")));
                followUpWhere.add(cb.notEqual(followUp.get("status"), "Deleted"));
                if (!none) {
                    followUpWhere.add(cb.equal(cb.lower(followUp.get("status")), wanted.toLowerCase()));
                }
                followUpSub.select(followUp.get("id")).where(followUpWhere.toArray(new Predicate[0]));
                predicates.add(none ? cb.not(cb.exists(followUpSub)) : cb.exists(followUpSub));
            }

            // ---- PO Status (sales_orders.qtnRef = quotations.quotation_no) ----
            if (poStatus != null && !poStatus.isBlank()) {
                String wanted = poStatus.trim();
                boolean none = wanted.equalsIgnoreCase("none") || wanted.equalsIgnoreCase("not released")
                        || wanted.equalsIgnoreCase("not_released");
                Subquery<Long> poSub = query.subquery(Long.class);
                Root<SalesOrder> po = poSub.from(SalesOrder.class);
                List<Predicate> poWhere = new ArrayList<>();
                // The CPO records the CHAIN ORIGINAL's quotation number, so a
                // revision row matches through its chain original too.
                Subquery<String> chainNumber = query.subquery(String.class);
                Root<Quotation> chain = chainNumber.from(Quotation.class);
                chainNumber.select(chain.<String>get("quotationNo"))
                        .where(cb.equal(chain.get("id"), root.get("revisionOf")));
                poWhere.add(cb.or(
                        cb.equal(po.get("qtnRef"), root.get("quotationNo")),
                        cb.and(cb.isNotNull(root.get("revisionOf")),
                                cb.equal(po.get("qtnRef"), chainNumber))));
                poWhere.add(cb.notEqual(po.get("status"), "deleted"));
                poWhere.add(cb.isTrue(po.get("latestRevision")));
                if (!none) {
                    if (wanted.equalsIgnoreCase("released")) {
                        poWhere.add(cb.notEqual(cb.lower(po.get("status")), "cancelled"));
                    } else if (wanted.equalsIgnoreCase("cancelled")) {
                        poWhere.add(cb.equal(cb.lower(po.get("status")), "cancelled"));
                    } else {
                        poWhere.add(cb.equal(cb.lower(po.get("status")), wanted.toLowerCase()));
                    }
                }
                poSub.select(po.get("id")).where(poWhere.toArray(new Predicate[0]));
                predicates.add(none ? cb.not(cb.exists(poSub)) : cb.exists(poSub));
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
            case "clientName", "salesPerson", "quotationDate", "validUntil", "grandTotal", "status", "createdAt", "updatedAt", "referencePrNo" -> field;
            case "id", "quotationNo" -> "quotationNo";
            case "itemsCount" -> "id";
            default -> "createdAt";
        };
        boolean asc = parts.length > 1 && "asc".equalsIgnoreCase(parts[1]);
        return Sort.by(asc ? Sort.Direction.ASC : Sort.Direction.DESC, mapped);
    }

    private long nextSequence() {
        long count = quotationRepository.count();
        long maxSuffix = 0;
        // The document numbers this method itself writes are QTN-YYYY-NNNNNN
        // (see buildNo below). Scanning the old "Q-YYYY-" prefix never matched a
        // stored number, so the sequence fell back to row.count() + 1 and handed
        // out a number that already existed (e.g. QTN-2026-000018 twice).
        String prefix = "QTN-" + Year.now().getValue() + "-";
        for (String no : quotationRepository.findAllQuotationNos()) {
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
        return String.format("QTN-%d-%06d", Year.now().getValue(), sequence);
    }

    /**
     * The quotation number that identifies the whole revision chain. Converting a
     * revision row must store this, because a revision row's own number carries a
     * {@code (n)} revision suffix that the rest of the application never uses as a
     * document reference.
     */
    private String chainOriginalNo(Quotation quotation) {
        if (quotation == null || quotation.getRevisionOf() == null) {
            return quotation == null ? null : quotation.getQuotationNo();
        }
        return quotationRepository.findById(quotation.getRevisionOf())
                .map(Quotation::getQuotationNo)
                .orElse(quotation.getQuotationNo());
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

    private String buildScNumber() {
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
        return String.format("SC-%d-%06d", Year.now().getValue(), Math.max(salesContractRepository.count(), maxSuffix) + 1);
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
        if ("converted".equals(normalized)) {
            // ROOT CAUSE GUARD — "Converted" is NOT a lifecycle status. It is
            // derived from the quotation's real convertedToX references, and
            // conversions record themselves through convertToX(...) /
            // recordConversion(...). Writing it to `status` is what made the list
            // show "converted" instead of the quotation's actual status, so it is
            // rejected here rather than silently stored.
            throw new BadRequestException("'Converted' is derived from the quotation's conversion "
                    + "references and cannot be set as a status. Use the conversion action instead.");
        }
        return switch (normalized) {
            case "negotiation" -> "negotiation";
            case "archived" -> "archived";
            case "deleted" -> "deleted";
            case "accepted" -> "accepted";
            case "rejected" -> "rejected";
            case "expired" -> "expired";
            case "cancelled" -> "cancelled";
            case "sent" -> "sent";
            case "submitted" -> "submitted";
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

    // ========================= Quotation Remarks =========================
    //
    // The Overview page's Remarks section. Each remark is its own MySQL row so
    // it keeps a real author and timestamp (the quotation's free-text
    // `remarks` column keeps its existing meaning and is untouched).

    @Transactional(readOnly = true)
    public List<QuotationRemarkResponse> listRemarks(Long quotationId) {
        getQuotation(quotationId); // 404 for a missing quotation
        return quotationRemarkRepository.findByQuotationIdOrderByCreatedAtDescIdDesc(quotationId)
                .stream()
                .map(QuotationService::toRemarkResponse)
                .toList();
    }

    public QuotationRemarkResponse addRemark(Long quotationId, QuotationRemarkRequest request) {
        Quotation quotation = getQuotation(quotationId);
        String text = request == null ? null : request.text();
        if (text == null || text.isBlank()) {
            throw new BadRequestException("Remark text is required");
        }
        QuotationRemark remark = new QuotationRemark();
        remark.setQuotationId(quotationId);
        remark.setText(text.trim());
        // The REAL authenticated user (from the JWT) is recorded — never a
        // hardcoded "Admin User"/"System" fallback for a user-created record.
        remark.setAddedBy(currentUserName());
        QuotationRemark saved = quotationRemarkRepository.save(remark);
        addTimeline(quotation, "remark", "Remark Added", text.trim());
        return toRemarkResponse(saved);
    }

    public void deleteRemark(Long quotationId, Long remarkId) {
        Quotation quotation = getQuotation(quotationId);
        QuotationRemark remark = quotationRemarkRepository.findById(remarkId)
                .orElseThrow(() -> new ResourceNotFoundException("Remark not found with id: " + remarkId));
        if (!quotationId.equals(remark.getQuotationId())) {
            throw new BadRequestException("Remark does not belong to this quotation");
        }
        quotationRemarkRepository.delete(remark);
        addTimeline(quotation, "remark", "Remark Deleted", "A remark was removed from this quotation.");
    }

    private static QuotationRemarkResponse toRemarkResponse(QuotationRemark remark) {
        return new QuotationRemarkResponse(
                remark.getId(),
                remark.getQuotationId(),
                remark.getText(),
                remark.getAddedBy(),
                remark.getCreatedAt());
    }

    private String currentUserName() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getName() != null && !"anonymousUser".equals(auth.getName())) {
            return auth.getName();
        }
        return "System";
    }

    private void addTimeline(Quotation quotation, String type, String title, String detail) {
        SalesTimeline entry = new SalesTimeline();
        entry.setModuleType(MODULE);
        entry.setModuleId(quotation.getId());
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

    private void addHistory(Quotation quotation, String field, String oldValue, String newValue, String changedBy) {
        SalesHistory entry = new SalesHistory();
        entry.setModuleType(MODULE);
        entry.setModuleId(quotation.getId());
        entry.setField(field);
        entry.setOldValue(oldValue);
        entry.setNewValue(newValue);
        entry.setChangedBy(changedBy);
        historyRepository.save(entry);
    }
}
