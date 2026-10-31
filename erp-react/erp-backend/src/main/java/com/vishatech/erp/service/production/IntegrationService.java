package com.vishatech.erp.service.production;

import com.vishatech.erp.audit.AuditModule;
import com.vishatech.erp.dto.production.*;
import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.entity.production.*;
import com.vishatech.erp.repository.production.*;
import com.vishatech.erp.util.production.OrderMapper;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Central Integration/Orchestration Service.
 * Connects existing ERP modules into one end-to-end workflow:
 *
 *   Production Order → Technical Verification → Drawing/Model →
 *   Production (Casting/Fabrication/Assembly) → Quality → Packing → Dispatch
 *
 * This service does NOT duplicate existing business logic.
 * It reuses existing services and adds cross-module validation.
 */
@Service
@Transactional
public class IntegrationService {

    private final ProductionOrderRepository orderRepository;
    private final ProductionOrderItemRepository itemRepository;
    private final TechnicalVerificationRepository tvRepository;
    private final DrawingRepository drawingRepository;
    private final ModelRepository modelRepository;
    private final ProductionEntryRepository entryRepository;
    private final AuditService auditService;
    private final EntityManager entityManager;

    public IntegrationService(ProductionOrderRepository orderRepository,
                              ProductionOrderItemRepository itemRepository,
                              TechnicalVerificationRepository tvRepository,
                              DrawingRepository drawingRepository,
                              ModelRepository modelRepository,
                              ProductionEntryRepository entryRepository,
                              AuditService auditService,
                              EntityManager entityManager) {
        this.orderRepository = orderRepository;
        this.itemRepository = itemRepository;
        this.tvRepository = tvRepository;
        this.drawingRepository = drawingRepository;
        this.modelRepository = modelRepository;
        this.entryRepository = entryRepository;
        this.auditService = auditService;
        this.entityManager = entityManager;
    }

    // ========================
    // End-to-End Order Traceability
    // ========================

    /**
     * Get the complete end-to-end traceability for a Production Order.
     * Traces the order through every module in the ERP workflow.
     */
    @Transactional(readOnly = true)
    public OrderTraceabilityDTO getOrderTraceability(Long orderBackendId) {
        ProductionOrder order = orderRepository.findById(orderBackendId)
            .orElseThrow(() -> new NoSuchElementException("Production order not found: " + orderBackendId));

        return buildTraceability(order);
    }

    /**
     * Get the complete end-to-end traceability by Work Order number.
     */
    @Transactional(readOnly = true)
    public OrderTraceabilityDTO getOrderTraceabilityByWorkOrder(String workOrder) {
        ProductionOrder order = orderRepository.findByWorkOrder(workOrder)
            .orElseThrow(() -> new NoSuchElementException("Production order not found: " + workOrder));

        return buildTraceability(order);
    }

    // ========================
    // Workflow Prerequisite Validation
    // ========================

    /**
     * Check if a Production Order is ready for Technical Verification.
     * Prerequisites: Order must be Approved or beyond.
     */
    @Transactional(readOnly = true)
    public WorkflowCheckDTO canStartTechnicalVerification(Long orderBackendId) {
        ProductionOrder order = orderRepository.findById(orderBackendId)
            .orElseThrow(() -> new NoSuchElementException("Production order not found: " + orderBackendId));

        List<String> blockers = new ArrayList<>();
        boolean ready = true;

        OrderStatus status = order.getStatus();
        if (status.ordinal() < OrderStatus.APPROVED.ordinal()) {
            blockers.add("Production Order must be Approved. Current status: " + status.getDisplayName());
            ready = false;
        }

        if (order.getItems() == null || order.getItems().isEmpty()) {
            blockers.add("Production Order has no items");
            ready = false;
        }

        return WorkflowCheckDTO.builder()
            .ready(ready)
            .blockers(blockers)
            .currentStatus(status.getDisplayName())
            .checkedAt(Instant.now().toString())
            .build();
    }

