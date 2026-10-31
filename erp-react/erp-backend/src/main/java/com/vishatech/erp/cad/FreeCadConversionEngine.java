package com.vishatech.erp.cad;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Optional, configuration-driven FreeCAD -> GLB conversion engine.
 *
 * <p>Activated only when {@code app.cad-convert.freecad-enabled=true}. The
 * executable is never hardcoded and never version-specific: it is read from
 * {@code app.cad-convert.freecad-command} (a full path such as
 * {@code C:\Program Files\FreeCAD 1.0\bin\FreeCADCmd.exe}, or a command name
 * resolved on PATH). When the property is empty the engine auto-discovers a
 * FreeCAD install under the standard Windows locations
 * ({@code %ProgramFiles%\FreeCAD *\bin\FreeCADCmd.exe / FreeCAD.exe}),
 * so "C:\Program Files\FreeCAD &lt;version&gt;\bin\FreeCAD.exe" is supported
 * without baking in a version.</p>
 *
 * <p>Capability is probed, never assumed:</p>
 * <ul>
 *   <li>Neutral formats stock FreeCAD genuinely imports through OpenCascade
 *       (STEP/STP/IGES/IGS/BREP) are supported whenever the executable exists.</li>
 *   <li>SLDPRT/SLDASM are supported ONLY when the configured FreeCAD build
 *       actually ships a SolidWorks importer (e.g. a CADExchanger-backed
 *       build). Stock FreeCAD has no native SolidWorks importer, so those
 *       formats stay honestly unsupported instead of failing obscurely.</li>
 * </ul>
 *
 * <p>Invocation is safe: only the configured/discovered executable is run,
 * never a shell, never user-supplied commands. The conversion Python script is
 * written to the (per-run) output workspace and deleted afterwards. A
 * configurable timeout forcibly terminates the process.</p>
 */
@Component
public class FreeCadConversionEngine implements CadConversionEngine {

    private static final Logger log = LoggerFactory.getLogger(FreeCadConversionEngine.class);

    /** Neutral formats stock FreeCAD reads natively (via its OpenCascade core). */
    private static final Set<String> NEUTRAL_TYPES = Set.of("step", "stp", "iges", "igs", "brep");

    /** Proprietary SolidWorks formats — only if a genuine importer is detected. */
    private static final Set<String> SLD_TYPES = Set.of("sldprt", "sldasm");

    @Value("${app.cad-convert.freecad-enabled:false}")
    private boolean enabled;

    /** Full path or command name; blank means "auto-discover". Never a hardcoded path. */
    @Value("${app.cad-convert.freecad-command:}")
    private String configuredCommand;

    @Value("${app.cad-convert.freecad-timeout-seconds:240}")
    private long timeoutSeconds;

    /** Cached probe result for the SolidWorks importer. */
    private volatile Boolean swImporterAvailable;

    public boolean isEnabled() {
        return enabled;
    }

    public String getConfiguredCommand() {
        return configuredCommand == null ? "" : configuredCommand.trim();
    }

    @Override
    public String getName() {
        return "freecad";
    }

    /**
     * Resolve the actual FreeCAD executable: configured path/command first,
     * Windows auto-discovery when the property is blank. Returns {@code null}
     * when no usable executable exists — {@link #getConfigurationIssue()}
     * explains why.
     */
    public File resolveExecutable() {
        String cmd = getConfiguredCommand();
        if (!cmd.isEmpty()) {
            File direct = new File(cmd);
            if (direct.isFile()) {
                return direct;
            }
            // The configured value may be a bare command name (e.g. "FreeCADCmd");
            // resolve it on PATH before declaring a configuration error.
            File onPath = findOnPath(cmd);
            return onPath != null ? onPath : null;
        }
        return discoverWindowsInstall();
    }

    /**
     * Human-readable configuration problem, or {@code null} when the engine is
     * either disabled (nothing to configure) or fully usable.
     */
    public String getConfigurationIssue() {
        if (!enabled) {
            return null;
        }
        if (resolveExecutable() != null) {
            return null;
        }
        String cmd = getConfiguredCommand();
        if (!cmd.isEmpty()) {
            return "FreeCAD conversion is enabled but the configured executable was not found: \""
                + cmd + "\". Check the app.cad-convert.freecad-command property.";
        }
        return "FreeCAD conversion is enabled but no FreeCAD executable was found. "
            + "Install FreeCAD, or set app.cad-convert.freecad-command to the FreeCADCmd.exe path.";
    }

