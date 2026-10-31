package com.vishatech.erp.cad;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.File;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

/**
 * Capability-aware provider selection — the resolution half of engine
 * auto-detection. The registry must pick a provider ONLY for engines that are
 * actually detected on the server, and otherwise report the precise honest gap:
 *
 * <pre>
 *   resolve("sldprt"/"sldasm")  cadmpeg detected → CADMPEG
 *                               SolidWorks detected → SOLIDWORKS_LOCAL
 *                               neither → NONE + honest message
 *   resolve("sat")              complete SAT chain → SAT_ACIS
 *                               any link missing  → NONE + the real gap
 *   resolve("step"/...)         FreeCAD only when enabled AND detected,
 *                               else the unchanged OpenCascade slot
 *   resolve("glb"/"stl"/...)    DIRECT_BROWSER, no engine required
 * </pre>
 *
 * <p>Engines are mocked per case, so every state of the matrix (A: all present,
 * B: cadmpeg missing, C: SAT dependency missing, D: FreeCAD missing,
 * E: SolidWorks missing, F/G: browser-native / STEP untouched) is asserted
 * deterministically on any machine.
 */
class CadEngineAutoDetectionTests {

    // ------------------------------------------------------------- fixtures

    @SuppressWarnings("unchecked")
    private static <T> ObjectProvider<T> providerOf(T bean) {
        ObjectProvider<T> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(bean);
        return provider;
    }

    private static ConversionProviderRegistry registry(CadmpegConversionEngine cadmpeg,
                                                       SatAcisConversionEngine sat,
                                                       FreeCadConversionEngine freeCad,
                                                       SolidWorksLocalConversionEngine solidWorks,
                                                       SolidWorksDetector detector) {
        return new ConversionProviderRegistry(
                List.of(),
                detector != null ? detector : mock(SolidWorksDetector.class),
                providerOf(freeCad),
                providerOf(solidWorks),
                providerOf(cadmpeg),
                providerOf(sat));
    }

    /** cadmpeg that claims the SolidWorks family, present or absent. */
    private static CadmpegConversionEngine cadmpeg(boolean present) {
        CadmpegConversionEngine cm = mock(CadmpegConversionEngine.class);
        when(cm.supports("sldprt")).thenReturn(true);
        when(cm.supports("sldasm")).thenReturn(true);
        when(cm.resolveExecutable()).thenReturn(present ? new File("cadmpeg.exe") : null);
        when(cm.getConfigurationIssue()).thenReturn(present ? null
                : "3D conversion unavailable: cadmpeg is not installed on this server.");
        return cm;
    }

    /** A SAT engine with the complete chain, or one missing link. */
    private static SatAcisConversionEngine sat(boolean complete, String issueWhenBroken) {
        SatAcisConversionEngine engine = mock(SatAcisConversionEngine.class);
        when(engine.supports("sat")).thenReturn(true);
        when(engine.isAvailable()).thenReturn(complete);
        when(engine.getConfigurationIssue()).thenReturn(complete ? null : issueWhenBroken);
        return engine;
    }

    // --------------------------------------------------- TEST A: all present

    @Test
    void sldprtAndSldasmResolveToCadmpegWhenTheBinaryIsDetected() {
        for (String ft : List.of("sldprt", "sldasm")) {
            ConversionProviderRegistry.ProviderResolution res =
                    registry(cadmpeg(true), null, null, null, null).resolve(ft);
            assertThat(res.provider).as("provider for %s", ft).isEqualTo(CadConversionProvider.CADMPEG);
            assertThat(res.available).as("available for %s", ft).isTrue();
            assertThat(res.engine).as("engine for %s", ft).isNotNull();
            assertThat(res.unavailableMessage).isNull();
        }
    }

    @Test
    void satResolvesToSatAcisWhenTheCompleteChainIsDetected() {
        ConversionProviderRegistry.ProviderResolution res =
                registry(null, sat(true, null), null, null, null).resolve("sat");

        assertThat(res.provider).isEqualTo(CadConversionProvider.SAT_ACIS);
        assertThat(res.available).isTrue();
        assertThat(res.unavailableMessage).isNull();
    }

    // ------------------------------------------------ TEST B: cadmpeg missing

    @Test
    void sldprtAndSldasmReportTheCadmpegGapWhenTheBinaryIsAbsent() {
        for (String ft : List.of("sldprt", "sldasm")) {
            ConversionProviderRegistry.ProviderResolution res =
                    registry(cadmpeg(false), null, null, null, null).resolve(ft);
            // The cadmpeg provider slot is reported with the precise reason —
            // never a fake engine, never a silent success.
            assertThat(res.provider).as("provider for %s", ft).isEqualTo(CadConversionProvider.CADMPEG);
            assertThat(res.available).isFalse();
            assertThat(res.unavailableMessage)
                    .as("actionable reason for %s", ft)
                    .contains("cadmpeg is not installed");
        }
    }

    @Test
    void satReportsTheCadmpegGapWhenSatHasNoDecoder() {
        ConversionProviderRegistry.ProviderResolution res =
                registry(null, sat(false, "3D conversion unavailable: cadmpeg is not installed on "
                        + "this server. SAT (ACIS) files are decoded by cadmpeg; export the model "
                        + "as STEP (.step/.stp) instead."), null, null, null).resolve("sat");

        assertThat(res.provider).isEqualTo(CadConversionProvider.NONE);
        assertThat(res.available).isFalse();
        assertThat(res.unavailableMessage).contains("cadmpeg is not installed");
    }

