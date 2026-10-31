package com.vishatech.erp.service;

import com.vishatech.erp.dto.PurchaseDtos;
import com.vishatech.erp.entity.Notification;
import com.vishatech.erp.entity.PurchaseAttachment;
import com.vishatech.erp.entity.PurchaseRequisition;
import com.vishatech.erp.entity.PurchaseRequisitionItem;
import com.vishatech.erp.entity.PurchaseRfq;
import com.vishatech.erp.entity.PurchaseRfqItem;
import com.vishatech.erp.repository.PurchaseAttachmentRepository;
import com.vishatech.erp.repository.PurchaseRequisitionRepository;
import com.vishatech.erp.repository.PurchaseRfqRepository;
import com.vishatech.erp.repository.PurchaseTimelineRepository;
import com.vishatech.erp.util.AuditContext;
import com.vishatech.erp.util.PurchaseNumbering;
import com.vishatech.erp.util.PurchaseTotals;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Purchase Requisition (PR) service — Module 1 of the Purchase backend.
 *
 * Implements the exact endpoint set the existing Purchase frontend calls
 * (see src/purchase/services/api/requisitionApi.js):
 *
 *   list / get / create / update / delete(soft) / archive / restore
 *   submit → approve / reject / return → technical review save/complete
 *   convert-to-rfq (bulk + single) / duplicate
 *   stats / activity / comments / attachments
 *
 * Workflow states mirror the frontend PR_STATUS contract verbatim.
 */
@Service
public class PurchaseRequisitionService {

    private static final String STATUS_DRAFT = "Draft";
    private static final String STATUS_PENDING = "Pending Approval";
    private static final String STATUS_TECH_REVIEW = "Technical Specification Review";
    private static final String STATUS_READY_RFQ = "Ready for RFQ";
    private static final String STATUS_CONVERTED = "Converted to RFQ";
    private static final String STATUS_REJECTED = "Rejected";
    private static final String STATUS_RETURNED = "Returned";
    private static final String STATUS_PO_RAISED = "PO Raised";

    private static final DateTimeFormatter ISO_DATE = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final PurchaseRequisitionRepository repository;
    private final PurchaseRfqRepository rfqRepository;
    private final PurchaseTimelineRepository timelineRepository;
    private final PurchaseAttachmentRepository attachmentRepository;
    private final PurchaseSupportService support;
    private final PurchaseNumbering numbering;
    private final FileStorageService fileStorageService;
    private final AuditContext auditContext;
    private final PurchaseNotificationPublisher notifications;

    public PurchaseRequisitionService(PurchaseRequisitionRepository repository,
                                      PurchaseRfqRepository rfqRepository,
                                      PurchaseTimelineRepository timelineRepository,
                                      PurchaseAttachmentRepository attachmentRepository,
                                      PurchaseSupportService support,
                                      PurchaseNumbering numbering,
                                      FileStorageService fileStorageService,
                                      AuditContext auditContext,
                                      PurchaseNotificationPublisher notifications) {
        this.repository = repository;
        this.rfqRepository = rfqRepository;
        this.timelineRepository = timelineRepository;
        this.attachmentRepository = attachmentRepository;
        this.support = support;
        this.numbering = numbering;
        this.fileStorageService = fileStorageService;
        this.auditContext = auditContext;
        this.notifications = notifications;
    }

