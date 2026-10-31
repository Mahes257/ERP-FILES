package com.vishatech.erp.service;

import com.vishatech.erp.entity.DocumentVisibility;
import com.vishatech.erp.crm.entity.Customer;
import com.vishatech.erp.crm.entity.Lead;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * One-shot reconciliation tool that brings the central document repository in
 * line with every ERP module and every piece of data already on disk:
 *
 *  - normalizes the legacy module-grouping strings (CRM/Sales/Finance/Marketing/CPR)
 *    into canonical per-module strings, so per-module filtering and stats work;
 *  - registers every unregistered uploaded attachment (sales / marketing expense /
 *    questionnaire form attachments);
 *  - registers the CAD drawing/model files kept under uploads/drawings and
 *    uploads/models;
 *  - ensures every source record in every module has exactly one record-level
 *    document, creating the missing ones (metadata-only for records with no file);
 *  - cleans up duplicate record documents and orphaned metadata-only documents;
 *  - reports a final per-module matrix: Source / Docs / Missing / Duplicate /
 *    Orphan / Broken, plus on-disk files that no document references.
 *
 * The operation is idempotent and safe to re-run; record-document creation is
 * delegated to {@link DocumentRepositoryService#ensureRecordDocument} so nothing
 * is ever duplicated on later editorial runs.
 */
@Service
public class DocumentReconciliationService {

    private static final org.slf4j.Logger LOG =
            org.slf4j.LoggerFactory.getLogger(DocumentReconciliationService.class);

    private final JdbcTemplate jdbc;
    private final DocumentRepositoryService documentService;
    private final FileStorageService fileStorageService;

    public DocumentReconciliationService(JdbcTemplate jdbc,
                                         DocumentRepositoryService documentService,
                                         FileStorageService fileStorageService) {
        this.jdbc = jdbc;
        this.documentService = documentService;
        this.fileStorageService = fileStorageService;
    }

    /** Source-table config for record-document backfill and the final matrix. */
    record ModuleSpec(String module, String table, String rnSql, String custSql, String statusSql, boolean stringPk) {
        ModuleSpec(String module, String table, String rnSql, String custSql, String statusSql) {
            this(module, table, rnSql, custSql, statusSql, false);
        }

        boolean hasSource() {
            return table != null && !table.isBlank();
        }
    }

/** Module => SQL expressions that produce record number / customer / status. */
    private List<ModuleSpec> moduleSpecs() {
        List<ModuleSpec> specs = new ArrayList<>();
        specs.add(new ModuleSpec("Lead", "leads",
                "CONCAT('LEAD-',LPAD(id,6,'0'))",
                "COALESCE(NULLIF(company,''),NULLIF(business_name,''),NULLIF(name,''),'')",
                "COALESCE(NULLIF(status,''),'')"));
        specs.add(new ModuleSpec("Client", "customers",
                "COALESCE(NULLIF(client_code,''),CONCAT('CLIENT-',LPAD(id,6,'0')))",
                "COALESCE(NULLIF(business_name,''),'')",
                "COALESCE(NULLIF(status,''),'')"));
        specs.add(new ModuleSpec("Follow-up", "followups",
                "CONCAT('FOLLOW-',LPAD(id,6,'0'))",
                "COALESCE(NULLIF(company_name,''),NULLIF(lead_name,''),'')",
                "COALESCE(NULLIF(status,''),'')"));
        specs.add(new ModuleSpec("CPR", "cprs",
                "COALESCE(NULLIF(pr_no,''),CONCAT('CPR-',LPAD(id,6,'0')))",
                "COALESCE(NULLIF(company,''),NULLIF(client_name,''),'')",
                "COALESCE(NULLIF(status,''),approval_status)"));
        specs.add(new ModuleSpec("CPR Technical Verification", "cpr_technical_verifications",
                "COALESCE(NULLIF(tv_no,''),CONCAT('TV-',LPAD(id,6,'0')))",
                "''",
                "COALESCE(NULLIF(status,''),file_status)"));
        specs.add(new ModuleSpec("Cost Workout", "cost_workouts",
                "COALESCE(NULLIF(cw_no,''),CONCAT('CW-',LPAD(id,6,'0')))",
                "COALESCE(NULLIF(company,''),NULLIF(customer_name,''),'')",
                "COALESCE(NULLIF(status,''),'')"));
        specs.add(new ModuleSpec("Profit Workout", "profit_workouts",
                "COALESCE(NULLIF(pw_no,''),CONCAT('PW-',LPAD(id,6,'0')))",
                "COALESCE(NULLIF(company,''),NULLIF(customer_name,''),'')",
                "COALESCE(NULLIF(status,''),'')"));
        specs.add(new ModuleSpec("Quotation", "quotations",
                "COALESCE(NULLIF(quotation_no,''),CONCAT('QUO-',LPAD(id,6,'0')))",
                "COALESCE(NULLIF(client_name,''),'')",
                "COALESCE(NULLIF(status,''),'')"));
        specs.add(new ModuleSpec("Sales Contract", "sales_contracts",
                "COALESCE(NULLIF(sc_no,''),CONCAT('SC-',LPAD(id,6,'0')))",
                "COALESCE(NULLIF(client_name,''),'')",
                "COALESCE(NULLIF(status,''),'')"));
        specs.add(new ModuleSpec("Customer Purchase Order", "sales_orders",
                "COALESCE(NULLIF(so_no,''),CONCAT('CPO-',LPAD(id,6,'0')))",
                "COALESCE(NULLIF(client_name,''),'')",
                "COALESCE(NULLIF(status,''),'')"));
        specs.add(new ModuleSpec("Proforma Invoice", "proforma_invoices",
                "COALESCE(NULLIF(pi_no,''),NULLIF(invoice_no,''),CONCAT('PI-',LPAD(id,6,'0')))",
                "COALESCE(NULLIF(buyer_name,''),NULLIF(client_name,''),'')",
                "COALESCE(NULLIF(status,''),'')"));
        specs.add(new ModuleSpec("Delivery Challan", "delivery_challans",
                "COALESCE(NULLIF(dc_no,''),CONCAT('DC-',LPAD(id,6,'0')))",
                "COALESCE(NULLIF(client_name,''),'')",
                "COALESCE(NULLIF(status,''),'')"));
        specs.add(new ModuleSpec("Invoice", "invoices",
                "COALESCE(NULLIF(invoice_no,''),CONCAT('INV-',LPAD(id,6,'0')))",
                "COALESCE(NULLIF(client_name,''),'')",
                "COALESCE(NULLIF(status,''),payment_status)"));
        specs.add(new ModuleSpec("Credit Note", "credit_notes",
                "COALESCE(NULLIF(cn_no,''),CONCAT('CN-',LPAD(id,6,'0')))",
                "COALESCE(NULLIF(client_name,''),'')",
                "COALESCE(NULLIF(status,''),'')"));
        specs.add(new ModuleSpec("Payment Receipt", "payment_receipts",
                "COALESCE(NULLIF(receipt_no,''),CONCAT('PR-',LPAD(id,6,'0')))",
                "COALESCE(NULLIF(client_name,''),'')",
                "COALESCE(NULLIF(status,''),'')"));
        specs.add(new ModuleSpec("Marketing Visit", "marketing_visits",
                "COALESCE(NULLIF(visit_no,''),CONCAT('VISIT-',LPAD(id,6,'0')))",
                "COALESCE(NULLIF(customer_name,''),'')",
                "COALESCE(NULLIF(visit_status,''),NULLIF(followup_status,''),appointment_status)"));
        specs.add(new ModuleSpec("Marketing Expense", "marketing_expenses",
                "CONCAT('EXP-',LPAD(id,6,'0'))",
                "''",
                "COALESCE(NULLIF(bill_status,''),'')"));
        specs.add(new ModuleSpec("Marketing Travel Plan", "marketing_travel_plans",
                "CONCAT('TRV-',LPAD(id,6,'0'))",
                "''",
                "COALESCE(NULLIF(status,''),approval_status)"));
        specs.add(new ModuleSpec("Q Form", "questionnaire_forms",
                "CONCAT('QF-',LPAD(id,6,'0'))",
                "COALESCE(NULLIF(plant_name,''),'')",
                "COALESCE(NULLIF(status,''),'')"));
        specs.add(new ModuleSpec("Production Tracker", "production_trackers",
                "COALESCE(NULLIF(cpo_no,''),CONCAT('PTR-',LPAD(id,6,'0')))",
                "COALESCE(NULLIF(customer,''),'')",
                "COALESCE(NULLIF(current_status,''),'')"));
        specs.add(new ModuleSpec("QC", "quality_inspections",
                "COALESCE(NULLIF(inspection_id,''),id)",
                "COALESCE(NULLIF(customer,''),'')",
                "COALESCE(NULLIF(status,''),'')",
                true));
        specs.add(new ModuleSpec("Packing List", "packing_lists",
                "COALESCE(NULLIF(packing_list_number,''),CONCAT('PKG-',LPAD(id,6,'0')))",
                "COALESCE(NULLIF(customer,''),'')",
                "COALESCE(NULLIF(status,''),'')"));
        specs.add(new ModuleSpec("Dispatch", "dispatches",
                "COALESCE(NULLIF(dispatch_number,''),CONCAT('DISP-',LPAD(id,6,'0')))",
                "COALESCE(NULLIF(customer,''),'')",
                "COALESCE(NULLIF(status,''),packing_status)"));
        specs.add(new ModuleSpec("Production Order", "production_orders",
                "COALESCE(NULLIF(batch_number,''),CONCAT('PO-',LPAD(id,6,'0')))",
                "COALESCE(NULLIF(customer,''),'')",
                "COALESCE(NULLIF(status,''),'')"));
        specs.add(new ModuleSpec("Work Order", "technical_verifications",
                "COALESCE(NULLIF(work_order_number,''),CONCAT('WO-',LPAD(id,6,'0')))",
                "''",
                "COALESCE(NULLIF(verification_status,''),'')"));
        // Drawing / Model are handled as real CAD file documents where a file
        // exists; a metadata-only record document is only created for rows
        // without a physical file.
        specs.add(new ModuleSpec("Drawing", "drawings",
                "COALESCE(NULLIF(drawing_number,''),CONCAT('DRG-',LPAD(id,6,'0')))",
                "''",
                "COALESCE(NULLIF(verification_status,''),'')"));
        specs.add(new ModuleSpec("Model", "models",
                "COALESCE(NULLIF(model_number,''),CONCAT('MDL-',LPAD(id,6,'0')))",
                "''",
                "COALESCE(NULLIF(conversion_status,''),'')"));
        return specs;
    }

    private final Map<String, String> moduleTypeToModule() {
        Map<String, String> map = new LinkedHashMap<>();
        map.put("quotation", "Quotation");
        map.put("sales-order", "Customer Purchase Order");
        map.put("sales-contract", "Sales Contract");
        map.put("proforma-invoice", "Proforma Invoice");
        map.put("delivery-challan", "Delivery Challan");
        map.put("invoice", "Invoice");
        map.put("credit-note", "Credit Note");
        map.put("payment-receipt", "Payment Receipt");
        map.put("marketing_location", "Marketing Map");
        map.put("production_order", "Production Order");
        map.put("drawing", "Drawing");
        map.put("model", "Model");
        map.put("quality_inspection", "QC");
        map.put("packing", "Packing List");
        map.put("dispatch", "Dispatch");
        return map;
    }

    /** Legacy (module, document_type) => canonical (module, document_type). */
    private List<String[]> legacyMappings() {
        List<String[]> m = new ArrayList<>();
        m.add(new String[]{"CRM", "Lead", "Lead", "Lead"});
        m.add(new String[]{"CRM", "Client", "Client", "Client"});
        m.add(new String[]{"CRM", "Follow-up", "Follow-up", "Follow-up"});
        m.add(new String[]{"Sales", "Quotation", "Quotation", "Quotation"});
        m.add(new String[]{"Sales", "Sales Contract", "Sales Contract", "Sales Contract"});
        m.add(new String[]{"Sales", "Customer Purchase Order", "Customer Purchase Order", "Customer Purchase Order"});
        m.add(new String[]{"Finance", "Invoice", "Invoice", "Invoice"});
        m.add(new String[]{"Finance", "Credit Note", "Credit Note", "Credit Note"});
        m.add(new String[]{"Finance", "Payment Receipt", "Payment Receipt", "Payment Receipt"});
        m.add(new String[]{"CPR", "CPR", "CPR", "CPR"});
        m.add(new String[]{"CPR", "Cost Workout", "Cost Workout", "Cost Workout"});
        m.add(new String[]{"CPR", "Profit Workout", "Profit Workout", "Profit Workout"});
        m.add(new String[]{"CPR", "Technical Verification", "CPR Technical Verification", "CPR Technical Verification"});
        m.add(new String[]{"Marketing", "Marketing Visit", "Marketing Visit", "Marketing Visit"});
        m.add(new String[]{"Marketing", "Q Form", "Q Form", "Q Form"});
        m.add(new String[]{"Marketing", "Marketing Expense", "Marketing Expense", "Marketing Expense"});
        m.add(new String[]{"Marketing", "Travel Planner", "Marketing Travel Plan", "Marketing Travel Plan"});
        return m;
    }

    // ==================================================================
    // Public entry point
    // ==================================================================

    @Transactional
    public Map<String, Object> reconcile() {
        Map<String, Object> report = new LinkedHashMap<>();

        int normalized = normalizeModules();
        int strayMapped = mapStrayDocumentWorkflow();
        int deduped = dedupeRecordDocuments();
        int cadRegistered = registerCadFiles();
        int attachments = registerUnregisteredAttachments();
        int recordDocs = backfillRecordDocuments();
        int orphansPurged = purgeOrphans();
        int ghostsPurged = purgeUnlinkedGhostDocuments();
        int documentsRefreshed = refreshRecordDocuments();
        int remainingStray = countStrayDocumentWorkflow();

        report.put("matricesNormalized", normalized);
        report.put("strayDocumentWorkflowMapped", strayMapped);
        report.put("duplicateRecordDocumentsRemoved", deduped);
        report.put("cadFilesRegistered", cadRegistered);
        report.put("attachmentsRegistered", attachments);
        report.put("recordDocumentsEnsured", recordDocs);
        report.put("orphanRecordDocumentsPurged", orphansPurged);
        report.put("unlinkedDiskFilesRegistered", 0);
        report.put("unlinkedGhostDocumentsPurged", ghostsPurged);
        report.put("recordDocumentsRefreshed", documentsRefreshed);
        report.put("unmappableDocumentWorkflowRows", remainingStray);
        report.put("matrix", buildMatrix());
        report.put("unlinkedFilesOnDisk", unlinkedRootFiles().size());
        return report;
    }

    // ==================================================================
    // Step 1 — normalize legacy module strings to canonical per-module values
    // ==================================================================

    private int normalizeModules() {
        int total = 0;
        for (String[] m : legacyMappings()) {
            Integer legacy = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM document_repository WHERE module = ? AND document_type = ?",
                    Integer.class, m[0], m[1]);
            if (legacy != null && legacy > 0 && (!m[0].equals(m[2]) || !m[1].equals(m[3]))) {
                jdbc.update("UPDATE document_repository SET module = ?, document_type = ? WHERE module = ? AND document_type = ?",
                        m[2], m[3], m[0], m[1]);
                total += legacy;
            }
        }
        // Stray casing variants from an older Document Workflow integration.
        int strayTotal = 0;
        for (String[] s : new String[][]{
                {"salesOrder", "Customer Purchase Order"},
                {"sales-order", "Customer Purchase Order"},
                {"salesContract", "Sales Contract"}}) {
            Integer legacy = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM document_repository WHERE module = ? AND document_type = 'Document Workflow'",
                    Integer.class, s[0]);
            if (legacy != null && legacy > 0) {
                jdbc.update("UPDATE document_repository SET module = ?, document_type = ? " +
                                "WHERE module = ? AND document_type = 'Document Workflow'",
                        s[1], s[1], s[0]);
                strayTotal += legacy;
            }
        }
        total += strayTotal;
        return total;
    }

    /** For Document Workflow rows pointing at nonexistent records, try to salvage them. */
    private int mapStrayDocumentWorkflow() {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, module, related_record_id FROM document_repository WHERE document_type = 'Document Workflow'");
        int mapped = 0;
        for (Map<String, Object> row : rows) {
            Long id = longOf(row.get("id"));
            Long rec = longOf(row.get("related_record_id"));
            if (rec == null) {
                continue;
            }
            Integer so = jdbc.queryForObject("SELECT COUNT(*) FROM sales_orders WHERE id = ?", Integer.class, rec);
            if (so != null && so > 0) {
                jdbc.update("UPDATE document_repository SET module = 'Customer Purchase Order', document_type = 'Customer Purchase Order' WHERE id = ?", id);
                mapped++;
                continue;
            }
            Integer sc = jdbc.queryForObject("SELECT COUNT(*) FROM sales_contracts WHERE id = ?", Integer.class, rec);
            if (sc != null && sc > 0) {
                jdbc.update("UPDATE document_repository SET module = 'Sales Contract', document_type = 'Sales Contract' WHERE id = ?", id);
                mapped++;
            }
        }
        return mapped;
    }

    private int countStrayDocumentWorkflow() {
        return jdbc.queryForObject(
                "SELECT COUNT(*) FROM document_repository WHERE document_type = 'Document Workflow'", Integer.class);
    }

    // ==================================================================
    // Step 2 — drop duplicate metadata-only record documents
    // ==================================================================

    private int dedupeRecordDocuments() {
        List<Map<String, Object>> groups = jdbc.queryForList(
                "SELECT module, related_record_id, COUNT(*) c FROM document_repository " +
                "WHERE related_record_id IS NOT NULL AND (file_path IS NULL OR file_path = 'metadata-only') " +
                "GROUP BY module, related_record_id HAVING c > 1");
        int removed = 0;
        for (Map<String, Object> group : groups) {
            String module = (String) group.get("module");
            Long rec = longOf(group.get("related_record_id"));
            List<Long> ids = jdbc.queryForList(
                    "SELECT id FROM document_repository WHERE module = ? AND related_record_id = ? " +
                    "AND (file_path IS NULL OR file_path = 'metadata-only') ORDER BY id",
                    Long.class, module, rec);
            for (int i = 1; i < ids.size(); i++) {
                documentService.purgeDocument(ids.get(i));
                removed++;
            }
        }

        // Record documents that already carry a generated file. Two entries
        // whose type is the module itself are the same logical record document
        // for one source record — keep the oldest (the one the sync maintains)
        // and drop the strays. Attachment documents keep their own type and are
        // therefore never touched by this rule.
        List<Map<String, Object>> typedGroups = jdbc.queryForList(
                "SELECT module, related_record_id, COUNT(*) c FROM document_repository " +
                "WHERE related_record_id IS NOT NULL AND document_type = module " +
                "GROUP BY module, related_record_id HAVING c > 1");
        for (Map<String, Object> group : typedGroups) {
            String module = (String) group.get("module");
            Long rec = longOf(group.get("related_record_id"));
            List<Long> ids = jdbc.queryForList(
                    "SELECT id FROM document_repository WHERE module = ? AND related_record_id = ? " +
                    "AND document_type = module ORDER BY id",
                    Long.class, module, rec);
            for (int i = 1; i < ids.size(); i++) {
                documentService.purgeDocument(ids.get(i));
                removed++;
            }
        }

        if (removed > 0) {
            LOG.info("Document reconciliation removed {} duplicate record documents", removed);
        }
        return removed;
    }

    // ==================================================================
    // Step 3 — register CAD drawing/model files
    // ==================================================================

    private int registerCadFiles() {
        int registered = 0;
        registered += registerCadFor("drawings", "Drawing", "drawing_number",
                "file_path", "file_name", "drawings");
        registered += registerCadFor("models", "Model", "model_number",
                "file_path", "file_name", "models");
        return registered;
    }

    private int registerCadFor(String table, String module, String numCol,
                               String pathCol, String nameCol, String subdir) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, " + numCol + " AS num, " + pathCol + " AS path, " + nameCol + " AS fname FROM " + table);
        int registered = 0;
        for (Map<String, Object> row : rows) {
            Long id = longOf(row.get("id"));
            String num = row.get("num") != null ? row.get("num").toString() : null;
            String path = row.get("path") != null ? row.get("path").toString() : null;
            String fname = row.get("fname") != null && !row.get("fname").toString().isBlank()
                    ? row.get("fname").toString() : (num != null ? num : module + " #" + id);
            if (path == null || path.isBlank()) {
                continue;
            }
            String basename = basename(path);
            if (basename == null || !fileStorageService.existsOnDisk(basename, subdir)) {
                continue;
            }
            boolean already = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM document_repository WHERE module = ? AND related_record_id = ? AND file_path = ?",
                    Integer.class, module, id, subdir + "/" + basename) > 0;
            if (already) {
                continue;
            }
            long size = fileStorageService.storedSize(basename, subdir);
            documentService.registerGenerated(fname, inferDocType(basename), module, id,
                    num != null ? num : null, null, null,
                    subdir + "/" + basename, mimeType(basename), size, DocumentVisibility.TEAM_ONLY);
            registered++;
        }
        return registered;
    }

    // ==================================================================
    // Step 4 — register uploaded attachments that are not yet in Documents
    // ==================================================================

    private int registerUnregisteredAttachments() {
        int registered = 0;
        registered += registerAttachmentTable(
                "SELECT id, module_type, module_id, name, stored_name, content_type, size FROM sales_attachments",
                (r, moduleId, name, stored, ctype, size) -> {
                    String module = moduleTypeToModule().getOrDefault(
                            r.get("module_type") == null ? "" : r.get("module_type").toString().toLowerCase(Locale.ROOT), "General");
                    return new Attach(module, moduleId);
                });
        registered += registerAttachmentTable(
                "SELECT id, name, stored_name, content_type, size, expense_id, trip_id FROM marketing_expense_attachments",
                (r, moduleId, name, stored, ctype, size) ->
                        new Attach("Marketing Expense", moduleId));
        registered += registerAttachmentTable(
                "SELECT id, name, stored_name, content_type, size, form_id, label FROM qform_attachments",
                (r, moduleId, name, stored, ctype, size) ->
                        new Attach("Q Form", moduleId));
        return registered;
    }

    @FunctionalInterface
    private interface AttachResolver {
        Attach resolve(Map<String, Object> row, Long moduleId, String name, String stored,
                       String contentType, Long size);
    }

    private record Attach(String module, Long relatedRecordId) {}

    private int registerAttachmentTable(String sql, AttachResolver resolver) {
        List<Map<String, Object>> rows;
        try {
            rows = jdbc.queryForList(sql);
        } catch (Exception e) {
            LOG.warn("Attachment table scan skipped ({}): {}", sql, e.getMessage());
            return 0;
        }
        int registered = 0;
        for (Map<String, Object> row : rows) {
            Long moduleId = longOf(row.get("module_id")) != null ? longOf(row.get("module_id"))
                    : longOf(row.get("expense_id")) != null ? longOf(row.get("expense_id"))
                    : longOf(row.get("form_id")) != null ? longOf(row.get("form_id"))
                    : longOf(row.get("trip_id")) != null ? longOf(row.get("trip_id")) : null;
            if (row.get("stored_name") == null || row.get("stored_name").toString().isBlank() || moduleId == null) {
                continue;
            }
            String stored = row.get("stored_name").toString();
            String name = row.get("name") != null ? row.get("name").toString() : stored;
            String ctype = row.get("content_type") != null ? row.get("content_type").toString() : null;
            Long size = longOf(row.get("size")) != null ? longOf(row.get("size")) : 0L;
            Attach attach = resolver.resolve(row, moduleId, name, stored, ctype, size);
            if (attach == null || !fileStorageService.existsOnDisk(stored)) {
                continue;
            }
            boolean already = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM document_repository WHERE file_path = ?", Integer.class, stored) > 0;
            if (already) {
                continue;
            }
            documentService.registerFromAttachment(name, attach.module(), attach.relatedRecordId(),
                    null, null, null, stored,
                    ctype != null ? ctype : mimeType(stored),
                    size, null, DocumentVisibility.TEAM_ONLY);
            registered++;
        }
        return registered;
    }

    // ==================================================================
    // Step 5 — ensure a record document for every source record
    // ==================================================================

    /**
     * Create the missing record-level document for every source record.
     *
     * <p>Sales-area modules are skipped: a reconciliation run must not
     * re-populate the Sales Documents repository with mirror entries for
     * existing CRM/Sales business records — that repository is filled by
     * explicit upload or selection instead (see
     * {@link DocumentModuleScope#allowsAutomaticRecordDocuments}). Every other
     * area keeps its record-document backfill.
     */
    private int backfillRecordDocuments() {
        int total = 0;
        int skippedSales = 0;
        for (ModuleSpec spec : moduleSpecs()) {
            if (!DocumentModuleScope.allowsAutomaticRecordDocuments(spec.module())) {
                skippedSales++;
                continue;
            }
            total += backfillOne(spec);
        }
        if (skippedSales > 0) {
            LOG.info("Record-document backfill skipped {} Sales-area module(s) — the Sales "
                    + "repository is filled by explicit upload/selection", skippedSales);
        }
        return total;
    }

    private int backfillOne(ModuleSpec spec) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, " + spec.rnSql() + " AS rn, " + spec.custSql() + " AS cname, " + spec.statusSql() + " AS st FROM " + spec.table());
        int created = 0;
        for (Map<String, Object> row : rows) {
            Long id = DocumentRepositoryService.numericRecordId(row.get("id"));
            if (id == null) {
                continue;
            }
            boolean hasAnyDoc = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM document_repository WHERE module = ? AND related_record_id = ?",
                    Integer.class, spec.module(), id) > 0;
            if (hasAnyDoc) {
                continue;
            }
            String rn = row.get("rn") != null ? row.get("rn").toString().trim() : null;
            String name = spec.module() + " — " + safeValue(row.get("cname"), rn, String.valueOf(id));
            String status = row.get("st") != null && !row.get("st").toString().isBlank()
                    ? row.get("st").toString() : null;
            documentService.ensureRecordDocument(spec.module(), id, name, spec.module(), rn, null,
                    blankToNull(row.get("cname")), status);
            created++;
        }
        return created;
    }

    // ==================================================================
    // Step 6 — purge orphaned metadata-only record documents
    // ==================================================================

    private int purgeOrphans() {
        int purged = 0;
        for (ModuleSpec spec : moduleSpecs()) {
            if (!spec.hasSource()) {
                continue;
            }
            if (spec.stringPk()) {
                java.util.Set<Long> sourceIds = new java.util.HashSet<>();
                for (String raw : jdbc.queryForList("SELECT id FROM " + spec.table(), String.class)) {
                    Long v = DocumentRepositoryService.numericRecordId(raw);
                    if (v != null) {
                        sourceIds.add(v);
                    }
                }
                List<Long> linkIds = jdbc.queryForList(
                        "SELECT id FROM document_repository WHERE module = ? " +
                        "AND (file_path IS NULL OR file_path = 'metadata-only') AND related_record_id IS NOT NULL",
                        Long.class, spec.module());
                for (Long docId : linkIds) {
                    Long rec = jdbc.queryForObject(
                            "SELECT related_record_id FROM document_repository WHERE id = ?", Long.class, docId);
                    if (rec == null || !sourceIds.contains(rec)) {
                        documentService.purgeDocument(docId);
                        purged++;
                    }
                }
                continue;
            }
            List<Long> ids = jdbc.queryForList(
                    "SELECT d.id FROM document_repository d WHERE d.module = ? " +
                    "AND (d.file_path IS NULL OR d.file_path = 'metadata-only') " +
                    "AND d.related_record_id IS NOT NULL " +
                    "AND NOT EXISTS (SELECT 1 FROM " + spec.table() + " s WHERE s.id = d.related_record_id)",
                    Long.class, spec.module());
            for (Long id : ids) {
                documentService.purgeDocument(id);
                purged++;
            }
        }
        // Stray Document Workflow rows that could not be attributed to a record.
        List<Long> stray = jdbc.queryForList(
                "SELECT id FROM document_repository WHERE document_type = 'Document Workflow'", Long.class);
        for (Long id : stray) {
            documentService.purgeDocument(id);
            purged++;
        }
        return purged;
    }

    // ==================================================================
    // Step 8 — re-render records whose stored document is behind the template
    // ==================================================================

    /** Upper bound on documents re-rendered per reconcile run (keeps it responsive). */
    private static final int MAX_DOCUMENT_REFRESH_PER_RUN = 400;

    /**
     * Re-render every record document that no longer matches the document
     * template, so existing repository entries enclose the complete record
     * exactly like newly created ones.
     *
     * The refresh is content-fingerprinted: a document whose template output is
     * unchanged is left completely alone (no new version, no audit noise), so
     * this step is safe to run repeatedly and picks up where the cap left off.
     */
    private int refreshRecordDocuments() {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT module, related_record_id FROM document_repository " +
                "WHERE related_record_id IS NOT NULL AND status <> 'deleted' " +
                "GROUP BY module, related_record_id");
        int refreshed = 0;
        for (Map<String, Object> row : rows) {
            if (refreshed >= MAX_DOCUMENT_REFRESH_PER_RUN) {
                break;
            }
            String module = (String) row.get("module");
            Long recordId = longOf(row.get("related_record_id"));
            if (module == null || recordId == null) {
                continue;
            }
            // Sales-area documents are never re-rendered automatically: they are
            // the documents the operator uploaded (see
            // DocumentModuleScope.allowsAutomaticRecordDocuments).
            if (!DocumentModuleScope.allowsAutomaticRecordDocuments(module)) {
                continue;
            }
            if (documentService.refreshGeneratedFileQuietly(module, recordId)) {
                refreshed++;
            }
        }
        if (refreshed > 0) {
            LOG.info("Document reconciliation re-rendered {} documents onto the current template", refreshed);
        }
        return refreshed;
    }

    // ==================================================================
    // Step 7 — register stored files that no document references
    // ==================================================================

    /**
     * Remove the source-less ghost documents an earlier reconciliation pass
     * created for stray files sitting in the upload root.
     *
     * Those rows carry only a random server file name under the generic
     * "General" module, with no source record, record number, customer or
     * uploader — they are not real business documents, and they are what made
     * the Documents page list entries such as {@code <uuid>.pdf} with a blank
     * record number and no customer.
     *
     * The physical file is deliberately left in place, so nothing is
     * destroyed: only the meaningless metadata row is removed, and the file
     * continues to be reported by {@code unlinkedFilesOnDisk} for review.
     * Root files are no longer auto-registered at all — a file with no
     * provenance must not become a document.
     */
    private int purgeUnlinkedGhostDocuments() {
        List<Long> ghosts = jdbc.queryForList(
                "SELECT id FROM document_repository WHERE module = 'General' " +
                "AND related_record_id IS NULL AND record_number IS NULL " +
                "AND customer_id IS NULL AND customer_name IS NULL " +
                "AND uploaded_by IS NULL",
                Long.class);
        int purged = 0;
        for (Long id : ghosts) {
            documentService.purgeDocument(id);
            purged++;
        }
        if (purged > 0) {
            LOG.info("Document reconciliation removed {} source-less ghost documents", purged);
        }
        return purged;
    }

    // ==================================================================
    // Report
    // ==================================================================

    private List<Map<String, Object>> buildMatrix() {
        List<Map<String, Object>> matrix = new ArrayList<>();
        for (ModuleSpec spec : moduleSpecs()) {
            Map<String, Object> row = new LinkedHashMap<>();
            Integer source = jdbc.queryForObject("SELECT COUNT(*) FROM " + spec.table(), Integer.class);
            Integer docs = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM document_repository WHERE module = ?", Integer.class, spec.module());
            Integer duplicates = jdbc.queryForObject(
                    "SELECT COALESCE(SUM(c - 1), 0) FROM (" +
                    "SELECT COUNT(*) c FROM document_repository WHERE module = ? AND related_record_id IS NOT NULL " +
                    "AND (file_path IS NULL OR file_path = 'metadata-only') GROUP BY related_record_id HAVING c > 1) t",
                    Integer.class, spec.module());
            int broken = countBroken(spec.module());
            Integer missing;
            Integer orphans;
            if (spec.stringPk()) {
                java.util.Set<Long> sourceIds = new java.util.HashSet<>();
                for (String raw : jdbc.queryForList("SELECT id FROM " + spec.table(), String.class)) {
                    Long v = DocumentRepositoryService.numericRecordId(raw);
                    if (v != null) {
                        sourceIds.add(v);
                    }
                }
                List<Long> docRecs = jdbc.queryForList(
                        "SELECT related_record_id FROM document_repository WHERE module = ? AND related_record_id IS NOT NULL",
                        Long.class, spec.module());
                java.util.Set<Long> docRecSet = new java.util.HashSet<>(docRecs);
                long miss = sourceIds.stream().filter(r -> !docRecSet.contains(r)).count();
                long orph = docRecs.stream().filter(r -> !sourceIds.contains(r)).count();
                missing = (int) miss;
                orphans = (int) orph;
            } else {
                missing = jdbc.queryForObject(
                        "SELECT COUNT(*) FROM " + spec.table() + " s WHERE NOT EXISTS (" +
                        "SELECT 1 FROM document_repository d WHERE d.module = ? AND d.related_record_id = s.id)",
                        Integer.class, spec.module());
                orphans = jdbc.queryForObject(
                        "SELECT COUNT(*) FROM document_repository d WHERE d.module = ? " +
                        "AND (d.file_path IS NULL OR d.file_path = 'metadata-only') " +
                        "AND d.related_record_id IS NOT NULL " +
                        "AND NOT EXISTS (SELECT 1 FROM " + spec.table() + " s WHERE s.id = d.related_record_id)",
                        Integer.class, spec.module());
            }
            row.put("module", spec.module());
            row.put("source", source == null ? 0 : source);
            row.put("docs", docs == null ? 0 : docs);
            row.put("missing", missing == null ? 0 : missing);
            row.put("duplicate", duplicates == null ? 0 : duplicates);
            row.put("orphan", orphans == null ? 0 : orphans);
            row.put("broken", broken);
            matrix.add(row);
        }
        return matrix;
    }

    private int countBroken(String module) {
        List<String> paths = jdbc.queryForList(
                "SELECT file_path FROM document_repository WHERE module = ? AND file_path IS NOT NULL " +
                "AND file_path <> 'metadata-only'",
                String.class, module);
        int broken = 0;
        for (String path : paths) {
            String base = basename(path);
            if (base == null) {
                broken++;
                continue;
            }
            String lower = path.toLowerCase();
            String[] subdirs = lower.contains("models") ? new String[]{"models"}
                    : lower.contains("drawings") ? new String[]{"drawings"} : new String[0];
            if (!fileStorageService.existsOnDisk(base, subdirs)) {
                broken++;
            }
        }
        return broken;
    }

    private List<String> unlinkedRootFiles() {
        List<String> referenced = jdbc.queryForList(
                "SELECT file_path FROM document_repository WHERE file_path IS NOT NULL AND file_path <> 'metadata-only'",
                String.class);
        List<String> unlinked = new ArrayList<>();
        for (String file : fileStorageService.listRootFiles()) {
            boolean linked = referenced.stream().anyMatch(p -> file.equals(basename(p)));
            if (!linked) {
                unlinked.add(file);
            }
        }
        return unlinked;
    }

    // ==================================================================
    // Small helpers
    // ==================================================================

    /** Tolerant bigint reader: JDBC may return BIGINT as Long or String. */
    private static Long longOf(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number n) {
            return n.longValue();
        }
        try {
            String s = value.toString().trim();
            return s.isEmpty() ? null : Long.parseLong(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String basename(String path) {
        if (path == null || path.isBlank()) {
            return null;
        }
        String[] segments = path.split("[/\\\\]");
        String last = segments[segments.length - 1].trim();
        return last.isEmpty() ? null : last;
    }

    private String blankToNull(Object value) {
        if (value == null) {
            return null;
        }
        String s = value.toString().trim();
        return s.isEmpty() ? null : s;
    }

    private String safeValue(Object primary, String fallback, String finalFallback) {
        String p = blankToNull(primary);
        if (p != null) {
            return p;
        }
        return fallback != null && !fallback.isBlank() ? fallback : finalFallback;
    }

    private String inferDocType(String filename) {
        if (filename == null) {
            return "document";
        }
        String lower = filename.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".pdf")) return "pdf";
        if (lower.endsWith(".step") || lower.endsWith(".stp")) return "step";
        if (lower.endsWith(".sldprt")) return "sldprt";
        if (lower.endsWith(".stl")) return "stl";
        if (lower.endsWith(".obj")) return "obj";
        if (lower.endsWith(".glb")) return "glb";
        if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image";
        if (lower.endsWith(".doc") || lower.endsWith(".docx")) return "word";
        return "document";
    }

    private String mimeType(String filename) {
        if (filename == null) {
            return "application/octet-stream";
        }
        String lower = filename.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".pdf")) return "application/pdf";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".step") || lower.endsWith(".stp")) return "application/octet-stream";
        if (lower.endsWith(".sldprt")) return "application/octet-stream";
        if (lower.endsWith(".stl")) return "application/octet-stream";
        if (lower.endsWith(".obj")) return "application/octet-stream";
        if (lower.endsWith(".glb")) return "model/gltf-binary";
        if (lower.endsWith(".txt")) return "text/plain";
        if (lower.endsWith(".doc")) return "application/msword";
        if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        return "application/octet-stream";
    }
}