package com.vishatech.erp.cad;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.vishatech.cadworker.GlbOutputValidator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The CADIR → GLB step is what turns cadmpeg's output into something the
 * existing viewer can render, so it is tested without cadmpeg being installed:
 *
 *  1. Real tessellation data becomes a GLB that passes the EXISTING
 *     {@link GlbOutputValidator} (the same validator the worker applies before
 *     publishing — it is not weakened here).
 *  2. Topology rules from the reference implementation hold: one mesh/material/
 *     node per tessellation, uint16 indices while a body stays within 65535
 *     vertices and uint32 beyond it, accessor min/max on POSITION.
 *  3. A CADIR without geometry fails with a real reason instead of producing a
 *     placeholder model.
 */
class CadirToGlbBuilderTests {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void buildsValidGlbFromRealTessellation(@TempDir Path dir) throws Exception {
        ObjectNode cadir = emptyCadir();
        ArrayNode tessellations = (ArrayNode) cadir.with("model").get("tessellations");
        // Body 1: a quad (2 triangles) WITH normals.
        tessellations.add(tessellation(
                new float[][]{{0, 0, 0}, {1, 0, 0}, {1, 1, 0}, {0, 1, 0}},
                new float[][]{{0, 0, 1}, {0, 0, 1}, {0, 0, 1}, {0, 0, 1}},
                new int[][]{{0, 1, 2}, {0, 2, 3}}));
        // Body 2: a triangle WITHOUT normals (real-world CADIR variance).
        tessellations.add(tessellation(
                new float[][]{{0, 0, 5}, {2, 0, 5}, {0, 2, 5}},
                null,
                new int[][]{{0, 1, 2}}));
        Path cadirPath = write(dir, "model.cadir.json", cadir);
        Path glb = dir.resolve("preview.glb");

        CadirToGlbBuilder.Result result = CadirToGlbBuilder.build(cadirPath, glb, "sldprt");

        assertThat(result.success()).as(result.error()).isTrue();
        assertThat(result.meshes()).isEqualTo(2);
        assertThat(result.vertices()).isEqualTo(7);
        assertThat(result.triangles()).isEqualTo(3);
        assertThat(Files.size(glb)).isGreaterThan(0);

        // The worker's own gate must accept it.
        GlbOutputValidator.Result validated = new GlbOutputValidator().validate(glb);
        assertThat(validated.valid()).as(validated.reason()).isTrue();

        JsonNode gltf = readJsonChunk(glb);
        assertThat(gltf.path("asset").path("version").asText()).isEqualTo("2.0");
        assertThat(gltf.path("meshes")).hasSize(2);
        assertThat(gltf.path("materials")).hasSize(2);
        assertThat(gltf.path("nodes")).hasSize(2);
        assertThat(gltf.path("scenes").get(0).path("nodes")).hasSize(2);
        // Per-body palette survives: each body gets its own material colour.
        assertThat(gltf.path("materials").get(0).path("pbrMetallicRoughness")
                .path("baseColorFactor").get(3).asDouble()).isEqualTo(1.0);

        JsonNode primitives0 = gltf.path("meshes").get(0).path("primitives").get(0);
        assertThat(primitives0.path("attributes").has("NORMAL")).isTrue();
        JsonNode primitives1 = gltf.path("meshes").get(1).path("primitives").get(0);
        assertThat(primitives1.path("attributes").has("POSITION")).isTrue();
        // Documented divergence: no usable normals → attribute omitted, so the
        // viewer derives flat normals instead of reading an invalid accessor.
        assertThat(primitives1.path("attributes").has("NORMAL")).isFalse();

        // POSITION accessors carry bounds (viewers/tools rely on min/max).
        int posIndex = primitives0.path("attributes").path("POSITION").asInt();
        JsonNode accessor = gltf.path("accessors").get(posIndex);
        assertThat(accessor.path("componentType").asInt()).isEqualTo(5126);
        assertThat(accessor.path("type").asText()).isEqualTo("VEC3");
        assertThat(accessor.path("min").get(0).asDouble()).isEqualTo(0.0);
        assertThat(accessor.path("max").get(0).asDouble()).isEqualTo(1.0);
    }

    @Test
    void usesUint32IndicesBeyondTheUint16Limit(@TempDir Path dir) throws Exception {
        int vertexCount = 70_000; // > 65535 → uint32 indices required
        float[][] vertices = new float[vertexCount][];
        for (int i = 0; i < vertexCount; i++) {
            vertices[i] = new float[]{i % 1000, (i / 1000) % 1000, 0};
        }
        ObjectNode cadir = emptyCadir();
        ((ArrayNode) cadir.with("model").get("tessellations")).add(tessellation(
                vertices, null, new int[][]{{0, 1, 2}, {3, 4, 5}}));
        Path cadirPath = write(dir, "big.cadir.json", cadir);
        Path glb = dir.resolve("big.glb");

        CadirToGlbBuilder.Result result = CadirToGlbBuilder.build(cadirPath, glb, "sldprt");

        assertThat(result.success()).as(result.error()).isTrue();
        assertThat(result.vertices()).isEqualTo(vertexCount);
        assertThat(new GlbOutputValidator().validate(glb).valid()).isTrue();
        JsonNode gltf = readJsonChunk(glb);
        int idxIndex = gltf.path("meshes").get(0).path("primitives").get(0).path("indices").asInt();
        assertThat(gltf.path("accessors").get(idxIndex).path("componentType").asInt()).isEqualTo(5125);
    }