    // ------------------------------------------------------------------
    // Read
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Page<PurchaseDtos.PurchaseRequisitionResponse> list(
            int page, int size, String search, String sort, String state, String status,
            String department, String requester, String vendor, String priority, String project,
            String dateFrom, String dateTo) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 500);
        Sort springSort = buildSort(sort);
        Pageable pageable = PageRequest.of(safePage, safeSize, springSort);

        Specification<PurchaseRequisition> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (state == null || state.isBlank() || "active".equals(state)) {
                predicates.add(cb.equal(root.get("recordState"), PurchaseRequisition.RECORD_ACTIVE));
            } else {
                predicates.add(cb.equal(root.get("recordState"), state));
            }
            if (status != null && !status.isBlank() && !"All".equals(status)) {
                // The frontend may pass a comma-separated status group (e.g. the
                // PR_APPROVED_GROUP array joined). Match ANY of them.
                List<String> statuses = List.of(status.split(","));
                predicates.add(root.get("status").in(statuses.stream().map(String::trim).toList()));
            }
            if (department != null && !department.isBlank() && !"All".equals(department)) {
                predicates.add(cb.equal(root.get("department"), department));
            }
            if (requester != null && !requester.isBlank() && !"All".equals(requester)) {
                predicates.add(cb.equal(root.get("requester"), requester));
            }
            if (vendor != null && !vendor.isBlank() && !"All".equals(vendor)) {
                predicates.add(cb.equal(root.get("vendor"), vendor));
            }
            if (priority != null && !priority.isBlank() && !"All".equals(priority)) {
                predicates.add(cb.equal(root.get("priority"), priority));
            }
            if (project != null && !project.isBlank() && !"All".equals(project)) {
                predicates.add(cb.equal(root.get("project"), project));
            }
            if (dateFrom != null && !dateFrom.isBlank()) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("date"), dateFrom));
            }
            if (dateTo != null && !dateTo.isBlank()) {
                predicates.add(cb.lessThanOrEqualTo(root.get("date"), dateTo));
            }
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                Predicate or = cb.or(
                        cb.like(cb.lower(root.get("prNo")), like),
                        cb.like(cb.lower(root.get("title")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("requester"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("department"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("vendor"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("priority"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("project"), "")), like));
                predicates.add(or);
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };

        return repository.findAll(spec, pageable).map(this::toResponse);
    }

    // ------------------------------------------------------------------
    // Technical Specification Review queue
    // ------------------------------------------------------------------
    /*
     * The review queue is a bounded, database-filtered read: one page of
     * requisitions in the review stage, with search / filters / sorting and
     * the KPI counts all resolved in MySQL. The browser no longer downloads
     * a few hundred requisitions and filters them itself.
     *
     * The review state lives in the persisted technicalReview payload (the
     * same JSON the screens render), so "reviewed" is matched on the stored
     * marker: `"reviewStatus":"Reviewed"`.
     */

    private static final String STATUS_READY_REVIEW = "Ready for Review";
    private static final String STATUS_REVIEWED = "Reviewed";
    private static final String REVIEWED_MARKER = "\"reviewStatus\":\"Reviewed\"";
    private static final String REVIEWED_AT_MARKER = "\"reviewedAt\":\"";
    private static final int QUEUE_DEFAULT_PAGE_SIZE = 25;
    private static final int QUEUE_MAX_PAGE_SIZE = 100;
    private static final List<String> PRIORITY_RANK = List.of("Critical", "High", "Medium", "Low");

    /**
     * Review-queue criteria — the exact same description drives the page
     * request and the KPI counts, so a count can never disagree with the
     * rows the filter returns.
     */
    record TechnicalReviewQuery(String search, String reviewStatus, String department, String vendor,
                                String assignedBy, String priority, String dateFrom, String dateTo,
                                boolean reviewedToday) {
    }

    /**
     * One page of the technical-review queue (default 25 rows, max 100).
     * Only requisitions in the canonical review stage are ever returned.
     */
    @Transactional(readOnly = true)
    public Page<PurchaseDtos.PurchaseRequisitionResponse> technicalReviewQueue(
            int page, int size, String search, String sort, String reviewStatus, String department,
            String vendor, String assignedBy, String priority, String dateFrom, String dateTo,
            boolean reviewedToday) {
        TechnicalReviewQuery criteria = new TechnicalReviewQuery(search, reviewStatus, department, vendor,
                assignedBy, priority, dateFrom, dateTo, reviewedToday);
        int safeSize = size <= 0 ? QUEUE_DEFAULT_PAGE_SIZE : Math.min(size, QUEUE_MAX_PAGE_SIZE);
        String orderField = queueOrderField(sort);
        Pageable pageable = orderField == null
                ? PageRequest.of(Math.max(0, page), safeSize, queueSort(sort))
                : PageRequest.of(Math.max(0, page), safeSize);
        return repository.findAll(technicalReviewSpec(criteria, orderField, isDescending(sort)), pageable)
                .map(this::toResponse);
    }

    /**
     * Review-queue KPI counts and filter options — every figure is a
     * database count over the whole table, never a tally of the page the
     * browser happens to hold.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> technicalReviewQueueStats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        /* Queue size mirrors the sidebar "Technical Specification Review"
           badge: every PR sitting in the stage. */
        stats.put("pendingReview", repository.count(queueCriteria(null, null, null, null, null, null, null, null, false)));
        /* Reviewed Today counts PRs reviewed today in ANY stage — once the
           review is approved the PR leaves the queue. */
        stats.put("reviewedToday", repository.count(reviewedTodaySpec()));
        stats.put("highPriority", repository.count(queueCriteria(null, null, null, null, null, "High,Critical", null, null, false)));
        stats.put("reviewed", repository.count(queueCriteria(null, STATUS_REVIEWED, null, null, null, null, null, null, false)));
        stats.put("departments", repository.distinctDepartments(PurchaseRequisition.RECORD_ACTIVE, STATUS_TECH_REVIEW));
        stats.put("vendors", repository.distinctVendors(PurchaseRequisition.RECORD_ACTIVE, STATUS_TECH_REVIEW));
        stats.put("assignees", repository.distinctBuyers(PurchaseRequisition.RECORD_ACTIVE, STATUS_TECH_REVIEW));
        return stats;
    }

    /** Criteria backed by positional arguments (used for the counted subsets). */
    private Specification<PurchaseRequisition> queueCriteria(String search, String reviewStatus, String department,
                                                             String vendor, String assignedBy, String priority,
                                                             String dateFrom, String dateTo, boolean reviewedToday) {
        return technicalReviewSpec(new TechnicalReviewQuery(search, reviewStatus, department, vendor, assignedBy,
                priority, dateFrom, dateTo, reviewedToday), null, false);
    }

    /** PRs in any stage whose technical review was recorded today. */
    private Specification<PurchaseRequisition> reviewedTodaySpec() {
        return (root, query, cb) -> cb.and(
                cb.equal(root.get("recordState"), PurchaseRequisition.RECORD_ACTIVE),
                cb.like(root.get("technicalReviewJson"), reviewedTodayPattern()));
    }

    private String reviewedTodayPattern() {
        return "%" + REVIEWED_AT_MARKER + LocalDate.now() + "T%";
    }

    /**
     * The review-queue WHERE clause. When {@code orderField} is set the
     * ordering is added to the criteria query itself — Spring's Sort cannot
     * express a priority rank or the derived review status — and the count
     * query is left untouched.
     */
    private Specification<PurchaseRequisition> technicalReviewSpec(TechnicalReviewQuery criteria,
                                                                  String orderField, boolean orderDesc) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            /* Queue scope: active requisitions sitting in the review stage. */
            predicates.add(cb.equal(root.get("recordState"), PurchaseRequisition.RECORD_ACTIVE));
            predicates.add(cb.equal(root.get("status"), STATUS_TECH_REVIEW));

            if (hasText(criteria.department())) {
                predicates.add(cb.equal(root.get("department"), criteria.department().trim()));
            }
            if (hasText(criteria.vendor())) {
                predicates.add(cb.equal(root.get("vendor"), criteria.vendor().trim()));
            }
            if (hasText(criteria.assignedBy())) {
                predicates.add(cb.equal(root.get("buyer"), criteria.assignedBy().trim()));
            }
            if (hasText(criteria.dateFrom())) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("date"), criteria.dateFrom().trim()));
            }
            if (hasText(criteria.dateTo())) {
                predicates.add(cb.lessThanOrEqualTo(root.get("date"), criteria.dateTo().trim()));
            }
            if (hasText(criteria.priority())) {
                List<String> priorities = List.of(criteria.priority().split(",")).stream()
                        .map(String::trim).filter(value -> !value.isBlank() && !"All".equals(value)).toList();
                if (priorities.size() == 1) {
                    predicates.add(cb.equal(root.get("priority"), priorities.get(0)));
                } else if (!priorities.isEmpty()) {
                    predicates.add(root.get("priority").in(priorities));
                }
            }
            if (hasText(criteria.reviewStatus())) {
                predicates.add(reviewStatusPredicate(root, cb, criteria.reviewStatus().trim()));
            }
            if (criteria.reviewedToday()) {
                predicates.add(cb.like(root.get("technicalReviewJson"), reviewedTodayPattern()));
            }
            if (criteria.search() != null && !criteria.search().isBlank()) {
                String like = "%" + criteria.search().trim().toLowerCase() + "%";
                List<Predicate> matches = new ArrayList<>(List.of(
                        cb.like(cb.lower(root.get("prNo")), like),
                        cb.like(cb.lower(root.get("title")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("vendor"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("department"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("requester"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("priority"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("buyer"), "")), like)));
                /* The item column shows the first line item's product — matched
                   with EXISTS so paging is never duplicated by a join. */
                Subquery<Integer> itemMatch = query.subquery(Integer.class);
                Root<PurchaseRequisitionItem> item = itemMatch.from(PurchaseRequisitionItem.class);
                itemMatch.select(cb.literal(1)).where(
                        cb.equal(item.get("requisition"), root),
                        cb.like(cb.lower(item.get("product")), like));
                matches.add(cb.exists(itemMatch));
                predicates.add(cb.or(matches.toArray(new Predicate[0])));
            }

            if (orderField != null && query != null && query.getResultType() != Long.class) {
                Expression<?> key = "priority".equals(orderField)
                        ? priorityRank(root, cb)
                        : reviewedFlag(root, cb);
                query.orderBy(orderDesc ? cb.desc(key) : cb.asc(key),
                        cb.asc(root.get("createdAt")), cb.asc(root.get("id")));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    /**
     * Review-status filter using the derived states shown in the table:
     * "Reviewed" needs the stored marker, "Ready for Review" is everything
     * (still) without it. Any other value describes a stage the queue
     * excludes, so it is matched on the real status and can only ever
     * narrow the result.
     */
    private Predicate reviewStatusPredicate(Root<PurchaseRequisition> root, CriteriaBuilder cb, String reviewStatus) {
        if (STATUS_REVIEWED.equals(reviewStatus)) {
            return reviewedMarker(root, cb);
        }
        if (STATUS_READY_REVIEW.equals(reviewStatus)) {
            return cb.or(cb.isNull(root.get("technicalReviewJson")), cb.not(reviewedMarker(root, cb)));
        }
        return cb.equal(root.get("status"), reviewStatus);
    }

    private Predicate reviewedMarker(Root<PurchaseRequisition> root, CriteriaBuilder cb) {
        return cb.like(root.get("technicalReviewJson"), "%" + REVIEWED_MARKER + "%");
    }

    /** Priority rank for the sortable Priority column (Critical first). */
    private Expression<?> priorityRank(Root<PurchaseRequisition> root, CriteriaBuilder cb) {
        CriteriaBuilder.Case<Object> rank = cb.selectCase();
        for (int i = 0; i < PRIORITY_RANK.size(); i++) {
            rank = rank.when(cb.equal(root.get("priority"), PRIORITY_RANK.get(i)), i);
        }
        return rank.otherwise(PRIORITY_RANK.size());
    }

    /** 1 when the stored review is complete — orders the derived Status column. */
    private Expression<?> reviewedFlag(Root<PurchaseRequisition> root, CriteriaBuilder cb) {
        return cb.selectCase().when(reviewedMarker(root, cb), 1).otherwise(0);
    }

    /** Fields ordered inside the specification instead of a plain Sort. */
    private String queueOrderField(String sort) {
        String field = sortField(sort);
        return "priority".equals(field) || "reviewStatus".equals(field) ? field : null;
    }

    private String sortField(String sort) {
        if (sort == null || sort.isBlank()) {
            return "";
        }
        String value = sort.trim();
        if (value.startsWith("-")) {
            value = value.substring(1);
        }
        return value.split(",")[0].trim();
    }

    private boolean isDescending(String sort) {
        if (sort == null || sort.isBlank()) {
            return false;
        }
        String value = sort.trim();
        if (value.startsWith("-")) {
            return true;
        }
        String[] parts = value.split(",");
        return parts.length > 1 && "desc".equalsIgnoreCase(parts[1].trim());
    }

    /**
     * Queue ordering: FIFO by default (oldest awaiting review first — the
     * order the review queue has always used), otherwise a whitelisted
     * column. Unknown fields fall back to the FIFO order.
     */
    private Sort queueSort(String sort) {
        String field = sortField(sort);
        if (field.isEmpty()) {
            return Sort.by(Sort.Direction.ASC, "createdAt");
        }
        String mapped = switch (field) {
            case "prNo", "title", "department", "vendor", "priority", "date", "createdAt", "status",
                 "project", "requester" -> field;
            case "assignedBy" -> "buyer";
            /* The Item column label is the first line item's product, falling
               back to the PR title — the only part a plain Sort can order. */
            case "item" -> "title";
            default -> "createdAt";
        };
        return Sort.by(isDescending(sort) ? Sort.Direction.DESC : Sort.Direction.ASC, mapped);
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank() && !"All".equals(value);
    }

    private Sort buildSort(String sort) {
        String field = "createdAt";
        boolean asc = false;
        if (sort != null && !sort.isBlank()) {
            String value = sort.trim();
            if (value.startsWith("-")) {
                value = value.substring(1);
            } else {
                asc = true;
            }
            field = switch (value) {
                case "createdAt", "date", "expectedDate", "amount", "prNo", "title",
                     "department", "requester", "vendor", "priority", "status", "project" -> value;
                default -> "createdAt";
            };
        }
        return asc ? Sort.by(field).ascending() : Sort.by(field).descending();
    }

    @Transactional(readOnly = true)
    public PurchaseDtos.PurchaseRequisitionResponse get(Long id) {
        return toResponse(getEntity(id));
    }

    @Transactional(readOnly = true)
    public Map<String, Object> nextNumber() {
        List<String> numbers = repository.findAll().stream().map(PurchaseRequisition::getPrNo).toList();
        long max = numbering.maxSequence(numbers, "PR");
        return Map.of("prNo", numbering.nextPrNo(max), "nextNumber", max + 1);
    }

    // ------------------------------------------------------------------
    // Write
    // ------------------------------------------------------------------

    @Transactional
    public PurchaseDtos.PurchaseRequisitionResponse create(PurchaseRequisitionRequestWrapper request) {
        validateRequest(request, request != null && Boolean.TRUE.equals(request.draft()));
        PurchaseRequisition pr = new PurchaseRequisition();
        String prNo = request.prNo() != null && !request.prNo().isBlank()
                ? request.prNo().trim()
                : numbering.nextPrNo(numbering.maxSequence(
                        repository.findAll().stream().map(PurchaseRequisition::getPrNo).toList(), "PR"));
        if (repository.existsByPrNo(prNo)) {
            throw new BadRequestException("PR number " + prNo + " already exists");
        }
        pr.setPrNo(prNo);
        applyRequest(pr, request);
        pr.setCreatedBy(supportActivityActor());
        pr.setUpdatedBy(supportActivityActor());
        if (request.status() != null && !request.status().isBlank()) {
            pr.setStatus(request.status());
        } else {
            pr.setStatus(STATUS_DRAFT);
        }
        pr.setApprovalStatus("Pending");
        recalcTotals(pr);
        repository.save(pr);
        support.log(PurchaseSupportService.DOC_PR, pr.getId(), "create",
                "Requisition created", "Requisition " + pr.getPrNo() + " was created.");
        return toResponse(pr);
    }

    @Transactional
    public PurchaseDtos.PurchaseRequisitionResponse update(Long id, PurchaseRequisitionRequestWrapper request) {
        PurchaseRequisition pr = getEntity(id);
        if (!(STATUS_DRAFT.equals(pr.getStatus()) || STATUS_RETURNED.equals(pr.getStatus())
                || STATUS_PENDING.equals(pr.getStatus()))) {
            throw new BadRequestException("Cannot edit " + pr.getPrNo()
                    + ": only Draft, Returned, or Pending Approval requisitions can be edited");
        }
        validateRequest(request, Boolean.TRUE.equals(request.draft()));
        applyRequest(pr, request);
        pr.setUpdatedBy(supportActivityActor());
        recalcTotals(pr);
        repository.save(pr);
        support.log(PurchaseSupportService.DOC_PR, pr.getId(), "update",
                "Requisition updated", "Requisition details were updated.");
        return toResponse(pr);
    }

    /** Soft delete (Record Lifecycle — never destroys history). */
    @Transactional
    public PurchaseDtos.PurchaseRequisitionResponse delete(Long id) {
        PurchaseRequisition pr = getEntity(id);
        if (!rfqRepository.findByReference(pr.getPrNo()).isEmpty()) {
            throw new BadRequestException("Cannot delete " + pr.getPrNo()
                    + ": it is referenced by an RFQ. Remove the RFQ link first.");
        }
        pr.setRecordState(PurchaseRequisition.RECORD_DELETED);
        repository.save(pr);
        support.log(PurchaseSupportService.DOC_PR, pr.getId(), "delete",
                "Requisition deleted", "Requisition was moved to trash.");
        return toResponse(pr);
    }

    @Transactional
    public void archive(Long id) {
        PurchaseRequisition pr = getEntity(id);
        pr.setRecordState(PurchaseRequisition.RECORD_ARCHIVED);
        repository.save(pr);
        support.log(PurchaseSupportService.DOC_PR, pr.getId(), "archive",
                "Requisition archived", "Requisition was archived.");
    }

    @Transactional
    public PurchaseDtos.PurchaseRequisitionResponse restore(Long id) {
        PurchaseRequisition pr = getEntity(id);
        pr.setRecordState(PurchaseRequisition.RECORD_ACTIVE);
        repository.save(pr);
        support.log(PurchaseSupportService.DOC_PR, pr.getId(), "restore",
                "Requisition restored", "Requisition was restored.");
        return toResponse(pr);
    }

    // ------------------------------------------------------------------
    // Workflow
    // ------------------------------------------------------------------

    @Transactional
    public PurchaseDtos.PurchaseRequisitionResponse submit(Long id) {
        PurchaseRequisition pr = getEntity(id);
        if (!STATUS_DRAFT.equals(pr.getStatus()) && !STATUS_RETURNED.equals(pr.getStatus())) {
            throw new BadRequestException("Only draft or returned requisitions can be submitted");
        }
        validateBeforeSubmit(pr);
        pr.setStatus(STATUS_PENDING);
        pr.setApprovalStatus("Pending");
        repository.save(pr);
        support.log(PurchaseSupportService.DOC_PR, pr.getId(), "submit",
                "Submitted for approval", "Requisition submitted for approval.",
                STATUS_DRAFT, STATUS_PENDING);
        notifications.publish(PurchaseNotificationPublisher.EVENT_PR_SUBMITTED,
                "PR " + pr.getPrNo() + " submitted for approval",
                "Requisition " + pr.getPrNo() + " ("
                        + (pr.getTitle() == null ? pr.getPrNo() : pr.getTitle())
                        + ") is awaiting the approval decision.",
                pr.getId(), "PurchaseRequisition");
        return toResponse(pr);
    }

    @Transactional
    public PurchaseDtos.PurchaseRequisitionResponse approve(Long id, String remarks) {
        PurchaseRequisition pr = getEntity(id);
        if (!STATUS_PENDING.equals(pr.getStatus())) {
            throw new BadRequestException("Only pending requisitions can be approved");
        }
        pr.setStatus(STATUS_TECH_REVIEW);
        pr.setApprovalStatus("Approved");
        pr.setApprovedBy(supportActivityActor());
        pr.setApprovalDate(LocalDateTime.now());
        if (remarks != null && !remarks.isBlank()) {
            pr.setApprovalNote(remarks);
        }
        repository.save(pr);
        support.log(PurchaseSupportService.DOC_PR, pr.getId(), "approve",
                "Approved · moved to " + STATUS_TECH_REVIEW,
                "Requisition approved" + (remarks == null || remarks.isBlank() ? "" : " — " + remarks),
                STATUS_PENDING, STATUS_TECH_REVIEW);
        notifications.publish(PurchaseNotificationPublisher.EVENT_PR_APPROVED,
                "PR " + pr.getPrNo() + " approved",
                "Requisition " + pr.getPrNo() + " was approved by " + pr.getApprovedBy()
                        + (remarks == null || remarks.isBlank() ? "." : " — " + remarks),
                pr.getId(), "PurchaseRequisition");
        return toResponse(pr);
    }

    @Transactional
    public PurchaseDtos.PurchaseRequisitionResponse reject(Long id, String remarks) {
        PurchaseRequisition pr = getEntity(id);
        if (!STATUS_PENDING.equals(pr.getStatus())) {
            throw new BadRequestException("Only pending requisitions can be rejected");
        }
        if (remarks == null || remarks.isBlank()) {
            throw new BadRequestException("Remarks are required to reject a requisition");
        }
        pr.setStatus(STATUS_REJECTED);
        pr.setApprovalStatus("Rejected");
        pr.setRejectedBy(supportActivityActor());
        pr.setApprovalDate(LocalDateTime.now());
        pr.setApprovalNote(remarks);
        repository.save(pr);
        support.log(PurchaseSupportService.DOC_PR, pr.getId(), "reject",
                "Rejected by " + pr.getRejectedBy(), remarks, STATUS_PENDING, STATUS_REJECTED);
        notifications.publish(PurchaseNotificationPublisher.EVENT_PR_REJECTED,
                "PR " + pr.getPrNo() + " rejected",
                "Requisition " + pr.getPrNo() + " was rejected by " + pr.getRejectedBy()
                        + ": " + remarks,
                pr.getId(), "PurchaseRequisition", Notification.Priority.HIGH);
        return toResponse(pr);
    }

    /** Returns a PR to the requester from the technical-review stage. */
    @Transactional
    public PurchaseDtos.PurchaseRequisitionResponse returnToRequester(Long id, String remarks) {
        PurchaseRequisition pr = getEntity(id);
        if (!STATUS_TECH_REVIEW.equals(pr.getStatus())) {
            throw new BadRequestException("Only requisitions in technical review can be returned");
        }
        pr.setStatus(STATUS_RETURNED);
        repository.save(pr);
        support.log(PurchaseSupportService.DOC_PR, pr.getId(), "return",
                "Returned to requester by " + supportActivityActor(),
                remarks == null || remarks.isBlank() ? "Please review and resubmit." : remarks,
                STATUS_TECH_REVIEW, STATUS_RETURNED);
        return toResponse(pr);
    }

    /** Saves the technical specification review (In Review / Reviewed). */
    @Transactional
    public PurchaseDtos.PurchaseRequisitionResponse saveTechnicalReview(Long id,
                                                                        PurchaseDtos.TechnicalReviewRequest review) {
        PurchaseRequisition pr = getEntity(id);
        Map<String, Object> reviewMap = new LinkedHashMap<>();
        reviewMap.put("specification", orBlank(review.specification()));
        reviewMap.put("drawing", orBlank(review.drawing()));
        reviewMap.put("materialGrade", orBlank(review.materialGrade()));
        reviewMap.put("dimensions", orBlank(review.dimensions()));
        reviewMap.put("comments", orBlank(review.comments()));
        reviewMap.put("reviewStatus", orBlank(review.reviewStatus()).isBlank() ? "In Review" : review.reviewStatus());
        reviewMap.put("reviewedBy", supportActivityActor());
        reviewMap.put("reviewedAt", LocalDateTime.now().toString());
        pr.setTechnicalReviewJson(support.writeJson(reviewMap));
        repository.save(pr);
        support.log(PurchaseSupportService.DOC_PR, pr.getId(), "review",
                "Technical review saved", orBlank(review.comments()));
        return toResponse(pr);
    }

    /** Approves the technical review → Ready for RFQ. */
    @Transactional
    public PurchaseDtos.PurchaseRequisitionResponse completeTechnicalReview(Long id, String remarks) {
        PurchaseRequisition pr = getEntity(id);
        if (STATUS_CONVERTED.equals(pr.getStatus()) || STATUS_PO_RAISED.equals(pr.getStatus())) {
            throw new BadRequestException(pr.getRfqNo() != null && !pr.getRfqNo().isBlank()
                    ? pr.getPrNo() + " is already linked to RFQ " + pr.getRfqNo()
                    : pr.getPrNo() + " is already " + pr.getStatus());
        }
        if (!STATUS_TECH_REVIEW.equals(pr.getStatus())) {
            throw new BadRequestException("Only requisitions in technical review can be approved");
        }
        pr.setStatus(STATUS_READY_RFQ);
        Map<String, Object> review = existingReview(pr);
        review.put("reviewStatus", "Reviewed");
        review.put("reviewedBy", supportActivityActor());
        review.put("reviewedAt", LocalDateTime.now().toString());
        if (remarks != null && !remarks.isBlank()) {
            review.put("comments", remarks);
        }
        pr.setTechnicalReviewJson(support.writeJson(review));
        repository.save(pr);
        support.log(PurchaseSupportService.DOC_PR, pr.getId(), "review",
                "Technical review approved · " + STATUS_READY_RFQ,
                remarks == null || remarks.isBlank() ? "Technical specification approved" : remarks,
                STATUS_TECH_REVIEW, STATUS_READY_RFQ);
        return toResponse(pr);
    }

    /** Marks one PR as converted to a specific RFQ (Create RFQ flow). */
    @Transactional
    public PurchaseDtos.PurchaseRequisitionResponse markConvertedToRfq(Long id, String rfqNo) {
        PurchaseRequisition pr = getEntity(id);
        if (STATUS_CONVERTED.equals(pr.getStatus()) || STATUS_PO_RAISED.equals(pr.getStatus())) {
            throw new BadRequestException(pr.getRfqNo() != null && !pr.getRfqNo().isBlank()
                    ? pr.getPrNo() + " is already linked to RFQ " + pr.getRfqNo()
                    : pr.getPrNo() + " is already " + pr.getStatus());
        }
        if (!STATUS_READY_RFQ.equals(pr.getStatus())) {
            throw new BadRequestException("Only ready-for-RFQ requisitions can be converted to an RFQ");
        }
        pr.setStatus(STATUS_CONVERTED);
        pr.setRfqNo(rfqNo == null ? "" : rfqNo);
        repository.save(pr);
        support.log(PurchaseSupportService.DOC_PR, pr.getId(), "rfq",
                "Converted to RFQ " + pr.getRfqNo(),
                "RFQ " + pr.getRfqNo() + " created from " + pr.getPrNo(),
                STATUS_READY_RFQ, STATUS_CONVERTED);
        return toResponse(pr);
    }

    /**
     * Bulk-converts ready-for-RFQ requisitions into RFQ drafts. Returns
     * the created RFQs plus per-PR errors so the UI can show partial
     * success (the exact contract of convertToRfq on the frontend).
     */
    @Transactional
    public PurchaseDtos.ConvertResult convertToRfq(List<Long> ids) {
        List<Map<String, Object>> created = new ArrayList<>();
        List<Map<String, Object>> errors = new ArrayList<>();
        if (ids == null || ids.isEmpty()) {
            return new PurchaseDtos.ConvertResult(created, errors);
        }
        for (Long id : ids) {
            try {
                created.add(createRfqFromRequisition(getEntity(id)));
            } catch (BadRequestException e) {
                errors.add(Map.of("id", id, "error", e.getMessage()));
            } catch (ResourceNotFoundException e) {
                errors.add(Map.of("id", id, "error", "Requisition not found"));
            }
        }
        return new PurchaseDtos.ConvertResult(created, errors);
    }

    /** Creates an RFQ draft from an approved PR and links both records. */
    @Transactional
    public Map<String, Object> createRfqFromRequisition(PurchaseRequisition pr) {
        if (!STATUS_READY_RFQ.equals(pr.getStatus())) {
            throw new BadRequestException(pr.getPrNo() + " is " + pr.getStatus()
                    + " — only ready-for-RFQ requisitions can be converted");
        }
        PurchaseRfq rfq = new PurchaseRfq();
        String rfqNo = numbering.nextRfqNo(numbering.maxSequence(
                rfqRepository.findAll().stream().map(PurchaseRfq::getRfqNo).toList(), "RFQ"));
        rfq.setRfqNo(rfqNo);
        rfq.setTitle(pr.getTitle() == null ? "RFQ for " + pr.getPrNo() : pr.getTitle());
        rfq.setReference(pr.getPrNo());
        rfq.setPrNo(pr.getPrNo());
        rfq.setCategory(firstItem(pr, "category"));
        rfq.setDescription(orBlank(pr.getNotes()));
        rfq.setDepartment(pr.getDepartment());
        rfq.setProject(pr.getProject());
        rfq.setRequester(pr.getRequester());
        rfq.setBuyer(pr.getBuyer());
        rfq.setPriority(pr.getPriority() == null ? "Medium" : pr.getPriority());
        rfq.setValidity(30);
        rfq.setDueDate(pr.getExpectedDate());
        rfq.setCurrency(pr.getCurrency() == null ? "INR" : pr.getCurrency());
        rfq.setDeliveryAddress(orBlank(pr.getDeliveryAddress()).isBlank() ? pr.getBranch() : pr.getDeliveryAddress());
        rfq.setNotes(pr.getInternalNotes());
        Map<String, Object> terms = new LinkedHashMap<>();
        terms.put("paymentTerms", orBlank(pr.getTerms()));
        rfq.setCommercialTermsJson(support.writeJson(terms));
        rfq.setStatus("Draft");
        rfq.setApprovalStatus("Pending");

        List<Map<String, Object>> rfqItems = new ArrayList<>();
        for (PurchaseRequisitionItem item : pr.getItems()) {
            Map<String, Object> line = new LinkedHashMap<>();
            line.put("itemCode", item.getItemCode());
            line.put("category", item.getCategory());
            line.put("product", item.getProduct());
            line.put("hsn", item.getHsn());
            line.put("uom", item.getUom());
            line.put("qty", item.getQty());
            line.put("rate", item.getRate());
            line.put("expectedRate", item.getRate());
            line.put("specification", item.getRemarks());
            line.put("requiredDate", pr.getExpectedDate());
            rfqItems.add(line);
            PurchaseRfqItem rfqLine = new PurchaseRfqItem();
            rfqLine.setRfq(rfq);
            rfqLine.setItemCode(item.getItemCode());
            rfqLine.setProduct(item.getProduct());
            rfqLine.setCategory(item.getCategory());
            rfqLine.setSpecification(item.getRemarks());
            rfqLine.setRequiredDate(pr.getExpectedDate());
            rfqLine.setHsn(item.getHsn());
            rfqLine.setUom(item.getUom());
            rfqLine.setQty(item.getQty() == null ? BigDecimal.ZERO : item.getQty());
            rfqLine.setRate(item.getRate() == null ? BigDecimal.ZERO : item.getRate());
            rfq.getItems().add(rfqLine);
        }
        PurchaseRfq savedRfq = rfqRepository.save(rfq);

        markConvertedToRfq(pr.getId(), savedRfq.getRfqNo());
        support.log(PurchaseSupportService.DOC_RFQ, savedRfq.getId(), "create",
                "RFQ created from " + pr.getPrNo(), "Auto-generated during PR conversion.");

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id", savedRfq.getId());
        response.put("rfqNo", savedRfq.getRfqNo());
        response.put("title", savedRfq.getTitle());
        response.put("reference", savedRfq.getReference());
        response.put("status", savedRfq.getStatus());
        response.put("items", rfqItems);
        return response;
    }

    @Transactional
    public PurchaseDtos.PurchaseRequisitionResponse duplicate(Long id) {
        PurchaseRequisition source = getEntity(id);
        PurchaseRequisition copy = new PurchaseRequisition();
        copy.setPrNo(numbering.nextPrNo(numbering.maxSequence(
                repository.findAll().stream().map(PurchaseRequisition::getPrNo).toList(), "PR")));
        applyRequest(copy, new PurchaseRequisitionRequestWrapper(
                null, source.getTitle(), source.getPrType(), source.getDepartment(), source.getProject(),
                source.getRequester(), source.getBuyer(), source.getVendor(), source.getCurrency(),
                source.getPriority(), source.getGstType(), source.getIncoterm(), source.getTransportMode(),
                source.getWarehouse(), source.getCostCenter(), source.getLocation(), source.getDeliveryAddress(),
                source.getCompany(), source.getBranch(), LocalDate.now().format(ISO_DATE), source.getExpectedDate(),
                source.getTerms(), source.getDiscount(), source.getCharges(), source.getNotes(), source.getInternalNotes(),
                copyItems(source), STATUS_DRAFT, null));
        copy.setStatus(STATUS_DRAFT);
        copy.setApprovalStatus("Pending");
        recalcTotals(copy);
        PurchaseRequisition saved = repository.save(copy);
        support.log(PurchaseSupportService.DOC_PR, saved.getId(), "create",
                "Requisition duplicated", "Created from " + source.getPrNo() + ".");
        return toResponse(saved);
    }

    // ------------------------------------------------------------------
    // Comments
    // ------------------------------------------------------------------

    @Transactional
    public Map<String, Object> addComment(Long id, String text) {
        PurchaseRequisition pr = getEntity(id);
        Map<String, Object> comment = new LinkedHashMap<>();
        comment.put("id", "cmt-" + System.currentTimeMillis());
        comment.put("author", supportActivityActor());
        comment.put("text", text);
        comment.put("createdAt", LocalDateTime.now().toString());
        List<String> comments = pr.getCommentsJson() == null
                ? new ArrayList<>()
                : new ArrayList<>(pr.getCommentsJson());
        comments.add(support.writeJson(comment));
        pr.setCommentsJson(comments);
        repository.save(pr);
        support.log(PurchaseSupportService.DOC_PR, pr.getId(), "comment",
                "Comment added", text);
        return comment;
    }

    // ------------------------------------------------------------------
    // Attachments
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<PurchaseSupportService.PurchaseActivityEntry> activity(Long id) {
        PurchaseRequisition pr = getEntity(id);
        return support.activity(PurchaseSupportService.DOC_PR, pr.getId());
    }

    @Transactional(readOnly = true)
    public List<PurchaseSupportService.PurchaseAttachmentPayload> attachments(Long id) {
        PurchaseRequisition pr = getEntity(id);
        return support.attachments(PurchaseSupportService.DOC_PR, pr.getId());
    }

    @Transactional
    public PurchaseSupportService.PurchaseAttachmentPayload uploadAttachment(Long id, MultipartFile file) {
        PurchaseRequisition pr = getEntity(id);
        if (file == null || file.isEmpty()) {
            throw new BadRequestException("Attachment file is required");
        }
        String storedName = fileStorageService.store(file);
        PurchaseAttachment attachment = new PurchaseAttachment();
        attachment.setDocType(PurchaseSupportService.DOC_PR);
        attachment.setDocId(pr.getId());
        attachment.setName(file.getOriginalFilename());
        attachment.setStoredName(storedName);
        attachment.setContentType(file.getContentType());
        attachment.setSize(file.getSize());
        attachment.setUrl("/v1/files/" + storedName);
        attachment.setUploadedBy(supportActivityActor());
        attachmentRepository.save(attachment);
        support.log(PurchaseSupportService.DOC_PR, pr.getId(), "attachment",
                "Attachment uploaded", file.getOriginalFilename() == null ? "File" : file.getOriginalFilename());
        return support.attachmentPayload(attachment);
    }

    @Transactional
    public void deleteAttachment(Long id, Long attachmentId) {
        PurchaseAttachment attachment = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new ResourceNotFoundException("Attachment not found with id: " + attachmentId));
        if (!PurchaseSupportService.DOC_PR.equals(attachment.getDocType()) || !attachment.getDocId().equals(id)) {
            throw new ResourceNotFoundException("Attachment not found on this requisition");
        }
        attachmentRepository.delete(attachment);
        support.log(PurchaseSupportService.DOC_PR, id, "attachment",
                "Attachment deleted", attachment.getName());
    }

    // ------------------------------------------------------------------
    // Stats
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Map<String, Object> stats() {
        List<PurchaseRequisition> all = repository.findAll();
        List<PurchaseRequisition> active = all.stream()
                .filter(pr -> PurchaseRequisition.RECORD_ACTIVE.equals(pr.getRecordState()))
                .toList();
        Map<String, Long> byStatus = new LinkedHashMap<>();
        for (String status : List.of(STATUS_DRAFT, STATUS_PENDING, "Approved", STATUS_TECH_REVIEW,
                STATUS_READY_RFQ, STATUS_CONVERTED, STATUS_REJECTED, STATUS_RETURNED, STATUS_PO_RAISED)) {
            byStatus.put(status, active.stream().filter(pr -> status.equals(pr.getStatus())).count());
        }
        BigDecimal value = active.stream()
                .map(PurchaseRequisition::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        Map<String, BigDecimal> byCurrency = new LinkedHashMap<>();
        for (PurchaseRequisition pr : active) {
            String key = pr.getCurrency() == null ? "INR" : pr.getCurrency();
            byCurrency.merge(key, pr.getAmount() == null ? BigDecimal.ZERO : pr.getAmount(), BigDecimal::add);
        }
        Map<String, Object> tabs = new LinkedHashMap<>();
        tabs.put("active", active.size());
        tabs.put("archived", all.stream().filter(pr -> PurchaseRequisition.RECORD_ARCHIVED.equals(pr.getRecordState())).count());

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", (long) active.size());
        stats.put("value", value);
        stats.put("totalValue", value);
        stats.put("byStatus", byStatus);
        stats.put("pendingApproval", byStatus.get(STATUS_PENDING));
        stats.put("approved", byStatus.get("Approved") + byStatus.get(STATUS_TECH_REVIEW) + byStatus.get(STATUS_READY_RFQ));
        stats.put("draft", byStatus.get(STATUS_DRAFT));
        stats.put("rejected", byStatus.get(STATUS_REJECTED));
        stats.put("converted", byStatus.get(STATUS_CONVERTED));
        stats.put("tabs", tabs);
        stats.put("byCurrency", byCurrency);
        return stats;
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private PurchaseRequisition getEntity(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Requisition not found with id: " + id));
    }

    private void applyRequest(PurchaseRequisition pr, PurchaseRequisitionRequestWrapper request) {
        if (request.title() != null) pr.setTitle(request.title());
        pr.setPrType(request.prType());
        pr.setDepartment(request.department());
        pr.setProject(request.project());
        pr.setRequester(request.requester());
        pr.setBuyer(request.buyer());
        pr.setVendor(request.vendor());
        pr.setCurrency(request.currency());
        pr.setPriority(request.priority());
        pr.setGstType(request.gstType());
        pr.setIncoterm(request.incoterm());
        pr.setTransportMode(request.transportMode());
        pr.setWarehouse(request.warehouse());
        pr.setCostCenter(request.costCenter());
        pr.setLocation(request.location());
        pr.setDeliveryAddress(request.deliveryAddress());
        pr.setCompany(request.company());
        pr.setBranch(request.branch());
        pr.setTerms(request.terms());
        pr.setDate(orBlank(request.date()).isBlank() ? LocalDate.now().format(ISO_DATE) : request.date());
        pr.setExpectedDate(request.expectedDate());
        pr.setDiscount(request.discount() == null ? BigDecimal.ZERO : request.discount());
        pr.setCharges(request.charges() == null ? BigDecimal.ZERO : request.charges());
        pr.setNotes(request.notes());
        pr.setInternalNotes(request.internalNotes());

        if (request.items() != null) {
            pr.getItems().clear();
            for (PurchaseDtos.PurchaseItemRequest itemRequest : request.items()) {
                PurchaseRequisitionItem item = new PurchaseRequisitionItem();
                item.setRequisition(pr);
                item.setItemCode(itemRequest.itemCode());
                item.setProduct(itemRequest.product());
                item.setCategory(itemRequest.category());
                item.setHsn(itemRequest.hsn());
                item.setUom(itemRequest.uom());
                item.setQty(itemRequest.qty() == null ? BigDecimal.ZERO : itemRequest.qty());
                item.setRate(itemRequest.rate() == null ? BigDecimal.ZERO : itemRequest.rate());
                item.setDiscount(itemRequest.discount());
                item.setGstRate(itemRequest.gstRate() == null ? BigDecimal.ZERO : itemRequest.gstRate());
                item.setRemarks(itemRequest.remarks());
                item.setSpecification(itemRequest.specification());
                pr.getItems().add(item);
            }
        }
    }

    /**
     * Submission gate. A draft may be stored half-filled (Save Draft), but an
     * incomplete requisition must never enter the approval queue. These are the
     * same requirements the strict create/update path enforces; they are
     * re-checked on the stored record because submit is its own endpoint.
     */
    private void validateBeforeSubmit(PurchaseRequisition pr) {
        if (orBlank(pr.getTitle()).isBlank()) {
            throw new BadRequestException("Title is required");
        }
        if (orBlank(pr.getDepartment()).isBlank()) {
            throw new BadRequestException("Department is required");
        }
        if (orBlank(pr.getRequester()).isBlank()) {
            throw new BadRequestException("Requester is required");
        }
        if (orBlank(pr.getCurrency()).isBlank()) {
            throw new BadRequestException("Currency is required");
        }
        if (orBlank(pr.getPriority()).isBlank()) {
            throw new BadRequestException("Priority is required");
        }
        if (orBlank(pr.getDate()).isBlank()) {
            throw new BadRequestException("Request date is required");
        }
        if (orBlank(pr.getExpectedDate()).isBlank()) {
            throw new BadRequestException("Required date is required");
        }
        if (pr.getItems() == null || pr.getItems().isEmpty()) {
            throw new BadRequestException("At least one requisition item is required");
        }
        for (PurchaseRequisitionItem item : pr.getItems()) {
            if (orBlank(item.getProduct()).isBlank()) {
                throw new BadRequestException("Item description is required");
            }
            if (item.getQty() == null || item.getQty().signum() <= 0) {
                throw new BadRequestException("Item quantity must be positive");
            }
        }
    }

    private void recalcTotals(PurchaseRequisition pr) {
        List<BigDecimal> amounts = new ArrayList<>();
        List<BigDecimal> discounts = new ArrayList<>();
        List<BigDecimal> gstRates = new ArrayList<>();
        for (PurchaseRequisitionItem item : pr.getItems()) {
            amounts.add(item.getQty().multiply(item.getRate()));
            discounts.add(item.getDiscount() == null ? BigDecimal.ZERO : item.getDiscount());
            gstRates.add(item.getGstRate());
        }
        PurchaseTotals.DocumentTotals totals = PurchaseTotals.compute(amounts, discounts, gstRates,
                pr.getDiscount(), pr.getCharges(), pr.getGstType());
        pr.setAmount(totals.total());
    }

    private List<PurchaseDtos.PurchaseItemRequest> copyItems(PurchaseRequisition source) {
        List<PurchaseDtos.PurchaseItemRequest> items = new ArrayList<>();
        for (PurchaseRequisitionItem item : source.getItems()) {
            items.add(new PurchaseDtos.PurchaseItemRequest(
                    item.getItemCode(), item.getProduct(), item.getCategory(), item.getHsn(), item.getUom(),
                    item.getQty(), item.getRate(), item.getDiscount(), item.getGstRate(),
                    item.getRemarks(), item.getSpecification(), null));
        }
        return items;
    }

    private String firstItem(PurchaseRequisition pr, String key) {
        if (pr.getItems().isEmpty()) {
            return "General";
        }
        PurchaseRequisitionItem first = pr.getItems().get(0);
        return "category".equals(key) ? orBlank(first.getCategory()) : "";
    }

    private Map<String, Object> existingReview(PurchaseRequisition pr) {
        Map<String, Object> review = support.jsonToMap(pr.getTechnicalReviewJson());
        return review == null ? new LinkedHashMap<>() : new LinkedHashMap<>(review);
    }

    private String supportActivityActor() {
        return auditContext.currentUserName();
    }

    private String orBlank(String value) {
        return value == null ? "" : value;
    }

    /**
     * Validates a create/update payload.
     *
     * <p>{@code draft} marks a Save Draft / Save & New call. A draft is a
     * work-in-progress document, so only what a record genuinely cannot be
     * stored without is required: a title. It is the {@code title} column's
     * NOT NULL contract and the row's identity in every list. Department,
     * requester, currency, priority, both dates and the line items are
     * submission requirements and stay mandatory on the strict path used by
     * Create Requisition, Submit for Approval, CPR-to-PR conversion and
     * duplicate. Values supplied on a draft are still range-checked, so a
     * draft can never persist corrupt quantities, prices or tax figures.
     */
    private void validateRequest(PurchaseRequisitionRequestWrapper request, boolean draft) {
        if (request == null) {
            throw new BadRequestException("Purchase requisition payload is required");
        }
        if (orBlank(request.title()).isBlank()) {
            throw new BadRequestException(draft ? "Title is required to save a draft" : "Title is required");
        }
        if (!draft) {
            if (orBlank(request.department()).isBlank()) {
                throw new BadRequestException("Department is required");
            }
            if (orBlank(request.requester()).isBlank()) {
                throw new BadRequestException("Requester is required");
            }
            if (orBlank(request.currency()).isBlank()) {
                throw new BadRequestException("Currency is required");
            }
            if (orBlank(request.priority()).isBlank()) {
                throw new BadRequestException("Priority is required");
            }
            if (orBlank(request.date()).isBlank()) {
                throw new BadRequestException("Request date is required");
            }
            if (orBlank(request.expectedDate()).isBlank()) {
                throw new BadRequestException("Required date is required");
            }
            LocalDate requestDate = parseDate(request.date(), "Request date");
            LocalDate requiredDate = parseDate(request.expectedDate(), "Required date");
            if (requiredDate.isBefore(requestDate)) {
                throw new BadRequestException("Required date cannot be before request date");
            }
            if (request.items() == null || request.items().isEmpty()) {
                throw new BadRequestException("At least one requisition item is required");
            }
        } else {
            /* Dates are optional on a draft, but must still be real dates when
               the user has entered one — the column stores yyyy-MM-dd text. */
            if (!orBlank(request.date()).isBlank()) {
                parseDate(request.date(), "Request date");
            }
            if (!orBlank(request.expectedDate()).isBlank()) {
                parseDate(request.expectedDate(), "Required date");
            }
        }
        List<PurchaseDtos.PurchaseItemRequest> items =
                request.items() == null ? List.of() : request.items();
        for (PurchaseDtos.PurchaseItemRequest item : items) {
            if (item == null || orBlank(item.product()).isBlank()) {
                if (!draft) {
                    throw new BadRequestException("Item description is required");
                }
                continue;
            }
            if (item.qty() == null) {
                /* A draft may carry a half-filled row; the column stores 0. */
                if (!draft) {
                    throw new BadRequestException("Item quantity must be positive");
                }
            } else if (item.qty().signum() < 0) {
                throw new BadRequestException("Item quantity cannot be negative");
            } else if (item.qty().signum() == 0 && !draft) {
                throw new BadRequestException("Item quantity must be positive");
            }
            if (item.rate() != null && item.rate().signum() < 0) {
                throw new BadRequestException("Estimated unit price cannot be negative");
            }
            if (item.discount() != null && (item.discount().signum() < 0
                    || item.discount().compareTo(BigDecimal.valueOf(100)) > 0)) {
                throw new BadRequestException("Item discount must be between 0 and 100");
            }
            if (item.gstRate() != null && item.gstRate().signum() < 0) {
                throw new BadRequestException("GST rate cannot be negative");
            }
        }
        if (request.discount() != null
                && (request.discount().signum() < 0
                || request.discount().compareTo(BigDecimal.valueOf(100)) > 0)) {
            throw new BadRequestException("Discount must be between 0 and 100");
        }
        if (request.charges() != null && request.charges().signum() < 0) {
            throw new BadRequestException("Charges cannot be negative");
        }
    }

    private LocalDate parseDate(String value, String label) {
        try {
            return LocalDate.parse(value, ISO_DATE);
        } catch (Exception ex) {
            throw new BadRequestException(label + " must use yyyy-MM-dd format");
        }
    }

    private PurchaseDtos.PurchaseRequisitionResponse toResponse(PurchaseRequisition pr) {
        List<Map<String, Object>> itemMaps = new ArrayList<>();
        for (PurchaseRequisitionItem item : pr.getItems()) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("itemCode", item.getItemCode());
            map.put("product", item.getProduct());
            map.put("category", item.getCategory());
            map.put("hsn", item.getHsn());
            map.put("uom", item.getUom());
            map.put("qty", item.getQty());
            map.put("rate", item.getRate());
            map.put("discount", item.getDiscount());
            map.put("gstRate", item.getGstRate());
            map.put("remarks", item.getRemarks());
            map.put("specification", item.getSpecification());
            itemMaps.add(map);
        }
        Map<String, Object> totalsMap = totalsMapOf(pr);
        return new PurchaseDtos.PurchaseRequisitionResponse(
                pr.getId(), pr.getPrNo(), pr.getTitle(), pr.getPrType(), pr.getDepartment(), pr.getProject(),
                pr.getRequester(), pr.getBuyer(), pr.getVendor(), pr.getCurrency(), pr.getPriority(),
                pr.getGstType(), pr.getIncoterm(), pr.getTransportMode(), pr.getWarehouse(), pr.getCostCenter(),
                pr.getLocation(), pr.getDeliveryAddress(), pr.getCompany(), pr.getBranch(), pr.getDate(),
                pr.getExpectedDate(), pr.getDiscount(), pr.getCharges(), pr.getNotes(), pr.getInternalNotes(),
                pr.getStatus(), pr.getApprovalStatus(), pr.getRecordState(), pr.getApprovedBy(),
                pr.getApprovalDate() == null ? null : pr.getApprovalDate().toString(),
                pr.getApprovalNote(), pr.getRejectedBy(), pr.getRfqNo(), pr.getPoNo(), pr.getAmount(),
                totalsMap, support.jsonToMap(pr.getTechnicalReviewJson()),
                itemMaps,
                attachmentMaps(pr),
                commentsMaps(pr),
                pr.getCreatedAt() == null ? null : pr.getCreatedAt().toString());
    }

    /** Parses each stored comment JSON row into the response comment map. */
    private List<Map<String, Object>> commentsMaps(PurchaseRequisition pr) {
        List<Map<String, Object>> maps = new ArrayList<>();
        if (pr.getCommentsJson() == null) {
            return maps;
        }
        for (String row : pr.getCommentsJson()) {
            Map<String, Object> map = support.jsonToMap(row);
            if (map != null) {
                maps.add(map);
            }
        }
        return maps;
    }

    private List<Map<String, Object>> attachmentMaps(PurchaseRequisition pr) {        List<Map<String, Object>> maps = new ArrayList<>();
        for (PurchaseSupportService.PurchaseAttachmentPayload a :
                support.attachments(PurchaseSupportService.DOC_PR, pr.getId())) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", a.id());
            map.put("name", a.name());
            map.put("size", a.size());
            map.put("type", a.type());
            map.put("downloadUrl", a.downloadUrl());
            map.put("fileUrl", a.fileUrl());
            map.put("uploadedAt", a.uploadedAt());
            map.put("uploadedBy", a.uploadedBy());
            maps.add(map);
        }
        return maps;
    }

    private Map<String, Object> totalsMapOf(PurchaseRequisition pr) {
        List<BigDecimal> amounts = new ArrayList<>();
        List<BigDecimal> discounts = new ArrayList<>();
        List<BigDecimal> gstRates = new ArrayList<>();
        for (PurchaseRequisitionItem item : pr.getItems()) {
            amounts.add(item.getQty().multiply(item.getRate()));
            discounts.add(item.getDiscount() == null ? BigDecimal.ZERO : item.getDiscount());
            gstRates.add(item.getGstRate());
        }
        PurchaseTotals.DocumentTotals totals = PurchaseTotals.compute(amounts, discounts, gstRates,
                pr.getDiscount(), pr.getCharges(), pr.getGstType());
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("subtotal", totals.subtotal());
        map.put("discountAmount", totals.discountAmount());
        map.put("taxable", totals.taxable());
        map.put("cgst", totals.cgst());
        map.put("sgst", totals.sgst());
        map.put("igst", totals.igst());
        map.put("gstTotal", totals.gstTotal());
        map.put("charges", totals.charges());
        map.put("total", totals.total());
        return map;
    }

    /**
     * Request wrapper — the full PR payload accepted by create/update.
     * Kept as its own record so Jackson maps the frontend payload 1:1.
     */
    public record PurchaseRequisitionRequestWrapper(
            String prNo,
            String title,
            String prType,
            String department,
            String project,
            String requester,
            String buyer,
            String vendor,
            String currency,
            String priority,
            String gstType,
            String incoterm,
            String transportMode,
            String warehouse,
            String costCenter,
            String location,
            String deliveryAddress,
            String company,
            String branch,
            String date,
            String expectedDate,
            String terms,
            BigDecimal discount,
            BigDecimal charges,
            String notes,
            String internalNotes,
            List<PurchaseDtos.PurchaseItemRequest> items,
            String status,
            /*
             * True for a Save Draft / Save & New call: the record is stored as
             * a work-in-progress, so only a title is required. Omitted (null)
             * by every other caller, which keeps the full submission rules.
             */
            Boolean draft) {
    }
}
