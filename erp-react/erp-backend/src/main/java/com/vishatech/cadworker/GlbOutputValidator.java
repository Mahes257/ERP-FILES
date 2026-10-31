package com.vishatech.cadworker;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Validates that a conversion actually produced a usable GLB.
 *
 * <p>Nothing is ever marked READY on the strength of "a file exists": a GLB
 * must carry the correct magic, declare a length matching the file, describe at
 * least one mesh with at least one accessor, and (for embedded buffers) contain
 * real vertex data in its binary chunk. That is what makes a failed or empty
 * conversion report FAILED instead of shipping an empty preview as a success.
 *
 * <p>Deliberately dependency-light and static so it is unit-testable without a
 * Spring context.
 */
public final class GlbOutputValidator {

    private static final int GLB_HEADER_SIZE = 12;
    private static final int CHUNK_HEADER_SIZE = 8;
    private static final int MAGIC_GLTF = 0x46546C67; // 'glTF'
    private static final int CHUNK_JSON = 0x4E4F534A;  // 'JSON'
    private static final int CHUNK_BIN = 0x004E4942;   // 'BIN\0'
    /** Sanity bound for the JSON chunk (scene description, not vertex data). */
    private static final long MAX_JSON_CHUNK = 64L * 1024 * 1024;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Result of a validation: valid, or valid=false with a safe reason. */
    public record Result(boolean valid, String reason) {
        public static Result ok() {
            return new Result(true, null);
        }

        public static Result fail(String reason) {
            return new Result(false, reason);
        }
    }

    public Result validate(Path file) {
        try {
            if (file == null || !Files.isRegularFile(file)) {
                return Result.fail("the conversion produced no output file");
            }
            long size = Files.size(file);
            if (size < GLB_HEADER_SIZE + CHUNK_HEADER_SIZE) {
                return Result.fail("the output file is too small to be a GLB");
            }
            if (size > Integer.MAX_VALUE) {
                return Result.fail("the output file is unexpectedly large");
            }

            byte[] header = Files.readAllBytes(file); // bounded by max-file-size
            ByteBuffer buf = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);

            int magic = buf.getInt();
            if (magic != MAGIC_GLTF) {
                return Result.fail("the output is not a GLB file");
            }
            int version = buf.getInt();
            if (version != 2) {
                return Result.fail("unsupported GLB version " + version);
            }
            long declaredLength = Integer.toUnsignedLong(buf.getInt());
            if (declaredLength != size) {
                return Result.fail("the GLB header declares " + declaredLength
                        + " bytes but the file is " + size + " bytes");
            }

            // Walk the chunks.
            String jsonChunk = null;
            long binBytes = 0;
            int offset = GLB_HEADER_SIZE;
            while (offset + CHUNK_HEADER_SIZE <= header.length) {
                ByteBuffer chunk = ByteBuffer.wrap(header, offset, CHUNK_HEADER_SIZE).order(ByteOrder.LITTLE_ENDIAN);
                long chunkLength = Integer.toUnsignedLong(chunk.getInt());
                int chunkType = chunk.getInt();
                offset += CHUNK_HEADER_SIZE;
                if (chunkLength < 0 || offset + chunkLength > header.length) {
                    return Result.fail("the GLB contains a truncated chunk");
                }
                if (chunkType == CHUNK_JSON) {
                    jsonChunk = new String(header, offset, (int) chunkLength, StandardCharsets.UTF_8);
                } else if (chunkType == CHUNK_BIN) {
                    binBytes += chunkLength;
                }
                offset += (int) chunkLength;
                // Chunks are 4-byte aligned; malformed lengths already returned.
            }

            if (jsonChunk == null) {
                return Result.fail("the GLB has no scene description chunk");
            }
            if (jsonChunk.getBytes(StandardCharsets.UTF_8).length > MAX_JSON_CHUNK) {
                return Result.fail("the GLB scene description is unexpectedly large");
            }

            JsonNode root = MAPPER.readTree(jsonChunk);
            JsonNode meshes = root.path("meshes");
            if (!meshes.isArray() || meshes.isEmpty()) {
                return Result.fail("the GLB contains no mesh geometry");
            }
            JsonNode accessors = root.path("accessors");
            if (!accessors.isArray() || accessors.isEmpty()) {
                return Result.fail("the GLB contains no vertex accessors");
            }
            // Embedded buffers must be backed by a real binary chunk.
            JsonNode buffers = root.path("buffers");
            if (buffers.isArray()) {
                boolean hasEmbedded = false;
                for (JsonNode buffer : buffers) {
                    if (!buffer.hasNonNull("uri")) {
                        hasEmbedded = true;
                        break;
                    }
                }
                if (hasEmbedded && binBytes == 0) {
                    return Result.fail("the GLB has no vertex data chunk");
                }
            }
            return Result.ok();
        } catch (IOException e) {
            return Result.fail("the output file could not be read");
        } catch (RuntimeException e) {
            return Result.fail("the output file could not be inspected");
        }
    }
}
