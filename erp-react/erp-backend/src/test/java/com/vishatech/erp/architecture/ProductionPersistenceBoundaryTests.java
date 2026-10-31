package com.vishatech.erp.architecture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.EvaluationResult;
import com.vishatech.erp.service.ContractConsumerProbe;
import com.vishatech.erp.service.PdfProductionRegressionProbe;
import com.vishatech.erp.service.cad.CadJobProductionRegressionProbe;
import java.lang.reflect.Field;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Evidence for §14.13: the last two entries of
 * {@code outside_does_not_depend_on_production_persistence} were migrated, and the
 * freeze was deleted rather than left empty.
 *
 * <p>The two classes the rule used to excuse read production persistence directly:
 * {@code service.PdfGenerationService} read the tracker, inspection and packing-list
 * tables to print their documents, and {@code service.cad.CadConversionJobService}
 * read — and wrote — the production model behind every conversion job. Both now reach
 * the module through published contracts
 * ({@code production.api.ProductionDocumentPort} and
 * {@code production.api.ModelConversionJobPort}), implemented by two production-owned
 * adapters.
 *
 * <p>Deleting a freeze is only defensible with evidence, so this class supplies it,
 * the same way {@code CadProductionBoundaryTests} did for the two CAD entries before
 * it:
 *
 * <ol>
 *   <li><b>Mediation, measured per class.</b> Neither former offender has a direct
 *       dependency on production persistence any more, and each depends on the contract
 *       that replaced it — a bytecode reading, not a claim about intent.</li>
 *   <li><b>The rule is enforced with no allow-list.</b> The real codebase produces no
 *       violation at all, and {@code ModuleBoundaryTests} no longer declares the field
 *       (asserted by reflection, so re-adding a freeze fails here).</li>
 *   <li><b>Regression is caught, not hoped for.</b> Two inert probes reintroduce each
 *       former dependency and must be reported, with the concrete targets named; a
 *       third probe consumes only the published contracts and must pass.</li>
 *   <li><b>The new contracts are legal.</b> They are production-owned published surface
 *       — never production persistence, never "outside" production — and the two
 *       adapters are inside the module's own service scope with no new flat edge beyond
 *       the one the flat-persistence freeze records.</li>
 * </ol>
 */
class ProductionPersistenceBoundaryTests {

    /** The real codebase, test classes excluded. */
    private static final JavaClasses PROJECT_CLASSES = BoundaryFindings.PROJECT_CLASSES;

    private static final String PDF_OFFENDER = "com.vishatech.erp.service.PdfGenerationService";
    private static final String CAD_JOB_OFFENDER = "com.vishatech.erp.service.cad.CadConversionJobService";

    private static final String PDF_PROBE = "com.vishatech.erp.service.PdfProductionRegressionProbe";
    private static final String CAD_PROBE = "com.vishatech.erp.service.cad.CadJobProductionRegressionProbe";
    private static final String CONSUMER_PROBE = "com.vishatech.erp.service.ContractConsumerProbe";

    private static final String DOCUMENT_PORT = "com.vishatech.erp.production.api.ProductionDocumentPort";
    private static final String JOB_PORT = "com.vishatech.erp.production.api.ModelConversionJobPort";
    private static final String JOB_FACTS = JOB_PORT + "$ModelFacts";
    private static final String OUTCOME =
            "com.vishatech.erp.production.api.ModelConversionProjectionPort$ConversionOutcome";
    private static final String DOCUMENT_VIEW = "com.vishatech.erp.pdf.DocumentView";

    private static final String DOCUMENT_ADAPTER =
            "com.vishatech.erp.service.production.ProductionDocumentService";
    private static final String JOB_ADAPTER =
            "com.vishatech.erp.service.production.ModelConversionJobAdapter";

    /** The two offender probes, imported explicitly (they are test classes). */
    private static final JavaClasses PROBES = new ClassFileImporter()
            .importClasses(PdfProductionRegressionProbe.class, CadJobProductionRegressionProbe.class);

    /** Only the legal-dependency probe: the rule must report nothing at all for it. */
    private static final JavaClasses CONSUMER_PROBE_CLASSES = new ClassFileImporter()
            .importClasses(ContractConsumerProbe.class);

    /** Resolves a class by name, failing loudly when it was renamed or moved. */
    private static JavaClass classOf(String name) {
        return BoundaryFindings.classNamed(BoundaryFindings.classesByName(), name);
    }