    /**
     * Check if a Production Order is ready for production (Casting/Fabrication/Assembly).
     * Prerequisites: TV verified, drawings available.
     */
    @Transactional(readOnly = true)
    public WorkflowCheckDTO canStartProduction(Long orderBackendId) {
        ProductionOrder order = orderRepository.findById(orderBackendId)
            .orElseThrow(() -> new NoSuchElementException("Production order not found: " + orderBackendId));

        List<String> blockers = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        boolean ready = true;

        // Check order status
        if (order.getStatus() != OrderStatus.APPROVED && order.getStatus() != OrderStatus.PENDING
                && order.getStatus() != OrderStatus.IN_PROGRESS) {
            blockers.add("Production Order must be Approved/Pending/In Progress. Current: " + order.getStatus().getDisplayName());
            ready = false;
        }

        // Check Technical Verification for each item
        if (order.getItems() != null) {
            for (ProductionOrderItem item : order.getItems()) {
                String itemId = item.getId() != null ? String.valueOf(item.getId()) : "";
                var tv = tvRepository.findByWorkOrderIdAndItemId(order.getWorkOrder(), itemId);
                if (tv.isEmpty()) {
                    warnings.add("Technical Verification not found for item: " + item.getProductName());
                } else if (tv.get().getVerificationStatus() == TVStatus.REJECTED) {
                    blockers.add("Technical Verification rejected for item: " + item.getProductName());
                    ready = false;
                } else if (tv.get().getVerificationStatus() == TVStatus.PENDING) {
                    warnings.add("Technical Verification pending for item: " + item.getProductName());
                }
            }
        }

        // Check drawings
        List<Drawing> drawings = drawingRepository.findByWorkOrderId(order.getWorkOrder());
        if (drawings.isEmpty()) {
            warnings.add("No drawings uploaded for this Work Order");
        }

        return WorkflowCheckDTO.builder()
            .ready(ready)
            .blockers(blockers)
            .warnings(warnings)
            .currentStatus(order.getStatus().getDisplayName())
            .checkedAt(Instant.now().toString())
            .build();
    }

    /**
     * Check if a Work Order is ready for Quality.
     * Prerequisites: All production stages completed.
     */
    @Transactional(readOnly = true)
    public WorkflowCheckDTO canStartQuality(String workOrderId) {
        ProductionOrder order = orderRepository.findByWorkOrder(workOrderId)
            .orElseThrow(() -> new NoSuchElementException("Production order not found: " + workOrderId));

        List<String> blockers = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        boolean ready = true;

        ProductionType productionType = order.getProductionType();
        if (productionType == null) {
            blockers.add("Production type not defined");
            ready = false;
        } else {
            List<String> stages = com.vishatech.erp.util.production.ProductionWorkflow.getStages(productionType);
            List<ProductionEntry> entries = entryRepository.findByProductionTypeAndWorkOrder(
                productionType.getDisplayName(), workOrderId);

            Set<String> completedStages = entries.stream()
                .filter(e -> e.getStatus() == EntryStatus.COMPLETED || e.getStatus() == EntryStatus.SKIPPED)
                .map(ProductionEntry::getStage)
                .collect(Collectors.toSet());

            for (String stage : stages) {
                if (!completedStages.contains(stage)) {
                    blockers.add("Stage not completed: " + stage);
                    ready = false;
                }
            }

            // Check output quantities
            int totalOutput = entries.stream()
                .filter(e -> e.getStatus() == EntryStatus.COMPLETED)
                .mapToInt(e -> e.getOutputQuantity() != null ? e.getOutputQuantity() : 0)
                .sum();

            if (totalOutput == 0) {
                warnings.add("No production output recorded");
            }
        }

        return WorkflowCheckDTO.builder()
            .ready(ready)
            .blockers(blockers)
            .warnings(warnings)
            .currentStatus(order.getStatus().getDisplayName())
            .checkedAt(Instant.now().toString())
            .build();
    }

