package com.vishatech.erp.service.production;

import com.vishatech.erp.dto.production.*;
import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.entity.production.*;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.repository.production.*;
import com.vishatech.erp.sales.api.SalesOrderLookupPort;
import com.vishatech.erp.sales.api.SalesOrderLookupPort.SalesOrderRef;
import com.vishatech.erp.util.production.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Production Order service — all business logic for Work Orders.
 * The backend is the source of truth for validation, workflow, numbering,
 * and progress calculation.
 */
@Service
@Transactional
public class ProductionOrderService {

    private final ProductionOrderRepository orderRepository;
    private final ProductionOrderItemRepository itemRepository;
    private final ApprovalHistoryRepository approvalHistoryRepository;
    private final TimelineEventRepository timelineEventRepository;
    private final ProductionEntryRepository entryRepository;
    private final NumberGenerator numberGenerator;
    private final WorkflowValidator workflowValidator;
    private final SalesOrderLookupPort salesOrderLookup;
    /** Workflow notifications — writes into the shared notification system. */
    private final ProductionNotificationPublisher notificationPublisher;

    @PersistenceContext
    private EntityManager entityManager;

    public ProductionOrderService(ProductionOrderRepository orderRepository,
                                  ProductionOrderItemRepository itemRepository,
                                  ApprovalHistoryRepository approvalHistoryRepository,
                                  TimelineEventRepository timelineEventRepository,
                                  ProductionEntryRepository entryRepository,
                                  NumberGenerator numberGenerator,
                                  WorkflowValidator workflowValidator,
                                  SalesOrderLookupPort salesOrderLookup,
                                  ProductionNotificationPublisher notificationPublisher) {
        this.orderRepository = orderRepository;
        this.itemRepository = itemRepository;
        this.approvalHistoryRepository = approvalHistoryRepository;
        this.timelineEventRepository = timelineEventRepository;
        this.entryRepository = entryRepository;
        this.numberGenerator = numberGenerator;
        this.workflowValidator = workflowValidator;
        this.salesOrderLookup = salesOrderLookup;
        this.notificationPublisher = notificationPublisher;
    }

    // ========================
    // CRUD Operations
    // ========================

    /**
     * Create a new Production Order with items.
     * Generates Work Order number and batch numbers server-side.
     */
    public ProductionOrderDTO createOrder(CreateProductionOrderRequest request, String createdBy) {
        // Validate
        validateCreateRequest(request);

        // Generate Work Order number
        String workOrderNumber = numberGenerator.generateWorkOrderNumber();

        // Determine primary production type from first item
        ProductionType primaryType = ProductionType.fromDisplayName(
            request.getItems().get(0).getProductionType());

        // Create the order
        ProductionOrder order = ProductionOrder.builder()
            .workOrder(workOrderNumber)
            .salesOrderId(request.getSalesOrderId())
            .salesOrderNumber(request.getSalesOrderNumber())
            .customer(request.getCustomer())
            .customerCode(request.getCustomerCode())
            .startDate(request.getStartDate())
            .dueDate(request.getDueDate())
            .priority(Priority.fromDisplayName(request.getPriority()))
            .status(OrderStatus.DRAFT)
            .productionType(primaryType)
            .progress(0)
            .remarks(request.getRemarks())
            .createdBy(createdBy != null ? createdBy : "system")
            .build();

        // Resolve the CPO (Sales Order) reference — persist the real Sales Order
        // primary key and canonical SO number, and auto-fill the customer from the
        // linked CPO when the client did not supply one.
        SalesOrderRef cpo = resolveCpo(request.getSalesOrderId(), request.getSalesOrderNumber());
        if (cpo != null) {
            order.setSalesOrderId(String.valueOf(cpo.id()));
            order.setSalesOrderNumber(cpo.soNo());
            if (request.getCustomer() == null || request.getCustomer().isBlank()) {
                order.setCustomer(cpo.clientName());
            }
            if ((request.getCustomerCode() == null || request.getCustomerCode().isBlank())
                    && cpo.clientId() != null) {
                order.setCustomerCode(String.valueOf(cpo.clientId()));
            }
        }

        // Create items — each item keeps its own due date. A client that omits
        // the item date inherits the Work Order due date; the Work Order date is
        // never derived from an item's.
        List<ProductionOrderItem> items = new ArrayList<>();
        for (CreateProductionOrderRequest.CreateOrderItemRequest itemReq : request.getItems()) {
            ProductionOrderItem item = newItemFromRequest(itemReq, order.getDueDate());
            order.addItem(item);
            items.add(item);
        }

        // Sync legacy fields
        order.syncLegacyFieldsFromFirstItem();

        // Save
        order = orderRepository.save(order);

        // Record timeline event
        addTimelineEvent(order, "Work Order Created", Instant.now(), "Completed", "System",
            "Work Order " + workOrderNumber + " created.");
        entityManager.flush();

        return OrderMapper.toDTO(order);
    }

