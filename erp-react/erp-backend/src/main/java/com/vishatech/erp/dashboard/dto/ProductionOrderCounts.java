package com.vishatech.erp.dashboard.dto;

/**
 * Production-order counters and the average progress of all persisted orders.
 *
 * <p>Both approval states are reported separately because the dashboard exposes
 * their sum as "pending approval"; the addition stays in the dashboard so the
 * implementation only publishes the module's own numbers.
 *
 * @param total                     every persisted production order
 * @param pendingProductionApproval orders waiting for production approval
 * @param pendingAdminApproval      orders waiting for admin approval
 * @param pending                   approved work orders waiting to start
 *                                  (status PENDING — not an approval stage)
 * @param inProgress                orders in progress
 * @param hold                      orders on hold
 * @param completed                 completed orders
 * @param averageProgress           average progress percentage, rounded
 */
public record ProductionOrderCounts(long total,
                                    long pendingProductionApproval,
                                    long pendingAdminApproval,
                                    long pending,
                                    long inProgress,
                                    long hold,
                                    long completed,
                                    int averageProgress) {
}
