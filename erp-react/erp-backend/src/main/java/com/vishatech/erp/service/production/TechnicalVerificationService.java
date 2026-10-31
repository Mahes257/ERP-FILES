package com.vishatech.erp.service.production;

import com.vishatech.erp.dto.production.TVHistoryDTO;
import com.vishatech.erp.dto.production.TVStatsDTO;
import com.vishatech.erp.dto.production.TechnicalVerificationDTO;
import com.vishatech.erp.entity.production.ProductionOrder;
import com.vishatech.erp.entity.production.ProductionOrderItem;
import com.vishatech.erp.entity.production.TVHistory;
import com.vishatech.erp.entity.production.TVStatus;
import com.vishatech.erp.entity.production.TechnicalVerification;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.repository.production.ProductionOrderRepository;
import com.vishatech.erp.repository.production.TVHistoryRepository;
import com.vishatech.erp.repository.production.TechnicalVerificationRepository;
import com.vishatech.erp.util.production.OrderMapper;
import jakarta.persistence.EntityManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

/**
 * Service for managing Technical Verification records.
 * Implements workflow validation, history tracking, and business rules.
 */
@Service
@Transactional
public class TechnicalVerificationService {

    private static final java.util.logging.Logger log =
            java.util.logging.Logger.getLogger(TechnicalVerificationService.class.getName());

    private final TechnicalVerificationRepository tvRepository;
    private final TVHistoryRepository historyRepository;
    private final ProductionOrderRepository orderRepository;
    private final EntityManager entityManager;
    /** Verification events — gated by Production Settings → Notifications. */
    private final ProductionNotificationPublisher notificationPublisher;

    public TechnicalVerificationService(TechnicalVerificationRepository tvRepository,
                                        TVHistoryRepository historyRepository,
                                        ProductionOrderRepository orderRepository,
                                        EntityManager entityManager,
                                        ProductionNotificationPublisher notificationPublisher) {
        this.tvRepository = tvRepository;
        this.historyRepository = historyRepository;
        this.orderRepository = orderRepository;
        this.entityManager = entityManager;
        this.notificationPublisher = notificationPublisher;
    }

    // ========================
    // CRUD Operations
    // ========================

    /**
     * Save (create or update) a technical verification record.
     * The frontend sends the full TV data including checklist, technical fields, etc.
     */
    public TechnicalVerificationDTO saveTechnicalVerification(TechnicalVerificationDTO request) {
        String itemId = request.getItemId() != null ? request.getItemId() : "";
        var existing = tvRepository.findByWorkOrderIdAndItemId(request.getWorkOrderId(), itemId);

        TechnicalVerification tv;
        boolean isUpdate = existing.isPresent();

        if (isUpdate) {
            tv = existing.get();
            TVStatus oldStatus = tv.getVerificationStatus();
            updateEntityFromDTO(tv, request);
            tv = tvRepository.save(tv);

            // Record history if status changed
            if (request.getVerificationStatus() != null) {
                TVStatus newStatus = TVStatus.fromDisplayName(request.getVerificationStatus());
                if (oldStatus != newStatus) {
                    recordHistory(tv, "Status Changed", oldStatus, newStatus, request.getVerifiedBy(), request.getVerificationRemarks());
                }
            }
        } else {
            tv = buildEntityFromDTO(request);
            tv = tvRepository.save(tv);
            recordHistory(tv, "Created", null, tv.getVerificationStatus(), request.getVerifiedBy(), "Technical Verification created.");
        }

        entityManager.flush();
        entityManager.clear();
        return OrderMapper.toTechnicalVerificationDTO(tvRepository.findById(tv.getId()).orElse(tv));
    }

    /**
     * Get a single technical verification by its primary key.
     * The controller used to answer this lookup with a 200 + error payload,
     * so `GET /technical-verifications/{id}` could never return a record.
     */
    @Transactional(readOnly = true)
    public TechnicalVerificationDTO getVerification(Long id) {
        return tvRepository.findById(id)
            .map(OrderMapper::toTechnicalVerificationDTO)
            .orElseThrow(() -> new NoSuchElementException("Technical Verification not found: " + id));
    }