    /**
     * Update an existing Production Order.
     */
    public ProductionOrderDTO updateOrder(Long backendId, UpdateProductionOrderRequest request) {
        ProductionOrder order = orderRepository.findById(backendId)
            .orElseThrow(() -> new NoSuchElementException("Production order not found with id: " + backendId));

        // Only allow editing in Draft status. A refused edit is a client error:
        // an IllegalStateException fell through to the catch-all handler and the
        // caller got an opaque 500, so the reason never reached the UI.
        if (order.getStatus() != OrderStatus.DRAFT) {
            throw new BadRequestException("Can only edit Production Orders in Draft status");
        }

        // Update fields — CPO reference is re-resolved so the real Sales Order
        // primary key is stored even if a legacy client sent the SO number.
        if (request.getSalesOrderId() != null || request.getSalesOrderNumber() != null) {
            SalesOrderRef cpo = resolveCpo(request.getSalesOrderId(), request.getSalesOrderNumber());
            if (cpo != null) {
                order.setSalesOrderId(String.valueOf(cpo.id()));
                order.setSalesOrderNumber(cpo.soNo());
            } else {
                if (request.getSalesOrderId() != null) order.setSalesOrderId(request.getSalesOrderId());
                if (request.getSalesOrderNumber() != null) order.setSalesOrderNumber(request.getSalesOrderNumber());
            }
        }
        if (request.getCustomer() != null) order.setCustomer(request.getCustomer());
        if (request.getCustomerCode() != null) order.setCustomerCode(request.getCustomerCode());
        if (request.getStartDate() != null) order.setStartDate(request.getStartDate());
        if (request.getDueDate() != null) order.setDueDate(request.getDueDate());
        if (request.getPriority() != null) order.setPriority(Priority.fromDisplayName(request.getPriority()));
        if (request.getRemarks() != null) order.setRemarks(request.getRemarks());

        // Update items if provided.
        //
        // Items arrive in display order (that is how the create form builds
        // them), so the rows that already exist are matched positionally and
        // updated IN PLACE.
        //
        // This previously did `order.getItems().clear()` followed by addItem()
        // for every incoming item. Because the collection is mapped with
        // orphanRemoval = true that deleted each item row and re-inserted it, so
        // every save handed each item a BRAND-NEW primary key. Everything keyed
        // on that id then pointed at an item row that no longer existed:
        // technical verification records, item drawings/models and shop-floor
        // jobs all silently detached, and an item that had been verified went
        // back to "Pending" the moment its Work Order was edited.
        if (request.getItems() != null && !request.getItems().isEmpty()) {
            List<CreateProductionOrderRequest.CreateOrderItemRequest> incoming = request.getItems();
            List<ProductionOrderItem> existing = new ArrayList<>(order.getItems());

            // The edit form identifies every existing item by its own primary key.
            // Matching on that id (instead of the item's position) is what keeps an
            // item's row — and with it its attachments, Technical Verification row,
            // drawings and shop-floor jobs — attached to the SAME item when another
            // item above it is removed or inserted. A caller that sends no item id
            // at all keeps the historical positional behaviour below.
            boolean identified = incoming.stream().anyMatch(itemReq -> itemReq.getId() != null);

            if (identified) {
                Set<Long> kept = new HashSet<>();
                for (CreateProductionOrderRequest.CreateOrderItemRequest itemReq : incoming) {
                    ProductionOrderItem item = itemReq.getId() == null ? null
                        : existing.stream()
                            .filter(row -> row.getId() != null && row.getId().equals(itemReq.getId()))
                            .findFirst()
                            .orElse(null);
                    if (item == null) {
                        // A newly added item (or an id that is not part of this
                        // Work Order — treated as new rather than moving another
                        // item's data onto it).
                        order.addItem(newItemFromRequest(itemReq, order.getDueDate()));
                    } else {
                        applyItemRequest(item, itemReq);
                        kept.add(item.getId());
                    }
                }
                // Anything the request no longer names was removed by the user.
                for (ProductionOrderItem item : existing) {
                    if (item.getId() != null && !kept.contains(item.getId())) {
                        order.removeItem(item);
                    }
                }
            } else {
                int retained = Math.min(existing.size(), incoming.size());

                // Update the items that survive this save, keeping their id.
                for (int i = 0; i < retained; i++) {
                    applyItemRequest(existing.get(i), incoming.get(i));
                }

                // Drop the items that are no longer part of the Work Order.
                for (int i = existing.size() - 1; i >= retained; i--) {
                    order.removeItem(existing.get(i));
                }

                // Append the items that were added.
                for (int i = retained; i < incoming.size(); i++) {
                    order.addItem(newItemFromRequest(incoming.get(i), order.getDueDate()));
                }
            }
        }

        order.syncLegacyFieldsFromFirstItem();

        // Record timeline event
        addTimelineEvent(order, "Work Order Edited", Instant.now(), "Completed", "System",
            "Work Order details updated.");
        entityManager.flush();

        order = orderRepository.save(order);
        return OrderMapper.toDTO(order);
    }

