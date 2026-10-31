package com.vishatech.erp.service.production;

import com.vishatech.erp.entity.production.ProductionTracker;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.production.api.ProductionTrackerLinkPort;
import com.vishatech.erp.repository.production.ProductionTrackerRepository;
import com.vishatech.erp.sales.api.SalesOrderLookupPort;
import com.vishatech.erp.sales.api.SalesOrderLookupPort.SalesOrderRef;
import com.vishatech.erp.util.AuditContext;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Production's CPO progress tracker — a production-owned service, in the module's own
 * {@code com.vishatech.erp.service.production} package since §14.14 moved it there
 * with its entity, repository and controller (tables, columns and mappings unchanged).
 *
 * <p><b>Sales boundary (P7).</b> This service used to inject
 * {@code repository.SalesOrderRepository} and hold {@code entity.SalesOrder} values
 * purely to link a tracker to its CPO. It now resolves Sales Orders through the
 * published {@link SalesOrderLookupPort} and stores only the CPO id on the tracker
 * ({@link ProductionTracker#setSalesOrderId}), so no Sales entity, repository or DTO
 * is referenced here. Lookup and failure semantics are unchanged.
 *
 * <p><b>Sales boundary, outbound (P8).</b> The module publishes
 * {@link ProductionTrackerLinkPort} so Sales can ask whether a CPO still has a tracker
 * before it permanently deletes one, without reading this table. This service is that
 * contract's implementation, which keeps every rule about what "linked" means —
 * {@code sales_order_id}, and the denormalised CPO number for a tracker created
 * without one — on the side that owns the table.
 */
@Service
@Transactional
public class ProductionTrackerService implements ProductionTrackerLinkPort {

    private final ProductionTrackerRepository repository;
    private final SalesOrderLookupPort salesOrderLookup;
    private final AuditContext auditContext;

    public ProductionTrackerService(ProductionTrackerRepository repository,
                                     SalesOrderLookupPort salesOrderLookup,
                                     AuditContext auditContext) {
        this.repository = repository;
        this.salesOrderLookup = salesOrderLookup;
        this.auditContext = auditContext;
    }

    // ============================== Read ==============================

    @Transactional(readOnly = true)
    public Page<ProductionTracker> list(int page, int size, String search, String status,
                                         String stageActive, String dateFrom, String dateTo, String sort) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort));

        String safeSearch = (search != null && !search.isBlank()) ? search.trim() : null;
        String safeStatus = (status != null && !status.isBlank() && !"All".equals(status)) ? status : null;
        String safeStage = (stageActive != null && !stageActive.isBlank() && !"All".equals(stageActive)) ? stageActive : null;
        LocalDate from = (dateFrom != null && !dateFrom.isBlank()) ? LocalDate.parse(dateFrom) : null;
        LocalDate to = (dateTo != null && !dateTo.isBlank()) ? LocalDate.parse(dateTo) : null;

        return repository.findAllFiltered(safeSearch, safeStatus, safeStage, from, to, pageable);
    }

    @Transactional(readOnly = true)
    public ProductionTracker get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Production tracker not found: " + id));
    }

    @Transactional(readOnly = true)
    public ProductionTracker getByCpoNo(String cpoNo) {
        return repository.findByCpoNo(cpoNo)
                .orElseThrow(() -> new ResourceNotFoundException("Production tracker not found for CPO: " + cpoNo));
    }

    /**
     * {@inheritDoc}
     *
     * <p>{@code sales_order_id} is the link the tracker is maintained through. A
     * tracker created without a CPO id keeps only the denormalised CPO number (see
     * {@code ProductionTrackerCpoLinkIntegrationTests}), so that number is matched as a
     * fallback — but only when the tracker carries no id of its own, so a tracker that
     * belongs to a <em>different</em> order never blocks this one.
     */
    @Transactional(readOnly = true)
    @Override
    public Optional<Long> linkedTrackerId(Long salesOrderId) {
        if (salesOrderId == null) {
            return Optional.empty();
        }
        Optional<ProductionTracker> byId = repository.findBySalesOrderId(salesOrderId);
        if (byId.isPresent()) {
            return byId.map(ProductionTracker::getId);
        }
        return salesOrderLookup.findById(salesOrderId)
                .flatMap(ref -> repository.findByCpoNo(ref.soNo()))
                .filter(tracker -> tracker.getSalesOrderId() == null)
                .map(ProductionTracker::getId);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> stats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        long total = repository.count();
        long notStarted = repository.countNotStarted();
        long inProgress = repository.countInProgress();
        long completed = repository.countCompleted();
        long delayed = repository.countDelayed();

        stats.put("totalCpos", total);
        stats.put("notStarted", notStarted);
        stats.put("inProgress", inProgress);
        stats.put("completed", completed);
        stats.put("delayed", delayed);

        // Overall progress percentages
        if (total > 0) {
            stats.put("notStartedPct", Math.round((double) notStarted / total * 100));
            stats.put("inProgressPct", Math.round((double) inProgress / total * 100));
            stats.put("completedPct", Math.round((double) completed / total * 100));
            stats.put("delayedPct", Math.round((double) delayed / total * 100));
        } else {
            stats.put("notStartedPct", 0);
            stats.put("inProgressPct", 0);
            stats.put("completedPct", 0);
            stats.put("delayedPct", 0);
        }

        return stats;
    }

    // ============================== Write ==============================

    public ProductionTracker create(ProductionTracker input) {
        // Link to a CPO when the payload carries one. The lookup goes through the
        // published Sales port, and an unknown id still fails fast with the same 404
        // the repository-based lookup produced.
        Long linkedCpoId = input.getSalesOrderId();
        if (linkedCpoId != null) {
            SalesOrderRef so = salesOrderLookup.findById(linkedCpoId)
                    .orElseThrow(() -> new ResourceNotFoundException("Sales Order not found: " + linkedCpoId));
            input.setSalesOrderId(so.id());
            input.setCpoNo(so.soNo());
            input.setCustomer(so.clientName());
            if (input.getOrderDate() == null && so.orderDate() != null) {
                input.setOrderDate(so.orderDate().toLocalDate());
            }
        }

        if (input.getCpoNo() == null || input.getCpoNo().isBlank()) {
            throw new BadRequestException("CPO number is required");
        }

        // Calculate overall progress and status
        calculateOverallProgress(input);

        input.setCreatedBy(auditContext.currentUserName());
        input.setUpdatedBy(auditContext.currentUserName());

        return repository.save(input);
    }

    public ProductionTracker update(Long id, ProductionTracker input) {
        ProductionTracker existing = get(id);

        // Update stage percentages
        if (input.getCastingPct() != null) existing.setCastingPct(input.getCastingPct());
        if (input.getFabricationPct() != null) existing.setFabricationPct(input.getFabricationPct());
        if (input.getAssemblyPct() != null) existing.setAssemblyPct(input.getAssemblyPct());
        if (input.getQcPct() != null) existing.setQcPct(input.getQcPct());
        if (input.getPackingPct() != null) existing.setPackingPct(input.getPackingPct());
        if (input.getDispatchPct() != null) existing.setDispatchPct(input.getDispatchPct());

        // Update stage dates
        if (input.getCastingStart() != null) existing.setCastingStart(input.getCastingStart());
        if (input.getCastingEnd() != null) existing.setCastingEnd(input.getCastingEnd());
        if (input.getFabricationStart() != null) existing.setFabricationStart(input.getFabricationStart());
        if (input.getFabricationEnd() != null) existing.setFabricationEnd(input.getFabricationEnd());
        if (input.getAssemblyStart() != null) existing.setAssemblyStart(input.getAssemblyStart());
        if (input.getAssemblyEnd() != null) existing.setAssemblyEnd(input.getAssemblyEnd());
        if (input.getQcStart() != null) existing.setQcStart(input.getQcStart());
        if (input.getQcEnd() != null) existing.setQcEnd(input.getQcEnd());
        if (input.getPackingStart() != null) existing.setPackingStart(input.getPackingStart());
        if (input.getPackingEnd() != null) existing.setPackingEnd(input.getPackingEnd());
        if (input.getDispatchStart() != null) existing.setDispatchStart(input.getDispatchStart());
        if (input.getDispatchEnd() != null) existing.setDispatchEnd(input.getDispatchEnd());

        // Update other fields
        if (input.getDueDate() != null) existing.setDueDate(input.getDueDate());
        if (input.getRemarks() != null) existing.setRemarks(input.getRemarks());

        // Recalculate overall progress and status
        calculateOverallProgress(existing);

        existing.setUpdatedBy(auditContext.currentUserName());
        return repository.save(existing);
    }

    public void delete(Long id) {
        if (!repository.existsById(id)) {
            throw new ResourceNotFoundException("Production tracker not found: " + id);
        }
        repository.deleteById(id);
    }

    // ============================== Auto-create from CPO ==============================

    /**
     * Auto-create a production tracker when a new Sales Order (CPO) is created.
     * Called from the Sales side (which owns the Sales Order) or triggered manually.
     *
     * <p>Takes the published {@link SalesOrderRef} rather than a {@code SalesOrder}:
     * the caller is on the Sales side and hands over exactly the values the tracker
     * denormalises, so Production never has to know the Sales entity.
     */
    public ProductionTracker autoCreateForCpo(SalesOrderRef so) {
        // Skip if tracker already exists for this CPO
        if (repository.findBySalesOrderId(so.id()).isPresent()) {
            return repository.findBySalesOrderId(so.id()).get();
        }

        ProductionTracker tracker = new ProductionTracker();
        tracker.setSalesOrderId(so.id());
        tracker.setCpoNo(so.soNo());
        tracker.setCustomer(so.clientName());
        tracker.setOrderDate(so.orderDate() != null ? so.orderDate().toLocalDate() : LocalDate.now());
        tracker.setDueDate(LocalDate.now().plusDays(30)); // Default 30-day lead time
        tracker.setCurrentStatus("NOT_STARTED");
        tracker.setCreatedBy("System");
        tracker.setUpdatedBy("System");

        return repository.save(tracker);
    }

    // ============================== Helpers ==============================

    private void calculateOverallProgress(ProductionTracker pt) {
        int casting = pt.getCastingPct() != null ? pt.getCastingPct() : 0;
        int fabrication = pt.getFabricationPct() != null ? pt.getFabricationPct() : 0;
        int assembly = pt.getAssemblyPct() != null ? pt.getAssemblyPct() : 0;
        int qc = pt.getQcPct() != null ? pt.getQcPct() : 0;
        int packing = pt.getPackingPct() != null ? pt.getPackingPct() : 0;
        int dispatch = pt.getDispatchPct() != null ? pt.getDispatchPct() : 0;

        int totalPct = casting + fabrication + assembly + qc + packing + dispatch;
        int maxPossible = 600; // 6 stages × 100%
        int overallPct = maxPossible > 0 ? Math.round((float) totalPct / maxPossible * 100) : 0;

        // Determine status
        String status;
        if (dispatch == 100) {
            status = "COMPLETED";
        } else if (casting == 0 && fabrication == 0 && assembly == 0 && qc == 0 && packing == 0 && dispatch == 0) {
            status = "NOT_STARTED";
        } else if (pt.getDueDate() != null && LocalDate.now().isAfter(pt.getDueDate()) && dispatch < 100) {
            status = "DELAYED";
        } else {
            status = "IN_PROGRESS";
        }

        pt.setCurrentStatus(status);
    }

    private Sort buildSort(String sort) {
        if (sort == null || sort.isBlank()) {
            return Sort.by(Sort.Direction.DESC, "createdAt");
        }
        boolean desc = sort.startsWith("-");
        String field = desc ? sort.substring(1) : sort;
        switch (field) {
            case "cpoNo": field = "cpoNo"; break;
            case "customer": field = "customer"; break;
            case "orderDate": field = "orderDate"; break;
            case "dueDate": field = "dueDate"; break;
            case "currentStatus": field = "currentStatus"; break;
            default: field = "createdAt";
        }
        return Sort.by(desc ? Sort.Direction.DESC : Sort.Direction.ASC, field);
    }
}