    @Test
    void cadirWithoutGeometryFailsInsteadOfFakingAModel(@TempDir Path dir) throws Exception {
        ObjectNode cadir = emptyCadir();
        // A container that decoded into metadata streams but no tessellation.
        cadir.with("model").putArray("bodies").addObject();
        cadir.with("model").putArray("faces").addObject();
        Path cadirPath = write(dir, "empty.cadir.json", cadir);

        CadirToGlbBuilder.Result result = CadirToGlbBuilder.build(cadirPath, dir.resolve("x.glb"), "sldprt");

        assertThat(result.success()).isFalse();
        assertThat(result.error()).contains("no tessellated geometry");
        assertThat(Files.exists(dir.resolve("x.glb"))).isFalse();
    }

    @Test
    void tessellationsWithoutVerticesFailRatherThanEmittingAnEmptyScene(@TempDir Path dir) throws Exception {
        ObjectNode cadir = emptyCadir();
        ArrayNode tessellations = (ArrayNode) cadir.with("model").get("tessellations");
        tessellations.add(tessellation(new float[0][], null, new int[0][]));
        Path cadirPath = write(dir, "blank.cadir.json", cadir);

        CadirToGlbBuilder.Result result = CadirToGlbBuilder.build(cadirPath, dir.resolve("x.glb"), "sldasm");

        assertThat(result.success()).isFalse();
        assertThat(result.error()).contains("no tessellated geometry");
    }

    @Test
    void missingOrCorruptCadirIsReportedNotBuilt(@TempDir Path dir) throws Exception {
        assertThat(CadirToGlbBuilder.build(dir.resolve("absent.json"), dir.resolve("a.glb"), "sldprt")
                .success()).isFalse();

        Path empty = dir.resolve("zero.json");
        Files.write(empty, new byte[0]);
        assertThat(CadirToGlbBuilder.build(empty, dir.resolve("b.glb"), "sldprt").error())
                .contains("empty CADIR");

        Path junk = dir.resolve("junk.json");
        Files.writeString(junk, "this is not json");
        assertThat(CadirToGlbBuilder.build(junk, dir.resolve("c.glb"), "sldprt").error())
                .contains("could not be parsed");
    }

    @Test
    void fidelitySidecarLossCodesAreReported(@TempDir Path dir) throws Exception {
        ObjectNode fidelity = MAPPER.createObjectNode();
        ArrayNode losses = fidelity.putObject("report").putArray("losses");
        losses.addObject().putObject("code").put("code", "FACES_DROPPED");
        losses.addObject().put("code", "BODIES_APPROXIMATED");
        Path cadir = dir.resolve("model.cadir.json");
        Files.writeString(cadir, "{}");
        Files.writeString(dir.resolve("model.cadir.fidelity.json"), MAPPER.writeValueAsString(fidelity));

        assertThat(CadirToGlbBuilder.readFidelityLosses(cadir))
                .isEqualTo("FACES_DROPPED; BODIES_APPROXIMATED");
        assertThat(CadirToGlbBuilder.readFidelityLosses(dir.resolve("other.cadir.json"))).isNull();
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private static ObjectNode emptyCadir() {
        ObjectNode cadir = MAPPER.createObjectNode();
        ObjectNode model = cadir.putObject("model");
        model.putArray("tessellations");
        return cadir;
    }

    /** One tessellation node with the same field names cadmpeg emits. */
    private static ObjectNode tessellation(float[][] vertices, float[][] normals, int[][] triangles) {
        ObjectNode t = MAPPER.createObjectNode();
        ArrayNode v = t.putArray("vertices");
        for (float[] vertex : vertices) {
            v.addObject().put("x", vertex[0]).put("y", vertex[1]).put("z", vertex[2]);
        }
        if (normals != null) {
            ArrayNode n = t.putArray("normals");
            for (float[] normal : normals) {
                n.addObject().put("x", normal[0]).put("y", normal[1]).put("z", normal[2]);
            }
        }
        ArrayNode tris = t.putArray("triangles");
        for (int[] tri : triangles) {
            ArrayNode one = tris.addArray();
            one.add(tri[0]).add(tri[1]).add(tri[2]);
        }
        return t;
    }

    private static Path write(Path dir, String name, JsonNode node) throws Exception {
        Path path = dir.resolve(name);
        Files.write(path, MAPPER.writeValueAsBytes(node));
        return path;
    }

    /** Extract and parse the GLB's JSON chunk (independent of the builder's own writers). */
    private static JsonNode readJsonChunk(Path glb) throws Exception {
        byte[] bytes = Files.readAllBytes(glb);
        ByteBuffer buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        assertThat(buf.getInt()).isEqualTo(0x46546C67);
        assertThat(buf.getInt()).isEqualTo(2);
        assertThat(buf.getInt()).isEqualTo(bytes.length);
        int jsonLength = buf.getInt();
        assertThat(buf.getInt()).isEqualTo(0x4E4F534A);
        byte[] json = new byte[jsonLength];
        buf.get(json);
        return MAPPER.readTree(new String(json, StandardCharsets.UTF_8));
    }
}
