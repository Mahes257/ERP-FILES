package com.vishatech.erp.purchase.access;

/**
 * The actions an administrator can grant per Purchase area.
 *
 * <p>Every entry below is a real operation in the Purchase module — the list was
 * read off the controllers under {@code com.vishatech.erp.controller} that are
 * mounted on {@code /api/purchase/**} and the pages under
 * {@code src/purchase/pages}. Actions Purchase does not perform are not
 * modelled: there is no {@code import} anywhere in the module, and Document
 * uploads/downloads that belong to the shared repository keep their existing
 * {@code DOCUMENT_*} authorities.
 *
 * <ul>
 *   <li>{@code delete} is a real, separable operation even though today's
 *       controllers authorise deletes with {@code PURCHASE_EDIT}. Its default is
 *       therefore derived from EDIT (so nothing changes for existing roles) but
 *       an administrator can switch deletion off while editing stays on.</li>
 *   <li>{@code submit}, {@code release}, {@code acknowledge}, {@code convert},
 *       {@code evaluate}, {@code award}, {@code close}, {@code cancel},
 *       {@code complete}, {@code receive}, {@code match}, {@code pay} and
 *       {@code upload} are each a distinct workflow step with its own endpoint;
 *       they are modelled separately so one step can be withdrawn without
 *       blocking the others.</li>
 *   <li>{@code print}, {@code export} and {@code download} are browser-side
 *       outputs produced from data the user was already allowed to read, so they
 *       are enforced by the UI (the print pages are additionally route-gated).
 *       Download is offered because vendor documents and attachments are a
 *       separable file operation.</li>
 * </ul>
 */
public enum PurchaseAccessAction {

    /** Read the page and the data behind it. */
    VIEW("view"),
    CREATE("create"),
    EDIT("edit"),
    DELETE("delete"),
    /** Submit a record into its approval workflow (submit, submit-review, send RFQ). */
    SUBMIT("submit"),
    /** Approve the workflow gate of a record (approve, return, complete technical review). */
    APPROVE("approve"),
    /** Reject at a workflow gate. */
    REJECT("reject"),
    /** Release an approved purchase order. */
    RELEASE("release"),
    /** Record the supplier's acknowledgement of a purchase order. */
    ACKNOWLEDGE("acknowledge"),
    /** Convert a requisition into an RFQ. */
    CONVERT("convert"),
    /** Run / save a quotation evaluation. */
    EVALUATE("evaluate"),
    /** Award an RFQ to a vendor. */
    AWARD("award"),
    /** Close an RFQ. */
    CLOSE("close"),
    /** Cancel an RFQ, a follow-up or a payment. */
    CANCEL("cancel"),
    /** Complete an RFQ follow-up. */
    COMPLETE("complete"),
    /** Receive a goods receipt (GRN). */
    RECEIVE("receive"),
    /** Run the invoice three-way match. */
    MATCH("match"),
    /** Pay an invoice, generate/send a payment advice or reverse a payment. */
    PAY("pay"),
    /** Upload an attachment. */
    UPLOAD("upload"),
    /** Download a vendor document or attachment. */
    DOWNLOAD("download"),
    /** Export the list / report (browser-side CSV / PDF). */
    EXPORT("export"),
    /** Print a document (browser-side; the print pages are also route-gated). */
    PRINT("print");

    private final String key;

    PurchaseAccessAction(String key) {
        this.key = key;
    }

    public String key() {
        return key;
    }

    public static PurchaseAccessAction fromKey(String key) {
        if (key == null) {
            return null;
        }
        for (PurchaseAccessAction action : values()) {
            if (action.key.equalsIgnoreCase(key.trim())) {
                return action;
            }
        }
        return null;
    }
}
