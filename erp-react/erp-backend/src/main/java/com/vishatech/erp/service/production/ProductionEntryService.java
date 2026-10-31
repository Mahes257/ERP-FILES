package com.vishatech.erp.service.production;

import com.vishatech.erp.dto.production.CreateProductionEntryRequest;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.dto.production.ProductionEntryDTO;
import com.vishatech.erp.entity.production.*;
import com.vishatech.erp.repository.production.ProductionEntryRepository;
import com.vishatech.erp.repository.production.ProductionMachineRepository;
import com.vishatech.erp.repository.production.ProductionOrderItemRepository;
import com.vishatech.erp.repository.production.ProductionOrderRepository;
import com.vishatech.erp.util.production.OrderMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Comparator;
import java.util.stream.Collectors;
import com.vishatech.erp.dto.production.PagedResponse;
import com.vishatech.erp.dto.production.CastingStatsDTO;

/**
 * Service for managing production stage entries.
 * Entries are keyed by (productionOrder, workOrderItemId, stage).
 */
@Service
@Transactional
public class ProductionEntryService {

    private final ProductionEntryRepository entryRepository;
    private final ProductionOrderRepository orderRepository;
    private final ProductionOrderItemRepository itemRepository;
    private final ProductionMachineRepository machineRepository;

    public ProductionEntryService(ProductionEntryRepository entryRepository,
                                  ProductionOrderRepository orderRepository,
                                  ProductionOrderItemRepository itemRepository,
                                  ProductionMachineRepository machineRepository) {
        this.entryRepository = entryRepository;
        this.orderRepository = orderRepository;
        this.itemRepository = itemRepository;
        this.machineRepository = machineRepository;
    }

    /**
     * Resolve the machine a job is assigned to against the persisted machine
     * master (Settings → Machines).
     *
     * The machine master is the single source of truth for which machines exist
     * and which are still in service, so a job can only be bound to a machine
     * that is really configured — this is what keeps
     * {@code production_entries.machine_code} from holding a name nobody can
     * resolve (and what the Machine Utilization report divides hours over).
     *
     * @param machineCode machine id from the request; blank/null means "no machine"
     * @return the canonical machine id to store, or {@code null} for no machine
     * @throws BadRequestException when the code is unknown or the machine is 'Inactive'
     */
    private String resolveMachineCode(String machineCode) {
        if (machineCode == null || machineCode.isBlank()) {
            return null;
        }
        String requested = machineCode.trim();
        ProductionMachine machine = machineRepository.findByMachineCode(requested)
            .orElseThrow(() -> new BadRequestException(
                "Unknown machine '" + requested + "'. Choose a machine from Settings → Machines."));
        if (machine.getStatus() != null && "Inactive".equalsIgnoreCase(machine.getStatus().trim())) {
            throw new BadRequestException(
                "Machine '" + machine.getMachineCode() + "' is Inactive and cannot be assigned to a job.");
        }
        return machine.getMachineCode();
    }

