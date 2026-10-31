package com.vishatech.erp.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.lang.EvaluationResult;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * Scope, exactness and classification guards for the three Production outbound boundaries
 * that P7 re-scoped:
 *
 * <ul>
 *   <li>{@code production_services_do_not_depend_on_flat_persistence} — its source scope
 *       used to be the {@code Production*} name prefix, which skipped every production
 *       service that is not named that way;</li>
 *   <li>{@code outside_does_not_depend_on_production_persistence} — its target used to be
 *       the packaged production persistence only, so the flat
 *       {@code ProductionTracker}/{@code QualityInspection} tables were invisible to it,
 *       and its source stopped at {@code service..}/{@code controller..}/{@code crm..}/
 *       {@code dashboard..};</li>
 *   <li>{@code production_does_not_depend_on_other_business_module_internals} — new, and
 *       enforced with no freeze because the codebase is measurably clean.</li>
 * </ul>
 *
 * <p>The one remaining frozen rule is evaluated through the very factory the shipped rule
 * uses, with an empty allow-list, and the origins it reports are required to be
 * <em>exactly</em> the frozen set. That single assertion proves non-vacuity (the rule
 * really reports today's offenders), that no offender hides behind the freeze, and that no
 * entry in the allow-list is dead weight. The outside → production rule — whose freeze
 * §14.13 deleted once its last two entries were migrated — is asserted to be clean with no
 * allow-list at all, and {@code ProductionPersistenceBoundaryTests} proves that the guard
 * still bites by re-introducing each former dependency with a probe.
 */
class ProductionBoundaryScopeTests {

    private static final String PRODUCTION_SERVICE_PACKAGE =
            "com.vishatech.erp.service.production.";

    private static Map<String, JavaClass> byName() {
        return BoundaryFindings.classesByName();
    }

    private static void assertClassified(String name, boolean expected, String what) {
        assertThat(ModuleBoundaryTests.productionOwnedServices().test(
                        BoundaryFindings.classNamed(byName(), name)))
                .as("%s %s", name, expected
                        ? "must be in the production service scope (" + what + ")"
                        : "must NOT be in the production service scope (" + what + ")")
                .isEqualTo(expected);
    }

    // ------------------------------------------------------------------
    // 1. The production service scope
    // ------------------------------------------------------------------

    /**
     * Every production-owned service is in scope, including the ones a name-prefix scope
     * would silently skip — the blind spot the P4 audit measured.
     */
    @Test
    void theProductionServiceScopeCoversEveryProductionOwnedService() {
        for (String service : List.of(
                "ModelService", "DrawingService", "DispatchService", "PackingListService",
                "TechnicalVerificationService", "CastingService", "AcknowledgementService",
                "AuditService", "ProductionOrderService", "ProductionAttachmentService",
                "ProductionKpiService", "ProductionReportService", "ProductionEntryService",
                "ProductionSettingsService")) {
            assertClassified(PRODUCTION_SERVICE_PACKAGE + service, true, "packaged");
        }
        // §14.14 moved both of these out of the flat layer; the scope is now purely
        // package-based, so they are in it for the same reason ModelService is.
        assertClassified("com.vishatech.erp.service.production.ProductionTrackerService", true,
                "packaged by §14.14");
        assertClassified("com.vishatech.erp.service.production.QualityInspectionService", true,
                "packaged by §14.14");

        Set<String> inScope = BoundaryFindings.namesOf(
                BoundaryFindings.PROJECT_CLASSES.that(ModuleBoundaryTests.productionOwnedServices()));
        assertThat(inScope).hasSizeGreaterThan(15);
    }

    /** …and nothing else is: shared code, other modules and production's own controllers. */
    @Test
    void theProductionServiceScopeStopsAtOtherModulesAndSharedCode() {
        assertClassified("com.vishatech.erp.service.FileStorageService", false, "shared");
        assertClassified("com.vishatech.erp.service.PdfGenerationService", false, "shared");
        assertClassified("com.vishatech.erp.service.MarketingVisitService", false, "marketing");
        assertClassified("com.vishatech.erp.cad.CadConversionEngine", false, "shared CAD engine");
        // production-owned, but a controller rather than a service
        assertClassified("com.vishatech.erp.controller.production.ProductionOrderController", false,
                "controller");
    }

    // ------------------------------------------------------------------
    // 2. Allow-lists are exactly the real offenders
    // ------------------------------------------------------------------

    @Test
    void theFlatPersistenceAllowlistIsExactlyWhatTheUnfrozenRuleReports() {
        EvaluationResult unfrozen = ModuleBoundaryTests
                .productionServicesDoNotDependOnFlatPersistence(Set.of())
                .evaluate(BoundaryFindings.PROJECT_CLASSES);

        assertThat(unfrozen.hasViolation())
                .as("the flat-persistence rule is vacuous: no production service reaches the "
                        + "flat persistence packages any more, so the allow-list should also be gone")
                .isTrue();

        assertThat(BoundaryFindings.origins(unfrozen))
                .as("the freeze must be exactly the set of real flat-persistence offenders")
                .isEqualTo(ModuleBoundaryTests.PRODUCTION_TO_FLAT_PERSISTENCE_ALLOWLIST);

        List<String> details = BoundaryFindings.details(unfrozen);
        assertThat(details).anySatisfy(d -> assertThat(d)
                .contains("com.vishatech.erp.repository.AppSettingRepository"));
        assertThat(details)
                .as("§14.14 moved the tracker and inspection persistence into "
                        + "repository.production / entity.production, so this rule — whose target "
                        + "is the FLAT packages — must not name them any more")
                .noneSatisfy(d -> assertThat(d).contains("QualityInspectionRepository"))
                .noneSatisfy(d -> assertThat(d).contains("ProductionTrackerRepository"))
                .noneSatisfy(d -> assertThat(d).contains("entity.QualityInspection"))
                .noneSatisfy(d -> assertThat(d).contains("entity.ProductionTracker"));
        assertThat(details)
                .as("the migrated Sales dependencies must be gone from this rule too")
                .noneSatisfy(d -> assertThat(d).contains("SalesOrderRepository"))
                .noneSatisfy(d -> assertThat(d).contains("SalesAttachmentRepository"))
                .noneSatisfy(d -> assertThat(d).contains("entity.SalesOrder"))
                .noneSatisfy(d -> assertThat(d).contains("entity.SalesAttachment"));
    }

    /**
     * The outside → production rule carries no freeze any more: its last two entries were
     * migrated onto published Production contracts by §14.13, so the rule is enforced
     * without an allow-list. That is a stronger claim than "the two former offenders are
     * excused", and {@code ProductionPersistenceBoundaryTests} supplies the other half of
     * the evidence — a probe that reintroduces each dependency must still be reported, and
     * {@code ModuleBoundaryTests} must carry no such field again.
     */
    @Test
    void theOutsideToProductionRuleIsEnforcedWithNoFreeze() {
        EvaluationResult result = ModuleBoundaryTests
                .outsideDoesNotDependOnProductionPersistence()
                .evaluate(BoundaryFindings.PROJECT_CLASSES);

        assertThat(result.hasViolation())
                .as("no code outside Production may read production persistence; offenders: %s",
                        BoundaryFindings.details(result))
                .isFalse();
    }

    // ------------------------------------------------------------------
    // 3. The re-scoped predicates classify the right things
    // ------------------------------------------------------------------

    /** Production ownership: the packaged namespaces plus the two flat workflows. */
    @Test
    void productionOwnershipClassification() {
        List<String> productionOwned = List.of(
                "com.vishatech.erp.service.production.ModelService",
                "com.vishatech.erp.controller.production.ProductionOrderController",
                "com.vishatech.erp.entity.production.ProductionOrder",
                "com.vishatech.erp.repository.production.ProductionOrderRepository",
                "com.vishatech.erp.dto.production.ProductionOrderDTO",
                "com.vishatech.erp.entity.production.ProductionTracker",
                "com.vishatech.erp.entity.production.QualityInspection",
                "com.vishatech.erp.repository.production.ProductionTrackerRepository",
                "com.vishatech.erp.repository.production.QualityInspectionRepository",
                "com.vishatech.erp.controller.production.ProductionTrackerController",
                "com.vishatech.erp.controller.production.QualityInspectionController",
                "com.vishatech.erp.service.production.QualityInspectionService",
                "com.vishatech.erp.service.production.ProductionTrackerService");

        List<String> notProductionOwned = List.of(
                // dashboard-owned types that merely carry a production-sounding name
                "com.vishatech.erp.dashboard.dto.ProductionOrderCounts",
                "com.vishatech.erp.dashboard.port.ProductionDashboardPort",
                // shared platform and other modules
                "com.vishatech.erp.service.FileStorageService",
                "com.vishatech.erp.service.PdfGenerationService",
                "com.vishatech.erp.cad.CadConversionEngine",
                "com.vishatech.erp.purchase.api.PurchaseRequisitionIngressPort",
                "com.vishatech.erp.crm.entity.Customer");

        for (String name : productionOwned) {
            assertThat(ModuleBoundaryTests.productionOwnedTypes()
                    .test(BoundaryFindings.classNamed(byName(), name)))
                    .as("%s must be Production-owned", name)
                    .isTrue();
        }
        for (String name : notProductionOwned) {
            assertThat(ModuleBoundaryTests.productionOwnedTypes()
                    .test(BoundaryFindings.classNamed(byName(), name)))
                    .as("%s must NOT be Production-owned", name)
                    .isFalse();
        }
    }

    /** Production persistence: the packaged tables plus the four flat ones. */
    @Test
    void productionPersistenceClassification() {
        for (String name : List.of(
                "com.vishatech.erp.repository.production.ProductionOrderRepository",
                "com.vishatech.erp.entity.production.Model",
                "com.vishatech.erp.entity.production.ProductionTracker",
                "com.vishatech.erp.entity.production.QualityInspection",
                "com.vishatech.erp.repository.production.ProductionTrackerRepository",
                "com.vishatech.erp.repository.production.QualityInspectionRepository")) {
            assertThat(ModuleBoundaryTests.productionOwnedPersistence()
                    .test(BoundaryFindings.classNamed(byName(), name)))
                    .as("%s is production-owned persistence", name)
                    .isTrue();
        }

        for (String name : List.of(
                // a production DTO / controller / service is not persistence
                "com.vishatech.erp.dto.production.ProductionOrderDTO",
                "com.vishatech.erp.controller.production.ProductionOrderController",
                "com.vishatech.erp.service.production.ProductionOrderService",
                // nor is another module's persistence, or a dashboard type
                "com.vishatech.erp.entity.SalesOrder",
                "com.vishatech.erp.repository.SalesOrderRepository",
                "com.vishatech.erp.dashboard.dto.ProductionOrderCounts",
                "com.vishatech.erp.entity.AppSetting")) {
            assertThat(ModuleBoundaryTests.productionOwnedPersistence()
                    .test(BoundaryFindings.classNamed(byName(), name)))
                    .as("%s is not production-owned persistence", name)
                    .isFalse();
        }
    }

    /**
     * The new outbound rule's target: another module's internals — and never production's
     * own types, shared infrastructure or the Sales contracts (which have their own rule).
     */
    @Test
    void otherBusinessModuleInternalsClassification() {
        for (String name : List.of(
                "com.vishatech.erp.crm.entity.Customer",
                "com.vishatech.erp.crm.repository.CustomerRepository",
                "com.vishatech.erp.crm.entity.Lead",
                "com.vishatech.erp.crm.service.CustomerService",
                "com.vishatech.erp.service.PurchaseSupportService",
                "com.vishatech.erp.service.PurchaseRequisitionService",
                "com.vishatech.erp.service.CprTechnicalVerificationService",
                "com.vishatech.erp.service.MarketingVisitService",
                "com.vishatech.erp.service.CostWorkoutService",
                "com.vishatech.erp.service.ProfitWorkoutService")) {
            assertThat(ModuleBoundaryTests.otherBusinessModuleInternals()
                    .test(BoundaryFindings.classNamed(byName(), name)))
                    .as("%s is another business module's internals", name)
                    .isTrue();
        }

        for (String name : List.of(
                // production's own types must never be a target of production's own rule
                "com.vishatech.erp.service.production.ModelService",
                "com.vishatech.erp.service.production.ProductionTrackerService",
                "com.vishatech.erp.entity.production.ProductionTracker",
                "com.vishatech.erp.entity.production.Model",
                // Sales keeps its own, more precise rule
                "com.vishatech.erp.entity.SalesOrder",
                "com.vishatech.erp.service.SalesOrderService",
                "com.vishatech.erp.sales.api.SalesOrderLookupPort",
                // the shared platform is not a business module
                "com.vishatech.erp.audit.AuditPort",
                "com.vishatech.erp.util.AuditContext",
                "com.vishatech.erp.dto.ApiResponse",
                "com.vishatech.erp.exception.BadRequestException",
                "com.vishatech.erp.dashboard.port.ProductionDashboardPort",
                "com.vishatech.erp.cad.CadConversionEngine",
                "com.vishatech.erp.entity.AppSetting",
                "com.vishatech.erp.repository.AppSettingRepository",
                // Purchase's published ingress port is the legal surface, not an internal
                "com.vishatech.erp.purchase.api.PurchaseRequisitionIngressPort")) {
            assertThat(ModuleBoundaryTests.otherBusinessModuleInternals()
                    .test(BoundaryFindings.classNamed(byName(), name)))
                    .as("%s must NOT be classified as another module's internals", name)
                    .isFalse();
        }
    }

    /**
     * The new rule is enforced and clean: any violation would fail here with the offending
     * edge named, instead of being hidden behind a freeze.
     */
    @Test
    void productionDependsOnNoOtherBusinessModuleInternals() {
        EvaluationResult result = ModuleBoundaryTests
                .productionDoesNotDependOnOtherBusinessModuleInternals()
                .evaluate(BoundaryFindings.PROJECT_CLASSES);

        assertThat(result.hasViolation())
                .as("Production must reach other business modules through published ports "
                        + "only; offenders: %s", BoundaryFindings.details(result))
                .isFalse();
    }
}
