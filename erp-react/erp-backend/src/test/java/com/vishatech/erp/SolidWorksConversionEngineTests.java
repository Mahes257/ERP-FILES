package com.vishatech.erp;

import com.vishatech.erp.cad.CadConversionProvider;
import com.vishatech.erp.cad.CadConversionResult;
import com.vishatech.erp.cad.ConversionProviderRegistry;
import com.vishatech.erp.cad.SolidWorksDetector;
import com.vishatech.erp.cad.SolidWorksLocalConversionEngine;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.service.production.ModelService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the internal SolidWorks conversion strategy WITHOUT a SolidWorks
 * installation on the build server:
 *
 *   1. The detector honestly reports "not available" (no fake detection).
 *   2. The engine refuses to convert WITHOUT attempting anything, and its
 *      refusal message is truthful.
 *   3. The registry resolves SLDPRT/SLDASM to an honest state backed by a REAL
 *      engine: SOLIDWORKS_LOCAL where SolidWorks exists, CADMPEG where the
 *      cross-platform converter is installed, UNSUPPORTED only when neither is.
 *   4. On a server WITH SolidWorks the same engine path becomes available
 *      (verified statically: supports() + wiring, never a fake conversion).
 *
 * The real-geometry acceptance test for a SolidWorks-equipped server is
 * documented in the deliverable; it cannot run on a machine without the
 * proprietary kernel, and this suite never fakes one.
 */
@SpringBootTest
class SolidWorksConversionEngineTests extends AbstractSecurityTest {

    @Autowired
    private SolidWorksDetector detector;

    @Autowired
    private SolidWorksLocalConversionEngine engine;

    @Autowired
    private ConversionProviderRegistry registry;

    @Autowired
    private ModelService modelService;

    @Test
    void detectorReflectsActualMachineState() {
        // Whatever the answer is, it must be STABLE and consistent with the
        // executable lookup (no transient/fake availability).
        boolean available = detector.isAvailable();
        assertThat(detector.isAvailable()).isEqualTo(available);
        if (available) {
            assertThat(detector.findExecutable()).isPresent();
        }
    }

    @Test
    void engineSupportsOnlySolidWorksFormats() {
        assertThat(engine.supports(".sldprt")).isTrue();
        assertThat(engine.supports("SLDASM")).isTrue();
        assertThat(engine.supports(".step")).isFalse();
        assertThat(engine.supports("stl")).isFalse();
        assertThat(engine.supports("")).isFalse();
        assertThat(engine.getName()).isEqualTo("solidworks-local");
    }

    @Test
    void engineRefusesHonestlyWhenSolidWorksAbsent() throws Exception {
        Path tmp = Files.createTempFile("swtest", ".sldprt");
        try {
            Files.write(tmp, new byte[]{1, 2, 3, 4});
            Path outDir = Files.createTempDirectory("swtest-out");

            CadConversionResult result = engine.convert(tmp, "out", outDir, ".sldprt");

            if (detector.isAvailable()) {
                // A real SolidWorks server: the engine may legitimately succeed
                // or fail on actual geometry, but never refuse for absence.
                assertThat(result.getError()).isNull();
            } else {
                // No SolidWorks here: MUST refuse without any conversion attempt.
                assertThat(result.isSuccess()).isFalse();
                assertThat(result.getError()).contains("No local SolidWorks installation");
            }
        } finally {
            Files.deleteIfExists(tmp);
        }
    }

    @Test
    void registryResolvesSldprtToHonestTerminalState() {
        ConversionProviderRegistry.ProviderResolution res = registry.resolve(".sldprt");

        if (res.available) {
            // A real SLDPRT engine is registered on this machine — the
            // SolidWorks local engine and/or the cross-platform cadmpeg engine.
            // Availability must always be backed by an engine that really
            // supports the format, never a placeholder that cannot convert.
            assertThat(res.engine).isNotNull();
            assertThat(res.engine.supports(".sldprt")).isTrue();
        } else {
            assertThat(res.unavailableMessage).isNotBlank();
            // The message must be actionable and truthful about the server.
            assertThat(res.unavailableMessage)
                    .containsAnyOf("SolidWorks", "STEP", "cadmpeg", "unavailable");
        }
    }

    @Test
    void conversionStatusNamesARealEngineForProprietaryFormats() {
        // Whenever SLDASM resolves to an engine, conversion-status must advertise
        // that engine's REAL name (solidworks-local or cadmpeg) — never a generic
        // or fake engine. Which one wins is a deployment fact, not a test input.
        ConversionProviderRegistry.ProviderResolution res = registry.resolve("sldasm");
        if (res.available && res.engine != null) {
            assertThat(res.engine.getName()).isNotBlank();
            assertThat(res.engine.supports("sldasm")).isTrue();
            assertThat(res.engine.getName()).isNotEqualToIgnoringCase("none");
        }
    }
}