    /**
     * Get technical verification for a specific Work Order + Item.
     */
    @Transactional(readOnly = true)
    public TechnicalVerificationDTO getTechnicalVerification(String workOrderId, String itemId) {
        String id = itemId != null ? itemId : "";
        var tv = tvRepository.findByWorkOrderIdAndItemId(workOrderId, id);
        return tv.map(OrderMapper::toTechnicalVerificationDTO).orElse(null);
    }

    /**
     * Get all technical verifications for a Work Order.
     */
    @Transactional(readOnly = true)
    public List<TechnicalVerificationDTO> getTechnicalVerificationsForOrder(String workOrderId) {
        return tvRepository.findByWorkOrderId(workOrderId).stream()
            .map(OrderMapper::toTechnicalVerificationDTO)
            .collect(Collectors.toList());
    }

    /**
     * Get all TV records with pagination, search, and filters.
     */
    @Transactional(readOnly = true)
    public Page<TechnicalVerificationDTO> getAllVerifications(
            String search, String status, String productionType,
            int page, int size, String sort, String direction) {

        Sort sortOrder;
        if (sort != null && !sort.isBlank()) {
            Sort.Direction dir = "desc".equalsIgnoreCase(direction) ? Sort.Direction.DESC : Sort.Direction.ASC;
            sortOrder = Sort.by(dir, mapSortField(sort));
        } else {
            sortOrder = Sort.by(Sort.Direction.DESC, "createdAt");
        }

        PageRequest pageRequest = PageRequest.of(Math.max(0, page), Math.max(1, Math.min(size, 100)), sortOrder);

        Page<TechnicalVerification> result;
        boolean hasFilters = (status != null && !status.isBlank()) || (productionType != null && !productionType.isBlank());

        if (hasFilters) {
            result = tvRepository.findFiltered(
                search,
                status != null && !status.isBlank() ? TVStatus.fromDisplayName(status) : null,
                productionType,
                pageRequest
            );
        } else {
            result = tvRepository.searchVerifications(search, pageRequest);
        }

        return result.map(OrderMapper::toTechnicalVerificationDTO);
    }

    /**
     * Delete all technical verifications for a Work Order.
     */
    public void deleteTechnicalVerificationsForOrder(String workOrderId) {
        List<TechnicalVerification> tvs = tvRepository.findByWorkOrderId(workOrderId);
        for (TechnicalVerification tv : tvs) {
            historyRepository.deleteByTechnicalVerificationId(tv.getId());
        }
        tvRepository.deleteByWorkOrderId(workOrderId);
    }

    // ========================
    // Status Transitions
    // ========================

    /**
     * Submit a TV for verification.
     */
    public TechnicalVerificationDTO submit(String workOrderId, String itemId, String performedBy) {
        TechnicalVerification tv = findTv(workOrderId, itemId);
        TVStatus oldStatus = tv.getVerificationStatus();
        validateTransition(oldStatus, TVStatus.PENDING, "Submit");

        tv.setVerificationStatus(TVStatus.PENDING);
        tv = tvRepository.save(tv);
        recordHistory(tv, "Submitted", oldStatus, TVStatus.PENDING, performedBy, null);

        notify(ProductionNotificationPublisher.TV_PENDING, tv, "Technical verification pending",
                "Technical verification for work order " + workOrderLabel(tv)
                        + " was submitted and is awaiting verification.");
        return OrderMapper.toTechnicalVerificationDTO(tv);
    }