    /**
     * Build a brand-new item row from its request, issuing the batch number and
     * starting stage for its production type.
     *
     * @param fallbackDueDate the Work Order due date used only when the client
     *                        did not send an item-level date
     */
    private ProductionOrderItem newItemFromRequest(
            CreateProductionOrderRequest.CreateOrderItemRequest itemReq, LocalDate fallbackDueDate) {
        ProductionType itemProductionType = ProductionType.fromDisplayName(itemReq.getProductionType());
        return ProductionOrderItem.builder()
            .productName(itemReq.getProductName())
            .productCode(itemReq.getProductCode())
            .quantity(itemReq.getQuantity())
            .dueDate(itemReq.getDueDate() != null ? itemReq.getDueDate() : fallbackDueDate)
            .producedQuantity(0)
            .rejectedQuantity(0)
            .productionType(itemProductionType)
            .department(itemProductionType.getDisplayName())
            .currentStage(ProductionWorkflow.getStages(itemProductionType).stream().findFirst().orElse(null))
            .status(OrderStatus.PENDING)
            .batchNumber(numberGenerator.generateBatchNumber(itemProductionType))
            .patternNumber(itemReq.getPatternNumber())
            .drawingNumber(itemReq.getDrawingNumber())
            .drawingRevision(itemReq.getDrawingRevision())
            .build();
    }

    /**
     * Copy an incoming item request onto an existing row, keeping the row's id.
     * A batch number and a starting stage belong to a production type, so they are
     * only regenerated when the type actually changes — otherwise an untouched item
     * would lose the batch it was issued and be pushed back to the first stage.
     * The item's own due date is only changed when the request carries one, so a
     * client that does not know about item dates never clears a stored date.
     */
    private void applyItemRequest(ProductionOrderItem item,
                                  CreateProductionOrderRequest.CreateOrderItemRequest itemReq) {
        ProductionType itemProductionType = ProductionType.fromDisplayName(itemReq.getProductionType());
        boolean typeChanged = item.getProductionType() != itemProductionType;

        item.setProductName(itemReq.getProductName());
        item.setProductCode(itemReq.getProductCode());
        item.setQuantity(itemReq.getQuantity());
        item.setProductionType(itemProductionType);
        item.setDepartment(itemProductionType.getDisplayName());
        item.setPatternNumber(itemReq.getPatternNumber());
        item.setDrawingNumber(itemReq.getDrawingNumber());
        item.setDrawingRevision(itemReq.getDrawingRevision());
        if (itemReq.getDueDate() != null) {
            item.setDueDate(itemReq.getDueDate());
        }

        if (typeChanged) {
            item.setBatchNumber(numberGenerator.generateBatchNumber(itemProductionType));
            item.setCurrentStage(ProductionWorkflow.getStages(itemProductionType).stream().findFirst().orElse(null));
        }
    }

    /**
     * Delete a Production Order.
     */
    public void deleteOrder(Long backendId) {
        ProductionOrder order = orderRepository.findById(backendId)
            .orElseThrow(() -> new NoSuchElementException("Production order not found with id: " + backendId));

        if (order.getStatus() != OrderStatus.DRAFT) {
            throw new BadRequestException("Can only delete Production Orders in Draft status");
        }

        orderRepository.delete(order);
    }

    /**
     * Get a Production Order by id.
     */
    @Transactional(readOnly = true)
    public ProductionOrderDTO getOrder(Long backendId) {
        ProductionOrder order = orderRepository.findById(backendId)
            .orElseThrow(() -> new NoSuchElementException("Production order not found with id: " + backendId));
        return OrderMapper.toDTO(order);
    }

