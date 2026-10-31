package com.vishatech.erp.service.production;

import com.vishatech.erp.dto.production.PagedResponse;
import com.vishatech.erp.entity.production.QualityInspection;
import com.vishatech.erp.entity.production.Dispatch;
import com.vishatech.erp.entity.production.DispatchStatus;
import com.vishatech.erp.entity.production.EntryStatus;
import com.vishatech.erp.entity.production.OrderStatus;
import com.vishatech.erp.entity.production.PackingList;
import com.vishatech.erp.entity.production.PackingStatus;
import com.vishatech.erp.entity.production.ProductionEntry;
import com.vishatech.erp.entity.production.ProductionOrder;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.repository.production.QualityInspectionRepository;
import com.vishatech.erp.repository.production.DispatchRepository;
import com.vishatech.erp.repository.production.PackingListRepository;
import com.vishatech.erp.repository.production.ProductionEntryRepository;
import com.vishatech.erp.repository.production.ProductionOrderRepository;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;

/**
 * Production KPI aggregation — the data behind the Production KPI screens
 * (Production Orders tab/KPI counters, the KPI details pages and the shop-floor
 * KPI cards).
 *
 * Every KPI is a database question: the definition selects rows with a WHERE
 * clause, the count is a COUNT over the same predicate and a screen either asks
 * for one page of rows or for the counters. The browser is never handed a table
 * so it can tally it.
 *
 * The KPI definitions mirror {@code src/production/pages/KpiDetailsPage.jsx}
 * (filterData / STATUS_FILTERS) and {@code ProductionOrders.jsx} (TAB_STATUSES)
 * exactly — same status sets, same "delayed" rule, same row fields — so the
 * numbers and the rows are unchanged, they are just computed in SQL now.
 */
@Service
@Transactional(readOnly = true)
public class ProductionKpiService {

    /** Rows per page when the caller does not choose one (mirrors the UI). */
    public static final int DEFAULT_PAGE_SIZE = 25;

    /** Hard ceiling for a single KPI page. */
    public static final int MAX_PAGE_SIZE = 100;

    /** Shop-floor module key → ProductionEntry.productionType. */
    private static final Map<String, String> SHOP_FLOOR_TYPES = Map.of(
            "casting", "Casting",
            "fabrication", "Fabrication",
            "assembly", "Assembly",
            "machineShop", "Machine Shop");

    /**
     * Production Orders KPI cards / tabs — the status sets used by
     * ProductionOrders.jsx TAB_STATUSES and the KpiDetailsPage "orders" module.
     * An empty list means "no status restriction" (the Total card).
     */
    private static final Map<String, List<OrderStatus>> ORDER_KPIS = Map.ofEntries(
            Map.entry("total", List.of()),
            Map.entry("draft", List.of(OrderStatus.DRAFT)),
            Map.entry("prodApproval", List.of(
                    OrderStatus.PENDING_PRODUCTION_APPROVAL, OrderStatus.PRODUCTION_APPROVED)),
            Map.entry("adminApproval", List.of(
                    OrderStatus.PENDING_ADMIN_APPROVAL, OrderStatus.ADMIN_APPROVED)),
            Map.entry("approved", List.of(OrderStatus.APPROVED)),
            Map.entry("prodRejected", List.of(OrderStatus.PRODUCTION_REJECTED)),
            Map.entry("adminRejected", List.of(OrderStatus.ADMIN_REJECTED)),
            Map.entry("cancelled", List.of(OrderStatus.CANCELLED)));