    /**
     * Verify a TV item (mark as Verified).
     */
    public TechnicalVerificationDTO verify(String workOrderId, String itemId, String performedBy, String remarks) {
        TechnicalVerification tv = findTv(workOrderId, itemId);
        TVStatus oldStatus = tv.getVerificationStatus();
        validateTransition(oldStatus, TVStatus.VERIFIED, "Verify");

        tv.setVerificationStatus(TVStatus.VERIFIED);
        tv.setVerifiedBy(performedBy);
        tv.setVerificationDateTime(Instant.now());
        if (remarks != null && !remarks.isBlank()) {
            tv.setVerificationRemarks(remarks);
        }
        tv = tvRepository.save(tv);
        recordHistory(tv, "Verified", oldStatus, TVStatus.VERIFIED, performedBy, remarks);

        notify(ProductionNotificationPublisher.TV_APPROVED, tv, "Technical verification approved",
                "Technical verification for work order " + workOrderLabel(tv)
                        + " was verified by " + safeUser(performedBy) + ".");
        return OrderMapper.toTechnicalVerificationDTO(tv);
    }

    /**
     * Reject a TV item.
     */
    public TechnicalVerificationDTO reject(String workOrderId, String itemId, String performedBy, String remarks) {
        TechnicalVerification tv = findTv(workOrderId, itemId);
        TVStatus oldStatus = tv.getVerificationStatus();
        validateTransition(oldStatus, TVStatus.REJECTED, "Reject");

        tv.setVerificationStatus(TVStatus.REJECTED);
        tv.setVerifiedBy(performedBy);
        tv.setVerificationDateTime(Instant.now());
        if (remarks != null && !remarks.isBlank()) {
            tv.setVerificationRemarks(remarks);
        }
        tv = tvRepository.save(tv);
        recordHistory(tv, "Rejected", oldStatus, TVStatus.REJECTED, performedBy, remarks);

        notify(ProductionNotificationPublisher.TV_REJECTED, tv, "Technical verification rejected",
                "Technical verification for work order " + workOrderLabel(tv)
                        + " was rejected by " + safeUser(performedBy)
                        + reasonSuffix(remarks));
        return OrderMapper.toTechnicalVerificationDTO(tv);
    }

    /* ========================
     * Notifications
     * ======================== */

    /**
     * Publishes a verification event through the shared notification system.
     *
     * <p>The occurrence discriminator is the number of history rows: submit →
     * reject → resubmit → verify must notify on every cycle, while a replayed
     * publish of the same transition is suppressed.
     */
    private void notify(String event, TechnicalVerification tv, String title, String message) {
        try {
            int occurrence = getHistory(tv.getId()).size();
            notificationPublisher.publish(event, ProductionNotificationPublisher.REF_TV, tv.getId(),
                    title, message, "NORMAL", occurrence);
        } catch (Exception e) {
            // Best effort — never fail the verification itself.
            log.warning("Technical verification notification skipped [tv=" + tv.getId() + "]: "
                    + e.getMessage());
        }
    }

    private static String workOrderLabel(TechnicalVerification tv) {
        String workOrder = tv.getWorkOrderNumber() != null && !tv.getWorkOrderNumber().isBlank()
                ? tv.getWorkOrderNumber()
                : tv.getWorkOrderId();
        String item = tv.getItemCode() != null && !tv.getItemCode().isBlank()
                ? tv.getItemCode()
                : tv.getItemId();
        return (workOrder == null ? "#" + tv.getId() : workOrder)
                + (item == null || item.isBlank() ? "" : " / item " + item);
    }

    private static String safeUser(String performedBy) {
        return performedBy == null || performedBy.isBlank() ? "the system" : performedBy;
    }

    private static String reasonSuffix(String remarks) {
        if (remarks == null || remarks.isBlank()) {
            return ".";
        }
        String reason = remarks.trim();
        return ": " + (reason.length() > 300 ? reason.substring(0, 300) + "…" : reason);
    }

    /**
     * Re-verify a rejected TV (resubmit for verification).
     */
    public TechnicalVerificationDTO resubmit(String workOrderId, String itemId, String performedBy) {
        TechnicalVerification tv = findTv(workOrderId, itemId);
        TVStatus oldStatus = tv.getVerificationStatus();
        validateTransition(oldStatus, TVStatus.PENDING, "Resubmit");

        tv.setVerificationStatus(TVStatus.PENDING);
        tv = tvRepository.save(tv);
        recordHistory(tv, "Resubmitted", oldStatus, TVStatus.PENDING, performedBy, null);

        return OrderMapper.toTechnicalVerificationDTO(tv);
    }

