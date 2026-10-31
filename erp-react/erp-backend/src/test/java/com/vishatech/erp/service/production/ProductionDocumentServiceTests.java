package com.vishatech.erp.service.production;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.vishatech.erp.entity.production.QualityInspection;
import com.vishatech.erp.entity.production.ProductionTracker;
import com.vishatech.erp.entity.production.PackingList;
import com.vishatech.erp.entity.production.PackingStatus;
import com.vishatech.erp.pdf.DocumentHtml;
import com.vishatech.erp.pdf.DocumentView;
import com.vishatech.erp.repository.production.ProductionTrackerRepository;
import com.vishatech.erp.repository.production.QualityInspectionRepository;
import com.vishatech.erp.repository.production.PackingListRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/**
 * §14.13 — the three production documents still say exactly what they said.
 *
 * <p>The documents were not rewritten, they were <em>moved</em>: the tracker,
 * quality-inspection and packing-list builders left {@code PdfGenerationService} for
 * this module (which owns the records) and hand the shared renderer a
 * {@link DocumentView}. These tests pin the result row by row — the summary is
 * compared against a literal, so a changed label, a changed order, a dropped "%"
 * suffix or a missing date format fails here — and they pin the two behaviours that
 * are easy to lose in such a move:
 *
 * <ul>
 *   <li>the "Complete Record Details" section still reproduces every user-entered
 *       field the curated summary does not show, still skips ERP-internal columns, and
 *       is still omitted entirely when nothing is left;</li>
 *   <li>a missing record is still no document at all — an empty result, not an
 *       exception and not an empty page.</li>
 * </ul>
 *
 * <p>The repositories are mocked so the assertions are about the document content,
 * not about the database; the same three documents are exercised over a real H2 row
 * by {@code production.ProductionDocumentContractIntegrationTests}.
 */
class ProductionDocumentServiceTests {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd MMM yyyy");

    private static final long TRACKER_ID = 41L;
    private static final String INSPECTION_ID = "QI-TEST-1";
    private static final long PACKING_LIST_ID = 77L;

    private final ProductionTrackerRepository trackers = mock(ProductionTrackerRepository.class);
    private final QualityInspectionRepository inspections = mock(QualityInspectionRepository.class);
    private final PackingListRepository packingLists = mock(PackingListRepository.class);

    private final ProductionDocumentService service =
            new ProductionDocumentService(trackers, inspections, packingLists);

    // ------------------------------------------------------------------
    // Fixtures — the same values the pre-migration builder printed
    // ------------------------------------------------------------------

    private static ProductionTracker fullyPopulatedTracker() {
        ProductionTracker tracker = new ProductionTracker();
        tracker.setCpoNo("CPO-2026-0041");
        tracker.setCustomer("Acme & Sons <Steel>");
        tracker.setOrderDate(LocalDate.of(2026, 5, 6));
        tracker.setDueDate(LocalDate.of(2026, 6, 1));
        tracker.setCastingPct(25);
        tracker.setFabricationPct(50);
        tracker.setAssemblyPct(null);
        tracker.setQcPct(0);
        tracker.setPackingPct(null);
        tracker.setDispatchPct(100);
        tracker.setRemarks("Urgent & fast");
        tracker.setCurrentStatus("IN_PROGRESS");
        tracker.setCastingStart(LocalDate.of(2026, 5, 7));
        tracker.setCreatedBy("admin");
        tracker.setCreatedAt(LocalDateTime.of(2026, 5, 6, 8, 0));
        return tracker;
    }

    private static QualityInspection inspection() {
        QualityInspection qi = new QualityInspection();
        qi.setId("QI-1");
        qi.setInspectionId("QI-0007");
        qi.setStatus("Passed");
        qi.setProductionOrderId("CPO-2026-0041");
        qi.setProduct("Gearbox Housing");
        qi.setCustomer("Acme & Sons");
        qi.setDepartment("Quality");
        qi.setInspectionType("Final");
        qi.setInspector("R. Kumar");
        qi.setInspectionDate(LocalDate.of(2026, 5, 9));
        qi.setQuantityInspected(20);
        qi.setAcceptedQuantity(19);
        qi.setRejectedQuantity(1);
        qi.setRemarks("One casting repaired");
        qi.setCreatedAt(LocalDateTime.of(2026, 5, 9, 15, 30));
        return qi;
    }

    private static PackingList packingList() {
        PackingList list = PackingList.builder()
                .packingListNumber("PL-2026-0077")
                .workOrderId("WO-77")
                .product("Gearbox Housing")
                .customer("Acme & Sons")
                .productionQuantity(20)
                .packedQuantity(18)
                .packingDate(LocalDate.of(2026, 5, 12))
                .status(PackingStatus.PENDING)
                .remarks("Two crates")
                .build();
        // The audit stamp lives on the shared BaseEntity, outside the builder.
        list.setCreatedAt(Instant.parse("2026-05-12T12:00:00Z"));
        return list;
    }