    /**
     * Check if a Work Order is ready for Packing.
     * Prerequisites: Quality completed with accepted quantity.
     */
    @Transactional(readOnly = true)
    public WorkflowCheckDTO canStartPacking(String workOrderId) {
        ProductionOrder order = orderRepository.findByWorkOrder(workOrderId)
            .orElseThrow(() -> new NoSuchElementException("Production order not found: " + workOrderId));

        List<String> blockers = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        boolean ready = true;

        // Check production output
        ProductionType productionType = order.getProductionType();
        if (productionType != null) {
            List<ProductionEntry> entries = entryRepository.findByProductionTypeAndWorkOrder(
                productionType.getDisplayName(), workOrderId);

            int totalOutput = entries.stream()
                .filter(e -> e.getStatus() == EntryStatus.COMPLETED)
                .mapToInt(e -> e.getOutputQuantity() != null ? e.getOutputQuantity() : 0)
                .sum();

            int totalRejected = entries.stream()
                .filter(e -> e.getStatus() == EntryStatus.COMPLETED)
                .mapToInt(e -> e.getRejectedQuantity() != null ? e.getRejectedQuantity() : 0)
                .sum();

            int accepted = totalOutput - totalRejected;

            if (accepted <= 0) {
                blockers.add("No accepted quantity available for packing. Output: " + totalOutput + ", Rejected: " + totalRejected);
                ready = false;
            }

            warnings.add("QC Accepted quantity (estimated from production): " + accepted);
        }

        // Check if order status allows packing
        if (order.getStatus() != OrderStatus.COMPLETED && order.getStatus() != OrderStatus.PENDING_QC) {
            warnings.add("Order status is: " + order.getStatus().getDisplayName() + ". Expected Completed/Pending QC.");
        }

        return WorkflowCheckDTO.builder()
            .ready(ready)
            .blockers(blockers)
            .warnings(warnings)
            .currentStatus(order.getStatus().getDisplayName())
            .checkedAt(Instant.now().toString())
            .build();
    }

    /**
     * Check if Packing is ready for Dispatch.
     */
    @Transactional(readOnly = true)
    public WorkflowCheckDTO canStartDispatch(String workOrderId) {
        ProductionOrder order = orderRepository.findByWorkOrder(workOrderId)
            .orElseThrow(() -> new NoSuchElementException("Production order not found: " + workOrderId));

        List<String> blockers = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        boolean ready = true;

        OrderStatus status = order.getStatus();
        if (status != OrderStatus.READY_FOR_DISPATCH && status != OrderStatus.PACKED) {
            blockers.add("Order must be Packed/Ready for Dispatch. Current: " + status.getDisplayName());
            ready = false;
        }

        return WorkflowCheckDTO.builder()
            .ready(ready)
            .blockers(blockers)
            .warnings(warnings)
            .currentStatus(status.getDisplayName())
            .checkedAt(Instant.now().toString())
            .build();
    }

    // ========================
    // Quantity Consistency
    // ========================

