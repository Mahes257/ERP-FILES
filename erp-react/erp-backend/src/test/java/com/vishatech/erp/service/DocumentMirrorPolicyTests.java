package com.vishatech.erp.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.vishatech.erp.repository.DocumentRepositoryEntryRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.crm.entity.Customer;
import com.vishatech.erp.crm.entity.Lead;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Sales document mirrors are no longer created automatically.
 *
 * <p>The Sales Documents repository holds the documents an operator explicitly
 * uploaded or selected (or produced through a module's own document workflow) —
 * not one auto-generated repository entry per CRM/Sales business record. These
 * tests pin the policy where it is decided and prove the two halves of it:
 * Sales-area modules get no automatic mirror, and every other area keeps its
 * record-document synchronization exactly as before.
 */
@SpringBootTest
class DocumentMirrorPolicyTests extends AbstractSecurityTest {

    @Autowired
    private DocumentRepositoryService documents;

    @Autowired
    private DocumentBackfillService backfillService;

    @Autowired
    private DocumentRepositoryEntryRepository repository;

    @Autowired
    private JdbcTemplate jdbc;

    /** Rows currently in the repository that belong to the Sales area. */
    private long salesRows() {
        List<String> modules = DocumentModuleScope.salesModules();
        String placeholders = modules.stream().map(m -> "?").collect(Collectors.joining(","));
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM document_repository WHERE LOWER(module) IN (" + placeholders + ")",
                Long.class, modules.toArray());
        return count == null ? 0 : count;
    }

    @Test
    void salesAreaModulesAreExcludedFromAutomaticMirrors() {
        List<String> salesSpellings = List.of(
                "Lead", "leads", "Client", "Customer", "Follow-up", "followups",
                "Quotation", "Sales Contract", "salesContract", "Sales Order", "sales-order",
                "Customer Purchase Order", "Proforma Invoice", "Delivery Challan", "Invoice",
                "Credit Note", "Payment Receipt", "CPR", "CPR Technical Verification",
                "Cost Workout", "Profit Workout", "CRM", "crm", "sales", "finance");
        assertThat(salesSpellings).allSatisfy(module ->
                assertThat(DocumentModuleScope.allowsAutomaticRecordDocuments(module))
                        .as("sales module %s", module).isFalse());

        // Case and surrounding whitespace never widen the policy.
        assertThat(DocumentModuleScope.allowsAutomaticRecordDocuments("  QuOtAtIoN "))
                .isFalse();

        List<String> otherAreaSpellings = new ArrayList<>(List.of(
                "Marketing Visit", "Marketing Expense", "Marketing Travel Plan", "Q Form",
                "Purchase Order", "Vendor Quotation", "Purchase", "General",
                "Purchase Requisition"));
        assertThat(otherAreaSpellings).allSatisfy(module ->
                assertThat(DocumentModuleScope.allowsAutomaticRecordDocuments(module))
                        .as("non-sales module %s", module).isTrue());

        // A blank module is not a Sales module: no area is silently disabled.
        assertThat(DocumentModuleScope.allowsAutomaticRecordDocuments(null)).isTrue();
        assertThat(DocumentModuleScope.allowsAutomaticRecordDocuments("   ")).isTrue();
    }

    /**
     * Production follows the Sales rule: its Documents folders list the files the
     * user actually uploaded as attachments, not a placeholder row per production
     * order / work order / QC sheet / packing list / dispatch. The placeholders
     * carried no file at all (`filePath = "metadata-only"`), so they showed up in
     * Documents with nothing to preview or download.
     */
    @Test
    void productionAreaModulesAreExcludedFromAutomaticMirrors() {
        assertThat(DocumentModuleScope.productionModules()).allSatisfy(module ->
                assertThat(DocumentModuleScope.allowsAutomaticRecordDocuments(module))
                        .as("production module %s", module).isFalse());

        assertThat(DocumentModuleScope.allowsAutomaticRecordDocuments("  WoRk OrDeR "))
                .as("case and whitespace never widen the policy")
                .isFalse();
    }

    @Test
    void savingAProductionRecordNoLongerCreatesARepositoryMirror() {
        documents.syncRecordDocumentQuietly("Production Order", 987_654_323L,
                "Production Order — Mirror Policy Test", "Production Order", "CAST-MIRROR", null,
                "Mirror Policy Client", "pending");

        assertThat(repository
                .findByModuleIgnoreCaseAndRelatedRecordId("Production Order", 987_654_323L))
                .as("no mirror entry may be created for a Production record")
                .isEmpty();
    }

    @Test
    void savingASalesRecordNoLongerCreatesARepositoryMirror() {
        long salesBefore = salesRows();
        documents.syncRecordDocumentQuietly("Quotation", 987_654_321L,
                "Quotation — Mirror Policy Test", "Quotation", "QTN-MIRROR-POLICY", null,
                "Mirror Policy Client", "draft");

        assertThat(repository.findByModuleIgnoreCaseAndRelatedRecordId("Quotation", 987_654_321L))
                .as("no mirror entry may be created for a Sales record").isEmpty();
        assertThat(salesRows()).isEqualTo(salesBefore);
    }

    @Test
    void otherAreasKeepTheirRecordDocumentSynchronization() {
        long before = repository.countByModule("Marketing Visit");
        documents.syncRecordDocumentQuietly("Marketing Visit", 987_654_322L,
                "Marketing Visit — Mirror Policy Test", "Marketing Visit", "VISIT-MIRROR-POLICY",
                null, "Mirror Policy Client", "planned");

        // The shared sync is unchanged for non-Sales areas — proof the policy is
        // scoped to the Sales area instead of disabling the flow globally.
        assertThat(repository.countByModule("Marketing Visit")).isEqualTo(before + 1);
        assertThat(repository.findByModuleIgnoreCaseAndRelatedRecordId("Marketing Visit", 987_654_322L))
                .isNotEmpty();
    }

    @Test
    void theBackfillEndpointNoLongerRepopulatesSalesMirrors() {
        long salesBefore = salesRows();

        Map<String, Object> result = backfillService.runBackfill();

        assertThat(result.get("salesMirrorsSkipped")).isEqualTo(Boolean.TRUE);
        assertThat(salesRows())
                .as("the backfill must not re-create Sales repository mirrors")
                .isEqualTo(salesBefore);
    }
}
