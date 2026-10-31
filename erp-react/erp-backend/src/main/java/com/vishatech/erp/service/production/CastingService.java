package com.vishatech.erp.service.production;

import com.vishatech.erp.dto.production.*;
import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.entity.production.*;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.repository.production.ProductionEntryRepository;
import com.vishatech.erp.repository.production.ProductionOrderItemRepository;
import com.vishatech.erp.repository.production.ProductionOrderRepository;
import com.vishatech.erp.util.production.OrderMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Service for the Casting shop floor module.
 *
 * Casting jobs are ProductionEntry records with productionType = "Casting".
 * The Casting workflow is:
 *   Shell Preparation → Melting → Pouring → Blasting → Fettling
 *
 * Status transitions:
 *   Pending     → In Progress (Start)
 *   In Progress → Hold (Hold)
 *   Hold        → In Progress (Resume)
 *   In Progress → Completed (Complete)
 *   Hold        → Completed (Complete)
 *   Pending/In Progress/Hold → Skipped (Skip)
 *
 * This service adds casting-specific business logic on top of the
 * existing ProductionEntry infrastructure.
 */
@Service
@Transactional
public class CastingService {

    private static final String PRODUCTION_TYPE = "Casting";

    /** Casting workflow stages in order. */
    private static final List<String> CASTING_WORKFLOW = Arrays.asList(
        "Shell Preparation", "Melting", "Pouring", "Blasting", "Fettling"
    );

    private final ProductionEntryRepository entryRepository;
    private final ProductionOrderRepository orderRepository;
    private final ProductionOrderItemRepository itemRepository;

    public CastingService(ProductionEntryRepository entryRepository,
                          ProductionOrderRepository orderRepository,
                          ProductionOrderItemRepository itemRepository) {
        this.entryRepository = entryRepository;
        this.orderRepository = orderRepository;
        this.itemRepository = itemRepository;
    }

    // =====================
    // READ OPERATIONS
    // =====================

    /**
     * Get all Casting entries with optional search, status filter, and stage filter.
     */
    @Transactional(readOnly = true)
    public PagedResponse<ProductionEntryDTO> getAllCastingJobs(
            String search, String status, String stage,
            String sortBy, String sortDir,
            int page, int size) {

        List<ProductionEntry> entries;

        if (search != null && !search.isBlank()) {
            entries = entryRepository.searchByProductionType(PRODUCTION_TYPE, search.trim());
        } else if (status != null && !status.isBlank() && !"All".equals(status)) {
            EntryStatus entryStatus = EntryStatus.fromDisplayName(status);
            entries = entryRepository.findByProductionTypeAndStatus(PRODUCTION_TYPE, entryStatus);
        } else if (stage != null && !stage.isBlank() && !"All Stages".equals(stage)) {
            entries = entryRepository.findByProductionTypeAndStage(PRODUCTION_TYPE, stage);
        } else {
            entries = entryRepository.findByProductionTypeOrderByCreatedAtDesc(PRODUCTION_TYPE);
        }

        // Apply stage filter if both status and search are applied
        if (stage != null && !stage.isBlank() && !"All Stages".equals(stage)
                && (search != null && !search.isBlank())) {
            entries = entries.stream()
                .filter(e -> stage.equals(e.getStage()))
                .collect(Collectors.toList());
        }

        // Sort
        entries = sortEntries(entries, sortBy, sortDir);

        // Paginate
        int total = entries.size();
        int start = page * size;
        int end = Math.min(start + size, total);
        List<ProductionEntry> paged = start < total ? entries.subList(start, end) : List.of();

        List<ProductionEntryDTO> dtos = paged.stream()
            .map(OrderMapper::toEntryDTO)
            .collect(Collectors.toList());

        return PagedResponse.<ProductionEntryDTO>builder()
            .content(dtos)
            .page(page)
            .size(size)
            .totalElements((long) total)
            .totalPages((int) Math.ceil((double) total / size))
            .build();
    }

    /**
     * Get a specific Casting entry by ID.
     */
    @Transactional(readOnly = true)
    public ProductionEntryDTO getCastingJob(Long id) {
        ProductionEntry entry = entryRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Casting job not found: " + id));
        return OrderMapper.toEntryDTO(entry);
    }

    /**
     * Get all Casting entries for a specific Work Order.
     */
    @Transactional(readOnly = true)
    public List<ProductionEntryDTO> getCastingJobsForOrder(String workOrderId) {
        ProductionOrder order = orderRepository.findByWorkOrder(workOrderId)
            .orElseThrow(() -> new NoSuchElementException("Production order not found: " + workOrderId));
        return entryRepository.findByProductionTypeAndWorkOrder(PRODUCTION_TYPE, workOrderId).stream()
            .map(OrderMapper::toEntryDTO)
            .collect(Collectors.toList());
    }