    @Override
    public boolean supports(String fileType) {
        String ft = CadConversionEngine.normalizeFileType(fileType);
        if (!enabled || resolveExecutable() == null) {
            return false;
        }
        if (NEUTRAL_TYPES.contains(ft)) {
            return true;
        }
        if (SLD_TYPES.contains(ft)) {
            return hasSolidWorksImporter();
        }
        return false;
    }

    /**
     * Detect whether this FreeCAD build ships a genuine SolidWorks
     * (SLDPRT/SLDASM) importer. Probing is discovery-based: it asks FreeCAD's
     * own Import registry for its filter list and checks for "sldprt"/"sldasm".
     * FreeCAD's console binary does NOT execute Python read from stdin, so the
     * probe is written to a temp script and run with {@code --console <script>}.
     * Result is cached for the lifetime of the process.
     */
    public boolean hasSolidWorksImporter() {
        if (swImporterAvailable != null) {
            return swImporterAvailable;
        }
        File exe = resolveExecutable();
        if (exe == null) {
            swImporterAvailable = false;
            return false;
        }
        boolean found = false;
        Path script = null;
        try {
            String code = "try:\n"
                + "    import Import\n"
                + "    if hasattr(Import, 'ImportExportFiltersList'):\n"
                + "        filt = Import.ImportExportFiltersList()\n"
                + "        s = '|'.join(filt).lower()\n"
                + "        import sys\n"
                + "        sys.stdout.write('SLD_SUPPORT=' + str(('sldprt' in s) or ('sldasm' in s)) + '\\n')\n"
                + "except Exception as e:\n"
                + "    print('SLD_PROBE_ERR', e)\n"
                + "import sys\n"
                + "sys.exit(0)\n";
            script = Files.createTempFile("freecad_sld_probe_", ".py");
            Files.writeString(script, code);

            ProcessBuilder pb = new ProcessBuilder(exe.getAbsolutePath(), "--console", script.toString());
            pb.redirectErrorStream(true);
            Process p = pb.start();
            String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            boolean finished = p.waitFor(90, TimeUnit.SECONDS);
            if (!finished) {
                p.destroyForcibly();
                log.warn("FreeCAD SolidWorks importer probe timed out");
            }
            if (out.contains("SLD_SUPPORT=True")) {
                found = true;
            }
        } catch (Exception e) {
            log.warn("FreeCAD SolidWorks importer probe failed", e);
        } finally {
            if (script != null) {
                try {
                    Files.deleteIfExists(script);
                } catch (Exception ignored) {
                    // best-effort cleanup
                }
            }
        }
        swImporterAvailable = found;
        log.info("FreeCAD SolidWorks (SLDPRT/SLDASM) importer detected: {}", found);
        return found;
    }

