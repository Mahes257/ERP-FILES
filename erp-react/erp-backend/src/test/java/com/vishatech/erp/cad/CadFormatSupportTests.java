package com.vishatech.erp.cad;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.ObjectProvider;

/**
 * Regression tests for the extended Production CAD format support.
 *
 * <p>They pin the capability contract rather than a list of extensions: a format
 * is only advertised when a real loader or engine can handle it, and everything
 * else is reported stored-only (accepted, downloadable, no preview) instead of
 * being given a fake preview or the generic "Unsupported file type" message.
 *
 * <ol>
 *   <li>the newly wired mesh formats (PLY / DAE / 3DS) resolve DIRECT_BROWSER —
 *       the Three.js loaders are bundled with the viewer;</li>
 *   <li>BREP joins the OpenCascade slot used by STEP/IGES instead of a new
 *       pipeline (same engines, same endpoint);</li>
 *   <li>all pre-existing routing is unchanged (STL/OBJ/GLB/GLTF direct,
 *       STEP/STP/IGES/IGS via an engine, SLDPRT/SLDASM never direct);</li>
 *   <li>native vendor CAD formats resolve to an honest stored-only message;</li>
 *   <li>the content sniffer recognises the new signatures and no longer mistakes
 *       any ZIP container (F3D/F3Z/FCStd) for a 3MF model.</li>
 * </ol>
 */
class CadFormatSupportTests {

    // ------------------------------------------------------------- fixtures

