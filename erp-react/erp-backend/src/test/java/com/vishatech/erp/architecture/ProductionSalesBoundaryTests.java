package com.vishatech.erp.architecture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.EvaluationResult;
import com.vishatech.erp.service.production.PublishedPortConsumerProbe;
import com.vishatech.erp.service.production.SalesBoundaryProbe;
import java.lang.reflect.Field;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * Non-vacuity, exactness and coverage guard for the Production → Sales boundary rule.
 *
 * <p>The rule {@code production_services_do_not_depend_on_sales_internals} has three ways
 * to pass <em>trivially</em>, and each one would look green in CI:
 *
 * <ol>
 *   <li>its <b>source</b> scope stops matching real classes — a renamed package, or a
 *       return to a name-prefix scope that misses {@code ModelService},
 *       {@code DrawingService}, {@code DispatchService}, {@code PackingListService} …;</li>
 *   <li>its <b>target</b> predicate stops classifying real Sales types (so nothing is
 *       ever detected), or becomes so broad that it flags neutral shared infrastructure
 *       and the published ports, forcing permanent exceptions;</li>
 *   <li>its <b>freeze</b> outlives the violations it described. P4 shipped this rule with
 *       three frozen offenders; P5/P6/P7 migrated all three, and the freeze was deleted.
 *       A deleted freeze has to be shown to be <em>unnecessary</em>, not merely absent.</li>
 * </ol>
 *
 * <p>All three are made visible here instead of green:
 *
 * <ul>
 *   <li>the scope and the predicate are asserted against the real codebase;</li>
 *   <li>two inert probe classes in {@code service.production} re-introduce the exact
 *       dependencies the freeze used to excuse (and, in the other probe, the exact
 *       contracts that are legal), so the rule is required to report the first and to
 *       leave the second alone — with no freeze in place;</li>
 *   <li>the real codebase is asserted to have <em>zero</em> Production → Sales internals
 *       edges, and the class is asserted to carry no allow-list field at all.</li>
 * </ul>
 */
class ProductionSalesBoundaryTests {

    /** The real codebase, test classes excluded. */
    private static final JavaClasses PROJECT_CLASSES = BoundaryFindings.PROJECT_CLASSES;

    /** The two inert probes, imported explicitly (they are test classes). */
    private static final JavaClasses PROBES = new ClassFileImporter()
            .importClasses(SalesBoundaryProbe.class, PublishedPortConsumerProbe.class);

    /** Only the legal-dependency probe: the rule must report nothing at all. */
    private static final JavaClasses PORT_CONSUMER_PROBE = new ClassFileImporter()
            .importClasses(PublishedPortConsumerProbe.class);

    private static final String OFFENDER_PROBE =
            "com.vishatech.erp.service.production.SalesBoundaryProbe";

    private static final String PORT_CONSUMER_PROBE_NAME =
            "com.vishatech.erp.service.production.PublishedPortConsumerProbe";

    // ------------------------------------------------------------------
    // 1. The source scope
    // ------------------------------------------------------------------

    /**
     * The source scope really is the production service surface — including the services a
     * {@code haveSimpleNameStartingWith("Production")} scope would miss.
     */
    @Test
    void theRuleScansRealProductionServicesIncludingOnesAPrefixScopeWouldMiss() {
        Set<String> productionServices = BoundaryFindings.namesOf(
                PROJECT_CLASSES.that(ModuleBoundaryTests.productionOwnedServices()));

        assertThat(productionServices).contains(
                // packaged production services
                "com.vishatech.erp.service.production.ProductionOrderService",
                "com.vishatech.erp.service.production.ProductionAttachmentService",
                "com.vishatech.erp.service.production.ProductionKpiService",
                "com.vishatech.erp.service.production.ProductionSettingsService",
                "com.vishatech.erp.service.production.ProductionReportService",
                "com.vishatech.erp.service.production.ProductionEntryService",
                // the prefix blind spot: none of these starts with "Production"
                "com.vishatech.erp.service.production.ModelService",
                "com.vishatech.erp.service.production.DrawingService",
                "com.vishatech.erp.service.production.DispatchService",
                "com.vishatech.erp.service.production.PackingListService",
                "com.vishatech.erp.service.production.TechnicalVerificationService",
                "com.vishatech.erp.service.production.CastingService",
                "com.vishatech.erp.service.production.AcknowledgementService",
                "com.vishatech.erp.service.production.AuditService",
                // §14.14 moved these two out of the flat layer into the package above
                "com.vishatech.erp.service.production.ProductionTrackerService",
                "com.vishatech.erp.service.production.QualityInspectionService");

        assertThat(productionServices).hasSizeGreaterThan(15);
        assertThat(ModuleBoundaryTests.productionOwnedServices()
                .test(BoundaryFindings.classNamed(
                        BoundaryFindings.classesByName(),
                        "com.vishatech.erp.service.production.ModelService")))
                .as("a Production-prefix scope would miss ModelService")
                .isTrue();
    }

