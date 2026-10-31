package com.vishatech.erp.service;

import com.vishatech.erp.entity.production.ProductionTracker;
import com.vishatech.erp.entity.production.QualityInspection;
import com.vishatech.erp.entity.production.PackingList;
import com.vishatech.erp.repository.production.ProductionTrackerRepository;
import com.vishatech.erp.repository.production.QualityInspectionRepository;
import com.vishatech.erp.repository.production.PackingListRepository;

/**
 * Inert, test-only regression fixture: it is the dependency that
 * {@code PdfGenerationService} used to have on production persistence, written out
 * again in a shared (non-production) class.
 *
 * <p>{@code PdfProductionRegressionProbe} is not a Spring bean, is never annotated,
 * is never instantiated and reaches no application jar. Its only purpose is to be
 * something the {@code outside_does_not_depend_on_production_persistence} rule
 * <em>must</em> report: §14.13 deleted the last two entries of that rule's freeze
 * after migrating them onto published Production contracts, and a deleted freeze is
 * only defensible if the guard provably still bites.
 *
 * <p>It mirrors the former reader exactly — the three production repositories the
 * tracker, quality inspection and packing list documents were built from, plus the
 * entities whose fields those documents printed.
 */
public class PdfProductionRegressionProbe {

    private final ProductionTrackerRepository trackers;
    private final QualityInspectionRepository inspections;
    private final PackingListRepository packingLists;

    public PdfProductionRegressionProbe(ProductionTrackerRepository trackers,
                                        QualityInspectionRepository inspections,
                                        PackingListRepository packingLists) {
        this.trackers = trackers;
        this.inspections = inspections;
        this.packingLists = packingLists;
    }

    public String tracker(Long id) {
        ProductionTracker tracker = trackers.findById(id).orElse(null);
        return tracker == null ? null : tracker.getCpoNo();
    }

    public QualityInspection inspection(String id) {
        return inspections.findById(id).orElse(null);
    }

    public PackingList packingList(Long id) {
        return packingLists.findById(id).orElse(null);
    }
}
