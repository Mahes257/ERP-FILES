package com.vishatech.erp.service.production;

import static org.assertj.core.api.Assertions.assertThat;

import com.vishatech.erp.dashboard.dto.ApprovalCounts;
import com.vishatech.erp.dashboard.dto.DispatchCounts;
import com.vishatech.erp.dashboard.dto.PackingCounts;
import com.vishatech.erp.dashboard.dto.ProductionOrderCounts;
import com.vishatech.erp.dashboard.dto.QualityCounts;
import com.vishatech.erp.dashboard.dto.ShopFloorCounts;
import com.vishatech.erp.dto.production.DispatchStatsDTO;
import com.vishatech.erp.dto.production.DrawingStatsDTO;
import com.vishatech.erp.dto.production.ModelStatsDTO;
import com.vishatech.erp.dto.production.PackingStatsDTO;
import com.vishatech.erp.dto.production.ProductionStatsDTO;
import com.vishatech.erp.dto.production.TVStatsDTO;
import com.vishatech.erp.entity.production.EntryStatus;
import com.vishatech.erp.entity.production.OrderStatus;
import com.vishatech.erp.entity.production.Priority;
import com.vishatech.erp.entity.production.ProductionEntry;
import com.vishatech.erp.entity.production.ProductionOrder;
import com.vishatech.erp.repository.production.QualityInspectionRepository;
import com.vishatech.erp.repository.production.PackingListRepository;
import com.vishatech.erp.repository.production.ProductionEntryRepository;
import com.vishatech.erp.repository.production.ProductionOrderRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.service.production.ProductionTrackerService;
import com.vishatech.erp.service.production.QualityInspectionService;
import jakarta.annotation.PostConstruct;
import java.sql.Connection;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

/**
 * Equivalence tests for {@link ProductionDashboardReadAdapter}: the shop-floor
 * counters must equal the repository COUNT statements they replace (with the
 * same production-type filter), and the module-driven counters must equal the
 * stats documents the dashboard used to read directly.
 */
