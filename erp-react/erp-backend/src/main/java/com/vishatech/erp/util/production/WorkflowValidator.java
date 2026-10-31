package com.vishatech.erp.util.production;

import com.vishatech.erp.entity.production.OrderStatus;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Server-side workflow enforcement.
 * Validates that status transitions are valid according to the defined workflow.
 */
@Component
public class WorkflowValidator {

    /**
     * Define valid transitions for the production order lifecycle.
     * The frontend CANNOT bypass this — the backend controls the workflow.
     */
    private static final Map<OrderStatus, Set<OrderStatus>> VALID_TRANSITIONS;

    static {
        Map<OrderStatus, Set<OrderStatus>> transitions = new EnumMap<>(OrderStatus.class);
        transitions.put(OrderStatus.DRAFT, Set.of(OrderStatus.PENDING_PRODUCTION_APPROVAL, OrderStatus.CANCELLED));
        transitions.put(OrderStatus.PENDING_PRODUCTION_APPROVAL, Set.of(OrderStatus.PRODUCTION_APPROVED, OrderStatus.PRODUCTION_REJECTED, OrderStatus.CANCELLED));
        transitions.put(OrderStatus.PRODUCTION_APPROVED, Set.of(OrderStatus.PENDING_ADMIN_APPROVAL, OrderStatus.CANCELLED));
        transitions.put(OrderStatus.PENDING_ADMIN_APPROVAL, Set.of(OrderStatus.ADMIN_APPROVED, OrderStatus.ADMIN_REJECTED, OrderStatus.CANCELLED));
        transitions.put(OrderStatus.ADMIN_APPROVED, Set.of(OrderStatus.APPROVED, OrderStatus.CANCELLED));
        transitions.put(OrderStatus.APPROVED, Set.of(OrderStatus.PENDING, OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED));
        transitions.put(OrderStatus.PENDING, Set.of(OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED));
        transitions.put(OrderStatus.IN_PROGRESS, Set.of(OrderStatus.PENDING_QC, OrderStatus.HOLD, OrderStatus.CANCELLED));
        transitions.put(OrderStatus.HOLD, Set.of(OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED));
        transitions.put(OrderStatus.PENDING_QC, Set.of(OrderStatus.COMPLETED, OrderStatus.FAILED, OrderStatus.IN_PROGRESS));
        transitions.put(OrderStatus.COMPLETED, Set.of(OrderStatus.PACKED));
        transitions.put(OrderStatus.PACKED, Set.of(OrderStatus.READY_FOR_DISPATCH));
        transitions.put(OrderStatus.READY_FOR_DISPATCH, Set.of(OrderStatus.DISPATCHED));
        transitions.put(OrderStatus.DISPATCHED, Set.of());
        transitions.put(OrderStatus.FAILED, Set.of(OrderStatus.IN_PROGRESS, OrderStatus.PENDING_QC, OrderStatus.CANCELLED));
        transitions.put(OrderStatus.PRODUCTION_REJECTED, Set.of(OrderStatus.DRAFT, OrderStatus.CANCELLED));
        transitions.put(OrderStatus.ADMIN_REJECTED, Set.of(OrderStatus.PRODUCTION_APPROVED, OrderStatus.CANCELLED));
        transitions.put(OrderStatus.CANCELLED, Set.of());
        VALID_TRANSITIONS = Collections.unmodifiableMap(transitions);
    }

    /**
     * Check if a status transition is valid.
     */
    public boolean isValidTransition(OrderStatus from, OrderStatus to) {
        Set<OrderStatus> allowed = VALID_TRANSITIONS.get(from);
        return allowed != null && allowed.contains(to);
    }

    /**
     * Validate a transition and throw if invalid.
     */
    public void validateTransition(OrderStatus from, OrderStatus to) {
        if (!isValidTransition(from, to)) {
            throw new InvalidWorkflowTransitionException(
                from != null ? from.getDisplayName() : "null",
                to != null ? to.getDisplayName() : "null"
            );
        }
    }

    /**
     * Get all valid next statuses for a given status.
     */
    public Set<OrderStatus> getValidNextStatuses(OrderStatus current) {
        return VALID_TRANSITIONS.getOrDefault(current, Set.of());
    }

    /**
     * Map approval actions to status transitions.
     */
    public static final Map<String, OrderStatus> APPROVAL_ACTIONS = Map.of(
        "submit-production-approval", OrderStatus.PENDING_PRODUCTION_APPROVAL,
        "approve-production", OrderStatus.PRODUCTION_APPROVED,
        "submit-admin-approval", OrderStatus.PENDING_ADMIN_APPROVAL,
        "approve-admin", OrderStatus.ADMIN_APPROVED,
        "final-approve", OrderStatus.APPROVED
    );
}