    /**
     * Get a Production Order by Work Order number.
     */
    @Transactional(readOnly = true)
    public ProductionOrderDTO getOrderByWorkOrder(String workOrder) {
        ProductionOrder order = orderRepository.findByWorkOrder(workOrder)
            .orElseThrow(() -> new NoSuchElementException("Production order not found: " + workOrder));
        return OrderMapper.toDTO(order);
    }

    /**
     * Get all Production Orders with pagination, search, and filters.
     */
    @Transactional(readOnly = true)
    public PagedResponse<ProductionOrderDTO> getOrders(
            String search, String status, String productionType, String priority,
            String currentStage, String salesOrder,
            String startDateFrom, String startDateTo,
            String dueDateFrom, String dueDateTo,
            int page, int size, String sort, String direction) {

        Sort sortOrder;
        if (sort != null && !sort.isBlank()) {
            Sort.Direction dir = "desc".equalsIgnoreCase(direction) ? Sort.Direction.DESC : Sort.Direction.ASC;
            // Map frontend sort field to entity field
            String entityField = mapSortField(sort);
            sortOrder = Sort.by(dir, entityField);
        } else {
            sortOrder = Sort.by(Sort.Direction.DESC, "createdAt");
        }

        PageRequest pageRequest = PageRequest.of(Math.max(0, page), Math.max(1, Math.min(size, 100)), sortOrder);

        Page<ProductionOrder> orderPage;

        boolean hasFilters = (status != null && !status.isBlank()) ||
            (productionType != null && !productionType.isBlank()) ||
            (priority != null && !priority.isBlank()) ||
            (currentStage != null && !currentStage.isBlank()) ||
            (salesOrder != null && !salesOrder.isBlank()) ||
            (startDateFrom != null && !startDateFrom.isBlank()) ||
            (startDateTo != null && !startDateTo.isBlank()) ||
            (dueDateFrom != null && !dueDateFrom.isBlank()) ||
            (dueDateTo != null && !dueDateTo.isBlank());

        if (hasFilters) {
            orderPage = orderRepository.findFiltered(
                search,
                status != null && !status.isBlank() ? OrderStatus.fromDisplayName(status) : null,
                productionType != null && !productionType.isBlank() ? ProductionType.fromDisplayName(productionType) : null,
                priority != null && !priority.isBlank() ? Priority.fromDisplayName(priority) : null,
                currentStage,
                salesOrder,
                startDateFrom != null && !startDateFrom.isBlank() ? LocalDate.parse(startDateFrom) : null,
                startDateTo != null && !startDateTo.isBlank() ? LocalDate.parse(startDateTo) : null,
                dueDateFrom != null && !dueDateFrom.isBlank() ? LocalDate.parse(dueDateFrom) : null,
                dueDateTo != null && !dueDateTo.isBlank() ? LocalDate.parse(dueDateTo) : null,
                pageRequest
            );
        } else {
            orderPage = orderRepository.searchOrders(search, pageRequest);
        }

        List<ProductionOrderDTO> dtos = orderPage.getContent().stream()
            .map(OrderMapper::toDTO)
            .collect(Collectors.toList());

        return PagedResponse.<ProductionOrderDTO>builder()
            .content(dtos)
            .page(orderPage.getNumber())
            .size(orderPage.getSize())
            .totalElements(orderPage.getTotalElements())
            .totalPages(orderPage.getTotalPages())
            .first(orderPage.isFirst())
            .last(orderPage.isLast())
            .build();
    }

    // ========================
    // Status Transitions
    // ========================