    /**
     * Get the quantity summary across all modules for a Work Order.
     * Shows how quantities flow through the ERP.
     */
    @Transactional(readOnly = true)
    public QuantitySummaryDTO getQuantitySummary(String workOrderId) {
        ProductionOrder order = orderRepository.findByWorkOrder(workOrderId)
            .orElseThrow(() -> new NoSuchElementException("Production order not found: " + workOrderId));

        int orderQuantity = order.getQuantity() != null ? order.getQuantity() : 0;

        // Production quantities
        ProductionType productionType = order.getProductionType();
        int totalInput = 0;
        int totalOutput = 0;
        int totalRejected = 0;
        Map<String, Integer> stageOutput = new LinkedHashMap<>();

        if (productionType != null) {
            List<ProductionEntry> entries = entryRepository.findByProductionTypeAndWorkOrder(
                productionType.getDisplayName(), workOrderId);

            for (ProductionEntry entry : entries) {
                totalInput += entry.getInputQuantity() != null ? entry.getInputQuantity() : 0;
                totalOutput += entry.getOutputQuantity() != null ? entry.getOutputQuantity() : 0;
                totalRejected += entry.getRejectedQuantity() != null ? entry.getRejectedQuantity() : 0;

                if (entry.getStatus() == EntryStatus.COMPLETED) {
                    stageOutput.merge(entry.getStage(),
                        entry.getOutputQuantity() != null ? entry.getOutputQuantity() : 0,
                        Integer::sum);
                }
            }
        }

        int productionAccepted = totalOutput - totalRejected;
        int productionBalance = Math.max(0, orderQuantity - totalOutput - totalRejected);

        return QuantitySummaryDTO.builder()
            .workOrder(workOrderId)
            .orderQuantity(orderQuantity)
            .productionInput(totalInput)
            .productionOutput(totalOutput)
            .productionRejected(totalRejected)
            .productionAccepted(productionAccepted)
            .productionBalance(productionBalance)
            .stageOutput(stageOutput)
            .build();
    }

    // ========================
    // Cross-Module Status Summary
    // ========================

