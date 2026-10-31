package com.vishatech.erp.service.production;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.production.ProductionOrder;
import com.vishatech.erp.entity.production.QualityInspection;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.production.ProductionOrderRepository;
import com.vishatech.erp.repository.production.QualityInspectionRepository;
import com.vishatech.erp.util.AuditContext;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Year;
import java.time.format.DateTimeFormatter;
import java.util.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class QualityInspectionService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    /** Valid status transitions. */
    private static final Map<String, List<String>> VALID_TRANSITIONS = Map.of(
        "Pending",     List.of("In Progress", "Hold"),
        "In Progress", List.of("Passed", "Failed", "Hold"),
        "Hold",        List.of("Passed", "Failed"),
        "Passed",      List.of(),
        "Failed",      List.of()
    );

    /** Default checklist template. */
    private static final String DEFAULT_CHECKLIST = "[{\"name\":\"Visual Inspection\",\"result\":\"N/A\",\"remarks\":\"\"},{\"name\":\"Dimensional Check\",\"result\":\"N/A\",\"remarks\":\"\"},{\"name\":\"Surface Condition\",\"result\":\"N/A\",\"remarks\":\"\"},{\"name\":\"Workmanship\",\"result\":\"N/A\",\"remarks\":\"\"},{\"name\":\"Final Verification\",\"result\":\"N/A\",\"remarks\":\"\"}]";

    private static final ObjectMapper mapper = new ObjectMapper();
    private final QualityInspectionRepository repository;
    private final ProductionOrderRepository productionOrderRepository;
    private final AuditContext auditContext;
    private final SimpMessagingTemplate messagingTemplate;

    private static final java.util.logging.Logger log =
            java.util.logging.Logger.getLogger(QualityInspectionService.class.getName());

    /** Quality events — gated by Production Settings → Notifications. */
    private final ProductionNotificationPublisher notificationPublisher;

    public QualityInspectionService(QualityInspectionRepository repository,
                                     ProductionOrderRepository productionOrderRepository,
                                     AuditContext auditContext,
                                     SimpMessagingTemplate messagingTemplate,
                                     ProductionNotificationPublisher notificationPublisher) {
        this.repository = repository;
        this.productionOrderRepository = productionOrderRepository;
        this.auditContext = auditContext;
        this.messagingTemplate = messagingTemplate;
        this.notificationPublisher = notificationPublisher;
    }

    /** Broadcast a QC event to all subscribed clients. */
    private void broadcastQcEvent(String eventType, Map<String, Object> data) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("type", eventType);
        event.put("timestamp", LocalDateTime.now().toString());
        event.putAll(data);
        messagingTemplate.convertAndSend("/topic/qc-updates", event);
    }

    // ============================== JSON Parsing ==============================

    /** Parse a JSON string field, returning null on any error. */
    private Object parseJson(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return mapper.readValue(raw, Object.class);
        } catch (Exception e) {
            return raw;
        }
    }

    /** Parse a JSON string into a list of maps. */
    private List<Map<String, Object>> parseJsonList(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        try {
            return mapper.readValue(raw, new TypeReference<List<Map<String, Object>>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    /** Convert entity to a response map with parsed JSON fields. */
    public Map<String, Object> toResponse(QualityInspection qi) {
        String workOrderNo = workOrderNumberOf(qi);
        String cpoNo = null;
        if (workOrderNo != null) {
            cpoNo = productionOrderRepository.findByWorkOrder(workOrderNo)
                    .map(ProductionOrder::getSalesOrderNumber)
                    .map(QualityInspectionService::cpoNumber)
                    .orElse(null);
        }
        return toResponse(qi, cpoNo);
    }

    /**
     * Convert a PAGE of inspections, resolving the CPO reference with ONE query
     * instead of one lookup per row.
     */
    public List<Map<String, Object>> toResponses(List<QualityInspection> rows) {
        Map<String, String> cpoByWorkOrder = cpoNumbersByWorkOrder(rows);
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (QualityInspection qi : rows) {
            String workOrderNo = workOrderNumberOf(qi);
            out.add(toResponse(qi, workOrderNo != null ? cpoByWorkOrder.get(workOrderNo) : null));
        }
        return out;
    }

    private Map<String, Object> toResponse(QualityInspection qi, String cpoNo) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", qi.getId());
        m.put("productionOrderId", qi.getProductionOrderId());
        m.put("workOrder", qi.getWorkOrder());
        // The Work Order this inspection belongs to (WO-0001 …), plus the CPO it
        // was raised for (CPO-…) resolved through the Work Order's sales-order
        // reference. Both are display values only — nothing is duplicated in
        // `quality_inspections`.
        m.put("workOrderNo", workOrderNumberOf(qi));
        m.put("cpoNo", cpoNo);
        m.put("workOrderItemId", qi.getWorkOrderItemId());
        m.put("product", qi.getProduct());
        m.put("customer", qi.getCustomer());
        m.put("department", qi.getDepartment());
        m.put("inspectionType", qi.getInspectionType());
        m.put("inspectionDate", qi.getInspectionDate() != null ? qi.getInspectionDate().toString() : null);
        m.put("inspector", qi.getInspector());
        m.put("quantityInspected", qi.getQuantityInspected());
        m.put("acceptedQuantity", qi.getAcceptedQuantity());
        m.put("rejectedQuantity", qi.getRejectedQuantity());
        m.put("status", qi.getStatus());
        m.put("remarks", qi.getRemarks());
        m.put("checklist", parseJson(qi.getChecklist()));
        m.put("inspectionReport", parseJson(qi.getInspectionReport()));
        m.put("dimensionalInspection", parseJson(qi.getDimensionalInspection()));
        m.put("materialTestCertificate", parseJson(qi.getMaterialTestCertificate()));
        m.put("finalQcInfo", parseJson(qi.getFinalQcInfo()));
        m.put("history", parseJsonList(qi.getHistory()));
        m.put("createdBy", qi.getCreatedBy());
        m.put("updatedBy", qi.getUpdatedBy());
        m.put("createdAt", qi.getCreatedAt() != null ? qi.getCreatedAt().toString() : null);
        m.put("updatedAt", qi.getUpdatedAt() != null ? qi.getUpdatedAt().toString() : null);
        m.put("qcUpdatedAt", qi.getQcUpdatedAt() != null ? qi.getQcUpdatedAt().toString() : null);
        return m;
    }

    // ============================== Work Order / CPO reference ==============================

    /**
     * The Work Order number an inspection belongs to. Inspections store it in
     * `work_order`; legacy rows only carry it in `production_order_id`.
     */
    private static String workOrderNumberOf(QualityInspection qi) {
        String workOrder = qi.getWorkOrder();
        if (workOrder != null && !workOrder.isBlank()) return workOrder.trim();
        String productionOrder = qi.getProductionOrderId();
        return (productionOrder != null && !productionOrder.isBlank()) ? productionOrder.trim() : null;
    }

    /** Buyers see CPO numbers; the DB stores the SO- prefix on older records. */
    private static String cpoNumber(String salesOrderNumber) {
        if (salesOrderNumber == null || salesOrderNumber.isBlank()) return null;
        String value = salesOrderNumber.trim();
        return value.startsWith("SO-") ? "CPO-" + value.substring(3) : value;
    }

    private Map<String, String> cpoNumbersByWorkOrder(List<QualityInspection> rows) {
        Set<String> workOrders = new LinkedHashSet<>();
        for (QualityInspection qi : rows) {
            String workOrderNo = workOrderNumberOf(qi);
            if (workOrderNo != null) workOrders.add(workOrderNo);
        }
        if (workOrders.isEmpty()) return Map.of();
        Map<String, String> byWorkOrder = new HashMap<>();
        for (ProductionOrder order : productionOrderRepository.findAllByWorkOrderIn(workOrders)) {
            byWorkOrder.put(order.getWorkOrder(), cpoNumber(order.getSalesOrderNumber()));
        }
        return byWorkOrder;
    }

    // ============================== Read ==============================

    @Transactional(readOnly = true)
    public Page<QualityInspection> list(int page, int size, String search, String status,
                                         String department, String inspectionType,
                                         String productionOrder, String sort) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort));
        String safeStatus = (status != null && !status.isBlank() && !"All".equals(status)) ? status : null;
        String safeDept = (department != null && !department.isBlank() && !"All".equals(department)) ? department : null;
        String safeType = (inspectionType != null && !inspectionType.isBlank() && !"All".equals(inspectionType)) ? inspectionType : null;
        String safePo = (productionOrder != null && !productionOrder.isBlank()) ? productionOrder.trim() : null;
        String safeSearch = (search != null && !search.isBlank()) ? search.trim() : null;
        return repository.findAllFiltered(safeSearch, safeStatus, safeDept, safeType, safePo, pageable);
    }

    @Transactional(readOnly = true)
    public QualityInspection get(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Inspection not found: " + id));
    }

    @Transactional(readOnly = true)
    public List<QualityInspection> getByProductionOrder(String productionOrderId) {
        return repository.findByProductionOrderIdOrderByCreatedAtDesc(productionOrderId);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> stats(String productionOrderId) {
        // A scoped request must not silently fall through to the global counts.
        if (productionOrderId != null && !productionOrderId.isBlank()) {
            return statsForOrder(productionOrderId);
        }

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalInspections", repository.count());
        stats.put("pendingInspections", repository.countByStatus("Pending"));
        stats.put("inProgressInspections", repository.countByStatus("In Progress"));
        stats.put("passedInspections", repository.countByStatus("Passed"));
        stats.put("failedInspections", repository.countByStatus("Failed"));
        stats.put("holdInspections", repository.countByStatus("Hold"));

        return stats;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> statsForOrder(String productionOrderId) {
        Map<String, Object> stats = new LinkedHashMap<>();
        List<QualityInspection> inspections = repository.findByProductionOrderIdOrderByCreatedAtDesc(productionOrderId);
        stats.put("totalInspections", inspections.size());
        stats.put("pendingInspections", inspections.stream().filter(i -> "Pending".equals(i.getStatus())).count());
        stats.put("inProgressInspections", inspections.stream().filter(i -> "In Progress".equals(i.getStatus())).count());
        stats.put("passedInspections", inspections.stream().filter(i -> "Passed".equals(i.getStatus())).count());
        stats.put("failedInspections", inspections.stream().filter(i -> "Failed".equals(i.getStatus())).count());
        stats.put("holdInspections", inspections.stream().filter(i -> "Hold".equals(i.getStatus())).count());
        return stats;
    }

    // ============================== Write ==============================

    public QualityInspection create(QualityInspection input) {
        if (input.getProductionOrderId() == null || input.getProductionOrderId().isBlank()) {
            throw new BadRequestException("Work Order / CPO number is required");
        }
        if (input.getInspectionType() == null || input.getInspectionType().isBlank()) {
            throw new BadRequestException("Inspection type is required");
        }

        // Honour the inspection number the caller supplied (the Quality form makes
        // it a required field and checks it against the existing ids) instead of
        // silently replacing it with a generated one. Callers that send no id —
        // Sales CPO QC — keep getting a generated number.
        String requestedId = input.getId() != null ? input.getId().trim() : "";
        if (!requestedId.isEmpty()) {
            if (repository.existsById(requestedId)) {
                throw new BadRequestException("An inspection with id '" + requestedId + "' already exists");
            }
            input.setId(requestedId);
        } else {
            input.setId(generateId());
        }
        input.setInspectionId(input.getId()); // legacy NOT NULL column in DB
        input.setStatus(input.getStatus() != null ? input.getStatus() : "Pending");
        input.setCreatedBy(auditContext.currentUserName());
        input.setUpdatedBy(auditContext.currentUserName());

        if (input.getChecklist() == null || input.getChecklist().isBlank()) {
            input.setChecklist(DEFAULT_CHECKLIST);
        }

        // Initialize history
        String historyJson = String.format(
            "[{\"date\":\"%s\",\"action\":\"Inspection Created\",\"user\":\"%s\",\"previousStatus\":\"—\",\"newStatus\":\"%s\",\"remarks\":\"Inspection created.\"}]",
            LocalDateTime.now().toString(),
            input.getCreatedBy(),
            input.getStatus()
        );
        input.setHistory(historyJson);

        // Validate quantities
        validateQuantities(input);

        QualityInspection saved = repository.save(input);
        broadcastQcEvent("QC_CREATED", toResponse(saved));
        publishEvent(ProductionNotificationPublisher.QC_PENDING, saved, "Quality inspection created",
                "Inspection " + saved.getId() + " for work order " + label(saved)
                        + " is waiting to be carried out.");
        return saved;
    }

    public QualityInspection update(String id, QualityInspection input) {
        QualityInspection existing = get(id);

        if (input.getProductionOrderId() != null) existing.setProductionOrderId(input.getProductionOrderId());
        if (input.getWorkOrder() != null) existing.setWorkOrder(input.getWorkOrder());
        if (input.getWorkOrderItemId() != null) existing.setWorkOrderItemId(input.getWorkOrderItemId());
        if (input.getProduct() != null) existing.setProduct(input.getProduct());
        if (input.getCustomer() != null) existing.setCustomer(input.getCustomer());
        if (input.getDepartment() != null) existing.setDepartment(input.getDepartment());
        if (input.getInspectionType() != null) existing.setInspectionType(input.getInspectionType());
        if (input.getInspectionDate() != null) existing.setInspectionDate(input.getInspectionDate());
        if (input.getInspector() != null) existing.setInspector(input.getInspector());
        if (input.getRemarks() != null) existing.setRemarks(input.getRemarks());
        if (input.getChecklist() != null) existing.setChecklist(input.getChecklist());
        if (input.getInspectionReport() != null) existing.setInspectionReport(input.getInspectionReport());
        if (input.getDimensionalInspection() != null) existing.setDimensionalInspection(input.getDimensionalInspection());
        if (input.getMaterialTestCertificate() != null) existing.setMaterialTestCertificate(input.getMaterialTestCertificate());
        if (input.getFinalQcInfo() != null) existing.setFinalQcInfo(input.getFinalQcInfo());
        if (input.getHistory() != null) existing.setHistory(input.getHistory());

        if (input.getQuantityInspected() != null) existing.setQuantityInspected(input.getQuantityInspected());
        if (input.getAcceptedQuantity() != null) existing.setAcceptedQuantity(input.getAcceptedQuantity());
        if (input.getRejectedQuantity() != null) existing.setRejectedQuantity(input.getRejectedQuantity());

        existing.setUpdatedBy(auditContext.currentUserName());
        validateQuantities(existing);

        QualityInspection saved = repository.save(existing);
        broadcastQcEvent("QC_UPDATED", toResponse(saved));
        return saved;
    }

    public QualityInspection updateStatus(String id, String newStatus, String action, String remarks) {
        QualityInspection existing = get(id);
        String currentStatus = existing.getStatus();

        validateTransition(currentStatus, newStatus);

        // Build history entry
        String historyEntry = String.format(
            "{\"date\":\"%s\",\"action\":\"%s\",\"user\":\"%s\",\"previousStatus\":\"%s\",\"newStatus\":\"%s\",\"remarks\":\"%s\"}",
            LocalDateTime.now().toString(),
            action != null ? action : "Status Changed",
            auditContext.currentUserName(),
            currentStatus,
            newStatus,
            remarks != null ? remarks : ""
        );

        // Prepend to existing history
        String existingHistory = existing.getHistory();
        String newHistory;
        if (existingHistory == null || existingHistory.isBlank() || "[]".equals(existingHistory)) {
            newHistory = "[" + historyEntry + "]";
        } else {
            newHistory = existingHistory.substring(0, existingHistory.length() - 1) + "," + historyEntry + "]";
        }

        existing.setStatus(newStatus);
        existing.setHistory(newHistory);
        existing.setUpdatedBy(auditContext.currentUserName());

        QualityInspection saved = repository.save(existing);
        broadcastQcEvent("QC_STATUS_CHANGED", toResponse(saved));
        publishStatusChange(saved, newStatus, remarks);
        return saved;
    }

    /* ========================
     * Notifications
     * ======================== */

    /**
     * Publishes the event behind an inspection status change. Only the three
     * decisions notify — moving back to In Progress is part of doing the work,
     * not an event the team needs to be told about.
     */
    private void publishStatusChange(QualityInspection inspection, String newStatus, String remarks) {
        String status = newStatus == null ? "" : newStatus.trim().toLowerCase();
        String event;
        String title;
        switch (status) {
            case "passed" -> {
                event = ProductionNotificationPublisher.QC_PASSED;
                title = "Quality inspection passed";
            }
            case "failed" -> {
                event = ProductionNotificationPublisher.QC_FAILED;
                title = "Quality inspection failed";
            }
            case "hold" -> {
                event = ProductionNotificationPublisher.QC_HOLD;
                title = "Quality inspection on hold";
            }
            default -> {
                return;
            }
        }
        publishEvent(event, inspection, title,
                "Inspection " + inspection.getId() + " for work order " + label(inspection)
                        + " is now " + newStatus + reasonSuffix(remarks));
    }

    /**
     * Publishes one quality event through the shared notification system.
     *
     * <p>The notification stores a numeric reference id, while an inspection is
     * identified by its {@code QI-NNN} document number: the numeric part is used
     * as the reference (so one inspection is one reference and dedupe works per
     * record), with a stable hash fallback for an id that carries no digits.
     * The occurrence discriminator is the length of the inspection's own history
     * log, so a re-inspection notifies again while a replayed publish does not.
     */
    private void publishEvent(String event, QualityInspection inspection, String title, String message) {
        Long referenceId = referenceIdOf(inspection.getId());
        if (referenceId == null) {
            return;
        }
        try {
            Object occurrence = inspection.getHistory() == null ? null : inspection.getHistory().length();
            notificationPublisher.publish(event, ProductionNotificationPublisher.REF_QUALITY,
                    referenceId, title, message, "NORMAL", occurrence);
        } catch (Exception e) {
            log.warning("Quality notification skipped [inspection=" + inspection.getId() + "]: "
                    + e.getMessage());
        }
    }

    private static Long referenceIdOf(String inspectionId) {
        if (inspectionId == null || inspectionId.isBlank()) {
            return null;
        }
        String digits = inspectionId.replaceAll("[^0-9]", "");
        if (!digits.isEmpty()) {
            try {
                return Long.parseLong(digits.length() > 18 ? digits.substring(0, 18) : digits);
            } catch (NumberFormatException ignored) {
                // fall through to the stable hash
            }
        }
        return (long) Math.abs(inspectionId.hashCode());
    }

    private static String label(QualityInspection inspection) {
        if (inspection.getWorkOrder() != null && !inspection.getWorkOrder().isBlank()) {
            return inspection.getWorkOrder();
        }
        if (inspection.getProductionOrderId() != null && !inspection.getProductionOrderId().isBlank()) {
            return inspection.getProductionOrderId();
        }
        return "#" + inspection.getId();
    }

    private static String reasonSuffix(String remarks) {
        if (remarks == null || remarks.isBlank()) {
            return ".";
        }
        String reason = remarks.trim();
        return " — " + (reason.length() > 300 ? reason.substring(0, 300) + "…" : reason);
    }

    public QualityInspection updateChecklistItem(String id, int index, String result, String remarks) {
        QualityInspection existing = get(id);

        // The checklist is stored as a JSON array; patch the addressed item and
        // write the whole array back. Only the supplied keys are touched, so the
        // result buttons and the remarks box update one another's data safely.
        List<Map<String, Object>> items = new ArrayList<>(parseJsonList(existing.getChecklist()));
        if (index < 0 || index >= items.size()) {
            throw new BadRequestException(
                "Checklist item " + index + " does not exist (checklist has " + items.size() + " items)");
        }

        Map<String, Object> item = new LinkedHashMap<>(items.get(index));
        if (result != null && !result.isBlank()) item.put("result", result);
        if (remarks != null) item.put("remarks", remarks);
        items.set(index, item);

        try {
            existing.setChecklist(mapper.writeValueAsString(items));
        } catch (Exception e) {
            throw new BadRequestException("Could not save checklist item: " + e.getMessage());
        }

        existing.setUpdatedBy(auditContext.currentUserName());
        QualityInspection saved = repository.save(existing);
        broadcastQcEvent("QC_CHECKLIST_UPDATED", toResponse(saved));
        return saved;
    }

    public QualityInspection saveQcData(String id, String inspectionReport, String dimensionalInspection,
                                         String materialTestCertificate, String finalQcInfo) {
        QualityInspection existing = get(id);
        if (inspectionReport != null) existing.setInspectionReport(inspectionReport);
        if (dimensionalInspection != null) existing.setDimensionalInspection(dimensionalInspection);
        if (materialTestCertificate != null) existing.setMaterialTestCertificate(materialTestCertificate);
        if (finalQcInfo != null) existing.setFinalQcInfo(finalQcInfo);
        existing.setQcUpdatedAt(LocalDateTime.now());
        existing.setUpdatedBy(auditContext.currentUserName());
        QualityInspection saved = repository.save(existing);
        broadcastQcEvent("QC_DATA_UPDATED", toResponse(saved));
        return saved;
    }

    public void delete(String id) {
        if (!repository.existsById(id)) {
            throw new ResourceNotFoundException("Inspection not found: " + id);
        }
        repository.deleteById(id);
        broadcastQcEvent("QC_DELETED", Map.of("id", id));
    }

    // ============================== Validation ==============================

    private void validateTransition(String currentStatus, String newStatus) {
        List<String> allowed = VALID_TRANSITIONS.get(currentStatus);
        if (allowed == null || !allowed.contains(newStatus)) {
            throw new BadRequestException(
                String.format("Cannot transition from '%s' to '%s'. Allowed: %s",
                    currentStatus, newStatus, allowed != null ? String.join(", ", allowed) : "none"));
        }
    }

    private void validateQuantities(QualityInspection qi) {
        int inspected = qi.getQuantityInspected() != null ? qi.getQuantityInspected() : 0;
        int accepted = qi.getAcceptedQuantity() != null ? qi.getAcceptedQuantity() : 0;
        int rejected = qi.getRejectedQuantity() != null ? qi.getRejectedQuantity() : 0;

        if (inspected < 0) throw new BadRequestException("Quantity inspected cannot be negative");
        if (accepted < 0) throw new BadRequestException("Accepted quantity cannot be negative");
        if (rejected < 0) throw new BadRequestException("Rejected quantity cannot be negative");
        if (accepted + rejected > inspected) {
            throw new BadRequestException("Accepted + rejected quantity cannot exceed quantity inspected");
        }
    }

    // ============================== Helpers ==============================

    /**
     * Next free QI-<year>-<seq> number. `count() + 1` alone is not safe: after any
     * deletion the number can already exist, and saving an entity with an existing
     * id is a JPA merge, so the create would silently overwrite that inspection.
     */
    private String generateId() {
        int year = Year.now().getValue();
        long seq = repository.count() + 1;
        String id;
        do {
            id = String.format("QI-%d-%03d", year, seq++);
        } while (repository.existsById(id));
        return id;
    }

    private Sort buildSort(String sort) {
        if (sort == null || sort.isBlank()) {
            return Sort.by(Sort.Direction.DESC, "createdAt");
        }
        boolean desc = sort.startsWith("-");
        String field = desc ? sort.substring(1) : sort;
        switch (field) {
            case "id": field = "id"; break;
            case "status": field = "status"; break;
            case "inspectionType": field = "inspectionType"; break;
            case "productionOrderId": field = "productionOrderId"; break;
            case "inspector": field = "inspector"; break;
            case "product": field = "product"; break;
            case "customer": field = "customer"; break;
            case "department": field = "department"; break;
            default: field = "createdAt";
        }
        return Sort.by(desc ? Sort.Direction.DESC : Sort.Direction.ASC, field);
    }
}
