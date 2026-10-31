package com.vishatech.erp.service.production;

import static com.vishatech.erp.pdf.DocumentHtml.dt;
import static com.vishatech.erp.pdf.DocumentHtml.labels;
import static com.vishatech.erp.pdf.DocumentHtml.recordRows;
import static com.vishatech.erp.pdf.DocumentView.field;

import com.vishatech.erp.entity.production.QualityInspection;
import com.vishatech.erp.entity.production.ProductionTracker;
import com.vishatech.erp.entity.production.PackingList;
import com.vishatech.erp.pdf.DocumentView;
import com.vishatech.erp.production.api.ProductionDocumentPort;
import com.vishatech.erp.repository.production.ProductionTrackerRepository;
import com.vishatech.erp.repository.production.QualityInspectionRepository;
import com.vishatech.erp.repository.production.PackingListRepository;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The production-owned reader behind {@link ProductionDocumentPort}: it loads the
 * three production documents' records and describes them as {@link DocumentView}s.
 *
 * <p><b>What moved here, and what did not.</b> The three document bodies were
 * private methods of {@code service.PdfGenerationService} ({@code
 * generateProductionTrackerHtml}, {@code generateQualityInspectionHtml}, {@code
 * generatePackingListHtml}). The record reads and the document content — the
 * title, the reference, the curated summary rows in their printed order, and the
 * complete-record details — moved here; the HTML shell, the CSS, the escaping and
 * the reflection stayed shared in {@code com.vishatech.erp.pdf.DocumentHtml}. The
 * rows are the same rows, in the same order, with the same labels and the same
 * null handling, so the produced documents are byte-for-byte what they were;
 * nothing about the PDFs changed with the boundary.
 *
 * <p><b>Reads.</b> These are the module's own tables, all three of them inside
 * {@code repository.production}: the tracker and inspection persistence joined the
 * packing list there in §14.14, which is what removed this class from
 * {@code PRODUCTION_TO_FLAT_PERSISTENCE_ALLOWLIST}. The missing-record behaviour is
 * the original one: {@code findById(...).orElse(null)} → an empty result → no
 * document, never an exception.
 */
@Service
public class ProductionDocumentService implements ProductionDocumentPort {

    private final ProductionTrackerRepository trackers;
    private final QualityInspectionRepository inspections;
    private final PackingListRepository packingLists;

    public ProductionDocumentService(ProductionTrackerRepository trackers,
                                     QualityInspectionRepository inspections,
                                     PackingListRepository packingLists) {
        this.trackers = trackers;
        this.inspections = inspections;
        this.packingLists = packingLists;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<DocumentView> productionTracker(Long id) {
        if (id == null) {
            return Optional.empty();
        }
        ProductionTracker pt = trackers.findById(id).orElse(null);
        if (pt == null) {
            return Optional.empty();
        }
        List<DocumentView.Field> summary = List.of(
                field("Status", pt.getCurrentStatus()),
                field("Customer", pt.getCustomer()),
                field("Order Date", dt(pt.getOrderDate())),
                field("Due Date", dt(pt.getDueDate())),
                field("Casting", pt.getCastingPct() != null ? pt.getCastingPct() + "%" : "-"),
                field("Fabrication", pt.getFabricationPct() != null ? pt.getFabricationPct() + "%" : "-"),
                field("Assembly", pt.getAssemblyPct() != null ? pt.getAssemblyPct() + "%" : "-"),
                field("QC", pt.getQcPct() != null ? pt.getQcPct() + "%" : "-"),
                field("Packing", pt.getPackingPct() != null ? pt.getPackingPct() + "%" : "-"),
                field("Dispatch", pt.getDispatchPct() != null ? pt.getDispatchPct() + "%" : "-"),
                field("Remarks", pt.getRemarks()));
        return Optional.of(new DocumentView("PRODUCTION TRACKER", pt.getCpoNo(), pt.getCreatedAt(),
                summary, recordRows(pt, labels(summary))));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<DocumentView> qualityInspection(String id) {
        if (id == null) {
            return Optional.empty();
        }
        QualityInspection qi = inspections.findById(id).orElse(null);
        if (qi == null) {
            return Optional.empty();
        }
        List<DocumentView.Field> summary = List.of(
                field("Status", qi.getStatus()),
                field("Production Ref", qi.getProductionOrderId()),
                field("Product", qi.getProduct()),
                field("Customer", qi.getCustomer()),
                field("Department", qi.getDepartment()),
                field("Inspection Type", qi.getInspectionType()),
                field("Inspector", qi.getInspector()),
                field("Inspection Date", dt(qi.getInspectionDate())),
                field("Qty Inspected", qi.getQuantityInspected() != null ? String.valueOf(qi.getQuantityInspected()) : null),
                field("Accepted", qi.getAcceptedQuantity() != null ? String.valueOf(qi.getAcceptedQuantity()) : null),
                field("Rejected", qi.getRejectedQuantity() != null ? String.valueOf(qi.getRejectedQuantity()) : null),
                field("Remarks", qi.getRemarks()));
        return Optional.of(new DocumentView("QUALITY INSPECTION",
                qi.getInspectionId() != null ? qi.getInspectionId() : "QC-" + id,
                qi.getCreatedAt(),
                summary, recordRows(qi, labels(summary))));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<DocumentView> packingList(Long id) {
        if (id == null) {
            return Optional.empty();
        }
        PackingList pl = packingLists.findById(id).orElse(null);
        if (pl == null) {
            return Optional.empty();
        }
        List<DocumentView.Field> summary = List.of(
                field("Status", pl.getStatus() != null ? pl.getStatus().name() : null),
                field("Work Order", pl.getWorkOrderId()),
                field("Product", pl.getProduct()),
                field("Customer", pl.getCustomer()),
                field("Production Qty", pl.getProductionQuantity() != null ? String.valueOf(pl.getProductionQuantity()) : null),
                field("Packed Qty", pl.getPackedQuantity() != null ? String.valueOf(pl.getPackedQuantity()) : null),
                field("Packing Date", dt(pl.getPackingDate())),
                field("Remarks", pl.getRemarks()));
        return Optional.of(new DocumentView("PACKING LIST", pl.getPackingListNumber(),
                pl.getCreatedAt() != null
                        ? LocalDateTime.ofInstant(pl.getCreatedAt(), ZoneId.systemDefault())
                        : null,
                summary, recordRows(pl, labels(summary))));
    }
}
