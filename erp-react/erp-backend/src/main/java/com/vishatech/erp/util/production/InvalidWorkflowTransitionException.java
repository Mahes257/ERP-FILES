package com.vishatech.erp.util.production;

/**
 * Thrown when an invalid status transition is attempted.
 */
public class InvalidWorkflowTransitionException extends RuntimeException {
    private final String fromStatus;
    private final String toStatus;

    public InvalidWorkflowTransitionException(String fromStatus, String toStatus) {
        super("Invalid transition from '" + fromStatus + "' to '" + toStatus + "'");
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
    }

    public InvalidWorkflowTransitionException(String message) {
        super(message);
        this.fromStatus = null;
        this.toStatus = null;
    }

    public String getFromStatus() { return fromStatus; }
    public String getToStatus() { return toStatus; }
}