    private ConversionProviderRegistry registryWithoutEngines() {
        @SuppressWarnings("unchecked")
        ObjectProvider<FreeCadConversionEngine> freeCad = mock(ObjectProvider.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<SolidWorksLocalConversionEngine> solidWorks = mock(ObjectProvider.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<CadmpegConversionEngine> cadmpeg = mock(ObjectProvider.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<SatAcisConversionEngine> sat = mock(ObjectProvider.class);
        return new ConversionProviderRegistry(
                List.of(), mock(SolidWorksDetector.class), freeCad, solidWorks, cadmpeg, sat);
    }

    // ------------------------------------- newly wired mesh formats (direct)

    @Test
    void newlyWiredMeshFormatsAreViewableDirectlyInTheBrowser() {
        ConversionProviderRegistry registry = registryWithoutEngines();

        for (String ft : List.of("ply", "dae", "3ds", "PLY", ".dae", "3DS")) {
            ConversionProviderRegistry.ProviderResolution res = registry.resolve(ft);
            assertThat(res.provider)
                    .as("provider for %s", ft)
                    .isEqualTo(CadConversionProvider.DIRECT_BROWSER);
            assertThat(res.available).as("available for %s", ft).isTrue();
            assertThat(res.unavailableMessage).as("no message for %s", ft).isNull();
        }
    }

    @Test
    void newlyWiredMeshFormatsNeedNoBackendConversion() {
        for (String ft : List.of("ply", "dae", "3ds")) {
            assertThat(CadFileTypes.isBrowserNative(ft)).as("browser native %s", ft).isTrue();
            assertThat(CadFileTypes.isDirect(ft)).as("direct %s", ft).isTrue();
            assertThat(CadFileTypes.requiresBackendConversion(ft)).as("no conversion %s", ft).isFalse();
            assertThat(CadFileTypes.isRecognisedStoredOnly(ft)).as("not stored-only %s", ft).isFalse();
        }
    }

    // ------------------------------------------------- pre-existing formats

    @Test
    void preExistingDirectFormatsKeepRoutingDirectlyToTheBrowser() {
        ConversionProviderRegistry registry = registryWithoutEngines();
        for (String ft : List.of("stl", "obj", "glb", "gltf")) {
            ConversionProviderRegistry.ProviderResolution res = registry.resolve(ft);
            assertThat(res.provider).as("provider for %s", ft).isEqualTo(CadConversionProvider.DIRECT_BROWSER);
            assertThat(res.available).as("available for %s", ft).isTrue();
        }
    }

    @Test
    void preExistingEngineFormatsStillRouteThroughTheConversionPipeline() {
        ConversionProviderRegistry registry = registryWithoutEngines();
        for (String ft : List.of("step", "stp", "iges", "igs")) {
            ConversionProviderRegistry.ProviderResolution res = registry.resolve(ft);
            // Never claimed as browser-native: these must go through an engine.
            assertThat(res.provider).as("provider for %s", ft).isEqualTo(CadConversionProvider.OPEN_CASCADE);
            assertThat(CadFileTypes.isBrowserNative(ft)).as("not browser native %s", ft).isFalse();
            assertThat(CadFileTypes.requiresBackendConversion(ft)).as("needs conversion %s", ft).isTrue();
        }
    }

    @Test
    void solidWorksFormatsAreNeverClaimedAsDirectlyViewable() {
        ConversionProviderRegistry registry = registryWithoutEngines();
        for (String ft : List.of("sldprt", "sldasm")) {
            ConversionProviderRegistry.ProviderResolution res = registry.resolve(ft);
            assertThat(res.provider).as("provider for %s", ft).isNotEqualTo(CadConversionProvider.DIRECT_BROWSER);
            assertThat(res.available).as("no engine installed for %s", ft).isFalse();
            // The actionable SolidWorks guidance is preserved verbatim.
            assertThat(res.unavailableMessage).isEqualTo(ConversionProviderRegistry.SLD_UNSUPPORTED_MESSAGE);
        }
    }

    // ------------------------------------------------------ BREP joins STEP

    // ----------------------------------------------------- SAT capability gap

    @Test
    void satWithoutAnEngineReportsTheHonestCapabilityGap() {
        ConversionProviderRegistry.ProviderResolution res = registryWithoutEngines().resolve("sat");

        // With no SAT engine present the registry must state the real gap — never
        // a browser claim and never a fake preview.
        assertThat(res.provider).isEqualTo(CadConversionProvider.NONE);
        assertThat(res.available).isFalse();
        assertThat(res.unavailableMessage).isEqualTo(ConversionProviderRegistry.SAT_UNSUPPORTED_MESSAGE);
        assertThat(CadFileTypes.isBrowserNative("sat")).isFalse();
        assertThat(CadFileTypes.isRecognisedStoredOnly("sat")).isFalse();
        assertThat(CadFileTypes.requiresBackendConversion("sat")).isFalse();
    }

    @Test
    void brepUsesTheSameOpenCascadeSlotAsStep() {
        ConversionProviderRegistry registry = registryWithoutEngines();

        ConversionProviderRegistry.ProviderResolution res = registry.resolve("brep");

        assertThat(res.provider).isEqualTo(CadConversionProvider.OPEN_CASCADE);
        assertThat(CadFileTypes.requiresBackendConversion("brep")).isTrue();
        assertThat(CadFileTypes.isBrowserNative("brep")).isFalse();
        // Honest about the missing engine — never a fake preview.
        assertThat(res.available).isFalse();
        assertThat(res.unavailableMessage).contains("CAD conversion engine is not available");
    }

    // -------------------------------------------------- honest stored-only

    @Test
    void nativeVendorCadFormatsReportStoredOnlyInsteadOfGenericUnsupported() {
        ConversionProviderRegistry registry = registryWithoutEngines();

        for (String ft : List.of(
                "catpart", "catproduct", "catdrawing",
                "prt", "asm", "drw", "ipt", "iam", "idw", "par", "dft",
                "x_t", "x_b", "3dm", "jt", "3dxml", "slddrw",
                "f3d", "f3z", "fcstd", "blend", "scad")) {
            ConversionProviderRegistry.ProviderResolution res = registry.resolve(ft);

            assertThat(CadFileTypes.isRecognisedStoredOnly(ft)).as("recognised %s", ft).isTrue();
            assertThat(res.provider).as("provider for %s", ft).isEqualTo(CadConversionProvider.NONE);
            assertThat(res.available).as("not available %s", ft).isFalse();
            assertThat(res.unavailableMessage)
                    .as("honest message for %s", ft)
                    .startsWith("Stored — no 3D preview")
                    .doesNotContain("Unsupported file type");
        }
    }

    @Test
    void anUnknownExtensionStillReportsUnsupported() {
        ConversionProviderRegistry.ProviderResolution res = registryWithoutEngines().resolve("not_a_cad_format");
        assertThat(res.provider).isEqualTo(CadConversionProvider.NONE);
        assertThat(res.available).isFalse();
        assertThat(res.unavailableMessage).isEqualTo("Unsupported file type: not_a_cad_format");
    }

    // ----------------------------------------------------------- sniffing

    @Test
    void sniffingRecognisesTheNewlySupportedSignatures(@TempDir Path dir) throws IOException {
        assertThat(CadContentSniffer.sniff(write(dir, "a.ply",
                "ply\nformat ascii 1.0\nelement vertex 3\nend_header\n"))).isEqualTo(CadContentSniffer.Format.PLY);
        assertThat(CadContentSniffer.sniff(write(dir, "b.dae",
                "<?xml version=\"1.0\"?>\n<COLLADA xmlns=\"http://www.collada.org/2005/11/COLLADASchema\">")))
                .isEqualTo(CadContentSniffer.Format.COLLADA);
        assertThat(CadContentSniffer.sniff(write(dir, "c.svg",
                "<?xml version=\"1.0\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>")))
                .isEqualTo(CadContentSniffer.Format.SVG);
        assertThat(CadContentSniffer.sniff(write(dir, "d.pdf", "%PDF-1.7\n"))).isEqualTo(CadContentSniffer.Format.PDF);
        assertThat(CadContentSniffer.sniff(write(dir, "e.dwg", "AC1032\u0000\u0000"))).isEqualTo(CadContentSniffer.Format.DWG);
        assertThat(CadContentSniffer.sniff(write(dir, "f.dxf", "0\nSECTION\n2\nHEADER\n"))).isEqualTo(CadContentSniffer.Format.DXF);
    }

    @Test
    void theNewSignaturesMapToTheirRealExtensions() {
        assertThat(CadContentSniffer.toExtension(CadContentSniffer.Format.PLY)).isEqualTo("ply");
        assertThat(CadContentSniffer.toExtension(CadContentSniffer.Format.COLLADA)).isEqualTo("dae");
        assertThat(CadContentSniffer.toExtension(CadContentSniffer.Format.THREE_DS)).isEqualTo("3ds");
        assertThat(CadContentSniffer.toExtension(CadContentSniffer.Format.PDF)).isEqualTo("pdf");
        assertThat(CadContentSniffer.toExtension(CadContentSniffer.Format.SVG)).isEqualTo("svg");
        assertThat(CadContentSniffer.toExtension(CadContentSniffer.Format.DWG)).isEqualTo("dwg");
        assertThat(CadContentSniffer.toExtension(CadContentSniffer.Format.DXF)).isEqualTo("dxf");
    }

    @Test
    void aBinaryPlyAndA3dsChunkStreamAreRecognised(@TempDir Path dir) throws IOException {
        // Binary PLY keeps the same "ply" header token.
        assertThat(CadContentSniffer.sniff(write(dir, "bin.ply", "ply\r\nformat binary_little_endian 1.0\n")))
                .isEqualTo(CadContentSniffer.Format.PLY);

        // 3DS: main chunk id 0x4D4D followed by a plausible uint32 length (== file size).
        byte[] tds = new byte[] {0x4D, 0x4D, 0x0A, 0x00, 0x00, 0x00, 0, 0, 0, 0};
        Path p = dir.resolve("m.3ds");
        Files.write(p, tds);
        assertThat(CadContentSniffer.sniff(p)).isEqualTo(CadContentSniffer.Format.THREE_DS);
    }

    @Test
    void aZipWithoutA3mfPayloadIsNotMistypedAs3mf(@TempDir Path dir) throws IOException {
        // F3Z/FCStd/F3D are ZIP containers too — PK magic alone must not re-type
        // them as 3MF (that would make the viewer parse a non-3MF archive).
        assertThat(CadContentSniffer.sniff(write(dir, "part.f3z", "PK\u0003\u0004zip-payload-no-opc-entries")))
                .isEqualTo(CadContentSniffer.Format.BINARY);

        // A genuine 3MF/OPC package exposes its package entries, so it still sniffs.
        assertThat(CadContentSniffer.sniff(write(dir, "part.3mf",
                "PK\u0003\u0004\u0000[Content_Types].xml")))
                .isEqualTo(CadContentSniffer.Format.THREE_MF);
    }

    @Test
    void existingSignaturesAreUnaffected(@TempDir Path dir) throws IOException {
        // A regression guard for the formats that were already supported.
        assertThat(CadContentSniffer.sniff(write(dir, "a.step", "ISO-10303-21;\nHEADER;\n")))
                .isEqualTo(CadContentSniffer.Format.STEP);
        assertThat(CadContentSniffer.sniff(write(dir, "b.obj", "# comment\nv 0 0 0\n")))
                .isEqualTo(CadContentSniffer.Format.OBJ);
        assertThat(CadContentSniffer.sniff(write(dir, "c.wrl", "#VRML V2.0 utf8\n")))
                .isEqualTo(CadContentSniffer.Format.VRML);
        assertThat(CadContentSniffer.sniff(write(dir, "d.brep", "DBRep_MyShape\n")))
                .isEqualTo(CadContentSniffer.Format.BREP);
        assertThat(CadContentSniffer.sniff(write(dir, "empty.stl"))).isEqualTo(CadContentSniffer.Format.EMPTY);
    }

    private Path write(Path dir, String name, String content) throws IOException {
        Path p = dir.resolve(name);
        Files.write(p, content.getBytes(StandardCharsets.ISO_8859_1));
        return p;
    }

    private Path write(Path dir, String name) throws IOException {
        Path p = dir.resolve(name);
        Files.write(p, new byte[0]);
        return p;
    }
}
