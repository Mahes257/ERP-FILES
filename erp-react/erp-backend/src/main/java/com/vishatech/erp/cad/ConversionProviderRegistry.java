package com.vishatech.erp.cad;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Resolves the conversion provider + backing engine responsible for a given
 * file type, and reports one canonical, user-facing "unavailable" message when
 * no real convert capability exists.
 *
 * Selection rules:
 *  - DIRECT_BROWSER for GLB/GLTF/STL/OBJ (no backend convert).
 *  - OPEN_CASCADE for STEP/STP/IGES/IGS (provider slot for the self-hosted
 *    STEP -> GLB engine; currently no engine registers, so these formats
 *    resolve to the honest UNSUPPORTED state).
 *  - FREECAD for STEP/STP/IGES/IGS when a FreeCAD engine is enabled AND its
 *    executable was found (operator-configured preference over OpenCascade).
 *  - CADMPEG for SLDPRT/SLDASM whenever the cadmpeg binary is actually present:
 *    it is the engine the proven Mech R&D pipeline used (SolidWorks container →
 *    CADIR → SolidWorks' own tessellation → GLB), needs no license, and is the
 *    operator's configured preference.
 *  - SOLIDWORKS_LOCAL for SLDPRT/SLDASM only when a real local SolidWorks
 *    installation is detected (reserved).
 *  - SAT_ACIS for SAT whenever cadmpeg, Node and the OpenCascade tessellator
 *    helper are all present; otherwise the honest capability gap is reported.
 *  - FREECAD for SLDPRT/SLDASM only when a genuine SolidWorks importer is
 *    detected inside the configured FreeCAD build.
 *  - NONE otherwise -> callers report UNSUPPORTED with a message that
 *    distinguishes "engine not configured/installed" from "format cannot be
 *    converted by any available engine" (no fake geometry / no fake success).
 */
@Component
public class ConversionProviderRegistry {

    private final List<CadConversionEngine> engines;
    private final SolidWorksDetector solidWorksDetector;
    private final ObjectProvider<FreeCadConversionEngine> freeCadProvider;
    private final ObjectProvider<SolidWorksLocalConversionEngine> solidWorksProvider;
    private final ObjectProvider<CadmpegConversionEngine> cadmpegProvider;
    private final ObjectProvider<SatAcisConversionEngine> satProvider;

    public ConversionProviderRegistry(List<CadConversionEngine> engines,
                                      SolidWorksDetector solidWorksDetector,
                                      ObjectProvider<FreeCadConversionEngine> freeCadProvider,
                                      ObjectProvider<SolidWorksLocalConversionEngine> solidWorksProvider,
                                      ObjectProvider<CadmpegConversionEngine> cadmpegProvider,
                                      ObjectProvider<SatAcisConversionEngine> satProvider) {
        this.engines = engines;
        this.solidWorksDetector = solidWorksDetector;
        this.freeCadProvider = freeCadProvider;
        this.solidWorksProvider = solidWorksProvider;
        this.cadmpegProvider = cadmpegProvider;
        this.satProvider = satProvider;
    }

    /** The exact message used when SLDPRT/SLDASM have no conversion provider. */
    public static final String SLD_UNSUPPORTED_MESSAGE =
        "3D conversion unavailable: no SLDPRT-compatible CAD conversion engine is configured on this server. "
        + "Export the SolidWorks model as STEP (.step/.stp) and upload the STEP file for a 3D preview.";

    /** The exact message used when SAT has no conversion provider on this build. */
    public static final String SAT_UNSUPPORTED_MESSAGE =
        "3D conversion unavailable: no SAT (ACIS) conversion engine is configured on this server. "
        + "Export the model as STEP (.step/.stp) and upload the STEP file for a 3D preview.";

    /**
     * Describes how a given file type should be handled.
     */
    public ProviderResolution resolve(String fileType) {
        String ft = CadConversionEngine.normalizeFileType(fileType);

        // Browser-native formats never need backend conversion.
        if (CadFileTypes.isBrowserNative(ft)) {
            return new ProviderResolution(CadConversionProvider.DIRECT_BROWSER, null, true, null);
        }

        // STEP/STP/IGES/IGS and OpenCascade BREP -> GLB conversion. When a
        // FreeCAD engine is enabled AND its executable was found it is the
        // preferred engine; otherwise the self-hosted engine registered under
        // "opencascade" is used when one is present. No engine currently registers
        // under that name, so these formats fall through to the honest "not
        // available" message below. BREP is listed here because it is the
        // OpenCascade-native exchange format — the same engines that read STEP
        // read it — so it uses the SAME pipeline slot rather than a new one.
        if ("step".equals(ft) || "stp".equals(ft) || "iges".equals(ft) || "igs".equals(ft)
                || "brep".equals(ft)) {
            FreeCadConversionEngine fc = freeCadProvider.getIfAvailable();
            if (fc != null && fc.isEnabled() && fc.supports(ft)) {
                return new ProviderResolution(CadConversionProvider.FREECAD, fc, true, null);
            }
            CadConversionEngine oc = findByName("opencascade");
            boolean ocAvailable = oc != null && oc.supports(ft);
            return new ProviderResolution(
                CadConversionProvider.OPEN_CASCADE,
                oc,
                ocAvailable,
                ocAvailable ? null
                    : "CAD conversion engine is not available on this server. "
                      + "Upload STL/OBJ/GLB for direct 3D viewing, or check server configuration.");
        }

        // Proprietary SolidWorks formats. Preference order:
        //   1. CADMPEG — decodes the SolidWorks container and reads SolidWorks'
        //      own tessellation (SLDPRT/SLDASM -> CADIR -> GLB). This is the
        //      pipeline the proven Mech R&D viewer used, needs no license, and the
        //      binary is an external runtime dependency (reported precisely when
        //      it is missing instead of being pretended).
        //   2. SOLIDWORKS_LOCAL — a licensed local SolidWorks installation driven
        //      through its official COM API.
        //   3. FREECAD — only a FreeCAD build with a genuine SolidWorks importer
        //      (stock FreeCAD has no SLDPRT/SLDASM filter and is never pretended).
        //   4. Otherwise: honest UNSUPPORTED — no engine can read the file here.
        if ("sldprt".equals(ft) || "sldasm".equals(ft)) {
            // Reason to report when cadmpeg is the only engine that could serve
            // this format and it is not installed (never a fake success).
            String cadmpegIssue = null;
            CadmpegConversionEngine cm = cadmpegProvider.getIfAvailable();
            if (cm != null && cm.supports(ft)) {
                if (cm.resolveExecutable() != null) {
                    return new ProviderResolution(CadConversionProvider.CADMPEG, cm, true, null);
                }
                cadmpegIssue = cm.getConfigurationIssue();
            }

            SolidWorksLocalConversionEngine sw = solidWorksProvider.getIfAvailable();
            if (sw != null && solidWorksDetector.isAvailable() && sw.supports(ft)) {
                return new ProviderResolution(CadConversionProvider.SOLIDWORKS_LOCAL, sw, true, null);
            }
            FreeCadConversionEngine fc = freeCadProvider.getIfAvailable();
            if (fc != null && fc.supports(ft)) {
                return new ProviderResolution(CadConversionProvider.FREECAD, fc, true, null);
            }
            if (fc != null && fc.isEnabled()) {
                // FreeCAD is switched on but cannot do the job here: report the
                // precise capability gap. Never emit the generic "install
                // FreeCAD" hint for SLDPRT — stock FreeCAD has no native
                // SolidWorks importer, so installing it would not make this
                // file convertible. FreeCAD is named only because it is the
                // actually configured engine in this branch.
                if (fc.resolveExecutable() == null) {
                    return new ProviderResolution(
                        CadConversionProvider.NONE,
                        null,
                        false,
                        "3D conversion unavailable: the configured FreeCAD engine was not found on this server. "
                        + "SLDPRT/SLDASM cannot be converted here — export the SolidWorks model as STEP "
                        + "(.step/.stp) and upload the STEP file for a 3D preview.");
                }
                return new ProviderResolution(
                    CadConversionProvider.NONE,
                    null,
                    false,
                    "3D conversion unavailable: this FreeCAD build has no SolidWorks (SLDPRT/SLDASM) importer. "
                    + "Export the SolidWorks model as STEP (.step/.stp) and upload the STEP file for a 3D preview.");
            }
            if (cadmpegIssue != null) {
                // cadmpeg is the engine configured for this format; report exactly
                // why it cannot run rather than the generic "nothing configured".
                return new ProviderResolution(
                    CadConversionProvider.CADMPEG, null, false, cadmpegIssue);
            }
            return new ProviderResolution(CadConversionProvider.NONE, null, false, SLD_UNSUPPORTED_MESSAGE);
        }

        // ACIS SAT — cadmpeg decodes the B-rep to a neutral STEP and the
        // self-hosted OpenCascade tessellator turns that into a GLB. The provider
        // is reported available ONLY when cadmpeg, Node and the tessellator script
        // are all actually present; otherwise the honest capability gap is stated
        // (never a fake success).
        if ("sat".equals(ft)) {
            SatAcisConversionEngine sat = satProvider.getIfAvailable();
            if (sat != null && sat.supports(ft)) {
                if (sat.isAvailable()) {
                    return new ProviderResolution(CadConversionProvider.SAT_ACIS, sat, true, null);
                }
                return new ProviderResolution(
                    CadConversionProvider.NONE, null, false, sat.getConfigurationIssue());
            }
            return new ProviderResolution(
                CadConversionProvider.NONE, null, false, SAT_UNSUPPORTED_MESSAGE);
        }

        // Recognised native-CAD / vendor formats that this build stores but has
        // no engine for. Reporting the precise capability gap (instead of the
        // generic "Unsupported file type") is what keeps the Models list honest:
        // the original file is retained and downloadable, but no preview is
        // claimed because none can be produced here.
        if (CadFileTypes.isRecognisedStoredOnly(ft)) {
            return new ProviderResolution(
                CadConversionProvider.NONE,
                null,
                false,
                "Stored — no 3D preview: this server has no conversion engine for " + ft.toUpperCase()
                + " files. The original file is kept for download; export the model as STEP "
                + "(.step/.stp) and upload the STEP file for an in-browser 3D preview.");
        }

        return new ProviderResolution(CadConversionProvider.NONE, null, false, "Unsupported file type: " + ft);
    }

    private CadConversionEngine findByName(String name) {
        for (CadConversionEngine e : engines) {
            if (name.equalsIgnoreCase(e.getName())) {
                return e;
            }
        }
        return null;
    }

    /**
     * Immutable resolution result: which provider, which engine (may be null
     * for DIRECT_BROWSER), whether conversion is available, and the
     * user-facing message when unavailable.
     */
    public static final class ProviderResolution {
        public final CadConversionProvider provider;
        public final CadConversionEngine engine;
        public final boolean available;
        public final String unavailableMessage;

        public ProviderResolution(CadConversionProvider provider,
                                  CadConversionEngine engine,
                                  boolean available,
                                  String unavailableMessage) {
            this.provider = provider;
            this.engine = engine;
            this.available = available;
            this.unavailableMessage = unavailableMessage;
        }
    }
}