    /** Dashboard KPI cards backed by production orders. */
    private static final Map<String, List<OrderStatus>> DASHBOARD_ORDER_KPIS = Map.ofEntries(
            Map.entry("total", List.of()),
            Map.entry("draft", List.of(OrderStatus.DRAFT)),
            Map.entry("pendingApproval", List.of(
                    OrderStatus.PENDING_PRODUCTION_APPROVAL, OrderStatus.PRODUCTION_APPROVED,
                    OrderStatus.PENDING_ADMIN_APPROVAL, OrderStatus.ADMIN_APPROVED)),
            Map.entry("approved", List.of(OrderStatus.APPROVED)),
            Map.entry("inProgress", List.of(OrderStatus.IN_PROGRESS)),
            Map.entry("completed", List.of(
                    OrderStatus.COMPLETED, OrderStatus.PACKED,
                    OrderStatus.READY_FOR_DISPATCH, OrderStatus.DISPATCHED)),
            Map.entry("onHold", List.of(OrderStatus.HOLD)),
            Map.entry("qcPending", List.of(OrderStatus.PENDING_QC)));

    /** The dashboard "delayed" card: past due and not finished/dispatched. */
    private static final List<OrderStatus> DELAYED_EXCLUDED = List.of(
            OrderStatus.COMPLETED, OrderStatus.PACKED,
            OrderStatus.DISPATCHED, OrderStatus.CANCELLED);

    /** Quality KPI keys that are not a plain status equality. */
    private static final List<String> QUALITY_KPIS = List.of(
            "total", "pending", "today", "accepted", "rejected", "onHold");

    private static final Map<String, PackingStatus> PACKING_KPIS = Map.ofEntries(
            Map.entry("pending", PackingStatus.PENDING),
            Map.entry("inProgress", PackingStatus.IN_PROGRESS),
            Map.entry("completed", PackingStatus.COMPLETED),
            Map.entry("readyForDispatch", PackingStatus.READY_FOR_DISPATCH));

    private static final Map<String, DispatchStatus> DISPATCH_KPIS = Map.ofEntries(
            Map.entry("draft", DispatchStatus.DRAFT),
            Map.entry("ready", DispatchStatus.READY),
            Map.entry("dispatched", DispatchStatus.DISPATCHED),
            Map.entry("inTransit", DispatchStatus.IN_TRANSIT),
            Map.entry("delivered", DispatchStatus.DELIVERED));

    private static final Map<String, EntryStatus> SHOP_FLOOR_KPIS = Map.ofEntries(
            Map.entry("pending", EntryStatus.PENDING),
            Map.entry("inProgress", EntryStatus.IN_PROGRESS),
            Map.entry("completed", EntryStatus.COMPLETED),
            Map.entry("onHold", EntryStatus.HOLD));

    private final ProductionOrderRepository orderRepository;
    private final QualityInspectionRepository inspectionRepository;
    private final PackingListRepository packingRepository;
    private final DispatchRepository dispatchRepository;
    private final ProductionEntryRepository entryRepository;

    public ProductionKpiService(ProductionOrderRepository orderRepository,
                                QualityInspectionRepository inspectionRepository,
                                PackingListRepository packingRepository,
                                DispatchRepository dispatchRepository,
                                ProductionEntryRepository entryRepository) {
        this.orderRepository = orderRepository;
        this.inspectionRepository = inspectionRepository;
        this.packingRepository = packingRepository;
        this.dispatchRepository = dispatchRepository;
        this.entryRepository = entryRepository;
    }

    // ------------------------------------------------------------------
    // One page of KPI rows
    // ------------------------------------------------------------------