    /**
     * Get the current stage for a specific work order in the Casting workflow.
     */
    @Transactional(readOnly = true)
    public String getCurrentStage(String workOrderId) {
        List<ProductionEntry> entries = entryRepository.findByProductionTypeAndWorkOrder(PRODUCTION_TYPE, workOrderId);
        if (entries.isEmpty()) {
            return CASTING_WORKFLOW.get(0); // First stage
        }
        Set<String> completedStages = entries.stream()
            .filter(e -> e.getStatus() == EntryStatus.COMPLETED || e.getStatus() == EntryStatus.SKIPPED)
            .map(ProductionEntry::getStage)
            .collect(Collectors.toSet());
        for (String stage : CASTING_WORKFLOW) {
            if (!completedStages.contains(stage)) {
                return stage;
            }
        }
        return "Completed";
    }

    /**
     * Get Casting KPI statistics.
     */
    @Transactional(readOnly = true)
    public CastingStatsDTO getStats() {
        long total = entryRepository.countByProductionType(PRODUCTION_TYPE);
        long pending = entryRepository.countByProductionTypeAndStatus(PRODUCTION_TYPE, EntryStatus.PENDING);
        long inProgress = entryRepository.countByProductionTypeAndStatus(PRODUCTION_TYPE, EntryStatus.IN_PROGRESS);
        long hold = entryRepository.countByProductionTypeAndStatus(PRODUCTION_TYPE, EntryStatus.HOLD);
        long completed = entryRepository.countByProductionTypeAndStatus(PRODUCTION_TYPE, EntryStatus.COMPLETED);
        long skipped = entryRepository.countByProductionTypeAndStatus(PRODUCTION_TYPE, EntryStatus.SKIPPED);

        Integer totalInput = entryRepository.sumInputQuantityByType(PRODUCTION_TYPE);
        Integer totalOutput = entryRepository.sumOutputQuantityByType(PRODUCTION_TYPE);
        Integer totalRejected = entryRepository.sumRejectedQuantityByType(PRODUCTION_TYPE);

        long distinctOrders = entryRepository.countDistinctProductionOrdersByType(PRODUCTION_TYPE);

        // Jobs per stage
        Map<String, Long> jobsPerStage = new LinkedHashMap<>();
        List<Object[]> stageCounts = entryRepository.countByProductionTypeAndStageGrouped(PRODUCTION_TYPE);
        for (Object[] row : stageCounts) {
            jobsPerStage.put((String) row[0], (Long) row[1]);
        }

        return CastingStatsDTO.builder()
            .totalJobs(total)
            .pendingJobs(pending)
            .inProgressJobs(inProgress)
            .onHoldJobs(hold)
            .completedJobs(completed)
            .skippedJobs(skipped)
            .totalPlannedQuantity(totalInput)
            .totalOutputQuantity(totalOutput)
            .totalRejectedQuantity(totalRejected)
            .totalPendingQuantity(Math.max(0, totalInput - totalOutput - totalRejected))
            .totalWorkOrders(distinctOrders)
            .stages(CASTING_WORKFLOW.toArray(new String[0]))
            .jobsPerStage(jobsPerStage)
            .build();
    }

    // =====================
    // CREATE OPERATIONS
    // =====================

    /**
     * Create a new Casting job (ProductionEntry).
     */
    public ProductionEntryDTO createCastingJob(CreateProductionEntryRequest request) {
        // Validate quantities
        validateQuantities(request);

        // Validate stage is a valid Casting stage
        if (request.getStage() != null && !CASTING_WORKFLOW.contains(request.getStage())) {
            throw new IllegalArgumentException("Invalid Casting stage: " + request.getStage()
                + ". Valid stages: " + String.join(", ", CASTING_WORKFLOW));
        }

        // Force production type to Casting
        request.setProductionType(PRODUCTION_TYPE);

        // Find the production order
        ProductionOrder order = orderRepository.findByWorkOrder(request.getWorkOrderId())
            .orElseThrow(() -> new NoSuchElementException("Production order not found: " + request.getWorkOrderId()));

        // Check for duplicate entry (same work order + stage)
        // In Casting, each work order should have only one entry per stage
        List<ProductionEntry> existingEntries = entryRepository.findByProductionTypeAndWorkOrder(PRODUCTION_TYPE, request.getWorkOrderId());
        boolean duplicate = existingEntries.stream()
            .anyMatch(e -> request.getStage().equals(e.getStage()));
        if (duplicate) {
            throw new IllegalArgumentException("A Casting job already exists for work order "
                + request.getWorkOrderId() + ", stage " + request.getStage());
        }

        // Create entry
        ProductionEntry entry = ProductionEntry.builder()
            .productionOrder(order)
            .workOrderItemId(request.getWorkOrderItemId())
            .productionType(PRODUCTION_TYPE)
            .stage(request.getStage())
            .inputQuantity(request.getInputQuantity() != null ? request.getInputQuantity() : 0)
            .outputQuantity(request.getOutputQuantity() != null ? request.getOutputQuantity() : 0)
            .rejectedQuantity(request.getRejectedQuantity() != null ? request.getRejectedQuantity() : 0)
            .operator(request.getOperator())
            .entryDate(request.getEntryDate())
            .status(request.getStatus() != null ? EntryStatus.fromDisplayName(request.getStatus()) : EntryStatus.PENDING)
            .remarks(request.getRemarks())
            .build();

        entry = entryRepository.save(entry);
        return OrderMapper.toEntryDTO(entry);
    }

