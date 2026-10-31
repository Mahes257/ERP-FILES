package com.vishatech.erp.production.access;

/**
 * The actions an administrator can grant per Production area.
 *
 * <p>Every entry below is a real operation in the Production module — the
 * action list was read off the controllers under
 * {@code com.vishatech.erp.controller.production} and the pages under
 * {@code src/production}. Actions the module does not perform are not modelled:
 *
 * <ul>
 *   <li>{@code import} — no Production endpoint or screen imports records;</li>
 *   <li>{@code download} exists only where a file download is a separable
 *       operation. Drawings have one ({@code GET /drawings/{id}/download}, the
 *       list's Download action) while the drawing viewer reads
 *       {@code GET /drawings/{id}/file}, so viewing a drawing stays a View
 *       action. Models have no separate download: their only file endpoint is
 *       {@code GET /models/{id}/download}, which the 3D viewer itself needs, so
 *       gating it would break viewing rather than protect a download;</li>
 *   <li>{@code print} and {@code export} are enforced in the UI: printing and
 *       the CSV/PDF exports are produced in the browser from data the user was
 *       already allowed to read, so there is no server endpoint to refuse. The
 *       switches are still real — they hide/disable those controls.</li>
 * </ul>
 */
public enum ProductionAccessAction {

    /** Read the page and the data behind it. */
    VIEW("view"),
    CREATE("create"),
    EDIT("edit"),
    DELETE("delete"),
    /** Submit a record into its approval workflow (submit / resubmit). */
    SUBMIT("submit"),
    /** Approve / reject / verify the workflow gate of a record. */
    APPROVE("approve"),
    /** Start a shop-floor job or an inspection. */
    START("start"),
    /** Put a job on hold, and resume it. */
    HOLD("hold"),
    /** Complete a job. */
    COMPLETE("complete"),
    /** Skip a casting stage. */
    SKIP("skip"),
    /** Pass an inspection. */
    PASS("pass"),
    /** Fail an inspection. */
    FAIL("fail"),
    /** Cancel a work order. */
    CANCEL("cancel"),
    /** Release a finished work order for dispatch. */
    RELEASE("release"),
    /** Run a CAD conversion for a model. */
    CONVERT("convert"),
    /** Upload a file or an attachment. */
    UPLOAD("upload"),
    /** Download the record's file (Drawings). */
    DOWNLOAD("download"),
    /** Export the list / report (browser-side CSV/PDF). */
    EXPORT("export"),
    /** Print the page or its PDF (browser-side). */
    PRINT("print");

    private final String key;

    ProductionAccessAction(String key) {
        this.key = key;
    }

    public String key() {
        return key;
    }

    public static ProductionAccessAction fromKey(String key) {
        if (key == null) {
            return null;
        }
        for (ProductionAccessAction action : values()) {
            if (action.key.equalsIgnoreCase(key.trim())) {
                return action;
            }
        }
        return null;
    }
}
