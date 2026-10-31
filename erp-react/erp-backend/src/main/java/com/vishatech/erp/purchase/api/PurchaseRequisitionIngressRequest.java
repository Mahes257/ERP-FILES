package com.vishatech.erp.purchase.api;

import java.math.BigDecimal;
import java.util.List;

/**
 * The published request contract of {@link PurchaseRequisitionIngressPort}.
 *
 * <p><b>Deliberately named fields, never a positional internal payload.</b> Only
 * the values a converting module can legitimately supply are part of this
 * contract. Purchase fills in the rest of its own requisition payload (record
 * type, GST/terms defaults, totals, workflow status) behind the port, so CPR can
 * neither set nor corrupt Purchase internals.
 *
 * <p><b>No entities, no Purchase DTOs.</b> Every field is a plain value — strings,
 * a quantity and a list of lines — so adopting the port cannot create a hidden
 * JPA or DTO coupling in the other direction.
 *
 * <p><b>Dates.</b> {@code date} and {@code requiredDate} are ISO
 * ({@code yyyy-MM-dd}) strings, the same representation the requisition API
 * accepts and validates.
 *
 * @param title           requisition title (Purchase requires it to be non-blank)
 * @param prType          requisition type, e.g. {@code CPR}
 * @param department      owning department (required)
 * @param project         project / client label shown on the requisition
 * @param requester       requester name (required)
 * @param currency        currency code (required — Purchase refuses a blank one)
 * @param priority        priority label (required; the requisition form's own
 *                        default is {@code Medium})
 * @param deliveryAddress delivery address, nullable
 * @param company         company name, nullable
 * @param date            request date, ISO, required
 * @param requiredDate    required-by date, ISO, required and not before
 *                        {@code date}
 * @param notes           free-text notes, nullable
 * @param internalNotes   internal reference (e.g. the CPR / verification
 *                        provenance), nullable
 * @param items           at least one line; blank descriptions and non-positive
 *                        quantities are rejected by Purchase's validation
 */
public record PurchaseRequisitionIngressRequest(
        String title,
        String prType,
        String department,
        String project,
        String requester,
        String currency,
        String priority,
        String deliveryAddress,
        String company,
        String date,
        String requiredDate,
        String notes,
        String internalNotes,
        List<Line> items) {

    public PurchaseRequisitionIngressRequest {
        items = items == null ? List.of() : List.copyOf(items);
    }

    /**
     * One requisition line.
     *
     * <p>Only the values the conversion knows are published: the item code, its
     * description, unit, quantity, remarks, specification and required-by date.
     * Rate, discount, GST and category stay Purchase-side.
     *
     * @param itemCode      item / drawing reference, nullable
     * @param product       line description (Purchase requires it to be non-blank)
     * @param uom           unit of measure, nullable
     * @param qty           quantity; Purchase requires it to be positive
     * @param remarks       line remarks, nullable
     * @param specification line specification, nullable
     * @param requiredDate  line required-by date, ISO, nullable
     */
    public record Line(
            String itemCode,
            String product,
            String uom,
            BigDecimal qty,
            String remarks,
            String specification,
            String requiredDate) {
    }
}