    /**
     * Create or update a production entry.
     * Updating keeps the original id/createdAt and bumps updatedAt.
     */
    public ProductionEntryDTO saveEntry(CreateProductionEntryRequest request) {
        // Validate
        if (request.getInputQuantity() != null && request.getInputQuantity() < 0) {
            throw new IllegalArgumentException("Input quantity cannot be negative");
        }
        if (request.getOutputQuantity() != null && request.getOutputQuantity() < 0) {
            throw new IllegalArgumentException("Output quantity cannot be negative");
        }
        if (request.getRejectedQuantity() != null && request.getRejectedQuantity() < 0) {
            throw new IllegalArgumentException("Rejected quantity cannot be negative");
        }

        // Validate that output + rejected <= input
        if (request.getInputQuantity() != null && request.getOutputQuantity() != null && request.getRejectedQuantity() != null) {
            if (request.getOutputQuantity() + request.getRejectedQuantity() > request.getInputQuantity()) {
                throw new IllegalArgumentException("Output + rejected quantity cannot exceed input quantity");
            }
        }

        // Find the production order
        ProductionOrder order = orderRepository.findByWorkOrder(request.getWorkOrderId())
            .orElseThrow(() -> new NoSuchElementException("Production order not found: " + request.getWorkOrderId()));

        // Find existing entry or create new
        ProductionEntry existing = entryRepository.findByProductionOrderIdAndWorkOrderItemIdAndStage(
            order.getId(), request.getWorkOrderItemId() != null ? request.getWorkOrderItemId() : "",
            request.getStage()
        ).orElse(null);

        ProductionEntry entry;
        if (existing != null) {
            // Update existing
            existing.setInputQuantity(request.getInputQuantity() != null ? request.getInputQuantity() : 0);
            existing.setOutputQuantity(request.getOutputQuantity() != null ? request.getOutputQuantity() : 0);
            existing.setRejectedQuantity(request.getRejectedQuantity() != null ? request.getRejectedQuantity() : 0);
            existing.setOperator(request.getOperator());
            existing.setMachineCode(resolveMachineCode(request.getMachineCode()));
            existing.setEntryDate(request.getEntryDate());
            existing.setStatus(request.getStatus() != null ? EntryStatus.fromDisplayName(request.getStatus()) : EntryStatus.PENDING);
            existing.setRemarks(request.getRemarks());
            existing.setProductionType(request.getProductionType());
            entry = existing;
        } else {
            // Create new
            entry = ProductionEntry.builder()
                .productionOrder(order)
                .workOrderItemId(request.getWorkOrderItemId())
                .productionType(request.getProductionType())
                .stage(request.getStage())
                .inputQuantity(request.getInputQuantity() != null ? request.getInputQuantity() : 0)
                .outputQuantity(request.getOutputQuantity() != null ? request.getOutputQuantity() : 0)
                .rejectedQuantity(request.getRejectedQuantity() != null ? request.getRejectedQuantity() : 0)
                .operator(request.getOperator())
                .machineCode(resolveMachineCode(request.getMachineCode()))
                .entryDate(request.getEntryDate())
                .status(request.getStatus() != null ? EntryStatus.fromDisplayName(request.getStatus()) : EntryStatus.PENDING)
                .remarks(request.getRemarks())
                .build();
        }

        entry = entryRepository.save(entry);

        // Update item's current stage if needed
        updateItemStageFromEntry(order, entry);

        return OrderMapper.toEntryDTO(entry);
    }

    /**
     * Get all entries for a production order.
     */
    @Transactional(readOnly = true)
    public List<ProductionEntryDTO> getEntriesForOrder(String workOrderId) {
        ProductionOrder order = orderRepository.findByWorkOrder(workOrderId)
            .orElseThrow(() -> new NoSuchElementException("Production order not found: " + workOrderId));
        return entryRepository.findByProductionOrderIdOrderByStageAsc(order.getId()).stream()
            .map(OrderMapper::toEntryDTO)
            .collect(Collectors.toList());
    }

    /**
     * Get all entries for a specific item.
     */
    @Transactional(readOnly = true)
    public List<ProductionEntryDTO> getEntriesForItem(String workOrderId, String workOrderItemId) {
        ProductionOrder order = orderRepository.findByWorkOrder(workOrderId)
            .orElseThrow(() -> new NoSuchElementException("Production order not found: " + workOrderId));
        return entryRepository.findByProductionOrderIdAndWorkOrderItemId(order.getId(), workOrderItemId).stream()
            .map(OrderMapper::toEntryDTO)
            .collect(Collectors.toList());
    }

    /**
     * Get a specific entry.
     */
    @Transactional(readOnly = true)
    public ProductionEntryDTO getEntry(String workOrderId, String stage, String workOrderItemId) {
        ProductionOrder order = orderRepository.findByWorkOrder(workOrderId)
            .orElseThrow(() -> new NoSuchElementException("Production order not found: " + workOrderId));
        ProductionEntry entry = entryRepository.findByProductionOrderIdAndWorkOrderItemIdAndStage(
            order.getId(), workOrderItemId != null ? workOrderItemId : "", stage
        ).orElse(null);
        return OrderMapper.toEntryDTO(entry);
    }