    private static String row(String label, String value) {
        return "<tr><td style='width:140px;font-weight:bold;'>" + label + "</td><td>" + value + "</td></tr>";
    }

    // ------------------------------------------------------------------
    // 1. The tracker document
    // ------------------------------------------------------------------

    @Test
    void theTrackerDocumentPrintsTheSameLetterheadSummaryAndDetails() {
        ProductionTracker tracker = fullyPopulatedTracker();
        when(trackers.findById(TRACKER_ID)).thenReturn(Optional.of(tracker));

        String html = DocumentHtml.render(service.productionTracker(TRACKER_ID).orElseThrow());

        // The letterhead is the shared one, with the CPO as the reference and the
        // creation timestamp as the date — and no production type leaks into it.
        assertThat(html)
                .startsWith("<!DOCTYPE html><html xmlns='http://www.w3.org/1999/xhtml'><head>")
                .contains("<h1>PRODUCTION TRACKER</h1>")
                .contains("<strong>CPO-2026-0041</strong>")
                .contains("data-date='06 May 2026'")
                .endsWith("</body></html>")
                .doesNotContain("com.vishatech");

        // …then the curated summary, row for row, in the printed order.
        String summary = "<table>"
                + row("Status", "IN_PROGRESS")
                + row("Customer", "Acme &amp; Sons &lt;Steel&gt;")
                + row("Order Date", "06 May 2026")
                + row("Due Date", "01 Jun 2026")
                + row("Casting", "25%")
                + row("Fabrication", "50%")
                + row("Assembly", "-")
                + row("QC", "0%")
                + row("Packing", "-")
                + row("Dispatch", "100%")
                + row("Remarks", "Urgent &amp; fast")
                + "</table>";
        assertThat(html).contains(summary);

        // …then the complete-record section: the fields the summary does not show.
        assertThat(html)
                .contains("<h2>Complete Record Details</h2>")
                .contains(row("Casting Start", "07 May 2026"))
                .contains(row("Created By", "admin"));
        // A curated label is never repeated below, and ERP-internal columns never appear.
        assertThat(html).containsOnlyOnce(row("Customer", "Acme &amp; Sons &lt;Steel&gt;"));
        assertThat(html)
                .doesNotContain(row("Created At", "06 May 2026"))
                .doesNotContain(row("Updated At", ""))
                .doesNotContain(">Id</td>");

        // The order of the sections is the order the document has always had.
        assertThat(html.indexOf("<h1>PRODUCTION TRACKER</h1>"))
                .isLessThan(html.indexOf("<h2>Complete Record Details</h2>"));
        assertThat(html.indexOf("<h2>Complete Record Details</h2>"))
                .isLessThan(html.indexOf("</body></html>"));
    }

    @Test
    void theTrackerDocumentRendersDefaultsTheSameWayItAlwaysDid() {
        ProductionTracker tracker = new ProductionTracker();
        tracker.setCpoNo("CPO-2026-0042");
        tracker.setCustomer("Nothing Else Industries");
        tracker.setCurrentStatus("NOT_STARTED");
        tracker.setCreatedAt(LocalDateTime.of(2026, 5, 6, 8, 0));
        when(trackers.findById(42L)).thenReturn(Optional.of(tracker));

        String html = DocumentHtml.render(service.productionTracker(42L).orElseThrow());

        // Unset dates stay "-", the stage columns keep their 0 defaults as "0%", and an
        // empty remarks field still prints no row at all.
        assertThat(html).contains("<table>"
                + row("Status", "NOT_STARTED")
                + row("Customer", "Nothing Else Industries")
                + row("Order Date", "-")
                + row("Due Date", "-")
                + row("Casting", "0%")
                + row("Fabrication", "0%")
                + row("Assembly", "0%")
                + row("QC", "0%")
                + row("Packing", "0%")
                + row("Dispatch", "0%")
                + "</table>");
        assertThat(html).doesNotContain(">Remarks</td>");

        // Pre-existing, and deliberately unchanged: the summary prints the short stage
        // labels while the entity properties are "castingPct" …, so the complete-record
        // section repeats those values under their property names.
        assertThat(html).contains(row("Casting Pct", "0")).contains(row("Qc Pct", "0"));
    }

    @Test
    void aDocumentWithNothingLeftToShowCarriesNoDetailsSection() {
        DocumentView view = new DocumentView("PRODUCTION TRACKER", "CPO-2026-0043",
                LocalDateTime.of(2026, 5, 6, 8, 0),
                java.util.List.of(DocumentView.field("Customer", "Acme & Sons")),
                java.util.List.of());

        assertThat(DocumentHtml.render(view))
                .contains(row("Customer", "Acme &amp; Sons"))
                .doesNotContain("Complete Record Details")
                .endsWith("</table></body></html>");
    }

