package com.vishatech.erp.cad;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Content-signature detection for CAD model files.
 *
 * Real-world uploads frequently carry wrong extensions (a STEP exported as
 * ".stp" is fine, but ".sldprt"-named STEP files or zero-byte placeholders
 * also appear in plant storage). The extension decides which pipeline renders
 * the file, so the CONTENT must agree with it. This sniffer reads only the
 * first kilobyte and classifies the actual format:
 *
 *   STEP  — "ISO-10303-21" magic
 *   IGES  — fixed-80-column records with S/G/D/P section flags in column 73
 *   GLB   — "glTF" magic + version 2
 *   STL   — "solid" token (ASCII) or 80-byte header + uint32 triangle count
 *   OBJ   — "#"/"v "/"vn "/"f " line starts
 *   PLY   — "ply" header (ASCII or binary PLY both start with it)
 *   DAE   — XML COLLADA document ("<COLLADA" root element)
 *   3DS   — 3D Studio chunk stream (0x4D4D main chunk id)
 *   VRML  — "#VRML" header
 *   3MF   — PK zip magic that genuinely carries an OPC/3MF payload
 *   FBX   — "Kaydara FBX Binary" magic or plain-text header
 *   BREP  — "DBRep_" / "CASCADE Topology" magic
 *   PDF   — "%PDF-" magic (2D drawing/document uploads)
 *   SVG   — XML/text document with an "<svg" root element
 *   DWG   — "AC10xx" version magic
 *   DXF   — ASCII "SECTION" records / binary DXF sentinel
 *   BINARY/UNKNOWN — proprietary opaque formats (SLDPRT/SLDASM/X_T/CATPart/...)
 *
 * IMPORTANT — container ambiguity: several unrelated formats are also ZIP
 * containers (F3D/F3Z/FCStd …). PK magic alone therefore does NOT prove 3MF;
 * the package must also expose an OPC/3MF entry name. Otherwise the file is
 * reported BINARY so the caller keeps the declared extension instead of
 * silently re-typing (and mis-rendering) the upload as a 3MF model.
 *
 * The result lets the ModelService (a) correct mislabeled file types at
 * upload, and (b) reject placeholder/corrupt files early with a precise
 * message instead of a doomed conversion job later.
 */
public final class CadContentSniffer {

    private CadContentSniffer() {
    }

    public enum Format {
        STEP, IGES, GLB, GLTF_JSON, STL_ASCII, STL_BINARY, OBJ, PLY, COLLADA, THREE_DS,
        VRML, THREE_MF, FBX, BREP, PDF, SVG, DWG, DXF, BINARY, EMPTY, UNKNOWN
    }

