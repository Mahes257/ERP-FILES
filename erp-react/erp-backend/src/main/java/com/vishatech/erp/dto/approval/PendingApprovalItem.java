package com.vishatech.erp.dto.approval;

/**
 * One record that genuinely awaits an approval decision, as shown on the
 * dedicated Pending Approvals page (and counted by the sidebar badge).
 *
 * <p>This is a read model only: it never carries the record itself, only the
 * facts the page needs to describe it and the frontend route that opens it. The
 * approval decision itself always stays in the owning module — opening an item
 * never approves or rejects anything.
 *
 * <p>Only unresolved approval queues are mapped into this type (see
 * {@code service.ApprovalQueueService} and
 * {@code service.production.ProductionApprovalQueueReader}): drafts, approved,
 * rejected, cancelled, archived and completed records are excluded at the
 * source, so every item here is actionable by construction.
 *
 * @param id         stable, module-scoped identity (e.g. {@code sales:quotation:12})
 *                   used as the React key and for de-duplication
 * @param module     owning module: {@code SALES}, {@code PURCHASE} or {@code PRODUCTION}
 * @param area       submodule label shown next to the module badge
 * @param title      human sentence describing the pending decision
 * @param reference  document / record number (QTN-, PO-, WO-…)
 * @param party      customer, supplier or department where the record has one
 * @param submittedBy who raised it for approval, when the record stores it
 * @param submittedAt ISO-8601 timestamp of submission (falls back to creation time)
 * @param status     the record's current, approval-relevant status
 * @param priority   the record's priority, when the workflow has one
 * @param route      frontend route that opens the record's approval screen
 * @param actionLabel short call to action for the row's open control
 */
public record PendingApprovalItem(
        String id,
        String module,
        String area,
        String title,
        String reference,
        String party,
        String submittedBy,
        String submittedAt,
        String status,
        String priority,
        String route,
        String actionLabel) {

    public static final String MODULE_SALES = "SALES";
    public static final String MODULE_PURCHASE = "PURCHASE";
    public static final String MODULE_PRODUCTION = "PRODUCTION";
}