    /**
     * Transition a Production Order to a new status.
     * Validates the transition is allowed by the workflow.
     */
    public ProductionOrderDTO transitionStatus(Long backendId, OrderStatus targetStatus, String performedBy, String remarks) {
        ProductionOrder order = orderRepository.findById(backendId)
            .orElseThrow(() -> new NoSuchElementException("Production order not found with id: " + backendId));

        OrderStatus fromStatus = order.getStatus();
        workflowValidator.validateTransition(fromStatus, targetStatus);

        // Record approval data based on which approval stage this is
        Instant now = Instant.now();
        if (targetStatus == OrderStatus.PENDING_PRODUCTION_APPROVAL || targetStatus == OrderStatus.PRODUCTION_APPROVED) {
            if (targetStatus == OrderStatus.PRODUCTION_APPROVED) {
                order.setProductionApprovedBy(performedBy);
                order.setProductionApprovedAt(now);
            }
        }
        if (targetStatus == OrderStatus.PENDING_ADMIN_APPROVAL || targetStatus == OrderStatus.ADMIN_APPROVED) {
            if (targetStatus == OrderStatus.ADMIN_APPROVED) {
                order.setAdminApprovedBy(performedBy);
                order.setAdminApprovedAt(now);
            }
        }

        // Update status
        order.setStatus(targetStatus);

        // Record approval history
        ApprovalHistory history = ApprovalHistory.builder()
            .productionOrder(order)
            .fromStatus(fromStatus)
            .toStatus(targetStatus)
            .action(targetStatus.getDisplayName())
            .performedBy(performedBy)
            .performedAt(now)
            .remarks(remarks)
            .build();
        history = approvalHistoryRepository.save(history);

        // Record timeline event
        addTimelineEvent(order, targetStatus.getDisplayName(), now, "Completed", performedBy, remarks);
        // Notify the team through the shared notification system. Every order
        // event is raised here — this is the one place a status change goes
        // through — and the publisher honours the Production Settings toggles.
        // Best effort: a notification failure is logged there and never fails
        // the transition.
        notificationPublisher.publishTransition(order, history.getId(), remarks);
        entityManager.flush();
        entityManager.clear();

        // Reload order to get fresh associations
        order = orderRepository.findById(order.getId()).orElse(order);
        return OrderMapper.toDTO(order);
    }

    /**
     * Convenience methods for each approval step.
     */
    public ProductionOrderDTO submitProductionApproval(Long backendId, String performedBy, String remarks) {
        return transitionStatus(backendId, OrderStatus.PENDING_PRODUCTION_APPROVAL, performedBy, remarks);
    }

    public ProductionOrderDTO approveProduction(Long backendId, String performedBy, String remarks) {
        return transitionStatus(backendId, OrderStatus.PRODUCTION_APPROVED, performedBy, remarks);
    }

    public ProductionOrderDTO submitAdminApproval(Long backendId, String performedBy, String remarks) {
        return transitionStatus(backendId, OrderStatus.PENDING_ADMIN_APPROVAL, performedBy, remarks);
    }

    public ProductionOrderDTO approveAdmin(Long backendId, String performedBy, String remarks) {
        return transitionStatus(backendId, OrderStatus.ADMIN_APPROVED, performedBy, remarks);
    }

    public ProductionOrderDTO finalApprove(Long backendId, String performedBy, String remarks) {
        return transitionStatus(backendId, OrderStatus.APPROVED, performedBy, remarks);
    }

    public ProductionOrderDTO startProduction(Long backendId, String performedBy, String remarks) {
        return transitionStatus(backendId, OrderStatus.IN_PROGRESS, performedBy, remarks);
    }

    public ProductionOrderDTO holdProduction(Long backendId, String performedBy, String remarks) {
        return transitionStatus(backendId, OrderStatus.HOLD, performedBy, remarks);
    }

    public ProductionOrderDTO resumeProduction(Long backendId, String performedBy, String remarks) {
        return transitionStatus(backendId, OrderStatus.IN_PROGRESS, performedBy, remarks);
    }

    /**
     * Hand the order over to Quality (In Progress → Pending QC).
     * Without this step the only way to reach Completed would be to skip the
     * QC gate entirely, so the shop floor and order detail "Send to Quality"
     * action has a matching backend transition.
     */
    public ProductionOrderDTO sendToQuality(Long backendId, String performedBy, String remarks) {
        return transitionStatus(backendId, OrderStatus.PENDING_QC, performedBy, remarks);
    }

    public ProductionOrderDTO completeProduction(Long backendId, String performedBy, String remarks) {
        return transitionStatus(backendId, OrderStatus.COMPLETED, performedBy, remarks);
    }

    /** Completed → Packed (packing finished for this Work Order). */
    public ProductionOrderDTO markPacked(Long backendId, String performedBy, String remarks) {
        return transitionStatus(backendId, OrderStatus.PACKED, performedBy, remarks);
    }

    /** Packed → Ready for Dispatch (packing cleared the order for shipping). */
    public ProductionOrderDTO markReadyForDispatch(Long backendId, String performedBy, String remarks) {
        return transitionStatus(backendId, OrderStatus.READY_FOR_DISPATCH, performedBy, remarks);
    }

    public ProductionOrderDTO cancelOrder(Long backendId, String performedBy, String remarks) {
        return transitionStatus(backendId, OrderStatus.CANCELLED, performedBy, remarks);
    }

    public ProductionOrderDTO rejectProduction(Long backendId, String performedBy, String remarks) {
        return transitionStatus(backendId, OrderStatus.PRODUCTION_REJECTED, performedBy, remarks);
    }

