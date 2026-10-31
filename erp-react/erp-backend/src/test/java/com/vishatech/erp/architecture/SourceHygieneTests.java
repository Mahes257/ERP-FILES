package com.vishatech.erp.architecture;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Source-level hygiene guard that complements the ArchUnit suite.
 *
 * <p>Wildcard imports of the project's own packages ({@code import
 * com.vishatech.erp.entity.*;}) hide cross-module dependencies from code review
 * and defeat an ArchUnit rule that lists its allowed targets, because the
 * target set is no longer visible in the file. They cannot be detected from
 * bytecode, so this test reads the sources.
 *
 * <p>The sixteen files below already contain such imports; they are listed
 * explicitly so this test freezes what exists without forbidding the fix. The
 * assertion is a subset check, so a file may be cleaned up at any time without
 * touching this test — it only fails when a <em>new</em> wildcard import
 * appears.
 */
class SourceHygieneTests {

    /** Relative to the module basedir (Surefire's working directory). */
    private static final Path SOURCE_ROOT = Paths.get("src", "main", "java");

    private static final String OWN_PACKAGE_WILDCARD_IMPORT_PREFIX =
            "import com.vishatech.erp.";

    /** Files that already use an own-package wildcard import (frozen set). */
    private static final Set<String> KNOWN_WILDCARD_IMPORT_FILES = Set.of(
            "com/vishatech/erp/controller/PurchaseReceivingController.java",
            "com/vishatech/erp/controller/production/IntegrationController.java",
            "com/vishatech/erp/controller/production/ProductionOrderController.java",
            "com/vishatech/erp/service/DocumentBackfillService.java",
            "com/vishatech/erp/service/ExpenseTripService.java",
            "com/vishatech/erp/service/MarketingCalendarService.java",
            "com/vishatech/erp/service/MarketingDashboardService.java",
            "com/vishatech/erp/service/MarketingMapService.java",
            "com/vishatech/erp/service/PdfGenerationService.java",
            "com/vishatech/erp/service/PurchaseReceivingService.java",
            "com/vishatech/erp/service/production/CastingService.java",
            "com/vishatech/erp/service/production/IntegrationService.java",
            "com/vishatech/erp/service/production/ProductionEntryService.java",
            "com/vishatech/erp/service/production/ProductionOrderService.java",
            "com/vishatech/erp/util/production/OrderMapper.java");

    @Test
    void noNewWildcardImportsOfProjectPackages() throws IOException {
        assertTrue(Files.isDirectory(SOURCE_ROOT),
                "Expected to run from the erp-backend module directory, but "
                        + SOURCE_ROOT.toAbsolutePath() + " is not a directory");

        Set<String> offenders = new LinkedHashSet<>();
        try (Stream<Path> files = Files.walk(SOURCE_ROOT)) {
            for (Path file : files.filter(p -> p.toString().endsWith(".java")).toList()) {
                if (hasOwnPackageWildcardImport(file)) {
                    offenders.add(SOURCE_ROOT.relativize(file).toString().replace('\\', '/'));
                }
            }
        }

        Set<String> unexpected = new LinkedHashSet<>(offenders);
        unexpected.removeAll(KNOWN_WILDCARD_IMPORT_FILES);

        assertTrue(unexpected.isEmpty(),
                "New wildcard imports of com.vishatech.erp.* were added (they hide "
                        + "module dependencies from review and from the ArchUnit rules). "
                        + "Use explicit imports instead, or add the file to "
                        + "KNOWN_WILDCARD_IMPORT_FILES with a justification: " + unexpected);
    }

    private static boolean hasOwnPackageWildcardImport(Path file) throws IOException {
        return Files.readAllLines(file).stream().anyMatch(line -> {
            String trimmed = line.trim();
            return trimmed.startsWith(OWN_PACKAGE_WILDCARD_IMPORT_PREFIX)
                    && trimmed.endsWith(".*;");
        });
    }
}
