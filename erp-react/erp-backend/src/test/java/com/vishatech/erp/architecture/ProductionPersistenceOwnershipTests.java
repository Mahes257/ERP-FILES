package com.vishatech.erp.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClass;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.lang.reflect.Field;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Evidence for §14.14: the last flat production-owned persistence moved into the
 * Production module, and nothing else did.
 *
 * <p>The migration moved eight classes — the tracker and quality-inspection entity,
 * repository, service and controller — and the rules above it are only honest if three
 * separate things hold, each measured here rather than asserted in prose:
 *
 * <ol>
 *   <li><b>The moved classes are where the module's other twenty-odd workflows are</b>,
 *       and the classification predicates agree (production-owned persistence, production
 *       services, production types — never "outside").</li>
 *   <li><b>The flat layer is empty of production workflows</b>: no class in
 *       {@code entity}/{@code repository}/{@code service}/{@code controller}/{@code dto}
 *       is named like one any more. That is what lets ownership be expressed by package
 *       instead of by a class-name list.</li>
 *   <li><b>A package move changed no mapping</b>: the table names, the {@code sales_order_id}
 *       column, the {@code production_order_id} column and the MySQL {@code JSON} column
 *       declarations are the ones the entities declared before the move, every table name
 *       is still mapped exactly once, and each repository still targets the entity it
 *       targeted before.</li>
 * </ol>
 *
 * <p>It also pins the one ownership decision the task asked to be <em>decided</em> rather
 * than assumed: {@code CprTechnicalVerification}, its document entity and
 * {@code TechnicalVerificationStatus} belong to the CPR workflow, not to Production, and
 * moving them "because the names look production-ish" would immediately re-create the
 * cross-module dependency this suite exists to prevent.
 */
class ProductionPersistenceOwnershipTests {

    private static final String TRACKER_ENTITY = "com.vishatech.erp.entity.production.ProductionTracker";
    private static final String INSPECTION_ENTITY = "com.vishatech.erp.entity.production.QualityInspection";
    private static final String TRACKER_REPOSITORY =
            "com.vishatech.erp.repository.production.ProductionTrackerRepository";
    private static final String INSPECTION_REPOSITORY =
            "com.vishatech.erp.repository.production.QualityInspectionRepository";
    private static final String TRACKER_SERVICE =
            "com.vishatech.erp.service.production.ProductionTrackerService";
    private static final String INSPECTION_SERVICE =
            "com.vishatech.erp.service.production.QualityInspectionService";
    private static final String TRACKER_CONTROLLER =
            "com.vishatech.erp.controller.production.ProductionTrackerController";
    private static final String INSPECTION_CONTROLLER =
            "com.vishatech.erp.controller.production.QualityInspectionController";

    /** The flat layer packages a production workflow must not live in any more. */
    private static final List<String> FLAT_LAYER_PACKAGES = List.of(
            "com.vishatech.erp.entity",
            "com.vishatech.erp.repository",
            "com.vishatech.erp.service",
            "com.vishatech.erp.controller",
            "com.vishatech.erp.dto");

    /** The production workflows whose classes may not sit in the flat layer. */
    private static final List<String> PRODUCTION_WORKFLOW_PREFIXES =
            List.of("Production", "QualityInspection");

    /** The frozen flat-persistence entry, still one class and still not these workflows. */
    private static final String SETTINGS_SERVICE =
            "com.vishatech.erp.service.production.ProductionSettingsService";

    private static JavaClass classOf(String name) {
        return BoundaryFindings.classNamed(BoundaryFindings.classesByName(), name);
    }

    // ------------------------------------------------------------------
    // 1. The moved workflows are inside the module
    // ------------------------------------------------------------------

    @Test
    void theMovedPersistenceIsProductionOwnedAndPackaged() {
        for (String name : List.of(TRACKER_ENTITY, INSPECTION_ENTITY,
                TRACKER_REPOSITORY, INSPECTION_REPOSITORY)) {
            JavaClass javaClass = classOf(name);
            assertThat(ModuleBoundaryTests.productionOwnedPersistence().test(javaClass))
                    .as("%s must be production-owned persistence at its new location", name)
                    .isTrue();
            assertThat(ModuleBoundaryTests.productionOwnedTypes().test(javaClass))
                    .as("%s must be a production-owned type", name)
                    .isTrue();
            assertThat(ModuleBoundaryTests.outsideProductionOwnership().test(javaClass))
                    .as("%s must never be classified as outside production", name)
                    .isFalse();
        }
    }

    @Test
    void theMovedServicesAndControllersAreInsideTheModule() {
        for (String name : List.of(TRACKER_SERVICE, INSPECTION_SERVICE)) {
            assertThat(ModuleBoundaryTests.productionOwnedServices().test(classOf(name)))
                    .as("%s must sit in the module's service scope, where every outbound "
                            + "guard sees it", name)
                    .isTrue();
        }
        for (String name : List.of(TRACKER_CONTROLLER, INSPECTION_CONTROLLER)) {
            assertThat(ModuleBoundaryTests.productionOwnedTypes().test(classOf(name)))
                    .as("%s is a production-owned controller", name)
                    .isTrue();
            assertThat(ModuleBoundaryTests.productionOwnedServices().test(classOf(name)))
                    .as("%s is a controller, not a service — the scope must stay exact", name)
                    .isFalse();
        }
    }