    /** Resolves a probe (a test class, so not part of the project import) by name. */
    private static JavaClass probeClassOf(JavaClasses classes, String name) {
        return classes.stream()
                .filter(javaClass -> javaClass.getName().equals(name))
                .findFirst()
                .orElseThrow(() -> new AssertionError("probe class not found: " + name));
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

    /** Every direct bytecode dependency of a class, by fully qualified name. */
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
        assertThat(productionPersistenceDependencies(PDF_OFFENDER))
                .as("the documents must come from the module, not from its tables")
                .isEmpty();
        assertThat(productionPersistenceDependencies(CAD_JOB_OFFENDER))
                .as("the job pipeline must not touch the model entity or its repository")
                .isEmpty();
    }

    @Test
    void theDocumentBuilderDependsOnThePublishedContractThatReplacedTheRepositories() {
        assertThat(directDependencies(PDF_OFFENDER))
                .as("the three production documents must be consumed through the published port")
                .contains(DOCUMENT_PORT, DOCUMENT_VIEW)
                .as("and must not name a production repository or entity any more")
                .doesNotContain(
                        "com.vishatech.erp.repository.production.ProductionTrackerRepository",
                        "com.vishatech.erp.repository.production.QualityInspectionRepository",
                        "com.vishatech.erp.repository.production.PackingListRepository",
                        "com.vishatech.erp.entity.production.ProductionTracker",
                        "com.vishatech.erp.entity.production.QualityInspection",
                        "com.vishatech.erp.entity.production.PackingList");
    }

    @Test
    void theJobPipelineDependsOnThePublishedContractThatReplacedTheModelRepository() {
        assertThat(directDependencies(CAD_JOB_OFFENDER))
                .as("model facts and outcomes must travel through the published port")
                .contains(JOB_PORT, JOB_FACTS, OUTCOME)
                .as("and the CAD mapper must stay the single source of the state mapping")
                .contains("com.vishatech.erp.cad.CadModelProjection")
                .as("while the model, its repository and its status vocabulary are gone")
                .doesNotContain(
                        "com.vishatech.erp.repository.production.ModelRepository",
                        "com.vishatech.erp.entity.production.Model",
                        "com.vishatech.erp.entity.production.ModelConversionStatus");
    }

    // ------------------------------------------------------------------
    // 2. The freeze is gone, and the guard still bites
    // ------------------------------------------------------------------

    @Test
    void theRuleIsEnforcedWithNoFreezeAtAll() {
        assertThatCode(() -> ModuleBoundaryTests.outsideDoesNotDependOnProductionPersistence()
                .check(PROJECT_CLASSES))
                .doesNotThrowAnyException();

        assertThat(Arrays.stream(ModuleBoundaryTests.class.getDeclaredFields()).map(Field::getName))
                .as("re-adding an allow-list to this rule would silently reverse this migration")
                .doesNotContain("OUTSIDE_TO_PRODUCTION_PERSISTENCE_ALLOWLIST");
    }

    @Test
    void reintroducingEitherMigratedDependencyIsReportedByTheRule() {
        EvaluationResult result = ModuleBoundaryTests.outsideDoesNotDependOnProductionPersistence()
                .evaluate(PROBES);

        assertThat(BoundaryFindings.origins(result))
                .as("a non-production class reading production persistence must be reported")
                .containsExactlyInAnyOrder(PDF_PROBE, CAD_PROBE);

        List<String> targets = BoundaryFindings.details(result).stream()
                .map(BoundaryFindings::targetClassOf)
                .distinct()
                .toList();

        assertThat(targets)
                .as("the failure detail must name the concrete table or type that was reached")
                .anySatisfy(target -> assertThat(target)
                        .contains("com.vishatech.erp.repository.production.ProductionTrackerRepository"))
                .anySatisfy(target -> assertThat(target)
                        .contains("com.vishatech.erp.repository.production.QualityInspectionRepository"))
                .anySatisfy(target -> assertThat(target)
                        .contains("com.vishatech.erp.repository.production.PackingListRepository"))
                .anySatisfy(target -> assertThat(target)
                        .contains("com.vishatech.erp.entity.production.ProductionTracker"))
                .anySatisfy(target -> assertThat(target)
                        .contains("com.vishatech.erp.repository.production.ModelRepository"))
                .anySatisfy(target -> assertThat(target)
                        .contains("com.vishatech.erp.entity.production.Model"))
                .anySatisfy(target -> assertThat(target)
                        .contains("com.vishatech.erp.entity.production.ModelConversionStatus"));
    }

