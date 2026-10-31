package com.vishatech.erp.service.production;

import com.vishatech.erp.dto.approval.PendingApprovalItem;
import com.vishatech.erp.entity.production.OrderStatus;
import com.vishatech.erp.entity.production.ProductionOrder;
import com.vishatech.erp.repository.production.ProductionOrderRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Production-owned reader behind the ERP-wide Pending Approvals page.
 *
 * <p>It publishes only genuine approval queues. The two stages an approval
 * decision can be taken on today are {@code PENDING_PRODUCTION_APPROVAL} and
 * {@code PENDING_ADMIN_APPROVAL} — exactly the states
 * {@code ProductionOrderService#approveProduction} / {@code #approveAdmin}
 * accept. A released {@code PENDING} work order is <em>not</em> an approval
 * (it waits to be started, not approved), so it is deliberately excluded here
 * even though the sidebar badge still counts it as pending production work.
 *
 * <p>The class lives in the production package, so the shared aggregation
 * service depends on this published reader rather than on production
 * persistence.
 */
@Service
public class ProductionApprovalQueueReader {

    /** The two approval stages of the work-order pipeline. */
    private static final Set<OrderStatus> APPROVAL_STATUSES =
            EnumSet.of(OrderStatus.PENDING_PRODUCTION_APPROVAL, OrderStatus.PENDING_ADMIN_APPROVAL);

    private final ProductionOrderRepository orderRepository;

    public ProductionApprovalQueueReader(ProductionOrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    /** Work orders currently sitting in an approval queue. */
    @Transactional(readOnly = true)
    public List<PendingApprovalItem> pendingApprovalOrders() {
        List<PendingApprovalItem> items = new ArrayList<>();
        for (ProductionOrder order : orderRepository.findByStatusInOrderByDueDateAsc(APPROVAL_STATUSES)) {
            items.add(toItem(order));
        }
        return items;
    }

    private static PendingApprovalItem toItem(ProductionOrder order) {
        boolean adminStage = order.getStatus() == OrderStatus.PENDING_ADMIN_APPROVAL;
        // Once production approval is granted the work order moves to the admin
        // queue; that transition time is when it started waiting on this stage.
        Instant enteredQueueAt = adminStage ? order.getProductionApprovedAt() : order.getAdminApprovedAt();
        String submittedBy = adminStage
                ? firstNonBlank(order.getProductionApprovedBy(), order.getCreatedBy())
                : firstNonBlank(order.getCreatedBy(), order.getProductionApprovedBy());
        String workOrder = order.getWorkOrder() == null ? "work order" : order.getWorkOrder();
        return new PendingApprovalItem(
                "production:workOrder:" + order.getId(),
                PendingApprovalItem.MODULE_PRODUCTION,
                "Production Orders",
                "Work order " + workOrder + (adminStage
                        ? " awaiting admin approval"
                        : " awaiting production approval"),
                workOrder,
                order.getCustomer(),
                submittedBy,
                enteredQueueAt == null ? null : enteredQueueAt.toString(),
                order.getStatus().getDisplayName(),
                order.getPriority() == null ? null : order.getPriority().getDisplayName(),
                "/production/orders/" + order.getId(),
                "Review work order");
    }

    private static String firstNonBlank(String first, String second) {
        if (first != null && !first.isBlank()) {
            return first;
        }
        return second == null || second.isBlank() ? null : second;
    }
}