    /**
     * The guard that makes the package-based ownership rules safe: production ownership is
     * derived from {@code *.production} packages now, so a production workflow class left
     * behind in a flat layer package would be classified as <em>outside</em> production and
     * silently lose the module's own rules. This test fails the moment one appears again.
     */
    @Test
    void theFlatLayerHoldsNoProductionWorkflowClassAnyMore() {
        List<String> stragglers = BoundaryFindings.PROJECT_CLASSES.stream()
                .filter(javaClass -> FLAT_LAYER_PACKAGES.contains(javaClass.getPackageName()))
                .filter(javaClass -> PRODUCTION_WORKFLOW_PREFIXES.stream()
                        .anyMatch(javaClass.getSimpleName()::startsWith))
                .map(JavaClass::getName)
                .sorted()
                .toList();

        assertThat(stragglers)
                .as("a production workflow class in a flat layer package is invisible to the "
                        + "production ownership predicates; §14.14 moved the last eight into "
                        + "*.production packages and none may come back")
                .isEmpty();
    }

    @Test
    void theMovedRepositoriesAreStillSpringDataRepositoriesForTheMovedEntities() {
        assertThat(domainTypeOf(TRACKER_REPOSITORY))
                .as("the tracker repository must still be a JPA repository for the tracker entity")
                .isEqualTo(TRACKER_ENTITY);
        assertThat(domainTypeOf(INSPECTION_REPOSITORY))
                .as("the inspection repository must still be a JPA repository for the inspection "
                        + "entity")
                .isEqualTo(INSPECTION_ENTITY);
    }

    // ------------------------------------------------------------------
    // 2. The mapping did not change with the package
    // ------------------------------------------------------------------

    @Test
    void theTableNamesAreUnchanged() {
        assertThat(tableNameOf(TRACKER_ENTITY)).isEqualTo("production_trackers");
        assertThat(tableNameOf(INSPECTION_ENTITY)).isEqualTo("quality_inspections");
    }

    /** The mapping the task singled out: {@code sales_order_id} stays a raw id column. */
    @Test
    void theTrackerStillMapsSalesOrderIdToTheSameRawColumn() throws Exception {
        Field salesOrderId = load(TRACKER_ENTITY).getDeclaredField("salesOrderId");

        assertThat(salesOrderId.getType().getName())
                .as("a raw id, never a Sales entity association — that would re-create the "
                        + "Production → Sales dependency the rules forbid")
                .isEqualTo("java.lang.Long");
        assertThat(salesOrderId.getAnnotation(jakarta.persistence.Column.class).name())
                .as("the column name, its values and its nullability are unchanged")
                .isEqualTo("sales_order_id");
        assertThat(salesOrderId.isAnnotationPresent(com.fasterxml.jackson.annotation.JsonIgnore.class))
                .as("the field must stay out of the request and response payloads, exactly as "
                        + "the wire contract has it")
                .isTrue();
    }

    @Test
    void theInspectionStillMapsItsProductionOrderAndJsonColumns() throws Exception {
        Class<?> inspection = load(INSPECTION_ENTITY);

        assertThat(inspection.getDeclaredField("id").getType().getName())
                .as("the inspection keeps its String primary key (QI-… ids)")
                .isEqualTo("java.lang.String");
        assertThat(inspection.getDeclaredField("productionOrderId")
                .getAnnotation(jakarta.persistence.Column.class).name())
                .isEqualTo("production_order_id");

        for (String jsonField : List.of("checklist", "inspectionReport", "dimensionalInspection",
                "materialTestCertificate", "finalQcInfo", "history")) {
            jakarta.persistence.Column column = inspection.getDeclaredField(jsonField)
                    .getAnnotation(jakarta.persistence.Column.class);
            assertThat(column).as("%s must still be a mapped column", jsonField).isNotNull();
            assertThat(column.columnDefinition())
                    .as("%s is still declared as a MySQL JSON column — the move is a package "
                            + "change, not a schema redesign", jsonField)
                    .isEqualTo("JSON");
        }

        assertThat(inspection.isAnnotationPresent(jakarta.persistence.Entity.class))
                .as("it is still a JPA entity")
                .isTrue();
    }

