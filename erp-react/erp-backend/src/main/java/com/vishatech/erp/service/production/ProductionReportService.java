package com.vishatech.erp.service.production;

import com.vishatech.erp.dto.production.ProductionOrderDTO;
import com.vishatech.erp.entity.production.OrderStatus;
import com.vishatech.erp.entity.production.ProductionEntry;
import com.vishatech.erp.entity.production.ProductionMachine;
import com.vishatech.erp.entity.production.ProductionOrder;
import com.vishatech.erp.entity.production.ProductionOrderItem;
import com.vishatech.erp.repository.production.ProductionEntryRepository;
import com.vishatech.erp.repository.production.ProductionMachineRepository;
import com.vishatech.erp.repository.production.ProductionOrderRepository;
import com.vishatech.erp.util.production.OrderMapper;
import jakarta.persistence.criteria.Predicate;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Production → Reports.
 *
 * <p>Every figure the five report screens show is calculated here, from the
 * persisted Production tables, and returned as one payload per report:
 *
 * <pre>
 *   production-summary     production_orders + production_entries
 *   department-efficiency  production_orders
 *   delay-analysis         production_orders
 *   machine-utilization    production_machines  (Settings → Machines)
 *   material-consumption   production_order_items
 * </pre>
 *
 * <p>Before this service existed the reports were assembled in the browser from
 * whole-table downloads plus {@code data/orderDetails.js} — a demo generator —
 * so the numbers could not be traced to MySQL. Filtering (department, status,
 * start-date range) is pushed into the database through a JPA
 * {@link Specification}; the aggregation over the matching rows happens here.
 */
@Service
public class ProductionReportService {

    /**
     * Department vocabulary of the report screens. This is the controlled list
     * the Department Efficiency report renders as its fixed rows (a department
     * with no orders honestly reports zero / "—"); it is not a data source.
     */
    private static final List<String> REPORT_DEPARTMENTS = List.of(
            "Casting", "Fabrication", "Machine Shop", "Assembly", "Quality", "Packing", "Dispatch");

    /** Statuses the screens count as finished work. */
    private static final Set<OrderStatus> DONE_STATUSES = Set.of(
            OrderStatus.COMPLETED, OrderStatus.PACKED, OrderStatus.READY_FOR_DISPATCH);

    /** Statuses the screens count as work in flight. */
    private static final Set<OrderStatus> ACTIVE_STATUSES = Set.of(
            OrderStatus.IN_PROGRESS, OrderStatus.PENDING_QC);

    private final ProductionOrderRepository orderRepository;
    private final ProductionEntryRepository entryRepository;
    private final ProductionMachineRepository machineRepository;

    public ProductionReportService(
            ProductionOrderRepository orderRepository,
            ProductionEntryRepository entryRepository,
            ProductionMachineRepository machineRepository) {
        this.orderRepository = orderRepository;
        this.entryRepository = entryRepository;
        this.machineRepository = machineRepository;
    }

    /** Report filters as the screens render them (display labels / ISO dates). */
    public record Filters(LocalDate dateFrom, LocalDate dateTo, String department, String status) {

        public static Filters of(String dateFrom, String dateTo, String department, String status) {
            return new Filters(parseDate(dateFrom), parseDate(dateTo), clean(department), clean(status));
        }

        private static LocalDate parseDate(String value) {
            if (value == null || value.isBlank()) return null;
            try {
                return LocalDate.parse(value.trim());
            } catch (RuntimeException e) {
                // An unparseable date simply does not narrow the report.
                return null;
            }
        }

        private static String clean(String value) {
            if (value == null) return null;
            String trimmed = value.trim();
            return trimmed.isEmpty() || "All".equalsIgnoreCase(trimmed) ? null : trimmed;
        }
    }

    // ==================================================================
    // 1. Production Summary
    // ==================================================================

