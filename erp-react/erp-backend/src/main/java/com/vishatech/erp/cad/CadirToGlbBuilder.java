package com.vishatech.erp.cad;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * CADIR (cadmpeg's JSON intermediate) → glTF 2.0 binary (GLB).
 *
 * <p>Direct port of the proven Mech R&amp;D conversion step
 * ({@code server/cad-converter.cjs}, "Step 2 / Step 3"): the tessellation that
 * <b>SolidWorks itself computed</b> is read out of {@code model.tessellations[]}
 * and written straight into a GLB — no re-tessellation, no STEP intermediate
 * (AP214 cannot carry tessellated geometry), and no invented geometry.
 *
 * <pre>
 *   cadir.model.tessellations[i].vertices[{x,y,z}]   → POSITION   (float32 VEC3)
 *   cadir.model.tessellations[i].normals[{x,y,z}]    → NORMAL     (float32 VEC3)
 *   cadir.model.tessellations[i].triangles[[a,b,c]]  → indices    (uint16, or
 *                                                                  uint32 when a
 *                                                                  tessellation has
 *                                                                  more than 65535
 *                                                                  vertices)
 * </pre>
 *
 * <p>Layout rules kept from the reference implementation: one mesh + material +
 * node per tessellation (each tessellation is one body/face), the same 15-entry
 * CAD body palette cycled by index, PBR material parameters
 * (metallic 0.15 / roughness 0.55), accessor min/max on POSITION, 4-byte aligned
 * bufferViews with {@code target} set, and a single embedded buffer.
 *
 * <p>Deliberate, documented divergence: when a tessellation carries no usable
 * normals (empty array, or a count that does not match the vertex count) the
 * NORMAL attribute is omitted for that primitive instead of writing an
 * empty accessor. The reference emitted a zero-length normal accessor in that
 * case, which is invalid glTF and makes viewers misbehave; omitting the
 * attribute lets the viewer derive flat normals from the real geometry.
 *
 * <p>Nothing is ever faked: if the CADIR carries no tessellation with vertices,
 * this fails with a reason instead of writing a placeholder model.
 */
public final class CadirToGlbBuilder {

    private static final Logger log = LoggerFactory.getLogger(CadirToGlbBuilder.class);

    private static final int MAGIC_GLTF = 0x46546C67;  // 'glTF'
    private static final int CHUNK_JSON = 0x4E4F534A;  // 'JSON'
    private static final int CHUNK_BIN = 0x004E4942;   // 'BIN\0'
    private static final int TARGET_ARRAY_BUFFER = 34962;
    private static final int TARGET_ELEMENT_ARRAY_BUFFER = 34963;
    private static final int COMPONENT_FLOAT = 5126;
    private static final int COMPONENT_UINT16 = 5123;
    private static final int COMPONENT_UINT32 = 5125;
    /** uint16 indices are only valid while a tessellation stays within 65535 vertices. */
    private static final int MAX_UINT16_VERTICES = 65535;

    /** Professional CAD body palette — identical to the reference implementation. */
    private static final float[][] PALETTE = {
        {0.13f, 0.59f, 0.95f},  // Vibrant Blue
        {0.12f, 0.53f, 0.90f},  // Bright Blue
        {0.10f, 0.46f, 0.82f},  // Medium Blue
        {0.26f, 0.65f, 0.96f},  // Light Blue
        {0.05f, 0.28f, 0.63f},  // Deep Blue
        {0.27f, 0.35f, 0.39f},  // Blue Grey
        {0.47f, 0.56f, 0.61f},  // Light Blue Grey
        {0.33f, 0.43f, 0.48f},  // Medium Blue Grey
        {0.47f, 0.33f, 0.28f},  // Brown
        {0.78f, 0.16f, 0.16f},  // Vibrant Red
        {0.83f, 0.18f, 0.18f},  // Bright Red
        {0.08f, 0.40f, 0.75f},  // Strong Blue
        {0.22f, 0.28f, 0.31f},  // Dark Charcoal
        {0.53f, 0.68f, 0.62f},  // Teal
        {0.85f, 0.65f, 0.13f},  // Gold
    };

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Outcome of a CADIR → GLB build. {@code error} is safe to show a user. */
    public record Result(boolean success,
                         String error,
                         Path glb,
                         int meshes,
                         long vertices,
                         long triangles) {

        static Result failed(String error) {
            return new Result(false, error, null, 0, 0, 0);
        }
    }

    private CadirToGlbBuilder() {
    }

    /**
     * Build {@code glbOut} from {@code cadirJson}.
     *
     * @param cadirJson        cadmpeg's CADIR output
     * @param glbOut           destination GLB (overwritten)
     * @param sourceExtension  source extension (lower-case, no dot) — used only to
     *                         explain an assembly that carries no geometry
     */
    public static Result build(Path cadirJson, Path glbOut, String sourceExtension) {
        if (cadirJson == null || !Files.isRegularFile(cadirJson)) {
            return Result.failed("the CAD engine produced no CADIR output");
        }

        JsonNode root;
        try {
            byte[] bytes = Files.readAllBytes(cadirJson);
            if (bytes.length == 0) {
                return Result.failed("the CAD engine produced an empty CADIR file");
            }
            try {
                root = MAPPER.readTree(bytes);
            } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
                return Result.failed("the CADIR output could not be parsed");
            }
        } catch (IOException e) {
            return Result.failed("the CADIR output could not be read");
        } catch (RuntimeException e) {
            return Result.failed("the CADIR output could not be parsed");
        }

        JsonNode model = root.path("model");
        JsonNode tessellations = model.path("tessellations");
        if (!tessellations.isArray() || tessellations.isEmpty()) {
            return Result.failed(explainNoGeometry(model, sourceExtension));
        }

        try {
            return buildGlb(model, tessellations, glbOut, sourceExtension);
        } catch (IOException e) {
            return Result.failed("the converted 3D file could not be written");
        } catch (RuntimeException e) {
            log.warn("CADIR → GLB build failed", e);
            return Result.failed("the CADIR tessellation data could not be converted");
        }
    }

    private static Result buildGlb(JsonNode model, JsonNode tessellations, Path glbOut, String sourceExtension)
            throws IOException {

        ObjectNode gltf = MAPPER.createObjectNode();
        ArrayNode accessors = gltf.putArray("accessors");
        ArrayNode bufferViews = gltf.putArray("bufferViews");
        ArrayNode meshes = gltf.putArray("meshes");
        ArrayNode materials = gltf.putArray("materials");
        ArrayNode nodes = gltf.putArray("nodes");
        ArrayNode sceneNodes = MAPPER.createArrayNode();

        ByteArrayOutputStream bin = new ByteArrayOutputStream(1 << 20);
        long vertices = 0;
        long triangles = 0;
        int meshIndex = 0;

        for (JsonNode tessellation : tessellations) {
            JsonNode vertexNodes = tessellation.path("vertices");
            if (!vertexNodes.isArray() || vertexNodes.isEmpty()) {
                // The reference skips empty tessellations rather than failing the model.
                continue;
            }
            JsonNode triangleNodes = tessellation.path("triangles");
            if (!triangleNodes.isArray() || triangleNodes.isEmpty()) {
                continue;
            }

            int vertexCount = vertexNodes.size();
            int triangleCount = triangleNodes.size();

            ByteBuffer positions = ByteBuffer.allocate(vertexCount * 3 * Float.BYTES)
                    .order(ByteOrder.LITTLE_ENDIAN);
            float minX = Float.MAX_VALUE, minY = Float.MAX_VALUE, minZ = Float.MAX_VALUE;
            float maxX = -Float.MAX_VALUE, maxY = -Float.MAX_VALUE, maxZ = -Float.MAX_VALUE;
            for (JsonNode v : vertexNodes) {
                float x = (float) v.path("x").asDouble();
                float y = (float) v.path("y").asDouble();
                float z = (float) v.path("z").asDouble();
                positions.putFloat(x).putFloat(y).putFloat(z);
                minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
            }

            JsonNode normalNodes = tessellation.path("normals");
            boolean usableNormals = normalNodes.isArray() && normalNodes.size() == vertexCount;

            ByteBuffer indices = vertexCount <= MAX_UINT16_VERTICES
                    ? ByteBuffer.allocate(triangleCount * 3 * Short.BYTES).order(ByteOrder.LITTLE_ENDIAN)
                    : ByteBuffer.allocate(triangleCount * 3 * Integer.BYTES).order(ByteOrder.LITTLE_ENDIAN);
            for (JsonNode tri : triangleNodes) {
                if (!tri.isArray() || tri.size() < 3) {
                    continue;
                }
                int a = tri.get(0).asInt();
                int b = tri.get(1).asInt();
                int c = tri.get(2).asInt();
                if (vertexCount <= MAX_UINT16_VERTICES) {
                    indices.putShort((short) a).putShort((short) b).putShort((short) c);
                } else {
                    indices.putInt(a).putInt(b).putInt(c);
                }
            }

            // --- bufferViews (4-byte aligned, in the order the reference emits) ---
            int posOffset = bin.size();
            bin.write(positions.array());
            int posLength = positions.array().length;

            int normOffset = -1;
            int normLength = 0;
            if (usableNormals) {
                ByteBuffer normalBuf = ByteBuffer.allocate(vertexCount * 3 * Float.BYTES)
                        .order(ByteOrder.LITTLE_ENDIAN);
                for (JsonNode n : normalNodes) {
                    normalBuf.putFloat((float) n.path("x").asDouble())
                            .putFloat((float) n.path("y").asDouble())
                            .putFloat((float) n.path("z").asDouble());
                }
                normOffset = bin.size();
                bin.write(normalBuf.array());
                normLength = normalBuf.array().length;
            }

            int idxOffset = bin.size();
            bin.write(indices.array());
            int idxLength = indices.array().length;

            // --- accessors ---
            int posAccessor = accessors.size();
            ObjectNode posAcc = accessors.addObject();
            posAcc.put("bufferView", bufferViews.size());
            posAcc.put("componentType", COMPONENT_FLOAT);
            posAcc.put("count", vertexCount);
            posAcc.put("type", "VEC3");
            posAcc.putArray("min").add(minX).add(minY).add(minZ);
            posAcc.putArray("max").add(maxX).add(maxY).add(maxZ);

            ObjectNode posView = bufferViews.addObject();
            posView.put("buffer", 0);
            posView.put("byteOffset", posOffset);
            posView.put("byteLength", posLength);
            posView.put("target", TARGET_ARRAY_BUFFER);

            int normAccessor = -1;
            if (usableNormals) {
                normAccessor = accessors.size();
                ObjectNode normAcc = accessors.addObject();
                normAcc.put("bufferView", bufferViews.size());
                normAcc.put("componentType", COMPONENT_FLOAT);
                normAcc.put("count", vertexCount);
                normAcc.put("type", "VEC3");

                ObjectNode normView = bufferViews.addObject();
                normView.put("buffer", 0);
                normView.put("byteOffset", normOffset);
                normView.put("byteLength", normLength);
                normView.put("target", TARGET_ARRAY_BUFFER);
            }

            int idxAccessor = accessors.size();
            ObjectNode idxAcc = accessors.addObject();
            idxAcc.put("bufferView", bufferViews.size());
            idxAcc.put("componentType",
                    vertexCount <= MAX_UINT16_VERTICES ? COMPONENT_UINT16 : COMPONENT_UINT32);
            idxAcc.put("count", triangleCount * 3);
            idxAcc.put("type", "SCALAR");

            ObjectNode idxView = bufferViews.addObject();
            idxView.put("buffer", 0);
            idxView.put("byteOffset", idxOffset);
            idxView.put("byteLength", idxLength);
            idxView.put("target", TARGET_ELEMENT_ARRAY_BUFFER);

            // --- mesh / material / node (one per body, reference palette) ---
            float[] color = PALETTE[meshIndex % PALETTE.length];
            ObjectNode material = materials.addObject();
            material.put("name", "Body_" + (meshIndex + 1));
            ObjectNode pbr = material.putObject("pbrMetallicRoughness");
            ArrayNode baseColor = pbr.putArray("baseColorFactor");
            baseColor.add(color[0]).add(color[1]).add(color[2]).add(1.0);
            pbr.put("metallicFactor", 0.15);
            pbr.put("roughnessFactor", 0.55);

            ObjectNode mesh = meshes.addObject();
            mesh.put("name", "Body_" + (meshIndex + 1));
            ObjectNode primitive = mesh.putArray("primitives").addObject();
            ObjectNode attributes = primitive.putObject("attributes");
            attributes.put("POSITION", posAccessor);
            if (usableNormals) {
                attributes.put("NORMAL", normAccessor);
            }
            primitive.put("indices", idxAccessor);
            primitive.put("material", meshIndex);

            nodes.addObject().put("name", "Body_" + (meshIndex + 1)).put("mesh", meshIndex);
            sceneNodes.add(meshIndex);

            vertices += vertexCount;
            triangles += triangleCount;
            meshIndex++;
        }

        if (meshIndex == 0) {
            return Result.failed(explainNoGeometry(model, sourceExtension));
        }

        byte[] binData = bin.toByteArray();
        gltf.putObject("asset").put("version", "2.0").put("generator", "cadmpeg-sldprt-converter");
        gltf.put("scene", 0);
        ObjectNode scene = gltf.putArray("scenes").addObject();
        scene.put("name", "Model");
        scene.set("nodes", sceneNodes);
        gltf.putArray("buffers").addObject().put("byteLength", binData.length);

        byte[] json = MAPPER.writeValueAsBytes(gltf);
        int jsonPad = (4 - (json.length % 4)) % 4;
        int binPad = (4 - (binData.length % 4)) % 4;
        long totalLength = 12L + 8L + json.length + jsonPad + 8L + binData.length + binPad;
        if (totalLength > Integer.MAX_VALUE) {
            return Result.failed("the converted geometry is too large for a single GLB file");
        }

        ByteBuffer out = ByteBuffer.allocate((int) totalLength).order(ByteOrder.LITTLE_ENDIAN);
        out.putInt(MAGIC_GLTF);
        out.putInt(2);
        out.putInt((int) totalLength);
        out.putInt(json.length + jsonPad);
        out.putInt(CHUNK_JSON);
        out.put(json);
        for (int i = 0; i < jsonPad; i++) {
            out.put((byte) 0x20); // glTF spec: pad the JSON chunk with spaces
        }
        out.putInt(binData.length + binPad);
        out.putInt(CHUNK_BIN);
        out.put(binData);
        for (int i = 0; i < binPad; i++) {
            out.put((byte) 0x00);
        }

        if (glbOut.getParent() != null) {
            Files.createDirectories(glbOut.getParent());
        }
        Files.write(glbOut, out.array());

        log.info("CADIR → GLB: {} mesh(es), {} vertices, {} triangles, {} bytes ({})",
                meshIndex, vertices, triangles, out.array().length, sourceExtension);
        return new Result(true, null, glbOut, meshIndex, vertices, triangles);
    }

    /**
     * A precise, user-safe reason for "the engine produced a CADIR but no
     * geometry": counts of what WAS in the container, plus the fidelity losses
     * cadmpeg recorded, plus (for assemblies) the structural explanation from the
     * reference implementation.
     */
    private static String explainNoGeometry(JsonNode model, String sourceExtension) {
        int streams = 0;
        for (var it = model.fieldNames(); it.hasNext(); ) {
            String field = it.next();
            if (model.get(field).isArray() && !model.get(field).isEmpty()) {
                streams++;
            }
        }
        long bodies = model.path("bodies").size();
        long faces = model.path("faces").size();
        long occurrences = model.path("occurrences").size();

        StringBuilder sb = new StringBuilder();
        sb.append("The CAD engine decoded the file but extracted no tessellated geometry");
        sb.append(" (").append(streams).append(" model stream(s) present, ")
                .append(bodies).append(" body(s), ").append(faces).append(" face(s))");
        if (occurrences > 0) {
            sb.append(". This assembly references ").append(occurrences)
                    .append(" component occurrence(s) whose solid geometry lives in separate part files");
        }
        sb.append('.');
        return sb.toString();
    }

    /**
     * Read the cadmpeg fidelity sidecar ({@code *.fidelity.json}) next to the
     * CADIR and return the loss codes it recorded, or {@code null}. Used for
     * diagnostics only — never for a success decision.
     */
    public static String readFidelityLosses(Path cadirJson) {
        if (cadirJson == null) {
            return null;
        }
        String name = cadirJson.getFileName().toString();
        String base = name.toLowerCase().endsWith(".json")
                ? name.substring(0, name.length() - ".json".length())
                : name;
        Path sidecar = cadirJson.resolveSibling(base + ".fidelity.json");
        if (!Files.isRegularFile(sidecar)) {
            return null;
        }
        try {
            JsonNode losses = MAPPER.readTree(Files.readAllBytes(sidecar))
                    .path("report").path("losses");
            if (!losses.isArray() || losses.isEmpty()) {
                return null;
            }
            StringBuilder sb = new StringBuilder();
            for (JsonNode loss : losses) {
                JsonNode code = loss.path("code");
                String text = code.isObject() ? code.path("code").asText(null) : code.asText(null);
                if (text != null && !text.isBlank()) {
                    if (sb.length() > 0) {
                        sb.append("; ");
                    }
                    sb.append(text);
                }
            }
            return sb.length() == 0 ? null : sb.toString();
        } catch (Exception e) {
            return null;
        }
    }
}