    // ========================
    // Statistics
    // ========================

    @Transactional(readOnly = true)
    public TVStatsDTO getStatistics() {
        // The TV page shows ONE ROW PER PRODUCTION ORDER.
        // Each order's TV status is derived from its items' TV records.
        // We count production orders, not TV records.
        List<ProductionOrder> allOrders = orderRepository.findAll();
        long total = allOrders.size();
        long pending = 0;
        long verified = 0;
        long rejected = 0;

        for (ProductionOrder order : allOrders) {
            String workOrderId = order.getWorkOrder();
            List<ProductionOrderItem> items = order.getItems();
            String orderStatus;

            if (items != null && !items.isEmpty()) {
                // Derive the order status from EVERY item, exactly like the page
                // does. Comparing only the existing TV rows counted a 2-item order
                // as "Verified" as soon as one of its items was verified, so the
                // KPI cards contradicted the status shown in the table.
                List<TechnicalVerification> tvs = tvRepository.findByWorkOrderId(workOrderId);
                Map<String, TVStatus> byItem = new HashMap<>();
                for (TechnicalVerification tv : tvs) {
                    if (tv.getItemId() != null) {
                        byItem.put(tv.getItemId(), tv.getVerificationStatus());
                    }
                }

                boolean allVerified = true;
                boolean anyRejected = false;
                for (ProductionOrderItem item : items) {
                    TVStatus status = byItem.get(String.valueOf(item.getId()));
                    if (status != TVStatus.VERIFIED) allVerified = false;
                    if (status == TVStatus.REJECTED) anyRejected = true;
                }

                if (allVerified) {
                    orderStatus = "Verified";
                } else if (anyRejected) {
                    orderStatus = "Rejected";
                } else {
                    orderStatus = "Pending";
                }
            } else {
                List<TechnicalVerification> tvs = tvRepository.findByWorkOrderId(workOrderId);
                orderStatus = tvs.isEmpty() ? "Pending"
                    : tvs.get(0).getVerificationStatus() == TVStatus.VERIFIED ? "Verified"
                    : tvs.get(0).getVerificationStatus() == TVStatus.REJECTED ? "Rejected"
                    : "Pending";
            }

            switch (orderStatus) {
                case "Verified" -> verified++;
                case "Rejected" -> rejected++;
                default -> pending++;
            }
        }

        return TVStatsDTO.builder()
            .total(total)
            .pending(pending)
            .verified(verified)
            .rejected(rejected)
            .build();
    }

    // ========================
    // History
    // ========================