    @Override
    public CadConversionResult convert(Path sourcePath, String outputBase, Path outputDir, String fileType) {
        File exe = resolveExecutable();
        if (exe == null) {
            String issue = getConfigurationIssue();
            return CadConversionResult.failed(
                issue != null ? issue : "FreeCAD executable not found (app.cad-convert.freecad-command)."
            );
        }

        String ft = CadConversionEngine.normalizeFileType(fileType);
        if (SLD_TYPES.contains(ft) && !hasSolidWorksImporter()) {
            return CadConversionResult.failed(
                "This FreeCAD build has no SolidWorks (SLDPRT/SLDASM) importer; "
                + "export the model as STEP (.step/.stp) instead."
            );
        }

        // Normalize to forward slashes for the FreeCAD Python console.
        String src = sourcePath.toAbsolutePath().toString().replace("\\", "/");
        Path target = outputDir.resolve(outputBase + ".glb").toAbsolutePath();
        String out = target.toString().replace("\\", "/");

        String script = String.format(
            "import FreeCAD, Mesh\n" +
            "doc = FreeCAD.openDocument('%s')\n" +
            "shapes = [o for o in doc.Objects if hasattr(o, 'Shape')]\n" +
            "total = Mesh.Mesh()\n" +
            "for o in shapes:\n" +
            "    try:\n" +
            "        if o.Shape and not o.Shape.isNull():\n" +
            "            m = Mesh.Mesh()\n" +
            "            m.addFacets(o.Shape.tessellate(0.5))\n" +
            "            total.addMesh(m)\n" +
            "    except Exception:\n" +
            "        pass\n" +
            "if total.CountPoints == 0:\n" +
            "    raise RuntimeError('no 3D output was generated from source model')\n" +
            "Mesh.write(total, '%s')\n" +
            "import sys\n" +
            "sys.exit(0)\n",
            src, out
        );

        Path scriptPath = null;
        try {
            if (!Files.isDirectory(outputDir)) {
                Files.createDirectories(outputDir);
            }
            scriptPath = outputDir.resolve("convert_" + System.nanoTime() + ".py");
            Files.writeString(scriptPath, script);

            ProcessBuilder pb = new ProcessBuilder(exe.getAbsolutePath(), "--console", scriptPath.toString());
            pb.redirectErrorStream(true);
            Process process = pb.start();
            boolean finished = process.waitFor(timeoutSeconds, TimeUnit.SECONDS);

            if (!finished) {
                process.destroyForcibly().waitFor(5, TimeUnit.SECONDS);
                return CadConversionResult.failed(
                    "CAD conversion timed out after " + timeoutSeconds + "s");
            }
            if (process.exitValue() != 0) {
                return CadConversionResult.failed(
                    "FreeCAD exited with code " + process.exitValue());
            }

            if (Files.exists(target) && Files.size(target) > 0) {
                return CadConversionResult.success(target.toString());
            }
            return CadConversionResult.failed("FreeCAD finished but produced no GLB output.");
        } catch (Exception e) {
            log.error("FreeCAD conversion failed", e);
            return CadConversionResult.failed("CAD conversion failed: " + e.getMessage());
        } finally {
            if (scriptPath != null) {
                try {
                    Files.deleteIfExists(scriptPath);
                } catch (Exception ignored) {
                    // best-effort cleanup; outputDir is the per-model cache dir
                }
            }
        }
    }

    // ────────────────────────────────────────────────────────────
    // Discovery helpers
    // ────────────────────────────────────────────────────────────

    /** Windows auto-discovery: PATH first, then %ProgramFiles%\FreeCAD *\bin. */
    private File discoverWindowsInstall() {
        for (String name : new String[]{"FreeCADCmd", "freecadcmd", "FreeCAD", "freecad"}) {
            File onPath = findOnPath(name);
            if (onPath != null) {
                return onPath;
            }
        }
        List<String> roots = new ArrayList<>();
        String pf = System.getenv("ProgramFiles");
        String pfX86 = System.getenv("ProgramFiles(x86)");
        if (pf != null) roots.add(pf);
        if (pfX86 != null) roots.add(pfX86);
        for (String root : roots) {
            File base = new File(root);
            File[] dirs = base.listFiles(f -> f.isDirectory() && f.getName().toLowerCase(Locale.ROOT).startsWith("freecad"));
            if (dirs == null) continue;
            for (File dir : dirs) {
                File bin = new File(dir, "bin");
                File cmd = new File(bin, "FreeCADCmd.exe");
                if (cmd.isFile()) return cmd;
                File gui = new File(bin, "FreeCAD.exe");
                if (gui.isFile()) return gui;
            }
        }
        return null;
    }

    private File findOnPath(String command) {
        String path = System.getenv("PATH");
        if (path == null) return null;
        String lower = command.toLowerCase(Locale.ROOT);
        for (String dir : path.split(java.util.regex.Pattern.quote(File.pathSeparator))) {
            if (dir == null || dir.isBlank()) continue;
            for (String candidate : new String[]{command, lower.endsWith(".exe") ? command : command + ".exe"}) {
                File f = new File(dir, candidate);
                if (f.isFile()) return f;
            }
        }
        return null;
    }
}