    public ProductionOrderDTO rejectAdmin(Long backendId, String performedBy, String remarks) {
        return transitionStatus(backendId, OrderStatus.ADMIN_REJECTED, performedBy, remarks);
    }

    public ProductionOrderDTO returnToDraft(Long backendId, String performedBy, String remarks) {
        return transitionStatus(backendId, OrderStatus.DRAFT, performedBy, remarks);
    }

    public ProductionOrderDTO resubmitToProduction(Long backendId, String performedBy, String remarks) {
        return transitionStatus(backendId, OrderStatus.PRODUCTION_APPROVED, performedBy, remarks);
    }

    // ========================
    // Statistics
    // ========================

    @Transactional(readOnly = true)
    public ProductionStatsDTO getStatistics() {
        LocalDate today = LocalDate.now();
        long total = orderRepository.count();
        long overdue = orderRepository.countOverdue(today);
        long dueToday = orderRepository.countDueToday(today);
        long urgentAndHigh = orderRepository.countUrgentAndHighPriority();

        return ProductionStatsDTO.builder()
            .total(total)
            .draft(orderRepository.countByStatus(OrderStatus.DRAFT))
            .pendingProductionApproval(orderRepository.countByStatus(OrderStatus.PENDING_PRODUCTION_APPROVAL))
            .productionApproved(orderRepository.countByStatus(OrderStatus.PRODUCTION_APPROVED))
            .pendingAdminApproval(orderRepository.countByStatus(OrderStatus.PENDING_ADMIN_APPROVAL))
            .adminApproved(orderRepository.countByStatus(OrderStatus.ADMIN_APPROVED))
            .approved(orderRepository.countByStatus(OrderStatus.APPROVED))
            .pending(orderRepository.countByStatus(OrderStatus.PENDING))
            .inProgress(orderRepository.countByStatus(OrderStatus.IN_PROGRESS))
            .hold(orderRepository.countByStatus(OrderStatus.HOLD))
            .pendingQC(orderRepository.countByStatus(OrderStatus.PENDING_QC))
            .completed(orderRepository.countByStatus(OrderStatus.COMPLETED))
            .packed(orderRepository.countByStatus(OrderStatus.PACKED))
            .readyForDispatch(orderRepository.countByStatus(OrderStatus.READY_FOR_DISPATCH))
            .cancelled(orderRepository.countByStatus(OrderStatus.CANCELLED))
            .overdue(overdue)
            .dueToday(dueToday)
            .urgent(urgentAndHigh)
            .highPriority(urgentAndHigh)
            .build();
    }

    /** Average order progress percentage across all persisted Production Orders. */
    @Transactional(readOnly = true)
    public int getAverageProgress() {
        Double avg = orderRepository.avgProgress();
        return avg == null ? 0 : (int) Math.round(avg);
    }

    // ========================
    // Workflow Status (derived from backend state)
    // ========================