    // ------------------------------------- TEST C: SAT dependency missing

    @Test
    void satWithAMissingDependencyReportsTheRealCapabilityGapNotAFakeProvider() {
        ConversionProviderRegistry.ProviderResolution res =
                registry(null,
                        sat(false, "3D conversion unavailable: Node.js was not found on this "
                                + "server, and the SAT (ACIS) tessellator runs on it."),
                        null, null, null)
                        .resolve("sat");

        assertThat(res.provider).isEqualTo(CadConversionProvider.NONE);
        assertThat(res.available).isFalse();
        assertThat(res.unavailableMessage).contains("Node.js");
    }

    // ----------------------------------- TEST D: FreeCAD missing / disabled

    @Test
    void stepKeepsTheUnchangedOpenCascadeSlotWhenFreeCADIsNotDetected() {
        // FreeCAD disabled (the default) or present-but-undetected: STEP/IGES/
        // BREP keep the exact same slot and message as before — the browser
        // OCCT WASM path is independent of this server-side registry entry.
        for (String ft : List.of("step", "stp", "iges", "igs", "brep")) {
            ConversionProviderRegistry.ProviderResolution res =
                    registry(null, null, null, null, null).resolve(ft);
            assertThat(res.provider).as("provider for %s", ft)
                    .isEqualTo(CadConversionProvider.OPEN_CASCADE);
            assertThat(res.available).isFalse();
            assertThat(res.unavailableMessage)
                    .contains("CAD conversion engine is not available");
        }
    }

    @Test
    void freeCadEnabledButNotInstalledReportsThePreciseSolidWorksGap() {
        FreeCadConversionEngine fc = mock(FreeCadConversionEngine.class);
        when(fc.isEnabled()).thenReturn(true);
        when(fc.resolveExecutable()).thenReturn(null); // enabled, NOT installed
        // supports() consults the real executable in the engine, so a missing
        // binary means it claims nothing.
        when(fc.supports("sldprt")).thenReturn(false);
        when(fc.supports("step")).thenReturn(false);

        ConversionProviderRegistry.ProviderResolution sld =
                registry(null, null, fc, null, null).resolve("sldprt");
        assertThat(sld.provider).isEqualTo(CadConversionProvider.NONE);
        assertThat(sld.available).isFalse();
        assertThat(sld.unavailableMessage).contains("configured FreeCAD engine was not found");

        ConversionProviderRegistry.ProviderResolution step =
                registry(null, null, fc, null, null).resolve("step");
        assertThat(step.provider).isEqualTo(CadConversionProvider.OPEN_CASCADE);
        assertThat(step.available).isFalse();
    }

    // ------------------------------------- TEST E: SolidWorks unavailable

    @Test
    void solidWorksLocalIsSelectedOnlyWhenTheDetectorConfirmsAnInstallation() {
        SolidWorksLocalConversionEngine sw = mock(SolidWorksLocalConversionEngine.class);
        when(sw.supports("sldprt")).thenReturn(true);
        when(sw.supports("sldasm")).thenReturn(true);

        SolidWorksDetector detected = mock(SolidWorksDetector.class);
        when(detected.isAvailable()).thenReturn(true);
        ConversionProviderRegistry.ProviderResolution res =
                registry(null, null, null, sw, detected).resolve("sldprt");
        assertThat(res.provider).isEqualTo(CadConversionProvider.SOLIDWORKS_LOCAL);
        assertThat(res.available).isTrue();

        SolidWorksDetector missing = mock(SolidWorksDetector.class);
        when(missing.isAvailable()).thenReturn(false);
        ConversionProviderRegistry.ProviderResolution none =
                registry(null, null, null, sw, missing).resolve("sldprt");
        assertThat(none.provider).isEqualTo(CadConversionProvider.NONE);
        assertThat(none.available).isFalse();
        assertThat(none.unavailableMessage)
                .isEqualTo(ConversionProviderRegistry.SLD_UNSUPPORTED_MESSAGE);
    }

    // --------------------------------- TEST F: browser-native needs no engine

    @Test
    void browserNativeFormatsStayDirectRegardlessOfAnyEngineState() {
        // No engines at all: the formats the browser renders with no server
        // involved must still resolve DIRECT_BROWSER. (3MF/FBX/WRL/VRML are
        // served by their own client-side loaders and keep their pre-existing
        // backend behaviour, which detection does not touch.)
        ConversionProviderRegistry noneAtAll = registry(null, null, null, null, null);
        for (String ft : List.of("glb", "gltf", "stl", "obj", "ply", "dae", "3ds")) {
            ConversionProviderRegistry.ProviderResolution res = noneAtAll.resolve(ft);
            assertThat(res.provider).as("provider for %s", ft)
                    .isEqualTo(CadConversionProvider.DIRECT_BROWSER);
            assertThat(res.available).as("available for %s", ft).isTrue();
            assertThat(res.unavailableMessage).isNull();
        }
    }
}