    // =====================
    // UPDATE OPERATIONS
    // =====================

    /**
     * Update an existing Casting job.
     */
    public ProductionEntryDTO updateCastingJob(Long id, CreateProductionEntryRequest request) {
        ProductionEntry entry = entryRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Casting job not found: " + id));

        // Validate quantities
        validateQuantities(request);

        // Update fields
        if (request.getWorkOrderItemId() != null) entry.setWorkOrderItemId(request.getWorkOrderItemId());
        if (request.getStage() != null) entry.setStage(request.getStage());
        if (request.getInputQuantity() != null) entry.setInputQuantity(request.getInputQuantity());
        if (request.getOutputQuantity() != null) entry.setOutputQuantity(request.getOutputQuantity());
        if (request.getRejectedQuantity() != null) entry.setRejectedQuantity(request.getRejectedQuantity());
        if (request.getOperator() != null) entry.setOperator(request.getOperator());
        if (request.getEntryDate() != null) entry.setEntryDate(request.getEntryDate());
        if (request.getRemarks() != null) entry.setRemarks(request.getRemarks());
        if (request.getStatus() != null) {
            entry.setStatus(EntryStatus.fromDisplayName(request.getStatus()));
        }

        entry = entryRepository.save(entry);
        return OrderMapper.toEntryDTO(entry);
    }

    // =====================
    // STATUS TRANSITIONS
    // =====================

    /**
     * Start a Casting job: Pending → In Progress.
     */
    public ProductionEntryDTO startJob(Long id) {
        ProductionEntry entry = entryRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Casting job not found: " + id));

        if (entry.getStatus() != EntryStatus.PENDING) {
            throw new BadRequestException(
                "Cannot start job in '" + entry.getStatus().getDisplayName() + "' status. Must be 'Pending'.");
        }

        entry.setStatus(EntryStatus.IN_PROGRESS);
        entry = entryRepository.save(entry);
        return OrderMapper.toEntryDTO(entry);
    }

    /**
     * Hold a Casting job: In Progress → Hold.
     */
    public ProductionEntryDTO holdJob(Long id) {
        ProductionEntry entry = entryRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Casting job not found: " + id));

        if (entry.getStatus() != EntryStatus.IN_PROGRESS) {
            throw new BadRequestException(
                "Cannot hold job in '" + entry.getStatus().getDisplayName() + "' status. Must be 'In Progress'.");
        }

        entry.setStatus(EntryStatus.HOLD);
        entry = entryRepository.save(entry);
        return OrderMapper.toEntryDTO(entry);
    }

    /**
     * Resume a Casting job: Hold → In Progress.
     */
    public ProductionEntryDTO resumeJob(Long id) {
        ProductionEntry entry = entryRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Casting job not found: " + id));

        if (entry.getStatus() != EntryStatus.HOLD) {
            throw new BadRequestException(
                "Cannot resume job in '" + entry.getStatus().getDisplayName() + "' status. Must be 'Hold'.");
        }

        entry.setStatus(EntryStatus.IN_PROGRESS);
        entry = entryRepository.save(entry);
        return OrderMapper.toEntryDTO(entry);
    }

    /**
     * Complete a Casting job: In Progress / Hold → Completed.
     */
    public ProductionEntryDTO completeJob(Long id) {
        ProductionEntry entry = entryRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Casting job not found: " + id));

        if (entry.getStatus() != EntryStatus.IN_PROGRESS && entry.getStatus() != EntryStatus.HOLD) {
            throw new BadRequestException(
                "Cannot complete job in '" + entry.getStatus().getDisplayName() + "' status. Must be 'In Progress' or 'Hold'.");
        }

        // Auto-set completed quantity to input - rejected if not explicitly set
        if (entry.getOutputQuantity() == null || entry.getOutputQuantity() == 0) {
            int planned = entry.getInputQuantity() != null ? entry.getInputQuantity() : 0;
            int rejected = entry.getRejectedQuantity() != null ? entry.getRejectedQuantity() : 0;
            entry.setOutputQuantity(Math.max(0, planned - rejected));
        }

        entry.setStatus(EntryStatus.COMPLETED);
        entry = entryRepository.save(entry);
        return OrderMapper.toEntryDTO(entry);
    }

