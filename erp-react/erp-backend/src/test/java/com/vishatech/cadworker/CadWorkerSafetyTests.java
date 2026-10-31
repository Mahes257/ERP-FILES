package com.vishatech.cadworker;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Safety properties of the isolated CAD worker that must hold regardless of
 * which engine is installed:
 *
 *  1. Generated file names can never escape their directory (no user-controlled
 *     path segment survives {@code sanitize}).
 *  2. Only a structurally valid GLB with real geometry data may be published —
 *     a corrupt, empty or mislabelled output is rejected, so a failed
 *     conversion can never surface as a fake "READY" preview.
 *  3. Failure messages are single-line and contain no filesystem paths, so no
 *     server layout leaks to API clients.
 *
 * Plain unit tests: no Spring context, no database, no engine.
 */
class CadWorkerSafetyTests {

    // ------------------------------------------------------------------
    // 1. Generated file names
    // ------------------------------------------------------------------

    @Test
    void sanitizeStripsPathSeparatorsAndTraversal() {
        assertThat(CadJobWorker.sanitize("../../etc/passwd")).doesNotContain("/", "\\");
        assertThat(CadJobWorker.sanitize("..\\..\\windows\\system32")).doesNotContain("/", "\\");
        assertThat(CadJobWorker.sanitize("/absolute/path")).doesNotContain("/");
        assertThat(CadJobWorker.sanitize("C:\\evil\\name")).doesNotContain("\\", ":");
        assertThat(CadJobWorker.sanitize("..")).isEqualTo("model");
        assertThat(CadJobWorker.sanitize(null)).isEqualTo("model");
        assertThat(CadJobWorker.sanitize("   ")).isEqualTo("model");
        assertThat(CadJobWorker.sanitize("PH-3D-001")).isEqualTo("PH-3D-001");
        // Length is bounded so a pathological model number cannot break storage.
        assertThat(CadJobWorker.sanitize("x".repeat(500))).hasSizeLessThanOrEqualTo(80);
    }

    // ------------------------------------------------------------------
    // 2. Output validation — no fake READY without real geometry
    // ------------------------------------------------------------------

    @Test
    void missingOutputIsRejected(@TempDir Path dir) {
        GlbOutputValidator.Result result = new GlbOutputValidator().validate(dir.resolve("nope.glb"));
        assertThat(result.valid()).isFalse();
        assertThat(result.reason()).contains("no output file");
    }

    @Test
    void nonGlbOutputIsRejected(@TempDir Path dir) throws Exception {
        Path fake = dir.resolve("preview.glb");
        Files.write(fake, "This is definitely not a glTF binary.".getBytes(StandardCharsets.UTF_8));
        GlbOutputValidator.Result result = new GlbOutputValidator().validate(fake);
        assertThat(result.valid()).isFalse();
        assertThat(result.reason()).contains("not a GLB");
    }

    @Test
    void glbWithNoGeometryIsRejected(@TempDir Path dir) throws Exception {
        // Structurally a GLB, but declares no meshes: an "empty success".
        Path empty = dir.resolve("empty.glb");
        Files.write(empty, buildGlb("{\"asset\":{\"version\":\"2.0\"}}", 0));
        GlbOutputValidator.Result result = new GlbOutputValidator().validate(empty);
        assertThat(result.valid()).isFalse();
        assertThat(result.reason()).contains("no mesh geometry");
    }

    @Test
    void glbWithTruncatedDeclaredLengthIsRejected(@TempDir Path dir) throws Exception {
        Path broken = dir.resolve("broken.glb");
        byte[] good = buildGlb(minimalSceneJson(), 32);
        // Corrupt the declared total length in the GLB header.
        ByteBuffer.wrap(good).order(ByteOrder.LITTLE_ENDIAN).putInt(8, good.length + 64);
        Files.write(broken, good);
        GlbOutputValidator.Result result = new GlbOutputValidator().validate(broken);
        assertThat(result.valid()).isFalse();
        assertThat(result.reason()).contains("declares");
    }

    @Test
    void validGlbWithRealVertexDataIsAccepted(@TempDir Path dir) throws Exception {
        Path ok = dir.resolve("preview.glb");
        Files.write(ok, buildGlb(minimalSceneJson(), 32));
        GlbOutputValidator.Result result = new GlbOutputValidator().validate(ok);
        assertThat(result.valid()).as(result.reason()).isTrue();
    }

    /** Minimal but genuinely valid GLB: scene JSON + BIN chunk with vertex bytes. */
    private static byte[] buildGlb(String json, int binBytes) {
        byte[] jsonBytes = json.getBytes(StandardCharsets.UTF_8);
        int jsonPadded = (jsonBytes.length + 3) & ~3;
        int binPadded = (binBytes + 3) & ~3;
        int total = 12 + 8 + jsonPadded + (binBytes > 0 ? 8 + binPadded : 0);

        ByteBuffer buf = ByteBuffer.allocate(total).order(ByteOrder.LITTLE_ENDIAN);
        buf.putInt(0x46546C67);          // magic 'glTF'
        buf.putInt(2);                   // version
        buf.putInt(total);               // declared length
        buf.putInt(jsonPadded);          // JSON chunk length
        buf.putInt(0x4E4F534A);          // 'JSON'
        buf.put(jsonBytes);
        for (int i = jsonBytes.length; i < jsonPadded; i++) buf.put((byte) 0x20);
        if (binBytes > 0) {
            buf.putInt(binPadded);       // BIN chunk length
            buf.putInt(0x004E4942);      // 'BIN\0'
            for (int i = 0; i < binBytes; i++) buf.put((byte) (i % 251));
            for (int i = binBytes; i < binPadded; i++) buf.put((byte) 0);
        }
        return buf.array();
    }

    private static String minimalSceneJson() {
        return "{\"asset\":{\"version\":\"2.0\"},"
                + "\"meshes\":[{\"primitives\":[{\"attributes\":{\"POSITION\":0}}]}],"
                + "\"accessors\":[{\"componentType\":5126,\"count\":1,\"type\":\"VEC3\"}],"
                + "\"buffers\":[{\"byteLength\":36}]}";
    }

    // ------------------------------------------------------------------
    // 3. Failure messages never leak server paths
    // ------------------------------------------------------------------

    @Test
    void safeMessageIsSingleLineAndPathless() {
        String raw = "engine failed at C:\\Users\\admin\\tools\\cad.exe\n"
                + "while reading /var/lib/erp/uploads/models/karthi.SLDPRT";
        String safe = CadJobStore.safeMessage(raw);
        assertThat(safe).doesNotContain("\n").doesNotContain("\r");
        assertThat(safe).doesNotContain("C:\\").doesNotContain("/var/lib");
        assertThat(safe.length()).isLessThanOrEqualTo(480);
        assertThat(CadJobStore.safeMessage(null)).isEqualTo("CAD conversion failed.");
        assertThat(CadJobStore.safeMessage("   ")).isEqualTo("CAD conversion failed.");
    }
}
