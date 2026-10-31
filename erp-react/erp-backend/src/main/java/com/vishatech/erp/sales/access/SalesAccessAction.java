package com.vishatech.erp.sales.access;

/**
 * The actions an administrator can grant per Sales area.
 *
 * <p>Only actions that genuinely exist in the Sales module are modelled, so the
 * matrix never offers a switch for an operation the codebase does not perform:
 *
 * <ul>
 *   <li>no {@code print} — no Sales endpoint generates a printable document
 *       server-side (printing happens in the browser, over data the user was
 *       already allowed to read);</li>
 *   <li>no {@code download} — document downloads go through the shared
 *       {@code /documents/{id}/file} route, which is already governed by the
 *       pre-existing {@code DOCUMENT_*} authorities and per-record checks, so a
 *       Sales-layer switch could not be enforced without also changing the
 *       Production and Purchase document pages.</li>
 * </ul>
 */
public enum SalesAccessAction {

    /** Read the page and the data behind it. */
    VIEW("view"),
    CREATE("create"),
    EDIT("edit"),
    DELETE("delete"),
    /** Approve / reject / send back / float / issue — the module's workflow gates. */
    APPROVE("approve"),
    /** Submit a record for approval (the endpoint that moves it into the workflow). */
    SUBMIT("submit"),
    /** E-mail a finished document to the customer. */
    SEND("send"),
    EXPORT("export"),
    /** Bulk import / document extraction (Leads and Sales Contracts). */
    IMPORT("import"),
    /** Upload attachments and supporting documents. */
    UPLOAD("upload");

    private final String key;

    SalesAccessAction(String key) {
        this.key = key;
    }

    public String key() {
        return key;
    }

    public static SalesAccessAction fromKey(String key) {
        if (key == null) {
            return null;
        }
        for (SalesAccessAction action : values()) {
            if (action.key.equalsIgnoreCase(key.trim())) {
                return action;
            }
        }
        return null;
    }
}
