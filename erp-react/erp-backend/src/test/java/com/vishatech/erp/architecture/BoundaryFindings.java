package com.vishatech.erp.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.EvaluationResult;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Shared plumbing for the Production boundary guards.
 *
 * <p>The real codebase is imported <b>once</b> here (test classes excluded, exactly like
 * {@code ModuleBoundaryTests}) and reused by every guard, and the origin class of a
 * violation is read back out of ArchUnit's own failure details. Reading the origins from
 * the rule's output is what makes the guards honest: the expected sets in the tests are
 * compared with what the rule actually reports, so a renamed package, a predicate that
 * stopped matching, or a rule that quietly became vacuous fails the suite instead of
 * passing it.
 */
final class BoundaryFindings {

    /** The production classes, imported without any test class. */
    static final JavaClasses PROJECT_CLASSES = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.vishatech.erp");

    private BoundaryFindings() {
    }

    static Map<String, JavaClass> classesByName() {
        Map<String, JavaClass> byName = new LinkedHashMap<>();
        for (JavaClass javaClass : PROJECT_CLASSES) {
            byName.put(javaClass.getName(), javaClass);
        }
        return byName;
    }

    static Set<String> namesOf(JavaClasses classes) {
        Set<String> names = new LinkedHashSet<>();
        for (JavaClass javaClass : classes) {
            names.add(javaClass.getName());
        }
        return names;
    }

    /** Fails with a readable message when a class the test names no longer exists. */
    static JavaClass classNamed(Map<String, JavaClass> byName, String name) {
        JavaClass javaClass = byName.get(name);
        assertThat(javaClass).as("class %s must exist (renamed? moved?)", name).isNotNull();
        return javaClass;
    }

    /**
     * The origin classes of an evaluation: empty when the rule passed, otherwise the set
     * of classes the rule actually reported. Derived from the rule's own output, so it
     * cannot drift from what the rule enforces.
     */
    static Set<String> origins(EvaluationResult result) {
        Set<String> origins = new LinkedHashSet<>();
        if (!result.hasViolation()) {
            return origins;
        }
        for (String detail : result.getFailureReport().getDetails()) {
            origins.add(originClassOf(detail));
        }
        return origins;
    }

    static List<String> details(EvaluationResult result) {
        return result.hasViolation() ? result.getFailureReport().getDetails() : List.of();
    }

    /**
     * The <em>target</em> class of a failure detail: the second type named in it, e.g.
     * {@code "Field <com.x.Foo.f> has type <com.y.Baz> in (Foo.java:12)"} yields
     * {@code com.y.Baz} and {@code "Method <com.x.Foo.m()> calls method <com.y.Baz.n()>"}
     * yields {@code com.y.Baz}.
     *
     * <p>Used instead of a plain text match on the whole detail, because a detail's
     * <em>origin</em> member is printed with its full signature — which names every
     * parameter and return type, including the ones the rule is supposed to allow.
     */
    static String targetClassOf(String detail) {
        int first = detail.indexOf('<');
        int second = detail.indexOf('<', first + 1);
        assertThat(second).as("failure detail names a target type: %s", detail).isGreaterThan(-1);
        int end = detail.indexOf('>', second + 1);
        assertThat(end).as("failure detail closes the target type: %s", detail).isGreaterThan(second);
        String text = detail.substring(second + 1, end);
        int paren = text.indexOf('(');
        if (paren >= 0) {
            text = text.substring(0, paren);
        }
        return text.endsWith(".<init>")
                ? text.substring(0, text.length() - ".<init>".length())
                : text;
    }

    /**
     * The origin class of an ArchUnit failure detail, e.g.
     * {@code "Method <com.x.Foo.bar(java.lang.String)> calls method <com.y.Baz.qux()> in (Foo.java:12)"}
     * yields {@code com.x.Foo}.
     */
    static String originClassOf(String detail) {
        int open = detail.indexOf('<');
        int close = detail.indexOf('>', open + 1);
        assertThat(open).as("failure detail names the origin member: %s", detail).isGreaterThan(-1);
        assertThat(close).as("failure detail closes the origin member: %s", detail).isGreaterThan(open);
        String member = detail.substring(open + 1, close);
        int paren = member.indexOf('(');
        String head = paren >= 0 ? member.substring(0, paren) : member;
        int lastDot = head.lastIndexOf('.');
        assertThat(lastDot).as("origin member is fully qualified: %s", detail).isGreaterThan(-1);
        return head.substring(0, lastDot);
    }
}