    @Transactional(readOnly = true)
    public WorkflowStatusDTO getWorkflowStatus(Long backendId) {
        ProductionOrder order = orderRepository.findById(backendId)
            .orElseThrow(() -> new NoSuchElementException("Production order not found with id: " + backendId));

        ProductionType productionType = order.getProductionType();
        List<String> stages = productionType != null ? ProductionWorkflow.getStages(productionType) : List.of();

        // Get entries
        List<ProductionEntry> entries = entryRepository.findByProductionOrderIdOrderByStageAsc(backendId);

        // Build stage progress
        Set<String> completedStages = new HashSet<>();
        List<WorkflowStatusDTO.StageProgressDTO> stageProgressList = new ArrayList<>();

        for (String stage : stages) {
            ProductionEntry entry = entries.stream()
                .filter(e -> stage.equals(e.getStage()))
                .findFirst().orElse(null);

            String stageStatus = entry != null ? entry.getStatus().getDisplayName() : "Pending";
            boolean isDone = entry != null && (entry.getStatus() == EntryStatus.COMPLETED || entry.getStatus() == EntryStatus.SKIPPED);
            boolean isSkipped = entry != null && entry.getStatus() == EntryStatus.SKIPPED;

            if (isDone) completedStages.add(stage);

            stageProgressList.add(WorkflowStatusDTO.StageProgressDTO.builder()
                .stageName(stage)
                .status(stageStatus)
                .inputQuantity(entry != null ? entry.getInputQuantity() : null)
                .outputQuantity(entry != null ? entry.getOutputQuantity() : null)
                .rejectedQuantity(entry != null ? entry.getRejectedQuantity() : null)
                .isCurrent(false) // Will be set below
                .isDone(isDone)
                .isSkipped(isSkipped)
                .build());
        }

        // Determine current stage
        String currentStage = determineCurrentStage(order, completedStages);

        // Mark current stage in the list
        for (WorkflowStatusDTO.StageProgressDTO sp : stageProgressList) {
            sp.setCurrent(sp.getStageName().equals(currentStage));
        }

        // Calculate progress (Ack + TV + production stages)
        int doneCount = 0;
        boolean ackDone = order.getProductionApprovedBy() != null && order.getAdminApprovedBy() != null;
        if (ackDone) doneCount += 1;
        // TV is always considered for now
        doneCount += 1; // TV count
        doneCount += completedStages.size();
        int totalSteps = 2 + stages.size();
        int progress = totalSteps > 0 ? Math.min(100, (doneCount * 100) / totalSteps) : 0;

        // Quantity summary
        int totalInput = entries.stream().mapToInt(e -> e.getInputQuantity() != null ? e.getInputQuantity() : 0).sum();
        int totalOutput = entries.stream().mapToInt(e -> e.getOutputQuantity() != null ? e.getOutputQuantity() : 0).sum();
        int totalRejected = entries.stream().mapToInt(e -> e.getRejectedQuantity() != null ? e.getRejectedQuantity() : 0).sum();
        int balance = Math.max(0, order.getQuantity() != null ? order.getQuantity() : 0 - totalOutput - totalRejected);
        int wip = entries.stream().mapToInt(ProductionEntry::getPendingQuantity).sum();

        // Overall status
        String overallStatus = deriveOverallStatus(order, completedStages, ackDone);

        return WorkflowStatusDTO.builder()
            .overallStatus(overallStatus)
            .currentStage(currentStage)
            .progress(progress)
            .stageProgress(stageProgressList)
            .quantities(WorkflowStatusDTO.QuantitySummaryDTO.builder()
                .totalInput(totalInput)
                .totalOutput(totalOutput)
                .totalRejected(totalRejected)
                .balance(balance)
                .wip(wip)
                .build())
            .build();
    }