    @Transactional(readOnly = true)
    public Map<String, Object> productionSummary(Filters filters) {
        List<ProductionOrder> orders = filteredOrders(filters);

        int plannedQuantity = 0;
        int completedQuantity = 0;
        int completedOrders = 0;
        int inProgress = 0;
        int pending = 0;
        for (ProductionOrder order : orders) {
            int quantity = nz(order.getQuantity());
            plannedQuantity += quantity;
            completedQuantity += completedFor(quantity, order.getProgress());
            OrderStatus status = order.getStatus();
            if (DONE_STATUSES.contains(status)) completedOrders++;
            else if (ACTIVE_STATUSES.contains(status)) inProgress++;
            else if (status == OrderStatus.PENDING) pending++;
        }

        // Rejected quantity comes from the stage entries recorded for these
        // orders — the same source the summary card has always used.
        int rejectedQuantity = rejectedFor(orders);
        int pendingQuantity = Math.max(0, plannedQuantity - completedQuantity);
        int wip = Math.max(0, plannedQuantity - completedQuantity - rejectedQuantity);

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalOrders", orders.size());
        summary.put("completedOrders", completedOrders);
        summary.put("inProgress", inProgress);
        summary.put("pending", pending);
        summary.put("plannedQuantity", plannedQuantity);
        summary.put("completedQuantity", completedQuantity);
        summary.put("rejectedQuantity", rejectedQuantity);
        summary.put("pendingQuantity", pendingQuantity);
        summary.put("wip", wip);
        summary.put("overallCompletion", percent(completedQuantity, plannedQuantity, true));

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("orders", orders.stream().map(OrderMapper::toDTO).toList());
        payload.put("summary", summary);
        payload.put("departments", departmentRows(orders, REPORT_DEPARTMENTS));
        return payload;
    }

    // ==================================================================
    // 2. Machine Utilization
    // ==================================================================

