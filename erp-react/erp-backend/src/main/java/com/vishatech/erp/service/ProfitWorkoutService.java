package com.vishatech.erp.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.dto.ConversionResult;
import com.vishatech.erp.dto.ProfitWorkoutAttachment;
import com.vishatech.erp.dto.ProfitWorkoutCategoryRequest;
import com.vishatech.erp.dto.ProfitWorkoutCategoryResponse;
import com.vishatech.erp.dto.ProfitWorkoutItemRequest;
import com.vishatech.erp.dto.ProfitWorkoutItemResponse;
import com.vishatech.erp.dto.ProfitWorkoutNextNumberResponse;
import com.vishatech.erp.dto.ProfitWorkoutRequest;
import com.vishatech.erp.dto.ProfitWorkoutResponse;
import com.vishatech.erp.dto.ProfitWorkoutTimelineResponse;
import com.vishatech.erp.dto.QuotationResponse;
import com.vishatech.erp.dto.RevisionInfo;
import com.vishatech.erp.entity.CostWorkout;
import com.vishatech.erp.entity.CostWorkoutTimeline;
import com.vishatech.erp.entity.ProfitWorkout;
import com.vishatech.erp.entity.ProfitWorkoutCategory;
import com.vishatech.erp.entity.ProfitWorkoutItem;
import com.vishatech.erp.entity.ProfitWorkoutStatus;
import com.vishatech.erp.entity.ProfitWorkoutTimeline;
import com.vishatech.erp.entity.CwMasterData;
import com.vishatech.erp.entity.Quotation;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.DuplicateResourceException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.crm.entity.Customer;
import com.vishatech.erp.crm.repository.CustomerRepository;
import com.vishatech.erp.repository.CostWorkoutRepository;
import com.vishatech.erp.repository.ProfitWorkoutRepository;
import com.vishatech.erp.repository.CwMasterDataRepository;
import com.vishatech.erp.repository.QuotationRepository;
import com.vishatech.erp.util.AuditContext;
import com.vishatech.erp.crm.entity.Lead;
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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class ProfitWorkoutService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final int MAX_REMARKS = 100000;
    private static final ObjectMapper PW_JSON = new ObjectMapper();
    /**
     * Quotation {@code reference} written for a Profit Workout conversion. It is
     * the established PW → Quotation link ({@link #convertedQtnFor(String)} reads
     * it back), so the conversion-prefilled form's save writes the same value.
     */
    public static final String QUOTATION_REF_PREFIX = "Generated from Profit Workout ";

    private final ProfitWorkoutRepository profitWorkoutRepository;
    private final CwMasterDataRepository masterDataRepository;
    private final AuditContext auditContext;
    private final QuotationService quotationService;
    private final QuotationRepository quotationRepository;
    private final DocumentRepositoryService documentRepositoryService;
    /** Resolves the ACTUAL client of the source record, for the currency. */
    private final CustomerRepository customerRepository;
    /** Source Cost Workout of a conversion-prefilled creation form. */
    private final CostWorkoutRepository costWorkoutRepository;

    public ProfitWorkoutService(ProfitWorkoutRepository profitWorkoutRepository,
                              CwMasterDataRepository masterDataRepository,
                              AuditContext auditContext,
                              QuotationService quotationService,
                              QuotationRepository quotationRepository,
                              DocumentRepositoryService documentRepositoryService,
                              CustomerRepository customerRepository,
                              CostWorkoutRepository costWorkoutRepository) {
        this.profitWorkoutRepository = profitWorkoutRepository;
        this.masterDataRepository = masterDataRepository;
        this.auditContext = auditContext;
        this.quotationService = quotationService;
        this.quotationRepository = quotationRepository;
        this.documentRepositoryService = documentRepositoryService;
        this.customerRepository = customerRepository;
        this.costWorkoutRepository = costWorkoutRepository;
    }

    // ---------------------------------------------------------------------
    // Document-mirror shim (TARGET adaptation).
    //
    // SOURCE mirrors each record into the Documents module via
    // DocumentRepositoryService#syncRecordDocumentQuietly /
    // purgeRecordDocumentsQuietly. TARGET's Documents module is protected in
    // this task and does not expose those methods, so this no-op keeps the
    // SOURCE control flow without touching Documents.
    // ---------------------------------------------------------------------
    private void syncPwDocument(String module, Long recordId, String code, String docType,
                        String docNo, Long customerId, String customerName, String status) {
        // Intentionally no-op — see note above.
    }

    private void purgePwDocument(Long recordId) {
        // Intentionally no-op — see note above.
    }

    /**
     * The currency must be the ACTUAL currency of the source record's client, never a
     * hardcoded "INR". This used to hardcode INR, so a USD / EUR / GBP client's Profit
     * Workout — and every quotation converted from it — was created in INR and then
     * rendered with ₹. Falls back to INR only when the client has no currency set.
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
    public Page<ProfitWorkoutResponse> list(int page, int size, String search, String sort, String status,
                                          String cprRef, String customer, String company, String preparedBy,
                                          String dateFrom, String dateTo) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort));
        Specification<ProfitWorkout> spec = buildSpecification(search, status, cprRef, customer, company,
                preparedBy, dateFrom, dateTo);
        Map<String, String> convertedByPwNo = convertedQuotationMap();
        return profitWorkoutRepository.findAll(spec, pageable)
                .map(pw -> toResponse(pw, List.of(), convertedByPwNo.get(pw.getPwNo())));
    }

    @Transactional(readOnly = true)
    public ProfitWorkoutResponse get(Long id) {
        return toResponseDetail(getPw(id));
    }

    @Transactional(readOnly = true)
    public List<ProfitWorkoutItemResponse> getItems(Long id) {
        return getPw(id).getItems().stream().map(this::itemResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<ProfitWorkoutTimelineResponse> getTimeline(Long id) {
        return getPw(id).getTimeline().stream().map(this::timelineResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<ProfitWorkoutAttachment> getAttachments(Long id) {
        return parseAttachments(getPw(id).getAttachmentsJson());
    }

    @Transactional(readOnly = true)
    public ProfitWorkoutNextNumberResponse getNextNumber() {
        long next = nextSequence();
        return new ProfitWorkoutNextNumberResponse(buildPwNo(next), next);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> stats() {
        // Count only the CURRENT revision of each chain so KPI cards match
        // the list rows (older revisions are surfaced through the Document
        // Workflow dropdown, never as separate list rows).
        long draft = profitWorkoutRepository.countCurrentByStatus(ProfitWorkoutStatus.DRAFT);
        long completed = profitWorkoutRepository.countCurrentByStatus(ProfitWorkoutStatus.COMPLETED);
        long submitted = profitWorkoutRepository.countCurrentByStatus(ProfitWorkoutStatus.SUBMITTED);
        long approved = profitWorkoutRepository.countCurrentByStatus(ProfitWorkoutStatus.APPROVED);
        long rejected = profitWorkoutRepository.countCurrentByStatus(ProfitWorkoutStatus.REJECTED);
        long archived = profitWorkoutRepository.countCurrentByStatus(ProfitWorkoutStatus.ARCHIVED);
        long deleted = profitWorkoutRepository.countCurrentByStatus(ProfitWorkoutStatus.DELETED);
        long active = draft + completed + submitted + approved + rejected;
        BigDecimal totalValue = profitWorkoutRepository.sumGrandTotalExcluding(
                List.of(ProfitWorkoutStatus.ARCHIVED, ProfitWorkoutStatus.DELETED));

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", active);
        stats.put("active", active);
        stats.put("draft", draft);
        stats.put("completed", completed);
        // 'Submitted' is NOT a pending-approval state: the workflow has no
        // literal awaiting-approval status, so the pending count is always 0.
        stats.put("submitted", submitted);
        stats.put("pending", 0L);
        stats.put("approved", approved);
        stats.put("rejected", rejected);
        stats.put("archived", archived);
        stats.put("deleted", deleted);
        stats.put("totalValue", totalValue);
        return stats;
    }

    // ============================== Write ==============================

    public ProfitWorkoutResponse create(ProfitWorkoutRequest request, boolean draft) {
        ProfitWorkout pw = new ProfitWorkout();
        // Cost Workout → Profit Workout conversion: the creation form carries the
        // source Cost Workout, so the saved Profit Workout keeps the real source
        // reference and the one-CW→one-PW rule is enforced HERE, on the server,
        // whatever the client sends or repeats. A plain create (no source) is
        // completely unaffected.
        CostWorkout sourceCw = resolveSourceCostWorkout(request.sourceCwId());
        if (sourceCw != null) {
            pw.setSourceCwId(sourceCw.getId());
            pw.setSourceCwNo(sourceCw.getCwNo());
        }
        if (request.pwNo() != null && !request.pwNo().isBlank()) {
            String pwNo = request.pwNo().trim();
            if (profitWorkoutRepository.existsByPwNo(pwNo)) {
                throw new DuplicateResourceException("Profit Workout number already exists: " + pwNo);
            }
            pw.setPwNo(pwNo);
        } else {
            pw.setPwNo(buildPwNo(nextSequence()));
        }
        // Records born from an autosave / Save-Draft are flagged as not yet
        // committed: the first explicit save commits them in place with NO
        // revision (see update()).
        pw.setDraftOnly(draft);
        applyRequest(pw, request);
        if (draft) {
            pw.setStatus(ProfitWorkoutStatus.DRAFT);
        } else if (request.status() != null && !request.status().isBlank()) {
            ProfitWorkoutStatus parsed = parseStatus(request.status());
            pw.setStatus(parsed == ProfitWorkoutStatus.COMPLETED ? ProfitWorkoutStatus.COMPLETED : ProfitWorkoutStatus.DRAFT);
        } else {
            pw.setStatus(ProfitWorkoutStatus.DRAFT);
        }
        recalc(pw);
        if (!draft) {
            pw.addTimeline(entry("created", "Profit Workout created",
                    "Profit Workout '" + pw.getPwNo() + "' was created by " + currentUserName() + "."));
        }
        ProfitWorkout saved = profitWorkoutRepository.save(pw);
        syncPwDocument(
                "Profit Workout", saved.getId(), saved.getPwNo(), "Profit Workout", saved.getPwNo(),
                null, saved.getCustomerName(), saved.getStatus().name());
        if (sourceCw != null) {
            // Same back-link the explicit conversion records, so the Cost Workout
            // reports the Profit Workout it produced (and offers to open it).
            linkConvertedCostWorkout(sourceCw, saved);
        }
        return toResponse(saved);
    }

    /**
     * Resolves the Cost Workout a creation form was prefilled from and rejects a
     * duplicate conversion (one CW → one PW). Returns null for a plain create.
     *
     * <p>Race safety: the CW row is locked FOR UPDATE as the first statement of
     * this (transactional) create, so two concurrent saves for the same source
     * Cost Workout cannot both pass the duplicate check. The second one waits for
     * the first transaction to commit, then sees its {@code convertedToPw} link
     * (read under the same lock) and is rejected with the normal 409.
     */
    private CostWorkout resolveSourceCostWorkout(Long sourceCwId) {
        if (sourceCwId == null) {
            return null;
        }
        CostWorkout cw = costWorkoutRepository.findByIdForUpdate(sourceCwId)
                .orElseThrow(() -> new ResourceNotFoundException("Cost Workout not found with id: " + sourceCwId));
        if (cw.getConvertedToPw() != null && !cw.getConvertedToPw().isBlank()) {
            throw new DuplicateResourceException("Profit Workout " + cw.getConvertedToPw()
                    + " already exists for Cost Workout " + cw.getCwNo());
        }
        profitWorkoutRepository.findFirstBySourceCwIdAndStatusNot(cw.getId(), ProfitWorkoutStatus.DELETED)
                .ifPresent(existing -> {
                    throw new DuplicateResourceException("Profit Workout " + existing.getPwNo()
                            + " already exists for Cost Workout " + cw.getCwNo());
                });
        return cw;
    }

    /** Records the CW → PW relationship on the source Cost Workout (link + timeline). */
    private void linkConvertedCostWorkout(CostWorkout cw, ProfitWorkout pw) {
        cw.setConvertedToPw(pw.getPwNo());
        cw.setConvertedToPwId(pw.getId());
        CostWorkoutTimeline entry = new CostWorkoutTimeline();
        entry.setType("converted");
        entry.setTitle("Converted to profit workout");
        entry.setDetail("Cost Workout converted to Profit Workout " + pw.getPwNo() + ".");
        cw.addTimeline(entry);
        costWorkoutRepository.save(cw);
    }

    /**
     * Creates a persisted Profit Workout from a Cost Workout (explicit
     * conversion — one CW → one PW). Mirrors the CW→Quotation conversion: the
     * customer details, items (description / qty / unit / categories / cost
     * values) and attachments are carried over unchanged, the Profit Workout
     * keeps the source CW reference, and recalc() derives every item's own
     * cost / selling / profit with the existing profitPct formula.
     */
    public ProfitWorkoutResponse createFromCostWorkout(com.vishatech.erp.entity.CostWorkout cw) {
        ProfitWorkout pw = new ProfitWorkout();
        pw.setPwNo(buildPwNo(nextSequence()));
        pw.setPwDate(LocalDateTime.now());
        pw.setStatus(ProfitWorkoutStatus.DRAFT);
        pw.setPreparedBy(cw.getPreparedBy());
        pw.setContactPerson(cw.getContactPerson());
        pw.setDepartment(cw.getDepartment());
        // The Cost Workout carries no currency column, so the currency is resolved
        // from the CPR's client — the actual currency of the record. Project and
        // additional charges keep their defaults.
        pw.setCurrency(resolveClientCurrency(cprClientId(cw.getCpr())));
        pw.setProject(null);
        pw.setAdditionalCharges(BigDecimal.ZERO);
        pw.setSourceLead(cw.getSourceLead());
        pw.setCustomerName(cw.getCustomerName());
        pw.setCprRef(cw.getCprRef());
        pw.setCprId(cw.getCprId());
        pw.setPhone(cw.getPhone());
        pw.setEmail(cw.getEmail());
        pw.setCompany(cw.getCompany());
        pw.setGst(cw.getGst());
        pw.setPan(cw.getPan());
        pw.setLinkedCpr(cw.getLinkedCpr());
        pw.setBillingAddress(cw.getBillingAddress());
        pw.setShippingAddress(cw.getShippingAddress());
        pw.setRemarks(cw.getRemarks());
        pw.setProfitPct(cw.getProfitPct() == null ? BigDecimal.ZERO : cw.getProfitPct());
        pw.setDiscountPct(cw.getDiscountPct() == null ? BigDecimal.ZERO : cw.getDiscountPct());
        pw.setGstPct(cw.getGstPct() == null ? BigDecimal.valueOf(18) : cw.getGstPct());
        pw.setSourceCwId(cw.getId());
        pw.setSourceCwNo(cw.getCwNo());
        // Attachments are carried over as-is (same document architecture:
        // JSON in the LONGTEXT attachmentsJson). The source CW keeps its own
        // copy — nothing is moved or deleted.
        if (cw.getAttachmentsJson() != null && !cw.getAttachmentsJson().isBlank()) {
            pw.setAttachmentsJson(cw.getAttachmentsJson());
        }
        if (cw.getItems() != null) {
            for (com.vishatech.erp.entity.CostWorkoutItem sourceItem : cw.getItems()) {
                ProfitWorkoutItem item = new ProfitWorkoutItem();
                item.setDescription(sourceItem.getDescription());
                item.setQty(sourceItem.getQty() == null ? BigDecimal.ONE : sourceItem.getQty());
                item.setUnit(sourceItem.getUnit());
                for (com.vishatech.erp.entity.CostWorkoutCategory sourceCat : sourceItem.getCategories()) {
                    ProfitWorkoutCategory cat = new ProfitWorkoutCategory();
                    cat.setCategory(sourceCat.getCategory());
                    cat.setQty(sourceCat.getQty());
                    cat.setUnit(sourceCat.getUnit());
                    cat.setRate(sourceCat.getRate());
                    cat.setNotes(sourceCat.getNotes());
                    item.addCategory(cat);
                }
                pw.addItem(item);
            }
        }
        recalc(pw);
        pw.addTimeline(entry("created", "Profit Workout created",
                "Profit Workout '" + pw.getPwNo() + "' was created from Cost Workout '"
                        + (cw.getCwNo() == null ? "" : cw.getCwNo()) + "'."));
        ProfitWorkout saved = profitWorkoutRepository.save(pw);
        return toResponse(saved);
    }

    /**
     * Every edit creates a NEW revision row (BASE(N)); the previous version is
     * never deleted or overwritten. Only the latest revision is editable.
     *
     * <p><b>Draft / autosave rule (same contract as {@link CprService#update})</b>:
     * the 30-second background autosave and the Save-Draft button send
     * {@code draft=true}, which updates the current row IN PLACE — no revision,
     * no timeline entry, no edit-history. The first explicit (non-draft) save of
     * a never-committed ({@code draftOnly}) row is the moment the record is
     * actually created: it also commits in place with NO revision. Only a
     * genuine edit of an already-committed record creates a revision, and even
     * then only when the persisted business data actually changed (no-op guard).
     */
    public ProfitWorkoutResponse update(Long id, ProfitWorkoutRequest request) {
        return update(id, request, false);
    }

    public ProfitWorkoutResponse update(Long id, ProfitWorkoutRequest request, boolean draft) {
        ProfitWorkout current = getPw(id);
        if (!current.isLatestRevision()) {
            throw new BadRequestException("Only the latest revision can be edited");
        }
        if (current.getStatus() == ProfitWorkoutStatus.DELETED) {
            throw new BadRequestException("Cannot edit a deleted Profit Workout");
        }

        // ---- Draft / autosave: in-place update, invisible to the revision chain ----
        if (draft) {
            applyRequest(current, request);
            if (request.status() != null && !request.status().isBlank()) {
                ProfitWorkoutStatus parsed = parseStatus(request.status());
                current.setStatus(parsed == ProfitWorkoutStatus.COMPLETED ? ProfitWorkoutStatus.COMPLETED : ProfitWorkoutStatus.DRAFT);
            }
            recalc(current);
            ProfitWorkout saved = profitWorkoutRepository.save(current);
            syncPwDocument(
                    "Profit Workout", saved.getId(), saved.getPwNo(), "Profit Workout", saved.getPwNo(),
                    null, saved.getCustomerName(), saved.getStatus().name());
            return toResponseDetail(saved);
        }

        // ---- First explicit save of a draft-born record: CREATE moment ----
        if (current.getRevision() == 0 && current.isDraftOnly()) {
            current.setDraftOnly(false);
            applyRequest(current, request);
            if (request.status() != null && !request.status().isBlank()) {
                ProfitWorkoutStatus parsed = parseStatus(request.status());
                current.setStatus(parsed == ProfitWorkoutStatus.COMPLETED ? ProfitWorkoutStatus.COMPLETED : ProfitWorkoutStatus.DRAFT);
            }
            recalc(current);
            current.addTimeline(entry("created", "Profit Workout created",
                    "Profit Workout '" + current.getPwNo() + "' was created by " + currentUserName() + "."));
            ProfitWorkout saved = profitWorkoutRepository.save(current);
            syncPwDocument(
                    "Profit Workout", saved.getId(), saved.getPwNo(), "Profit Workout", saved.getPwNo(),
                    null, saved.getCustomerName(), saved.getStatus().name());
            return toResponseDetail(saved);
        }

        Long baseId = current.getRevisionOf() != null ? current.getRevisionOf() : current.getId();
        int nextRev = maxRevisionOfChain(baseId) + 1;

        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(current);

        ProfitWorkout revision = new ProfitWorkout();
        copyForRevision(revision, current);
        applyRequest(revision, request);
        if (request.status() != null && !request.status().isBlank()) {
            ProfitWorkoutStatus parsed = parseStatus(request.status());
            ProfitWorkoutStatus currentStatus = revision.getStatus();
            // A plain save only toggles draft/completed while the record is
            // still in the editable states (draft/completed/rejected). Records
            // already submitted/approved/archived/deleted KEEP their persisted
            // status — approval transitions go through the dedicated
            // submit/approve/reject endpoints, never through the edit form.
            boolean transitionable = currentStatus == ProfitWorkoutStatus.DRAFT
                    || currentStatus == ProfitWorkoutStatus.COMPLETED
                    || currentStatus == ProfitWorkoutStatus.REJECTED;
            if (transitionable) {
                if (parsed == ProfitWorkoutStatus.COMPLETED) {
                    revision.setStatus(ProfitWorkoutStatus.COMPLETED);
                } else {
                    revision.setStatus(ProfitWorkoutStatus.DRAFT);
                }
            }
        }
        recalc(revision);

        // No-op guard: saving without touching persisted business data must
        // NOT fabricate a revision (autosave retried, refresh, no-change save).
        // The items fingerprint catches item edits that leave scalars untouched.
        Map<String, String> guardBefore = new LinkedHashMap<>(editBefore);
        guardBefore.put("itemsFingerprint", EditHistoryService.itemsFingerprint(current));
        Map<String, String> guardAfter = new LinkedHashMap<>(editHistory.snapshot(revision));
        guardAfter.put("itemsFingerprint", EditHistoryService.itemsFingerprint(revision));
        if (EditHistoryService.isNoOpEdit(guardBefore, guardAfter)) {
            return toResponseDetail(current);
        }

        revision.setPwNo(RevisionSupport.nextRevisionNumber(
                RevisionSupport.baseNumber(current.getPwNo()), nextRev));
        revision.setRevisionOf(baseId);
        revision.setRevision(nextRev);
        revision.setRevisionDate(java.time.LocalDateTime.now());
        revision.setLatestRevision(true);

        revision.addTimeline(entry("updated", "Profit Workout updated",
                "Profit Workout details were updated by " + currentUserName() + "."));

        current.setLatestRevision(false);
        profitWorkoutRepository.save(current);
        ProfitWorkout saved = profitWorkoutRepository.saveAndFlush(revision);
        editHistory.recordEdit("profit-workout", saved.getId(), editBefore, editHistory.snapshot(saved));
        syncPwDocument(
                "Profit Workout", saved.getId(), saved.getPwNo(), "Profit Workout", saved.getPwNo(),
                null, saved.getCustomerName(), saved.getStatus().name());
        return toResponseDetail(saved);
    }

    public ProfitWorkoutResponse delete(Long id) {
        ProfitWorkout pw = getPw(id);
        RevisionSupport.requireLatest(pw.isLatestRevision());
        ProfitWorkoutStatus previous = pw.getStatus();
        pw.setStatus(ProfitWorkoutStatus.DELETED);
        pw.setArchivedAt(LocalDateTime.now());
        pw.addTimeline(entry("deleted", "Profit Workout deleted",
                "Profit Workout was moved to trash by " + currentUserName() + "."));
        ProfitWorkout saved = profitWorkoutRepository.save(pw);
        syncPwDocument(
                "Profit Workout", saved.getId(), saved.getPwNo(), "Profit Workout", saved.getPwNo(),
                null, saved.getCustomerName(), saved.getStatus().name());
        return toResponse(saved);
    }

    public void permanentDelete(Long id) {
        ProfitWorkout pw = getPw(id);
        purgePwDocument(id);
        profitWorkoutRepository.delete(pw);
    }

    public ProfitWorkoutResponse restore(Long id) {
        ProfitWorkout pw = getPw(id);
        RevisionSupport.requireLatest(pw.isLatestRevision());
        ProfitWorkoutStatus previous = pw.getStatus();
        ProfitWorkoutStatus target = (previous == ProfitWorkoutStatus.DELETED || previous == ProfitWorkoutStatus.ARCHIVED)
                ? ProfitWorkoutStatus.DRAFT : previous;
        pw.setStatus(target);
        pw.setArchivedAt(null);
        pw.addTimeline(entry("restored", "Profit Workout restored",
                "Profit Workout was restored by " + currentUserName() + "."));
        ProfitWorkout saved = profitWorkoutRepository.save(pw);
        syncPwDocument(
                "Profit Workout", saved.getId(), saved.getPwNo(), "Profit Workout", saved.getPwNo(),
                null, saved.getCustomerName(), saved.getStatus().name());
        return toResponse(saved);
    }

    public ProfitWorkoutResponse archive(Long id) {
        ProfitWorkout pw = getPw(id);
        RevisionSupport.requireLatest(pw.isLatestRevision());
        ProfitWorkoutStatus previous = pw.getStatus();
        pw.setStatus(ProfitWorkoutStatus.ARCHIVED);
        pw.setArchivedAt(LocalDateTime.now());
        pw.addTimeline(entry("archived", "Profit Workout archived",
                "Profit Workout was archived by " + currentUserName() + "."));
        ProfitWorkout saved = profitWorkoutRepository.save(pw);
        syncPwDocument(
                "Profit Workout", saved.getId(), saved.getPwNo(), "Profit Workout", saved.getPwNo(),
                null, saved.getCustomerName(), saved.getStatus().name());
        return toResponse(saved);
    }

    public ProfitWorkoutResponse submit(Long id) {
        ProfitWorkout pw = getPw(id);
        RevisionSupport.requireLatest(pw.isLatestRevision());
        ProfitWorkoutStatus previous = pw.getStatus();
        if (previous == ProfitWorkoutStatus.SUBMITTED || previous == ProfitWorkoutStatus.APPROVED
                || previous == ProfitWorkoutStatus.ARCHIVED || previous == ProfitWorkoutStatus.DELETED) {
            throw new BadRequestException("Profit Workout cannot be submitted from status '" + label(previous) + "'");
        }
        pw.setStatus(ProfitWorkoutStatus.SUBMITTED);
        pw.addTimeline(entry("submitted", "Submitted for approval",
                "Profit Workout submitted for approval by " + currentUserName() + "."));
        ProfitWorkout saved = profitWorkoutRepository.save(pw);
        return toResponse(saved);
    }

    public ProfitWorkoutResponse approve(Long id, String remarks) {
        ProfitWorkout pw = getPw(id);
        RevisionSupport.requireLatest(pw.isLatestRevision());
        if (pw.getStatus() != ProfitWorkoutStatus.SUBMITTED) {
            throw new BadRequestException("Only submitted Profit Workouts can be approved (current: "
                    + label(pw.getStatus()) + ")");
        }
        pw.setStatus(ProfitWorkoutStatus.APPROVED);
        pw.setApprovedBy(currentUserName());
        pw.setRejectionReason(null);
        pw.addTimeline(entry("approved", "Profit Workout approved",
                "Profit Workout approved by " + currentUserName()
                        + (remarks != null && !remarks.isBlank() ? " - " + remarks : "") + "."));
        ProfitWorkout saved = profitWorkoutRepository.save(pw);
        return toResponse(saved);
    }

    public ProfitWorkoutResponse reject(Long id, String remarks) {
        ProfitWorkout pw = getPw(id);
        RevisionSupport.requireLatest(pw.isLatestRevision());
        if (pw.getStatus() != ProfitWorkoutStatus.SUBMITTED) {
            throw new BadRequestException("Only submitted Profit Workouts can be rejected (current: "
                    + label(pw.getStatus()) + ")");
        }
        pw.setStatus(ProfitWorkoutStatus.REJECTED);
        pw.setApprovedBy(null);
        pw.setRejectionReason(remarks);
        pw.addTimeline(entry("rejected", "Profit Workout rejected",
                "Profit Workout rejected by " + currentUserName()
                        + (remarks != null && !remarks.isBlank() ? " - " + remarks : "") + "."));
        ProfitWorkout saved = profitWorkoutRepository.save(pw);
        return toResponse(saved);
    }

    /**
     * Profit Workout → Quotation conversion.
     *
     * <p>The conversion is status-independent, exactly like the Cost Workout →
     * Profit Workout conversion: the list offers "Convert to Quotation" for
     * every Profit Workout row (the Deleted tab shows only Restore / Permanent
     * Delete), so a DRAFT / COMPLETED / SUBMITTED / APPROVED / REJECTED /
     * ARCHIVED record must convert. The previous APPROVED-only gate answered
     * 400 for every other status and made the always-visible action unusable.
     *
     * <p>The genuine rules stay: the record must exist and one Profit Workout
     * maps to exactly one quotation (repeat conversions are rejected with the
     * existing quotation number). The Profit Workout itself is never modified
     * beyond the conversion timeline entry.
     */
    public ConversionResult convertToQuotation(Long id) {
        ProfitWorkout pw = getPw(id);
        // Same source-row lock the conversion-prefilled form's save takes
        // (QuotationService#create -> findByPwNoForUpdate). Without it a legacy
        // conversion racing that form could pass the duplicate check here before
        // the form's quotation is committed, and the Profit Workout would end up
        // with two quotations. The lock is held until this transaction commits.
        pw = profitWorkoutRepository.findByPwNoForUpdate(pw.getPwNo()).orElse(pw);
        String existing = convertedQtnFor(pw.getPwNo());
        if (existing != null && !existing.isBlank()) {
            throw new BadRequestException("Profit Workout already converted to quotation '" + existing + "'");
        }
        QuotationResponse quotation = quotationService.createFromProfitWorkout(pw);
        pw.addTimeline(entry("converted", "Converted to quotation",
                "Profit Workout converted to quotation " + quotation.quotationNo() + "."));
        profitWorkoutRepository.save(pw);
        return new ConversionResult("quotation", quotation.id(), quotation.quotationNo(),
                "Quotation " + quotation.quotationNo() + " created from Profit Workout " + pw.getPwNo());
    }

    public ProfitWorkoutResponse duplicate(Long id) {
        ProfitWorkout source = getPw(id);
        ProfitWorkout copy = new ProfitWorkout();
        copy.setPwNo(buildPwNo(nextSequence()));
        copy.setPwDate(LocalDateTime.now());
        copy.setStatus(ProfitWorkoutStatus.DRAFT);
        copy.setPreparedBy(source.getPreparedBy());
        copy.setContactPerson(source.getContactPerson());
        copy.setDepartment(source.getDepartment());
        copy.setCurrency(source.getCurrency());
        copy.setProject(source.getProject());
        copy.setAdditionalCharges(source.getAdditionalCharges());
        copy.setSourceLead(source.getSourceLead());
        copy.setCustomerName(source.getCustomerName());
        copy.setCprRef(source.getCprRef());
        copy.setCprId(source.getCprId());
        copy.setPhone(source.getPhone());
        copy.setEmail(source.getEmail());
        copy.setCompany(source.getCompany());
        copy.setGst(source.getGst());
        copy.setPan(source.getPan());
        copy.setLinkedCpr(source.getLinkedCpr());
        copy.setBillingAddress(source.getBillingAddress());
        copy.setShippingAddress(source.getShippingAddress());
        copy.setRemarks(source.getRemarks());
        copy.setAttachmentsJson(source.getAttachmentsJson());
        copy.setProfitPct(source.getProfitPct());
        copy.setDiscountPct(source.getDiscountPct());
        copy.setGstPct(source.getGstPct());
        for (ProfitWorkoutItem sourceItem : source.getItems()) {
            ProfitWorkoutItem item = new ProfitWorkoutItem();
            item.setDescription(sourceItem.getDescription());
            item.setQty(sourceItem.getQty());
            item.setUnit(sourceItem.getUnit());
            for (ProfitWorkoutCategory sourceCat : sourceItem.getCategories()) {
                ProfitWorkoutCategory cat = new ProfitWorkoutCategory();
                cat.setCategory(sourceCat.getCategory());
                cat.setQty(sourceCat.getQty());
                cat.setUnit(sourceCat.getUnit());
                cat.setRate(sourceCat.getRate());
                cat.setNotes(sourceCat.getNotes());
                item.addCategory(cat);
            }
            copy.addItem(item);
        }
        recalc(copy);
        copy.addTimeline(entry("created", "Profit Workout created",
                "Duplicated from Profit Workout '" + source.getPwNo() + "'."));
        ProfitWorkout saved = profitWorkoutRepository.save(copy);
        return toResponse(saved);
    }

    // ============================== Master data ==============================

    @Transactional(readOnly = true)
    public List<String> getCustomCategories() {
        return readMasterList("cw_categories");
    }

    public void saveCustomCategories(List<String> categories) {
        writeMasterList("cw_categories", categories);
    }

    @Transactional(readOnly = true)
    public List<String> getCustomUnits() {
        return readMasterList("cw_units");
    }

    public void saveCustomUnits(List<String> units) {
        writeMasterList("cw_units", units);
    }

    // ============================== Mapping ==============================

    private void copyForRevision(ProfitWorkout copy, ProfitWorkout source) {
        org.springframework.beans.BeanUtils.copyProperties(source, copy,
                "id", "items", "timeline", "timeline", "revisionOf", "revision", "revisionDate", "latestRevision", "createdAt", "updatedAt", "archivedAt");
        for (ProfitWorkoutItem sourceItem : source.getItems()) {
            ProfitWorkoutItem item = new ProfitWorkoutItem();
            org.springframework.beans.BeanUtils.copyProperties(sourceItem, item,
                    "id", "profitWorkout", "createdAt");
            copy.addItem(item);
        }
    }

    private int maxRevisionOfChain(Long baseId) {
        return profitWorkoutRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .mapToInt(ProfitWorkout::getRevision)
                .max()
                .orElse(0);
    }

    /** Detail response — also carries the full revision chain for the UI. */
    private ProfitWorkoutResponse toResponseDetail(ProfitWorkout pw) {
        return toResponse(pw, revisionChain(pw));
    }

    private List<RevisionInfo> revisionChain(ProfitWorkout pw) {
        Long baseId = pw.getRevisionOf() != null ? pw.getRevisionOf() : pw.getId();
        List<RevisionInfo> chain = new ArrayList<>();
        profitWorkoutRepository.findById(baseId).ifPresent(q -> chain.add(revisionInfo(q)));
        profitWorkoutRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .sorted(java.util.Comparator.comparingInt(ProfitWorkout::getRevision))
                .forEach(q -> chain.add(revisionInfo(q)));
        return chain;
    }

    private RevisionInfo revisionInfo(ProfitWorkout pw) {
        return new RevisionInfo(
                pw.getId(),
                pw.getPwNo(),
                pw.getRevision(),
                statusKey(pw.getStatus()),
                pw.getRevisionDate() == null
                        ? (pw.getCreatedAt() == null ? null : pw.getCreatedAt().toString())
                        : pw.getRevisionDate().toString(),
                pw.isLatestRevision());
    }

    /** When the latest revision is deleted, the previous one becomes latest. */
    private void promotePreviousRevision(ProfitWorkout removed) {
        if (!removed.isLatestRevision()) {
            return;
        }
        Long baseId = removed.getRevisionOf() != null ? removed.getRevisionOf() : removed.getId();
        // Highest remaining revision row first (revision >= 1).
        profitWorkoutRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .filter(q -> !q.getId().equals(removed.getId()))
                .filter(q -> !"deleted".equals(q.getStatus()))
                .findFirst()
                .ifPresentOrElse(q -> {
                    q.setLatestRevision(true);
                    profitWorkoutRepository.save(q);
                    removed.setLatestRevision(false);
                    profitWorkoutRepository.save(removed);
                }, () -> profitWorkoutRepository.findById(baseId).ifPresent(q -> {
                    // Fall back to the base row (revision 0) when no revision rows remain.
                    if (!q.getId().equals(removed.getId()) && !"deleted".equals(q.getStatus())) {
                        q.setLatestRevision(true);
                        profitWorkoutRepository.save(q);
                        removed.setLatestRevision(false);
                        profitWorkoutRepository.save(removed);
                    }
                }));
    }

    /** List/export response - carries no revision chain (avoids N+1). */
    private ProfitWorkoutResponse toResponse(ProfitWorkout entity) {
        return toResponse(entity, List.of(), convertedQtnFor(entity.getPwNo()));
    }

    private ProfitWorkoutResponse toResponse(ProfitWorkout pw, List<RevisionInfo> revisions) {
        return toResponse(pw, revisions, convertedQtnFor(pw.getPwNo()));
    }

    private ProfitWorkoutResponse toResponse(ProfitWorkout pw, List<RevisionInfo> revisions, String convertedToQtn) {
        return new ProfitWorkoutResponse(
                pw.getId(),
                pw.getPwNo(),
                pw.getPwDate() == null ? null : pw.getPwDate().toLocalDate().toString(),
                statusKey(pw.getStatus()),
                pw.getPreparedBy(),
                pw.getContactPerson(),
                pw.getDepartment(),
                pw.getCurrency(),
                pw.getProject(),
                pw.getSourceLead(),
                pw.getCustomerName(),
                pw.getCprRef(),
                pw.getCprId(),
                pw.getPhone(),
                pw.getEmail(),
                pw.getCompany(),
                pw.getGst(),
                pw.getPan(),
                pw.getLinkedCpr(),
                pw.getBillingAddress(),
                pw.getShippingAddress(),
                pw.getRemarks(),
                pw.getProfitPct(),
                pw.getProfitAmt(),
                pw.getSellingPrice(),
                pw.getDiscountPct(),
                pw.getDiscountAmt(),
                pw.getAdditionalCharges(),
                pw.getGstPct(),
                pw.getGstAmt(),
                pw.getSubtotal(),
                pw.getGrandTotal(),
                pw.getApprovedBy(),
                pw.getRejectionReason(),
                pw.getPwDate() == null
                        ? (pw.getCreatedAt() == null ? null : pw.getCreatedAt().toLocalDate().toString())
                        : pw.getPwDate().toLocalDate().toString(),
                pw.getCreatedAt() == null ? null : pw.getCreatedAt().toString(),
                pw.getUpdatedAt() == null ? null : pw.getUpdatedAt().toString(),
                pw.getArchivedAt() == null ? null : pw.getArchivedAt().toString(),
                pw.getItems().stream().map(this::itemResponse).toList(),
                pw.getTimeline().stream().map(this::timelineResponse).toList(),
                pw.getRevision(),
                pw.getRevisionOf(),
                pw.isLatestRevision(),
                pw.getRevisionDate() == null ? null : pw.getRevisionDate().toString(),
                revisions,
                convertedToQtn,
                pw.getSourceCwNo(),
                pw.getSourceCwId()
        );
    }

    private ProfitWorkoutItemResponse itemResponse(ProfitWorkoutItem item) {
        return new ProfitWorkoutItemResponse(item.getId(), item.getDescription(), item.getQty(), item.getCategory(),
                item.getUnit(), item.getCostRate(), item.getSellingRate(), item.getProfitPerUnit(), item.getMargin(),
                item.getCategories().stream().map(this::categoryResponse).toList(),
                item.getCost(), item.getSelling(), item.getProfit());
    }

    private ProfitWorkoutCategoryResponse categoryResponse(ProfitWorkoutCategory cat) {
        return new ProfitWorkoutCategoryResponse(cat.getId(), cat.getCategory(), cat.getQty(), cat.getUnit(),
                cat.getRate(), cat.getAmount(), cat.getNotes());
    }

    private ProfitWorkoutTimelineResponse timelineResponse(ProfitWorkoutTimeline entry) {
        return new ProfitWorkoutTimelineResponse(entry.getId(), entry.getType(), entry.getTitle(), entry.getDetail(),
                entry.getCreatedAt() == null ? null : entry.getCreatedAt().toString());
    }

    private ProfitWorkoutTimeline entry(String type, String title, String detail) {
        ProfitWorkoutTimeline entry = new ProfitWorkoutTimeline();
        entry.setType(type);
        entry.setTitle(title);
        entry.setDetail(detail);
        return entry;
    }

    // ============================== Helpers ==============================

    private ProfitWorkout getPw(Long id) {
        return profitWorkoutRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Profit Workout not found with id: " + id));
    }

    /**
     * Back-link: whenever the Profit Workout changes, sync the linked CPR so it
     * carries the CW id / number / status, the profit-workout amount, and stays in
     * the 'cost workout' stage (unless already further along the workflow).
     * The CPR is resolved by the FK-style cprId column first, then by the legacy
     * cprRef / linkedCpr strings for records created before the FK existed.
     */
    private void applyRequest(ProfitWorkout pw, ProfitWorkoutRequest request) {
        LocalDateTime pwDate = parseDate(request.pwDate());
        if (pwDate == null) {
            throw new BadRequestException("Date is required");
        }
        pw.setPwDate(pwDate);
        if (request.preparedBy() == null || request.preparedBy().isBlank()) {
            throw new BadRequestException("Prepared By is required");
        }
        if (request.department() == null || request.department().isBlank()) {
            throw new BadRequestException("Department is required");
        }
        if (request.sourceLead() == null || request.sourceLead().isBlank()) {
            throw new BadRequestException("Please select a Lead or Client");
        }
        if (request.remarks() != null && request.remarks().length() > MAX_REMARKS) {
            throw new BadRequestException("Remarks exceed maximum length of " + MAX_REMARKS + " characters");
        }
        pw.setPreparedBy(request.preparedBy().trim());
        pw.setDepartment(request.department().trim());
        pw.setCurrency(request.currency());
        pw.setProject(request.project());
        pw.setSourceLead(request.sourceLead().trim());
        pw.setContactPerson(request.contactPerson());
        pw.setCustomerName(request.customerName());
        pw.setCprRef(request.cprRef());
        // Only update the CPR link when the payload actually carries a cprId;
        // a null on edit preserves the existing FK instead of silently dropping it.
        if (request.cprId() != null) {
            pw.setCprId(request.cprId());
        }
        pw.setPhone(request.phone());
        pw.setEmail(request.email());
        pw.setCompany(request.company());
        pw.setGst(request.gst());
        pw.setPan(request.pan());
        pw.setLinkedCpr(request.linkedCpr());
        pw.setBillingAddress(request.billingAddress());
        pw.setShippingAddress(request.shippingAddress());
        pw.setRemarks(request.remarks());
        pw.setProfitPct(pct(request.profitPct(), "Profit %"));
        pw.setDiscountPct(pct(request.discountPct(), "Discount %"));
        pw.setAdditionalCharges(money(request.additionalCharges(), "Additional Charges"));
        pw.setGstPct(pct(request.gstPct(), "GST %"));
        // Only overwrite stored attachments when the payload actually carries
        // them (empty/missing payload preserves existing files on edit).
        if (request.attachments() != null) {
            pw.setAttachmentsJson(serializeAttachments(request.attachments()));
        }

        pw.getItems().clear();
        boolean hasContent = false;
        if (request.items() != null) {
            for (ProfitWorkoutItemRequest itemRequest : request.items()) {
                if (itemRequest == null) {
                    continue;
                }
                ProfitWorkoutItem item = new ProfitWorkoutItem();
                item.setDescription(itemRequest.description());
                BigDecimal qty = itemRequest.qty() == null ? BigDecimal.ONE : itemRequest.qty();
                if (qty.compareTo(BigDecimal.ZERO) < 0) {
                    throw new BadRequestException("Quantity cannot be negative");
                }
                item.setQty(qty);
                item.setCategory(itemRequest.category());
                item.setUnit(itemRequest.unit());
                BigDecimal costRate = itemRequest.costRate();
                BigDecimal sellingRate = itemRequest.sellingRate();
                if (costRate != null && costRate.compareTo(BigDecimal.ZERO) < 0) {
                    throw new BadRequestException("Cost Rate cannot be negative");
                }
                if (sellingRate != null && sellingRate.compareTo(BigDecimal.ZERO) < 0) {
                    throw new BadRequestException("Selling Rate cannot be negative");
                }
                item.setCostRate(costRate);
                item.setSellingRate(sellingRate);
                boolean itemHasContent = (itemRequest.description() != null && !itemRequest.description().isBlank())
                        || (costRate != null && costRate.compareTo(BigDecimal.ZERO) > 0)
                        || (sellingRate != null && sellingRate.compareTo(BigDecimal.ZERO) > 0);
                if (itemRequest.categories() != null) {
                    for (ProfitWorkoutCategoryRequest catRequest : itemRequest.categories()) {
                        if (catRequest == null) {
                            continue;
                        }
                        BigDecimal catQty = catRequest.qty() == null ? BigDecimal.ZERO : catRequest.qty();
                        BigDecimal rate = catRequest.rate() == null ? BigDecimal.ZERO : catRequest.rate();
                        if (catQty.compareTo(BigDecimal.ZERO) < 0 || rate.compareTo(BigDecimal.ZERO) < 0) {
                            throw new BadRequestException("Quantity and Rate cannot be negative");
                        }
                        ProfitWorkoutCategory cat = new ProfitWorkoutCategory();
                        cat.setCategory(catRequest.category());
                        cat.setQty(catQty);
                        cat.setUnit(catRequest.unit());
                        cat.setRate(rate);
                        cat.setNotes(catRequest.notes());
                        item.addCategory(cat);
                        if (catQty.compareTo(BigDecimal.ZERO) > 0 || rate.compareTo(BigDecimal.ZERO) > 0
                                || (catRequest.category() != null
                                && "lead time".equalsIgnoreCase(catRequest.category().trim()))) {
                            itemHasContent = true;
                        }
                    }
                }
                if (itemHasContent) {
                    hasContent = true;
                }
                pw.addItem(item);
            }
        }
        if (!hasContent) {
            throw new BadRequestException("Add at least one cost item with a description or quantity/rate");
        }
    }

    private BigDecimal pct(BigDecimal value, String field) {
        BigDecimal v = value == null ? BigDecimal.ZERO : value;
        if (v.compareTo(BigDecimal.ZERO) < 0 || v.compareTo(BigDecimal.valueOf(100)) > 0) {
            throw new BadRequestException(field + " must be between 0 and 100");
        }
        return v.setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * Authoritative financial recalculation — the backend never trusts totals
     * supplied by the browser.
     *
     * Flat item model (item.costRate/sellingRate present):
     *   Cost Amount  = Cost Rate × Qty
     *   Selling Amt  = Selling Rate × Qty
     *   Profit/Unit  = Selling Rate − Cost Rate
     *   Profit Amt   = Profit/Unit × Qty
     *   Margin %     = Profit Amt ÷ Selling Amt × 100 (0 when Selling Amt = 0)
     *
     * Legacy category rows (no sellingRate — pre-flat-model data, Cost Workout
     * conversions): cost from Σ qty × rate (Lead Time excluded), profit via the
     * document profitPct formula, selling = cost + profit.
     *
     * Document totals are always DERIVED from the item-level values: total cost
     * = Σ item cost, total selling = Σ item selling, total profit = Σ item
     * profit, overall margin = total profit ÷ total selling × 100. Negative
     * profit is fully supported. The stored profitPct is overwritten with the
     * derived overall margin for flat records so a manually entered total can
     * never become the source of truth.
     */
    private void recalc(ProfitWorkout pw) {
        BigDecimal profitPct = pw.getProfitPct() == null ? BigDecimal.ZERO : pw.getProfitPct();
        BigDecimal subtotal = BigDecimal.ZERO;
        BigDecimal profitAmt = BigDecimal.ZERO;
        boolean hasItems = !pw.getItems().isEmpty();
        boolean allFlat = hasItems;
        for (ProfitWorkoutItem item : pw.getItems()) {
            BigDecimal qty = item.getQty() == null ? BigDecimal.ZERO : item.getQty();
            boolean flat = item.getSellingRate() != null;
            if (!flat) {
                allFlat = false;
            }
            BigDecimal cost;
            BigDecimal selling;
            BigDecimal profit;
            if (flat) {
                // Flat model — authoritative item rates. Cost and selling are
                // rounded to 2dp FIRST, then profit = selling − cost, so the
                // persisted profit amount always equals the displayed
                // (Selling Amount − Cost Amount) to the last paise.
                BigDecimal costRate = item.getCostRate() == null ? BigDecimal.ZERO : item.getCostRate();
                BigDecimal sellingRate = item.getSellingRate();
                cost = costRate.multiply(qty).setScale(2, RoundingMode.HALF_UP);
                selling = sellingRate.multiply(qty).setScale(2, RoundingMode.HALF_UP);
                profit = selling.subtract(cost);
                item.setProfitPerUnit(sellingRate.subtract(costRate).setScale(2, RoundingMode.HALF_UP));
                item.setMargin(percentOf(profit, selling));
                // Keep any carried-over legacy category rows amount-consistent
                // for round-trips, without letting them drive the totals.
                for (ProfitWorkoutCategory cat : item.getCategories()) {
                    cat.setAmount((cat.getQty() == null ? BigDecimal.ZERO : cat.getQty())
                            .multiply(cat.getRate() == null ? BigDecimal.ZERO : cat.getRate())
                            .setScale(2, RoundingMode.HALF_UP));
                }
            } else {
                // Legacy category rows: cost from qty × rate, profit via profitPct.
                BigDecimal itemTotal = BigDecimal.ZERO;
                for (ProfitWorkoutCategory cat : item.getCategories()) {
                    boolean leadTime = cat.getCategory() != null
                            && "lead time".equalsIgnoreCase(cat.getCategory().trim());
                    BigDecimal amount = leadTime
                            ? BigDecimal.ZERO
                            : (cat.getQty() == null ? BigDecimal.ZERO : cat.getQty())
                            .multiply(cat.getRate() == null ? BigDecimal.ZERO : cat.getRate());
                    cat.setAmount(amount);
                    if (!leadTime) {
                        itemTotal = itemTotal.add(amount);
                    }
                }
                cost = itemTotal;
                profit = cost.multiply(profitPct).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
                selling = cost.add(profit);
                item.setProfitPerUnit(qty.compareTo(BigDecimal.ZERO) > 0
                        ? profit.divide(qty, 2, RoundingMode.HALF_UP)
                        : BigDecimal.ZERO);
                item.setMargin(percentOf(profit, selling));
            }
            item.setCost(cost.setScale(2, RoundingMode.HALF_UP));
            item.setSelling(selling.setScale(2, RoundingMode.HALF_UP));
            item.setProfit(profit.setScale(2, RoundingMode.HALF_UP));
            subtotal = subtotal.add(cost);
            profitAmt = profitAmt.add(profit);
        }

        BigDecimal sellingPrice = subtotal.add(profitAmt);
        // Overall margin derived from the item-level profit values; for flat
        // records the stored profitPct is replaced with this derived value.
        if (allFlat) {
            pw.setProfitPct(percentOf(profitAmt, sellingPrice));
        }
        BigDecimal discountPct = pw.getDiscountPct() == null ? BigDecimal.ZERO : pw.getDiscountPct();
        BigDecimal gstPct = pw.getGstPct() == null ? BigDecimal.valueOf(18) : pw.getGstPct();
        BigDecimal charges = pw.getAdditionalCharges() == null ? BigDecimal.ZERO : pw.getAdditionalCharges();

        BigDecimal discountAmt = sellingPrice.multiply(discountPct).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        BigDecimal afterDiscount = sellingPrice.subtract(discountAmt);
        BigDecimal gstAmt = afterDiscount.multiply(gstPct).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        BigDecimal grandTotal = afterDiscount.add(charges).add(gstAmt);

        pw.setSubtotal(subtotal.setScale(2, RoundingMode.HALF_UP));
        pw.setProfitAmt(profitAmt);
        pw.setSellingPrice(sellingPrice);
        pw.setDiscountAmt(discountAmt);
        pw.setGstAmt(gstAmt);
        pw.setGrandTotal(grandTotal);
    }

    /** profit ÷ base × 100 rounded to 2dp; 0 when the base is 0. */
    private BigDecimal percentOf(BigDecimal profit, BigDecimal base) {
        if (base == null || base.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        return profit.multiply(BigDecimal.valueOf(100)).divide(base, 2, RoundingMode.HALF_UP);
    }

    /** Non-negative monetary amount (0 when null), 2dp. */
    private BigDecimal money(BigDecimal value, String field) {
        BigDecimal v = value == null ? BigDecimal.ZERO : value;
        if (v.compareTo(BigDecimal.ZERO) < 0) {
            throw new BadRequestException(field + " cannot be negative");
        }
        return v.setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * Predicate keeping only the CURRENT row of each revision chain. A row is
     * kept when it is flagged latestRevision OR no other row in the same chain
     * (chain key = revisionOf, or the row id for the base) carries a strictly
     * higher revision number. Legacy base rows without a revision chain always
     * survive this filter, so the main list never shows older revisions as
     * separate rows (they remain reachable via the revision-history dropdown).
     */
    private Predicate latestPerChainPredicate(jakarta.persistence.criteria.Root<ProfitWorkout> root, jakarta.persistence.criteria.CriteriaQuery<?> query, jakarta.persistence.criteria.CriteriaBuilder cb) {
        Subquery<Long> newer = query.subquery(Long.class);
        jakarta.persistence.criteria.Root<ProfitWorkout> newerRoot = newer.from(ProfitWorkout.class);
        newer.select(newerRoot.get("id"));
        newer.where(cb.and(
                cb.equal(newerRoot.get("revisionOf"),
                        cb.coalesce(root.get("revisionOf"), root.get("id"))),
                cb.greaterThan(cb.coalesce(newerRoot.get("revision"), 0),
                        cb.coalesce(root.get("revision"), 0))));
        return cb.or(cb.isTrue(root.get("latestRevision")), cb.not(cb.exists(newer)));
    }

    private Specification<ProfitWorkout> buildSpecification(String search, String status, String cprRef, String customer,
                                                          String company, String preparedBy, String dateFrom, String dateTo) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(latestPerChainPredicate(root, query, cb));
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("pwNo")), like),
                        cb.like(cb.lower(root.get("cprRef")), like),
                        cb.like(cb.lower(root.get("customerName")), like),
                        cb.like(cb.lower(root.get("company")), like),
                        cb.like(cb.lower(root.get("preparedBy")), like),
                        cb.like(cb.lower(root.get("linkedCpr")), like)
                ));
            }
            if (status != null && !status.isBlank()) {
                predicates.add(cb.equal(root.get("status"), parseStatus(status)));
            } else {
                predicates.add(cb.not(root.get("status").in(ProfitWorkoutStatus.ARCHIVED, ProfitWorkoutStatus.DELETED)));
            }
            if (cprRef != null && !cprRef.isBlank()) {
                predicates.add(cb.like(cb.lower(root.get("cprRef")), "%" + cprRef.trim().toLowerCase() + "%"));
            }
            if (customer != null && !customer.isBlank()) {
                predicates.add(cb.like(cb.lower(root.get("customerName")), "%" + customer.trim().toLowerCase() + "%"));
            }
            if (company != null && !company.isBlank()) {
                predicates.add(cb.like(cb.lower(root.get("company")), "%" + company.trim().toLowerCase() + "%"));
            }
            if (preparedBy != null && !preparedBy.isBlank()) {
                predicates.add(cb.like(cb.lower(root.get("preparedBy")), "%" + preparedBy.trim().toLowerCase() + "%"));
            }
            if (dateFrom != null && !dateFrom.isBlank()) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("pwDate"), LocalDate.parse(dateFrom).atStartOfDay()));
            }
            if (dateTo != null && !dateTo.isBlank()) {
                predicates.add(cb.lessThanOrEqualTo(root.get("pwDate"), LocalDate.parse(dateTo).atTime(23, 59, 59)));
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
            case "date", "pwDate" -> "pwDate";
            case "customer", "customerName" -> "customerName";
            case "company", "companyName" -> "company";
            case "pwNo", "cprRef", "preparedBy", "subtotal", "profitPct", "sellingPrice", "status",
                 "createdAt", "updatedAt", "grandTotal" -> field;
            default -> "createdAt";
        };
        boolean asc = parts.length > 1 && "asc".equalsIgnoreCase(parts[1]);
        return Sort.by(asc ? Sort.Direction.ASC : Sort.Direction.DESC, mapped);
    }

    private long nextSequence() {
        String prefix = "PW-" + Year.now().getValue() + "-";
        // Only the pw_no column is read (scalar projection). The row count stays
        // a COUNT so numbering never reuses a suffix whose record was deleted.
        long count = profitWorkoutRepository.count();
        long maxSuffix = 0;
        for (String pwNo : profitWorkoutRepository.findPwNosWithPrefix(prefix)) {
            if (pwNo == null || !pwNo.startsWith(prefix)) {
                continue;
            }
            try {
                maxSuffix = Math.max(maxSuffix, Long.parseLong(pwNo.substring(prefix.length())));
            } catch (NumberFormatException ignored) {
                // skip malformed numbers
            }
        }
        return Math.max(count, maxSuffix) + 1;
    }

    private String buildPwNo(long sequence) {
        return String.format("PW-%d-%06d", Year.now().getValue(), sequence);
    }

    private String serializeAttachments(List<ProfitWorkoutAttachment> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return null;
        }
        try {
            return PW_JSON.writeValueAsString(attachments);
        } catch (Exception e) {
            return null;
        }
    }

    private List<ProfitWorkoutAttachment> parseAttachments(String json) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            List<ProfitWorkoutAttachment> list = PW_JSON.readValue(json, new TypeReference<List<ProfitWorkoutAttachment>>() {
            });
            return list == null ? new ArrayList<>() : list;
        } catch (Exception e) {
            return new ArrayList<>();
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

    private ProfitWorkoutStatus parseStatus(String value) {
        String normalized = value.trim().toUpperCase().replace(" ", "_").replace("-", "_");
        if ("PENDING".equals(normalized) || "UNDER_REVIEW".equals(normalized) || "SUBMITTED".equals(normalized)) {
            return ProfitWorkoutStatus.SUBMITTED;
        }
        try {
            return ProfitWorkoutStatus.valueOf(normalized);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid status: " + value);
        }
    }

    private String statusKey(ProfitWorkoutStatus status) {
        if (status == null) {
            return "draft";
        }
        return switch (status) {
            case COMPLETED -> "completed";
            case SUBMITTED -> "submitted";
            case APPROVED -> "approved";
            case REJECTED -> "rejected";
            case ARCHIVED -> "archived";
            case DELETED -> "deleted";
            default -> "draft";
        };
    }

    private String label(Enum<?> value) {
        if (value == null) {
            return null;
        }
        return value.name().substring(0, 1) + value.name().substring(1).toLowerCase().replace("_", " ");
    }

    private List<String> readMasterList(String key) {
        var opt = masterDataRepository.findByDataKey(key);
        if (opt.isEmpty()) {
            return new ArrayList<>();
        }
        String value = opt.get().getValue();
        return (value == null || value.isBlank()) ? new ArrayList<>() : parseJsonList(value);
    }

    private void writeMasterList(String key, List<String> values) {
        List<String> clean = values == null ? List.of() : values.stream()
                .filter(v -> v != null && !v.isBlank())
                .map(String::trim)
                .distinct()
                .toList();
        CwMasterData data = masterDataRepository.findByDataKey(key).orElseGet(() -> {
            CwMasterData d = new CwMasterData();
            d.setDataKey(key);
            return d;
        });
        data.setValue(toJsonArray(clean));
        masterDataRepository.save(data);
    }

    private List<String> parseJsonList(String json) {
        List<String> result = new ArrayList<>();
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            if (mapper.readTree(json).isArray()) {
                mapper.readTree(json).forEach(node -> result.add(node.asText()));
            }
        } catch (Exception ignored) {
            // fall back to empty list
        }
        return result;
    }

    private String toJsonArray(List<String> values) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append('"').append(values.get(i).replace("\"", "\\\"")).append('"');
        }
        sb.append(']');
        return sb.toString();
    }

    private String currentUserName() {
        return auditContext.currentUserName();
    }

    /**
     * Quotation number that a Profit Workout was converted into, or null. A
     * TRASHED (status "deleted") quotation does not count: the Profit Workout is
     * convertible again and its list action goes back to Convert to Quotation —
     * the same non-deleted rule the Cost Workout → Quotation link follows.
     */
    private String convertedQtnFor(String pwNo) {
        if (pwNo == null || pwNo.isBlank()) {
            return null;
        }
        return quotationRepository.findLiveByReference(QUOTATION_REF_PREFIX + pwNo)
                .stream()
                .map(Quotation::getQuotationNo)
                .findFirst()
                .orElse(null);
    }

    /** pwNo → quotationNo for every Profit Workout that has a generated quotation. */
    private Map<String, String> convertedQuotationMap() {
        Map<String, String> map = new HashMap<>();
        for (Quotation q : quotationRepository.findByReferenceStartingWith(QUOTATION_REF_PREFIX)) {
            String reference = q.getReference();
            if (reference != null && reference.startsWith(QUOTATION_REF_PREFIX)
                    && reference.length() > QUOTATION_REF_PREFIX.length()
                    && !"deleted".equalsIgnoreCase(q.getStatus())) {
                map.put(reference.substring(QUOTATION_REF_PREFIX.length()), q.getQuotationNo());
            }
        }
        return map;
    }
}
