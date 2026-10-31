package com.vishatech.erp.cad;

/**
 * Identifies which conversion provider owns a given file type.
 *
 * DIRECT_BROWSER     — geometry is served to the browser as-is (GLB/GLTF/STL/OBJ).
 *                      No backend conversion is required.
 * OPEN_CASCADE       — provider slot for the self-hosted STEP/STP/IGES/IGS ->
 *                      GLB conversion engine. The legacy engine that filled this
 *                      slot has been removed, so no engine registers under it
 *                      today and those formats honestly resolve UNSUPPORTED.
 * CADMPEG            — cadmpeg: decodes the SolidWorks container into CADIR and
 *                      reads SolidWorks' own tessellation out of it. This is the
 *                      pipeline the Mech R&D viewer used and the preferred engine
 *                      for SLDPRT/SLDASM when the binary is installed.
 * FREECAD            — legacy FreeCAD path (only used for SLDPRT/SLDASM when a
 *                      genuine SolidWorks importer is detected). Not used for the
 *                      supported STEP workflow.
 * SOLIDWORKS_LOCAL   — (reserved) licensed local SolidWorks conversion.
 * SAT_ACIS           — ACIS SAT: cadmpeg decodes the B-rep to a neutral STEP and
 *                      the self-hosted OpenCascade tessellator turns it into a
 *                      GLB. Used only for .sat files.
 */
public enum CadConversionProvider {

    DIRECT_BROWSER("Direct Browser Viewing (no conversion)"),
    OPEN_CASCADE("OpenCascade (Self-hosted)"),
    CADMPEG("cadmpeg (SolidWorks CADIR)"),
    FREECAD("FreeCAD"),
    SOLIDWORKS_LOCAL("SolidWorks (Local)"),
    SAT_ACIS("ACIS SAT (cadmpeg + OpenCascade)"),
    NONE("No conversion provider");

    private final String displayName;

    CadConversionProvider(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
