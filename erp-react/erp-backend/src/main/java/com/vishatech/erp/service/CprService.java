package com.vishatech.erp.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.dto.CostWorkoutAttachment;
import com.vishatech.erp.dto.CostWorkoutCategoryRequest;
import com.vishatech.erp.dto.CostWorkoutItemRequest;
import com.vishatech.erp.dto.CostWorkoutRequest;
import com.vishatech.erp.dto.CostWorkoutResponse;
import com.vishatech.erp.dto.CprActionRequest;
import com.vishatech.erp.dto.CprAttachmentResponse;
import com.vishatech.erp.dto.CprCommentResponse;
import com.vishatech.erp.dto.CprHistoryResponse;
import com.vishatech.erp.dto.CprItemColumn;
import com.vishatech.erp.dto.CprItemRequest;
import com.vishatech.erp.dto.CprItemResponse;
import com.vishatech.erp.dto.CprCustomerConversionResponse;
import com.vishatech.erp.dto.CprNextNumberResponse;
import com.vishatech.erp.dto.CprRequest;
import com.vishatech.erp.dto.CprResponse;
import com.vishatech.erp.crm.dto.CustomerRequest;
import com.vishatech.erp.crm.dto.CustomerResponse;
import com.vishatech.erp.dto.CprTimelineResponse;
import com.vishatech.erp.dto.RevisionInfo;
import com.vishatech.erp.entity.Cpr;
import com.vishatech.erp.entity.CprApprovalStatus;
import com.vishatech.erp.entity.CprAttachment;
import com.vishatech.erp.entity.CprComment;
import com.vishatech.erp.entity.CprHistory;
import com.vishatech.erp.entity.CprFloatDestination;
import com.vishatech.erp.entity.CprItem;
import com.vishatech.erp.entity.CprStatus;
import com.vishatech.erp.entity.CprTechnicalVerification;
import com.vishatech.erp.entity.CprTimeline;
import com.vishatech.erp.entity.TechnicalVerificationStatus;
import com.vishatech.erp.entity.DocumentVisibility;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.entity.CostWorkout;
import com.vishatech.erp.entity.CostWorkoutCategory;
import com.vishatech.erp.crm.entity.Customer;
import com.vishatech.erp.repository.CostWorkoutRepository;
import com.vishatech.erp.repository.CprRepository;
import com.vishatech.erp.repository.CprTechnicalVerificationRepository;
import com.vishatech.erp.crm.repository.CustomerRepository;
import com.vishatech.erp.util.AuditContext;
import com.vishatech.erp.crm.entity.Lead;
import com.vishatech.erp.crm.service.CustomerService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Subquery;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Year;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
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
public class CprService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private static final ObjectMapper ITEM_JSON = new ObjectMapper();

    /**
     * Reserved {@code custom_fields_json} key holding an item's Notes.
     *
     * <p>Item notes are a first-class part of the item payload
     * ({@link CprItemRequest#notes()} / {@link CprItemResponse#notes()}) but are
     * persisted in the item's existing custom-fields JSON rather than a new
     * database column: the map already stores per-item values, it is copied into
     * drafts, revisions and duplicates with the row, and no schema migration is
     * required. Custom columns use generated {@code custom_*} ids, so this
     * reserved key can never collide with one.
     */
    private static final String ITEM_NOTES_KEY = "notes";

    private final CprRepository cprRepository;
    private final FileStorageService fileStorageService;
    private final QuotationService quotationService;
    private final CostWorkoutRepository costWorkoutRepository;
    private final AuditContext auditContext;
    private final DocumentRepositoryService documentRepositoryService;
    /** Keeps a directly-registered Reference PR No in sync with its CPR. */
    private final PrReferenceService prReferenceService;
    /** Technical Verification is the gate that unlocks the Admin's float decision. */
    private final CprTechnicalVerificationRepository technicalVerificationRepository;
    /** Float-to-CW creates the Cost Workout through the real Cost Workout module. */
    private final CostWorkoutService costWorkoutService;
    /** Convert-to-Customer reuses the Client module (no parallel customer logic). */
    private final CustomerService customerService;
    private final CustomerRepository customerRepository;
    /** A closed CRM lead can no longer be the source of a new CPR. */
    private final com.vishatech.erp.crm.service.LeadService leadService;
    private final String baseUrl;

    @PersistenceContext
    private EntityManager entityManager;

    public CprService(CprRepository cprRepository, FileStorageService fileStorageService,
                      QuotationService quotationService,
                      CostWorkoutRepository costWorkoutRepository,
                      AuditContext auditContext,
                      DocumentRepositoryService documentRepositoryService,
                      PrReferenceService prReferenceService,
                      CprTechnicalVerificationRepository technicalVerificationRepository,
                      CostWorkoutService costWorkoutService,
                      CustomerService customerService,
                      CustomerRepository customerRepository,
                      com.vishatech.erp.crm.service.LeadService leadService,
                      @Value("${app.base-url:http://localhost:8080}") String baseUrl) {
        this.cprRepository = cprRepository;
        this.fileStorageService = fileStorageService;
        this.quotationService = quotationService;
        this.costWorkoutRepository = costWorkoutRepository;
        this.auditContext = auditContext;
        this.documentRepositoryService = documentRepositoryService;
        this.prReferenceService = prReferenceService;
        this.technicalVerificationRepository = technicalVerificationRepository;
        this.costWorkoutService = costWorkoutService;
        this.customerService = customerService;
        this.customerRepository = customerRepository;
        this.leadService = leadService;
        this.baseUrl = baseUrl;
    }

    // ---------------------------------------------------------------------
    // Document-mirror integration.
    //
    // SOURCE keeps every CPR mirrored into the Documents module through
    // DocumentRepositoryService#syncRecordDocumentQuietly /
    // purgeRecordDocumentsQuietly. TARGET's Documents module is protected in
    // this task and does not expose those methods, so these thin shims keep the
    // SOURCE call structure while leaving the Documents module untouched. CPR
    // attachments continue to register through registerFromAttachment, which
    // the TARGET Documents module already provides.
    // ---------------------------------------------------------------------
    private void syncCprDocument(String module, Long recordId, String code, String docType,
                                 String docNo, Long customerId, String clientName, String status) {
        // Intentionally no-op — see note above.
    }

    private void purgeCprDocument(Long recordId) {
        // Intentionally no-op — see note above.
    }

    // ============================== Read ==============================

    @Transactional(readOnly = true)
    public Page<CprResponse> list(int page, int size, String search, String sort,
                                  String status, String approval, String department,
                                  String dateFrom, String dateTo, BigDecimal minValue, BigDecimal maxValue) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort));
        Specification<Cpr> spec = buildSpecification(search, status, approval, department, dateFrom, dateTo, minValue, maxValue);
        Page<Cpr> found = cprRepository.findAll(spec, pageable);
        // One Technical-Verification query for the whole page (no N+1).
        Map<Long, WorkflowState> workflow = workflowStatesFor(found.getContent());
        return found.map(cpr -> toResponse(cpr, List.of(), workflow.get(cpr.getId())));
    }

    @Transactional(readOnly = true)
    public CprResponse get(Long id) {
        return toResponseDetail(getCpr(id));
    }

    @Transactional(readOnly = true)
    public CprNextNumberResponse getNextNumber() {
        long next = nextSequence();
        return new CprNextNumberResponse(buildPrNo(next), next);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> stats() {
        // Count only the CURRENT revision of each chain so KPI cards match
        // the list rows (older revisions are surfaced through the Document
        // Workflow dropdown, never as separate list rows).
        long draft = cprRepository.countCurrentByStatus(CprStatus.DRAFT);
        long costWorkout = cprRepository.countCurrentByStatus(CprStatus.COST_WORKOUT);
        long pendingApproval = cprRepository.countCurrentByStatus(CprStatus.PENDING_APPROVAL);
        long approved = cprRepository.countCurrentByStatus(CprStatus.APPROVED);
        long converted = cprRepository.countCurrentByStatus(CprStatus.CONVERTED);
        long rejected = cprRepository.countCurrentByStatus(CprStatus.REJECTED);
        long archived = cprRepository.countCurrentByStatus(CprStatus.ARCHIVED);
        long deleted = cprRepository.countCurrentByStatus(CprStatus.DELETED);
        long active = draft + costWorkout + pendingApproval + approved + converted + rejected;
        long quotationDeadline = cprRepository.countQuotationDeadlineExcluding(
                List.of(CprStatus.ARCHIVED, CprStatus.DELETED));
        BigDecimal totalAmt = cprRepository.sumGrandTotalExcluding(
                List.of(CprStatus.ARCHIVED, CprStatus.DELETED));

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", active);
        stats.put("active", active);
        stats.put("draft", draft);
        stats.put("costWorkout", costWorkout);
        stats.put("pendingApproval", pendingApproval);
        stats.put("approved", approved);
        stats.put("converted", converted);
        stats.put("rejected", rejected);
        stats.put("quotationDeadline", quotationDeadline);
        stats.put("archived", archived);
        stats.put("deleted", deleted);
        stats.put("totalAmt", totalAmt);
        return stats;
    }

    // ============================== Write ==============================

    public CprResponse create(CprRequest request, boolean draft) {
        Cpr cpr = new Cpr();
        // Records born from an autosave / Save-Draft are flagged as not yet
        // committed: the first explicit save commits them in place with NO
        // revision (see update()).
        cpr.setDraftOnly(draft);
        // Closed-lead lifecycle rule: a CPR cannot be started (draft or committed)
        // from a closed lead, whether the request comes from the UI or the API.
        leadService.assertLeadReferenceOpen(request.leadNo());
        cpr.setPrNo(resolveCreatePrNo(request.prNo()));
        // Enforced for EVERY save (draft and committed), so the rule cannot be
        // bypassed by a direct API call or by an autosave.
        assertReferencePrNoUnique(normalizeReferencePrNo(request.referencePrNo()), null);
        // Mirror the create-form item requirement for non-draft saves; draft
        // saves stay lenient so a blank draft can be saved.
        if (!draft && (request.items() == null || request.items().isEmpty())) {
            throw new BadRequestException("At least one item is required");
        }
        applyRequest(cpr, request);
        if (draft) {
            cpr.setStatus(CprStatus.DRAFT);
        } else if (request.status() != null && !request.status().isBlank()) {
            cpr.setStatus(parseStatus(request.status()));
        } else {
            cpr.setStatus(CprStatus.DRAFT);
        }
        cpr.setApprovalStatus(cpr.getStatus() == CprStatus.APPROVED
                ? CprApprovalStatus.APPROVED
                : CprApprovalStatus.PENDING);
        syncStage(cpr);
        recalcTotals(cpr);
        if (!draft) {
            cpr.addTimeline(entry("created", "CPR created",
                    "CPR '" + cpr.getPrNo() + "' was created."));
            cpr.addHistory(history("CPR", null, cpr.getPrNo(), currentUserName()));
        }
        Cpr saved = cprRepository.save(cpr);
        syncCprDocument(
                "CPR", saved.getId(), saved.getPrNo(), "CPR", saved.getPrNo(),
                null, saved.getClientName(), saved.getStatus().name());
        linkPrReference(saved);
        return toResponseDetail(saved);
    }

    /**
     * A CPR now carries this Reference PR No, so ownership of the PR reference
     * moves from "direct" to "CPR" (see PrReferenceService#linkCpr). Called for
     * both create and update: a PR No that was registered straight from a
     * Quotation is adopted when the CPR for it is finally raised — no duplicate
     * pr_references row and no second CPR is ever created.
     */
    private void linkPrReference(Cpr cpr) {
        prReferenceService.linkCpr(cpr.getReferencePrNo(), cpr.getId(), cpr.getPrNo());
    }

    /**
     * Persists an edit of a CPR.
     * <p>
     * The revision chain follows a strict, backend-enforced rule:
     * <ol>
     *   <li><b>Autosave / Save Draft</b> ({@code draft == true}) — updates the
     *       current row in place. No revision, no timeline entry, no
     *       edit-history: background persistence stays invisible.</li>
     *   <li><b>First explicit save</b> of a record that so far only existed
     *       because of an autosave/draft ({@code draftOnly}) — commits the row
     *       in place, records the {@code created} event and clears the flag.
     *       Still NO revision, so a brand-new CPR is exactly one original row
     *       with {@code revision == 0}. Note this keys off "has this record ever
     *       been explicitly saved?", NOT off the business status being DRAFT.
     *       </li>
     *   <li><b>Genuine edit</b> of an already committed record — creates exactly
     *       one new revision row ({@code BASE(N)}), and only when persisted
     *       business data actually changed. A no-change save creates nothing.</li>
     * </ol>
     * The row is loaded under a pessimistic lock so concurrent saves of the same
     * CPR serialize and can never produce duplicate revision numbers.
     */
    public CprResponse update(Long id, CprRequest request, boolean draft) {
        // FIRST statement of the transaction: take the row lock so a competing
        // save blocks here and then observes this transaction's committed state.
        Cpr current = cprRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ResourceNotFoundException("CPR not found with id: " + id));
        if (!current.isLatestRevision()) {
            throw new BadRequestException("Only the latest revision can be edited");
        }
        // The record's own chain may keep its Reference PR No; any other live
        // CPR may not carry the same one. A value the record ALREADY carries is
        // never re-validated, so legacy records that predate this rule (e.g. a
        // CPR duplicated before the rule existed) stay editable on every other
        // field. Checked before any write, drafts included, so editing cannot
        // bypass the rule.
        String requestedReferencePrNo = normalizeReferencePrNo(request.referencePrNo());
        if (referencePrNoChanged(requestedReferencePrNo, current.getReferencePrNo())) {
            assertReferencePrNoUnique(requestedReferencePrNo, current);
        }

        if (draft) {
            // Autosave / Save Draft: in-place, invisible to the revision chain.
            applyRequest(current, request);
            if (request.status() != null && !request.status().isBlank()) {
                current.setStatus(parseStatus(request.status()));
            }
            if (request.approvalStatus() != null && !request.approvalStatus().isBlank()) {
                current.setApprovalStatus(parseApprovalStatus(request.approvalStatus()));
            }
            syncStage(current);
            recalcTotals(current);
            current.setItemColumnsJson(serializeItemColumns(request.itemColumns()));
            return persistInPlace(current);
        }

        // First explicit save of an autosaved/no-op draft → this is the moment
        // the CPR is actually created. Commit in place; still no revision.
        if (current.getRevision() == 0 && current.isDraftOnly()) {
            current.setDraftOnly(false);
            applyRequest(current, request);
            if (request.status() != null && !request.status().isBlank()) {
                current.setStatus(parseStatus(request.status()));
            }
            if (request.approvalStatus() != null && !request.approvalStatus().isBlank()) {
                current.setApprovalStatus(parseApprovalStatus(request.approvalStatus()));
            }
            syncStage(current);
            recalcTotals(current);
            current.setItemColumnsJson(serializeItemColumns(request.itemColumns()));
            current.addTimeline(entry("created", "CPR created",
                    "CPR '" + current.getPrNo() + "' was created."));
            current.addHistory(history("CPR", null, current.getPrNo(), currentUserName()));
            return persistInPlace(current);
        }

        // ---- Genuine edit of an already committed record -------------------
        Long baseId = current.getRevisionOf() != null ? current.getRevisionOf() : current.getId();
        int nextRev = maxRevisionOfChain(baseId) + 1;

        Map<String, String> before = snapshotFields(current);
        String itemsBefore = itemsSignature(current);
        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(current);

        Cpr revision = new Cpr();
        copyForRevision(revision, current);
        applyRequest(revision, request);
        if (request.status() != null && !request.status().isBlank()) {
            revision.setStatus(parseStatus(request.status()));
        }
        if (request.approvalStatus() != null && !request.approvalStatus().isBlank()) {
            revision.setApprovalStatus(parseApprovalStatus(request.approvalStatus()));
        }
        syncStage(revision);
        recalcTotals(revision);
        revision.setPrNo(RevisionSupport.nextRevisionNumber(
                RevisionSupport.baseNumber(current.getPrNo()), nextRev));
        revision.setRevisionOf(baseId);
        revision.setRevision(nextRev);
        revision.setRevisionDate(java.time.LocalDateTime.now());
        revision.setLatestRevision(true);
        revision.setDraftOnly(false);

        List<CprTimeline> fieldChanges = changedFields(before, revision);
        // Item rows are fingerprinted as a whole, so an item edit that keeps the
        // same row count (e.g. only a qty changed) still counts as a real change.
        boolean itemsChanged = !itemsBefore.equals(itemsSignature(revision));

        // No-op guard: opening Edit and saving without touching persisted
        // business data must not fabricate a revision. UI state such as the item
        // column configuration is still persisted — just not as a revision.
        if (fieldChanges.isEmpty() && !itemsChanged) {
            current.setItemColumnsJson(serializeItemColumns(request.itemColumns()));
            return toResponseDetail(cprRepository.save(current));
        }

        if (itemsChanged && fieldChanges.stream().noneMatch(ev -> "items".equals(ev.getField()))) {
            fieldChanges.add(fieldEntry("items", "Items updated",
                    "Item details were updated by " + currentUserName() + ".",
                    "items",
                    before.get("items") == null ? "" : before.get("items"),
                    String.valueOf(revision.getItems().size())));
        }

        boolean draftSave = revision.getStatus() == CprStatus.DRAFT;
        // A summary row is always inserted per save (draft saves get a dedicated
        // event type) plus one row per changed field.
        revision.addTimeline(entry(draftSave ? "draft saved" : "updated",
                draftSave ? "Draft saved" : "CPR updated",
                (draftSave ? "Draft of CPR " : "CPR details ") + "were updated by " + currentUserName() + "."));
        fieldChanges.forEach(revision::addTimeline);

        current.setLatestRevision(false);
        cprRepository.save(current);
        Cpr saved = cprRepository.saveAndFlush(revision);
        editHistory.recordEdit("cpr", saved.getId(), editBefore, editHistory.snapshot(saved));
        syncCprDocument(
                "CPR", saved.getId(), saved.getPrNo(), "CPR", saved.getPrNo(),
                null, saved.getClientName(), saved.getStatus().name());
        linkPrReference(saved);
        return toResponseDetail(saved);
    }

    /** Saves an in-place CPR mutation and keeps its document metadata in sync. */
    private CprResponse persistInPlace(Cpr cpr) {
        Cpr saved = cprRepository.save(cpr);
        syncCprDocument(
                "CPR", saved.getId(), saved.getPrNo(), "CPR", saved.getPrNo(),
                null, saved.getClientName(), saved.getStatus().name());
        linkPrReference(saved);
        return toResponseDetail(saved);
    }

    public CprResponse delete(Long id) {
        Cpr cpr = getCpr(id);
        RevisionSupport.requireLatest(cpr.isLatestRevision());
        CprStatus previous = cpr.getStatus();
        cpr.setStatus(CprStatus.DELETED);
        cpr.setArchivedAt(LocalDateTime.now());
        cpr.addTimeline(fieldEntry("deleted", "CPR deleted", "CPR was moved to trash by " + currentUserName() + ".",
                "Status", label(previous), "Deleted"));
        cpr.addHistory(history("Status", label(previous), "Deleted", currentUserName()));
        Cpr saved = cprRepository.save(cpr);
        syncCprDocument(
                "CPR", saved.getId(), saved.getPrNo(), "CPR", saved.getPrNo(),
                null, saved.getClientName(), saved.getStatus().name());
        return toResponse(saved);
    }

    public CprResponse restore(Long id) {
        Cpr cpr = getCpr(id);
        RevisionSupport.requireLatest(cpr.isLatestRevision());
        CprStatus previous = cpr.getStatus();
        CprStatus target = previous == CprStatus.DELETED || previous == CprStatus.ARCHIVED
                ? CprStatus.DRAFT : previous;
        cpr.setStatus(target);
        cpr.setArchivedAt(null);
        cpr.addTimeline(fieldEntry("restored", "CPR restored", "CPR was restored by " + currentUserName() + ".",
                "Status", label(previous), label(target)));
        cpr.addHistory(history("Status", label(previous), label(target), currentUserName()));
        syncStage(cpr);
        Cpr saved = cprRepository.save(cpr);
        syncCprDocument(
                "CPR", saved.getId(), saved.getPrNo(), "CPR", saved.getPrNo(),
                null, saved.getClientName(), saved.getStatus().name());
        return toResponse(saved);
    }

    public CprResponse archive(Long id) {
        Cpr cpr = getCpr(id);
        RevisionSupport.requireLatest(cpr.isLatestRevision());
        CprStatus previous = cpr.getStatus();
        cpr.setStatus(CprStatus.ARCHIVED);
        cpr.setArchivedAt(LocalDateTime.now());
        cpr.addTimeline(fieldEntry("archived", "CPR archived", "CPR was archived by " + currentUserName() + ".",
                "Status", label(previous), "Archived"));
        cpr.addHistory(history("Status", label(previous), "Archived", currentUserName()));
        syncStage(cpr);
        Cpr saved = cprRepository.save(cpr);
        syncCprDocument(
                "CPR", saved.getId(), saved.getPrNo(), "CPR", saved.getPrNo(),
                null, saved.getClientName(), saved.getStatus().name());
        return toResponse(saved);
    }

    public CprResponse submit(Long id) {
        Cpr cpr = getCpr(id);
        RevisionSupport.requireLatest(cpr.isLatestRevision());
        if (cpr.getStatus() == CprStatus.PENDING_APPROVAL || cpr.getStatus() == CprStatus.APPROVED
                || cpr.getStatus() == CprStatus.CONVERTED) {
            throw new BadRequestException("CPR is already in status '" + label(cpr.getStatus()) + "' and cannot be submitted");
        }
        CprStatus previous = cpr.getStatus();
        cpr.setStatus(CprStatus.PENDING_APPROVAL);
        cpr.setApprovalStatus(CprApprovalStatus.PENDING);
        cpr.setSubmittedBy(currentUserName());
        cpr.setSubmittedAt(LocalDateTime.now());
        cpr.addTimeline(fieldEntry("submitted", "Submitted for approval",
                "CPR submitted for approval by " + currentUserName() + ".",
                "Status", label(previous), "Pending Approval"));
        cpr.addHistory(history("Status", label(previous), "Pending Approval", currentUserName()));
        syncStage(cpr);
        return toResponse(cprRepository.save(cpr));
    }

    public CprResponse approve(Long id, String remarks) {
        Cpr cpr = getCpr(id);
        RevisionSupport.requireLatest(cpr.isLatestRevision());
        CprStatus previous = cpr.getStatus();
        if (cpr.getStatus() == CprStatus.CONVERTED || cpr.getStatus() == CprStatus.DELETED) {
            throw new BadRequestException("Cannot approve a CPR in status '" + label(cpr.getStatus()) + "'");
        }
        cpr.setStatus(CprStatus.APPROVED);
        cpr.setApprovalStatus(CprApprovalStatus.APPROVED);
        cpr.setApprovedBy(currentUserName());
        cpr.setApprovalDate(LocalDateTime.now());
        cpr.setRejectedBy(null);
        cpr.setApprovalRemarks(remarks);
        cpr.addTimeline(fieldEntry("approved", "CPR approved", "CPR approved by " + currentUserName() + ".",
                "Status", label(previous), "Approved"));
        cpr.addHistory(history("Approval", label(previous), "Approved", currentUserName()));
        syncStage(cpr);
        return toResponse(cprRepository.save(cpr));
    }

    public CprResponse reject(Long id, String remarks) {
        if (remarks == null || remarks.isBlank()) {
            throw new BadRequestException("Remarks are required to reject a CPR");
        }
        Cpr cpr = getCpr(id);
        RevisionSupport.requireLatest(cpr.isLatestRevision());
        CprStatus previous = cpr.getStatus();
        cpr.setStatus(CprStatus.REJECTED);
        cpr.setApprovalStatus(CprApprovalStatus.REJECTED);
        cpr.setRejectedBy(currentUserName());
        cpr.setApprovalDate(LocalDateTime.now());
        cpr.setApprovalRemarks(remarks.trim());
        cpr.addTimeline(fieldEntry("rejected", "CPR rejected",
                "CPR rejected by " + currentUserName() + " - " + remarks.trim() + ".",
                "Status", label(previous), "Rejected"));
        cpr.addHistory(history("Approval", label(previous), "Rejected", currentUserName()));
        syncStage(cpr);
        return toResponse(cprRepository.save(cpr));
    }

    public CprResponse sendBack(Long id, String remarks) {
        if (remarks == null || remarks.isBlank()) {
            throw new BadRequestException("Remarks are required to send a CPR back");
        }
        Cpr cpr = getCpr(id);
        RevisionSupport.requireLatest(cpr.isLatestRevision());
        if (cpr.getStatus() != CprStatus.PENDING_APPROVAL) {
            throw new BadRequestException("Only CPRs pending approval can be sent back (current: '"
                    + label(cpr.getStatus()) + "')");
        }
        CprStatus previous = cpr.getStatus();
        cpr.setStatus(CprStatus.REJECTED);
        cpr.setApprovalStatus(CprApprovalStatus.REJECTED);
        cpr.setRejectedBy(currentUserName());
        cpr.setApprovalDate(LocalDateTime.now());
        cpr.setApprovalRemarks("Sent back: " + remarks.trim());
        cpr.addTimeline(fieldEntry("send back", "CPR sent back",
                "CPR sent back by " + currentUserName() + " - " + remarks.trim() + ".",
                "Status", label(previous), "Sent Back"));
        cpr.addHistory(history("Approval", label(previous), "Sent Back", currentUserName()));
        syncStage(cpr);
        return toResponse(cprRepository.save(cpr));
    }

    // ===================== Technical Verification → Admin Approval → Float =====================

    /**
     * Where a CPR stands in the Technical-Verification → Admin-Approval → Float
     * workflow.
     *
     * Derived, not stored: the verification rows are the single source of truth
     * for the gate, and {@code Cpr.floatDestination} is the single source of truth
     * for the Admin's decision. Keeping them apart is what stops the CPR
     * lifecycle status, the verification state, the approval state and the float
     * destination from collapsing into one field.
     *
     * @param verificationStatus  verification state to display (worst row wins)
     * @param verificationNo      reference of the first verification row
     * @param verificationCount   number of item-level verification rows
     * @param verificationCompleted  the GATE: every item-level row is verified
     * @param adminApprovalState  NOT_READY | PENDING | APPROVED_PR | APPROVED_CW | REJECTED
     * @param floatDestination    the executed destination (PR / CW) or null
     */
    private record WorkflowState(String verificationStatus, String verificationNo, int verificationCount,
                                 boolean verificationCompleted, String adminApprovalState,
                                 String floatDestination) {

        static WorkflowState none() {
            return new WorkflowState(null, null, 0, false, "NOT_READY", null);
        }
    }

    /** Batch resolver — one verification query for a whole page (no N+1). */
    private Map<Long, WorkflowState> workflowStatesFor(List<Cpr> cprs) {
        if (cprs == null || cprs.isEmpty()) {
            return Map.of();
        }
        List<Long> ids = cprs.stream().map(Cpr::getId).filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<Long, List<CprTechnicalVerification>> byCpr = new LinkedHashMap<>();
        for (CprTechnicalVerification tv : technicalVerificationRepository.findAllByCprIdIn(ids)) {
            byCpr.computeIfAbsent(tv.getCpr().getId(), k -> new ArrayList<>()).add(tv);
        }
        Map<Long, WorkflowState> out = new LinkedHashMap<>();
        for (Cpr cpr : cprs) {
            out.put(cpr.getId(), workflowState(cpr, byCpr.getOrDefault(cpr.getId(), List.of())));
        }
        return out;
    }

    private WorkflowState workflowState(Cpr cpr, List<CprTechnicalVerification> rows) {
        if (cpr == null) {
            return WorkflowState.none();
        }
        boolean legacyForwarded = rows.stream().anyMatch(CprTechnicalVerification::isForwardedToCostWorkout);
        CprFloatDestination destination = cpr.getFloatDestination() != null
                ? cpr.getFloatDestination()
                : (legacyForwarded ? CprFloatDestination.CW : null);

        if (rows.isEmpty()) {
            // No verification rows at all: the gate is closed. A legacy float that
            // happened before verification rows existed still reports its destination.
            String state = destination == null ? "NOT_READY" : approvedState(destination);
            return new WorkflowState(null, null, 0, false, state,
                    destination == null ? null : destination.name());
        }

        // Worst row wins, so ONE unverified item keeps the whole CPR gate closed.
        TechnicalVerificationStatus worst = null;
        boolean rejected = false;
        for (CprTechnicalVerification tv : rows) {
            TechnicalVerificationStatus status = tv.getStatus();
            if (status == TechnicalVerificationStatus.REJECTED) {
                rejected = true;
            }
            if (status == null || isVerified(status)) {
                continue;
            }
            worst = worst == null ? status : (rank(status) < rank(worst) ? status : worst);
        }
        boolean completed = !rejected && worst == null;
        String verificationStatus = completed
                ? TechnicalVerificationStatus.VERIFICATION_COMPLETED.name()
                : (rejected ? TechnicalVerificationStatus.REJECTED.name() : worst.name());
        String verificationNo = rows.get(0).getTvNo();

        String approvalState;
        if (destination != null) {
            approvalState = approvedState(destination);
        } else if (cpr.getApprovalStatus() == CprApprovalStatus.REJECTED) {
            approvalState = "REJECTED";
        } else if (!completed) {
            approvalState = "NOT_READY";
        } else {
            approvalState = "PENDING";
        }
        return new WorkflowState(verificationStatus, verificationNo, rows.size(), completed, approvalState,
                destination == null ? null : destination.name());
    }

    private static String approvedState(CprFloatDestination destination) {
        return destination == CprFloatDestination.PR ? "APPROVED_PR" : "APPROVED_CW";
    }

    private static boolean isVerified(TechnicalVerificationStatus status) {
        return status == TechnicalVerificationStatus.VERIFICATION_COMPLETED
                || status == TechnicalVerificationStatus.APPROVED
                || status == TechnicalVerificationStatus.FORWARDED_TO_COST_WORKOUT;
    }

    /** Advance order, so the LEAST advanced row can be reported. */
    private static int rank(TechnicalVerificationStatus status) {
        return switch (status) {
            case PENDING_FILE -> 0;
            case DRAFT -> 1;
            case UNDER_VERIFICATION -> 2;
            default -> 3;
        };
    }

    /**
     * Admin approval + float — the ONLY way a technically-verified CPR reaches PR
     * or Cost Workout.
     *
     * Technical Verification is the gate (every item-level row must be verified)
     * and the Admin's approval names exactly ONE destination, so this is not
     * something the frontend can bypass: the gate, the "already floated" guard and
     * the document creation all run here, in one transaction.
     *
     * Idempotent by construction: a CPR that already carries a destination (or was
     * forwarded through the legacy Cost Workout link) is rejected with the existing
     * reference — a double click, a retry or a page refresh can never produce a
     * second PR or a second Cost Workout.
     */
    public CprResponse floatCpr(Long id, String destinationValue, String remarks) {
        Cpr cpr = getCpr(id);
        RevisionSupport.requireLatest(cpr.isLatestRevision());
        if (cpr.getStatus() == CprStatus.ARCHIVED || cpr.getStatus() == CprStatus.DELETED) {
            throw new BadRequestException("Cannot float a CPR in status '" + label(cpr.getStatus()) + "'");
        }
        CprFloatDestination destination = CprFloatDestination.parse(destinationValue);
        if (destination == null) {
            throw new BadRequestException("Destination is required: PR or CW");
        }

        List<CprTechnicalVerification> rows =
                technicalVerificationRepository.findAllByCprIdOrderByIdAsc(cpr.getId());
        WorkflowState state = workflowState(cpr, rows);

        // ---- Gate: Technical Verification must be complete ----
        if (!state.verificationCompleted()) {
            throw new BadRequestException(state.verificationCount() == 0
                    ? "Technical verification has not been started for this CPR — it must be completed before an Admin can float it."
                    : "Technical verification is not complete (" + state.verificationStatus()
                            + "). Every item must be verified before an Admin can float this CPR.");
        }

        // ---- Idempotency: one destination per CPR, ever ----
        if (state.floatDestination() != null) {
            String reference = CprFloatDestination.PR.name().equals(state.floatDestination())
                    ? cpr.getFloatedPrNo()
                    : cpr.getCostWorkoutCwNo();
            throw new BadRequestException("CPR " + cpr.getPrNo() + " has already been floated to "
                    + CprFloatDestination.parse(state.floatDestination()).getLabel()
                    + (reference == null || reference.isBlank() ? "" : " as " + reference)
                    + " — a second destination cannot be executed.");
        }

        CprStatus previous = cpr.getStatus();
        String reference;
        if (destination == CprFloatDestination.PR) {
            reference = prReferenceService.registerForCpr(cpr, remarks);
            cpr.setFloatedPrNo(reference);
            cpr.setStatus(CprStatus.APPROVED);
        } else {
            CostWorkoutResponse cw = costWorkoutService.create(costWorkoutRequestFromCpr(cpr, remarks), true);
            reference = cw.cwNo();
            cpr.setCostWorkoutId(cw.id());
            cpr.setCostWorkoutCwNo(cw.cwNo());
            cpr.setCostWorkoutStatus(cw.status());
            cpr.setStatus(CprStatus.COST_WORKOUT);
            forwardVerificationsToCostWorkout(cpr, rows, cw);
        }

        cpr.setFloatDestination(destination);
        cpr.setFloatedAt(LocalDateTime.now());
        cpr.setFloatedBy(currentUserName());
        cpr.setApprovalStatus(CprApprovalStatus.APPROVED);
        cpr.setApprovedBy(currentUserName());
        cpr.setApprovalDate(LocalDateTime.now());
        cpr.setRejectedBy(null);
        cpr.setApprovalRemarks(remarks);
        String title = "Floated to " + destination.getLabel();
        cpr.addTimeline(fieldEntry("float", title,
                "Admin " + currentUserName() + " approved " + cpr.getPrNo() + " and floated it to "
                        + destination.getLabel() + " as " + reference
                        + (remarks == null || remarks.isBlank() ? "." : " — " + remarks.trim()),
                "Admin Approval", "Pending", "Approved → " + destination.getLabel()));
        cpr.addHistory(history("Admin Approval", label(previous),
                "Approved → " + destination.getLabel(), currentUserName()));
        syncStage(cpr);
        Cpr saved = cprRepository.save(cpr);
        syncCprDocument(
                "CPR", saved.getId(), saved.getPrNo(), "CPR", saved.getPrNo(),
                null, saved.getClientName(), saved.getStatus().name());
        return toResponseDetail(saved);
    }

    /**
     * Build the Cost Workout payload from the verified CPR — only the fields the
     * Cost Workout actually needs, so no unrelated CPR data is duplicated.
     *
     * <p>Only the CPR's own <b>header</b> travels: its number ({@code cprRef} /
     * {@code linkedCpr} / {@code cprId}), the customer/company details, the
     * department, the prepared-by, the profit % and the float remarks. The CPR's
     * individual material/item rows are deliberately NOT copied: a CPR holds what
     * the CUSTOMER asked for, while a Cost Workout is the company's own costing of
     * the job. Its item section therefore starts from the same single blank row
     * the Cost Workout form opens with and is filled in on that screen. The CPR's
     * own items stay in the CPR untouched, the record-level link keeps the two
     * documents connected, and the CPR's item-grid column definitions are not
     * copied either — the Cost Workout grid is its own module configuration.
     */
    private CostWorkoutRequest costWorkoutRequestFromCpr(Cpr cpr, String remarks) {
        String preparedBy = firstNonBlank(cpr.getRequestedBy(), currentUserName());
        String sourceLead = firstNonBlank(cpr.getSourceLead(), cpr.getClientName(), cpr.getCompany());
        return new CostWorkoutRequest(
                null,
                LocalDate.now().format(DATE_FMT),
                null,
                preparedBy,
                cpr.getContactPerson(),
                firstNonBlank(cpr.getDepartment(), "Sales"),
                sourceLead,
                cpr.getClientName(),
                cpr.getPrNo(),
                cpr.getId(),
                cpr.getPhone(),
                cpr.getEmail(),
                cpr.getCompany(),
                cpr.getGst(),
                cpr.getPan(),
                cpr.getPrNo(),
                cpr.getBillingAddress(),
                cpr.getShippingAddress(),
                remarks,
                cpr.getProfitPercent(),
                null,
                null,
                List.of(blankCostWorkoutItem()),
                null,
                null);
    }

    /**
     * The one empty item row a floated Cost Workout is born with — identical to
     * the row the Cost Workout form renders for a new record (description "",
     * qty 1, unit "Nos", one empty "Material Cost" category). It carries no CPR
     * data; it exists because the Cost Workout service rejects a record that has
     * no item content at all, so the destination always opens as a usable, blank
     * costing sheet.
     */
    private CostWorkoutItemRequest blankCostWorkoutItem() {
        return new CostWorkoutItemRequest(
                "",
                // A floated CW starts blank — it carries no CPR data, so there is no
                // CPR description to seed.
                "",
                BigDecimal.ONE,
                "Nos",
                List.of(new CostWorkoutCategoryRequest("Material Cost", BigDecimal.ONE, "Nos",
                        BigDecimal.ZERO, null)),
                null,
                // No item-level documents: a floated CW starts blank.
                null);
    }

    /**
     * Mirror the float onto the item-level verification rows (and forward their
     * internal documents), so the Technical Verification screen reflects the same
     * destination instead of still claiming an un-forwarded, verified record.
     */
    private void forwardVerificationsToCostWorkout(Cpr cpr, List<CprTechnicalVerification> rows,
                                                  CostWorkoutResponse cw) {
        for (CprTechnicalVerification tv : rows) {
            if (!tv.isForwardedToCostWorkout()) {
                tv.setForwardedToCostWorkout(true);
                tv.setForwardedAt(LocalDateTime.now());
                tv.setForwardedBy(currentUserName());
                tv.setCostWorkoutId(cw.id());
                tv.setCostWorkoutCwNo(cw.cwNo());
                tv.setStatus(TechnicalVerificationStatus.FORWARDED_TO_COST_WORKOUT);
            }
            for (com.vishatech.erp.entity.CprTechnicalVerificationDocument doc : tv.getDocuments()) {
                if (!doc.isSentToCostWorkout()
                        && (doc.getVisibility() == DocumentVisibility.TEAM_ONLY
                        || doc.getVisibility() == DocumentVisibility.BOTH)) {
                    doc.setSentToCostWorkout(true);
                    doc.setCostWorkoutId(cw.id());
                    doc.setCostWorkoutCwNo(cw.cwNo());
                    doc.setSentAt(LocalDateTime.now());
                    doc.setSentBy(currentUserName());
                }
            }
        }
        technicalVerificationRepository.saveAll(rows);
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    public CprResponse convertToQuotation(Long id) {
        Cpr cpr = getCpr(id);
        if (cpr.getStatus() != CprStatus.APPROVED) {
            throw new BadRequestException("Only approved CPRs can be converted to a quotation");
        }
        if (cpr.getQuotationId() != null
                || (cpr.getConvertedToQtn() != null && !cpr.getConvertedToQtn().isBlank())) {
            throw new BadRequestException("CPR is already converted to quotation '"
                    + cpr.getConvertedToQtn() + "' — duplicate conversion is not allowed");
        }
        CprStatus previous = cpr.getStatus();
        // Persist a real quotation row (MySQL) and link the CPR to it.
        com.vishatech.erp.dto.QuotationResponse quotation = quotationService.createFromCpr(cpr);
        cpr.setStatus(CprStatus.CONVERTED);
        cpr.setConvertedToQtn(quotation.quotationNo());
        cpr.setQuotationId(quotation.id());
        cpr.addTimeline(fieldEntry("converted", "Converted to quotation",
                "CPR converted to quotation " + quotation.quotationNo() + ".",
                "Status", label(previous), "Converted"));
        cpr.addHistory(history("Status", label(previous), "Converted", currentUserName()));
        syncStage(cpr);
        return toResponse(cprRepository.save(cpr));
    }

    /**
     * Convert a CPR into a CRM Client — the "Convert to Customer" action.
     *
     * <p>Real, transactional and idempotent:
     * <ol>
     *   <li>a CPR that is already linked to a live client returns that client
     *       untouched (clicking the action twice never creates a second
     *       customer);</li>
     *   <li>otherwise the ERP's own client identity rules are applied — an
     *       existing client is reused when its GSTIN, then PAN, then business
     *       name already matches the CPR ({@link CustomerRepository});</li>
     *   <li>otherwise a real client row is created through the Client module
     *       ({@link CustomerService#create}), which owns client-code
     *       generation, contacts, shipping addresses and document sync.</li>
     * </ol>
     *
     * <p>The CPR ↔ Client relationship is persisted in place on the CPR row
     * ({@code client_id}). This is a linkage, not an edit: it deliberately does
     * NOT go through {@code applyRequest}/revision handling, so CPR items,
     * attachments, notes and the revision chain are untouched. It is additive —
     * only {@code clientId} (and a blank {@code clientName}) is written, plus a
     * timeline and history entry recording who linked which client.
     */
    @Transactional
    public CprCustomerConversionResponse convertToCustomer(Long id) {
        Cpr cpr = cprRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ResourceNotFoundException("CPR not found with id: " + id));
        if (!cpr.isLatestRevision()) {
            throw new BadRequestException("Only the latest revision of a CPR can be converted to a customer");
        }
        if (cpr.getStatus() == CprStatus.DELETED) {
            throw new BadRequestException("A deleted CPR cannot be converted to a customer");
        }

        // 1) Already linked to a live client → reuse it (idempotent).
        if (cpr.getClientId() != null) {
            Customer linked = customerRepository.findById(cpr.getClientId()).orElse(null);
            if (linked != null && !"Deleted".equalsIgnoreCase(linked.getStatus())) {
                return new CprCustomerConversionResponse(cpr.getId(), cpr.getPrNo(), linked.getId(),
                        linked.getClientCode(), linked.getBusinessName(), false, true);
            }
        }

        String businessName = firstNonBlank(cpr.getClientName(), cpr.getCompany());
        if (businessName == null) {
            throw new BadRequestException(
                    "This CPR has no customer name. Fill in Client Name (or Company) on the CPR before converting it to a customer.");
        }

        // 2) Reuse an existing client identified by the ERP's own rules.
        Customer existing = null;
        if (isNotBlank(cpr.getGst())) {
            existing = customerRepository.findByGstinIgnoreCase(cpr.getGst().trim()).orElse(null);
        }
        if (existing == null && isNotBlank(cpr.getPan())) {
            existing = customerRepository.findByPanIgnoreCase(cpr.getPan().trim()).orElse(null);
        }
        if (existing == null) {
            existing = customerRepository.findByBusinessNameIgnoreCase(businessName).orElse(null);
        }
        if (existing != null && "Deleted".equalsIgnoreCase(existing.getStatus())) {
            existing = null;
        }

        Long customerId;
        String clientCode;
        String clientName;
        boolean created = false;
        if (existing != null) {
            customerId = existing.getId();
            clientCode = existing.getClientCode();
            clientName = existing.getBusinessName();
        } else {
            // 3) Create the client through the real Client module.
            CustomerResponse createdClient = customerService.create(new CustomerRequest(
                    businessName,
                    null,                                  // clientCode → generated by the Client module
                    null,                                  // alias
                    cpr.getContactPerson(),
                    cpr.getEmail(),
                    cpr.getPhone(),
                    cpr.getGst(),
                    cpr.getPan(),
                    cpr.getBillingAddress(),
                    null, null, null,                      // billing city / state / pin
                    cpr.getShippingAddress(),
                    null, null, null,                      // shipping city / state / pin
                    null,                                  // country → Client default
                    null, null, null,                      // paymentTerms / creditLimit / salesPerson
                    null,
                    "Active",
                    cpr.getRemarks(),
                    null, null, null, null, null, null,    // industry / website / clientType / taxTreatment / mapNo / currency
                    null, null, null, null, null, null,    // bankName / accountHolderName / accountNumber / ifsc / branch / upiId
                    null,                                  // openingBalance
                    null,                                  // contacts → contactPerson already mapped above
                    null,                                  // shippingAddresses
                    null,                                  // leadId → a CPR client is not converted from a lead
                    null));                                // linkedContactIds
            customerId = createdClient.id();
            clientCode = createdClient.clientCode();
            clientName = createdClient.businessName();
            created = true;
        }

        Long previousClientId = cpr.getClientId();
        cpr.setClientId(customerId);
        if (!isNotBlank(cpr.getClientName())) {
            cpr.setClientName(clientName);
        }
        String clientLabel = (clientName == null ? "client" : clientName)
                + (clientCode == null ? "" : " (" + clientCode + ")");
        cpr.addTimeline(entry("converted", "Converted to customer",
                "CPR " + cpr.getPrNo() + " was linked to " + clientLabel
                        + (created ? " — a new client was created." : " — an existing client was reused.")));
        cpr.addHistory(history("clientId",
                previousClientId == null ? null : String.valueOf(previousClientId),
                String.valueOf(customerId), currentUserName()));
        Cpr saved = cprRepository.save(cpr);
        syncCprDocument(
                "CPR", saved.getId(), saved.getPrNo(), "CPR", saved.getPrNo(),
                customerId, saved.getClientName(), saved.getStatus().name());
        return new CprCustomerConversionResponse(saved.getId(), saved.getPrNo(), customerId,
                clientCode, clientName, created, false);
    }

    private static boolean isNotBlank(String value) {
        return value != null && !value.isBlank();
    }

    public CprResponse duplicate(Long id) {
        Cpr source = getCpr(id);
        Cpr copy = new Cpr();
        copy.setPrNo(buildPrNo(nextSequence()));
        // A duplicate is a NEW request: the customer's Reference PR No stays with
        // the original CPR (one Reference PR No maps to exactly one CPR), so the
        // copy starts without it and is never a duplicate reference.
        copy.setDepartment(source.getDepartment());
        copy.setRequestedBy(source.getRequestedBy());
        copy.setQuotationDeadline(source.getQuotationDeadline());
        copy.setExtendedDeadline(source.getExtendedDeadline());
        copy.setPriority(source.getPriority());
        copy.setSourceLead(source.getSourceLead());
        copy.setClientName(source.getClientName());
        copy.setContactPerson(source.getContactPerson());
        copy.setPhone(source.getPhone());
        copy.setEmail(source.getEmail());
        copy.setCompany(source.getCompany());
        copy.setGst(source.getGst());
        copy.setProject(source.getProject());
        copy.setLeadNo(source.getLeadNo());
        copy.setPan(source.getPan());
        copy.setVendor(source.getVendor());
        copy.setBillingAddress(source.getBillingAddress());
        copy.setShippingAddress(source.getShippingAddress());
        copy.setRemarks(source.getRemarks());
        copy.setDescription(source.getDescription());
        copy.setStatus(CprStatus.DRAFT);
        copy.setApprovalStatus(CprApprovalStatus.PENDING);
        copy.setPrDate(LocalDateTime.now());
        for (CprItem sourceItem : source.getItems()) {
            CprItem item = new CprItem();
            item.setDrawingNo(sourceItem.getDrawingNo());
            item.setDescription(sourceItem.getDescription());
            item.setSpecification(sourceItem.getSpecification());
            item.setQty(sourceItem.getQty());
            item.setUnit(sourceItem.getUnit());
            item.setEstimatedCost(sourceItem.getEstimatedCost());
            item.setRemarks(sourceItem.getRemarks());
            item.setCustomFieldsJson(sourceItem.getCustomFieldsJson());
            copy.addItem(item);
        }
        // Carry the item-grid column configuration into the duplicate.
        copy.setItemColumnsJson(source.getItemColumnsJson());
        recalcTotals(copy);
        syncStage(copy);
        copy.addTimeline(entry("created", "CPR created",
                "Duplicated from CPR '" + source.getPrNo() + "'."));
        copy.addHistory(history("CPR", null, copy.getPrNo(), currentUserName()));
        // Record the duplication on the source CPR as well.
        source.addTimeline(fieldEntry("duplicated", "CPR duplicated",
                "CPR '" + source.getPrNo() + "' was duplicated to '" + copy.getPrNo() + "' by " + currentUserName() + ".",
                "Source", source.getPrNo(), copy.getPrNo()));
        cprRepository.save(source);
        return toResponseDetail(cprRepository.save(copy));
    }

    public int bulkArchive(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            Cpr cpr = getCpr(id);
            if (cpr.getStatus() != CprStatus.ARCHIVED && cpr.getStatus() != CprStatus.DELETED) {
                cpr.setStatus(CprStatus.ARCHIVED);
                cpr.setArchivedAt(LocalDateTime.now());
                cpr.addTimeline(entry("archived", "CPR archived", "CPR was archived by " + currentUserName() + "."));
                cprRepository.save(cpr);
                count++;
            }
        }
        return count;
    }

    public int bulkRestore(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            Cpr cpr = getCpr(id);
            if (cpr.getStatus() == CprStatus.ARCHIVED || cpr.getStatus() == CprStatus.DELETED) {
                cpr.setStatus(CprStatus.DRAFT);
                cpr.setArchivedAt(null);
                cpr.addTimeline(entry("restored", "CPR restored", "CPR was restored by " + currentUserName() + "."));
                Cpr saved = cprRepository.save(cpr);
                syncCprDocument(
                        "CPR", saved.getId(), saved.getPrNo(), "CPR", saved.getPrNo(),
                        null, saved.getClientName(), saved.getStatus().name());
                count++;
            }
        }
        return count;
    }

    public int bulkDelete(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            Cpr cpr = getCpr(id);
            if (cpr.getStatus() == CprStatus.DELETED) {
                continue;
            }
            CprStatus previous = cpr.getStatus();
            cpr.setStatus(CprStatus.DELETED);
            cpr.setArchivedAt(LocalDateTime.now());
            cpr.addTimeline(fieldEntry("deleted", "CPR deleted",
                    "CPR was moved to trash by " + currentUserName() + ".",
                    "Status", label(previous), "Deleted"));
            cpr.addHistory(history("Status", label(previous), "Deleted", currentUserName()));
            Cpr saved = cprRepository.save(cpr);
            syncCprDocument(
                    "CPR", saved.getId(), saved.getPrNo(), "CPR", saved.getPrNo(),
                    null, saved.getClientName(), saved.getStatus().name());
            count++;
        }
        return count;
    }

    public int bulkPermanentDelete(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            Cpr cpr = getCpr(id);
            // Unlink any Cost Workouts referencing this CPR so the FK (cpr_id)
            // never orphans a Cost Workout when the CPR row is removed.
            costWorkoutRepository.unlinkByCprId(id);
            purgeCprDocument(id);
            cprRepository.delete(cpr);
            count++;
        }
        return count;
    }

    // ============================== Export ==============================

    @Transactional(readOnly = true)
    public List<CprResponse> export(String search, String status, String approval, String department,
                                    String dateFrom, String dateTo, BigDecimal minValue, BigDecimal maxValue) {
        Specification<Cpr> spec = buildSpecification(search, status, approval, department, dateFrom, dateTo, minValue, maxValue);
        return cprRepository.findAll(spec).stream().map(this::toResponse).toList();
    }

    public String buildCsv(List<CprResponse> cprs) {
        StringBuilder sb = new StringBuilder();
        sb.append("CPR No,Lead No,Client,Description,Project,Department,Created By,Cost Workout,Profit %,Status,Date,Amount\n");
        for (CprResponse c : cprs) {
            sb.append(escapeCsv(c.prNo())).append(',')
              .append(escapeCsv(c.leadNo())).append(',')
              .append(escapeCsv(c.clientName())).append(',')
              .append(escapeCsv(c.description())).append(',')
              .append(escapeCsv(c.project())).append(',')
              .append(escapeCsv(c.department())).append(',')
              .append(escapeCsv(c.requestedBy())).append(',')
              .append(c.costWorkout() == null ? "" : c.costWorkout().toPlainString()).append(',')
              .append(c.profitPercent() == null ? "" : c.profitPercent().toPlainString()).append(',')
              .append(escapeCsv(c.status())).append(',')
              .append(escapeCsv(c.date())).append(',')
              .append(c.grandTotal() == null ? "" : c.grandTotal().toPlainString()).append('\n');
        }
        return sb.toString();
    }

    // ============================== Sub-resources ==============================

    @Transactional(readOnly = true)
    public List<CprTimelineResponse> getTimeline(Long id) {
        return getCpr(id).getTimeline().stream()
                .sorted(Comparator.comparing(CprTimeline::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::timelineResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<CprHistoryResponse> getHistory(Long id) {
        return getCpr(id).getHistory().stream()
                .sorted(Comparator.comparing(CprHistory::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::historyResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<CprAttachmentResponse> getAttachments(Long id) {
        return getCpr(id).getAttachments().stream().map(this::attachmentResponse).toList();
    }

    public CprAttachmentResponse addAttachment(Long id, MultipartFile file) {
        Cpr cpr = getCpr(id);
        String storedName = fileStorageService.store(file);
        CprAttachment attachment = new CprAttachment();
        attachment.setName(file.getOriginalFilename());
        attachment.setStoredName(storedName);
        attachment.setContentType(file.getContentType());
        attachment.setSize(file.getSize());
        attachment.setUrl(baseUrl + "/v1/files/" + storedName);
        cpr.addAttachment(attachment);
        cpr.addTimeline(entry("attachment", "File attached", file.getOriginalFilename()));
        // Flush so the attachment row (and its generated id / uploadedAt) is persisted,
        // then reload the persisted attachment to build a complete response.
        cprRepository.saveAndFlush(cpr);
        entityManager.clear();
        CprAttachment persisted = cprRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("CPR not found with id: " + id))
                .getAttachments().stream()
                .filter(a -> a.getStoredName().equals(storedName))
                .findFirst()
                .orElse(attachment);
        documentRepositoryService.registerFromAttachment(
                file.getOriginalFilename(), "CPR", id,
                cpr.getPrNo(), null, cpr.getClientName(),
                baseUrl + "/v1/files/" + storedName,
                file.getContentType(), file.getSize(),
                currentUserName(), DocumentVisibility.TEAM_ONLY);
        return attachmentResponse(persisted);
    }

    public void deleteAttachment(Long id, Long attachmentId) {
        Cpr cpr = getCpr(id);
        CprAttachment attachment = cpr.getAttachments().stream()
                .filter(a -> a.getId().equals(attachmentId))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Attachment not found with id: " + attachmentId));
        cpr.getAttachments().remove(attachment);
        cprRepository.save(cpr);
    }

    // ============================== Comments ==============================

    @Transactional(readOnly = true)
    public List<CprCommentResponse> getComments(Long id) {
        return getCpr(id).getComments().stream().map(this::commentResponse).toList();
    }

    public CprCommentResponse addComment(Long id, String text) {
        Cpr cpr = getCpr(id);
        CprComment comment = new CprComment();
        comment.setAuthor(currentUserName());
        comment.setText(text);
        cpr.addComment(comment);
        cpr.addTimeline(entry("comment", "Comment added",
                currentUserName() + " added a comment on " + cpr.getPrNo() + "."));
        cprRepository.saveAndFlush(cpr);
        return commentResponse(comment);
    }

    public CprCommentResponse updateComment(Long id, Long commentId, String text) {
        Cpr cpr = getCpr(id);
        CprComment comment = cpr.getComments().stream()
                .filter(c -> c.getId().equals(commentId))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Comment not found with id: " + commentId));
        String oldText = comment.getText();
        comment.setText(text);
        cpr.addTimeline(fieldEntry("comment", "Comment edited",
                currentUserName() + " edited a comment on " + cpr.getPrNo() + ".",
                "Comment", oldText == null ? "" : oldText, text == null ? "" : text));
        cprRepository.saveAndFlush(cpr);
        return commentResponse(comment);
    }

    public void deleteComment(Long id, Long commentId) {
        Cpr cpr = getCpr(id);
        CprComment comment = cpr.getComments().stream()
                .filter(c -> c.getId().equals(commentId))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Comment not found with id: " + commentId));
        cpr.getComments().remove(comment);
        cpr.addTimeline(entry("comment", "Comment deleted",
                currentUserName() + " deleted a comment on " + cpr.getPrNo() + "."));
        cprRepository.save(cpr);
    }

    // ============================== Reports ==============================

    @Transactional(readOnly = true)
    public Map<String, Object> reportsSummary() {
        // Narrow scalar projection of the CURRENT revisions — no CPR entity
        // graph, items, comments, history, attachments or timeline is loaded.
        List<com.vishatech.erp.dto.CprReportRow> rows = cprRepository.findReportRows();

        BigDecimal totalAmt = BigDecimal.ZERO;
        Map<String, BigDecimal[]> deptAgg = new LinkedHashMap<>();
        Map<String, BigDecimal[]> vendorAgg = new LinkedHashMap<>();
        Map<String, BigDecimal[]> monthAgg = new LinkedHashMap<>();

        for (com.vishatech.erp.dto.CprReportRow cpr : rows) {
            CprStatus status = cpr.status();
            if (status == CprStatus.ARCHIVED || status == CprStatus.DELETED) {
                continue;
            }
            BigDecimal amount = cpr.grandTotal() == null ? BigDecimal.ZERO : cpr.grandTotal();
            totalAmt = totalAmt.add(amount);
            boolean isPending = status == CprStatus.PENDING_APPROVAL || status == CprStatus.COST_WORKOUT;
            boolean isConverted = cpr.convertedToQtn() != null && !cpr.convertedToQtn().isBlank();

            String dept = (cpr.department() == null || cpr.department().isBlank())
                    ? "Unassigned" : cpr.department();
            BigDecimal[] d = deptAgg.computeIfAbsent(dept, k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO});
            d[0] = d[0].add(BigDecimal.ONE);
            d[3] = d[3].add(amount);
            if (status == CprStatus.APPROVED) d[1] = d[1].add(BigDecimal.ONE);
            else if (isPending) d[2] = d[2].add(BigDecimal.ONE);

            String vendor = cpr.vendor() == null ? "" : cpr.vendor().trim();
            if (!vendor.isBlank()) {
                BigDecimal[] v = vendorAgg.computeIfAbsent(vendor, k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
                v[0] = v[0].add(BigDecimal.ONE);
                v[1] = v[1].add(amount);
            }

            String month = cpr.createdAt() == null ? "" : cpr.createdAt().toString().substring(0, 7);
            if (!month.isBlank()) {
                BigDecimal[] m = monthAgg.computeIfAbsent(month, k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO});
                m[0] = m[0].add(BigDecimal.ONE);
                m[1] = m[1].add(amount);
                if (status == CprStatus.APPROVED) m[2] = m[2].add(BigDecimal.ONE);
                if (isConverted) m[3] = m[3].add(BigDecimal.ONE);
            }
        }

        List<Map<String, Object>> deptSummary = new ArrayList<>();
        for (Map.Entry<String, BigDecimal[]> e : deptAgg.entrySet()) {
            BigDecimal[] v = e.getValue();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("department", e.getKey());
            row.put("count", v[0]);
            row.put("approved", v[1]);
            row.put("pending", v[2]);
            row.put("total", v[3]);
            deptSummary.add(row);
        }

        List<Map<String, Object>> vendorSummary = new ArrayList<>();
        for (Map.Entry<String, BigDecimal[]> e : vendorAgg.entrySet()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("vendor", e.getKey());
            row.put("count", e.getValue()[0]);
            row.put("total", e.getValue()[1]);
            vendorSummary.add(row);
        }

        List<Map<String, Object>> monthlySummary = new ArrayList<>();
        monthAgg.entrySet().stream()
                .sorted((a, b) -> b.getKey().compareTo(a.getKey()))
                .forEach(e -> {
                    BigDecimal[] v = e.getValue();
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("month", e.getKey());
                    row.put("count", v[0]);
                    row.put("total", v[1]);
                    row.put("approved", v[2]);
                    row.put("converted", v[3]);
                    monthlySummary.add(row);
                });

        // Cost analysis by category — grouped by the DATABASE over the Cost
        // Workout category rows (real MySQL data), excluding Lead Time
        // (non-monetary) rows. The previous implementation loaded every Cost
        // Workout aggregate, every item and every category just to sum this.
        Map<String, BigDecimal[]> costAgg = new LinkedHashMap<>();
        for (Object[] row : costWorkoutRepository.sumCostByCategory(
                List.of(com.vishatech.erp.entity.CostWorkoutStatus.ARCHIVED,
                        com.vishatech.erp.entity.CostWorkoutStatus.DELETED))) {
            String raw = (String) row[0];
            String category = (raw == null || raw.isBlank()) ? "Material Cost" : raw;
            BigDecimal count = BigDecimal.valueOf(((Number) row[1]).longValue());
            BigDecimal amount = row[2] == null ? BigDecimal.ZERO : (BigDecimal) row[2];
            BigDecimal[] c = costAgg.computeIfAbsent(category,
                    k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            c[0] = c[0].add(count);
            c[1] = c[1].add(amount);
        }
        List<Map<String, Object>> costAnalysis = new ArrayList<>();
        for (Map.Entry<String, BigDecimal[]> e : costAgg.entrySet()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("category", e.getKey());
            row.put("count", e.getValue()[0]);
            row.put("total", e.getValue()[1]);
            costAnalysis.add(row);
        }

        // The three report tables keep the same rows and the same DTO shape,
        // but each is fetched with its status filter instead of being filtered
        // out of every CPR in the system, and their workflow states are
        // resolved in one query per table (no per-row verification lookup).
        List<Cpr> pending = cprRepository.findCurrentReportPending();
        List<Cpr> approved = cprRepository.findCurrentReportApproved();
        List<Cpr> converted = cprRepository.findCurrentReportConverted();
        Map<Long, WorkflowState> pendingStates = workflowStatesFor(pending);
        Map<Long, WorkflowState> approvedStates = workflowStatesFor(approved);
        Map<Long, WorkflowState> convertedStates = workflowStatesFor(converted);

        Map<String, Object> kpis = new LinkedHashMap<>();
        kpis.put("pending", pending.size());
        kpis.put("approved", approved.size());
        kpis.put("converted", converted.size());
        kpis.put("totalValue", totalAmt);

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("kpis", kpis);
        summary.put("pending", pending.stream()
                .map(c -> toResponse(c, List.of(), pendingStates.get(c.getId()))).toList());
        summary.put("approved", approved.stream()
                .map(c -> toResponse(c, List.of(), approvedStates.get(c.getId()))).toList());
        summary.put("converted", converted.stream()
                .map(c -> toResponse(c, List.of(), convertedStates.get(c.getId()))).toList());
        summary.put("deptSummary", deptSummary);
        summary.put("vendorSummary", vendorSummary);
        summary.put("monthlySummary", monthlySummary);
        summary.put("costAnalysis", costAnalysis);
        return summary;
    }

    // ============================== Reference PR lookup ==============================

    /** Search CPRs by referencePrNo for the Quotation form autocomplete dropdown. */
    @Transactional(readOnly = true)
    public java.util.List<java.util.Map<String, Object>> searchByReferencePrNo(String query) {
        if (query == null || query.isBlank()) {
            return java.util.List.of();
        }
        List<Cpr> results = cprRepository.searchByReferencePrNo(query.trim());
        return results.stream().limit(20).map(cpr -> {
            java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("id", cpr.getId());
            m.put("prNo", cpr.getPrNo());
            m.put("referencePrNo", cpr.getReferencePrNo());
            m.put("clientName", cpr.getClientName());
            m.put("company", cpr.getCompany());
            m.put("status", cpr.getStatus() != null ? cpr.getStatus().name() : null);
            return m;
        }).toList();
    }

    /** Lookup a single CPR by its referencePrNo (exact match, latest revision). */
    @Transactional(readOnly = true)
    public CprResponse getByReferencePrNo(String referencePrNo) {
        if (referencePrNo == null || referencePrNo.isBlank()) {
            throw new com.vishatech.erp.exception.BadRequestException("Reference PR No is required");
        }
        List<Cpr> matches = cprRepository.findLatestByReferencePrNo(referencePrNo.trim());
        if (matches.isEmpty()) {
            throw new com.vishatech.erp.exception.BadRequestException(
                    "No CPR found with Reference PR No: " + referencePrNo);
        }
        return toResponse(matches.get(0));
    }

    // ============================== Mapping ==============================

    private void copyForRevision(Cpr copy, Cpr source) {
        org.springframework.beans.BeanUtils.copyProperties(source, copy,
                "id", "items", "attachments", "timeline", "history", "comments", "revisionOf", "revision", "revisionDate", "latestRevision", "draftOnly", "createdAt", "updatedAt", "archivedAt");
        for (CprItem sourceItem : source.getItems()) {
            CprItem item = new CprItem();
            org.springframework.beans.BeanUtils.copyProperties(sourceItem, item,
                    "id", "cpr", "createdAt");
            copy.addItem(item);
        }
    }

    private int maxRevisionOfChain(Long baseId) {
        return cprRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .mapToInt(Cpr::getRevision)
                .max()
                .orElse(0);
    }

    /** Detail response — also carries the full revision chain for the UI. */
    private CprResponse toResponseDetail(Cpr cpr) {
        return toResponse(cpr, revisionChain(cpr));
    }

    private List<RevisionInfo> revisionChain(Cpr cpr) {
        Long baseId = cpr.getRevisionOf() != null ? cpr.getRevisionOf() : cpr.getId();
        List<RevisionInfo> chain = new ArrayList<>();
        cprRepository.findById(baseId).ifPresent(q -> chain.add(revisionInfo(q)));
        cprRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .sorted(java.util.Comparator.comparingInt(Cpr::getRevision))
                .forEach(q -> chain.add(revisionInfo(q)));
        return chain;
    }

    private RevisionInfo revisionInfo(Cpr cpr) {
        return new RevisionInfo(
                cpr.getId(),
                cpr.getPrNo(),
                cpr.getRevision(),
                statusKey(cpr.getStatus()),
                cpr.getRevisionDate() == null
                        ? (cpr.getCreatedAt() == null ? null : cpr.getCreatedAt().toString())
                        : cpr.getRevisionDate().toString(),
                cpr.isLatestRevision());
    }

    /** When the latest revision is deleted, the previous one becomes latest. */
    private void promotePreviousRevision(Cpr removed) {
        if (!removed.isLatestRevision()) {
            return;
        }
        Long baseId = removed.getRevisionOf() != null ? removed.getRevisionOf() : removed.getId();
        // Highest remaining revision row first (revision >= 1).
        cprRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .filter(q -> !q.getId().equals(removed.getId()))
                .filter(q -> !"deleted".equals(q.getStatus()))
                .findFirst()
                .ifPresentOrElse(q -> {
                    q.setLatestRevision(true);
                    cprRepository.save(q);
                    removed.setLatestRevision(false);
                    cprRepository.save(removed);
                }, () -> cprRepository.findById(baseId).ifPresent(q -> {
                    // Fall back to the base row (revision 0) when no revision rows remain.
                    if (!q.getId().equals(removed.getId()) && !"deleted".equals(q.getStatus())) {
                        q.setLatestRevision(true);
                        cprRepository.save(q);
                        removed.setLatestRevision(false);
                        cprRepository.save(removed);
                    }
                }));
    }

    /** Single-CPR resolver for the entity-shaped read paths. */
    private WorkflowState workflowState(Cpr cpr) {
        if (cpr == null || cpr.getId() == null) {
            return WorkflowState.none();
        }
        return workflowState(cpr, technicalVerificationRepository.findAllByCprIdOrderByIdAsc(cpr.getId()));
    }

    /** List/export response - carries no revision chain (avoids N+1). */
    private CprResponse toResponse(Cpr entity) {
        return toResponse(entity, List.of(), workflowState(entity));
    }

    private CprResponse toResponse(Cpr cpr, List<RevisionInfo> revisions) {
        return toResponse(cpr, revisions, workflowState(cpr));
    }

    private CprResponse toResponse(Cpr cpr, List<RevisionInfo> revisions, WorkflowState workflow) {
        WorkflowState state = workflow == null ? WorkflowState.none() : workflow;
        return new CprResponse(
                cpr.getId(),
                cpr.getPrNo(),
                cpr.getReferencePrNo(),
                cpr.getPrDate() == null ? null : cpr.getPrDate().toLocalDate().toString(),
                cpr.getDepartment(),
                cpr.getRequestedBy(),
                cpr.getRequiredDate() == null ? null : cpr.getRequiredDate().toLocalDate().toString(),
                cpr.getQuotationDeadline() == null ? null : cpr.getQuotationDeadline().toString(),
                cpr.getExtendedDeadline() == null ? null : cpr.getExtendedDeadline().toString(),
                cpr.getPriority(),
                statusKey(cpr.getStatus()),
                stageKey(cpr.getStatus()),
                approvalKey(cpr.getApprovalStatus()),
                cpr.getSourceLead(),
                cpr.getClientId(),
                cpr.getClientName(),
                cpr.getContactPerson(),
                cpr.getPhone(),
                cpr.getEmail(),
                cpr.getCompany(),
                cpr.getGst(),
                cpr.getProject(),
                cpr.getLeadNo(),
                cpr.getPan(),
                cpr.getVendor(),
                cpr.getBillingAddress(),
                cpr.getShippingAddress(),
                cpr.getRemarks(),
                cpr.getDescription(),
                cpr.getCostWorkout(),
                cpr.getProfitPercent(),
                cpr.getGrandTotal(),
                cpr.getConvertedToQtn(),
                cpr.getQuotationId(),
                cpr.getCostWorkoutId(),
                cpr.getCostWorkoutCwNo(),
                cpr.getCostWorkoutStatus(),
                cpr.getSubmittedBy(),
                cpr.getSubmittedAt() == null ? null : cpr.getSubmittedAt().toString(),
                cpr.getApprovedBy(),
                cpr.getApprovalDate() == null ? null : cpr.getApprovalDate().toString(),
                cpr.getRejectedBy(),
                cpr.getApprovalRemarks(),
                cpr.getPrDate() == null
                        ? (cpr.getCreatedAt() == null ? null : cpr.getCreatedAt().toLocalDate().toString())
                        : cpr.getPrDate().toLocalDate().toString(),
                cpr.getCreatedAt() == null ? null : cpr.getCreatedAt().toString(),
                cpr.getUpdatedAt() == null ? null : cpr.getUpdatedAt().toString(),
                cpr.getArchivedAt() == null ? null : cpr.getArchivedAt().toString(),
                cpr.getItems().stream().map(this::itemResponse).toList(),
                cpr.getAttachments().stream().map(this::attachmentResponse).toList(),
                cpr.getTimeline().stream().map(this::timelineResponse).toList(),
                cpr.getHistory().stream().map(this::historyResponse).toList(),
                cpr.getComments().stream().map(this::commentResponse).toList(),
                cpr.getRevision(),
                cpr.getRevisionOf(),
                cpr.isLatestRevision(),
                cpr.getRevisionDate() == null ? null : cpr.getRevisionDate().toString(),
                revisions,
                parseItemColumns(cpr.getItemColumnsJson()),
                state.verificationStatus(),
                state.verificationNo(),
                state.verificationCount(),
                state.verificationCompleted(),
                state.adminApprovalState(),
                state.floatDestination(),
                state.floatDestination() == null ? null
                        : CprFloatDestination.parse(state.floatDestination()).getLabel(),
                cpr.getFloatedPrNo(),
                cpr.getFloatedAt() == null ? null : cpr.getFloatedAt().toString(),
                cpr.getFloatedBy()
        );
    }

    private CprItemResponse itemResponse(CprItem item) {
        Map<String, String> customFields = parseCustomFields(item.getCustomFieldsJson());
        // Notes travel as their own response field and are not repeated as a
        // custom-column value.
        String notes = customFields.remove(ITEM_NOTES_KEY);
        return new CprItemResponse(item.getId(), item.getDrawingNo(), item.getDescription(),
                item.getSpecification(), item.getQty(), item.getUnit(), item.getEstimatedCost(),
                item.getRemarks(), notes, item.getFileName(), item.getFileSize(), item.getFileType(),
                parseItemAttachments(item.getAttachmentsJson()),
                customFields);
    }

    /**
     * Item payload → stored custom-fields map, with the item's Notes folded in
     * under {@link #ITEM_NOTES_KEY}. A notes value already carried inside the
     * map (older payloads / a custom column with that id) is still honoured;
     * the explicit {@code notes} field wins when both are present. Blank notes
     * are removed so the stored JSON stays clean.
     */
    private Map<String, String> withItemNotes(CprItemRequest itemRequest) {
        Map<String, String> customFields = itemRequest.customFields() == null
                ? new LinkedHashMap<>()
                : new LinkedHashMap<>(itemRequest.customFields());
        String notes = itemRequest.notes();
        if (notes == null || notes.isBlank()) {
            notes = customFields.get(ITEM_NOTES_KEY);
        }
        if (notes == null || notes.isBlank()) {
            customFields.remove(ITEM_NOTES_KEY);
        } else {
            customFields.put(ITEM_NOTES_KEY, notes);
        }
        return customFields;
    }

    private String serializeItemAttachments(List<CostWorkoutAttachment> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return null;
        }
        try {
            return ITEM_JSON.writeValueAsString(attachments);
        } catch (Exception e) {
            return null;
        }
    }

    private List<CostWorkoutAttachment> parseItemAttachments(String json) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            List<CostWorkoutAttachment> list = ITEM_JSON.readValue(json, new TypeReference<List<CostWorkoutAttachment>>() {
            });
            return list == null ? new ArrayList<>() : list;
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    // ---- Item-grid custom column configuration (JSON TEXT columns; no ALTER TABLE) ----

    private String serializeItemColumns(List<CprItemColumn> columns) {
        if (columns == null || columns.isEmpty()) {
            return null;
        }
        try {
            return ITEM_JSON.writeValueAsString(columns);
        } catch (Exception e) {
            return null;
        }
    }

    private List<CprItemColumn> parseItemColumns(String json) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            List<CprItemColumn> list = ITEM_JSON.readValue(json, new TypeReference<List<CprItemColumn>>() {
            });
            return list == null ? new ArrayList<>() : list;
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    private String serializeCustomFields(Map<String, String> customFields) {
        if (customFields == null || customFields.isEmpty()) {
            return null;
        }
        try {
            return ITEM_JSON.writeValueAsString(customFields);
        } catch (Exception e) {
            return null;
        }
    }

    private Map<String, String> parseCustomFields(String json) {
        if (json == null || json.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            Map<String, String> map = ITEM_JSON.readValue(json, new TypeReference<Map<String, String>>() {
            });
            return map == null ? new LinkedHashMap<>() : map;
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    private CprAttachmentResponse attachmentResponse(CprAttachment attachment) {
        return new CprAttachmentResponse(attachment.getId(), attachment.getName(), attachment.getContentType(),
                attachment.getSize(), attachment.getUrl(),
                attachment.getUploadedAt() == null ? null : attachment.getUploadedAt().toString());
    }

    private CprTimelineResponse timelineResponse(CprTimeline entry) {
        return new CprTimelineResponse(entry.getId(), entry.getType(), entry.getTitle(), entry.getDetail(),
                entry.getField(), entry.getOldValue(), entry.getNewValue(),
                entry.getUserId(), entry.getUserName(), entry.getUserRole(),
                entry.getIpAddress(), entry.getDeviceInfo(),
                entry.getCreatedAt() == null ? null : entry.getCreatedAt().toString());
    }

    private CprHistoryResponse historyResponse(CprHistory entry) {
        return new CprHistoryResponse(entry.getId(), entry.getField(), entry.getOldValue(), entry.getNewValue(),
                entry.getChangedBy(), entry.getCreatedAt() == null ? null : entry.getCreatedAt().toString());
    }

    private CprCommentResponse commentResponse(CprComment comment) {
        return new CprCommentResponse(comment.getId(), comment.getAuthor(), comment.getText(),
                comment.getCreatedAt() == null ? null : comment.getCreatedAt().toString(),
                comment.getUpdatedAt() == null ? null : comment.getUpdatedAt().toString());
    }

    private CprTimeline entry(String type, String title, String detail) {
        CprTimeline entry = new CprTimeline();
        entry.setType(type);
        entry.setTitle(title);
        entry.setDetail(detail);
        return withAudit(entry);
    }

    private CprTimeline fieldEntry(String type, String title, String detail, String field,
                                   String oldValue, String newValue) {
        CprTimeline entry = entry(type, title, detail);
        entry.setField(field);
        entry.setOldValue(oldValue);
        entry.setNewValue(newValue);
        return entry;
    }

    /** Stamp who / from where onto an audit record. */
    private CprTimeline withAudit(CprTimeline entry) {
        entry.setUserId(auditContext.currentUserId());
        entry.setUserName(auditContext.currentUserName());
        entry.setUserRole(auditContext.currentUserRole());
        entry.setIpAddress(auditContext.ipAddress());
        String device = auditContext.deviceInfo();
        entry.setDeviceInfo(device != null && device.length() > 500 ? device.substring(0, 500) : device);
        return entry;
    }

    /**
     * Snapshot the tracked display fields as strings for change comparison.
     *
     * <p>Every text field is reduced with {@link #text(String)} so that "not
     * set" has exactly ONE representation. The edit form always submits the whole
     * header, writing {@code ""} into optional fields whose stored value is
     * {@code null}; comparing those raw values called an untouched record changed
     * and fabricated a revision on every save (including the save the item-level
     * CW / PR conversion performs before converting). That new revision replaced
     * the row the page was editing, so going back to the CPR afterwards landed on
     * a superseded, read-only historical revision.
     */
    private Map<String, String> snapshotFields(Cpr cpr) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("referencePrNo", text(cpr.getReferencePrNo()));
        m.put("prDate", cpr.getPrDate() == null ? null : cpr.getPrDate().toLocalDate().toString());
        m.put("requiredDate", cpr.getRequiredDate() == null ? null : cpr.getRequiredDate().toLocalDate().toString());
        m.put("department", text(cpr.getDepartment()));
        m.put("requestedBy", text(cpr.getRequestedBy()));
        m.put("clientId", cpr.getClientId() == null ? null : String.valueOf(cpr.getClientId()));
        m.put("convertedToQtn", text(cpr.getConvertedToQtn()));
        m.put("quotationDeadline", cpr.getQuotationDeadline() == null ? null : cpr.getQuotationDeadline().toString());
        m.put("extendedDeadline", cpr.getExtendedDeadline() == null ? null : cpr.getExtendedDeadline().toString());
        m.put("priority", text(cpr.getPriority()));
        m.put("sourceLead", text(cpr.getSourceLead()));
        m.put("clientName", text(cpr.getClientName()));
        m.put("contactPerson", text(cpr.getContactPerson()));
        m.put("phone", text(cpr.getPhone()));
        m.put("email", text(cpr.getEmail()));
        m.put("company", text(cpr.getCompany()));
        m.put("gst", text(cpr.getGst()));
        m.put("project", text(cpr.getProject()));
        m.put("leadNo", text(cpr.getLeadNo()));
        m.put("pan", text(cpr.getPan()));
        m.put("vendor", text(cpr.getVendor()));
        m.put("billingAddress", text(cpr.getBillingAddress()));
        m.put("shippingAddress", text(cpr.getShippingAddress()));
        m.put("remarks", text(cpr.getRemarks()));
        m.put("description", text(cpr.getDescription()));
        // Compared numerically, not by BigDecimal scale: a converted Cost Workout
        // stores its subtotal as 50.00 while the form round-trips it as 50, and
        // differing scales are the same amount, not a user edit.
        m.put("costWorkout", cpr.getCostWorkout() == null ? null
                : cpr.getCostWorkout().stripTrailingZeros().toPlainString());
        // profitPercent is DERIVED from costWorkout and the item totals
        // (recalcTotals) and is not editable anywhere in the CPR form, so it is
        // deliberately not a revision trigger: when an item-level CW conversion
        // stores the Cost Workout's subtotal on the CPR, the next save recomputes
        // the profit and would otherwise look like a user edit. A real
        // costWorkout change is still tracked (field above) and a real item change
        // through the item fingerprint.
        m.put("status", cpr.getStatus() == null ? null : label(cpr.getStatus()));
        m.put("approvalStatus", cpr.getApprovalStatus() == null ? null : label(cpr.getApprovalStatus()));
        m.put("items", String.valueOf(cpr.getItems().size()));
        return m;
    }

    /**
     * Canonical fingerprint of the item rows, used for change detection.
     * <p>
     * The tracked snapshot only carries the item COUNT, which would hide a real
     * edit that leaves the row count unchanged (e.g. only a quantity or a
     * description changed). The fingerprint hashes every persisted item field,
     * so any genuine item change is detected and produces exactly one revision.
     */
    private String itemsSignature(Cpr cpr) {
        StringBuilder sb = new StringBuilder();
        for (CprItem it : cpr.getItems()) {
            sb.append(text(it.getDrawingNo())).append('\u001f')
                    .append(text(it.getDescription())).append('\u001f')
                    .append(text(it.getSpecification())).append('\u001f')
                    .append(number(it.getQty())).append('\u001f')
                    .append(text(it.getUnit())).append('\u001f')
                    .append(number(it.getEstimatedCost())).append('\u001f')
                    .append(text(it.getRemarks())).append('\u001f')
                    .append(text(it.getFileName())).append('\u001f')
                    .append(text(it.getCustomFieldsJson())).append('\u001f')
                    .append(text(it.getAttachmentsJson())).append('\u001e');
        }
        return sb.toString();
    }

    private static String text(String value) {
        return value == null ? "" : value;
    }

    private static String number(BigDecimal value) {
        return value == null ? "" : value.stripTrailingZeros().toPlainString();
    }

    /** Compare before/after snapshots and build one audit entry per changed field. */
    private List<CprTimeline> changedFields(Map<String, String> before, Cpr cpr) {
        Map<String, String> after = snapshotFields(cpr);
        List<CprTimeline> out = new ArrayList<>();
        for (Map.Entry<String, String> e : before.entrySet()) {
            String key = e.getKey();
            String oldV = e.getValue();
            String newV = after.get(key);
            if (!Objects.equals(oldV, newV)) {
                out.add(fieldEntry("field", "Field updated",
                        "Field '" + key + "' was updated by " + currentUserName() + ".",
                        key, oldV == null ? "" : oldV, newV == null ? "" : newV));
            }
        }
        return out;
    }

    private CprHistory history(String field, String oldValue, String newValue, String changedBy) {
        CprHistory entry = new CprHistory();
        entry.setField(field);
        entry.setOldValue(oldValue);
        entry.setNewValue(newValue);
        entry.setChangedBy(changedBy);
        return entry;
    }

    // ============================== Helpers ==============================

    private Cpr getCpr(Long id) {
        return cprRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("CPR not found with id: " + id));
    }

    /** Trims a Reference PR No; blank means "no reference" (the field is optional). */
    private static String normalizeReferencePrNo(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /** True when an edit actually assigns a different Reference PR No. */
    private static boolean referencePrNoChanged(String requested, String current) {
        String left = normalizeReferencePrNo(requested);
        String right = normalizeReferencePrNo(current);
        if (left == null || right == null) {
            return left != right;
        }
        return !left.equalsIgnoreCase(right);
    }

    /**
     * Reference PR No uniqueness rule.
     *
     * <p>The existing business rules treat a Reference PR No as one customer PR
     * carried by exactly one live CPR (the shared {@code pr_references} catalog
     * registers each number once, and {@code PrReferenceService} adopts rather
     * than duplicates a row). This guard enforces that rule for the CPR form and
     * the API: a number already carried by another live CPR (latest revision,
     * not trashed) is rejected with a message naming the CPR that owns it.
     *
     * <p>The current record's own revision chain is excluded, so editing a CPR
     * (which creates a new revision row) never trips over its own value.
     * Trashed CPRs are ignored, matching {@code findLatestByReferencePrNo}.
     */
    private void assertReferencePrNoUnique(String referencePrNo, Cpr current) {
        if (referencePrNo == null) {
            return;
        }
        Long currentRoot = current == null ? null
                : (current.getRevisionOf() != null ? current.getRevisionOf() : current.getId());
        for (Cpr match : cprRepository.findLatestByReferencePrNo(referencePrNo)) {
            Long matchRoot = match.getRevisionOf() != null ? match.getRevisionOf() : match.getId();
            if (currentRoot != null && currentRoot.equals(matchRoot)) {
                continue;
            }
            throw new BadRequestException("Reference PR No '" + referencePrNo + "' is already used by CPR "
                    + match.getPrNo() + ". Each Reference PR No can only be used once.");
        }
    }

    private void applyRequest(Cpr cpr, CprRequest request) {
        cpr.setReferencePrNo(normalizeReferencePrNo(request.referencePrNo()));
        cpr.setPrDate(parseDate(request.prDate()));
        cpr.setDepartment(request.department());
        cpr.setRequestedBy(request.requestedBy());
        cpr.setRequiredDate(parseDate(request.requiredDate()));
        cpr.setQuotationDeadline(parseLocalDate(request.quotationDeadline()));
        cpr.setExtendedDeadline(parseLocalDate(request.extendedDeadline()));
        cpr.setPriority(request.priority());
        cpr.setSourceLead(request.sourceLead());
        cpr.setClientId(request.clientId());
        cpr.setClientName(request.clientName());
        cpr.setContactPerson(request.contactPerson());
        cpr.setPhone(request.phone());
        cpr.setEmail(request.email());
        cpr.setCompany(request.company());
        cpr.setGst(request.gst());
        cpr.setProject(request.project());
        cpr.setLeadNo(request.leadNo());
        cpr.setPan(request.pan());
        cpr.setVendor(request.vendor());
        cpr.setBillingAddress(request.billingAddress());
        cpr.setShippingAddress(request.shippingAddress());
        cpr.setRemarks(request.remarks());
        cpr.setDescription(request.description());
        cpr.setCostWorkout(request.costWorkout());
        cpr.setProfitPercent(request.profitPercent());
        if (request.convertedToQtn() != null) {
            cpr.setConvertedToQtn(request.convertedToQtn());
        }
        cpr.getItems().clear();
        if (request.items() != null) {
            for (CprItemRequest itemRequest : request.items()) {
                if (itemRequest == null) {
                    continue;
                }
                CprItem item = new CprItem();
                item.setDrawingNo(itemRequest.drawingNo());
                item.setDescription(itemRequest.description());
                item.setSpecification(itemRequest.specification());
                item.setQty(itemRequest.qty() == null ? BigDecimal.ONE : itemRequest.qty());
                item.setUnit(itemRequest.unit());
                item.setEstimatedCost(itemRequest.estimatedCost() == null ? BigDecimal.ZERO : itemRequest.estimatedCost());
                item.setRemarks(itemRequest.remarks());
                item.setFileName(itemRequest.fileName());
                item.setFileSize(itemRequest.fileSize() == null ? 0 : itemRequest.fileSize());
                item.setFileType(itemRequest.fileType());
                item.setAttachmentsJson(serializeItemAttachments(itemRequest.attachments()));
                item.setCustomFieldsJson(serializeCustomFields(withItemNotes(itemRequest)));
                cpr.addItem(item);
            }
        }
        // Persist the user-customized item-grid column configuration with the
        // CPR (id/label/type/order per column) so reopening restores it exactly.
        cpr.setItemColumnsJson(serializeItemColumns(request.itemColumns()));
    }

    private void recalcTotals(Cpr cpr) {
        BigDecimal total = cpr.getItems().stream()
                .filter(it -> it.getQty() != null && it.getEstimatedCost() != null)
                .map(it -> it.getQty().multiply(it.getEstimatedCost()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        cpr.setGrandTotal(total);
        BigDecimal costWorkout = cpr.getCostWorkout();
        if (costWorkout != null && costWorkout.compareTo(BigDecimal.ZERO) > 0 && total.compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal profit = total.subtract(costWorkout)
                    .divide(costWorkout, 4, java.math.RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(100));
            cpr.setProfitPercent(profit.setScale(2, java.math.RoundingMode.HALF_UP));
        } else {
            cpr.setProfitPercent(null);
        }
    }

    private void syncStage(Cpr cpr) {
        cpr.setCurrentStage(stageKey(cpr.getStatus()));
    }

    /**
     * Predicate keeping only the CURRENT row of each revision chain. A row is
     * kept when it is flagged latestRevision OR no other row in the same chain
     * (chain key = revisionOf, or the row id for the base) carries a strictly
     * higher revision number. Legacy base rows without a revision chain always
     * survive this filter, so the main list never shows older revisions as
     * separate rows (they remain reachable via the revision-history dropdown).
     *
     * <p><b>Why this is public and static.</b> The rule is the CPR module's
     * definition of "which row is live", and it is published so a second
     * CPR-owned read path can reuse it instead of copying it: the Calendar's
     * {@code cpr.api.CprCalendarReadAdapter} composes it with the
     * archived/deleted exclusion. It is a pure predicate over the criteria
     * arguments it is given (no instance state), which is why it can be static;
     * every caller that lists or counts CPRs keeps using it unchanged.
     */
    public static Predicate latestPerChainPredicate(jakarta.persistence.criteria.Root<Cpr> root, jakarta.persistence.criteria.CriteriaQuery<?> query, jakarta.persistence.criteria.CriteriaBuilder cb) {
        Subquery<Long> newer = query.subquery(Long.class);
        jakarta.persistence.criteria.Root<Cpr> newerRoot = newer.from(Cpr.class);
        newer.select(newerRoot.get("id"));
        newer.where(cb.and(
                cb.equal(newerRoot.get("revisionOf"),
                        cb.coalesce(root.get("revisionOf"), root.get("id"))),
                cb.greaterThan(cb.coalesce(newerRoot.get("revision"), 0),
                        cb.coalesce(root.get("revision"), 0))));
        return cb.or(cb.isTrue(root.get("latestRevision")), cb.not(cb.exists(newer)));
    }

    private Specification<Cpr> buildSpecification(String search, String status, String approval,
                                                  String department, String dateFrom, String dateTo,
                                                  BigDecimal minValue, BigDecimal maxValue) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(latestPerChainPredicate(root, query, cb));
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                // description is a @Lob TEXT column; lower() on a LOB fails on MySQL,
                // so cast it to a string before applying lower().
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("prNo")), like),
                        cb.like(cb.lower(root.get("clientName")), like),
                        cb.like(cb.lower(root.get("leadNo")), like),
                        cb.like(cb.lower(cb.toString(root.get("description"))), like),
                        cb.like(cb.lower(root.get("project")), like),
                        cb.like(cb.lower(root.get("department")), like),
                        cb.like(cb.lower(root.get("requestedBy")), like),
                        cb.like(cb.lower(root.get("company")), like)
                ));
            }
            if (status != null && !status.isBlank()) {
                predicates.add(cb.equal(root.get("status"), parseStatus(status)));
            } else {
                predicates.add(cb.not(root.get("status").in(CprStatus.ARCHIVED, CprStatus.DELETED)));
            }
            if (approval != null && !approval.isBlank()) {
                predicates.add(cb.equal(root.get("approvalStatus"), parseApprovalStatus(approval)));
            }
            if (department != null && !department.isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("department")), department.trim().toLowerCase()));
            }
            if (dateFrom != null && !dateFrom.isBlank()) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("createdAt"), LocalDate.parse(dateFrom).atStartOfDay()));
            }
            if (dateTo != null && !dateTo.isBlank()) {
                predicates.add(cb.lessThanOrEqualTo(root.get("createdAt"), LocalDate.parse(dateTo).atTime(23, 59, 59)));
            }
            if (minValue != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("grandTotal"), minValue));
            }
            if (maxValue != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("grandTotal"), maxValue));
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
            case "prNo", "client", "clientName", "department", "requestedBy", "createdBy", "status", "grandTotal",
                 "createdAt", "updatedAt", "leadNo", "project" -> "createdAt".equals(field) ? "createdAt"
                    : "updatedAt".equals(field) ? "updatedAt"
                    : "client".equals(field) ? "clientName"
                    : "createdBy".equals(field) ? "requestedBy" : field;
            default -> "createdAt";
        };
        boolean asc = parts.length > 1 && "asc".equalsIgnoreCase(parts[1]);
        return Sort.by(asc ? Sort.Direction.ASC : Sort.Direction.DESC, mapped);
    }

    /**
     * Resolves the CPR number for a brand-new row.
     * <p>
     * A client-supplied number is honoured when it is free; otherwise (and when
     * no number was supplied) the next free number in the current-year series is
     * generated. Every candidate is checked against the UNIQUE {@code pr_no} and
     * retried upwards, so two concurrent creates can never both claim the same
     * number — the loser simply takes the next free one. A CREATE that reaches
     * the backend twice therefore still cannot produce duplicate CPR numbers.
     */
    private String resolveCreatePrNo(String requested) {
        if (requested != null && !requested.isBlank()) {
            String candidate = requested.trim();
            if (!cprRepository.existsByPrNo(candidate)) {
                return candidate;
            }
        }
        long seq = nextSequence();
        for (int attempt = 0; attempt < 50; attempt++) {
            String candidate = buildPrNo(seq + attempt);
            if (!cprRepository.existsByPrNo(candidate)) {
                return candidate;
            }
        }
        throw new BadRequestException("Could not allocate a free CPR number — please retry");
    }

    private long nextSequence() {
        long maxSuffix = 0;
        String prefix = "CPR-" + Year.now().getValue() + "-";
        // Only the pr_no column is read (scalar projection): the next number is
        // derived without hydrating every CPR aggregate in the table.
        for (String prNo : cprRepository.findPrNosWithPrefix(prefix)) {
            if (prNo == null || !prNo.startsWith(prefix)) {
                continue;
            }
            // Strip revision suffixes like (1), (2) before parsing.
            // e.g. CPR-2026-000107(1) -> base number 107.
            String raw = prNo.substring(prefix.length()).replaceFirst("\\(\\d+\\)$", "");
            try {
                maxSuffix = Math.max(maxSuffix, Long.parseLong(raw));
            } catch (NumberFormatException ignored) {
                // skip malformed numbers
            }
        }
        return maxSuffix + 1;
    }

    private String buildPrNo(long sequence) {
        return String.format("CPR-%d-%06d", Year.now().getValue(), sequence);
    }

    private LocalDate parseLocalDate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(value.trim());
        } catch (Exception e) {
            return null;
        }
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

    private CprStatus parseStatus(String value) {
        String normalized = value.trim().toUpperCase().replace(" ", "_").replace("-", "_");
        // The CPR form offers a "Submitted" status option; map it to the backend
        // PENDING_APPROVAL status instead of rejecting it.
        if ("SUBMITTED".equals(normalized)) {
            return CprStatus.PENDING_APPROVAL;
        }
        try {
            return CprStatus.valueOf(normalized);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid status: " + value);
        }
    }

    private CprApprovalStatus parseApprovalStatus(String value) {
        try {
            return CprApprovalStatus.valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid approval status: " + value);
        }
    }

    private String statusKey(CprStatus status) {
        if (status == null) {
            return "draft";
        }
        return switch (status) {
            case COST_WORKOUT -> "cost workout";
            case PENDING_APPROVAL -> "pending approval";
            case APPROVED -> "approved";
            case REJECTED -> "rejected";
            case CONVERTED -> "converted";
            case ARCHIVED -> "archived";
            case DELETED -> "deleted";
            default -> "draft";
        };
    }

    private String stageKey(CprStatus status) {
        if (status == null) {
            return "Draft";
        }
        return switch (status) {
            case COST_WORKOUT -> "Cost Workout";
            case PENDING_APPROVAL -> "Approval";
            case APPROVED -> "Approved";
            case REJECTED -> "Rejected";
            case CONVERTED -> "Converted";
            case ARCHIVED -> "Archived";
            case DELETED -> "Deleted";
            default -> "Draft";
        };
    }

    private String approvalKey(CprApprovalStatus status) {
        if (status == null) {
            return "";
        }
        return switch (status) {
            case APPROVED -> "Approved";
            case REJECTED -> "Rejected";
            default -> "Pending";
        };
    }

    private String label(Enum<?> value) {
        if (value == null) {
            return null;
        }
        return value.name().substring(0, 1) + value.name().substring(1).toLowerCase().replace("_", " ");
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

    private String currentUserName() {
        return auditContext.currentUserName();
    }
}