@SpringBootTest
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class ProductionDashboardReadAdapterTests extends AbstractSecurityTest {

    @Autowired
    private ProductionDashboardReadAdapter adapter;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private QualityInspectionService qualityInspectionService;

    @Autowired
    private TechnicalVerificationService technicalVerificationService;

    @Autowired
    private DrawingService drawingService;

    @Autowired
    private ModelService modelService;

    @Autowired
    private PackingListService packingListService;

    @Autowired
    private DispatchService dispatchService;

    @Autowired
    private ProductionTrackerService productionTrackerService;

    @Autowired
    private ProductionOrderRepository productionOrders;

    @Autowired
    private ProductionEntryRepository productionEntries;

    @Autowired
    private QualityInspectionRepository qualityInspections;

    @Autowired
    private PackingListRepository packingLists;

    @Autowired
    private DataSource dataSource;

    /**
     * {@code QualityInspection} declares MySQL {@code JSON} columns that H2
     * cannot create, so the table is recreated here with the columns the
     * per-status counts need — the same workaround the other dashboard tests use.
     */
    @PostConstruct
    void ensureQualityInspectionsTable() throws Exception {
        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {
            statement.execute("CREATE TABLE IF NOT EXISTS quality_inspections ("
                    + "id VARCHAR(20) PRIMARY KEY, status VARCHAR(50))");
            statement.execute("ALTER TABLE quality_inspections ADD COLUMN IF NOT EXISTS status VARCHAR(50)");
        }
    }

    @Test
    void orderCountsMatchTheOrderStatistics() {
        ProductionStatsDTO stats = productionOrderService.getStatistics();

        ProductionOrderCounts counts = adapter.orderCounts();

        assertThat(counts.total()).isEqualTo(stats.getTotal());
        assertThat(counts.pendingProductionApproval()).isEqualTo(stats.getPendingProductionApproval());
        assertThat(counts.pendingAdminApproval()).isEqualTo(stats.getPendingAdminApproval());
        // Normal 'Pending' work orders (released, waiting to be started) are
        // published separately from the two approval queues.
        assertThat(counts.pending()).isEqualTo(stats.getPending());
        assertThat(counts.inProgress()).isEqualTo(stats.getInProgress());
        assertThat(counts.hold()).isEqualTo(stats.getHold());
        assertThat(counts.completed()).isEqualTo(stats.getCompleted());
        assertThat(counts.averageProgress()).isEqualTo(productionOrderService.getAverageProgress());
    }

    @Test
    void qualityCountsMatchTheInspectionDocument() {
        Map<String, Object> stats = qualityInspectionService.stats(null);

        QualityCounts counts = adapter.qualityCounts();

        assertThat(counts.total()).isEqualTo(num(stats, "totalInspections"));
        assertThat(counts.pending()).isEqualTo(num(stats, "pendingInspections"));
        assertThat(counts.inProgress()).isEqualTo(num(stats, "inProgressInspections"));
        assertThat(counts.passed()).isEqualTo(num(stats, "passedInspections"));
        assertThat(counts.failed()).isEqualTo(num(stats, "failedInspections"));
        assertThat(counts.hold()).isEqualTo(num(stats, "holdInspections"));
        assertThat(counts.total()).isEqualTo(qualityInspections.count());
    }

    @Test
    void verificationDrawingAndModelCountsMatchTheirStatistics() {
        TVStatsDTO tv = technicalVerificationService.getStatistics();
        ApprovalCounts verification = adapter.verificationCounts();
        assertThat(verification.total()).isEqualTo(tv.getTotal());
        assertThat(verification.pending()).isEqualTo(tv.getPending());
        assertThat(verification.verified()).isEqualTo(tv.getVerified());
        assertThat(verification.rejected()).isEqualTo(tv.getRejected());

        DrawingStatsDTO drawing = drawingService.getStatistics();
        ApprovalCounts drawings = adapter.drawingCounts();
        assertThat(drawings.total()).isEqualTo(drawing.getTotal());
        assertThat(drawings.pending()).isEqualTo(drawing.getPending());
        assertThat(drawings.verified()).isEqualTo(drawing.getVerified());
        assertThat(drawings.rejected()).isEqualTo(drawing.getRejected());

        ModelStatsDTO model = modelService.getStatistics();
        ApprovalCounts models = adapter.modelCounts();
        assertThat(models.total()).isEqualTo(model.getTotal());
        assertThat(models.pending()).isEqualTo(model.getPending());
        assertThat(models.verified()).isEqualTo(model.getVerified());
        assertThat(models.rejected()).isEqualTo(model.getRejected());
    }

    @Test
    void shopFloorCountsMatchTheRepositoryCountersForEveryType() {
        assertShopFloorMatchesRepository("casting", "Casting");
        assertShopFloorMatchesRepository("fabrication", "Fabrication");
        assertShopFloorMatchesRepository("assembly", "Assembly");
    }

    @Test
    void seededShopFloorJobMovesOnlyItsOwnType() {
        ShopFloorCounts castingBefore = adapter.shopFloorCounts("casting");
        ShopFloorCounts fabricationBefore = adapter.shopFloorCounts("fabrication");
        ShopFloorCounts assemblyBefore = adapter.shopFloorCounts("assembly");

        ProductionOrder order = productionOrders.save(ProductionOrder.builder()
                .workOrder(unique("WO"))
                .product("Adapter equivalence product")
                .department("Adapter Equivalence")
                .status(OrderStatus.DRAFT)
                .priority(Priority.MEDIUM)
                .dueDate(LocalDate.now().plusDays(5))
                .startDate(LocalDate.now().minusDays(1))
                .quantity(5)
                .progress(0)
                .build());
        productionEntries.save(ProductionEntry.builder()
                .productionOrder(order)
                .productionType("Casting")
                .stage("Adapter equivalence stage")
                .inputQuantity(5)
                .outputQuantity(0)
                .rejectedQuantity(0)
                .status(EntryStatus.PENDING)
                .build());

        ShopFloorCounts castingAfter = adapter.shopFloorCounts("casting");
        ShopFloorCounts fabricationAfter = adapter.shopFloorCounts("fabrication");
        ShopFloorCounts assemblyAfter = adapter.shopFloorCounts("assembly");

        assertThat(castingAfter.total() - castingBefore.total()).isEqualTo(1);
        assertThat(castingAfter.pending() - castingBefore.pending()).isEqualTo(1);
        assertThat(fabricationAfter.total()).isEqualTo(fabricationBefore.total());
        assertThat(assemblyAfter.total()).isEqualTo(assemblyBefore.total());
    }

    @Test
    void packingAndDispatchCountsMatchTheirStatistics() {
        PackingStatsDTO packing = packingListService.getStatistics();
        PackingCounts packingCounts = adapter.packingCounts();
        assertThat(packingCounts.total()).isEqualTo(packing.getTotal());
        assertThat(packingCounts.pending()).isEqualTo(packing.getPending());
        assertThat(packingCounts.inProgress()).isEqualTo(packing.getInProgress());
        assertThat(packingCounts.completed()).isEqualTo(packing.getCompleted());
        assertThat(packingCounts.readyForDispatch()).isEqualTo(packing.getReadyForDispatch());

        DispatchStatsDTO dispatch = dispatchService.getStatistics();
        DispatchCounts dispatchCounts = adapter.dispatchCounts();
        assertThat(dispatchCounts.total()).isEqualTo(dispatch.getTotal());
        assertThat(dispatchCounts.ready()).isEqualTo(dispatch.getReady());
        assertThat(dispatchCounts.dispatched()).isEqualTo(dispatch.getDispatched());
        assertThat(dispatchCounts.inTransit()).isEqualTo(dispatch.getInTransit());
        assertThat(dispatchCounts.delivered()).isEqualTo(dispatch.getDelivered());
    }

    @Test
    void qualityTotalIsTheRepositoryRowCount() {
        assertThat(adapter.qualityTotal()).isEqualTo(qualityInspections.count());
        assertThat(adapter.qualityTotal()).isEqualTo(adapter.qualityCounts().total());
    }

    @Test
    void packingTotalIsTheRepositoryRowCount() {
        assertThat(adapter.packingTotal()).isEqualTo(packingLists.count());
        assertThat(adapter.packingTotal()).isEqualTo(adapter.packingCounts().total());
    }

    @Test
    void trackerStatsIsTheTrackerDocument() {
        assertThat(adapter.trackerStats()).isEqualTo(productionTrackerService.stats());
    }

    // ==================== Harness ====================

    private void assertShopFloorMatchesRepository(String typeKey, String displayName) {
        ShopFloorCounts counts = adapter.shopFloorCounts(typeKey);

        assertThat(counts.total()).isEqualTo(productionEntries.countByProductionType(displayName));
        assertThat(counts.pending()).isEqualTo(
                productionEntries.countByProductionTypeAndStatus(displayName, EntryStatus.PENDING));
        assertThat(counts.inProgress()).isEqualTo(
                productionEntries.countByProductionTypeAndStatus(displayName, EntryStatus.IN_PROGRESS));
        assertThat(counts.hold()).isEqualTo(
                productionEntries.countByProductionTypeAndStatus(displayName, EntryStatus.HOLD));
        assertThat(counts.completed()).isEqualTo(
                productionEntries.countByProductionTypeAndStatus(displayName, EntryStatus.COMPLETED));
    }

    private static long num(Map<String, Object> stats, String key) {
        Object value = stats.get(key);
        return value instanceof Number ? ((Number) value).longValue() : 0L;
    }

    private static synchronized String unique(String prefix) {
        return prefix + "-" + Long.toString(System.nanoTime(), 36);
    }
}
