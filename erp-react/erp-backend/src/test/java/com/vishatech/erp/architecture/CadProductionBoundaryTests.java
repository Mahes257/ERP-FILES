package com.vishatech.erp.architecture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.EvaluationResult;
import com.vishatech.erp.cad.CadProjectionPortConsumerProbe;
import com.vishatech.erp.cad.CadProductionRegressionProbe;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * Non-vacuity and mediation guard for the two CAD-engine → Production couplings that
 * {@code outside_does_not_depend_on_production_persistence} used to freeze.
 *
 * <p>The shared CAD engine reached into Production persistence in exactly two classes:
 * {@code cad.CadModelProjection} projected {@code entity.production.Model} (and wrote the
 * {@code ModelConversionStatus} vocabulary into its columns), and
 * {@code cad.ConversionProviderRegistry} consulted
 * {@code ModelConversionStatus.isBrowserNative/isRecognisedStoredOnly}. Both were migrated
 * — the projection onto the published {@code production.api.ModelConversionProjectionPort}
 * the model entity implements, the classification onto the CAD-owned
 * {@code cad.CadFileTypes} — and both allow-list entries were deleted.
 *
 * <p>Deleting a freeze is only defensible with evidence, so this class supplies it:
 *
 * <ol>
 *   <li><b>Mediation, measured per class.</b> Neither former offender has a direct
 *       dependency on production persistence any more, and each depends on the contract
 *       that replaced it ({@code ModelConversionProjectionPort} /
 *       {@code CadModelProjection}, {@code CadFileTypes}) — a bytecode reading, not a
 *       claim about intent.</li>
 *   <li><b>The whole engine is clean.</b> The unfrozen rule reports no {@code cad}
 *       origin at all — so the two entries were removed because the edges are gone, not
 *       because the rule stopped looking.</li>
 *   <li><b>The contract is legal and neutral.</b> The published port and its nested
 *       outcome carry no production persistence dependency and are recognised as
 *       Production-owned published surface, exactly like {@code sales.api}.</li>
 *   <li><b>Regression is caught, not hoped for.</b> An inert probe in the {@code cad}
 *       package re-introduces the projection and the classification dependencies, and the
 *       rule must report it; a second probe that consumes only the published contract and
 *       the CAD-owned catalogue must pass with no freeze in place.</li>
 * </ol>
 */
class CadProductionBoundaryTests {

    /** The real codebase, test classes excluded. */
    private static final JavaClasses PROJECT_CLASSES = BoundaryFindings.PROJECT_CLASSES;

    /** The two inert probes, imported explicitly (they are test classes). */
    private static final JavaClasses PROBES = new ClassFileImporter()
            .importClasses(CadProductionRegressionProbe.class, CadProjectionPortConsumerProbe.class);

    /** Only the legal-dependency probe: the rule must report nothing at all. */
    private static final JavaClasses PORT_CONSUMER_PROBE = new ClassFileImporter()
            .importClasses(CadProjectionPortConsumerProbe.class);

    private static final String OFFENDER_PROBE =
            "com.vishatech.erp.cad.CadProductionRegressionProbe";

    private static final String PORT_CONSUMER_PROBE_NAME =
            "com.vishatech.erp.cad.CadProjectionPortConsumerProbe";

    private static final String MODEL_PROJECTION = "com.vishatech.erp.cad.CadModelProjection";
    private static final String PROVIDER_REGISTRY = "com.vishatech.erp.cad.ConversionProviderRegistry";

    private static JavaClass classOf(String name) {
        return BoundaryFindings.classNamed(BoundaryFindings.classesByName(), name);
    }

    /** Direct bytecode dependencies of a class that are production-owned persistence. */
    private static List<String> productionPersistenceDependencies(String className) {
        return classOf(className).getDirectDependenciesFromSelf().stream()
                .map(dependency -> dependency.getTargetClass())
                .filter(ModuleBoundaryTests.productionOwnedPersistence()::test)
                .map(JavaClass::getName)
                .distinct()
                .sorted()
                .toList();
    }

    /** Direct bytecode dependencies of a class, by simple name of the target's package owner. */
    private static List<String> directDependencies(String className) {
        return classOf(className).getDirectDependenciesFromSelf().stream()
                .map(dependency -> dependency.getTargetClass().getName())
                .distinct()
                .sorted()
                .toList();
    }

    // ------------------------------------------------------------------
    // 1. The two former offenders are mediated, not merely excused
    // ------------------------------------------------------------------

    @Test
    void neitherFormerOffenderDependsOnProductionPersistenceAnyMore() {
        assertThat(productionPersistenceDependencies(MODEL_PROJECTION))
                .as("the projection must go through the published port, not the model entity")
                .isEmpty();
        assertThat(productionPersistenceDependencies(PROVIDER_REGISTRY))
                .as("the format classification must come from the CAD-owned catalogue")
                .isEmpty();
    }

    @Test
    void theProjectionDependsOnThePublishedContractThatReplacedTheEntity() {
        assertThat(directDependencies(MODEL_PROJECTION))
                .as("the mapper must target the published contract")
                .contains("com.vishatech.erp.production.api.ModelConversionProjectionPort")
                .contains("com.vishatech.erp.production.api.ModelConversionProjectionPort$ConversionOutcome")
                .as("and must not name a production entity type any more")
                .doesNotContain(
                        "com.vishatech.erp.entity.production.Model",
                        "com.vishatech.erp.entity.production.ModelConversionStatus");
    }