    /**
     * Delete a stage entry.
     */
    public void deleteEntry(Long entryId) {
        entryRepository.deleteById(entryId);
    }

    /**
     * Delete all entries for a production order.
     */
    public void deleteEntriesForOrder(String workOrderId) {
        ProductionOrder order = orderRepository.findByWorkOrder(workOrderId).orElse(null);
        if (order != null) {
            entryRepository.deleteByProductionOrderId(order.getId());
        }
    }

    /**
     * Get all production entries (used by the Production Summary report).
     */
    @Transactional(readOnly = true)
    public List<ProductionEntryDTO> getAllEntries() {
        return entryRepository.findAll().stream()
            .map(OrderMapper::toEntryDTO)
            .collect(Collectors.toList());
    }

    /**
     * Get all entries for a specific production type.
     */
    @Transactional(readOnly = true)
    public List<ProductionEntryDTO> getEntriesByProductionType(String productionType) {
        return entryRepository.findByProductionTypeOrderByCreatedAtDesc(productionType).stream()
            .map(OrderMapper::toEntryDTO)
            .collect(Collectors.toList());
    }

    /**
     * Get entries by work order and production type.
     */
    @Transactional(readOnly = true)
    public List<ProductionEntryDTO> getEntriesByWorkOrderAndType(String workOrderId, String productionType) {
        ProductionOrder order = orderRepository.findByWorkOrder(workOrderId)
            .orElseThrow(() -> new NoSuchElementException("Production order not found: " + workOrderId));
        return entryRepository.findByProductionTypeAndWorkOrder(productionType, workOrderId).stream()
            .map(OrderMapper::toEntryDTO)
            .collect(Collectors.toList());
    }

    /**
     * Get entry by ID.
     */
    @Transactional(readOnly = true)
    public ProductionEntryDTO getEntryById(Long id) {
        ProductionEntry entry = entryRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Entry not found: " + id));
        return OrderMapper.toEntryDTO(entry);
    }

    /**
     * Paginate and filter a list of entry DTOs.
     */
    public PagedResponse<ProductionEntryDTO> paginateAndFilter(
            List<ProductionEntryDTO> all, String search, String status, String stage,
            String sortBy, String sortDir, int page, int size) {
        List<ProductionEntryDTO> filtered = all;
        if (search != null && !search.isBlank()) {
            String q = search.toLowerCase();
            filtered = all.stream()
                .filter(e -> (e.getStage() != null && e.getStage().toLowerCase().contains(q))
                    || (e.getOperator() != null && e.getOperator().toLowerCase().contains(q))
                    || (e.getWorkOrderId() != null && e.getWorkOrderId().toLowerCase().contains(q)))
                .collect(Collectors.toList());
        }
        if (status != null && !status.isBlank() && !"All".equals(status)) {
            filtered = filtered.stream()
                .filter(e -> status.equalsIgnoreCase(e.getStatus()))
                .collect(Collectors.toList());
        }
        if (stage != null && !stage.isBlank() && !"All Stages".equals(stage)) {
            filtered = filtered.stream()
                .filter(e -> stage.equals(e.getStage()))
                .collect(Collectors.toList());
        }
        // Sort
        boolean asc = !"desc".equalsIgnoreCase(sortDir);
        if ("stage".equalsIgnoreCase(sortBy)) {
            filtered.sort(asc ? Comparator.comparing(ProductionEntryDTO::getStage, Comparator.nullsLast(String::compareTo))
                : Comparator.comparing(ProductionEntryDTO::getStage, Comparator.nullsLast(String::compareTo)).reversed());
        } else if ("operator".equalsIgnoreCase(sortBy)) {
            filtered.sort(asc ? Comparator.comparing(ProductionEntryDTO::getOperator, Comparator.nullsLast(String::compareTo))
                : Comparator.comparing(ProductionEntryDTO::getOperator, Comparator.nullsLast(String::compareTo)).reversed());
        } else if ("status".equalsIgnoreCase(sortBy)) {
            filtered.sort(asc ? Comparator.comparing(ProductionEntryDTO::getStatus, Comparator.nullsLast(String::compareTo))
                : Comparator.comparing(ProductionEntryDTO::getStatus, Comparator.nullsLast(String::compareTo)).reversed());
        } else {
            filtered.sort(asc ? Comparator.comparing(ProductionEntryDTO::getCreatedAt, Comparator.nullsLast(String::compareTo))
                : Comparator.comparing(ProductionEntryDTO::getCreatedAt, Comparator.nullsLast(String::compareTo)).reversed());
        }
        int total = filtered.size();
        int start = page * size;
        int end = Math.min(start + size, total);
        List<ProductionEntryDTO> paged = start < total ? filtered.subList(start, end) : List.of();
        return PagedResponse.<ProductionEntryDTO>builder()
            .content(paged)
            .page(page)
            .size(size)
            .totalElements((long) total)
            .totalPages((int) Math.ceil((double) total / size))
            .first(page == 0)
            .last(end >= total)
            .build();
    }