    /**
     * Get a cross-module status summary for a Work Order.
     * Shows the status across all integrated modules.
     */
    @Transactional(readOnly = true)
    public CrossModuleStatusDTO getCrossModuleStatus(Long orderBackendId) {
        ProductionOrder order = orderRepository.findById(orderBackendId)
            .orElseThrow(() -> new NoSuchElementException("Production order not found: " + orderBackendId));

        String workOrder = order.getWorkOrder();

        // Production Order status
        String productionOrderStatus = order.getStatus().getDisplayName();

        // Technical Verification status
        String tvStatus = "Not Started";
        int tvVerified = 0;
        int tvTotal = 0;
        if (order.getItems() != null) {
            tvTotal = order.getItems().size();
            for (ProductionOrderItem item : order.getItems()) {
                String itemId = item.getId() != null ? String.valueOf(item.getId()) : "";
                var tv = tvRepository.findByWorkOrderIdAndItemId(workOrder, itemId);
                if (tv.isPresent() && tv.get().getVerificationStatus() == TVStatus.VERIFIED) {
                    tvVerified++;
                }
            }
            if (tvTotal > 0 && tvVerified == tvTotal) {
                tvStatus = "All Verified";
            } else if (tvVerified > 0) {
                tvStatus = "Partially Verified (" + tvVerified + "/" + tvTotal + ")";
            }
        }

        // Drawing status
        List<Drawing> drawings = drawingRepository.findByWorkOrderId(workOrder);
        String drawingStatus = drawings.isEmpty() ? "No Drawings" :
            drawings.size() + " drawing(s) uploaded";

        // Model status
        List<Model> models = modelRepository.findByWorkOrderId(workOrder);
        String modelStatus = models.isEmpty() ? "No Models" :
            models.size() + " model(s) uploaded";

        // Production status
        ProductionType productionType = order.getProductionType();
        String productionStatus = "Not Started";
        int productionStagesCompleted = 0;
        int productionStagesTotal = 0;
        if (productionType != null) {
            List<String> stages = com.vishatech.erp.util.production.ProductionWorkflow.getStages(productionType);
            productionStagesTotal = stages.size();
            List<ProductionEntry> entries = entryRepository.findByProductionTypeAndWorkOrder(
                productionType.getDisplayName(), workOrder);
            productionStagesCompleted = (int) entries.stream()
                .filter(e -> e.getStatus() == EntryStatus.COMPLETED || e.getStatus() == EntryStatus.SKIPPED)
                .count();
            if (productionStagesCompleted == productionStagesTotal && productionStagesTotal > 0) {
                productionStatus = "All Stages Completed";
            } else if (productionStagesCompleted > 0) {
                productionStatus = "In Progress (" + productionStagesCompleted + "/" + productionStagesTotal + ")";
            }
        }

        // Quality status (derived from production entries)
        String qualityStatus = "Not Started";
        if (productionStagesCompleted == productionStagesTotal && productionStagesTotal > 0) {
            qualityStatus = "Ready for QC";
        }

        // Packing status
        String packingStatus = "Not Started";
        if (order.getStatus() == OrderStatus.PACKED || order.getStatus() == OrderStatus.READY_FOR_DISPATCH) {
            packingStatus = "Completed";
        } else if (order.getStatus() == OrderStatus.COMPLETED) {
            packingStatus = "Ready for Packing";
        }

        // Dispatch status
        String dispatchStatus = "Not Started";
        if (order.getStatus() == OrderStatus.DISPATCHED) {
            dispatchStatus = "Dispatched";
        } else if (order.getStatus() == OrderStatus.READY_FOR_DISPATCH) {
            dispatchStatus = "Ready for Dispatch";
        }

        // Overall progress
        int totalSteps = 6; // Order, TV, Drawing, Production, Quality, Packing+Dispatch
        int completedSteps = 0;
        if (order.getStatus().ordinal() >= OrderStatus.APPROVED.ordinal()) completedSteps++;
        if (tvVerified == tvTotal && tvTotal > 0) completedSteps++;
        if (!drawings.isEmpty()) completedSteps++;
        if (productionStagesCompleted == productionStagesTotal && productionStagesTotal > 0) completedSteps++;
        if (order.getStatus() == OrderStatus.COMPLETED || order.getStatus().ordinal() > OrderStatus.COMPLETED.ordinal()) completedSteps++;
        if (order.getStatus() == OrderStatus.DISPATCHED) completedSteps++;

        int progress = totalSteps > 0 ? (completedSteps * 100) / totalSteps : 0;

        return CrossModuleStatusDTO.builder()
            .orderBackendId(order.getId())
            .workOrder(workOrder)
            .salesOrderNumber(order.getSalesOrderNumber())
            .customer(order.getCustomer())
            .product(order.getProduct())
            .quantity(order.getQuantity())
            .productionOrderStatus(productionOrderStatus)
            .technicalVerificationStatus(tvStatus)
            .tvVerifiedCount(tvVerified)
            .tvTotalCount(tvTotal)
            .drawingStatus(drawingStatus)
            .drawingCount(drawings.size())
            .modelStatus(modelStatus)
            .modelCount(models.size())
            .productionType(productionType != null ? productionType.getDisplayName() : null)
            .productionStatus(productionStatus)
            .productionStagesCompleted(productionStagesCompleted)
            .productionStagesTotal(productionStagesTotal)
            .qualityStatus(qualityStatus)
            .packingStatus(packingStatus)
            .dispatchStatus(dispatchStatus)
            .overallProgress(progress)
            .build();
    }

    // ========================
    // Dashboard Summary
    // ========================