    @Test
    void theRegistryTakesItsFormatKnowledgeFromTheCadOwnedCatalogue() {
        assertThat(directDependencies(PROVIDER_REGISTRY))
                .as("capability classification belongs to the engine that implements it")
                .contains("com.vishatech.erp.cad.CadFileTypes")
                .doesNotContain("com.vishatech.erp.entity.production.ModelConversionStatus");
    }

    /** No class of the shared CAD engine reads production persistence any more. */
    @Test
    void theWholeCadEngineHasNoProductionPersistenceEdge() {
        EvaluationResult unfrozen = ModuleBoundaryTests
                .outsideDoesNotDependOnProductionPersistence()
                .evaluate(PROJECT_CLASSES);

        assertThat(BoundaryFindings.origins(unfrozen).stream()
                .filter(origin -> origin.startsWith("com.vishatech.erp.cad."))
                .toList())
                .as("the engine's entries were deleted because the edges are gone; offenders: %s",
                        BoundaryFindings.details(unfrozen))
                .isEmpty();
    }

    // ------------------------------------------------------------------
    // 2. The contract that replaced them is legal and neutral
    // ------------------------------------------------------------------

    @Test
    void thePublishedContractCarriesNoProductionPersistenceAndIsProductionOwned() {
        String port = "com.vishatech.erp.production.api.ModelConversionProjectionPort";
        String outcome = port + "$ConversionOutcome";

        assertThat(productionPersistenceDependencies(port))
                .as("the contract other modules depend on must not name production persistence")
                .isEmpty();
        assertThat(productionPersistenceDependencies(outcome))
                .as("neither may its outcome value type")
                .isEmpty();

        Map<String, JavaClass> byName = BoundaryFindings.classesByName();
        assertThat(ModuleBoundaryTests.productionOwnedTypes().test(
                        BoundaryFindings.classNamed(byName, port)))
                .as("the module's published surface is production-owned, like sales.api")
                .isTrue();
        assertThat(ModuleBoundaryTests.productionOwnedPersistence().test(
                        BoundaryFindings.classNamed(byName, port)))
                .as("but it is a contract, not production persistence")
                .isFalse();
        assertThat(ModuleBoundaryTests.outsideProductionOwnership().test(
                        BoundaryFindings.classNamed(byName, port)))
                .as("a production-published contract is never \"outside\" production")
                .isFalse();
    }

    @Test
    void theCadOwnedFormatCatalogueIsNotProductionOwned() {
        String catalogue = "com.vishatech.erp.cad.CadFileTypes";

        assertThat(productionPersistenceDependencies(catalogue))
                .as("format capability knowledge must not reach into production persistence")
                .isEmpty();
        assertThat(ModuleBoundaryTests.productionOwnedPersistence().test(classOf(catalogue)))
                .as("nor is it production persistence")
                .isFalse();
    }

    // ------------------------------------------------------------------
    // 3. Regression is reported, and the legal shape is not
    // ------------------------------------------------------------------

    @Test
    void reintroducingEitherDependencyIsReportedByTheRule() {
        EvaluationResult unfrozen = ModuleBoundaryTests
                .outsideDoesNotDependOnProductionPersistence()
                .evaluate(PROBES);

        assertThat(BoundaryFindings.origins(unfrozen))
                .as("a cad class reaching into production persistence must be reported")
                .contains(OFFENDER_PROBE);

        // A detail names the target *member*, so the class is asserted as a prefix: the
        // probe must be reported for the model entity, the model repository and the
        // production status type it reaches for.
        List<String> targets = BoundaryFindings.details(unfrozen).stream()
                .filter(detail -> detail.contains(OFFENDER_PROBE))
                .map(BoundaryFindings::targetClassOf)
                .distinct()
                .toList();

        assertThat(targets)
                .anySatisfy(target -> assertThat(target)
                        .contains("com.vishatech.erp.entity.production.Model"))
                .anySatisfy(target -> assertThat(target)
                        .contains("com.vishatech.erp.entity.production.ModelConversionStatus"))
                .anySatisfy(target -> assertThat(target)
                        .contains("com.vishatech.erp.repository.production.ModelRepository"));
    }

    @Test
    void theContractConsumerProbeIsCleanWithNoFreezeInPlace() {
        assertThatCode(() -> ModuleBoundaryTests
                .outsideDoesNotDependOnProductionPersistence()
                .check(PORT_CONSUMER_PROBE))
                .doesNotThrowAnyException();

        assertThat(BoundaryFindings.origins(ModuleBoundaryTests
                .outsideDoesNotDependOnProductionPersistence()
                .evaluate(PROBES)))
                .doesNotContain(PORT_CONSUMER_PROBE_NAME);
    }

    // ------------------------------------------------------------------
    // 4. The remaining freeze is exactly the real offender set
    // ------------------------------------------------------------------

    /**
     * The two CAD entries were the first of the rule's four to go, and the last two
     * followed in §14.13 — so there is no freeze left to compare against. What remains
     * to assert here is that the real codebase still contributes nothing.
     */
    @Test
    void theCadEntriesAreGoneAndTheRuleReportsNothing() {
        EvaluationResult result = ModuleBoundaryTests
                .outsideDoesNotDependOnProductionPersistence()
                .evaluate(PROJECT_CLASSES);

        assertThat(BoundaryFindings.origins(result))
                .as("no class outside Production may read production persistence; offenders: %s",
                        BoundaryFindings.details(result))
                .isEmpty();
    }
}
