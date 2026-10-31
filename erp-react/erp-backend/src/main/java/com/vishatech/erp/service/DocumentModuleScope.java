package com.vishatech.erp.service;

import com.vishatech.erp.exception.BadRequestException;
import java.util.List;
import java.util.Locale;

/**
 * Named module scopes for the document repository.
 *
 * <p>The repository is shared by every ERP area (CRM, Sales Execution, CPR,
 * Purchase, Production, Marketing, …) and each area's documents are told apart
 * by the {@code module} column of {@code document_repository} — the same column
 * the reconciliation service uses to attribute a row to its source record. The
 * Sales module's Documents page shows only the rows the Sales side owns, so the
 * filter is applied here and pushed into SQL instead of being hidden in the
 * browser.
 *
 * <p>The Sales scope is the set of module <em>spellings</em> the Sales-side
 * flows actually write, lower-cased. Provenance of each group:
 *
 * <ul>
 *   <li><b>canonical</b> — {@code DocumentReconciliationService.moduleSpecs()}
 *       and the record-document calls of the Sales services
 *       ({@code ensureRecordDocument}/{@code registerGenerated}).</li>
 *   <li><b>plural</b> — the CRM attachment-upload endpoints
 *       ({@code LeadService}, {@code CustomerService}, {@code FollowUpService})
 *       register attachments under "Leads"/"Clients"/"Follow-ups".</li>
 *   <li><b>camel-case / kebab record keys</b> — the frontend Sales record keys
 *       used by the Document Workflow and Sales Design flows when they POST
 *       {@code /documents}, plus the stray spellings
 *       {@code DocumentReconciliationService} already lists explicitly.</li>
 *   <li><b>legacy areas</b> — the pre-migration module values
 *       {@code DocumentReconciliationService.legacyMappings()} rewrites to the
 *       canonical modules above (CRM/Sales/Finance are all Sales-side in this
 *       ERP; Purchase and Production register their own module names).</li>
 * </ul>
 */
public final class DocumentModuleScope {

    /** Request value selecting the Sales dataset (CRM + Sales Execution + CPR). */
    public static final String SALES = "sales";

    /** Request value that explicitly asks for the unscoped repository. */
    public static final String ALL = "all";

    /**
     * Lower-cased module spellings owned by the Sales side of the ERP.
     * Compared with {@code LOWER(d.module) IN (...)} so MySQL and H2 agree.
     */
    private static final List<String> SALES_MODULES = List.of(
            // CRM
            "lead", "leads",
            "client", "clients",
            "customer", "customers",
            "follow-up", "follow-ups", "followup", "followups",
            // Sales Execution
            "quotation",
            "sales contract", "salescontract",
            "sales order", "salesorder", "sales-order",
            "customer purchase order", "customerpurchaseorder",
            "proforma invoice", "proformainvoice",
            "delivery challan", "deliverychallan",
            "invoice",
            "credit note", "creditnote",
            "payment receipt", "paymentreceipt",
            // CPR
            "cpr", "cpr technical verification", "cprtechnicalverification",
            "cost workout", "costworkout",
            "profit workout", "profitworkout",
            // legacy module values the reconciler rewrites to the above
            "crm", "sales", "finance");

    /**
     * Lower-cased module spellings owned by the Production area.
     *
     * <p>They are the canonical names of
     * {@code DocumentReconciliationService.moduleSpecs()} for the production
     * tables ({@code production_orders}, {@code technical_verifications},
     * {@code quality_inspections}, {@code packing_lists}, {@code dispatches},
     * {@code production_trackers}, {@code drawings}, {@code models}) plus the
     * record keys the Production flows write, so a row is recognised whatever
     * spelling it arrived under.
     */
    private static final List<String> PRODUCTION_MODULES = List.of(
            "production order", "productionorder",
            "work order", "workorder",
            "technical verification", "technicalverification",
            "production tracker", "productiontracker",
            "qc", "quality inspection", "qualityinspection",
            "packing list", "packinglist",
            "dispatch",
            "drawing",
            "model");

    private DocumentModuleScope() {
    }

    /**
     * Resolve a request {@code scope} value into the module spellings it covers.
     *
     * @return the module spellings to filter by, or an empty list when the
     *         caller asked for no restriction (absent/blank/{@value #ALL})
     * @throws BadRequestException for an unknown scope value — a typo must not
     *                             silently widen the result set
     */
    public static List<String> modulesFor(String scope) {
        if (scope == null || scope.isBlank()) {
            return List.of();
        }
        String key = scope.trim().toLowerCase(Locale.ROOT);
        if (SALES.equals(key) || ALL.equals(key)) {
            return SALES.equals(key) ? SALES_MODULES : List.of();
        }
        throw new BadRequestException("Unknown document scope: " + scope);
    }

    /** The module spellings the {@value #SALES} scope covers, for tests. */
    public static List<String> salesModules() {
        return SALES_MODULES;
    }

    /**
     * True when a module spelling belongs to the Sales area's document set
     * (CRM + Sales Execution + CPR + workouts). Compared the same way the scope
     * filter is ({@code LOWER(module) IN (...)}), so a legacy spelling such as
     * {@code CRM} or {@code salesContract} is recognised too.
     */
    public static boolean isSalesModule(String module) {
        if (module == null || module.isBlank()) {
            return false;
        }
        return SALES_MODULES.contains(module.trim().toLowerCase(Locale.ROOT));
    }

    /**
     * True when a module spelling belongs to the Production area's document set
     * (work orders, technical verification, QC, packing, dispatch, drawings,
     * models, the production tracker). Compared the same way the scope filter is
     * ({@code LOWER(module) IN (...)}), so a spelling variant is recognised too.
     */
    public static boolean isProductionModule(String module) {
        if (module == null || module.isBlank()) {
            return false;
        }
        return PRODUCTION_MODULES.contains(module.trim().toLowerCase(Locale.ROOT));
    }

    /** The module spellings the Production area owns, for tests. */
    public static List<String> productionModules() {
        return PRODUCTION_MODULES;
    }

    /**
     * Whether AUTOMATIC record-document mirrors may still be created for a
     * module.
     *
     * <p>The Sales Documents repository holds documents that were explicitly
     * uploaded or selected (or produced by a module's own document workflow) —
     * not one auto-generated repository entry per CRM/Sales business record.
     * Sales-area modules are therefore excluded from every automatic mirror
     * path: the record-save sync
     * ({@code DocumentRepositoryService.syncRecordDocumentQuietly}), the
     * reconciliation run's record-document backfill/re-render and the backfill
     * endpoint.
     *
     * <p>Production follows the same rule for the same reason: its Documents
     * folders must list the files someone actually uploaded as an attachment,
     * not a placeholder per production order, work order, QC sheet, packing list
     * or dispatch. Those placeholders carried no file at all
     * ({@code filePath = "metadata-only"}), so they appeared in Documents with
     * nothing to preview or download. A Production file reaches the repository
     * through the attachment upload itself
     * ({@code ProductionDocumentArchive}), which is unaffected by this guard.
     *
     * <p>Every other ERP area (Purchase, Marketing, …) keeps its existing
     * repository synchronization unchanged.
     */
    public static boolean allowsAutomaticRecordDocuments(String module) {
        return !isSalesModule(module) && !isProductionModule(module);
    }
}