    // ------------------------------------------------------------------
    // 2. The target predicate
    // ------------------------------------------------------------------

    /**
     * The target predicate classifies Sales-owned entities, repositories, DTOs, service
     * implementations and the flat sales document chains — and leaves neutral shared
     * infrastructure, production types, other modules' types and the published ports alone.
     */
    @Test
    void theTargetPredicateClassifiesSalesOwnedTypesAndNothingShared() {
        Map<String, JavaClass> byName = BoundaryFindings.classesByName();

        List<String> salesOwned = List.of(
                "com.vishatech.erp.entity.SalesOrder",
                "com.vishatech.erp.entity.SalesAttachment",
                "com.vishatech.erp.repository.SalesOrderRepository",
                "com.vishatech.erp.repository.SalesAttachmentRepository",
                "com.vishatech.erp.dto.SalesAttachmentResponse",
                "com.vishatech.erp.dto.SalesOrderResponse",
                "com.vishatech.erp.service.SalesOrderService",
                "com.vishatech.erp.service.SalesSettingsService",
                "com.vishatech.erp.sales.api.SalesDashboardReadAdapter",
                // the Sales implementations a Sales* name prefix used to miss
                "com.vishatech.erp.service.QuotationService",
                "com.vishatech.erp.service.InvoiceService",
                "com.vishatech.erp.service.DeliveryChallanService",
                "com.vishatech.erp.repository.PaymentReceiptRepository",
                "com.vishatech.erp.dto.CreditNoteResponse",
                "com.vishatech.erp.controller.QuotationController");

        List<String> notSalesOwned = List.of(
                // production's own types, including the packaged namespace
                "com.vishatech.erp.service.production.ProductionOrderService",
                "com.vishatech.erp.dto.production.ProductionStatsDTO",
                "com.vishatech.erp.entity.production.ProductionOrder",
                // neutral shared platform infrastructure
                "com.vishatech.erp.service.FileStorageService",
                "com.vishatech.erp.dto.ApiResponse",
                "com.vishatech.erp.util.AuditContext",
                "com.vishatech.erp.audit.AuditPort",
                "com.vishatech.erp.cad.CadConversionEngine",
                // other modules must not be caught by the Sales predicate
                "com.vishatech.erp.entity.PurchaseAttachment",
                "com.vishatech.erp.service.PurchaseSupportService",
                "com.vishatech.erp.crm.entity.Customer",
                "com.vishatech.erp.purchase.api.PurchaseRequisitionIngressPort",
                // the published Sales ports themselves
                "com.vishatech.erp.sales.api.AttachmentStorePort",
                "com.vishatech.erp.sales.api.SalesOrderLookupPort");

        assertThat(byName.keySet()).containsAll(salesOwned).containsAll(notSalesOwned);

        for (String name : salesOwned) {
            assertThat(ModuleBoundaryTests.salesOwnedInternals().test(byName.get(name)))
                    .as("%s must be classified as Sales-owned", name)
                    .isTrue();
        }
        for (String name : notSalesOwned) {
            assertThat(ModuleBoundaryTests.salesOwnedInternals().test(byName.get(name)))
                    .as("%s must NOT be classified as Sales-owned", name)
                    .isFalse();
        }
    }

    /**
     * The {@code *Port} exemption now does real work, and it is as narrow as it looks:
     * the two published Sales ports and the contracts nested inside them are exempt,
     * while the adapters that implement them — and every Sales entity, repository, DTO and
     * service — are not. This is what stops the exemption from hiding an implementation
     * dependency.
     */
    @Test
    void thePublishedPortExemptionCoversThePortsAndTheirNestedContractsOnly() {
        Map<String, JavaClass> byName = BoundaryFindings.classesByName();

        List<String> exempt = List.of(
                "com.vishatech.erp.sales.api.AttachmentStorePort",
                "com.vishatech.erp.sales.api.SalesOrderLookupPort",
                "com.vishatech.erp.sales.api.AttachmentStorePort$AttachmentRef",
                "com.vishatech.erp.sales.api.SalesOrderLookupPort$SalesOrderRef");

        List<String> stillInternals = List.of(
                "com.vishatech.erp.sales.api.SalesOrderLookupAdapter",
                "com.vishatech.erp.service.SalesAttachmentStoreAdapter",
                "com.vishatech.erp.service.SalesOrderService",
                "com.vishatech.erp.entity.SalesOrder",
                "com.vishatech.erp.repository.SalesOrderRepository",
                "com.vishatech.erp.dto.SalesOrderResponse");

        assertThat(byName.keySet()).containsAll(exempt).containsAll(stillInternals);

        for (String name : exempt) {
            assertThat(ModuleBoundaryTests.salesOwnedInternals().test(byName.get(name)))
                    .as("%s is a published contract and must be exempt", name)
                    .isFalse();
        }
        for (String name : stillInternals) {
            assertThat(ModuleBoundaryTests.salesOwnedInternals().test(byName.get(name)))
                    .as("%s is an implementation type and must stay internal", name)
                    .isTrue();
        }
    }

