package com.vishatech.erp.production.access;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

/**
 * The Production module's real functional areas — one per page / board that
 * exists in the current codebase, following the Production sidebar
 * ({@code src/components/Layout/SalesNav.jsx}) and
 * {@code src/production/routes/productionRoutes.jsx}.
 *
 * <p>Each area declares exactly the actions its endpoints and screens really
 * support, so the Access Management matrix never offers a switch for an
 * operation that does not exist. The lists were read off the controllers, e.g.:
 *
 * <ul>
 *   <li>{@code Work Orders} — {@code /production-orders/**}: create/edit/delete,
 *       {@code submit-*-approval}, {@code approve-*}/{@code final-approve}/
 *       {@code reject-*}, {@code start-production}, {@code hold}/{@code resume},
 *       {@code complete}, {@code cancel}, {@code ready-for-dispatch} and the
 *       attachment uploads; plus the page's browser-side print;</li>
 *   <li>{@code Technical Verification} — {@code /technical-verifications/**}
 *       only has create, delete, {@code verify}/{@code reject} and
 *       {@code resubmit}: there is no update endpoint, so no Edit switch;</li>
 *   <li>{@code Quality} — {@code /quality-inspections/**}: create/edit/delete,
 *       {@code start}, {@code pass}, {@code fail}, {@code hold} and the page's CSV
 *       export;</li>
 *   <li>{@code Packing} / {@code Dispatch} — {@code /packing/**} and
 *       {@code /dispatch/**}: create/edit/delete plus the page's own CSV export.
 *       Neither controller has an approval or a status transition, so neither
 *       switch is offered; neither page has its own print control either;</li>
 *   <li>{@code Documents} — the Production-scoped repository read only. The
 *       shared repository's writes and downloads stay governed by the existing
 *       {@code DOCUMENT_*} authorities so Sales and Purchase are untouched;</li>
 *   <li>{@code Production Settings} — create/edit/delete of machines, work
 *       centers and status masters plus the parameters save; Users &amp; Roles
 *       is existing master data edited in the same section, so it is covered by
 *       the same Edit switch and its data is untouched.</li>
 * </ul>
 */
public enum ProductionAccessArea {

    DASHBOARD("dashboard", "Production Dashboard", ProductionAccessAction.VIEW),

    ORDERS("orders", "Production Work Orders",
            ProductionAccessAction.VIEW, ProductionAccessAction.CREATE, ProductionAccessAction.EDIT,
            ProductionAccessAction.DELETE, ProductionAccessAction.SUBMIT, ProductionAccessAction.APPROVE,
            ProductionAccessAction.START, ProductionAccessAction.HOLD, ProductionAccessAction.COMPLETE,
            ProductionAccessAction.RELEASE, ProductionAccessAction.CANCEL, ProductionAccessAction.UPLOAD,
            ProductionAccessAction.PRINT),

    TECHNICAL_VERIFICATION("technicalVerification", "Technical Verification",
            ProductionAccessAction.VIEW, ProductionAccessAction.CREATE, ProductionAccessAction.DELETE,
            ProductionAccessAction.SUBMIT, ProductionAccessAction.APPROVE, ProductionAccessAction.PRINT),

    DRAWINGS("drawings", "Drawings",
            ProductionAccessAction.VIEW, ProductionAccessAction.CREATE, ProductionAccessAction.EDIT,
            ProductionAccessAction.DELETE, ProductionAccessAction.APPROVE,
            ProductionAccessAction.UPLOAD, ProductionAccessAction.DOWNLOAD,
            ProductionAccessAction.PRINT),

    MODELS("models", "Models",
            ProductionAccessAction.VIEW, ProductionAccessAction.CREATE, ProductionAccessAction.EDIT,
            ProductionAccessAction.DELETE, ProductionAccessAction.APPROVE,
            ProductionAccessAction.UPLOAD, ProductionAccessAction.CONVERT, ProductionAccessAction.PRINT),

