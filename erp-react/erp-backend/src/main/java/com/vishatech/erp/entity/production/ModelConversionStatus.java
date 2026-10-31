package com.vishatech.erp.entity.production;

/**
 * Conversion status values for the Model.conversionStatus column.
 *
 * NOT_REQUIRED  — browser/viewable or stored-only format (GLB/GLTF/STL/OBJ and
 *                 non-previewable SLDPRT/SLDASM); no backend conversion needed.
 * NOT_CONVERTED — STEP/STP/IGES/IGS uploaded; backend conversion not yet produced.
 * QUEUED        — a conversion job has been submitted to the worker pool but has not started.
 * PROCESSING    — an async conversion job is running.
 * READY         — a converted GLB/glTF representation exists and may be viewed.
 * FAILED        — the conversion job threw an error (see conversionError).
 * UNSUPPORTED   — no compatible conversion engine/provider is available for this format.
 *
 * <p>This class is the <em>column's</em> vocabulary only. Which file types the
 * browser can render, which need an engine and which this build can only store is
 * CAD capability knowledge and lives with the conversion engine in
 * {@code com.vishatech.erp.cad.CadFileTypes}, so the Production entity package no
 * longer has to know how the pipeline classifies formats.
 */
public final class ModelConversionStatus {

    public static final String NOT_REQUIRED = "NOT_REQUIRED";
    public static final String NOT_CONVERTED = "NOT_CONVERTED";
    public static final String QUEUED = "QUEUED";
    public static final String PROCESSING = "PROCESSING";
    public static final String READY = "READY";
    public static final String FAILED = "FAILED";
    public static final String UNSUPPORTED = "UNSUPPORTED";

    /** True while a conversion job is pending or running. */
    public static boolean isInFlight(String status) {
        return QUEUED.equals(status) || PROCESSING.equals(status);
    }

    private ModelConversionStatus() {
    }
}