    /**
     * Get an ERP-wide dashboard summary across all modules.
     */
    @Transactional(readOnly = true)
    public ERPDashboardDTO getDashboardSummary() {
        long totalOrders = orderRepository.count();
        long draft = orderRepository.countByStatus(OrderStatus.DRAFT);
        long inProgress = orderRepository.countByStatus(OrderStatus.IN_PROGRESS);
        long approved = orderRepository.countByStatus(OrderStatus.APPROVED);
        long completed = orderRepository.countByStatus(OrderStatus.COMPLETED);
        long dispatched = orderRepository.countByStatus(OrderStatus.DISPATCHED);
        long cancelled = orderRepository.countByStatus(OrderStatus.CANCELLED);

        // TV counts
        long tvTotal = tvRepository.countAll();
        long tvPending = tvRepository.countPending();
        long tvVerified = tvRepository.countVerified();
        long tvRejected = tvRepository.countRejected();

        // Drawing counts
        long drawingTotal = drawingRepository.countAll();
        long drawingPending = drawingRepository.countPending();
        long drawingVerified = drawingRepository.countVerified();

        // Model counts
        long modelTotal = modelRepository.countAll();
        long modelPending = modelRepository.countPending();
        long modelVerified = modelRepository.countVerified();

        // Production entry counts
        long castingJobs = entryRepository.countByProductionType("Casting");
        long fabricationJobs = entryRepository.countByProductionType("Fabrication");
        long assemblyJobs = entryRepository.countByProductionType("Assembly");

        return ERPDashboardDTO.builder()
            .productionOrders(ERPDashboardDTO.ModuleCountDTO.builder()
                .total(totalOrders).draft(draft).inProgress(inProgress)
                .approved(approved).completed(completed).dispatched(dispatched).cancelled(cancelled).build())
            .technicalVerifications(ERPDashboardDTO.ModuleCountDTO.builder()
                .total(tvTotal).pending(tvPending).verified(tvVerified).rejected(tvRejected).build())
            .drawings(ERPDashboardDTO.ModuleCountDTO.builder()
                .total(drawingTotal).pending(drawingPending).verified(drawingVerified).build())
            .models(ERPDashboardDTO.ModuleCountDTO.builder()
                .total(modelTotal).pending(modelPending).verified(modelVerified).build())
            .production(ERPDashboardDTO.ProductionCountDTO.builder()
                .castingJobs(castingJobs).fabricationJobs(fabricationJobs)
                .assemblyJobs(assemblyJobs).build())
            .build();
    }

    // ========================
    // Workflow Action: Advance to Next Stage
    // ========================

    /**
     * Advance a Production Order to its next logical stage in the ERP workflow.
     * This orchestrates status transitions across modules.
     */
    public CrossModuleStatusDTO advanceToNextStage(Long orderBackendId, String performedBy) {
        ProductionOrder order = orderRepository.findById(orderBackendId)
            .orElseThrow(() -> new NoSuchElementException("Production order not found: " + orderBackendId));

        OrderStatus currentStatus = order.getStatus();
        OrderStatus nextStatus = determineNextStatus(order);

        if (nextStatus == null) {
            throw new IllegalStateException("No next stage available from status: " + currentStatus.getDisplayName());
        }

        // Transition
        order.setStatus(nextStatus);
        order.setUpdatedBy(performedBy);
        order = orderRepository.save(order);

        // Record audit
        auditService.recordStatusChange(
            AuditModule.PRODUCTION, "ProductionOrder",
            String.valueOf(order.getId()), order.getWorkOrder(),
            currentStatus.getDisplayName(), nextStatus.getDisplayName(),
            performedBy, performedBy);

        entityManager.flush();
        entityManager.clear();

        return getCrossModuleStatus(order.getId());
    }

    // ========================
    // Private Helpers
    // ========================

    /**
     * Determine the next logical status for a Production Order based on its current state.
     */
    private OrderStatus determineNextStatus(ProductionOrder order) {
        return switch (order.getStatus()) {
            case DRAFT -> OrderStatus.PENDING_PRODUCTION_APPROVAL;
            case PENDING_PRODUCTION_APPROVAL -> OrderStatus.PRODUCTION_APPROVED;
            case PRODUCTION_APPROVED -> OrderStatus.PENDING_ADMIN_APPROVAL;
            case PENDING_ADMIN_APPROVAL -> OrderStatus.ADMIN_APPROVED;
            case ADMIN_APPROVED -> OrderStatus.APPROVED;
            case APPROVED -> OrderStatus.PENDING;
            case PENDING -> OrderStatus.IN_PROGRESS;
            case IN_PROGRESS -> OrderStatus.PENDING_QC;
            case PENDING_QC -> OrderStatus.COMPLETED;
            case COMPLETED -> OrderStatus.PACKED;
            case PACKED -> OrderStatus.READY_FOR_DISPATCH;
            case READY_FOR_DISPATCH -> OrderStatus.DISPATCHED;
            default -> null; // HOLD, CANCELLED, DISPATCHED, FAILED
        };
    }