    /**
     * Classify the actual content of the file at {@code path}.
     * Never throws for unreadable content beyond returning EMPTY/UNKNOWN.
     */
    public static Format sniff(Path path) {
        byte[] head;
        try {
            if (!Files.exists(path) || Files.size(path) == 0) {
                return Format.EMPTY;
            }
            head = readHead(path, 1024);
        } catch (IOException e) {
            return Format.UNKNOWN;
        }
        if (head.length == 0) {
            return Format.EMPTY;
        }

        // GLB: "glTF" magic, version uint32 LE == 2
        if (head.length >= 12
                && head[0] == 0x67 && head[1] == 0x6C && head[2] == 0x54 && head[3] == 0x46) {
            long version = (head[4] & 0xFFL) | ((head[5] & 0xFFL) << 8)
                    | ((head[6] & 0xFFL) << 16) | ((head[7] & 0xFFL) << 24);
            return version == 2 ? Format.GLB : Format.BINARY;
        }

        String text = new String(head, StandardCharsets.ISO_8859_1);
        String trimmed = text.stripLeading();

        if (trimmed.startsWith("ISO-10303-21")) {
            return Format.STEP;
        }
        if (trimmed.startsWith("DBRep_") || trimmed.startsWith("CASCADE Topology")) {
            return Format.BREP;
        }
        if (trimmed.startsWith("#VRML")) {
            return Format.VRML;
        }
        if (trimmed.startsWith("Kaydara FBX Binary")) {
            return Format.FBX;
        }
        // PDF — 2D drawings/documents are uploaded alongside native CAD files.
        if (trimmed.startsWith("%PDF-")) {
            return Format.PDF;
        }
        // DWG — Autodesk version magic ("AC1015" … "AC1032").
        if (trimmed.startsWith("AC10")) {
            return Format.DWG;
        }
        // PLY — ASCII and binary PLY both open with the "ply" header token.
        if (trimmed.startsWith("ply")) {
            return Format.PLY;
        }
        // XML-based geometry: SVG (2D) and COLLADA (DAE, 3D). Both may be
        // preceded by an XML declaration, so the root element decides.
        if (trimmed.startsWith("<?xml")) {
            if (text.contains("<COLLADA")) {
                return Format.COLLADA;
            }
            if (text.contains("<svg")) {
                return Format.SVG;
            }
        }
        if (trimmed.startsWith("<COLLADA")) {
            return Format.COLLADA;
        }
        if (trimmed.startsWith("<svg")) {
            return Format.SVG;
        }
        // ASCII DXF opens with a group code "0" followed by SECTION (after
        // optional 999 comment groups); binary DXF carries its own sentinel.
        if (text.contains("AutoCAD Binary DXF") || trimmed.matches("(?s)^0\\s*\r?\n?SECTION.*")) {
            return Format.DXF;
        }
        // IGES: fixed-length records, section letter in column 73 (index 72)
        int nl = text.indexOf('\n');
        if (nl >= 73) {
            char flag = text.charAt(72);
            if (flag == 'S' || flag == 'G' || flag == 'D' || flag == 'P') {
                return Format.IGES;
            }
        }
        // ZIP container. 3MF is an OPC package, so PK magic alone is not proof:
        // F3D/F3Z/FCStd and other ZIP-based formats share it. Only report 3MF
        // when the package actually exposes an OPC / 3MF entry name; otherwise
        // fall through to BINARY so the caller keeps the declared extension.
        if (trimmed.startsWith("PK\u0003\u0004")) {
            if (text.contains("[Content_Types].xml") || text.contains("3dmodel.model")) {
                return Format.THREE_MF;
            }
            return Format.BINARY;
        }
        // OBJ: comment / vertex / normal / face line starts
        if (trimmed.startsWith("#") || trimmed.startsWith("v ") || trimmed.startsWith("vn ")
                || trimmed.startsWith("vt ") || trimmed.startsWith("f ")) {
            return Format.OBJ;
        }
        // STL ASCII: literal "solid" token. STL BINARY files begin with an
        // 80-byte header that MAY also start with "solid", so also require the
        // triangle-count field at bytes 80..84 to be consistent with the size
        // when the file is long enough — otherwise trust ASCII.
        if (trimmed.startsWith("solid")) {
            if (head.length >= 84) {
                long triCount = (head[80] & 0xFFL) | ((head[81] & 0xFFL) << 8)
                        | ((head[82] & 0xFFL) << 16) | ((head[83] & 0xFFL) << 24);
                long declaredBinary = 84L + triCount * 50L;
                try {
                    long size = Files.size(path);
                    if (declaredBinary == size) {
                        return Format.STL_BINARY;
                    }
                } catch (IOException ignored) {
                    // fall through to ASCII
                }
            }
            return Format.STL_ASCII;
        }
        // STL binary without a "solid" header: common with vendor exporters.
        if (head.length >= 84) {
            long triCount = (head[80] & 0xFFL) | ((head[81] & 0xFFL) << 8)
                    | ((head[82] & 0xFFL) << 16) | ((head[83] & 0xFFL) << 24);
            try {
                long size = Files.size(path);
                if (triCount > 0 && 84L + triCount * 50L == size) {
                    return Format.STL_BINARY;
                }
            } catch (IOException ignored) {
                // fall through
            }
        }
        // 3DS — 3D Studio chunk stream. Checked AFTER the STL rules so a binary
        // STL whose opaque 80-byte header happens to start with 0x4D4D is still
        // recognised as STL: the main chunk id is 0x4D4D and bytes 2..5 hold the
        // chunk length, which must be a plausible value for this file.
        if (head.length >= 6 && (head[0] & 0xFF) == 0x4D && (head[1] & 0xFF) == 0x4D) {
            long chunkLen = (head[2] & 0xFFL) | ((head[3] & 0xFFL) << 8)
                    | ((head[4] & 0xFFL) << 16) | ((head[5] & 0xFFL) << 24);
            try {
                if (chunkLen >= 6 && chunkLen <= Files.size(path)) {
                    return Format.THREE_DS;
                }
            } catch (IOException ignored) {
                // fall through
            }
        }
        // glTF JSON (non-binary): {"asset": {..., "version": "2.0"
        if (trimmed.startsWith("{") && trimmed.contains("\"asset\"") && trimmed.contains("glTF")) {
            return Format.GLTF_JSON;
        }
        if (trimmed.startsWith("Kaydara") || trimmed.contains("FBXLevel")) {
            return Format.FBX;
        }
        if (isProbablyBinary(head)) {
            return Format.BINARY;
        }
        return Format.UNKNOWN;
    }

    /**
     * Map a sniffed Format to the file extension token the ERP pipeline
     * expects (lower-case, no dot). Returns null when no reliable mapping
     * exists — callers should then keep the declared extension.
     */
    public static String toExtension(Format format) {
        return switch (format) {
            case STEP -> "step";
            case IGES -> "iges";
            case GLB -> "glb";
            case GLTF_JSON -> "gltf";
            case STL_ASCII, STL_BINARY -> "stl";
            case OBJ -> "obj";
            case VRML -> "wrl";
            case PLY -> "ply";
            case COLLADA -> "dae";
            case THREE_DS -> "3ds";
            case THREE_MF -> "3mf";
            case FBX -> "fbx";
            case BREP -> "brep";
            case PDF -> "pdf";
            case SVG -> "svg";
            case DWG -> "dwg";
            case DXF -> "dxf";
            default -> null;
        };
    }

    private static byte[] readHead(Path path, int limit) throws IOException {
        try (var in = Files.newInputStream(path)) {
            byte[] buf = new byte[limit];
            int read = 0;
            int n;
            while (read < limit && (n = in.read(buf, read, limit - read)) > 0) {
                read += n;
            }
            return read == buf.length ? buf : java.util.Arrays.copyOf(buf, read);
        }
    }

    private static boolean isProbablyBinary(byte[] head) {
        int suspicious = 0;
        int limit = Math.min(head.length, 512);
        for (int i = 0; i < limit; i++) {
            byte b = head[i];
            if (b == 0) {
                suspicious++;
            } else if (b < 0x09 || (b > 0x0D && b < 0x20 && b != 0x1B)) {
                suspicious++;
            }
        }
        return suspicious > limit / 4;
    }
}
