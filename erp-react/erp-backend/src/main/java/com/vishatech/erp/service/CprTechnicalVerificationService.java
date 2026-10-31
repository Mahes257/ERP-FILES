package com.vishatech.erp.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.vishatech.erp.dto.CostWorkoutAttachment;
import com.vishatech.erp.dto.CostWorkoutCategoryRequest;
import com.vishatech.erp.dto.CostWorkoutItemRequest;
import com.vishatech.erp.dto.CostWorkoutRequest;
import com.vishatech.erp.dto.CostWorkoutResponse;
import com.vishatech.erp.dto.CprItemColumn;
import com.vishatech.erp.purchase.api.PurchaseRequisitionIngressPort;
import com.vishatech.erp.purchase.api.PurchaseRequisitionIngressRequest;
import com.vishatech.erp.purchase.api.PurchaseRequisitionIngressResult;
import com.vishatech.erp.dto.TechnicalVerificationConversionResponse;
import com.vishatech.erp.dto.TechnicalVerificationDocumentResponse;
import com.vishatech.erp.dto.TechnicalVerificationRequest;
import com.vishatech.erp.dto.TechnicalVerificationResponse;
import com.vishatech.erp.entity.Cpr;
import com.vishatech.erp.entity.CprTechnicalVerification;
import com.vishatech.erp.entity.CprTechnicalVerificationDocument;
import com.vishatech.erp.entity.DocumentVisibility;
import com.vishatech.erp.entity.TechnicalVerificationStatus;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.entity.CostWorkout;
import com.vishatech.erp.repository.CostWorkoutRepository;
import com.vishatech.erp.repository.CprRepository;
import com.vishatech.erp.crm.repository.CustomerRepository;
import com.vishatech.erp.repository.CprItemRepository;
import com.vishatech.erp.repository.CprTechnicalVerificationDocumentRepository;
import com.vishatech.erp.repository.CprTechnicalVerificationRepository;
import com.vishatech.erp.entity.CprItem;
import com.vishatech.erp.util.AuditContext;
import com.vishatech.erp.crm.entity.Customer;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Year;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.ArrayList;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@Transactional
public class CprTechnicalVerificationService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private static final com.fasterxml.jackson.databind.ObjectMapper ITEM_ATTACHMENT_JSON =
            new com.fasterxml.jackson.databind.ObjectMapper();

    private final CprTechnicalVerificationRepository tvRepository;
    private final CprTechnicalVerificationDocumentRepository docRepository;
    private final CprRepository cprRepository;
    private final CprItemRepository cprItemRepository;
    private final FileStorageService fileStorageService;
    private final DocumentRepositoryService documentRepositoryService;
    private final CostWorkoutRepository costWorkoutRepository;
    private final CostWorkoutService costWorkoutService;
    private final PurchaseRequisitionIngressPort purchaseRequisitionIngressPort;
    private final CustomerRepository customerRepository;
    private final AuditContext auditContext;
    private final String baseUrl;

    @PersistenceContext
    private EntityManager entityManager;

    public CprTechnicalVerificationService(
            CprTechnicalVerificationRepository tvRepository,
            CprTechnicalVerificationDocumentRepository docRepository,
            CprRepository cprRepository,
            CprItemRepository cprItemRepository,
            FileStorageService fileStorageService,
            DocumentRepositoryService documentRepositoryService,
            CostWorkoutRepository costWorkoutRepository,
            CostWorkoutService costWorkoutService,
            PurchaseRequisitionIngressPort purchaseRequisitionIngressPort,
            CustomerRepository customerRepository,
            AuditContext auditContext,
            @Value("${app.base-url:http://localhost:8080}") String baseUrl) {
        this.tvRepository = tvRepository;
        this.docRepository = docRepository;
        this.cprRepository = cprRepository;
        this.cprItemRepository = cprItemRepository;
        this.fileStorageService = fileStorageService;
        this.documentRepositoryService = documentRepositoryService;
        this.costWorkoutRepository = costWorkoutRepository;
        this.costWorkoutService = costWorkoutService;
        this.purchaseRequisitionIngressPort = purchaseRequisitionIngressPort;
        this.customerRepository = customerRepository;
        this.auditContext = auditContext;
        this.baseUrl = baseUrl;
    }

    // ---------------------------------------------------------------------
    // Document-mirror + PR shims (TARGET adaptation).
    //
    // SOURCE mirrors each verification row into the Documents module via
    // DocumentRepositoryService#syncRecordDocumentQuietly /
    // purgeRecordDocumentsQuietly / changeVisibilityForMirror. TARGET's
    // Documents module is protected here and does not expose those methods, so
    // these no-ops preserve the SOURCE control flow without touching Documents.
    // Attachment registration still uses registerFromAttachment, which exists.
    // ---------------------------------------------------------------------
    private void syncTvDocument(String module, Long recordId, String code, String docType,
                                String docNo, Long cprId, String clientName, String status) {
        // Intentionally no-op — see note above.
    }

    private void purgeTvDocument(Long recordId) {
        // Intentionally no-op — see note above.
    }

    private void changeTvMirrorVisibility(Long recordId, String storedName, String visibility) {
        // Intentionally no-op — see note above.
    }

    // ============================== Read ==============================

    @Transactional(readOnly = true)
    public Page<TechnicalVerificationResponse> list(int page, int size, String search,
                                                     String status, String division, String sort) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort));
        TechnicalVerificationStatus tvStatus = parseStatus(status);
        return tvRepository.findAllFiltered(division, tvStatus, search, pageable).map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public TechnicalVerificationResponse get(Long id) {
        return toResponseDetail(getTv(id));
    }

    @Transactional(readOnly = true)
    public TechnicalVerificationResponse getByCprId(Long cprId) {
        CprTechnicalVerification tv = tvRepository.findFirstByCprId(cprId)
                .orElseThrow(() -> new ResourceNotFoundException("Technical Verification not found for CPR id: " + cprId));
        return toResponseDetail(tv);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> stats(String division) {
        long total, draft, fileAvailable, fileNotFound, underVerification, verified, rejected, forwarded;

        if (division != null && !division.isBlank()) {
            total = tvRepository.countByDivision(division);
            draft = tvRepository.countByDivisionAndStatus(division, TechnicalVerificationStatus.DRAFT);
            fileAvailable = countByDivisionAndFileStatus(division, "AVAILABLE");
            fileNotFound = countByDivisionAndFileStatus(division, "MISSING") + countByDivisionAndFileStatus(division, "PENDING");
            underVerification = tvRepository.countByDivisionAndStatus(division, TechnicalVerificationStatus.UNDER_VERIFICATION);
            verified = tvRepository.countByDivisionAndStatus(division, TechnicalVerificationStatus.APPROVED)
                     + tvRepository.countByDivisionAndStatus(division, TechnicalVerificationStatus.VERIFICATION_COMPLETED);
            rejected = tvRepository.countByDivisionAndStatus(division, TechnicalVerificationStatus.REJECTED);
            forwarded = tvRepository.countByDivisionAndForwardedToCostWorkout(division, true);
        } else {
            total = tvRepository.count();
            draft = tvRepository.countByStatus(TechnicalVerificationStatus.DRAFT);
            fileAvailable = tvRepository.countByFileStatus("AVAILABLE");
            fileNotFound = tvRepository.countByFileStatus("MISSING") + tvRepository.countByFileStatus("PENDING");
            underVerification = tvRepository.countByStatus(TechnicalVerificationStatus.UNDER_VERIFICATION);
            verified = tvRepository.countByStatus(TechnicalVerificationStatus.APPROVED)
                     + tvRepository.countByStatus(TechnicalVerificationStatus.VERIFICATION_COMPLETED);
            rejected = tvRepository.countByStatus(TechnicalVerificationStatus.REJECTED);
            forwarded = tvRepository.countByForwardedToCostWorkout(true);
        }

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", total);
        stats.put("draft", draft);
        stats.put("fileAvailable", fileAvailable);
        stats.put("fileNotFound", fileNotFound);
        stats.put("underVerification", underVerification);
        stats.put("verified", verified);
        stats.put("rejected", rejected);
        stats.put("forwarded", forwarded);
        return stats;
    }

    private long countByDivisionAndFileStatus(String division, String fileStatus) {
        // Use a JPQL query via the repository — fall back to stream if not in repo
        // Since we added countByDivisionAndFileStatus, delegate
        return tvRepository.countByDivisionAndFileStatus(division, fileStatus);
    }

    // ============================== Write ==============================

    public TechnicalVerificationResponse create(TechnicalVerificationRequest request) {
        if (request.cprId() == null) {
            throw new BadRequestException("CPR ID is required");
        }
        Cpr cpr = cprRepository.findById(request.cprId())
                .orElseThrow(() -> new ResourceNotFoundException("CPR not found with id: " + request.cprId()));

        CprTechnicalVerification tv = new CprTechnicalVerification();
        tv.setCpr(cpr);
        // Same number allocator the auto-created item rows use: a bare
        // count()+1 reuses an existing tv_no whenever the auto-carried rows have
        // already consumed numbers ahead of the row count, and the unique key then
        // rejected the whole create with 409.
        tv.setTvNo(nextFreeTvNo());
        tv.setCreatedBy(auditContext.currentUserName());

        // Apply basic fields
        applyRequest(tv, request);

        // Item-level fields
        if (request.cprItemId() != null) {
            tv.setCprItemId(request.cprItemId());
        }
        if (request.itemNo() != null) {
            tv.setItemNo(request.itemNo());
        }
        if (request.division() != null && !request.division().isBlank()) {
            tv.setDivision(request.division().toUpperCase().trim());
        } else {
            tv.setDivision("TEAM");
        }

        // Set file status based on file check
        if (request.fileExists() != null && request.fileExists()) {
            tv.setFileStatus("AVAILABLE");
            tv.setFileExists(true);
        } else {
            tv.setFileStatus("MISSING");
            tv.setFileExists(false);
        }

        // Set initial status
        if (request.status() != null && !request.status().isBlank()) {
            tv.setStatus(parseStatus(request.status()));
        } else {
            tv.setStatus(TechnicalVerificationStatus.DRAFT);
        }

        CprTechnicalVerification saved = tvRepository.save(tv);
        syncTvDocument(
                "CPR Technical Verification", saved.getId(), saved.getTvNo(), "CPR Technical Verification",
                saved.getTvNo(), saved.getCpr().getId(), saved.getCpr().getClientName(), saved.getStatus().name());
        return toResponseDetail(saved);
    }

    public TechnicalVerificationResponse update(Long id, TechnicalVerificationRequest request) {
        CprTechnicalVerification tv = getTv(id);
        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(tv);
        applyRequest(tv, request);

        // Update item-level fields
        if (request.cprItemId() != null) tv.setCprItemId(request.cprItemId());
        if (request.itemNo() != null) tv.setItemNo(request.itemNo());
        if (request.division() != null && !request.division().isBlank()) {
            tv.setDivision(request.division().toUpperCase().trim());
        }
        if (request.fileExists() != null) {
            tv.setFileExists(request.fileExists());
            tv.setFileStatus(request.fileExists() ? "AVAILABLE" : "MISSING");
        }

        if (request.status() != null && !request.status().isBlank()) {
            tv.setStatus(parseStatus(request.status()));
        }
        CprTechnicalVerification saved = tvRepository.save(tv);
        editHistory.recordEdit("cpr-technical-verification", saved.getId(), editBefore, editHistory.snapshot(saved));
        syncTvDocument(
                "CPR Technical Verification", saved.getId(), saved.getTvNo(), "CPR Technical Verification",
                saved.getTvNo(), saved.getCpr().getId(), saved.getCpr().getClientName(), saved.getStatus().name());
        return toResponseDetail(saved);
    }

    public TechnicalVerificationResponse updateStatus(Long id, String status, String remarks) {
        CprTechnicalVerification tv = getTv(id);
        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(tv);
        TechnicalVerificationStatus newStatus = parseStatus(status);
        if (newStatus == null) {
            throw new BadRequestException("Status is required");
        }

        switch (newStatus) {
            case UNDER_VERIFICATION:
                if (tv.getStatus() != TechnicalVerificationStatus.DRAFT
                        && tv.getStatus() != TechnicalVerificationStatus.PENDING_FILE) {
                    throw new BadRequestException("Only file-check records can start verification");
                }
                if (!"AVAILABLE".equalsIgnoreCase(tv.getFileStatus())) {
                    throw new BadRequestException("A technical file must be available before verification can start");
                }
                tv.setStatus(TechnicalVerificationStatus.UNDER_VERIFICATION);
                break;
            case VERIFICATION_COMPLETED:
                if (tv.getStatus() != TechnicalVerificationStatus.UNDER_VERIFICATION) {
                    throw new BadRequestException("Only records under verification can be accepted");
                }
                tv.setStatus(TechnicalVerificationStatus.VERIFICATION_COMPLETED);
                tv.setVerifiedBy(auditContext.currentUserName());
                tv.setVerificationDate(LocalDate.now());
                break;
            case APPROVED:
                tv.setStatus(TechnicalVerificationStatus.APPROVED);
                tv.setApprovedBy(auditContext.currentUserName());
                tv.setVerificationDate(LocalDate.now());
                break;
            case REJECTED:
                if (tv.getStatus() != TechnicalVerificationStatus.UNDER_VERIFICATION) {
                    throw new BadRequestException("Only records under verification can be rejected");
                }
                tv.setStatus(TechnicalVerificationStatus.REJECTED);
                tv.setRejectedBy(auditContext.currentUserName());
                if (remarks != null && !remarks.isBlank()) {
                    tv.setTechnicalRemarks(
                            (tv.getTechnicalRemarks() == null ? "" : tv.getTechnicalRemarks() + "\n\n")
                                    + "Rejection: " + remarks.trim());
                }
                break;
            default:
                tv.setStatus(newStatus);
        }
        CprTechnicalVerification saved = tvRepository.save(tv);
        editHistory.recordEdit("cpr-technical-verification", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponseDetail(saved);
    }

    // ============================== Division ==============================

    public TechnicalVerificationResponse updateDivision(Long id, String division) {
        CprTechnicalVerification tv = getTv(id);
        if (division == null || division.isBlank()) {
            throw new BadRequestException("Division is required");
        }
        String div = division.toUpperCase().trim();
        if (!"TEAM".equals(div) && !"CUSTOMER".equals(div)) {
            throw new BadRequestException("Division must be TEAM or CUSTOMER");
        }
        tv.setDivision(div);
        return toResponseDetail(tvRepository.save(tv));
    }

    // ============================== Forward to Cost Workout ==============================

    public TechnicalVerificationResponse forwardToCostWorkout(Long id, Long costWorkoutId) {
        CprTechnicalVerification tv = getTv(id);
        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(tv);

        if (tv.isForwardedToCostWorkout()) {
            throw new BadRequestException("This record has already been forwarded to Cost Workout " + tv.getCostWorkoutCwNo());
        }

        if (tv.getStatus() != TechnicalVerificationStatus.APPROVED
                && tv.getStatus() != TechnicalVerificationStatus.VERIFICATION_COMPLETED) {
            throw new BadRequestException("Only verified/approved records can be forwarded to Cost Workout");
        }

        CostWorkout cw = costWorkoutRepository.findById(costWorkoutId)
                .orElseThrow(() -> new ResourceNotFoundException("Cost Workout not found with id: " + costWorkoutId));

        tv.setForwardedToCostWorkout(true);
        tv.setForwardedAt(LocalDateTime.now());
        tv.setForwardedBy(auditContext.currentUserName());
        tv.setCostWorkoutId(cw.getId());
        tv.setCostWorkoutCwNo(cw.getCwNo());
        tv.setStatus(TechnicalVerificationStatus.FORWARDED_TO_COST_WORKOUT);

        // Also forward all TEAM-only documents
        for (CprTechnicalVerificationDocument doc : tv.getDocuments()) {
            if (!doc.isSentToCostWorkout()
                    && (doc.getVisibility() == DocumentVisibility.TEAM_ONLY || doc.getVisibility() == DocumentVisibility.BOTH)) {
                doc.setSentToCostWorkout(true);
                doc.setCostWorkoutId(cw.getId());
                doc.setCostWorkoutCwNo(cw.getCwNo());
                doc.setSentAt(LocalDateTime.now());
                doc.setSentBy(auditContext.currentUserName());
            }
        }

        CprTechnicalVerification saved = tvRepository.save(tv);
        editHistory.recordEdit("cpr-technical-verification", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponseDetail(saved);
    }

    // ================= Item-level conversion — Cost Workout / Purchase Requisition =================
    //
    // One verification row covers exactly ONE CPR item (cprItemId). Converting it
    // therefore creates a destination carrying ONLY that item — the sibling items
    // of the same CPR are never touched.
    //
    // The backend is authoritative: the caller passes nothing but the verification
    // row id, and every destination field is read here from the real CPR item, the
    // real CPR header and the verification row itself. A destination is never
    // assembled by the frontend.
    //
    // Each destination is tracked independently on the verification row, so the
    // same item can be converted to BOTH a Cost Workout and a Purchase Requisition
    // without either conversion disturbing the other.

    /**
     * Converts the single CPR item behind this verification row into a NEW Cost Workout.
     *
     * Idempotent: a row already converted returns its existing Cost Workout instead
     * of raising a second one, so a double submission can never produce a duplicate.
     */
    public TechnicalVerificationConversionResponse convertItemToCostWorkout(Long id) {
        CprTechnicalVerification tv = getTv(id);
        requireConvertible(tv);

        if (tv.isForwardedToCostWorkout() && tv.getCostWorkoutId() != null) {
            return new TechnicalVerificationConversionResponse(tv.getId(), tv.getTvNo(), "CW",
                    tv.getCostWorkoutId(), tv.getCostWorkoutCwNo(), true, 1,
                    "Item " + displayItemNo(tv) + " was already converted to Cost Workout "
                            + tv.getCostWorkoutCwNo() + " — opening the existing record instead of creating a duplicate.");
        }

        ConversionSource source = resolveConversionSource(tv);
        CostWorkoutResponse cw = costWorkoutService.create(costWorkoutRequestFromTvItem(tv, source), false);

        tv.setForwardedToCostWorkout(true);
        tv.setForwardedAt(LocalDateTime.now());
        tv.setForwardedBy(auditContext.currentUserName());
        tv.setCostWorkoutId(cw.id());
        tv.setCostWorkoutCwNo(cw.cwNo());
        tv.setStatus(TechnicalVerificationStatus.FORWARDED_TO_COST_WORKOUT);
        forwardTeamDocumentsToCostWorkout(tv, cw.id(), cw.cwNo());
        tvRepository.save(tv);

        return new TechnicalVerificationConversionResponse(tv.getId(), tv.getTvNo(), "CW",
                cw.id(), cw.cwNo(), false, 1,
                "Converted item " + displayItemNo(tv) + " to Cost Workout " + cw.cwNo() + ".");
    }

    /**
     * Converts the single CPR item behind this verification row into a NEW Purchase
     * Requisition.
     *
     * Idempotent in exactly the same way as the Cost Workout path.
     */
    public TechnicalVerificationConversionResponse convertItemToPurchaseRequisition(Long id) {
        CprTechnicalVerification tv = getTv(id);
        requireConvertible(tv);

        if (tv.isForwardedToPurchaseRequisition() && tv.getPurchaseRequisitionId() != null) {
            return new TechnicalVerificationConversionResponse(tv.getId(), tv.getTvNo(), "PR",
                    tv.getPurchaseRequisitionId(), tv.getPurchaseRequisitionPrNo(), true, 1,
                    "Item " + displayItemNo(tv) + " was already converted to Purchase Requisition "
                            + tv.getPurchaseRequisitionPrNo() + " — opening the existing record instead of creating a duplicate.");
        }

        ConversionSource source = resolveConversionSource(tv);
        PurchaseRequisitionIngressResult pr = purchaseRequisitionIngressPort
                .createRequisition(purchaseRequisitionIngressRequest(tv, source));

        tv.setForwardedToPurchaseRequisition(true);
        tv.setForwardedToPrAt(LocalDateTime.now());
        tv.setForwardedToPrBy(auditContext.currentUserName());
        tv.setPurchaseRequisitionId(pr.requisitionId());
        tv.setPurchaseRequisitionPrNo(pr.prNo());
        // Only move the row's status when the Cost Workout destination has not
        // already claimed it — the CW destination stays visible on the row.
        if (!tv.isForwardedToCostWorkout()) {
            tv.setStatus(TechnicalVerificationStatus.FORWARDED_TO_PURCHASE_REQUISITION);
        }
        tvRepository.save(tv);

        return new TechnicalVerificationConversionResponse(tv.getId(), tv.getTvNo(), "PR",
                pr.requisitionId(), pr.prNo(), false, 1,
                "Converted item " + displayItemNo(tv) + " to Purchase Requisition " + pr.prNo() + ".");
    }

    /** A row must be a verified, item-backed record before it can be converted. */
    private void requireConvertible(CprTechnicalVerification tv) {
        if (tv.getCpr() == null) {
            throw new BadRequestException("This verification row has no CPR — it cannot be converted.");
        }
        if (tv.getStatus() == TechnicalVerificationStatus.REJECTED) {
            throw new BadRequestException("A rejected verification cannot be converted.");
        }
    }

    /** The real CPR header + the exact CPR item this verification row covers. */
    private record ConversionSource(Cpr cpr, CprItem item) {
    }

    /**
     * Loads the real source records for a conversion.
     *
     * Prefers the row's own {@code cprItemId}. When a legacy row has none, the item
     * is recovered by drawing number, and a single-item CPR falls back to its only
     * item. Anything ambiguous is refused rather than guessed, so the wrong item can
     * never be converted silently.
     */
    private ConversionSource resolveConversionSource(CprTechnicalVerification tv) {
        Cpr cpr = cprRepository.findById(tv.getCpr().getId())
                .orElseThrow(() -> new ResourceNotFoundException("CPR not found with id: " + tv.getCpr().getId()));

        CprItem item = null;
        if (tv.getCprItemId() != null) {
            item = cprItemRepository.findById(tv.getCprItemId()).orElse(null);
        }
        if (item == null && tv.getDrawingNumber() != null && !tv.getDrawingNumber().isBlank()) {
            String drawing = tv.getDrawingNumber().trim();
            item = cpr.getItems().stream()
                    .filter(i -> drawing.equalsIgnoreCase(i.getDrawingNo() == null ? "" : i.getDrawingNo().trim()))
                    .findFirst()
                    .orElse(null);
        }
        if (item == null && cpr.getItems().size() == 1) {
            item = cpr.getItems().get(0);
        }
        if (item == null) {
            throw new BadRequestException("The CPR item behind verification " + tv.getTvNo()
                    + " could not be identified — open the CPR and re-verify this item before converting it.");
        }
        return new ConversionSource(cpr, item);
    }

    /**
     * Cost Workout request built from ONE verified item.
     *
     * Mirrors the CPR form's item-level CW button so a conversion made here lands
     * in exactly the same shape as one made from the CPR: the drawing number is
     * folded into the item description, the CPR's own estimated cost seeds the
     * Material Cost category (a derived value, never an invented one) and the
     * item's own attachments travel with it.
     */
    private CostWorkoutRequest costWorkoutRequestFromTvItem(CprTechnicalVerification tv, ConversionSource source) {
        Cpr cpr = source.cpr();
        CprItem item = source.item();

        String description = foldDescription(item.getDrawingNo(), item.getDescription(), tv.getItemDescription());
        if (description == null || description.isBlank()) {
            throw new BadRequestException("Item " + displayItemNo(tv)
                    + " has no description to cost — add one on the CPR item before converting it.");
        }
        BigDecimal qty = item.getQty() == null ? BigDecimal.ONE : item.getQty();
        String unit = firstNonBlank(item.getUnit(), "Nos");
        BigDecimal estimatedCost = item.getEstimatedCost() == null ? BigDecimal.ZERO : item.getEstimatedCost();

        // The Cost Workout item is born with the SAME single "Material Cost" row the
        // CW form creates for a new item — never with no breakdown at all. Gating the
        // row on a positive estimated cost dropped the CPR's specification / remarks
        // (they ride in the row's notes) whenever the CPR had no cost estimate yet, so
        // a converted item opened with an empty cost breakdown. The rate stays the
        // CPR's own estimate (0 when it has none) and nothing is invented.
        List<CostWorkoutCategoryRequest> categories = new ArrayList<>();
        categories.add(new CostWorkoutCategoryRequest(
                "Material Cost",
                BigDecimal.ONE,
                unit,
                estimatedCost,
                firstNonBlank(item.getSpecification(), item.getRemarks(), tv.getTechnicalRemarks())));

        List<CostWorkoutItemRequest> items = List.of(new CostWorkoutItemRequest(
                description,
                // The CPR's own item description — a direct, unambiguous copy — seeds
                // the brief CPR Description. The folded CW description above stays
                // the full costing description and is never replaced by it.
                item.getDescription(),
                qty, unit, categories, parseCustomFields(item.getCustomFieldsJson()),
                // The CPR item's own files are not item attachments of the Cost
                // Workout; only a supported document relationship is carried, and
                // the conversion forwards none. null = not supplied.
                null));

        return new CostWorkoutRequest(
                null,
                LocalDate.now().format(DATE_FMT),
                null,
                firstNonBlank(cpr.getRequestedBy(), auditContext.currentUserName()),
                cpr.getContactPerson(),
                firstNonBlank(cpr.getDepartment(), "Sales"),
                firstNonBlank(cpr.getSourceLead(), cpr.getClientName(), cpr.getCompany()),
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
                buildConversionRemarks(tv, cpr),
                cpr.getProfitPercent(),
                null,
                null,
                items,
                parseItemAttachments(item.getAttachmentsJson()),
                cpr.getItemColumnsJson());
    }

    /**
     * Purchase Requisition ingress request built from ONE verified item.
     *
     * <p>This builds nothing but the value contract Purchase publishes for the
     * job ({@link PurchaseRequisitionIngressRequest}): the requisition record, its
     * numbering, its internal payload and its validation all stay Purchase-side,
     * behind the ingress port.
     */
    private PurchaseRequisitionIngressRequest purchaseRequisitionIngressRequest(
                                                                           CprTechnicalVerification tv,
                                                                           ConversionSource source) {
        Cpr cpr = source.cpr();
        CprItem item = source.item();

        String description = firstNonBlank(item.getDescription(), tv.getItemDescription());
        if (description == null || description.isBlank()) {
            description = tv.getItemDescription();
        }
        Map<String, String> customFields = parseCustomFields(item.getCustomFieldsJson());
        String material = materialFromCustomColumns(cpr, customFields);
        LocalDate today = LocalDate.now();
        String requestDate = today.format(DATE_FMT);
        String requiredDate = requisitionRequiredDate(cpr, today);

        // Purchase owns the Purchase Requisition record (its own entity, fields and
        // workflow); a CPR item is converted by mapping the CPR / verification data
        // onto the ingress contract Purchase publishes, never onto its internals.
        PurchaseRequisitionIngressRequest.Line line = new PurchaseRequisitionIngressRequest.Line(
                firstNonBlank(tv.getItemNo(), item.getDrawingNo()),
                firstNonBlank(description, "Item"),
                firstNonBlank(item.getUnit(), "Nos"),
                item.getQty() == null ? BigDecimal.ONE : item.getQty(),
                firstNonBlank(tv.getTechnicalRemarks(), item.getRemarks()),
                firstNonBlank(item.getSpecification(), material),
                requiredDate);

        return new PurchaseRequisitionIngressRequest(
                firstNonBlank(description, "CPR item"),
                "CPR",
                firstNonBlank(cpr.getDepartment(), "Sales"),
                firstNonBlank(cpr.getCompany(), cpr.getClientName()),
                firstNonBlank(cpr.getRequestedBy(), auditContext.currentUserName()),
                // The Purchase Requisition service REJECTS a request without a
                // currency ("Currency is required"), so the conversion resolves the
                // CPR client's real currency — the same rule QuotationService uses
                // when it converts a CPR — and mirrors the Purchase module's own
                // "INR" default only when the client genuinely has none configured.
                resolveClientCurrency(cpr.getClientId()),
                // The PR service also requires a priority; the Purchase module's own
                // form defaults to "Medium", so a CPR saved without one converts with
                // the same default instead of being refused.
                firstNonBlank(cpr.getPriority(), "Medium"),
                cpr.getShippingAddress(),
                cpr.getCompany(),
                requestDate,
                requiredDate,
                buildConversionRemarks(tv, cpr),
                "CPR " + cpr.getPrNo() + " / TV " + tv.getTvNo(),
                List.of(line));
    }

    /**
     * Required date for the Purchase Requisition raised from a CPR item.
     *
     * Purchase validates that a requisition's required date exists and is not
     * earlier than its request date ("Required date is required" / "Required date
     * cannot be before request date"). This conversion raises the requisition
     * today, so a CPR whose deadline has already passed — or that has no deadline
     * at all — used to fail the whole conversion with a 400. In that case the
     * requisition is due on its own request date, the earliest date Purchase
     * accepts; a CPR deadline that is still ahead is carried over unchanged.
     */
    private String requisitionRequiredDate(Cpr cpr, LocalDate requestDate) {
        LocalDate required = cpr.getRequiredDate() == null ? null : cpr.getRequiredDate().toLocalDate();
        if (required == null || required.isBefore(requestDate)) {
            return requestDate.format(DATE_FMT);
        }
        return required.format(DATE_FMT);
    }

    /**
     * The currency of the PR created for a converted CPR item must be the ACTUAL
     * currency configured on that CPR's client — never a hardcoded value — so a USD /
     * EUR / GBP client's requisition is not raised in INR. Same rule (and same
     * fallback) the Sales conversions already apply to a CPR by resolving the linked
     * Customer; the PR service requires a currency, so this is what makes the
     * item-level PR conversion valid.
     */
    private String resolveClientCurrency(Long clientId) {
        if (clientId == null) {
            return "INR";
        }
        return customerRepository.findById(clientId)
                .map(com.vishatech.erp.crm.entity.Customer::getCurrency)
                .filter(currency -> currency != null && !currency.isBlank())
                .map(currency -> currency.trim().toUpperCase())
                .orElse("INR");
    }

    /**
     * "SKU &lt;drawing&gt; — &lt;description&gt;" when a drawing number exists.
     *
     * The Cost Workout item has no drawing column, so folding it into the
     * description is how the existing CPR item-level CW button keeps the drawing
     * with the item; the PR keeps the drawing in its own column instead and does not
     * call this.
     */
    private String foldDescription(String drawingNo, String description, String fallback) {
        String body = firstNonBlank(description, fallback);
        if (drawingNo == null || drawingNo.isBlank()) {
            return body;
        }
        return body == null || body.isBlank()
                ? "SKU " + drawingNo
                : "SKU " + drawingNo + " — " + body;
    }

    /**
     * The value of the source's "Material" column when the CPR defines one.
     *
     * Custom column definitions live on the CPR (id + label); the per-row values
     * live on the item keyed by column id. The whole custom value map is carried to
     * the destination anyway — this only promotes Material onto the destination's
     * own first-class column so it is visible without opening the custom grid.
     */
    private String materialFromCustomColumns(Cpr cpr, Map<String, String> customFields) {
        if (customFields == null || customFields.isEmpty()) {
            return null;
        }
        String itemColumnsJson = cpr.getItemColumnsJson();
        if (itemColumnsJson == null || itemColumnsJson.isBlank()) {
            return null;
        }
        try {
            List<CprItemColumn> columns = ITEM_ATTACHMENT_JSON.readValue(
                    itemColumnsJson, new TypeReference<List<CprItemColumn>>() {
                    });
            for (CprItemColumn column : columns) {
                if (column == null || column.id() == null) {
                    continue;
                }
                String label = column.label() == null ? "" : column.label().toLowerCase();
                String key = column.key() == null ? "" : column.key().toLowerCase();
                if (label.contains("material") || key.contains("material")) {
                    String value = customFields.get(column.id());
                    if (value != null && !value.isBlank()) {
                        return value.trim();
                    }
                }
            }
        } catch (Exception ignored) {
            // A malformed column definition must never block a conversion.
        }
        return null;
    }

    /**
     * Provenance note carried into the destination's Remarks, so the destination
     * record states which verification row it came from without inventing a field.
     */
    private String buildConversionRemarks(CprTechnicalVerification tv, Cpr cpr) {
        StringBuilder note = new StringBuilder("Raised from ").append(cpr.getPrNo() == null ? "CPR" : cpr.getPrNo());
        if (tv.getTvNo() != null && !tv.getTvNo().isBlank()) {
            note.append(" / ").append(tv.getTvNo());
        }
        if (tv.getItemNo() != null && !tv.getItemNo().isBlank()) {
            note.append(" / item ").append(tv.getItemNo());
        }
        note.append(" by ").append(auditContext.currentUserName()).append('.');
        return note.toString();
    }

    /** Marks the row's TEAM/BOTH documents as sent to the Cost Workout it now links to. */
    private void forwardTeamDocumentsToCostWorkout(CprTechnicalVerification tv, Long cwId, String cwNo) {
        for (CprTechnicalVerificationDocument doc : tv.getDocuments()) {
            if (!doc.isSentToCostWorkout()
                    && (doc.getVisibility() == DocumentVisibility.TEAM_ONLY
                    || doc.getVisibility() == DocumentVisibility.BOTH)) {
                doc.setSentToCostWorkout(true);
                doc.setCostWorkoutId(cwId);
                doc.setCostWorkoutCwNo(cwNo);
                doc.setSentAt(LocalDateTime.now());
                doc.setSentBy(auditContext.currentUserName());
            }
        }
    }

    private String displayItemNo(CprTechnicalVerification tv) {
        return firstNonBlank(tv.getItemNo(), tv.getDrawingNumber(), tv.getTvNo());
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    public void delete(Long id) {
        CprTechnicalVerification tv = getTv(id);
        purgeTvDocument(id);
        tvRepository.delete(tv);
    }

    // ============================== Documents ==============================

    public TechnicalVerificationDocumentResponse addDocument(Long id, MultipartFile file, String visibilityStr) {
        CprTechnicalVerification tv = getTv(id);
        int documentCountBefore = tv.getDocuments().size();
        String storedName = fileStorageService.store(file);

        DocumentVisibility visibility = DocumentVisibility.TEAM_ONLY;
        if (visibilityStr != null && !visibilityStr.isBlank()) {
            try {
                visibility = DocumentVisibility.valueOf(visibilityStr.toUpperCase());
            } catch (IllegalArgumentException ignored) {
            }
        }

        CprTechnicalVerificationDocument doc = new CprTechnicalVerificationDocument();
        doc.setTechnicalVerification(tv);
        doc.setName(file.getOriginalFilename());
        doc.setStoredName(storedName);
        doc.setContentType(file.getContentType());
        doc.setSize(file.getSize());
        doc.setUrl(baseUrl + "/v1/files/" + storedName);
        doc.setVisibility(visibility);
        doc.setDocumentCategory(categoryFor(visibility));
        doc.setUploadedBy(auditContext.currentUserName());

        docRepository.save(doc);
        recordDocumentEdit(tv, documentCountBefore, documentCountBefore + 1);

        // An uploaded verification document IS the technical file this row's
        // file check looks for — checkFileExists() already reports AVAILABLE as
        // soon as the row owns a document. Keep the stored flag in sync with
        // that same rule, otherwise a row whose CPR item carried no file stays
        // stuck on MISSING and can never start verification, even though the
        // page's own "Add Drawing" action (and the gate itself) exists exactly
        // for that situation.
        if (!Boolean.TRUE.equals(tv.getFileExists())) {
            tv.setFileExists(true);
        }
        if (!"AVAILABLE".equalsIgnoreCase(tv.getFileStatus())) {
            tv.setFileStatus("AVAILABLE");
        }
        tvRepository.save(tv);

        // Auto-register in centralized document repository (best-effort)
        try {
            String docUrl = baseUrl + "/v1/files/" + storedName;
            documentRepositoryService.registerFromAttachment(
                    file.getOriginalFilename(), "CPR Technical Verification", id,
                    tv.getTvNo(), tv.getCpr().getId(), tv.getCpr().getClientName(),
                    docUrl,
                    file.getContentType(), file.getSize(),
                    auditContext.currentUserName(), visibility);
        } catch (Exception ignored) {
            // Document repository registration failure must not block TV document upload
        }

        return documentResponse(doc);
    }

    public TechnicalVerificationDocumentResponse sendToCostWorkout(Long tvId, Long documentId, Long costWorkoutId) {
        CprTechnicalVerification tv = getTv(tvId);
        CprTechnicalVerificationDocument doc = tv.getDocuments().stream()
                .filter(d -> d.getId().equals(documentId))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Document not found with id: " + documentId));

        CostWorkout cw = costWorkoutRepository.findById(costWorkoutId)
                .orElseThrow(() -> new ResourceNotFoundException("Cost Workout not found with id: " + costWorkoutId));

        doc.setSentToCostWorkout(true);
        doc.setCostWorkoutId(cw.getId());
        doc.setCostWorkoutCwNo(cw.getCwNo());
        doc.setSentAt(LocalDateTime.now());
        doc.setSentBy(auditContext.currentUserName());
        tvRepository.save(tv);

        return documentResponse(doc);
    }

    public void updateDocumentVisibility(Long id, Long documentId, String visibilityStr) {
        CprTechnicalVerification tv = getTv(id);
        CprTechnicalVerificationDocument doc = tv.getDocuments().stream()
                .filter(d -> d.getId().equals(documentId))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Document not found with id: " + documentId));

        if (visibilityStr == null || visibilityStr.isBlank()) {
            throw new BadRequestException("Visibility is required");
        }
        DocumentVisibility next;
        try {
            next = DocumentVisibility.valueOf(visibilityStr.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid visibility value: " + visibilityStr);
        }

        // Sync the mirrored document_repository row first: changeVisibility
        // enforces the caller's permission (403) and writes the document audit
        // trail. Registration is best-effort at upload time, so a missing
        // mirror must not block the TV-level update (legacy behaviour).
        changeTvMirrorVisibility(id, doc.getStoredName(), next.name());

        if (doc.getVisibility() != next) {
            doc.setVisibility(next);
            doc.setDocumentCategory(categoryFor(next));
            tvRepository.save(tv);
        }
    }

    /**
     * Document-category derivation for CPR-TV documents: CUSTOMER exposure
     * only for CUSTOMER/BOTH; every other value (including the four new
     * team/admin restrictions) is internal TEAM scope.
     */
    private static String categoryFor(DocumentVisibility visibility) {
        return (visibility == DocumentVisibility.CUSTOMER || visibility == DocumentVisibility.BOTH)
                ? "CUSTOMER" : "TEAM";
    }

    public void deleteDocument(Long id, Long documentId) {
        CprTechnicalVerification tv = getTv(id);
        CprTechnicalVerificationDocument doc = tv.getDocuments().stream()
                .filter(d -> d.getId().equals(documentId))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Document not found with id: " + documentId));
        tv.getDocuments().remove(doc);

        // Mirror image of addDocument(): once the last document is gone (and the
        // CPR item itself holds no file) the technical file is no longer
        // available, so the row goes back to MISSING instead of keeping a stale
        // AVAILABLE flag.
        if (tv.getDocuments().isEmpty()) {
            boolean itemHasFile = tv.getCpr().getItems().stream()
                    .filter(item -> item.getId().equals(tv.getCprItemId()))
                    .findFirst()
                    .map(item -> item.getFileName() != null && !item.getFileName().isBlank())
                    .orElse(false);
            if (!itemHasFile) {
                tv.setFileExists(false);
                tv.setFileStatus("MISSING");
            }
        }

        tvRepository.save(tv);
        recordDocumentEdit(tv, tv.getDocuments().size() + 1, tv.getDocuments().size());
    }

    private void recordDocumentEdit(CprTechnicalVerification tv, int beforeCount, int afterCount) {
        if (beforeCount == afterCount) {
            return;
        }
        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> before = Map.of("verificationDocuments", String.valueOf(beforeCount));
        Map<String, String> after = Map.of("verificationDocuments", String.valueOf(afterCount));
        editHistory.recordEdit("cpr-technical-verification", tv.getId(), before, after);
    }

    @Transactional(readOnly = true)
    public List<TechnicalVerificationDocumentResponse> getDocuments(Long id, String forRole) {
        CprTechnicalVerification tv = getTv(id);
        return tv.getDocuments().stream()
                .filter(doc -> {
                    if (forRole == null || "team".equalsIgnoreCase(forRole)) return true;
                    // Customer-facing exposure: ONLY customer-visible documents.
                    // Previously any non-TEAM_ONLY value leaked — now the four
                    // new internal values stay team-side as well.
                    DocumentVisibility vis = doc.getVisibility();
                    return vis == DocumentVisibility.CUSTOMER || vis == DocumentVisibility.BOTH;
                })
                .map(this::documentResponse)
                .collect(Collectors.toList());
    }

    // ============================== File Existence Check ==============================

    @Transactional(readOnly = true)
    public Map<String, Object> checkFileExists(Long cprId, String drawingNumber) {
        Cpr cpr = cprRepository.findById(cprId)
                .orElseThrow(() -> new ResourceNotFoundException("CPR not found with id: " + cprId));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("drawingNumber", drawingNumber);
        result.put("cprId", cprId);
        result.put("cprPrNo", cpr.getPrNo());

        // Step 1: Check if the drawing number matches any CPR item
        CprItem matchingItem = cpr.getItems().stream()
                .filter(item -> drawingNumber.equalsIgnoreCase(item.getDrawingNo()))
                .findFirst().orElse(null);

        if (matchingItem == null) {
            result.put("fileExists", false);
            result.put("status", "MISSING");
            result.put("message", "No CPR item found with drawing number: " + drawingNumber);
            return result;
        }

        result.put("itemId", matchingItem.getId());
        result.put("itemNo", matchingItem.getDrawingNo());
        result.put("itemDescription", matchingItem.getDescription());

        // Step 2: Check if the CPR item has a file attached
        boolean itemHasFile = matchingItem.getFileName() != null && !matchingItem.getFileName().isBlank();

        // Step 3: Check if any TV document has been uploaded for this drawing number
        CprTechnicalVerification tv = tvRepository.findFirstByCprId(cprId).orElse(null);
        boolean tvHasDocument = false;
        CprTechnicalVerificationDocument foundTvDoc = null;
        if (tv != null) {
            foundTvDoc = tv.getDocuments().stream().findFirst().orElse(null);
            tvHasDocument = drawingNumber.equalsIgnoreCase(tv.getDrawingNumber()) && !tv.getDocuments().isEmpty();
        }

        boolean fileAvailable = itemHasFile || tvHasDocument;
        result.put("fileExists", fileAvailable);
        result.put("status", fileAvailable ? "AVAILABLE" : "MISSING");

        if (itemHasFile) {
            result.put("itemFileName", matchingItem.getFileName());
            result.put("itemFileSize", matchingItem.getFileSize());
            result.put("itemFileType", matchingItem.getFileType());
        }
        if (tvHasDocument && foundTvDoc != null) {
            result.put("fileId", foundTvDoc.getId());
            result.put("fileName", foundTvDoc.getName());
            result.put("fileUrl", foundTvDoc.getUrl());
        }

        return result;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getCprItems(Long cprId) {
        Cpr cpr = cprRepository.findById(cprId)
                .orElseThrow(() -> new ResourceNotFoundException("CPR not found with id: " + cprId));

        return cpr.getItems().stream().map(item -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", item.getId());
            map.put("cprId", cprId);
            map.put("drawingNo", item.getDrawingNo());
            map.put("description", item.getDescription());
            map.put("specification", item.getSpecification());
            map.put("qty", item.getQty());
            map.put("unit", item.getUnit());
            map.put("estimatedCost", item.getEstimatedCost());
            map.put("fileName", item.getFileName());
            map.put("fileSize", item.getFileSize());
            map.put("fileType", item.getFileType());
            // User-defined custom column values ({columnId: value}) so TV/下游
            // consumers keep access to the full item data.
            map.put("customFields", parseCustomFields(item.getCustomFieldsJson()));
            map.put("hasFile", item.getFileName() != null && !item.getFileName().isBlank());
            // Per-item attachments (preserve original filename + content). These
            // belong ONLY to this exact CPR item / drawing number.
            map.put("attachments", parseItemAttachments(item.getAttachmentsJson()));
            map.put("hasAttachments", !parseItemAttachments(item.getAttachmentsJson()).isEmpty());
            return map;
        }).collect(Collectors.toList());
    }

    /**
     * Carries every CPR item into Technical Verification individually.
     *
     * For each item belonging to the CPR a single stable CprTechnicalVerification
     * row is guaranteed (referencing cprItemId). Missing rows are auto-created
     * with the item's real drawing no / description so the page can render all
     * items without any manual dropdown selection. Existing rows are returned
     * untouched so per-item verification status persists across reloads.
     */
    @Transactional
    public List<TechnicalVerificationResponse> listItemsByCpr(Long cprId, String division) {
        Cpr cpr = cprRepository.findById(cprId)
                .orElseThrow(() -> new ResourceNotFoundException("CPR not found with id: " + cprId));

        String div = (division == null || division.isBlank()) ? "TEAM" : division.toUpperCase().trim();

        for (CprItem item : cpr.getItems()) {
            CprTechnicalVerification existing = tvRepository.findAllByCprIdOrderByIdAsc(cprId).stream()
                    .filter(tv -> item.getId().equals(tv.getCprItemId()))
                    .findFirst().orElse(null);
            if (existing != null) {
                // Never overwrite verification data that may already exist.
                continue;
            }

            CprTechnicalVerification tv = new CprTechnicalVerification();
            tv.setCpr(cpr);
            tv.setTvNo(nextFreeTvNo());
            tv.setCreatedBy(auditContext.currentUserName());
            tv.setCprItemId(item.getId());
            tv.setItemNo(item.getDrawingNo());
            tv.setDrawingNumber(item.getDrawingNo());
            tv.setItemDescription(item.getDescription());
            tv.setDivision(div);
            boolean itemHasFile = item.getFileName() != null && !item.getFileName().isBlank()
                    || (item.getAttachmentsJson() != null && !item.getAttachmentsJson().isBlank());
            tv.setFileExists(itemHasFile);
            tv.setFileStatus(itemHasFile ? "AVAILABLE" : "MISSING");
            tv.setStatus(TechnicalVerificationStatus.DRAFT);
            tvRepository.save(tv);
        }

        return tvRepository.findAllByCprIdOrderByIdAsc(cprId).stream()
                .map(this::toResponseDetail)
                .collect(Collectors.toList());
    }

    /** Parse the per-CPR-item attachment JSON (same payload shape as CW attachments). */
    /** One item's user-defined custom column values ({columnId: value}). */
    private java.util.Map<String, String> parseCustomFields(String json) {
        if (json == null || json.isBlank()) {
            return new java.util.LinkedHashMap<>();
        }
        try {
            java.util.Map<String, String> map = ITEM_ATTACHMENT_JSON.readValue(json,
                    new com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String, String>>() {});
            return map == null ? new java.util.LinkedHashMap<>() : map;
        } catch (Exception e) {
            return new java.util.LinkedHashMap<>();
        }
    }

    private List<CostWorkoutAttachment> parseItemAttachments(String json) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            List<CostWorkoutAttachment> list = ITEM_ATTACHMENT_JSON.readValue(
                    json, new com.fasterxml.jackson.core.type.TypeReference<List<CostWorkoutAttachment>>() {});
            return list == null ? new ArrayList<>() : list;
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    // ============================== Mapping ==============================

    private void applyRequest(CprTechnicalVerification tv, TechnicalVerificationRequest request) {
        if (request.verifiedBy() != null) tv.setVerifiedBy(request.verifiedBy());
        if (request.drawingNumber() != null) tv.setDrawingNumber(request.drawingNumber());
        if (request.itemDescription() != null) tv.setItemDescription(request.itemDescription());
        if (request.fileExists() != null) tv.setFileExists(request.fileExists());
        if (request.verificationDate() != null && !request.verificationDate().isBlank()) {
            tv.setVerificationDate(LocalDate.parse(request.verificationDate()));
        }
        if (request.nextReviewDate() != null && !request.nextReviewDate().isBlank()) {
            tv.setNextReviewDate(LocalDate.parse(request.nextReviewDate()));
        }
        if (request.technicalRemarks() != null) tv.setTechnicalRemarks(request.technicalRemarks());
        if (request.internalRemarks() != null) tv.setInternalRemarks(request.internalRemarks());
        if (request.customerRemarks() != null) tv.setCustomerRemarks(request.customerRemarks());
    }

    private TechnicalVerificationResponse toResponse(CprTechnicalVerification tv) {
        return toResponse(tv, List.of());
    }

    private TechnicalVerificationResponse toResponseDetail(CprTechnicalVerification tv) {
        return toResponse(tv, tv.getDocuments().stream().map(this::documentResponse).toList());
    }

    private TechnicalVerificationResponse toResponse(CprTechnicalVerification tv,
                                                      List<TechnicalVerificationDocumentResponse> docs) {
        Cpr cpr = tv.getCpr();
        return new TechnicalVerificationResponse(
                tv.getId(),
                cpr.getId(),
                tv.getTvNo(),
                tv.getStatus() == null ? null : tv.getStatus().name(),
                tv.getDrawingNumber(),
                tv.getItemDescription(),
                tv.getFileExists() != null ? tv.getFileExists() : false,
                tv.getVerifiedBy(),
                tv.getVerificationDate() == null ? null : tv.getVerificationDate().toString(),
                tv.getNextReviewDate() == null ? null : tv.getNextReviewDate().toString(),
                tv.getTechnicalRemarks(),
                tv.getInternalRemarks(),
                tv.getCustomerRemarks(),
                tv.getCreatedBy(),
                tv.getApprovedBy(),
                tv.getRejectedBy(),
                tv.getCreatedAt() == null ? null : tv.getCreatedAt().toString(),
                tv.getUpdatedAt() == null ? null : tv.getUpdatedAt().toString(),
                // CPR info
                cpr.getPrNo(),
                cpr.getReferencePrNo(),
                cpr.getClientName(),
                cpr.getSourceLead(),
                cpr.getProject(),
                cpr.getDepartment(),
                cpr.getPrDate() == null ? null : cpr.getPrDate().toLocalDate().toString(),
                cpr.getRequiredDate() == null ? null : cpr.getRequiredDate().toLocalDate().toString(),
                cpr.getStatus() == null ? null : cpr.getStatus().name(),
                cpr.getPriority(),
                // Item-level
                tv.getCprItemId(),
                tv.getItemNo(),
                tv.getDivision(),
                tv.getFileStatus(),
                tv.isForwardedToCostWorkout(),
                tv.getForwardedAt() == null ? null : tv.getForwardedAt().toString(),
                tv.getForwardedBy(),
                tv.getCostWorkoutId(),
                tv.getCostWorkoutCwNo(),
                // Purchase Requisition destination
                tv.isForwardedToPurchaseRequisition(),
                tv.getForwardedToPrAt() == null ? null : tv.getForwardedToPrAt().toString(),
                tv.getForwardedToPrBy(),
                tv.getPurchaseRequisitionId(),
                tv.getPurchaseRequisitionPrNo(),
                docs
        );
    }

    private TechnicalVerificationDocumentResponse documentResponse(CprTechnicalVerificationDocument doc) {
        return new TechnicalVerificationDocumentResponse(
                doc.getId(),
                doc.getName(),
                doc.getContentType(),
                doc.getSize(),
                doc.getUrl(),
                doc.getVisibility() == null ? "TEAM_ONLY" : doc.getVisibility().name(),
                doc.getDocumentCategory(),
                doc.isSentToCostWorkout(),
                doc.getCostWorkoutId(),
                doc.getCostWorkoutCwNo(),
                doc.getSentAt() == null ? null : doc.getSentAt().toString(),
                doc.getSentBy(),
                doc.getUploadedBy(),
                doc.getUploadedAt() == null ? null : doc.getUploadedAt().toString()
        );
    }

    private CprTechnicalVerification getTv(Long id) {
        return tvRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Technical Verification not found with id: " + id));
    }

    // ============================== Numbering ==============================

    private long nextSequence() {
        long count = tvRepository.count();
        return count + 1;
    }

    private String buildTvNo(long seq) {
        int year = Year.now().getValue();
        return String.format("TV-%d-%04d", year, seq);
    }

    /**
     * Next FREE TV number for an auto-created verification row.
     *
     * A bare {@code count() + 1} is not collision-safe (the same rule
     * QualityInspectionService#generateId follows): editing a CPR stores a new
     * revision with NEW item rows while the previous revision's verification rows
     * keep their numbers, so a count-based number reuses an existing {@code tv_no}
     * — {@code tv_no} is unique, so the insert fails and the whole
     * {@code /by-cpr/{id}/items} call is rejected with 409. That call is exactly how
     * the item-row CW / PR buttons resolve the row they are about to convert, so the
     * collision blocked every conversion started from a CPR that had been edited.
     * Skipping taken numbers keeps the same sequence in the normal case.
     */
    private String nextFreeTvNo() {
        long seq = nextSequence();
        String tvNo;
        do {
            tvNo = buildTvNo(seq++);
        } while (tvRepository.findByTvNo(tvNo).isPresent());
        return tvNo;
    }

    private TechnicalVerificationStatus parseStatus(String status) {
        if (status == null || status.isBlank()) return null;
        try {
            return TechnicalVerificationStatus.valueOf(status.toUpperCase().trim().replace(" ", "_"));
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid status: " + status);
        }
    }

    private Sort buildSort(String sort) {
        if (sort == null || sort.isBlank()) {
            return Sort.by(Sort.Direction.DESC, "createdAt");
        }
        boolean desc = sort.startsWith("-");
        String field = desc ? sort.substring(1) : sort;
        switch (field) {
            case "tvNo": field = "tvNo"; break;
            case "status": field = "status"; break;
            case "verifiedBy": field = "verifiedBy"; break;
            case "itemNo": field = "itemNo"; break;
            case "division": field = "division"; break;
            case "drawingNumber": field = "drawingNumber"; break;
            default: field = "createdAt";
        }
        return Sort.by(desc ? Sort.Direction.DESC : Sort.Direction.ASC, field);
    }
}