    /**
     * Build the complete traceability for a Production Order.
     */
    private OrderTraceabilityDTO buildTraceability(ProductionOrder order) {
        String workOrder = order.getWorkOrder();

        // Technical Verification
        List<TechnicalVerification> tvs = tvRepository.findByWorkOrderId(workOrder);
        List<OrderTraceabilityDTO.ModuleTraceDTO> tvTraces = tvs.stream()
            .map(tv -> OrderTraceabilityDTO.ModuleTraceDTO.builder()
                .module("Technical Verification")
                .status(tv.getVerificationStatus() != null ? tv.getVerificationStatus().getDisplayName() : "Pending")
                .verifiedBy(tv.getVerifiedBy())
                .verifiedAt(tv.getVerificationDateTime() != null ? tv.getVerificationDateTime().toString() : null)
                .build())
            .collect(Collectors.toList());

        // Drawings
        List<Drawing> drawings = drawingRepository.findByWorkOrderId(workOrder);
        List<OrderTraceabilityDTO.ModuleTraceDTO> drawingTraces = drawings.stream()
            .map(d -> OrderTraceabilityDTO.ModuleTraceDTO.builder()
                .module("Drawing")
                .identifier(d.getDrawingNumber())
                .status(d.getVerificationStatus() != null ? d.getVerificationStatus().getDisplayName() : "Pending")
                .verifiedBy(d.getVerifiedBy())
                .verifiedAt(d.getVerificationDateTime() != null ? d.getVerificationDateTime().toString() : null)
                .build())
            .collect(Collectors.toList());

        // Models
        List<Model> models = modelRepository.findByWorkOrderId(workOrder);
        List<OrderTraceabilityDTO.ModuleTraceDTO> modelTraces = models.stream()
            .map(m -> OrderTraceabilityDTO.ModuleTraceDTO.builder()
                .module("Model")
                .identifier(m.getModelNumber())
                .status(m.getVerificationStatus() != null ? m.getVerificationStatus().getDisplayName() : "Pending")
                .verifiedBy(m.getVerifiedBy())
                .verifiedAt(m.getVerificationDateTime() != null ? m.getVerificationDateTime().toString() : null)
                .build())
            .collect(Collectors.toList());

        // Production entries
        ProductionType productionType = order.getProductionType();
        List<OrderTraceabilityDTO.ModuleTraceDTO> productionTraces = new ArrayList<>();
        if (productionType != null) {
            List<ProductionEntry> entries = entryRepository.findByProductionTypeAndWorkOrder(
                productionType.getDisplayName(), workOrder);
            productionTraces = entries.stream()
                .map(e -> OrderTraceabilityDTO.ModuleTraceDTO.builder()
                    .module("Production - " + e.getStage())
                    .identifier(e.getStage())
                    .status(e.getStatus() != null ? e.getStatus().getDisplayName() : "Pending")
                    .inputQuantity(e.getInputQuantity())
                    .outputQuantity(e.getOutputQuantity())
                    .rejectedQuantity(e.getRejectedQuantity())
                    .build())
                .collect(Collectors.toList());
        }

        return OrderTraceabilityDTO.builder()
            .orderBackendId(order.getId())
            .workOrder(workOrder)
            .salesOrderNumber(order.getSalesOrderNumber())
            .customer(order.getCustomer())
            .product(order.getProduct())
            .quantity(order.getQuantity())
            .productionType(productionType != null ? productionType.getDisplayName() : null)
            .orderStatus(order.getStatus().getDisplayName())
            .technicalVerifications(tvTraces)
            .drawings(drawingTraces)
            .models(modelTraces)
            .productionEntries(productionTraces)
            .build();
    }
}