    /**
     * One bounded page of the records behind {@code module}/{@code kpiKey},
     * filtered, counted and ordered by the database.
     *
     * @param module  orders | dashboard | quality | packing | dispatch |
     *                casting | fabrication | assembly | machineShop
     * @param kpiKey  the KPI card / tab key (see the maps above)
     * @param search  free-text search over the columns the table shows
     * @param status  the screen's status dropdown ("All"/blank = no extra filter)
     */
    public PagedResponse<Map<String, Object>> kpiPage(String module, String kpiKey,
                                                      String search, String status,
                                                      int page, int size) {
        String mod = norm(module);
        String key = norm(kpiKey);
        Pageable pageable = pageable(page, size);

        if (SHOP_FLOOR_TYPES.containsKey(mod)) {
            return shopFloorPage(mod, key, search, status, pageable);
        }
        return switch (mod) {
            case "orders" -> orderPage(ORDER_KPIS, key, search, status, pageable, false);
            case "dashboard" -> dashboardPage(key, search, status, pageable);
            case "quality" -> qualityPage(key, search, status, pageable);
            case "packing" -> packingPage(key, search, status, pageable);
            case "dispatch" -> dispatchPage(key, search, status, pageable);
            default -> throw new BadRequestException("Unknown production KPI module: " + module);
        };
    }

    private PagedResponse<Map<String, Object>> dashboardPage(String key, String search,
                                                             String status, Pageable pageable) {
        if ("packingPending".equals(key)) {
            /* Mirrors filterData: packing records with status Pending / In Progress. */
            return packingPageInternal(List.of(PackingStatus.PENDING, PackingStatus.IN_PROGRESS),
                    search, status, pageable);
        }
        if ("dispatchPending".equals(key)) {
            /* Mirrors filterData: dispatch records with status Draft / Ready. */
            return dispatchPageInternal(List.of(DispatchStatus.DRAFT, DispatchStatus.READY),
                    search, status, pageable);
        }
        if ("delayed".equals(key)) {
            return orderPage(DASHBOARD_ORDER_KPIS, "delayed", search, status, pageable, true);
        }
        return orderPage(DASHBOARD_ORDER_KPIS, key, search, status, pageable, false);
    }

    private PagedResponse<Map<String, Object>> orderPage(Map<String, List<OrderStatus>> definitions,
                                                         String key, String search, String status,
                                                         Pageable pageable, boolean delayed) {
        List<OrderStatus> statuses = delayed
                ? definitions.get("total")
                : definitions.get(key);
        if (statuses == null) {
            throw new BadRequestException("Unknown production KPI: " + key);
        }
        Page<ProductionOrder> result = orderRepository.findAll(
                orderSpec(statuses, search, status, delayed), pageable);
        return toPaged(result, this::orderRow);
    }

    private PagedResponse<Map<String, Object>> qualityPage(String key, String search, String status,
                                                           Pageable pageable) {
        if (!QUALITY_KPIS.contains(key)) {
            throw new BadRequestException("Unknown quality KPI: " + key);
        }
        Page<QualityInspection> result = inspectionRepository.findAll(
                qualitySpec(key, search, status), pageable);
        return toPaged(result, this::qualityRow);
    }

    private PagedResponse<Map<String, Object>> packingPage(String key, String search, String status,
                                                           Pageable pageable) {
        if ("total".equals(key)) {
            return packingPageInternal(List.of(), search, status, pageable);
        }
        PackingStatus wanted = PACKING_KPIS.get(key);
        if (wanted == null) {
            throw new BadRequestException("Unknown packing KPI: " + key);
        }
        return packingPageInternal(List.of(wanted), search, status, pageable);
    }

    private PagedResponse<Map<String, Object>> packingPageInternal(List<PackingStatus> statuses,
                                                                   String search, String status,
                                                                   Pageable pageable) {
        Page<PackingList> result = packingRepository.findAll(
                packingSpec(statuses, search, status), pageable);
        return toPaged(result, this::packingRow);
    }

    private PagedResponse<Map<String, Object>> dispatchPage(String key, String search, String status,
                                                            Pageable pageable) {
        if ("total".equals(key)) {
            return dispatchPageInternal(List.of(), search, status, pageable);
        }
        DispatchStatus wanted = DISPATCH_KPIS.get(key);
        if (wanted == null) {
            throw new BadRequestException("Unknown dispatch KPI: " + key);
        }
        return dispatchPageInternal(List.of(wanted), search, status, pageable);
    }