    @Test
    void theContractConsumerProbeIsCleanWithNoFreezeInPlace() {
        assertThat(ModuleBoundaryTests.outsideProductionOwnership()
                        .test(probeClassOf(CONSUMER_PROBE_CLASSES, CONSUMER_PROBE)))
                .as("the consumer probe must be in the rule's source scope, or its clean pass proves nothing")
                .isTrue();

        assertThatCode(() -> ModuleBoundaryTests.outsideDoesNotDependOnProductionPersistence()
                .check(CONSUMER_PROBE_CLASSES))
                .doesNotThrowAnyException();

        assertThat(BoundaryFindings.origins(ModuleBoundaryTests
                .outsideDoesNotDependOnProductionPersistence()
                .evaluate(CONSUMER_PROBE_CLASSES)))
                .doesNotContain(CONSUMER_PROBE);
    }

    // ------------------------------------------------------------------
    // 3. The contracts and adapters that replaced the reads
    // ------------------------------------------------------------------

    @Test
    void theReplacementContractsAreNeutralProductionOwnedSurface() {
        for (String contract : List.of(DOCUMENT_PORT, JOB_PORT, JOB_FACTS, OUTCOME, DOCUMENT_VIEW)) {
            assertThat(productionPersistenceDependencies(contract))
                    .as("%s must not name production persistence", contract)
                    .isEmpty();
            assertThat(ModuleBoundaryTests.productionOwnedPersistence().test(classOf(contract)))
                    .as("%s is a contract, not persistence", contract)
                    .isFalse();
        }

        for (String contract : List.of(DOCUMENT_PORT, JOB_PORT, JOB_FACTS, OUTCOME)) {
            assertThat(ModuleBoundaryTests.productionOwnedTypes().test(classOf(contract)))
                    .as("%s is the module's published surface", contract)
                    .isTrue();
            assertThat(ModuleBoundaryTests.outsideProductionOwnership().test(classOf(contract)))
                    .as("a production-published contract is never outside production", contract)
                    .isFalse();
        }

        assertThat(ModuleBoundaryTests.productionOwnedTypes().test(classOf(DOCUMENT_VIEW)))
                .as("the document view is shared reporting infrastructure, not production-owned")
                .isFalse();
        assertThat(ModuleBoundaryTests.outsideProductionOwnership().test(classOf(DOCUMENT_VIEW)))
                .as("nor is it production, so no rule may excuse it from reading production tables")
                .isTrue();
    }

    @Test
    void theDocumentReaderAddsNoFlatPersistenceEdgeAndLeftTheAllowlist() {
        assertThat(ModuleBoundaryTests.productionOwnedServices().test(classOf(DOCUMENT_ADAPTER)))
                .as("the reader must sit in the module's own service scope, where all three "
                        + "outbound guards see it")
                .isTrue();
        assertThat(classOf(DOCUMENT_ADAPTER).isAssignableTo(DOCUMENT_PORT))
                .as("and it must be the implementation of the published contract")
                .isTrue();

        assertThat(productionPersistenceDependencies(DOCUMENT_ADAPTER))
                .as("its edges are the module's own tables, and §14.14 moved the tracker and "
                        + "inspection tables into the module's packages, so every one of them "
                        + "is now packaged")
                .contains(
                        "com.vishatech.erp.repository.production.ProductionTrackerRepository",
                        "com.vishatech.erp.repository.production.QualityInspectionRepository",
                        "com.vishatech.erp.repository.production.PackingListRepository",
                        "com.vishatech.erp.entity.production.ProductionTracker",
                        "com.vishatech.erp.entity.production.QualityInspection",
                        "com.vishatech.erp.entity.production.PackingList")
                .allSatisfy(edge -> assertThat(edge)
                        .matches("com\\.vishatech\\.erp\\.(entity|repository)\\.production\\..*"));

        assertThat(ModuleBoundaryTests.PRODUCTION_TO_FLAT_PERSISTENCE_ALLOWLIST)
                .as("§14.14 removed this class from the flat-persistence freeze by moving the "
                        + "tables, not by keeping the exception")
                .doesNotContain(DOCUMENT_ADAPTER);
    }

    @Test
    void theJobAdapterAddsNoFlatPersistenceEdge() {
        assertThat(classOf(JOB_ADAPTER).isAssignableTo(JOB_PORT))
                .as("it must be the implementation of the published contract")
                .isTrue();
        assertThat(ModuleBoundaryTests.productionOwnedServices().test(classOf(JOB_ADAPTER)))
                .as("and it must sit in the module's own service scope")
                .isTrue();

        List<String> edges = productionPersistenceDependencies(JOB_ADAPTER);
        assertThat(edges)
                .as("the model lives in repository.production, so the CAD pipeline needed no "
                        + "additional flat-persistence entry")
                .contains("com.vishatech.erp.repository.production.ModelRepository")
                .allSatisfy(edge -> assertThat(edge)
                        .matches("com\\.vishatech\\.erp\\.(entity|repository)\\.production\\..*"));
    }
}