    /**
     * Get stats for a specific production type.
     */
    @Transactional(readOnly = true)
    public com.vishatech.erp.dto.production.CastingStatsDTO getStatsByProductionType(String productionType) {
        long total = entryRepository.countByProductionType(productionType);
        long pending = entryRepository.countByProductionTypeAndStatus(productionType, EntryStatus.PENDING);
        long inProgress = entryRepository.countByProductionTypeAndStatus(productionType, EntryStatus.IN_PROGRESS);
        long hold = entryRepository.countByProductionTypeAndStatus(productionType, EntryStatus.HOLD);
        long completed = entryRepository.countByProductionTypeAndStatus(productionType, EntryStatus.COMPLETED);
        long skipped = entryRepository.countByProductionTypeAndStatus(productionType, EntryStatus.SKIPPED);
        Integer totalInput = entryRepository.sumInputQuantityByType(productionType);
        Integer totalOutput = entryRepository.sumOutputQuantityByType(productionType);
        Integer totalRejected = entryRepository.sumRejectedQuantityByType(productionType);
        long distinctOrders = entryRepository.countDistinctProductionOrdersByType(productionType);
        Map<String, Long> jobsPerStage = new java.util.LinkedHashMap<>();
        List<Object[]> stageCounts = entryRepository.countByProductionTypeAndStageGrouped(productionType);
        for (Object[] row : stageCounts) {
            jobsPerStage.put((String) row[0], ((Number) row[1]).longValue());
        }
        List<String> stages = List.of(
            "Raw Material", "Cutting", "Bending", "Welding", "Hard Facing"
        );
        if ("Assembly".equals(productionType)) {
            stages = List.of("Assembly");
        }
        return com.vishatech.erp.dto.production.CastingStatsDTO.builder()
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
            .stages(stages.toArray(new String[0]))
            .jobsPerStage(jobsPerStage)
            .build();
    }

    /**
     * Start a job: Pending -> In Progress.
     */
    public ProductionEntryDTO startJob(Long id) {
        ProductionEntry entry = entryRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Entry not found: " + id));
        if (entry.getStatus() != EntryStatus.PENDING) {
            throw new BadRequestException("Cannot start job in '" + entry.getStatus().getDisplayName() + "' status.");
        }
        entry.setStatus(EntryStatus.IN_PROGRESS);
        entry = entryRepository.save(entry);
        return OrderMapper.toEntryDTO(entry);
    }