    private PagedResponse<Map<String, Object>> dispatchPageInternal(List<DispatchStatus> statuses,
                                                                    String search, String status,
                                                                    Pageable pageable) {
        Page<Dispatch> result = dispatchRepository.findAll(
                dispatchSpec(statuses, search, status), pageable);
        return toPaged(result, this::dispatchRow);
    }

    private PagedResponse<Map<String, Object>> shopFloorPage(String module, String key, String search,
                                                             String status, Pageable pageable) {
        String productionType = SHOP_FLOOR_TYPES.get(module);
        if ("total".equals(key)) {
            Page<ProductionEntry> result = entryRepository.findAll(
                    entrySpec(productionType, null, search, status), pageable);
            return toPaged(result, this::entryRow);
        }
        EntryStatus wanted = SHOP_FLOOR_KPIS.get(key);
        if (wanted == null) {
            throw new BadRequestException("Unknown shop-floor KPI: " + key);
        }
        Page<ProductionEntry> result = entryRepository.findAll(
                entrySpec(productionType, wanted, search, status), pageable);
        return toPaged(result, this::entryRow);
    }

    // ------------------------------------------------------------------
    // Counters (COUNT over the same predicates — never a loaded table)
    // ------------------------------------------------------------------

    /** Every Production Orders KPI counter: total, draft, prodApproval, … cancelled. */
    public Map<String, Object> orderCounts() {
        Map<String, Object> counts = new LinkedHashMap<>();
        ORDER_KPIS.forEach((key, statuses) ->
                counts.put(key, orderRepository.count(orderSpec(statuses, null, null, false))));
        return counts;
    }

    /** Dashboard counters for the KPI cards + the packing/dispatch pending cards. */
    public Map<String, Object> dashboardCounts() {
        Map<String, Object> counts = new LinkedHashMap<>();
        DASHBOARD_ORDER_KPIS.forEach((key, statuses) ->
                counts.put(key, orderRepository.count(orderSpec(statuses, null, null, false))));
        counts.put("delayed", orderRepository.count(
                orderSpec(DASHBOARD_ORDER_KPIS.get("total"), null, null, true)));
        counts.put("packingPending", packingRepository.count(
                packingSpec(List.of(PackingStatus.PENDING, PackingStatus.IN_PROGRESS), null, null)));
        counts.put("dispatchPending", dispatchRepository.count(
                dispatchSpec(List.of(DispatchStatus.DRAFT, DispatchStatus.READY), null, null)));
        return counts;
    }

    /**
     * Quality counters for the summary cards and the details pages:
     * pending / today / onHold are record counts, accepted / rejected are
     * units summed in SQL — the same five numbers the Quality page used to
     * compute by filtering and reducing the inspections it had loaded.
     */
    public Map<String, Object> qualityCounts() {
        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("total", inspectionRepository.count());
        counts.put("pending", inspectionRepository.countByStatus("Pending"));
        counts.put("today", inspectionRepository.countByInspectionDate(todayUtc()));
        counts.put("accepted", inspectionRepository.sumAcceptedQuantity());
        counts.put("rejected", inspectionRepository.sumRejectedQuantity());
        counts.put("onHold", inspectionRepository.countByStatus("Hold"));
        return counts;
    }

    /** Shop-floor counters (jobs per status for one shop-floor module). */
    public Map<String, Object> shopFloorCounts(String module) {
        String productionType = SHOP_FLOOR_TYPES.get(norm(module));
        if (productionType == null) {
            throw new BadRequestException("Unknown shop-floor module: " + module);
        }
        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("total", entryRepository.count(entrySpec(productionType, null, null, null)));
        SHOP_FLOOR_KPIS.forEach((key, wanted) ->
                counts.put(key, entryRepository.count(entrySpec(productionType, wanted, null, null))));
        return counts;
    }