    /**
     * No duplicate mapping was introduced by the move: every {@code @Table} name in the
     * project is still mapped by exactly one class.
     */
    @Test
    void everyTableNameIsStillMappedExactlyOnce() {
        Map<String, List<String>> byTable = new LinkedHashMap<>();
        for (JavaClass javaClass : BoundaryFindings.PROJECT_CLASSES) {
            if (!javaClass.isAnnotatedWith(Entity.class) || !javaClass.isAnnotatedWith(Table.class)) {
                continue;
            }
            JavaAnnotation<JavaClass> table = javaClass.getAnnotationOfType(Table.class.getName());
            String name = String.valueOf(table.get("name").orElse(""));
            if (name.isEmpty()) {
                name = javaClass.getSimpleName();
            }
            byTable.computeIfAbsent(name, key -> new ArrayList<>()).add(javaClass.getName());
        }

        assertThat(byTable).as("the project maps some entities").isNotEmpty();

        List<String> duplicates = byTable.entrySet().stream()
                .filter(entry -> entry.getValue().size() > 1)
                .map(entry -> entry.getKey() + " -> " + entry.getValue())
                .sorted()
                .toList();

        assertThat(duplicates)
                .as("two entities mapping one table is a silent data-loss bug — the migration "
                        + "must not produce one")
                .isEmpty();
    }

    // ------------------------------------------------------------------
    // 3. The class the migration deliberately did NOT touch
    // ------------------------------------------------------------------

    /**
     * {@code CprTechnicalVerification}, {@code CprTechnicalVerificationDocument} and
     * {@code TechnicalVerificationStatus} carry {@code cpr_*} tables and are the CPR
     * technical-verification workflow's records: CPR's own services create and read them,
     * and the status enum is also the production-side verification record's status. They
     * are therefore CPR-owned rather than production-owned persistence, and the readers
     * below are outside production — which is exactly why moving them "into Production"
     * would re-create an outside → production dependency instead of removing one.
     */
    @Test
    void theCprTechnicalVerificationTypesStayCprOwnedRatherThanProductionOwned() {
        for (String name : List.of(
                "com.vishatech.erp.entity.CprTechnicalVerification",
                "com.vishatech.erp.entity.CprTechnicalVerificationDocument",
                "com.vishatech.erp.entity.TechnicalVerificationStatus")) {
            assertThat(ModuleBoundaryTests.productionOwnedPersistence().test(classOf(name)))
                    .as("%s is not production-owned persistence", name)
                    .isFalse();
            assertThat(ModuleBoundaryTests.productionOwnedTypes().test(classOf(name)))
                    .as("%s is not a production-owned type (see ModuleBoundaryTests, §14.14)", name)
                    .isFalse();
        }

        for (String reader : List.of(
                "com.vishatech.erp.entity.CprTechnicalVerification",
                "com.vishatech.erp.entity.CprTechnicalVerificationDocument")) {
            assertThat(ModuleBoundaryTests.otherBusinessModuleInternals().test(classOf(reader)))
                    .as("%s is another business module's internals (CPR's)", reader)
                    .isTrue();
        }

        for (String reader : List.of(
                "com.vishatech.erp.service.CprTechnicalVerificationService",
                "com.vishatech.erp.service.CprService",
                "com.vishatech.erp.repository.CprTechnicalVerificationRepository",
                "com.vishatech.erp.controller.CprTechnicalVerificationController")) {
            assertThat(ModuleBoundaryTests.outsideProductionOwnership().test(classOf(reader)))
                    .as("%s reads the CPR verification records and is NOT production-owned, so "
                            + "filing that persistence under entity.production would make it an "
                            + "outside → production violation", reader)
                    .isTrue();
        }
    }

    @Test
    void theFlatPersistenceFreezeHoldsOnlyTheSharedSettingsStore() {
        assertThat(ModuleBoundaryTests.PRODUCTION_TO_FLAT_PERSISTENCE_ALLOWLIST)
                .as("§14.14 removed the tracker, inspection and document entries; only the "
                        + "shared AppSetting store is left")
                .containsExactly(SETTINGS_SERVICE)
                .doesNotContain(TRACKER_SERVICE, INSPECTION_SERVICE);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /** Loads a class the ArchUnit import already proved exists. */
    private static Class<?> load(String className) {
        try {
            return Class.forName(className);
        } catch (ClassNotFoundException e) {
            throw new AssertionError("class not on the test classpath: " + className, e);
        }
    }

    /** The entity a repository's {@code JpaRepository} declaration names. */
    private static String domainTypeOf(String repositoryName) {
        Class<?> repository = load(repositoryName);
        for (Type type : repository.getGenericInterfaces()) {
            if (type instanceof ParameterizedType parameterized
                    && parameterized.getRawType() == JpaRepository.class) {
                return ((Class<?>) parameterized.getActualTypeArguments()[0]).getName();
            }
        }
        throw new AssertionError("not a JpaRepository: " + repositoryName);
    }

    /** The table an entity maps, read from its own {@code @Table} declaration. */
    private static String tableNameOf(String entityName) {
        Class<?> entity = load(entityName);
        Table table = entity.getAnnotation(Table.class);
        assertThat(table).as("%s must declare its table", entityName).isNotNull();
        return table.name();
    }
}