    /**
     * Hold a job: In Progress -> Hold.
     */
    public ProductionEntryDTO holdJob(Long id) {
        ProductionEntry entry = entryRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Entry not found: " + id));
        if (entry.getStatus() != EntryStatus.IN_PROGRESS) {
            throw new BadRequestException("Cannot hold job in '" + entry.getStatus().getDisplayName() + "' status.");
        }
        entry.setStatus(EntryStatus.HOLD);
        entry = entryRepository.save(entry);
        return OrderMapper.toEntryDTO(entry);
    }

    /**
     * Resume a job: Hold -> In Progress.
     */
    public ProductionEntryDTO resumeJob(Long id) {
        ProductionEntry entry = entryRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Entry not found: " + id));
        if (entry.getStatus() != EntryStatus.HOLD) {
            throw new BadRequestException("Cannot resume job in '" + entry.getStatus().getDisplayName() + "' status.");
        }
        entry.setStatus(EntryStatus.IN_PROGRESS);
        entry = entryRepository.save(entry);
        return OrderMapper.toEntryDTO(entry);
    }

    /**
     * Complete a job: In Progress/Hold -> Completed.
     */
    public ProductionEntryDTO completeJob(Long id) {
        ProductionEntry entry = entryRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Entry not found: " + id));
        if (entry.getStatus() != EntryStatus.IN_PROGRESS && entry.getStatus() != EntryStatus.HOLD) {
            throw new BadRequestException("Cannot complete job in '" + entry.getStatus().getDisplayName() + "' status.");
        }
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
     * Update an existing entry.
     */
    public ProductionEntryDTO updateEntry(Long id, CreateProductionEntryRequest request) {
        ProductionEntry entry = entryRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Entry not found: " + id));
        if (request.getInputQuantity() != null) entry.setInputQuantity(request.getInputQuantity());
        if (request.getOutputQuantity() != null) entry.setOutputQuantity(request.getOutputQuantity());
        if (request.getRejectedQuantity() != null) entry.setRejectedQuantity(request.getRejectedQuantity());
        if (request.getOperator() != null) entry.setOperator(request.getOperator());
        if (request.getMachineCode() != null) entry.setMachineCode(resolveMachineCode(request.getMachineCode()));
        if (request.getEntryDate() != null) entry.setEntryDate(request.getEntryDate());
        if (request.getStatus() != null) entry.setStatus(EntryStatus.fromDisplayName(request.getStatus()));
        if (request.getRemarks() != null) entry.setRemarks(request.getRemarks());
        if (request.getStage() != null) entry.setStage(request.getStage());
        if (request.getProductionType() != null) entry.setProductionType(request.getProductionType());
        entry = entryRepository.save(entry);
        return OrderMapper.toEntryDTO(entry);
    }

    /**
     * Update item's current stage based on the entry.
     */
    private void updateItemStageFromEntry(ProductionOrder order, ProductionEntry entry) {
        if (order.getItems() == null || order.getItems().isEmpty()) return;
        if (entry.getWorkOrderItemId() == null || entry.getWorkOrderItemId().isBlank()) return;

        // Find the item by matching the item id pattern
        for (ProductionOrderItem item : order.getItems()) {
            if (item.getId() != null && entry.getWorkOrderItemId() != null) {
                try {
                    Long itemId = Long.parseLong(entry.getWorkOrderItemId());
                    if (item.getId().equals(itemId)) {
                        if (entry.getStatus() == EntryStatus.COMPLETED || entry.getStatus() == EntryStatus.IN_PROGRESS) {
                            item.setCurrentStage(entry.getStage());
                        }
                        itemRepository.save(item);
                        break;
                    }
                } catch (NumberFormatException e) {
                    // Try matching by product name hash
                    String itemHash = item.getProductName().toLowerCase().replaceAll("[^a-z0-9]", "-");
                    if (entry.getWorkOrderItemId().equals(itemHash)) {
                        if (entry.getStatus() == EntryStatus.COMPLETED || entry.getStatus() == EntryStatus.IN_PROGRESS) {
                            item.setCurrentStage(entry.getStage());
                        }
                        itemRepository.save(item);
                        break;
                    }
                }
            }
        }
    }
}