    /**
     * Skip a Casting job: Pending / In Progress / Hold → Skipped.
     */
    public ProductionEntryDTO skipJob(Long id, String reason, String remarks) {
        ProductionEntry entry = entryRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Casting job not found: " + id));

        if (entry.getStatus() == EntryStatus.COMPLETED || entry.getStatus() == EntryStatus.SKIPPED) {
            throw new BadRequestException(
                "Cannot skip job in '" + entry.getStatus().getDisplayName() + "' status.");
        }

        entry.setStatus(EntryStatus.SKIPPED);
        if (remarks != null && !remarks.isBlank()) {
            String existingRemarks = entry.getRemarks() != null ? entry.getRemarks() : "";
            String skipInfo = "Skipped" + (reason != null && !reason.isBlank() ? " - " + reason : "");
            entry.setRemarks(existingRemarks.isEmpty()
                ? skipInfo
                : existingRemarks + " | " + skipInfo);
        }
        entry = entryRepository.save(entry);
        return OrderMapper.toEntryDTO(entry);
    }

    // =====================
    // DELETE OPERATIONS
    // =====================

    /**
     * Delete a Casting job.
     */
    public void deleteCastingJob(Long id) {
        if (!entryRepository.existsById(id)) {
            throw new NoSuchElementException("Casting job not found: " + id);
        }
        entryRepository.deleteById(id);
    }

    /**
     * Delete all Casting jobs for a Work Order.
     */
    public void deleteCastingJobsForOrder(String workOrderId) {
        ProductionOrder order = orderRepository.findByWorkOrder(workOrderId).orElse(null);
        if (order != null) {
            List<ProductionEntry> entries = entryRepository.findByProductionTypeAndWorkOrder(PRODUCTION_TYPE, workOrderId);
            if (!entries.isEmpty()) {
                entryRepository.deleteAll(entries);
            }
        }
    }

    // =====================
    // HELPER METHODS
    // =====================

    /**
     * Validate quantities: non-negative, output + rejected <= input.
     */
    private void validateQuantities(CreateProductionEntryRequest request) {
        if (request.getInputQuantity() != null && request.getInputQuantity() < 0) {
            throw new IllegalArgumentException("Input quantity cannot be negative");
        }
        if (request.getOutputQuantity() != null && request.getOutputQuantity() < 0) {
            throw new IllegalArgumentException("Output quantity cannot be negative");
        }
        if (request.getRejectedQuantity() != null && request.getRejectedQuantity() < 0) {
            throw new IllegalArgumentException("Rejected quantity cannot be negative");
        }
        if (request.getInputQuantity() != null && request.getOutputQuantity() != null && request.getRejectedQuantity() != null) {
            if (request.getOutputQuantity() + request.getRejectedQuantity() > request.getInputQuantity()) {
                throw new IllegalArgumentException("Output + rejected quantity cannot exceed input quantity");
            }
        }
    }

    /**
     * Sort entries by the given field and direction.
     */
    private List<ProductionEntry> sortEntries(List<ProductionEntry> entries, String sortBy, String sortDir) {
        if (sortBy == null || sortBy.isBlank()) {
            return entries;
        }
        boolean asc = !"desc".equalsIgnoreCase(sortDir);
        Comparator<ProductionEntry> cmp;
        switch (sortBy.toLowerCase()) {
            case "stage":
                cmp = Comparator.comparing(ProductionEntry::getStage, Comparator.nullsLast(String::compareTo));
                break;
            case "operator":
                cmp = Comparator.comparing(ProductionEntry::getOperator, Comparator.nullsLast(String::compareTo));
                break;
            case "status":
                cmp = Comparator.comparing(e -> e.getStatus() != null ? e.getStatus().getDisplayName() : "");
                break;
            case "inputquantity":
            case "input":
                cmp = Comparator.comparing(e -> e.getInputQuantity() != null ? e.getInputQuantity() : 0);
                break;
            case "outputquantity":
            case "output":
                cmp = Comparator.comparing(e -> e.getOutputQuantity() != null ? e.getOutputQuantity() : 0);
                break;
            case "createdat":
            default:
                cmp = Comparator.comparing(e -> e.getCreatedAt() != null ? e.getCreatedAt() : Instant.EPOCH);
                cmp = asc ? cmp : cmp.reversed();
                return new ArrayList<>(entries).stream().sorted(cmp).collect(Collectors.toList());
        }
        if (!asc) cmp = cmp.reversed();
        return new ArrayList<>(entries).stream().sorted(cmp).collect(Collectors.toList());
    }
}
