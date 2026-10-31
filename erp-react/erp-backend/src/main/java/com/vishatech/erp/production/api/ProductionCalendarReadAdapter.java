package com.vishatech.erp.production.api;

import com.vishatech.erp.calendar.dto.CalendarEntry;
import com.vishatech.erp.calendar.port.CalendarSourcePort;
import com.vishatech.erp.entity.production.OrderStatus;
import com.vishatech.erp.entity.production.ProductionOrder;
import com.vishatech.erp.repository.production.ProductionOrderRepository;
import com.vishatech.erp.security.Permission;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Production's contribution to {@code GET /calendar/entries}.
 *
 * <p><b>The one published date: {@code ProductionOrder.dueDate}.</b> It is the
 * Work Order's planned completion target - required by the Work Order form,
 * validated to be on or after the start date, and stored as a date-only column
 * ({@code production_orders.due_date}, {@link LocalDate}). The entry is therefore
 * all-day with no invented time.
 *
 * <p><b>Deliberately not published.</b> Each of these was checked and rejected:
 *
 * <ul>
 *   <li>{@code ProductionOrder.startDate} - the form defaults it to today, so in
 *       practice it records when work was entered rather than a forward plan; all
 *       existing rows are in the past.</li>
 *   <li>{@code QualityInspection.inspectionDate} - the date the inspection is
 *       carried out (the form defaults it to today); there is no separate
 *       scheduled-vs-actual pair, and every existing inspection is completed.</li>
 *   <li>{@code Dispatch.dispatchDate} / {@code Dispatch.expectedDeliveryDate} -
 *       the former is the actual dispatch date ({@code dispatches} rows are
 *       created when goods leave), the latter is not exposed by
 *       {@code DispatchDTO} nor entered anywhere; the Sales calendar already
 *       publishes a delivery challan's dispatch date.</li>
 *   <li>{@code PackingList.packingDate} and {@code ProductionEntry.entryDate} -
 *       records of work already done, not deadlines.</li>
 *   <li>{@code ProductionTracker}'s due date and twelve stage dates - that
 *       module's table is empty and its service is unused by the UI, so its dates
 *       are unsupported as well as unpopulated.</li>
 *   <li>Audit timestamps ({@code createdAt}, {@code updatedAt},
 *       {@code productionApprovedAt}, {@code adminApprovedAt}) - history, not
 *       schedules.</li>
 * </ul>
 *
 * <p><b>Which orders qualify.</b> Orders whose status is
 * {@link OrderStatus#COMPLETED}, {@link OrderStatus#DISPATCHED},
 * {@link OrderStatus#CANCELLED}, {@link OrderStatus#FAILED},
 * {@link OrderStatus#PRODUCTION_REJECTED} or
 * {@link OrderStatus#ADMIN_REJECTED} are skipped: their due date is either
 * already reached or the order will never reach it, so drawing it would be
 * history or noise. Every remaining status - including {@code DRAFT}, which the
 * Production module's own list and stats count as a live order - is published
 * when it carries a due date. The stored status is published verbatim through
 * {@link OrderStatus#getDisplayName()} and no "overdue" state is invented, even
 * though the Production dashboard derives one for its own counters.
 *
 * <p><b>Known duplicate risk (documented, not merged).</b> Creating a Work Order
 * from a Customer Purchase Order prefills its due date from the CPO's delivery
 * date, and the Sales calendar already publishes {@code SalesOrder.deliveryDate}.
 * A planner who keeps that value will therefore see the same calendar day twice:
 * once as the customer's delivery commitment and once as the production
 * completion target. They are genuinely different records with different owners,
 * so both are published; comparing them would require extending the Sales-owned
 * {@code SalesOrderLookupPort} (it exposes no delivery date), a cross-module
 * change this phase deliberately does not make.
 *
 * <p><b>Read-only.</b> Nothing is written or audited here; one bounded query reads
 * the whole range, and each entry links to the Work Order's existing view route.
 */
@Service
public class ProductionCalendarReadAdapter implements CalendarSourcePort {

    static final String SOURCE = "production";

    /** The Calendar category key for the Production area (already defined). */
    private static final String CATEGORY = SOURCE;

    private static final String ENTITY_TYPE = "ProductionOrder";

    private static final String FIELD_DUE_DATE = "dueDate";

    /**
     * Statuses whose due date is finished or unreachable. Kept in one place so
     * the query and the tests cannot drift apart.
     */
    static final List<OrderStatus> EXCLUDED_STATUSES = List.of(
            OrderStatus.COMPLETED,
            OrderStatus.DISPATCHED,
            OrderStatus.CANCELLED,
            OrderStatus.FAILED,
            OrderStatus.PRODUCTION_REJECTED,
            OrderStatus.ADMIN_REJECTED);

    private final ProductionOrderRepository orderRepository;

    public ProductionCalendarReadAdapter(ProductionOrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    @Override
    public String source() {
        return SOURCE;
    }

    @Override
    public String requiredAuthority() {
        return Permission.PRODUCTION_VIEW.name();
    }

    @Override
    @Transactional(readOnly = true)
    public List<CalendarEntry> entriesBetween(LocalDate from, LocalDate to) {
        List<CalendarEntry> entries = new ArrayList<>();
        for (ProductionOrder order : orderRepository.findAll(eligibleWithDueDate(from, to))) {
            entries.add(entry(order));
        }
        return entries;
    }

    // ------------------------------------------------------------- mapper

    private static CalendarEntry entry(ProductionOrder order) {
        return new CalendarEntry(
                // Stable identity: the Work Order number + the date field + the
                // date, so a refresh replaces the same entry instead of stacking.
                SOURCE + ":" + ENTITY_TYPE + ":" + order.getWorkOrder() + ":"
                        + FIELD_DUE_DATE + ":" + order.getDueDate(),
                SOURCE,
                ENTITY_TYPE,
                order.getId(),
                title(order.getWorkOrder(), order.getCustomer()),
                order.getDueDate(),
                null,
                // Due date is date-only: no time of day is invented.
                null,
                true,
                // The record's own stored status, translated only to its label.
                order.getStatus() == null ? null : order.getStatus().getDisplayName(),
                CATEGORY,
                // The Production module's existing Work Order view route.
                "/production/orders/" + order.getWorkOrder(),
                true);
    }

    private static String title(String workOrder, String customer) {
        StringBuilder title = new StringBuilder("Work order due");
        if (workOrder != null && !workOrder.isBlank()) {
            title.append(' ').append(workOrder.trim());
        }
        if (customer != null && !customer.isBlank()) {
            title.append(" - ").append(customer.trim());
        }
        return title.toString();
    }

    // -------------------------------------------------------- query rule

    /**
     * Due date inside the inclusive range, and a status that still has a reason
     * to appear. {@code production_orders} has no soft-delete column (deleting is
     * limited to Draft orders and is a hard delete), so status is the only
     * exclusion this table needs.
     */
    private static Specification<ProductionOrder> eligibleWithDueDate(LocalDate from, LocalDate to) {
        return (root, query, cb) -> cb.and(
                cb.isNotNull(root.get(FIELD_DUE_DATE)),
                cb.greaterThanOrEqualTo(root.<LocalDate>get(FIELD_DUE_DATE), from),
                cb.lessThanOrEqualTo(root.<LocalDate>get(FIELD_DUE_DATE), to),
                cb.not(root.<OrderStatus>get("status").in(EXCLUDED_STATUSES)));
    }
}