    // ========================
    // Timeline & History
    // ========================

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getTimeline(Long backendId) {
        ProductionOrder order = orderRepository.findById(backendId)
            .orElseThrow(() -> new NoSuchElementException("Production order not found with id: " + backendId));

        List<TimelineEvent> events = timelineEventRepository.findByProductionOrderIdOrderByEventTimeDesc(backendId);

        return events.stream()
            .map(event -> {
                Map<String, Object> map = new LinkedHashMap<>();
                map.put("event", event.getEventName());
                map.put("date", event.getEventTime() != null ?
                    DateTimeFormatter.ISO_INSTANT.format(event.getEventTime()) : null);
                map.put("status", event.getStatus());
                map.put("user", event.getPerformedBy());
                map.put("remarks", event.getRemarks());
                return map;
            })
            .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getApprovalHistory(Long backendId) {
        ProductionOrder order = orderRepository.findById(backendId)
            .orElseThrow(() -> new NoSuchElementException("Production order not found with id: " + backendId));

        List<ApprovalHistory> historyList = approvalHistoryRepository.findByProductionOrderIdOrderByPerformedAtDesc(backendId);

        return historyList.stream()
            .map(h -> {
                Map<String, Object> map = new LinkedHashMap<>();
                map.put("date", h.getPerformedAt() != null ?
                    DateTimeFormatter.ISO_INSTANT.format(h.getPerformedAt()) : null);
                map.put("action", h.getAction());
                map.put("user", h.getPerformedBy());
                map.put("previousStatus", h.getFromStatus() != null ? h.getFromStatus().getDisplayName() : null);
                map.put("newStatus", h.getToStatus() != null ? h.getToStatus().getDisplayName() : null);
                map.put("remarks", h.getRemarks());
                return map;
            })
            .collect(Collectors.toList());
    }

    // ========================
    // Helper methods
    // ========================

    /**
     * Resolve the CPO (Sales Order) reference sent by the client. Accepts either
     * the Sales Order's numeric database primary key or its canonical SO number
     * (legacy clients sent the number in both reference fields). Returns null when
     * nothing matches — the reference is optional, so unknown values are kept as
     * sent for backward compatibility.
     *
     * <p>Sales-owned persistence is reached through the published
     * {@link SalesOrderLookupPort} only (P6): the same {@code findById} / 
     * {@code findBySoNo} queries, the same null-on-miss behavior, and nothing about
     * Sales' entity, repository, payload or numbering in this class.
     */
    private SalesOrderRef resolveCpo(String cpoId, String cpoNumber) {
        if (cpoId != null && !cpoId.isBlank()) {
            try {
                SalesOrderRef byId = salesOrderLookup.findById(Long.valueOf(cpoId.trim())).orElse(null);
                if (byId != null) return byId;
            } catch (NumberFormatException ignored) {
                // not a numeric id — try the number below
            }
            SalesOrderRef byNo = salesOrderLookup.findBySoNo(cpoId.trim()).orElse(null);
            if (byNo != null) return byNo;
        }
        if (cpoNumber != null && !cpoNumber.isBlank()) {
            return salesOrderLookup.findBySoNo(cpoNumber.trim()).orElse(null);
        }
        return null;
    }

    private void validateCreateRequest(CreateProductionOrderRequest request) {
        if (request.getStartDate() == null) throw new IllegalArgumentException("Start date is required");
        if (request.getDueDate() == null) throw new IllegalArgumentException("Due date is required");
        if (request.getDueDate().isBefore(request.getStartDate())) {
            throw new IllegalArgumentException("Due date must be on or after the start date");
        }
        if (request.getItems() == null || request.getItems().isEmpty()) {
            throw new IllegalArgumentException("At least one production item is required");
        }
        for (int i = 0; i < request.getItems().size(); i++) {
            CreateProductionOrderRequest.CreateOrderItemRequest item = request.getItems().get(i);
            if (item.getProductName() == null || item.getProductName().isBlank()) {
                throw new IllegalArgumentException("Item " + (i + 1) + ": Order Description is required");
            }
            if (item.getQuantity() == null || item.getQuantity() <= 0) {
                throw new IllegalArgumentException("Item " + (i + 1) + ": Quantity must be greater than zero");
            }
            if (item.getProductionType() == null || item.getProductionType().isBlank()) {
                throw new IllegalArgumentException("Item " + (i + 1) + ": Production Type is required");
            }
        }
    }

    private void addTimelineEvent(ProductionOrder order, String eventName, Instant eventTime,
                                   String status, String performedBy, String remarks) {
        TimelineEvent event = TimelineEvent.builder()
            .productionOrder(order)
            .eventName(eventName)
            .eventTime(eventTime)
            .status(status)
            .performedBy(performedBy)
            .remarks(remarks)
            .build();
        timelineEventRepository.save(event);
    }

    private String determineCurrentStage(ProductionOrder order, Set<String> completedStages) {
        // Approval gate
        boolean approvalDone = order.getProductionApprovedBy() != null && order.getAdminApprovedBy() != null;
        if (!approvalDone) return "Approval";

        ProductionType type = order.getProductionType();
        if (type == null) return order.getCurrentStage() != null ? order.getCurrentStage() : "Approval";

        List<String> stages = ProductionWorkflow.getStages(type);
        for (String stage : stages) {
            if (!completedStages.contains(stage)) return stage;
        }
        return "Completed";
    }

    private String deriveOverallStatus(ProductionOrder order, Set<String> completedStages, boolean ackDone) {
        if (order.getStatus() == OrderStatus.DRAFT ||
            order.getStatus() == OrderStatus.PENDING_PRODUCTION_APPROVAL ||
            order.getStatus() == OrderStatus.PRODUCTION_APPROVED ||
            order.getStatus() == OrderStatus.PENDING_ADMIN_APPROVAL ||
            order.getStatus() == OrderStatus.ADMIN_APPROVED ||
            order.getStatus() == OrderStatus.APPROVED) {
            return order.getStatus().getDisplayName();
        }
        if (!ackDone) return "Pending";

        ProductionType type = order.getProductionType();
        if (type != null) {
            List<String> stages = ProductionWorkflow.getStages(type);
            if (stages.stream().allMatch(completedStages::contains)) {
                return "Completed";
            }
            // Check if any stage has entries
            if (completedStages.isEmpty()) return "In Progress";
        }

        return order.getStatus().getDisplayName();
    }

    private String mapSortField(String frontendField) {
        return switch (frontendField.toLowerCase()) {
            case "workorder", "work_order" -> "workOrder";
            case "createdat", "created_at" -> "createdAt";
            case "duedate", "due_date" -> "dueDate";
            case "priority" -> "priority";
            case "status" -> "status";
            case "progress" -> "progress";
            case "product" -> "product";
            case "customer" -> "customer";
            default -> "createdAt";
        };
    }
}