    @Transactional(readOnly = true)
    public List<TVHistoryDTO> getHistory(Long tvId) {
        return historyRepository.findByTechnicalVerificationIdOrderByPerformedAtDesc(tvId).stream()
            .map(OrderMapper::toTVHistoryDTO)
            .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<TVHistoryDTO> getHistoryByWorkOrder(String workOrderId, String itemId) {
        String id = itemId != null ? itemId : "";
        var tv = tvRepository.findByWorkOrderIdAndItemId(workOrderId, id);
        if (tv.isEmpty()) return List.of();
        return historyRepository.findByTechnicalVerificationIdOrderByPerformedAtDesc(tv.get().getId()).stream()
            .map(OrderMapper::toTVHistoryDTO)
            .collect(Collectors.toList());
    }

    // ========================
    // Private Helpers
    // ========================

    private TechnicalVerification findTv(String workOrderId, String itemId) {
        String id = itemId != null ? itemId : "";
        return tvRepository.findByWorkOrderIdAndItemId(workOrderId, id)
            .orElseThrow(() -> new NoSuchElementException(
                "Technical Verification not found for workOrderId=" + workOrderId + ", itemId=" + id));
    }

    /**
     * Enforce the verification workflow. Violations are client errors: an
     * IllegalStateException was reported as an opaque HTTP 500 "unexpected
     * error", so the UI could not tell the user why the action was refused.
     */
    private void validateTransition(TVStatus from, TVStatus to, String action) {
        // Verify: only from PENDING
        if (to == TVStatus.VERIFIED && from != TVStatus.PENDING) {
            throw new BadRequestException("Cannot verify a TV that is not Pending. Current status: " + from.getDisplayName());
        }
        // Reject: only from PENDING
        if (to == TVStatus.REJECTED && from != TVStatus.PENDING) {
            throw new BadRequestException("Cannot reject a TV that is not Pending. Current status: " + from.getDisplayName());
        }
        // Resubmit: only from REJECTED
        if (to == TVStatus.PENDING && from != TVStatus.REJECTED && action.equals("Resubmit")) {
            throw new BadRequestException("Cannot resubmit a TV that is not Rejected. Current status: " + from.getDisplayName());
        }
    }

    private void recordHistory(TechnicalVerification tv, String action, TVStatus from, TVStatus to, String performedBy, String remarks) {
        TVHistory history = TVHistory.builder()
            .technicalVerification(tv)
            .action(action)
            .fromStatus(from)
            .toStatus(to)
            .performedBy(performedBy)
            .performedAt(Instant.now())
            .remarks(remarks)
            .build();
        historyRepository.save(history);
    }

    private TechnicalVerification buildEntityFromDTO(TechnicalVerificationDTO dto) {
        return TechnicalVerification.builder()
            .workOrderId(dto.getWorkOrderId())
            .itemId(dto.getItemId() != null ? dto.getItemId() : "")
            .workOrderNumber(dto.getWorkOrderNumber())
            .productionOrderNumber(dto.getProductionOrderNumber())
            .itemProduct(dto.getItemProduct())
            .itemCode(dto.getItemCode())
            .productionType(dto.getProductionType())
            .requiredQuantity(dto.getRequiredQuantity())
            .drawingNumber(dto.getDrawingNumber())
            .drawingRevision(dto.getDrawingRevision())
            .patternNumber(dto.getPatternNumber())
            .patternRevision(dto.getPatternRevision())
            .materialGrade(dto.getMaterialGrade())
            .specification(dto.getSpecification())
            .castingWeight(dto.getCastingWeight())
            .dimensions(dto.getDimensions())
            .machiningAllowance(dto.getMachiningAllowance())
            .materialType(dto.getMaterialType())
            .thickness(dto.getThickness())
            .lengthMm(dto.getLengthMm())
            .width(dto.getWidth())
            .diameter(dto.getDiameter())
            .requiredTolerance(dto.getRequiredTolerance())
            .weldingSpecification(dto.getWeldingSpecification())
            .weldingProcess(dto.getWeldingProcess())
            .weldType(dto.getWeldType())
            .jointType(dto.getJointType())
            .hardFacingRequirement(dto.getHardFacingRequirement())
            .surfaceTreatment(dto.getSurfaceTreatment())
            .heatTreatmentRequirement(dto.getHeatTreatmentRequirement())
            .specialInstructions(dto.getSpecialInstructions())
            .technicalInstructions(dto.getTechnicalInstructions())
            .checklist(dto.getChecklist())
            .verificationStatus(dto.getVerificationStatus() != null ? TVStatus.fromDisplayName(dto.getVerificationStatus()) : TVStatus.PENDING)
            .verifiedBy(dto.getVerifiedBy())
            .verificationDateTime(parseInstant(dto.getVerificationDateTime()))
            .verificationRemarks(dto.getVerificationRemarks())
            .createdBy(dto.getCreatedBy())
            .updatedBy(dto.getUpdatedBy())
            .build();
    }

    private void updateEntityFromDTO(TechnicalVerification tv, TechnicalVerificationDTO dto) {
        if (dto.getItemProduct() != null) tv.setItemProduct(dto.getItemProduct());
        if (dto.getItemCode() != null) tv.setItemCode(dto.getItemCode());
        if (dto.getProductionType() != null) tv.setProductionType(dto.getProductionType());
        if (dto.getRequiredQuantity() != null) tv.setRequiredQuantity(dto.getRequiredQuantity());
        // Drawing / Pattern
        if (dto.getDrawingNumber() != null) tv.setDrawingNumber(dto.getDrawingNumber());
        if (dto.getDrawingRevision() != null) tv.setDrawingRevision(dto.getDrawingRevision());
        if (dto.getPatternNumber() != null) tv.setPatternNumber(dto.getPatternNumber());
        if (dto.getPatternRevision() != null) tv.setPatternRevision(dto.getPatternRevision());
        // Casting
        if (dto.getMaterialGrade() != null) tv.setMaterialGrade(dto.getMaterialGrade());
        if (dto.getSpecification() != null) tv.setSpecification(dto.getSpecification());
        if (dto.getCastingWeight() != null) tv.setCastingWeight(dto.getCastingWeight());
        if (dto.getDimensions() != null) tv.setDimensions(dto.getDimensions());
        if (dto.getMachiningAllowance() != null) tv.setMachiningAllowance(dto.getMachiningAllowance());
        // Fabrication
        if (dto.getMaterialType() != null) tv.setMaterialType(dto.getMaterialType());
        if (dto.getThickness() != null) tv.setThickness(dto.getThickness());
        if (dto.getLengthMm() != null) tv.setLengthMm(dto.getLengthMm());
        if (dto.getWidth() != null) tv.setWidth(dto.getWidth());
        if (dto.getDiameter() != null) tv.setDiameter(dto.getDiameter());
        if (dto.getRequiredTolerance() != null) tv.setRequiredTolerance(dto.getRequiredTolerance());
        if (dto.getWeldingSpecification() != null) tv.setWeldingSpecification(dto.getWeldingSpecification());
        if (dto.getWeldingProcess() != null) tv.setWeldingProcess(dto.getWeldingProcess());
        if (dto.getWeldType() != null) tv.setWeldType(dto.getWeldType());
        if (dto.getJointType() != null) tv.setJointType(dto.getJointType());
        if (dto.getHardFacingRequirement() != null) tv.setHardFacingRequirement(dto.getHardFacingRequirement());
        if (dto.getSurfaceTreatment() != null) tv.setSurfaceTreatment(dto.getSurfaceTreatment());
        if (dto.getHeatTreatmentRequirement() != null) tv.setHeatTreatmentRequirement(dto.getHeatTreatmentRequirement());
        // Common
        if (dto.getSpecialInstructions() != null) tv.setSpecialInstructions(dto.getSpecialInstructions());
        if (dto.getTechnicalInstructions() != null) tv.setTechnicalInstructions(dto.getTechnicalInstructions());
        if (dto.getChecklist() != null) tv.setChecklist(dto.getChecklist());
        // Verification
        if (dto.getVerificationStatus() != null) tv.setVerificationStatus(TVStatus.fromDisplayName(dto.getVerificationStatus()));
        if (dto.getVerifiedBy() != null) tv.setVerifiedBy(dto.getVerifiedBy());
        if (dto.getVerificationDateTime() != null) tv.setVerificationDateTime(parseInstant(dto.getVerificationDateTime()));
        if (dto.getVerificationRemarks() != null) tv.setVerificationRemarks(dto.getVerificationRemarks());
        if (dto.getUpdatedBy() != null) tv.setUpdatedBy(dto.getUpdatedBy());
    }

    /**
     * Parses an ISO-8601 instant from the frontend. The frontend sends empty
     * strings for dates that have not been set yet (e.g. a Pending
     * verification); an empty value must map to null instead of throwing
     * {@link java.time.format.DateTimeParseException}.
     */
    private static Instant parseInstant(String value) {
        return (value != null && !value.isBlank()) ? Instant.parse(value) : null;
    }

    private String mapSortField(String frontendField) {
        return switch (frontendField.toLowerCase()) {
            case "workordernumber", "work_order_number" -> "workOrderNumber";
            case "createdat", "created_at" -> "createdAt";
            case "itemproduct", "item_product" -> "itemProduct";
            case "verificationstatus", "verification_status" -> "verificationStatus";
            case "productiontype", "production_type" -> "productionType";
            default -> "createdAt";
        };
    }
}