    /** Counters by module name — the single entry point used by the controller. */
    public Map<String, Object> counts(String module) {
        String mod = norm(module);
        if (SHOP_FLOOR_TYPES.containsKey(mod)) {
            return shopFloorCounts(mod);
        }
        return switch (mod) {
            case "orders" -> orderCounts();
            case "dashboard" -> dashboardCounts();
            case "quality" -> qualityCounts();
            /* Packing and dispatch keep their own module /stats endpoints —
               duplicating those counters here would give one KPI two homes. */
            default -> throw new BadRequestException("No KPI counters for module: " + module);
        };
    }

    // ------------------------------------------------------------------
    // Predicates
    // ------------------------------------------------------------------

    private Specification<ProductionOrder> orderSpec(List<OrderStatus> statuses, String search,
                                                     String statusFilter, boolean delayed) {
        OrderStatus filter = parseOrderStatus(statusFilter);
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (statuses != null && !statuses.isEmpty()) {
                predicates.add(root.get("status").in(statuses));
            }
            if (delayed) {
                /* Mirrors the dashboard card's `new Date(o.dueDate) < new Date()`:
                   a date-only dueDate parses to 00:00 UTC, so an order due today
                   is already past due for any time after UTC midnight. */
                predicates.add(cb.lessThanOrEqualTo(root.get("dueDate"), todayUtc()));
                predicates.add(cb.not(root.get("status").in(DELAYED_EXCLUDED)));
            }
            if (filter != null) {
                predicates.add(cb.equal(root.get("status"), filter));
            }
            if (hasText(search)) {
                String like = like(search);
                List<Predicate> matches = new ArrayList<>(List.of(
                        cb.like(cb.lower(cb.coalesce(root.get("workOrder"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("product"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("department"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("dueDate").as(String.class), "")), like)));
                /* Status is an enum — match it through its display name so the
                   search still finds "Packed" / "Pending QC". */
                List<OrderStatus> statusMatches = enumMatches(search, OrderStatus.values(),
                        OrderStatus::getDisplayName);
                if (!statusMatches.isEmpty()) {
                    matches.add(root.get("status").in(statusMatches));
                }
                predicates.add(cb.or(matches.toArray(new Predicate[0])));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Specification<QualityInspection> qualitySpec(String key, String search, String statusFilter) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            switch (key) {
                case "pending" -> predicates.add(cb.equal(root.get("status"), "Pending"));
                case "today" -> predicates.add(cb.equal(root.get("inspectionDate"), todayUtc()));
                case "accepted" -> predicates.add(cb.greaterThan(root.get("acceptedQuantity"), 0));
                case "rejected" -> predicates.add(cb.greaterThan(root.get("rejectedQuantity"), 0));
                case "onHold" -> predicates.add(cb.equal(root.get("status"), "Hold"));
                case "total" -> { /* no extra predicate */ }
                default -> predicates.add(cb.disjunction());
            }
            if (hasText(statusFilter)) {
                predicates.add(cb.equal(root.get("status"), statusFilter.trim()));
            }
            if (hasText(search)) {
                String like = like(search);
                predicates.add(cb.or(
                        cb.like(cb.lower(cb.coalesce(root.get("id"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("productionOrderId"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("workOrder"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("product"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("inspector"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("status"), "")), like)));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Specification<PackingList> packingSpec(List<PackingStatus> statuses, String search,
                                                   String statusFilter) {
        PackingStatus filter = parsePackingStatus(statusFilter);
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (statuses != null && !statuses.isEmpty()) {
                predicates.add(root.get("status").in(statuses));
            }
            if (filter != null) {
                predicates.add(cb.equal(root.get("status"), filter));
            }
            if (hasText(search)) {
                String like = like(search);
                List<Predicate> matches = new ArrayList<>(List.of(
                        cb.like(cb.lower(cb.coalesce(root.get("packingListNumber"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("workOrderId"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("product"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("customer"), "")), like)));
                List<PackingStatus> statusMatches = enumMatches(search, PackingStatus.values(),
                        s -> display(s.name()));
                if (!statusMatches.isEmpty()) {
                    matches.add(root.get("status").in(statusMatches));
                }
                predicates.add(cb.or(matches.toArray(new Predicate[0])));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Specification<Dispatch> dispatchSpec(List<DispatchStatus> statuses, String search,
                                                 String statusFilter) {
        DispatchStatus filter = parseDispatchStatus(statusFilter);
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (statuses != null && !statuses.isEmpty()) {
                predicates.add(root.get("status").in(statuses));
            }
            if (filter != null) {
                predicates.add(cb.equal(root.get("status"), filter));
            }
            if (hasText(search)) {
                String like = like(search);
                List<Predicate> matches = new ArrayList<>(List.of(
                        cb.like(cb.lower(cb.coalesce(root.get("dispatchNumber"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("workOrderId"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("product"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("customer"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("transporter"), "")), like)));
                List<DispatchStatus> statusMatches = enumMatches(search, DispatchStatus.values(),
                        s -> display(s.name()));
                if (!statusMatches.isEmpty()) {
                    matches.add(root.get("status").in(statusMatches));
                }
                predicates.add(cb.or(matches.toArray(new Predicate[0])));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Specification<ProductionEntry> entrySpec(String productionType, EntryStatus kpiStatus,
                                                     String search, String statusFilter) {
        EntryStatus filter = parseEntryStatus(statusFilter);
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("productionType"), productionType));
            if (kpiStatus != null) {
                predicates.add(cb.equal(root.get("status"), kpiStatus));
            }
            if (filter != null) {
                predicates.add(cb.equal(root.get("status"), filter));
            }
            if (hasText(search)) {
                String like = like(search);
                List<Predicate> matches = new ArrayList<>(List.of(
                        cb.like(cb.lower(cb.coalesce(root.get("id").as(String.class), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("workOrderItemId"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("operator"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("productionOrder").get("workOrder"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("productionOrder").get("product"), "")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("inputQuantity").as(String.class), "")), like)));
                List<EntryStatus> statusMatches = enumMatches(search, EntryStatus.values(),
                        EntryStatus::getDisplayName);
                if (!statusMatches.isEmpty()) {
                    matches.add(root.get("status").in(statusMatches));
                }
                predicates.add(cb.or(matches.toArray(new Predicate[0])));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    // ------------------------------------------------------------------
    // Row projections — exactly the columns the KPI tables render
    // ------------------------------------------------------------------

    private Map<String, Object> orderRow(ProductionOrder order) {
        Map<String, Object> row = new LinkedHashMap<>();
        /* The list DTO exposes the Work Order string as `id` and the numeric
           primary key as `backendId`; the KPI table links on `id`. */
        row.put("id", order.getWorkOrder());
        row.put("backendId", order.getId());
        row.put("workOrder", order.getWorkOrder());
        row.put("product", order.getProduct());
        row.put("department", order.getDepartment());
        row.put("status", order.getStatus() != null ? order.getStatus().getDisplayName() : null);
        row.put("dueDate", order.getDueDate() != null ? order.getDueDate().toString() : null);
        return row;
    }

    private Map<String, Object> qualityRow(QualityInspection inspection) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", inspection.getId());
        row.put("productionOrder", productionOrderRef(inspection));
        row.put("product", inspection.getProduct());
        row.put("inspector", inspection.getInspector());
        row.put("status", inspection.getStatus());
        return row;
    }

    private String productionOrderRef(QualityInspection inspection) {
        if (hasText(inspection.getProductionOrderId())) {
            return inspection.getProductionOrderId();
        }
        return inspection.getWorkOrder();
    }

    private Map<String, Object> packingRow(PackingList packing) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", packing.getId());
        row.put("productionOrder", packing.getWorkOrderId());
        row.put("product", packing.getProduct());
        row.put("customer", packing.getCustomer());
        row.put("status", packing.getStatus() != null ? display(packing.getStatus().name()) : null);
        return row;
    }

    private Map<String, Object> dispatchRow(Dispatch dispatch) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", dispatch.getId());
        row.put("productionOrder", dispatch.getWorkOrderId());
        row.put("product", dispatch.getProduct());
        row.put("customer", dispatch.getCustomer());
        row.put("status", dispatch.getStatus() != null ? display(dispatch.getStatus().name()) : null);
        return row;
    }

    private Map<String, Object> entryRow(ProductionEntry entry) {
        ProductionOrder order = entry.getProductionOrder();
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", entry.getId());
        row.put("productionOrder", order != null ? order.getWorkOrder() : entry.getWorkOrderItemId());
        row.put("workOrder", order != null ? order.getWorkOrder() : null);
        /* The KPI table renders the Work Order's product (the shop-floor DTO has
           no product of its own) and the entry's input quantity. */
        row.put("product", order != null ? order.getProduct() : null);
        row.put("quantity", entry.getInputQuantity());
        row.put("status", entry.getStatus() != null ? entry.getStatus().getDisplayName() : null);
        return row;
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /**
     * Bounded page request: size 25 by default, never above 100, deterministic
     * newest-first ordering (id breaks ties so paging can never repeat a row).
     */
    private Pageable pageable(int page, int size) {
        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        int safePage = Math.max(0, page);
        return PageRequest.of(safePage, safeSize,
                Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")));
    }

    private <T> PagedResponse<Map<String, Object>> toPaged(Page<T> page,
                                                           Function<T, Map<String, Object>> mapper) {
        return PagedResponse.<Map<String, Object>>builder()
                .content(page.getContent().stream().map(mapper).toList())
                .page(page.getNumber())
                .size(page.getSize())
                .totalElements(page.getTotalElements())
                .totalPages(page.getTotalPages())
                .first(page.isFirst())
                .last(page.isLast())
                .build();
    }

    private static String norm(String value) {
        return value == null ? "" : value.trim();
    }

    /**
     * "Today" as the Production screens define it: the date part of
     * {@code new Date().toISOString()} — i.e. UTC, not the server's zone.
     */
    private static LocalDate todayUtc() {
        return LocalDate.now(ZoneOffset.UTC);
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank() && !"All".equals(value.trim());
    }

    private static String like(String value) {
        return "%" + value.trim().toLowerCase(Locale.ROOT) + "%";
    }

    /** "READY_FOR_DISPATCH" → "READY FOR DISPATCH" — the list APIs' convention. */
    private static String display(String enumName) {
        return enumName.replace('_', ' ');
    }

    private static OrderStatus parseOrderStatus(String value) {
        if (!hasText(value)) return null;
        try {
            return OrderStatus.fromDisplayName(value);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static PackingStatus parsePackingStatus(String value) {
        if (!hasText(value)) return null;
        try {
            return PackingStatus.valueOf(value.trim().toUpperCase(Locale.ROOT).replace(' ', '_'));
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static DispatchStatus parseDispatchStatus(String value) {
        if (!hasText(value)) return null;
        try {
            return DispatchStatus.valueOf(value.trim().toUpperCase(Locale.ROOT).replace(' ', '_'));
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static EntryStatus parseEntryStatus(String value) {
        if (!hasText(value)) return null;
        try {
            return EntryStatus.fromDisplayName(value);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    /** Enum values whose display name contains the search term. */
    private static <E> List<E> enumMatches(String search, E[] values, Function<E, String> displayOf) {
        String term = search.trim().toLowerCase(Locale.ROOT);
        List<E> matches = new ArrayList<>();
        for (E value : values) {
            String label = displayOf.apply(value);
            if (label != null && label.toLowerCase(Locale.ROOT).contains(term)) {
                matches.add(value);
            }
        }
        return matches;
    }
}
