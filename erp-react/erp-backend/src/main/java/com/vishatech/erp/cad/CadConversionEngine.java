package com.vishatech.erp.cad;

import java.nio.file.Path;
import java.util.Locale;

/**
 * Abstraction for a CAD -> GLB conversion engine.
 *
 * SLDPRT/SLDASM are proprietary SolidWorks formats. There is no open-source
 * library that reliably reconstructs their native geometry, so the actual
 * conversion is performed by an external engine (currently FreeCAD). This
 * interface keeps the conversion pipeline decoupled from any specific tool so
 * a dedicated CAD conversion engine can be plugged in later without changing
 * the Model service or controller.
 */
public interface CadConversionEngine {

    /**
     * Return the engine identifier (e.g. "freecad").
     */
    String getName();

    /**
     * Return whether this engine can convert the given file type.
     *
     * @param fileType lower-cased extension (e.g. ".sldprt", ".sldasm")
     */
    boolean supports(String fileType);

    /**
     * Convert a CAD source file to a GLB file in the output directory.
     * This call is expected to be executed on a dedicated worker thread and may
     * block for a long time.
     *
     * @param sourcePath   the original CAD file
     * @param outputBase   base file name (without extension) for the output GLB
     * @param outputDir    directory where the GLB should be written
     * @param fileType     lower-cased source extension (e.g. ".sldprt")
     */
    CadConversionResult convert(Path sourcePath, String outputBase, Path outputDir, String fileType);

    /**
     * Default helper: normalize a file type/extension to a lower-cased string
     * without leading dots, e.g. "SLDPRT" -> "sldprt".
     */
    static String normalizeFileType(String fileType) {
        if (fileType == null) return "";
        return fileType.trim().toLowerCase(Locale.ROOT).replace(".", "");
    }
}
