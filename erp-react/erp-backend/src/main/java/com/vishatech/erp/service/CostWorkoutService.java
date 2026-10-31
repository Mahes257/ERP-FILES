package com.vishatech.erp.service;
import com.vishatech.erp.dto.ConversionResult;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.dto.CostWorkoutAttachment;
import com.vishatech.erp.dto.CostWorkoutCategoryRequest;
import com.vishatech.erp.dto.CostWorkoutCategoryResponse;
import com.vishatech.erp.dto.CostWorkoutItemRequest;
import com.vishatech.erp.dto.CostWorkoutItemResponse;
import com.vishatech.erp.dto.CostWorkoutNextNumberResponse;
import com.vishatech.erp.dto.CostWorkoutRequest;
import com.vishatech.erp.dto.CostWorkoutResponse;
import com.vishatech.erp.dto.CostWorkoutTimelineResponse;
import com.vishatech.erp.dto.ProfitWorkoutResponse;
import com.vishatech.erp.dto.QuotationResponse;
import com.vishatech.erp.dto.RevisionInfo;
import com.vishatech.erp.entity.CostWorkout;
import com.vishatech.erp.entity.CostWorkoutCategory;
import com.vishatech.erp.entity.CostWorkoutItem;
import com.vishatech.erp.entity.CostWorkoutStatus;
import com.vishatech.erp.entity.CostWorkoutTimeline;
import com.vishatech.erp.entity.Cpr;
import com.vishatech.erp.entity.CprStatus;
import com.vishatech.erp.entity.CprTimeline;
import com.vishatech.erp.entity.CwMasterData;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.DuplicateResourceException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.CostWorkoutRepository;
import com.vishatech.erp.repository.CprRepository;
import com.vishatech.erp.repository.CwMasterDataRepository;
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
public class CostWorkoutService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final int MAX_REMARKS = 100000;
    private static final ObjectMapper CW_JSON = new ObjectMapper();    private final CostWorkoutRepository costWorkoutRepository;
    private final CwMasterDataRepository masterDataRepository;
    private final CprRepository cprRepository;
    private final AuditContext auditContext;
    private final QuotationService quotationService;
    private final ProfitWorkoutService profitWorkoutService;
    private final DocumentRepositoryService documentRepositoryService;

    public CostWorkoutService(CostWorkoutRepository costWorkoutRepository,
                              CwMasterDataRepository masterDataRepository,
                              CprRepository cprRepository,
                              AuditContext auditContext,
                              QuotationService quotationService,
                              ProfitWorkoutService profitWorkoutService,
                              DocumentRepositoryService documentRepositoryService) {
        this.costWorkoutRepository = costWorkoutRepository;
        this.masterDataRepository = masterDataRepository;
        this.cprRepository = cprRepository;
        this.auditContext = auditContext;
        this.quotationService = quotationService;
        this.profitWorkoutService = profitWorkoutService;
        this.documentRepositoryService = documentRepositoryService;
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
    private void syncCwDocument(String module, Long recordId, String code, String docType,
                        String docNo, Long customerId, String customerName, String status) {
        // Intentionally no-op — see note above.
    }

    private void purgeCwDocument(Long recordId) {
        // Intentionally no-op — see note above.
    }

    // ============================== Read ==============================

    @Transactional(readOnly = true)
    public Page<CostWorkoutResponse> list(int page, int size, String search, String sort, String status,
                                          String cprRef, String customer, String company, String preparedBy,
                                          String dateFrom, String dateTo) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort));
        Specification<CostWorkout> spec = buildSpecification(search, status, cprRef, customer, company,
                preparedBy, dateFrom, dateTo);
        return costWorkoutRepository.findAll(spec, pageable).map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public CostWorkoutResponse get(Long id) {
        return toResponseDetail(getCw(id));
    }

    @Transactional(readOnly = true)
    public List<CostWorkoutItemResponse> getItems(Long id) {
        return getCw(id).getItems().stream().map(this::itemResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<CostWorkoutTimelineResponse> getTimeline(Long id) {
        return getCw(id).getTimeline().stream().map(this::timelineResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<CostWorkoutAttachment> getAttachments(Long id) {
        return parseAttachments(getCw(id).getAttachmentsJson());
    }

    @Transactional(readOnly = true)
    public CostWorkoutNextNumberResponse getNextNumber() {
        long next = nextSequence();
        return new CostWorkoutNextNumberResponse(buildCwNo(next), next);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> stats() {
        // Count only the CURRENT revision of each chain so KPI cards match
        // the list rows (older revisions are surfaced through the Document
        // Workflow dropdown, never as separate list rows).
        long draft = costWorkoutRepository.countCurrentByStatus(CostWorkoutStatus.DRAFT);
        long completed = costWorkoutRepository.countCurrentByStatus(CostWorkoutStatus.COMPLETED);
        long submitted = costWorkoutRepository.countCurrentByStatus(CostWorkoutStatus.SUBMITTED);
        long approved = costWorkoutRepository.countCurrentByStatus(CostWorkoutStatus.APPROVED);
        long rejected = costWorkoutRepository.countCurrentByStatus(CostWorkoutStatus.REJECTED);
        long archived = costWorkoutRepository.countCurrentByStatus(CostWorkoutStatus.ARCHIVED);
        long deleted = costWorkoutRepository.countCurrentByStatus(CostWorkoutStatus.DELETED);
        long active = draft + completed + submitted + approved + rejected;
        BigDecimal totalValue = costWorkoutRepository.sumGrandTotalExcluding(
                List.of(CostWorkoutStatus.ARCHIVED, CostWorkoutStatus.DELETED));

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

    public CostWorkoutResponse create(CostWorkoutRequest request, boolean draft) {
        CostWorkout cw = new CostWorkout();
        if (request.cwNo() != null && !request.cwNo().isBlank()) {
            String cwNo = request.cwNo().trim();
            if (costWorkoutRepository.existsByCwNo(cwNo)) {
                throw new DuplicateResourceException("Cost Workout number already exists: " + cwNo);
            }
            cw.setCwNo(cwNo);
        } else {
            cw.setCwNo(buildCwNo(nextSequence()));
        }
        // Records born from an autosave / Save-Draft are flagged as not yet
        // committed: the first explicit save commits them in place with NO
        // revision (see update()).
        cw.setDraftOnly(draft);
        applyRequest(cw, request);
        if (draft) {
            cw.setStatus(CostWorkoutStatus.DRAFT);
        } else if (request.status() != null && !request.status().isBlank()) {
            CostWorkoutStatus parsed = parseStatus(request.status());
            cw.setStatus(parsed == CostWorkoutStatus.COMPLETED ? CostWorkoutStatus.COMPLETED : CostWorkoutStatus.DRAFT);
        } else {
            cw.setStatus(CostWorkoutStatus.DRAFT);
        }
        recalc(cw);
        if (!draft) {
            cw.addTimeline(entry("created", "Cost Workout created",
                    "Cost Workout '" + cw.getCwNo() + "' was created by " + currentUserName() + "."));
        }
        CostWorkout saved = costWorkoutRepository.save(cw);
        linkCpr(saved, "created", false);
        syncCwDocument(
                "Cost Workout", saved.getId(), saved.getCwNo(), "Cost Workout", saved.getCwNo(),
                null, saved.getCustomerName(), saved.getStatus().name());
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
    public CostWorkoutResponse update(Long id, CostWorkoutRequest request) {
        return update(id, request, false);
    }

    public CostWorkoutResponse update(Long id, CostWorkoutRequest request, boolean draft) {
        CostWorkout current = getCw(id);
        if (!current.isLatestRevision()) {
            throw new BadRequestException("Only the latest revision can be edited");
        }
        if (current.getStatus() == CostWorkoutStatus.DELETED) {
            throw new BadRequestException("Cannot edit a deleted Cost Workout");
        }

        // ---- Draft / autosave: in-place update, invisible to the revision chain ----
        if (draft) {
            applyRequest(current, request);
            applyRequestedFormStatus(current, request.status());
            recalc(current);
            CostWorkout saved = costWorkoutRepository.save(current);
            syncCwDocument(
                    "Cost Workout", saved.getId(), saved.getCwNo(), "Cost Workout", saved.getCwNo(),
                    null, saved.getCustomerName(), saved.getStatus().name());
            return toResponseDetail(saved);
        }

        // ---- First explicit save of a draft-born record: CREATE moment ----
        if (current.getRevision() == 0 && current.isDraftOnly()) {
            current.setDraftOnly(false);
            applyRequest(current, request);
            applyRequestedFormStatus(current, request.status());
            recalc(current);
            current.addTimeline(entry("created", "Cost Workout created",
                    "Cost Workout '" + current.getCwNo() + "' was created by " + currentUserName() + "."));
            CostWorkout saved = costWorkoutRepository.save(current);
            linkCpr(saved, "created", false);
            syncCwDocument(
                    "Cost Workout", saved.getId(), saved.getCwNo(), "Cost Workout", saved.getCwNo(),
                    null, saved.getCustomerName(), saved.getStatus().name());
            return toResponseDetail(saved);
        }

        Long baseId = current.getRevisionOf() != null ? current.getRevisionOf() : current.getId();
        int nextRev = maxRevisionOfChain(baseId) + 1;

        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(current);

        CostWorkout revision = new CostWorkout();
        copyForRevision(revision, current);
        applyRequest(revision, request);
        applyRequestedFormStatus(revision, request.status());
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

        revision.setCwNo(RevisionSupport.nextRevisionNumber(
                RevisionSupport.baseNumber(current.getCwNo()), nextRev));
        revision.setRevisionOf(baseId);
        revision.setRevision(nextRev);
        revision.setRevisionDate(java.time.LocalDateTime.now());
        revision.setLatestRevision(true);

        revision.addTimeline(entry("updated", "Cost Workout updated",
                "Cost Workout details were updated by " + currentUserName() + "."));

        current.setLatestRevision(false);
        costWorkoutRepository.save(current);
        CostWorkout saved = costWorkoutRepository.saveAndFlush(revision);
        editHistory.recordEdit("cost-workout", saved.getId(), editBefore, editHistory.snapshot(saved));
        linkCpr(saved, "updated", false);
        syncCwDocument(
                "Cost Workout", saved.getId(), saved.getCwNo(), "Cost Workout", saved.getCwNo(),
                null, saved.getCustomerName(), saved.getStatus().name());
        return toResponseDetail(saved);
    }

    public CostWorkoutResponse delete(Long id) {
        CostWorkout cw = getCw(id);
        RevisionSupport.requireLatest(cw.isLatestRevision());
        CostWorkoutStatus previous = cw.getStatus();
        cw.setStatus(CostWorkoutStatus.DELETED);
        cw.setArchivedAt(LocalDateTime.now());
        cw.addTimeline(entry("deleted", "Cost Workout deleted",
                "Cost Workout was moved to trash by " + currentUserName() + "."));
        CostWorkout saved = costWorkoutRepository.save(cw);
        linkCpr(saved, "deleted", false);
        syncCwDocument(
                "Cost Workout", saved.getId(), saved.getCwNo(), "Cost Workout", saved.getCwNo(),
                null, saved.getCustomerName(), saved.getStatus().name());
        return toResponse(saved);
    }

    public void permanentDelete(Long id) {
        CostWorkout cw = getCw(id);
        linkCpr(cw, "permanently deleted", true);
        purgeCwDocument(id);
        costWorkoutRepository.delete(cw);
    }

    public CostWorkoutResponse restore(Long id) {
        CostWorkout cw = getCw(id);
        RevisionSupport.requireLatest(cw.isLatestRevision());
        CostWorkoutStatus previous = cw.getStatus();
        CostWorkoutStatus target = (previous == CostWorkoutStatus.DELETED || previous == CostWorkoutStatus.ARCHIVED)
                ? CostWorkoutStatus.DRAFT : previous;
        cw.setStatus(target);
        cw.setArchivedAt(null);
        cw.addTimeline(entry("restored", "Cost Workout restored",
                "Cost Workout was restored by " + currentUserName() + "."));
        CostWorkout saved = costWorkoutRepository.save(cw);
        linkCpr(saved, "restored", false);
        syncCwDocument(
                "Cost Workout", saved.getId(), saved.getCwNo(), "Cost Workout", saved.getCwNo(),
                null, saved.getCustomerName(), saved.getStatus().name());
        return toResponse(saved);
    }

    public CostWorkoutResponse archive(Long id) {
        CostWorkout cw = getCw(id);
        RevisionSupport.requireLatest(cw.isLatestRevision());
        CostWorkoutStatus previous = cw.getStatus();
        cw.setStatus(CostWorkoutStatus.ARCHIVED);
        cw.setArchivedAt(LocalDateTime.now());
        cw.addTimeline(entry("archived", "Cost Workout archived",
                "Cost Workout was archived by " + currentUserName() + "."));
        CostWorkout saved = costWorkoutRepository.save(cw);
        linkCpr(saved, "archived", false);
        syncCwDocument(
                "Cost Workout", saved.getId(), saved.getCwNo(), "Cost Workout", saved.getCwNo(),
                null, saved.getCustomerName(), saved.getStatus().name());
        return toResponse(saved);
    }

    public CostWorkoutResponse submit(Long id) {
        CostWorkout cw = getCw(id);
        RevisionSupport.requireLatest(cw.isLatestRevision());
        CostWorkoutStatus previous = cw.getStatus();
        if (previous == CostWorkoutStatus.SUBMITTED || previous == CostWorkoutStatus.APPROVED
                || previous == CostWorkoutStatus.ARCHIVED || previous == CostWorkoutStatus.DELETED) {
            throw new BadRequestException("Cost Workout cannot be submitted from status '" + label(previous) + "'");
        }
        cw.setStatus(CostWorkoutStatus.SUBMITTED);
        cw.addTimeline(entry("submitted", "Submitted for approval",
                "Cost Workout submitted for approval by " + currentUserName() + "."));
        CostWorkout saved = costWorkoutRepository.save(cw);
        linkCpr(saved, "submitted", false);
        return toResponse(saved);
    }

    public CostWorkoutResponse approve(Long id, String remarks) {
        CostWorkout cw = getCw(id);
        RevisionSupport.requireLatest(cw.isLatestRevision());
        if (cw.getStatus() != CostWorkoutStatus.SUBMITTED) {
            throw new BadRequestException("Only submitted Cost Workouts can be approved (current: "
                    + label(cw.getStatus()) + ")");
        }
        cw.setStatus(CostWorkoutStatus.APPROVED);
        cw.setApprovedBy(currentUserName());
        cw.setRejectionReason(null);
        cw.addTimeline(entry("approved", "Cost Workout approved",
                "Cost Workout approved by " + currentUserName()
                        + (remarks != null && !remarks.isBlank() ? " - " + remarks : "") + "."));
        CostWorkout saved = costWorkoutRepository.save(cw);
        linkCpr(saved, "approved", false);
        // Approval only moves the Cost Workout to APPROVED. It never generates a
        // Profit Workout: the Profit Workout is created exclusively by the
        // explicit Cost Workout → Profit Workout conversion
        // (POST /cost-workouts/{id}/convert-to-profit-workout).
        return toResponse(saved);
    }

    /**
     * Cost Workout → Quotation conversion (legacy explicit endpoint).
     *
     * <p>One CW → one quotation: the source row is locked FOR UPDATE — the same
     * lock the quotation form's save takes — so this endpoint and a concurrent
     * prefilled-form save for the same Cost Workout are serialised. The loser
     * sees the committed conversion and is rejected with 409 instead of creating
     * a second quotation.
     */
    public ConversionResult convertToQuotation(Long id) {
        CostWorkout cw = costWorkoutRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ResourceNotFoundException("Cost Workout not found with id: " + id));
        if (cw.getStatus() != CostWorkoutStatus.APPROVED) {
            throw new BadRequestException("Only approved Cost Workouts can be converted to a quotation (current: "
                    + label(cw.getStatus()) + ")");
        }
        if (cw.getConvertedToQtn() != null && !cw.getConvertedToQtn().isBlank()) {
            throw new DuplicateResourceException("Quotation " + cw.getConvertedToQtn()
                    + " already exists for Cost Workout " + cw.getCwNo());
        }
        // The back-link alone is not enough: a quotation saved from the prefilled
        // form before the link existed still carries this Cost Workout.
        quotationService.assertNoQuotationForCostWorkout(cw);
        QuotationResponse quotation = quotationService.createFromCostWorkout(cw);
        cw.setConvertedToQtn(quotation.quotationNo());
        cw.addTimeline(entry("converted", "Converted to quotation",
                "Cost Workout converted to quotation " + quotation.quotationNo() + "."));
        CostWorkout saved = costWorkoutRepository.save(cw);
        return new ConversionResult("quotation", quotation.id(), quotation.quotationNo(), "Quotation " + quotation.quotationNo() + " created from Cost Workout " + cw.getCwNo());
    }

    /**
     * Cost Workout → Profit Workout conversion (explicit, user-triggered,
     * idempotent).
     *
     * <p>The conversion does NOT depend on the Cost Workout status: a Cost Workout
     * is convertible whatever its current state (DRAFT, COMPLETED, SUBMITTED,
     * APPROVED, REJECTED, ARCHIVED, DELETED). The Profit Workout is generated from
     * the record as it stands; the source CW is left untouched apart from the
     * conversion back-link.
     *
     * <p>One CW → one PW: when a Profit Workout already exists for this Cost
     * Workout, the existing relationship is returned instead of creating a
     * duplicate. The Profit Workout is fully persisted through the existing
     * profit-workouts API architecture and keeps the source CW reference.
     */
    public ConversionResult convertToProfitWorkout(Long id) {
        // Locked read: the same row lock the Profit Workout creation form takes,
        // so the legacy conversion endpoint and a concurrent prefill save can
        // never both create a Profit Workout for the same Cost Workout.
        CostWorkout cw = costWorkoutRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ResourceNotFoundException("Cost Workout not found with id: " + id));
        if (cw.getConvertedToPw() != null && !cw.getConvertedToPw().isBlank()) {
            return new ConversionResult("profit-workout", cw.getConvertedToPwId(), cw.getConvertedToPw(),
                    "Profit Workout " + cw.getConvertedToPw() + " already exists for Cost Workout " + cw.getCwNo());
        }
        ProfitWorkoutResponse profitWorkout = profitWorkoutService.createFromCostWorkout(cw);
        cw.setConvertedToPw(profitWorkout.pwNo());
        cw.setConvertedToPwId(profitWorkout.id());
        cw.addTimeline(entry("converted", "Converted to profit workout",
                "Cost Workout converted to Profit Workout " + profitWorkout.pwNo() + "."));
        CostWorkout saved = costWorkoutRepository.save(cw);
        return new ConversionResult("profit-workout", profitWorkout.id(), profitWorkout.pwNo(),
                "Profit Workout " + profitWorkout.pwNo() + " created from Cost Workout " + cw.getCwNo());
    }

    public CostWorkoutResponse reject(Long id, String remarks) {
        CostWorkout cw = getCw(id);
        RevisionSupport.requireLatest(cw.isLatestRevision());
        if (cw.getStatus() != CostWorkoutStatus.SUBMITTED) {
            throw new BadRequestException("Only submitted Cost Workouts can be rejected (current: "
                    + label(cw.getStatus()) + ")");
        }
        cw.setStatus(CostWorkoutStatus.REJECTED);
        cw.setApprovedBy(null);
        cw.setRejectionReason(remarks);
        cw.addTimeline(entry("rejected", "Cost Workout rejected",
                "Cost Workout rejected by " + currentUserName()
                        + (remarks != null && !remarks.isBlank() ? " - " + remarks : "") + "."));
        CostWorkout saved = costWorkoutRepository.save(cw);
        linkCpr(saved, "rejected", false);
        return toResponse(saved);
    }

    public CostWorkoutResponse duplicate(Long id) {
        CostWorkout source = getCw(id);
        CostWorkout copy = new CostWorkout();
        copy.setCwNo(buildCwNo(nextSequence()));
        copy.setCwDate(LocalDateTime.now());
        copy.setStatus(CostWorkoutStatus.DRAFT);
        copy.setPreparedBy(source.getPreparedBy());
        copy.setContactPerson(source.getContactPerson());
        copy.setDepartment(source.getDepartment());
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
        for (CostWorkoutItem sourceItem : source.getItems()) {
            CostWorkoutItem item = new CostWorkoutItem();
            item.setDescription(sourceItem.getDescription());
            item.setCprDescription(sourceItem.getCprDescription());
            item.setQty(sourceItem.getQty());
            item.setUnit(sourceItem.getUnit());
            // A duplicate is a new record, but its items keep their own files.
            item.setAttachmentsJson(sourceItem.getAttachmentsJson());
            for (CostWorkoutCategory sourceCat : sourceItem.getCategories()) {
                CostWorkoutCategory cat = new CostWorkoutCategory();
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
        copy.addTimeline(entry("created", "Cost Workout created",
                "Duplicated from Cost Workout '" + source.getCwNo() + "'."));
        CostWorkout saved = costWorkoutRepository.save(copy);
        linkCpr(saved, "created", false);
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

    private void copyForRevision(CostWorkout copy, CostWorkout source) {
        org.springframework.beans.BeanUtils.copyProperties(source, copy,
                "id", "items", "timeline", "timeline", "revisionOf", "revision", "revisionDate", "latestRevision", "createdAt", "updatedAt", "archivedAt");
        for (CostWorkoutItem sourceItem : source.getItems()) {
            CostWorkoutItem item = new CostWorkoutItem();
            org.springframework.beans.BeanUtils.copyProperties(sourceItem, item,
                    "id", "costWorkout", "createdAt");
            copy.addItem(item);
        }
    }

    private int maxRevisionOfChain(Long baseId) {
        return costWorkoutRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .mapToInt(CostWorkout::getRevision)
                .max()
                .orElse(0);
    }

    /** Detail response — also carries the full revision chain for the UI. */
    private CostWorkoutResponse toResponseDetail(CostWorkout cw) {
        return toResponse(cw, revisionChain(cw));
    }

    private List<RevisionInfo> revisionChain(CostWorkout cw) {
        Long baseId = cw.getRevisionOf() != null ? cw.getRevisionOf() : cw.getId();
        List<RevisionInfo> chain = new ArrayList<>();
        costWorkoutRepository.findById(baseId).ifPresent(q -> chain.add(revisionInfo(q)));
        costWorkoutRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .sorted(java.util.Comparator.comparingInt(CostWorkout::getRevision))
                .forEach(q -> chain.add(revisionInfo(q)));
        return chain;
    }

    private RevisionInfo revisionInfo(CostWorkout cw) {
        return new RevisionInfo(
                cw.getId(),
                cw.getCwNo(),
                cw.getRevision(),
                statusKey(cw.getStatus()),
                cw.getRevisionDate() == null
                        ? (cw.getCreatedAt() == null ? null : cw.getCreatedAt().toString())
                        : cw.getRevisionDate().toString(),
                cw.isLatestRevision());
    }

    /** When the latest revision is deleted, the previous one becomes latest. */
    private void promotePreviousRevision(CostWorkout removed) {
        if (!removed.isLatestRevision()) {
            return;
        }
        Long baseId = removed.getRevisionOf() != null ? removed.getRevisionOf() : removed.getId();
        // Highest remaining revision row first (revision >= 1).
        costWorkoutRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .filter(q -> !q.getId().equals(removed.getId()))
                .filter(q -> !"deleted".equals(q.getStatus()))
                .findFirst()
                .ifPresentOrElse(q -> {
                    q.setLatestRevision(true);
                    costWorkoutRepository.save(q);
                    removed.setLatestRevision(false);
                    costWorkoutRepository.save(removed);
                }, () -> costWorkoutRepository.findById(baseId).ifPresent(q -> {
                    // Fall back to the base row (revision 0) when no revision rows remain.
                    if (!q.getId().equals(removed.getId()) && !"deleted".equals(q.getStatus())) {
                        q.setLatestRevision(true);
                        costWorkoutRepository.save(q);
                        removed.setLatestRevision(false);
                        costWorkoutRepository.save(removed);
                    }
                }));
    }

    /** List/export response - carries no revision chain (avoids N+1). */
    private CostWorkoutResponse toResponse(CostWorkout entity) {
        return toResponse(entity, List.of());
    }

    private CostWorkoutResponse toResponse(CostWorkout cw, List<RevisionInfo> revisions) {
        return new CostWorkoutResponse(
                cw.getId(),
                cw.getCwNo(),
                cw.getCwDate() == null ? null : cw.getCwDate().toLocalDate().toString(),
                statusKey(cw.getStatus()),
                cw.getPreparedBy(),
                cw.getContactPerson(),
                cw.getDepartment(),
                cw.getSourceLead(),
                cw.getCustomerName(),
                cw.getCprRef(),
                cw.getCprId(),
                cw.getPhone(),
                cw.getEmail(),
                cw.getCompany(),
                cw.getGst(),
                cw.getPan(),
                cw.getLinkedCpr(),
                cw.getBillingAddress(),
                cw.getShippingAddress(),
                cw.getRemarks(),
                cw.getProfitPct(),
                cw.getProfitAmt(),
                cw.getSellingPrice(),
                cw.getDiscountPct(),
                cw.getDiscountAmt(),
                cw.getGstPct(),
                cw.getGstAmt(),
                cw.getSubtotal(),
                cw.getGrandTotal(),
                cw.getApprovedBy(),
                cw.getRejectionReason(),
                cw.getCwDate() == null
                        ? (cw.getCreatedAt() == null ? null : cw.getCreatedAt().toLocalDate().toString())
                        : cw.getCwDate().toLocalDate().toString(),
                cw.getCreatedAt() == null ? null : cw.getCreatedAt().toString(),
                cw.getUpdatedAt() == null ? null : cw.getUpdatedAt().toString(),
                cw.getArchivedAt() == null ? null : cw.getArchivedAt().toString(),
                cw.getConvertedToQtn(),
                cw.getItems().stream().map(this::itemResponse).toList(),
                cw.getTimeline().stream().map(this::timelineResponse).toList(),
                cw.getRevision(),
                cw.getRevisionOf(),
                cw.isLatestRevision(),
                cw.getRevisionDate() == null ? null : cw.getRevisionDate().toString(),
                revisions,
                cw.getConvertedToPw(),
                cw.getConvertedToPwId(),
                cw.getItemColumnsJson()
        );
    }

    private CostWorkoutItemResponse itemResponse(CostWorkoutItem item) {
        return new CostWorkoutItemResponse(item.getId(), item.getDescription(), item.getCprDescription(),
                item.getQty(), item.getUnit(),
                item.getCategories().stream().map(this::categoryResponse).toList(),
                parseCustomFields(item.getCustomFieldsJson()),
                parseAttachments(item.getAttachmentsJson()));
    }

    private CostWorkoutCategoryResponse categoryResponse(CostWorkoutCategory cat) {
        return new CostWorkoutCategoryResponse(cat.getId(), cat.getCategory(), cat.getQty(), cat.getUnit(),
                cat.getRate(), cat.getAmount(), cat.getNotes());
    }

    private CostWorkoutTimelineResponse timelineResponse(CostWorkoutTimeline entry) {
        return new CostWorkoutTimelineResponse(entry.getId(), entry.getType(), entry.getTitle(), entry.getDetail(),
                entry.getCreatedAt() == null ? null : entry.getCreatedAt().toString());
    }

    private CostWorkoutTimeline entry(String type, String title, String detail) {
        CostWorkoutTimeline entry = new CostWorkoutTimeline();
        entry.setType(type);
        entry.setTitle(title);
        entry.setDetail(detail);
        return entry;
    }

    // ============================== Helpers ==============================

    private CostWorkout getCw(Long id) {
        return costWorkoutRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Cost Workout not found with id: " + id));
    }

    /**
     * Back-link: whenever the Cost Workout changes, sync the linked CPR so it
     * carries the CW id / number / status, the cost-workout amount, and stays in
     * the 'cost workout' stage (unless already further along the workflow).
     * The CPR is resolved by the FK-style cprId column first, then by the legacy
     * cprRef / linkedCpr strings for records created before the FK existed.
     */
    private void linkCpr(CostWorkout cw, String action, boolean clear) {
        Cpr cpr = null;
        if (cw.getCprId() != null) {
            cpr = cprRepository.findById(cw.getCprId()).orElse(null);
        }
        if (cpr == null && cw.getCprRef() != null && !cw.getCprRef().isBlank()) {
            cpr = cprRepository.findByPrNo(cw.getCprRef().trim()).orElse(null);
        }
        if (cpr == null && cw.getLinkedCpr() != null && !cw.getLinkedCpr().isBlank()) {
            cpr = cprRepository.findByPrNo(cw.getLinkedCpr().trim()).orElse(null);
        }
        if (cpr == null) {
            return;
        }
        if (clear) {
            cpr.setCostWorkoutId(null);
            cpr.setCostWorkoutCwNo(null);
            cpr.setCostWorkoutStatus(null);
            cpr.addTimeline(cprTimeline("costworkout", "Cost Workout link removed",
                    "Cost Workout link removed by " + currentUserName() + "."));
        } else {
            cpr.setCostWorkoutId(cw.getId());
            cpr.setCostWorkoutCwNo(cw.getCwNo());
            cpr.setCostWorkoutStatus(statusKey(cw.getStatus()));
            cpr.setCostWorkout(cw.getSubtotal());
            CprStatus previousStatus = cpr.getStatus();
            if (cpr.getStatus() == CprStatus.DRAFT || cpr.getStatus() == CprStatus.COST_WORKOUT) {
                cpr.setStatus(CprStatus.COST_WORKOUT);
                cpr.setCurrentStage("Cost Workout");
            }
            cpr.addTimeline(cprFieldTimeline("costworkout", "Cost Workout " + action,
                    "Cost Workout " + cw.getCwNo() + " " + action + " by " + currentUserName() + ".",
                    "Cost Workout", label(previousStatus), label(cpr.getStatus())));
        }
        cprRepository.save(cpr);
    }

    private CprTimeline cprFieldTimeline(String type, String title, String detail,
                                         String field, String oldValue, String newValue) {
        CprTimeline entry = cprTimeline(type, title, detail);
        entry.setField(field);
        entry.setOldValue(oldValue);
        entry.setNewValue(newValue);
        return entry;
    }

    private CprTimeline cprTimeline(String type, String title, String detail) {
        CprTimeline entry = new CprTimeline();
        entry.setType(type);
        entry.setTitle(title);
        entry.setDetail(detail);
        entry.setUserId(auditContext.currentUserId());
        entry.setUserName(auditContext.currentUserName());
        entry.setUserRole(auditContext.currentUserRole());
        entry.setIpAddress(auditContext.ipAddress());
        String device = auditContext.deviceInfo();
        entry.setDeviceInfo(device != null && device.length() > 500 ? device.substring(0, 500) : device);
        return entry;
    }

    /**
     * Applies the FORM-LEVEL status a save request carries ("draft" /
     * "completed") to a record being saved.
     *
     * <p><b>SUBMITTED / APPROVED belong to the approval workflow</b>: only
     * {@link #submit}, {@link #approve} and {@link #reject} may change them. The
     * edit form always sends the form-level status (it only offers Draft /
     * Completed; the 30 s autosave always sends "draft"), so applying that value
     * blindly silently un-submitted an approval-queue record — the Cost Workout
     * then disappeared from the approval queue and could no longer be approved or
     * rejected. A record in those states keeps its workflow status here.
     */
    private void applyRequestedFormStatus(CostWorkout cw, String requestedStatus) {
        if (isApprovalWorkflowStatus(cw.getStatus())) {
            return;
        }
        if (requestedStatus == null || requestedStatus.isBlank()) {
            return;
        }
        CostWorkoutStatus parsed = parseStatus(requestedStatus);
        if (parsed == CostWorkoutStatus.COMPLETED || parsed == CostWorkoutStatus.DRAFT) {
            cw.setStatus(parsed);
        }
    }

    /** Statuses whose transitions are owned by the approval endpoints. */
    private static boolean isApprovalWorkflowStatus(CostWorkoutStatus status) {
        return status == CostWorkoutStatus.SUBMITTED || status == CostWorkoutStatus.APPROVED;
    }

    private void applyRequest(CostWorkout cw, CostWorkoutRequest request) {
        LocalDateTime cwDate = parseDate(request.cwDate());
        if (cwDate == null) {
            throw new BadRequestException("Date is required");
        }
        cw.setCwDate(cwDate);
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
        cw.setPreparedBy(request.preparedBy().trim());
        cw.setDepartment(request.department().trim());
        cw.setSourceLead(request.sourceLead().trim());
        cw.setContactPerson(request.contactPerson());
        cw.setCustomerName(request.customerName());
        cw.setCprRef(request.cprRef());
        // Only update the CPR link when the payload actually carries a cprId;
        // a null on edit preserves the existing FK instead of silently dropping it.
        if (request.cprId() != null) {
            cw.setCprId(request.cprId());
        }
        cw.setPhone(request.phone());
        cw.setEmail(request.email());
        cw.setCompany(request.company());
        cw.setGst(request.gst());
        cw.setPan(request.pan());
        cw.setLinkedCpr(request.linkedCpr());
        cw.setBillingAddress(request.billingAddress());
        cw.setShippingAddress(request.shippingAddress());
        cw.setRemarks(request.remarks());
        cw.setProfitPct(pct(request.profitPct(), "Profit %"));
        cw.setDiscountPct(pct(request.discountPct(), "Discount %"));
        cw.setGstPct(pct(request.gstPct(), "GST %"));
        // Only overwrite stored attachments when the payload actually carries
        // them (empty/missing payload preserves existing files on edit).
        if (request.attachments() != null) {
            cw.setAttachmentsJson(serializeAttachments(request.attachments()));
        }
        if (request.itemColumnsJson() != null) {
            cw.setItemColumnsJson(request.itemColumnsJson());
        }

        // Items are rebuilt on every save, so capture the stored per-item files
        // BEFORE clearing: a client that does not send an item's attachments
        // (older payloads / clients) must not wipe files the item already has.
        // Item order is stable for those payloads, so the previous entry is the
        // fallback only when the request omits attachments entirely.
        List<List<CostWorkoutAttachment>> previousItemAttachments = new ArrayList<>();
        for (CostWorkoutItem existing : cw.getItems()) {
            previousItemAttachments.add(parseAttachments(existing.getAttachmentsJson()));
        }
        cw.getItems().clear();
        boolean hasContent = false;
        if (request.items() != null) {
            int itemIndex = -1;
            for (CostWorkoutItemRequest itemRequest : request.items()) {
                if (itemRequest == null) {
                    continue;
                }
                CostWorkoutItem item = new CostWorkoutItem();
                item.setDescription(itemRequest.description());
                // Independent of the full description: never derived from it, so a
                // blank CPR description stays blank instead of echoing details.
                item.setCprDescription(itemRequest.cprDescription());
                item.setQty(itemRequest.qty() == null ? BigDecimal.ONE : itemRequest.qty());
                item.setUnit(itemRequest.unit());
                item.setCustomFieldsJson(serializeCustomFields(itemRequest.customFields()));
                itemIndex += 1;
                if (itemRequest.attachments() != null) {
                    item.setAttachmentsJson(serializeAttachments(itemRequest.attachments()));
                } else if (itemIndex < previousItemAttachments.size()
                        && !previousItemAttachments.get(itemIndex).isEmpty()) {
                    item.setAttachmentsJson(serializeAttachments(previousItemAttachments.get(itemIndex)));
                }
                boolean itemHasContent = false;
                if (itemRequest.categories() != null) {
                    for (CostWorkoutCategoryRequest catRequest : itemRequest.categories()) {
                        if (catRequest == null) {
                            continue;
                        }
                        BigDecimal qty = catRequest.qty() == null ? BigDecimal.ZERO : catRequest.qty();
                        BigDecimal rate = catRequest.rate() == null ? BigDecimal.ZERO : catRequest.rate();
                        if (qty.compareTo(BigDecimal.ZERO) < 0 || rate.compareTo(BigDecimal.ZERO) < 0) {
                            throw new BadRequestException("Quantity and Rate cannot be negative");
                        }
                        CostWorkoutCategory cat = new CostWorkoutCategory();
                        cat.setCategory(catRequest.category());
                        cat.setQty(qty);
                        cat.setUnit(catRequest.unit());
                        cat.setRate(rate);
                        cat.setNotes(catRequest.notes());
                        item.addCategory(cat);
                        if (qty.compareTo(BigDecimal.ZERO) > 0 || rate.compareTo(BigDecimal.ZERO) > 0
                                || (catRequest.category() != null
                                && "lead time".equalsIgnoreCase(catRequest.category().trim()))) {
                            itemHasContent = true;
                        }
                    }
                }
                if (itemHasContent || (itemRequest.description() != null && !itemRequest.description().isBlank())) {
                    hasContent = true;
                }
                cw.addItem(item);
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

    private void recalc(CostWorkout cw) {
        BigDecimal subtotal = BigDecimal.ZERO;
        for (CostWorkoutItem item : cw.getItems()) {
            BigDecimal itemTotal = BigDecimal.ZERO;
            for (CostWorkoutCategory cat : item.getCategories()) {
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
            subtotal = subtotal.add(itemTotal);
        }
        BigDecimal profitPct = cw.getProfitPct() == null ? BigDecimal.ZERO : cw.getProfitPct();
        BigDecimal discountPct = cw.getDiscountPct() == null ? BigDecimal.ZERO : cw.getDiscountPct();
        BigDecimal gstPct = cw.getGstPct() == null ? BigDecimal.valueOf(18) : cw.getGstPct();

        BigDecimal profitAmt = subtotal.multiply(profitPct).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        BigDecimal sellingPrice = subtotal.add(profitAmt);
        BigDecimal discountAmt = sellingPrice.multiply(discountPct).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        BigDecimal afterDiscount = sellingPrice.subtract(discountAmt);
        BigDecimal gstAmt = afterDiscount.multiply(gstPct).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        BigDecimal grandTotal = afterDiscount.add(gstAmt);

        cw.setSubtotal(subtotal.setScale(2, RoundingMode.HALF_UP));
        cw.setProfitAmt(profitAmt);
        cw.setSellingPrice(sellingPrice);
        cw.setDiscountAmt(discountAmt);
        cw.setGstAmt(gstAmt);
        cw.setGrandTotal(grandTotal);
    }

    /**
     * Predicate keeping only the CURRENT row of each revision chain. A row is
     * kept when it is flagged latestRevision OR no other row in the same chain
     * (chain key = revisionOf, or the row id for the base) carries a strictly
     * higher revision number. Legacy base rows without a revision chain always
     * survive this filter, so the main list never shows older revisions as
     * separate rows (they remain reachable via the revision-history dropdown).
     */
    private Predicate latestPerChainPredicate(jakarta.persistence.criteria.Root<CostWorkout> root, jakarta.persistence.criteria.CriteriaQuery<?> query, jakarta.persistence.criteria.CriteriaBuilder cb) {
        Subquery<Long> newer = query.subquery(Long.class);
        jakarta.persistence.criteria.Root<CostWorkout> newerRoot = newer.from(CostWorkout.class);
        newer.select(newerRoot.get("id"));
        newer.where(cb.and(
                cb.equal(newerRoot.get("revisionOf"),
                        cb.coalesce(root.get("revisionOf"), root.get("id"))),
                cb.greaterThan(cb.coalesce(newerRoot.get("revision"), 0),
                        cb.coalesce(root.get("revision"), 0))));
        return cb.or(cb.isTrue(root.get("latestRevision")), cb.not(cb.exists(newer)));
    }

    private Specification<CostWorkout> buildSpecification(String search, String status, String cprRef, String customer,
                                                          String company, String preparedBy, String dateFrom, String dateTo) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(latestPerChainPredicate(root, query, cb));
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("cwNo")), like),
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
                predicates.add(cb.not(root.get("status").in(CostWorkoutStatus.ARCHIVED, CostWorkoutStatus.DELETED)));
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
                predicates.add(cb.greaterThanOrEqualTo(root.get("cwDate"), LocalDate.parse(dateFrom).atStartOfDay()));
            }
            if (dateTo != null && !dateTo.isBlank()) {
                predicates.add(cb.lessThanOrEqualTo(root.get("cwDate"), LocalDate.parse(dateTo).atTime(23, 59, 59)));
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
            case "date", "cwDate" -> "cwDate";
            case "customer", "customerName" -> "customerName";
            case "company", "companyName" -> "company";
            case "cwNo", "cprRef", "preparedBy", "subtotal", "profitPct", "sellingPrice", "status",
                 "createdAt", "updatedAt", "grandTotal" -> field;
            default -> "createdAt";
        };
        boolean asc = parts.length > 1 && "asc".equalsIgnoreCase(parts[1]);
        return Sort.by(asc ? Sort.Direction.ASC : Sort.Direction.DESC, mapped);
    }

    private long nextSequence() {
        String prefix = "CW-" + Year.now().getValue() + "-";
        // Only the cw_no column is read (scalar projection). The row count stays
        // a COUNT so numbering never reuses a suffix whose record was deleted.
        long count = costWorkoutRepository.count();
        long maxSuffix = 0;
        for (String cwNo : costWorkoutRepository.findCwNosWithPrefix(prefix)) {
            if (cwNo == null || !cwNo.startsWith(prefix)) {
                continue;
            }
            try {
                maxSuffix = Math.max(maxSuffix, Long.parseLong(cwNo.substring(prefix.length())));
            } catch (NumberFormatException ignored) {
                // skip malformed numbers
            }
        }
        return Math.max(count, maxSuffix) + 1;
    }

    private String buildCwNo(long sequence) {
        return String.format("CW-%d-%06d", Year.now().getValue(), sequence);
    }

    private String serializeAttachments(List<CostWorkoutAttachment> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return null;
        }
        try {
            return CW_JSON.writeValueAsString(attachments);
        } catch (Exception e) {
            return null;
        }
    }

    private String serializeCustomFields(Map<String, String> customFields) {
        if (customFields == null || customFields.isEmpty()) {
            return null;
        }
        try {
            return CW_JSON.writeValueAsString(customFields);
        } catch (Exception e) {
            return null;
        }
    }

    private Map<String, String> parseCustomFields(String json) {
        if (json == null || json.isBlank()) {
            return java.util.Map.of();
        }
        try {
            return CW_JSON.readValue(json, new TypeReference<Map<String, String>>() {});
        } catch (Exception e) {
            return java.util.Map.of();
        }
    }

    private List<CostWorkoutAttachment> parseAttachments(String json) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            List<CostWorkoutAttachment> list = CW_JSON.readValue(json, new TypeReference<List<CostWorkoutAttachment>>() {
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

    private CostWorkoutStatus parseStatus(String value) {
        String normalized = value.trim().toUpperCase().replace(" ", "_").replace("-", "_");
        if ("PENDING".equals(normalized) || "UNDER_REVIEW".equals(normalized) || "SUBMITTED".equals(normalized)) {
            return CostWorkoutStatus.SUBMITTED;
        }
        try {
            return CostWorkoutStatus.valueOf(normalized);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid status: " + value);
        }
    }

    private String statusKey(CostWorkoutStatus status) {
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
}
