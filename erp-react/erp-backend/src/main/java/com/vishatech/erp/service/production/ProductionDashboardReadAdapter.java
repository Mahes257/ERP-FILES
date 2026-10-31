package com.vishatech.erp.service.production;

import com.vishatech.erp.dashboard.dto.ApprovalCounts;
import com.vishatech.erp.dashboard.dto.DispatchCounts;
import com.vishatech.erp.dashboard.dto.PackingCounts;
import com.vishatech.erp.dashboard.dto.ProductionOrderCounts;
import com.vishatech.erp.dashboard.dto.QualityCounts;
import com.vishatech.erp.dashboard.dto.ShopFloorCounts;
import com.vishatech.erp.dashboard.port.ProductionDashboardPort;
import com.vishatech.erp.dto.production.DispatchStatsDTO;
import com.vishatech.erp.dto.production.DrawingStatsDTO;
import com.vishatech.erp.dto.production.ModelStatsDTO;
import com.vishatech.erp.dto.production.PackingStatsDTO;
import com.vishatech.erp.dto.production.ProductionStatsDTO;
import com.vishatech.erp.dto.production.TVStatsDTO;
import com.vishatech.erp.entity.production.EntryStatus;
import com.vishatech.erp.entity.production.ProductionType;
import com.vishatech.erp.repository.production.QualityInspectionRepository;
import com.vishatech.erp.repository.production.PackingListRepository;
import com.vishatech.erp.repository.production.ProductionEntryRepository;
import com.vishatech.erp.service.production.ProductionTrackerService;
import com.vishatech.erp.service.production.QualityInspectionService;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Production-owned implementation of {@link ProductionDashboardPort}.
 *
 * <p>Lives in the production module's own package, so the dashboards no longer
 * read production persistence: the four counters that come from repository
 * COUNT statements (shop-floor jobs) and the ones that come from production
 * services are all behind this class.
 *
 * <p>Every method delegates to exactly the call the dashboard made before the
 * port existed: the same stats document, the same repository counters, the same
 * status filters, in the same order. In particular
 * {@link #shopFloorCounts(String)} resolves the dashboard's type key to the
 * production type's display name and then applies the same
 * {@code countByProductionType} / {@code countByProductionTypeAndStatus}
 * filters, so the SQL predicate is unchanged.
 */
@Service
public class ProductionDashboardReadAdapter implements ProductionDashboardPort {

    private final ProductionOrderService productionOrderService;
    private final QualityInspectionService qualityInspectionService;
    private final TechnicalVerificationService technicalVerificationService;
    private final DrawingService drawingService;
    private final ModelService modelService;
    private final PackingListService packingListService;
    private final DispatchService dispatchService;
    private final QualityInspectionRepository qualityInspectionRepository;
    private final PackingListRepository packingListRepository;
    private final ProductionEntryRepository productionEntryRepository;
    private final ProductionTrackerService productionTrackerService;

    public ProductionDashboardReadAdapter(ProductionOrderService productionOrderService,
                                          QualityInspectionService qualityInspectionService,
                                          TechnicalVerificationService technicalVerificationService,
                                          DrawingService drawingService,
                                          ModelService modelService,
                                          PackingListService packingListService,
                                          DispatchService dispatchService,
                                          QualityInspectionRepository qualityInspectionRepository,
                                          PackingListRepository packingListRepository,
                                          ProductionEntryRepository productionEntryRepository,
                                          ProductionTrackerService productionTrackerService) {
        this.productionOrderService = productionOrderService;
        this.qualityInspectionService = qualityInspectionService;
        this.technicalVerificationService = technicalVerificationService;
        this.drawingService = drawingService;
        this.modelService = modelService;
        this.packingListService = packingListService;
        this.dispatchService = dispatchService;
        this.qualityInspectionRepository = qualityInspectionRepository;
        this.packingListRepository = packingListRepository;
        this.productionEntryRepository = productionEntryRepository;
        this.productionTrackerService = productionTrackerService;
    }

    @Override
    public ProductionOrderCounts orderCounts() {
        ProductionStatsDTO stats = productionOrderService.getStatistics();
        return new ProductionOrderCounts(
                stats.getTotal(),
                stats.getPendingProductionApproval(),
                stats.getPendingAdminApproval(),
                stats.getPending(),
                stats.getInProgress(),
                stats.getHold(),
                stats.getCompleted(),
                productionOrderService.getAverageProgress());
    }

    @Override
    public QualityCounts qualityCounts() {
        Map<String, Object> stats = qualityInspectionService.stats(null);
        return new QualityCounts(
                num(stats, "totalInspections"),
                num(stats, "pendingInspections"),
                num(stats, "inProgressInspections"),
                num(stats, "passedInspections"),
                num(stats, "failedInspections"),
                num(stats, "holdInspections"));
    }

    @Override
    public long qualityTotal() {
        return qualityInspectionRepository.count();
    }

    @Override
    public ApprovalCounts verificationCounts() {
        TVStatsDTO stats = technicalVerificationService.getStatistics();
        return new ApprovalCounts(stats.getTotal(), stats.getPending(),
                stats.getVerified(), stats.getRejected());
    }

    @Override
    public ApprovalCounts drawingCounts() {
        DrawingStatsDTO stats = drawingService.getStatistics();
        return new ApprovalCounts(stats.getTotal(), stats.getPending(),
                stats.getVerified(), stats.getRejected());
    }

    @Override
    public ApprovalCounts modelCounts() {
        ModelStatsDTO stats = modelService.getStatistics();
        return new ApprovalCounts(stats.getTotal(), stats.getPending(),
                stats.getVerified(), stats.getRejected());
    }

    @Override
    public ShopFloorCounts shopFloorCounts(String typeKey) {
        String dbType = productionType(typeKey).getDisplayName();
        return new ShopFloorCounts(
                productionEntryRepository.countByProductionType(dbType),
                productionEntryRepository.countByProductionTypeAndStatus(dbType, EntryStatus.PENDING),
                productionEntryRepository.countByProductionTypeAndStatus(dbType, EntryStatus.IN_PROGRESS),
                productionEntryRepository.countByProductionTypeAndStatus(dbType, EntryStatus.HOLD),
                productionEntryRepository.countByProductionTypeAndStatus(dbType, EntryStatus.COMPLETED));
    }

    @Override
    public PackingCounts packingCounts() {
        PackingStatsDTO stats = packingListService.getStatistics();
        return new PackingCounts(stats.getTotal(), stats.getPending(), stats.getInProgress(),
                stats.getCompleted(), stats.getReadyForDispatch());
    }

    @Override
    public long packingTotal() {
        return packingListRepository.count();
    }

    @Override
    public DispatchCounts dispatchCounts() {
        DispatchStatsDTO stats = dispatchService.getStatistics();
        return new DispatchCounts(stats.getTotal(), stats.getReady(), stats.getDispatched(),
                stats.getInTransit(), stats.getDelivered());
    }

    @Override
    public Map<String, Object> trackerStats() {
        return productionTrackerService.stats();
    }

    /** The dashboard's type key ("casting", …) as the persisted production type. */
    private static ProductionType productionType(String typeKey) {
        if (typeKey == null || typeKey.isBlank()) {
            throw new IllegalArgumentException("Production type key is required");
        }
        try {
            return ProductionType.valueOf(typeKey.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException unknown) {
            throw new IllegalArgumentException("Unknown production type key: " + typeKey, unknown);
        }
    }

    /** Safe long extraction from a stats document (missing or odd keys are zero). */
    private static long num(Map<String, Object> stats, String key) {
        Object value = stats.get(key);
        return value instanceof Number ? ((Number) value).longValue() : 0L;
    }
}
