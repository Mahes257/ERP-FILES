package com.vishatech.erp.production;

import static org.assertj.core.api.Assertions.assertThat;

import com.vishatech.erp.entity.production.ProductionTracker;
import com.vishatech.erp.entity.production.PackingList;
import com.vishatech.erp.entity.production.PackingStatus;
import com.vishatech.erp.production.api.ProductionDocumentPort;
import com.vishatech.erp.repository.production.ProductionTrackerRepository;
import com.vishatech.erp.repository.production.PackingListRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.service.PdfGenerationService;
import com.vishatech.erp.service.production.ProductionDocumentService;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * §14.13 — the production documents, exercised through the public entry points the
 * rest of the application uses ({@code PdfGenerationService.buildHtml} /
 * {@code generatePdf} / {@code buildQualityInspectionHtml}) against a real service
 * context and a real database row.
 *
 * <p>The content itself is pinned row by row in
 * {@code service.production.ProductionDocumentServiceTests}; this class proves the
 * other half — that the shared reporting service is wired to the module's reader, that
 * the HTML it returns is the document the module describes (including the reflection
 * over a <em>persisted</em> entity), that the same record still renders to real PDF
 * bytes, that the HTML is stable between two reads (the document repository uses it to
 * fingerprint content and avoid duplicate versions), and that a missing record is
 * still no document rather than an exception.
 *
 * <p>The quality inspection document is asserted only for its missing-record and
 * dispatch behaviour: its table declares MySQL {@code JSON} columns that H2 cannot
 * create, so no inspection row can be seeded in this context (the same reason
 * {@code DashboardStatsApiTests} recreates that table by hand). Its content is covered
 * by the unit test, which needs no database.
 */
@SpringBootTest
class ProductionDocumentContractIntegrationTests extends AbstractSecurityTest {

    private static final long UNKNOWN_ID = 9_000_000_000L;

    @Autowired
    private PdfGenerationService pdfGenerationService;

    @Autowired
    private ProductionDocumentPort productionDocuments;

    @Autowired
    private ProductionTrackerRepository trackers;

    @Autowired
    private PackingListRepository packingLists;

    private static String unique(String prefix) {
        return prefix + "-" + Long.toString(System.nanoTime(), 36);
    }

    private ProductionTracker seedTracker() {
        ProductionTracker tracker = new ProductionTracker();
        tracker.setCpoNo(unique("CPO-P9"));
        tracker.setCustomer("Contract Industries");
        tracker.setOrderDate(LocalDate.of(2026, 7, 1));
        tracker.setDueDate(LocalDate.of(2026, 8, 1));
        tracker.setCastingPct(40);
        tracker.setFabricationPct(10);
        tracker.setRemarks("Seeded for the document contract");
        tracker.setCurrentStatus("IN_PROGRESS");
        tracker.setCreatedBy("admin");
        return trackers.save(tracker);
    }

    private PackingList seedPackingList() {
        return packingLists.save(PackingList.builder()
                .packingListNumber(unique("PL-P9"))
                .workOrderId("WO-9")
                .product("Gearbox Housing")
                .customer("Contract Industries")
                .productionQuantity(20)
                .packedQuantity(20)
                .packingDate(LocalDate.of(2026, 7, 3))
                .status(PackingStatus.PENDING)
                .remarks("Complete")
                .build());
    }

    @Test
    void theTrackerDocumentIsBuiltFromTheModulesOwnPersistedRecord() {
        ProductionTracker tracker = seedTracker();

        String html = pdfGenerationService.buildHtml("productiontracker", tracker.getId());

        assertThat(html)
                .as("the module describes the document and the shared pipeline renders it")
                .isNotNull()
                .contains("<h1>PRODUCTION TRACKER</h1>")
                .contains("<strong>" + tracker.getCpoNo() + "</strong>")
                .contains("<td>Contract Industries</td>")
                .contains(">Casting</td><td>40%</td>")
                .contains(">Fabrication</td><td>10%</td>")
                .contains(">Remarks</td><td>Seeded for the document contract</td>")
                .contains("<h2>Complete Record Details</h2>")
                .contains(">Created By</td><td>admin</td>")
                .endsWith("</body></html>");

        // The document repository fingerprints this HTML, so it must be stable.
        assertThat(pdfGenerationService.buildHtml("productiontracker", tracker.getId()))
                .isEqualTo(html);
    }

    @Test
    void thePackingListDocumentStillRendersToRealPdfBytes() {
        PackingList list = seedPackingList();

        String html = pdfGenerationService.buildHtml("packinglist", list.getId());
        byte[] pdf = pdfGenerationService.generatePdf("packinglist", list.getId());

        assertThat(html)
                .isNotNull()
                .contains("<h1>PACKING LIST</h1>")
                .contains("<strong>" + list.getPackingListNumber() + "</strong>")
                .contains(">Customer</td><td>Contract Industries</td>")
                .contains(">Packed Qty</td><td>20</td>");

        assertThat(pdf).as("the same HTML still goes through the iText pipeline").isNotNull();
        assertThat(pdf.length).isGreaterThan(5);
        assertThat(new String(pdf, 0, 5, StandardCharsets.ISO_8859_1)).isEqualTo("%PDF-");
    }

    @Test
    void aMissingRecordProducesNoDocumentInsteadOfAnException() {
        assertThat(pdfGenerationService.buildHtml("productiontracker", UNKNOWN_ID)).isNull();
        assertThat(pdfGenerationService.buildHtml("packinglist", UNKNOWN_ID)).isNull();
        assertThat(pdfGenerationService.buildHtml("productiontracker", null)).isNull();
        assertThat(pdfGenerationService.generatePdf("productiontracker", UNKNOWN_ID)).isNull();

        // The inspection document has a String key and its own entry point, and the
        // dispatch stays null for that module — exactly as it was before this migration.
        // Its missing-row answer needs a real table (H2 cannot create the inspection
        // table's JSON columns), so that half is pinned by the unit test instead.
        assertThat(pdfGenerationService.buildHtml("qualityinspection", 1L)).isNull();
        assertThat(pdfGenerationService.buildHtml("no-such-module", 1L)).isNull();
    }

    @Test
    void thePublishedPortIsServedByTheProductionOwnedAdapter() {
        assertThat(productionDocuments)
                .as("the shared reporting service must talk to the module, not to its tables")
                .isInstanceOf(ProductionDocumentService.class);
    }
}