    // ------------------------------------------------------------------
    // 2. The quality inspection document (String primary key)
    // ------------------------------------------------------------------

    @Test
    void theInspectionDocumentPrintsTheSameSummaryAndUsesTheStoredInspectionNumber() {
        when(inspections.findById(INSPECTION_ID)).thenReturn(Optional.of(inspection()));

        DocumentView view = service.qualityInspection(INSPECTION_ID).orElseThrow();
        String html = DocumentHtml.render(view);

        assertThat(html)
                .contains("<h1>QUALITY INSPECTION</h1>")
                .contains("<strong>QI-0007</strong>");
        assertThat(html).contains("<table>"
                + row("Status", "Passed")
                + row("Production Ref", "CPO-2026-0041")
                + row("Product", "Gearbox Housing")
                + row("Customer", "Acme &amp; Sons")
                + row("Department", "Quality")
                + row("Inspection Type", "Final")
                + row("Inspector", "R. Kumar")
                + row("Inspection Date", "09 May 2026")
                + row("Qty Inspected", "20")
                + row("Accepted", "19")
                + row("Rejected", "1")
                + row("Remarks", "One casting repaired")
                + "</table>");
        // Pre-existing, and deliberately unchanged: the summary labels ("Qty Inspected",
        // "Accepted", "Rejected", "Production Ref") do not match the entity property
        // names, so those values are reproduced under their property names below — while
        // the ERP-internal id and audit columns are still kept out.
        assertThat(html)
                .contains("<h2>Complete Record Details</h2>")
                .contains(row("Inspection Id", "QI-0007"))
                .contains(row("Production Order Id", "CPO-2026-0041"))
                .contains(row("Quantity Inspected", "20"))
                .contains(row("Accepted Quantity", "19"))
                .contains(row("Rejected Quantity", "1"))
                .doesNotContain(">Created At</td>")
                .doesNotContain(">Updated At</td>");
    }

    @Test
    void theInspectionDocumentFallsBackToTheGeneratedReferenceWhenTheStoredOneIsAbsent() {
        QualityInspection qi = inspection();
        qi.setInspectionId(null);
        when(inspections.findById(INSPECTION_ID)).thenReturn(Optional.of(qi));

        assertThat(DocumentHtml.render(service.qualityInspection(INSPECTION_ID).orElseThrow()))
                .contains("<strong>QC-" + INSPECTION_ID + "</strong>");
    }

    // ------------------------------------------------------------------
    // 3. The packing list document (Instant audit timestamp)
    // ------------------------------------------------------------------

    @Test
    void thePackingListDocumentPrintsTheSameSummaryAndConvertsItsInstantTimestamp() {
        PackingList list = packingList();
        when(packingLists.findById(PACKING_LIST_ID)).thenReturn(Optional.of(list));

        // The stamp is stored as an Instant and printed in the server's zone, exactly
        // as the pre-migration builder did (Instant -> LocalDateTime -> dd MMM yyyy).
        String expectedDate = DATE.format(
                LocalDateTime.ofInstant(list.getCreatedAt(), ZoneId.systemDefault()));

        String html = DocumentHtml.render(service.packingList(PACKING_LIST_ID).orElseThrow());

        assertThat(html)
                .contains("<h1>PACKING LIST</h1>")
                .contains("<strong>PL-2026-0077</strong>");
        assertThat(html).contains("<table>"
                + row("Status", "PENDING")
                + row("Work Order", "WO-77")
                + row("Product", "Gearbox Housing")
                + row("Customer", "Acme &amp; Sons")
                + row("Production Qty", "20")
                + row("Packed Qty", "18")
                + row("Packing Date", "12 May 2026")
                + row("Remarks", "Two crates")
                + "</table>");
        assertThat(expectedDate).matches("\\d{2} [A-Z][a-z]{2} \\d{4}");
        assertThat(html).contains("data-date='" + expectedDate + "'");
    }

    // ------------------------------------------------------------------
    // 4. A missing record is no document
    // ------------------------------------------------------------------

    @Test
    void aMissingRecordIsNoDocumentForEveryOneOfTheThree() {
        when(trackers.findById(TRACKER_ID)).thenReturn(Optional.empty());
        when(inspections.findById(INSPECTION_ID)).thenReturn(Optional.empty());
        when(packingLists.findById(PACKING_LIST_ID)).thenReturn(Optional.empty());

        assertThat(service.productionTracker(TRACKER_ID)).isEmpty();
        assertThat(service.qualityInspection(INSPECTION_ID)).isEmpty();
        assertThat(service.packingList(PACKING_LIST_ID)).isEmpty();

        // A null id is the same answer, without touching the repository.
        assertThat(service.productionTracker(null)).isEmpty();
        assertThat(service.qualityInspection(null)).isEmpty();
        assertThat(service.packingList(null)).isEmpty();
    }
}