    // ------------------------------------------------------------------
    // 3. The rule still detects what the deleted freeze used to excuse
    // ------------------------------------------------------------------

    /**
     * The heart of the proof: with no freeze in place, the rule must report the probe that
     * re-introduces the frozen dependencies — and only it.
     */
    @Test
    void theRuleReportsReintroducedProductionToSalesDependencies() {
        EvaluationResult result = ModuleBoundaryTests
                .productionServicesDoNotDependOnSalesInternals()
                .evaluate(PROBES);

        assertThat(result.hasViolation())
                .as("the rule is vacuous: it reported nothing for the probe class that "
                        + "injects Sales persistence, entities, DTOs and services")
                .isTrue();

        assertThat(BoundaryFindings.origins(result))
                .as("the offending probe must be the only origin reported")
                .containsExactly(OFFENDER_PROBE);

        // Every kind of Sales internal the brief names must be reported - entities,
        // repositories, DTOs and service implementations, plus the document chains that are
        // Sales-owned without carrying a Sales* name. The reported *targets* are compared, not
        // the raw detail text, because a detail prints the offending member's full signature
        // (which also names the legal port the probe injects).
        Set<String> targets = new LinkedHashSet<>();
        for (String detail : BoundaryFindings.details(result)) {
            targets.add(BoundaryFindings.targetClassOf(detail));
        }

        assertThat(targets).contains(
                "com.vishatech.erp.repository.SalesOrderRepository",
                "com.vishatech.erp.repository.SalesAttachmentRepository",
                "com.vishatech.erp.entity.SalesOrder",
                "com.vishatech.erp.dto.SalesAttachmentResponse",
                "com.vishatech.erp.service.SalesOrderService",
                "com.vishatech.erp.service.QuotationService");

        // The Sales attachment entity is reported as a generic type argument
        // (List<SalesAttachment>), so it is asserted as a substring of a reported target
        // rather than as a target of its own.
        assertThat(targets).anySatisfy(target -> assertThat(target)
                .contains("com.vishatech.erp.entity.SalesAttachment"));

        assertThat(targets.stream().filter(target -> target.startsWith("com.vishatech.erp.sales.api")))
                .as("the published port the probe also injects must never be reported")
                .isEmpty();
    }

    /**
     * …and the legal probe passes on its own: the ports, the neutral contracts nested inside
     * them and shared platform types are not violations.
     */
    @Test
    void thePortConsumerProbeIsClean() {
        assertThatCode(() -> ModuleBoundaryTests
                .productionServicesDoNotDependOnSalesInternals()
                .check(PORT_CONSUMER_PROBE))
                .doesNotThrowAnyException();

        assertThat(BoundaryFindings.origins(ModuleBoundaryTests
                .productionServicesDoNotDependOnSalesInternals()
                .evaluate(PROBES)))
                .doesNotContain(PORT_CONSUMER_PROBE_NAME);
    }

    // ------------------------------------------------------------------
    // 4. The real codebase is clean, and the freeze is gone
    // ------------------------------------------------------------------

    /** The rule as it ships is green: the codebase has no Production → Sales internals edge. */
    @Test
    void theShippedRuleIsGreenOnTheRealCodebase() {
        assertThatCode(() -> ModuleBoundaryTests.production_services_do_not_depend_on_sales_internals
                .check(PROJECT_CLASSES))
                .doesNotThrowAnyException();

        assertThat(BoundaryFindings.origins(ModuleBoundaryTests
                .productionServicesDoNotDependOnSalesInternals()
                .evaluate(PROJECT_CLASSES)))
                .as("no Production -> Sales internals edge may remain")
                .isEmpty();
    }

    /**
     * The P4 freeze is not merely empty — it is gone. Re-adding an allow-list to this rule
     * would silently reverse the P5-P7 migrations, so its absence is asserted explicitly.
     */
    @Test
    void theP4FreezeHasBeenRemovedEntirely() {
        assertThat(Arrays.stream(ModuleBoundaryTests.class.getDeclaredFields()).map(Field::getName))
                .as("the Production -> Sales rule is enforced with no allow-list")
                .doesNotContain("PRODUCTION_TO_SALES_INTERNALS_ALLOWLIST");
    }
}