    CASTING("casting", "Casting",
            ProductionAccessAction.VIEW, ProductionAccessAction.CREATE, ProductionAccessAction.EDIT,
            ProductionAccessAction.DELETE, ProductionAccessAction.START, ProductionAccessAction.HOLD,
            ProductionAccessAction.COMPLETE, ProductionAccessAction.SKIP, ProductionAccessAction.PRINT),

    FABRICATION("fabrication", "Fabrication",
            ProductionAccessAction.VIEW, ProductionAccessAction.CREATE, ProductionAccessAction.EDIT,
            ProductionAccessAction.DELETE, ProductionAccessAction.START, ProductionAccessAction.HOLD,
            ProductionAccessAction.COMPLETE, ProductionAccessAction.PRINT),

    MACHINE_SHOP("machineShop", "Machine Shop",
            ProductionAccessAction.VIEW, ProductionAccessAction.CREATE, ProductionAccessAction.EDIT,
            ProductionAccessAction.DELETE, ProductionAccessAction.START, ProductionAccessAction.HOLD,
            ProductionAccessAction.COMPLETE, ProductionAccessAction.PRINT),

    ASSEMBLY("assembly", "Assembly",
            ProductionAccessAction.VIEW, ProductionAccessAction.CREATE, ProductionAccessAction.EDIT,
            ProductionAccessAction.DELETE, ProductionAccessAction.START, ProductionAccessAction.HOLD,
            ProductionAccessAction.COMPLETE, ProductionAccessAction.PRINT),

    QUALITY("quality", "Quality",
            ProductionAccessAction.VIEW, ProductionAccessAction.CREATE, ProductionAccessAction.EDIT,
            ProductionAccessAction.DELETE, ProductionAccessAction.START, ProductionAccessAction.PASS,
            ProductionAccessAction.FAIL, ProductionAccessAction.HOLD,
            ProductionAccessAction.EXPORT, ProductionAccessAction.PRINT),

    PACKING("packing", "Packing",
            ProductionAccessAction.VIEW, ProductionAccessAction.CREATE, ProductionAccessAction.EDIT,
            ProductionAccessAction.DELETE, ProductionAccessAction.EXPORT, ProductionAccessAction.PRINT),

    DISPATCH("dispatch", "Dispatch",
            ProductionAccessAction.VIEW, ProductionAccessAction.CREATE, ProductionAccessAction.EDIT,
            ProductionAccessAction.DELETE, ProductionAccessAction.EXPORT, ProductionAccessAction.PRINT),

    ACKNOWLEDGEMENT("acknowledgement", "Acknowledgement",
            ProductionAccessAction.VIEW, ProductionAccessAction.CREATE, ProductionAccessAction.DELETE),

    ENTRY("entry", "Production Entry",
            ProductionAccessAction.VIEW, ProductionAccessAction.CREATE, ProductionAccessAction.DELETE),

    DOCUMENTS("documents", "Documents", ProductionAccessAction.VIEW),

    REPORTS("reports", "Reports",
            ProductionAccessAction.VIEW, ProductionAccessAction.EXPORT, ProductionAccessAction.PRINT),

    SETTINGS("settings", "Production Settings",
            ProductionAccessAction.VIEW, ProductionAccessAction.CREATE, ProductionAccessAction.EDIT,
            ProductionAccessAction.DELETE);

    private final String key;
    private final String label;
    private final Set<ProductionAccessAction> actions;

    ProductionAccessArea(String key, String label, ProductionAccessAction... actions) {
        this.key = key;
        this.label = label;
        this.actions = Collections.unmodifiableSet(EnumSet.of(actions[0], actions));
    }

    public String key() {
        return key;
    }

    public String label() {
        return label;
    }

    public Set<ProductionAccessAction> actions() {
        return actions;
    }

    public boolean supports(ProductionAccessAction action) {
        return actions.contains(action);
    }

    public static ProductionAccessArea fromKey(String key) {
        if (key == null) {
            return null;
        }
        for (ProductionAccessArea area : values()) {
            if (area.key.equalsIgnoreCase(key.trim())) {
                return area;
            }
        }
        return null;
    }
}