    @Transactional(readOnly = true)
    public Map<String, Object> machineUtilization(String department) {
        List<ProductionMachine> machines = (department == null || department.isBlank())
                ? machineRepository.findAllByOrderByMachineCodeAsc()
                : machineRepository.findByDepartmentOrderByMachineCodeAsc(department);

        List<Map<String, Object>> rows = new ArrayList<>();
        int running = 0;
        int idle = 0;
        long utilizationTotal = 0;
        for (ProductionMachine machine : machines) {
            String status = machineStatus(machine);
            int utilization = percent(nz(machine.getRunningHours()), nz(machine.getAvailableHours()), false);
            if ("Running".equals(status)) running++;
            else if ("Idle".equals(status)) idle++;
            utilizationTotal += utilization;

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("machine", machine.getMachineCode());
            row.put("name", machine.getName());
            row.put("department", machine.getDepartment());
            row.put("workCenter", machine.getWorkCenter());
            row.put("availableHours", nz(machine.getAvailableHours()));
            row.put("runningHours", nz(machine.getRunningHours()));
            row.put("idleHours", nz(machine.getIdleHours()));
            row.put("maintenanceHours", nz(machine.getMaintenanceHours()));
            row.put("utilization", utilization);
            row.put("status", status);
            rows.add(row);
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalMachines", rows.size());
        summary.put("runningMachines", running);
        summary.put("idleMachines", idle);
        summary.put("averageUtilization",
                rows.isEmpty() ? 0 : (int) Math.round((double) utilizationTotal / rows.size()));

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("machines", rows);
        payload.put("summary", summary);
        return payload;
    }

    private static String machineStatus(ProductionMachine machine) {
        String status = machine.getStatus();
        if (status == null) return "Idle";
        return switch (status) {
            case "Running" -> "Running";
            case "Maintenance" -> "Maintenance";
            case "Inactive" -> "Inactive";
            default -> "Idle";
        };
    }

    // ==================================================================
    // 3. Department Efficiency
    // ==================================================================

    @Transactional(readOnly = true)
    public Map<String, Object> departmentEfficiency(Filters filters) {
        List<ProductionOrder> orders = filteredOrders(filters);
        List<String> departments = filters.department() == null
                ? REPORT_DEPARTMENTS
                : REPORT_DEPARTMENTS.stream().filter(d -> d.equals(filters.department())).toList();

        List<Map<String, Object>> rows = departmentRows(orders, departments);

        Map<String, Object> best = null;
        long efficiencyTotal = 0;
        int withData = 0;
        int totalPlanned = 0;
        int totalCompleted = 0;
        for (Map<String, Object> row : rows) {
            if ("—".equals(row.get("status"))) continue;
            withData++;
            efficiencyTotal += (int) row.get("efficiency");
            totalPlanned += (int) row.get("plannedQuantity");
            totalCompleted += (int) row.get("completedQuantity");
            if (best == null || (int) row.get("efficiency") > (int) best.get("efficiency")) best = row;
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("bestDepartment", best == null ? null : best.get("department"));
        summary.put("bestEfficiency", best == null ? 0 : best.get("efficiency"));
        summary.put("average", withData == 0 ? 0 : (int) Math.round((double) efficiencyTotal / withData));
        summary.put("totalPlanned", totalPlanned);
        summary.put("totalCompleted", totalCompleted);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("departments", rows);
        payload.put("summary", summary);
        return payload;
    }

    /** Per-department planned / completed / pending quantity and efficiency. */
    private static List<Map<String, Object>> departmentRows(
            List<ProductionOrder> orders, List<String> departments) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (String department : departments) {
            List<ProductionOrder> deptOrders = orders.stream()
                    .filter(order -> department.equals(order.getDepartment()))
                    .toList();

            int planned = 0;
            int completed = 0;
            for (ProductionOrder order : deptOrders) {
                int quantity = nz(order.getQuantity());
                planned += quantity;
                completed += completedFor(quantity, order.getProgress());
            }

            String status;
            if (deptOrders.isEmpty()) status = "—";
            else if (deptOrders.stream().allMatch(o -> DONE_STATUSES.contains(o.getStatus()))) status = "Completed";
            else if (deptOrders.stream().anyMatch(o -> ACTIVE_STATUSES.contains(o.getStatus()))) status = "In Progress";
            else status = "Pending";

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("department", department);
            row.put("plannedQuantity", planned);
            row.put("completedQuantity", completed);
            row.put("pendingQuantity", Math.max(0, planned - completed));
            row.put("plannedHours", 0);
            row.put("actualHours", 0);
            row.put("efficiency", percent(completed, planned, true));
            row.put("progress", percent(completed, planned, true));
            row.put("status", status);
            rows.add(row);
        }
        return rows;
    }

    // ==================================================================
    // 4. Material Consumption
    // ==================================================================

    /**
     * Consumption per work-order item.
     *
     * <p>Source: {@code production_order_items} — the only persisted Production
     * table that carries an item code, name, unit and quantities. The schema has
     * no separate stores-issue record for production, so the item's planned
     * quantity is the quantity released to the floor ("issued") and the
     * produced quantity is what has been consumed off it; remaining is the
     * difference. Nothing is invented — an order with no items contributes
     * nothing, and a report with no items is simply empty.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> materialConsumption(Filters filters) {
        List<ProductionOrder> orders = filteredOrders(filters);

        Map<String, Map<String, Object>> byItem = new TreeMap<>();
        for (ProductionOrder order : orders) {
            if (order.getItems() == null) continue;
            for (ProductionOrderItem item : order.getItems()) {
                String code = item.getProductCode() != null && !item.getProductCode().isBlank()
                        ? item.getProductCode()
                        : item.getProductName();
                if (code == null || code.isBlank()) continue;
                String department = item.getDepartment() != null && !item.getDepartment().isBlank()
                        ? item.getDepartment()
                        : order.getDepartment();

                Map<String, Object> row = byItem.computeIfAbsent(code, key -> {
                    Map<String, Object> created = new LinkedHashMap<>();
                    created.put("materialCode", key);
                    created.put("materialName", item.getProductName());
                    created.put("department", department);
                    created.put("unit", item.getUnit());
                    created.put("plannedQuantity", 0);
                    created.put("issuedQuantity", 0);
                    created.put("consumedQuantity", 0);
                    return created;
                });
                row.put("plannedQuantity", (int) row.get("plannedQuantity") + nz(item.getQuantity()));
                row.put("issuedQuantity", (int) row.get("issuedQuantity") + nz(item.getQuantity()));
                row.put("consumedQuantity", (int) row.get("consumedQuantity") + nz(item.getProducedQuantity()));
            }
        }

        List<Map<String, Object>> materials = new ArrayList<>(byItem.values());
        if (filters.department() != null) {
            materials = materials.stream()
                    .filter(row -> filters.department().equals(row.get("department")))
                    .toList();
        }
        for (Map<String, Object> row : materials) {
            int issued = (int) row.get("issuedQuantity");
            int consumed = (int) row.get("consumedQuantity");
            row.put("remainingQuantity", Math.max(0, issued - consumed));
            row.put("consumption", percent(consumed, issued, true));
        }

        int totalPlanned = 0;
        int totalIssued = 0;
        int totalConsumed = 0;
        for (Map<String, Object> row : materials) {
            totalPlanned += (int) row.get("plannedQuantity");
            totalIssued += (int) row.get("issuedQuantity");
            totalConsumed += (int) row.get("consumedQuantity");
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalMaterials", materials.size());
        summary.put("totalPlanned", totalPlanned);
        summary.put("totalIssued", totalIssued);
        summary.put("totalConsumed", totalConsumed);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("materials", materials);
        payload.put("summary", summary);
        return payload;
    }

    // ==================================================================
    // 5. Delay Analysis
    // ==================================================================

    /**
     * Orders past their due date that are not finished.
     *
     * <p>Delay days are computed from the order's own due date and today, and
     * the reason is derived from its status — no delay is pre-recorded, so an
     * order that is on time simply does not appear.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> delayAnalysis(Filters filters) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        List<Map<String, Object>> records = new ArrayList<>();

        for (ProductionOrder order : filteredOrders(filters)) {
            OrderStatus status = order.getStatus();
            LocalDate dueDate = order.getDueDate();
            if (dueDate == null || !dueDate.isBefore(today) || DONE_STATUSES.contains(status)
                    || status == OrderStatus.DISPATCHED || status == OrderStatus.CANCELLED
                    || status == OrderStatus.FAILED) {
                continue;
            }

            String reason = "Production Delay";
            if (status == OrderStatus.PENDING_QC) reason = "Quality Hold";
            else if (status == OrderStatus.PENDING) reason = "Not Started";

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("workOrder", order.getWorkOrder());
            row.put("product", order.getProduct());
            row.put("department", order.getDepartment());
            row.put("dueDate", dueDate.toString());
            row.put("expectedDate", today.toString());
            row.put("delayDays", (int) Math.max(0, ChronoUnit.DAYS.between(dueDate, today)));
            row.put("currentStage", order.getCurrentStage());
            row.put("reason", reason);
            row.put("status", status == null ? null : status.getDisplayName());
            records.add(row);
        }

        records.sort(Comparator.comparingInt((Map<String, Object> row) -> (int) row.get("delayDays")).reversed());

        int totalDelayDays = 0;
        int onHold = 0;
        for (Map<String, Object> row : records) {
            totalDelayDays += (int) row.get("delayDays");
            String status = (String) row.get("status");
            if ("Pending QC".equals(status) || "Pending".equals(status)) onHold++;
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("delayedOrders", records.size());
        summary.put("totalDelayDays", totalDelayDays);
        summary.put("averageDelayDays",
                records.isEmpty() ? 0 : (int) Math.round((double) totalDelayDays / records.size()));
        summary.put("ordersOnHold", onHold);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("records", records);
        payload.put("summary", summary);
        return payload;
    }

    // ==================================================================
    // Shared helpers
    // ==================================================================

    /**
     * Orders matching the report filters, resolved in the database
     * (department / status / start-date range) rather than in the browser.
     */
    private List<ProductionOrder> filteredOrders(Filters filters) {
        Specification<ProductionOrder> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (filters.department() != null) {
                predicates.add(cb.equal(root.get("department"), filters.department()));
            }
            OrderStatus status = toOrderStatus(filters.status());
            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (filters.dateFrom() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("startDate"), filters.dateFrom()));
            }
            if (filters.dateTo() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("startDate"), filters.dateTo()));
            }
            return predicates.isEmpty() ? cb.conjunction() : cb.and(predicates.toArray(new Predicate[0]));
        };
        return orderRepository.findAll(spec);
    }

    /** Stage-entry rejects for the given orders (keyed by numeric order id). */
    private int rejectedFor(List<ProductionOrder> orders) {
        if (orders.isEmpty()) return 0;
        Set<Long> ids = new LinkedHashSet<>();
        orders.forEach(order -> ids.add(order.getId()));
        Specification<ProductionEntry> spec = (root, query, cb) ->
                root.get("productionOrder").get("id").in(ids);
        int total = 0;
        for (ProductionEntry entry : entryRepository.findAll(spec)) {
            total += nz(entry.getRejectedQuantity());
        }
        return total;
    }

    private static OrderStatus toOrderStatus(String displayName) {
        if (displayName == null) return null;
        try {
            return OrderStatus.fromDisplayName(displayName);
        } catch (IllegalArgumentException e) {
            // An unknown status filter matches nothing rather than everything.
            return null;
        }
    }

    private static int completedFor(int quantity, Integer progress) {
        return (int) Math.round(quantity * (nz(progress) / 100.0));
    }

    private static int percent(int part, int whole, boolean capAt100) {
        if (whole <= 0) return 0;
        int value = (int) Math.round((part * 100.0) / whole);
        return capAt100 ? Math.min(100, value) : value;
    }

    private static int nz(Integer value) {
        return value == null ? 0 : value;
    }
}
