package com.vishatech.erp.cad;

import java.util.Set;

/**
 * Which file types the browser can render itself, which ones the conversion
 * pipeline must handle, and which ones this build can only store and offer for
 * download. This is CAD capability knowledge, so it lives with the conversion
 * engine that owns it rather than on the Production conversion-status column.
 *
 * <p>The distinction matters to callers: a format is only advertised as viewable
 * when a real loader or engine can handle it, and everything else is reported
 * stored-only (accepted, downloadable, no preview) instead of being given a fake
 * preview or the generic "Unsupported file type" message.
 */
public final class CadFileTypes {

    /**
     * Mesh formats the browser viewer parses directly with a bundled Three.js
     * loader, in addition to the original GLB/GLTF/STL/OBJ set. GLB/GLTF/STL/OBJ
     * keep their original substring matching in {@link #isBrowserNative(String)};
     * these three are matched exactly because each real loader is wired for one
     * concrete extension:
     *
     *   PLY  — PLYLoader (ASCII and binary)
     *   DAE  — ColladaLoader (COLLADA XML, .dae)
     *   3DS  — TDSLoader (3D Studio chunk stream)
     *
     * Formats with no bundled loader (X3D, OFF) are deliberately absent: they
     * are stored-only and never claim a preview they cannot produce.
     */
    private static final Set<String> BROWSER_MESH_TYPES = Set.of("ply", "dae", "3ds");

    /**
     * Recognised CAD / native-CAD formats that this build accepts and stores but
     * cannot convert: no available engine (FreeCAD / cadmpeg / local SolidWorks)
     * reads them, so they are reported stored-only instead of being presented as
     * viewable. They are still valuable in the Models list — the ORIGINAL file is
     * kept for download and for downstream tooling.
     */
    private static final Set<String> RECOGNISED_STORED_ONLY_TYPES = Set.of(
        // Parasolid kernel
        "x_t", "x_b",
        // Rhino / JT / 3D XML
        "3dm", "jt", "3dxml",
        // SolidWorks drawing sheet (parts/assemblies are converted by the engine)
        "slddrw",
        // CATIA
        "catpart", "catproduct", "catdrawing",
        // Siemens NX / PTC Creo
        "prt", "asm", "drw",
        // Autodesk Inventor
        "ipt", "iam", "idw",
        // Solid Edge
        "par", "dft",
        // Fusion 360 / FreeCAD / Blender / OpenSCAD
        "f3d", "f3z", "fcstd", "blend", "scad"
    );

    /** Formats that load directly in the browser with no backend conversion. */
    public static boolean isBrowserNative(String fileType) {
        String ft = (fileType == null ? "" : fileType).toLowerCase().replace(".", "");
        return ft.contains("glb") || ft.contains("gltf") || ft.contains("stl") || ft.contains("obj")
            || BROWSER_MESH_TYPES.contains(ft);
    }

    /**
     * True for recognised formats that can only be stored + downloaded here
     * (no converter exists for them in this architecture). Used both by upload
     * true-type detection (their declared extension stays authoritative, like
     * SLDPRT/SLDASM) and by the conversion registry to report an actionable
     * message instead of the generic "Unsupported file type".
     */
    public static boolean isRecognisedStoredOnly(String fileType) {
        String ft = (fileType == null ? "" : fileType).toLowerCase().replace(".", "");
        return RECOGNISED_STORED_ONLY_TYPES.contains(ft);
    }

    /** True for formats that need no backend conversion at all (browser/known geometry). */
    public static boolean isDirect(String fileType) {
        // Browser-native formats only (GLB/GLTF/STL/OBJ).
        return isBrowserNative(fileType);
    }

    /**
     * Formats that must go through a backend conversion engine to be viewed in
     * the browser. STEP/STP, IGES/IGS and BREP require a registered STEP->GLB
     * engine to produce a GLB preview; with none registered they honestly resolve
     * to UNSUPPORTED rather than a fake preview. Note SLDPRT/SLDASM are deliberately NOT
     * listed here: they are stored-only (no preview) and must be exported to
     * STEP first.
     */
    public static boolean requiresBackendConversion(String fileType) {
        String ft = (fileType == null ? "" : fileType).toLowerCase().replace(".", "");
        return "step".equals(ft) || "stp".equals(ft)
            || "iges".equals(ft) || "igs".equals(ft)
            || "brep".equals(ft);
    }

    private CadFileTypes() {
    }
}
