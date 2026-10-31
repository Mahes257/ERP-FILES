package com.vishatech.erp.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.util.LinkedHashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * P3 — non-vacuity guard for the CPR → Purchase ingress boundary.
 *
 * <p>The rule {@code cpr_does_not_depend_on_purchase_internals} passes trivially
 * if its source scope (classes named {@code Cpr*}) or its target predicate (the
 * {@link ModuleBoundaryTests#purchaseModuleInternals() Purchase internals
 * predicate}) stops matching real classes — a renamed prefix, a moved package or
 * an over-broad exemption would all silently disarm the boundary. This test makes
 * that visible instead of green:
 *
 * <ol>
 *   <li>the rule's <b>source</b> really is populated, and contains the class whose
 *       dependency was removed;</li>
 *   <li>the published ingress surface really exists and is genuinely
 *       <b>exempt</b> from the internals predicate (the exemption that makes the
 *       boundary satisfiable);</li>
 *   <li>the predicate still classifies real Purchase internals — including the
 *       requisition service, the DTO container and the ingress adapter — so the
 *       exemption cannot be widened by accident.</li>
 * </ol>
 *
 * <p>Persistent counterpart to the temporary probes used in the earlier phases:
 * those proved the rule <em>fires</em> on a real violation; this keeps the rule
 * <em>looking at</em> real classes as the codebase moves.
 */
class PurchaseIngressBoundaryTests {

    private static final JavaClasses PROJECT_CLASSES = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.vishatech.erp");

    /** The rule's source scope: {@code haveSimpleNameStartingWith("Cpr")}. */
    private static final DescribedPredicate<JavaClass> CPR_CLASSES =
            new DescribedPredicate<>("have a simple name starting with Cpr") {
                @Override
                public boolean test(JavaClass javaClass) {
                    return javaClass.getSimpleName().startsWith("Cpr");
                }
            };

    /** Direct members of the published ingress package. */
    private static final DescribedPredicate<JavaClass> IN_INGRESS_PACKAGE =
            new DescribedPredicate<>("reside in the Purchase ingress package") {
                @Override
                public boolean test(JavaClass javaClass) {
                    return javaClass.getPackageName().equals(ModuleBoundaryTests.PURCHASE_INGRESS_PACKAGE);
                }
            };

    private static Set<String> namesOf(JavaClasses classes) {
        Set<String> names = new LinkedHashSet<>();
        for (JavaClass javaClass : classes) {
            names.add(javaClass.getName());
        }
        return names;
    }

    @Test
    void theCprBoundaryRuleScansRealCprClasses() {
        JavaClasses cprClasses = PROJECT_CLASSES.that(CPR_CLASSES);
        Set<String> names = namesOf(cprClasses);

        assertThat(names).isNotEmpty();
        assertThat(names).contains("com.vishatech.erp.service.CprTechnicalVerificationService");
        assertThat(names.size()).isGreaterThan(5);
    }

    @Test
    void thePublishedIngressSurfaceExistsAndIsNotTreatedAsPurchaseInternal() {
        Set<String> ingressNames = namesOf(PROJECT_CLASSES.that(IN_INGRESS_PACKAGE));

        assertThat(ingressNames).contains(
                "com.vishatech.erp.purchase.api.PurchaseRequisitionIngressPort",
                "com.vishatech.erp.purchase.api.PurchaseRequisitionIngressRequest",
                "com.vishatech.erp.purchase.api.PurchaseRequisitionIngressResult");

        // The exemption that makes the boundary satisfiable: nothing in the
        // published package may be classified as an internal.
        JavaClasses internalsInIngressPackage =
                PROJECT_CLASSES.that(IN_INGRESS_PACKAGE).that(ModuleBoundaryTests.purchaseModuleInternals());
        assertThat(internalsInIngressPackage).isEmpty();
    }

    @Test
    void theInternalsPredicateStillClassifiesRealPurchaseInternals() {
        Set<String> internalNames = namesOf(PROJECT_CLASSES.that(ModuleBoundaryTests.purchaseModuleInternals()));

        // The types the boundary exists to protect, including the adapter that must
        // stay internal precisely because it implements the port.
        assertThat(internalNames).contains(
                "com.vishatech.erp.service.PurchaseRequisitionService",
                "com.vishatech.erp.service.PurchaseRequisitionIngressAdapter",
                "com.vishatech.erp.dto.PurchaseDtos");
        assertThat(internalNames.size()).isGreaterThan(20);
    }
}
