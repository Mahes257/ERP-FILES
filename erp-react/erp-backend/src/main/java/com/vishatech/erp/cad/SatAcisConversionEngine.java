package com.vishatech.erp.cad;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * ACIS SAT → GLB conversion.
 *
 * <p>SAT carries B-rep geometry only, and no free standalone tessellator for it
 * exists. This engine therefore chains <b>two real, already-present</b>
 * components — it invents nothing:
 *
 * <pre>
 *   1. cadmpeg  SAT ──decode B-rep──▶ neutral STEP (AP214)
 *   2. node + occt-import-js  STEP ──real OpenCascade tessellation──▶ CADIR tessellations
 *   3. CadirToGlbBuilder  CADIR ──▶ GLB   (the SAME builder/artifact pipeline
 *                                          every other converted format uses)
 * </pre>
 *
 * <p>STEP is an <b>intermediate only</b>: the ERP artifact and the Model Viewer
 * still receive a GLB exactly like SLDPRT/SLDASM do. The OpenCascade tessellation
 * is the same kernel the repository already ships for its in-browser STEP/IGES
 * previews ({@code occt-import-js}), run headlessly by its own
 * {@code tools/cad/sat/step-to-cadir.cjs} helper.</p>
 *
 * <p><b>Honesty rules:</b>
 * <ul>
 *   <li>Unavailable (no cadmpeg, no Node, no tessellator script, or no
 *       occt-import-js importer) → the engine is reported unavailable with an
 *       actionable reason; conversion is refused, never faked. Availability is
 *       detected at every worker start, so installing or removing any link of
 *       the chain only needs a restart — never a source change.</li>
 *   <li>A STEP with no tessellatable faces fails with the real reason; a
 *       placeholder preview is never produced.</li>
 *   <li>Timeouts destroy the child process and fail the job; a partial GLB is
 *       never published.</li>
 * </ul>
 *
 * <p><b>Security:</b> every external process is started through
 * {@link ProcessBuilder} with an <b>argument array</b> — never a shell string —
 * so a user-supplied file name can never become a command. The input is the
 * worker's private staging copy, never the original ERP file (read-only).
 *
 * <p><b>Portability:</b> no machine-specific path is hardcoded. cadmpeg is
 * resolved exactly as the SolidWorks engine resolves it; Node defaults to the
 * {@code node}/{@code node.exe} on {@code PATH}; the tessellator script is
 * discovered under the project's {@code tools/cad/sat/} directory. All three can
 * be overridden with configuration / environment variables.
 */
@Component
public class SatAcisConversionEngine implements CadConversionEngine {

    private static final Logger log = LoggerFactory.getLogger(SatAcisConversionEngine.class);

    /** The only ACIS text format this engine accepts (the worker's allow-list). */
    private static final String SAT_TYPE = "sat";

    private static final String STEP_SUFFIX = ".step";
    private static final String CADIR_SUFFIX = ".cadir.json";
    private static final String GLB_SUFFIX = ".glb";

    private static final String SCRIPT_RELATIVE_PATH = "tools/cad/sat/step-to-cadir.cjs";

    private static final int MAX_CAPTURED_OUTPUT = 16 * 1024;

    private final CadmpegConversionEngine cadmpeg;

    @Value("${app.cad-convert.sat-enabled:true}")
    private boolean enabled;

    /** Node executable: full path or a bare command name resolved on PATH. Blank = PATH. */
    @Value("${app.cad-convert.sat-node-path:}")
    private String configuredNodePath;

    /** Tessellator script path. Blank = auto-discover under the project tools directory. */
    @Value("${app.cad-convert.sat-tessellator-script:}")
    private String configuredScript;

    /** Absolute occt-import-js package directory for a packaged deployment. Blank = normal resolution. */
    @Value("${app.cad-convert.sat-occt-module:}")
    private String configuredOcctModule;

    /**
     * Per-step timeout. MUST stay below the worker's hard timeout
     * (app.cad.worker.timeout-seconds, default 420) so this engine fails first
     * with its own reason instead of being killed by the worker.
     */
    @Value("${app.cad-convert.sat-timeout-seconds:300}")
    private long timeoutSeconds;

    public SatAcisConversionEngine(CadmpegConversionEngine cadmpeg) {
        this.cadmpeg = cadmpeg;
    }

    @Override
    public String getName() {
        return "acis-sat";
    }

    @Override
    public boolean supports(String fileType) {
        return enabled && SAT_TYPE.equals(CadConversionEngine.normalizeFileType(fileType));
    }

    public boolean isEnabled() {
        return enabled;
    }

    public long getTimeoutSeconds() {
        return timeoutSeconds;
    }

    /** cadmpeg resolved through the existing SolidWorks engine (same binary/config). */
    public File resolveCadmpegExecutable() {
        return cadmpeg != null ? cadmpeg.resolveExecutable() : null;
    }

    /**
     * The Node.js executable, or {@code null} when it is not installed here.
     * Order: configured path (file, then PATH lookup) → {@code node} on PATH.
     */
    public File resolveNodeExecutable() {
        String configured = getConfiguredNodePath();
        if (!configured.isEmpty()) {
            File direct = new File(configured);
            if (direct.isFile()) {
                return direct;
            }
            return isBareCommand(configured) ? findOnPath(configured) : null;
        }
        return findOnPath(nodeName());
    }

    /**
     * The STEP→CADIR tessellator script, or {@code null} when it cannot be found.
     * Order: configured path → {@code <user.dir>/tools/cad/sat/step-to-cadir.cjs}
     * and its parents (the repository layout, whether the backend is started from
     * the repo root or from {@code erp-backend/}).
     */
    public File resolveTessellatorScript() {
        String configured = getConfiguredScript();
        if (!configured.isEmpty()) {
            File direct = new File(configured);
            return direct.isFile() ? direct : null;
        }
        String userDir = System.getProperty("user.dir");
        if (userDir == null || userDir.isBlank()) {
            return null;
        }
        List<Path> candidates = new ArrayList<>();
        try {
            Path base = Path.of(userDir);
            candidates.add(base.resolve(SCRIPT_RELATIVE_PATH));
            candidates.add(base.resolve("..").resolve(SCRIPT_RELATIVE_PATH));
            candidates.add(base.resolve("../..").resolve(SCRIPT_RELATIVE_PATH));
        } catch (RuntimeException ignored) {
            return null;
        }
        for (Path candidate : candidates) {
            try {
                File file = candidate.normalize().toFile();
                if (file.isFile()) {
                    return file;
                }
            } catch (RuntimeException ignored) {
                // An unusable candidate must never turn "not found" into an error.
            }
        }
        return null;
    }

    /** The explicit occt-import-js module directory, or {@code null} when not configured. */
    public File resolveOcctModule() {
        String configured = getConfiguredOcctModule();
        if (configured.isEmpty()) {
            return null;
        }
        File dir = new File(configured);
        return dir.isDirectory() ? dir : null;
    }

    /**
     * The occt-import-js package the tessellator will actually load, or
     * {@code null} when it cannot be found. Mirrors the helper's own resolution
     * exactly — the same precedence, so "available" here means "will load at
     * convert time":
     * <ol>
     *   <li>{@code app.cad-convert.sat-occt-module} (packaged deployments),</li>
     *   <li>the {@code OCCT_IMPORT_JS_MODULE} environment variable the helper
     *       reads directly (when set, the helper never falls back),</li>
     *   <li>Node's normal walk-up from the script itself:
     *       {@code <ancestor>/node_modules/occt-import-js}.</li>
     * </ol>
     * A directory only counts when it carries a {@code package.json} — that is
     * what {@code require()} needs to load it, so an empty or half-installed
     * directory never turns SAT into a "available" claim that would fail at
     * convert time.
     */
    public File resolveOcctDependency() {
        String configured = getConfiguredOcctModule();
        if (!configured.isEmpty()) {
            return usablePackageDir(new File(configured));
        }
        String env = System.getenv("OCCT_IMPORT_JS_MODULE");
        if (env != null && !env.isBlank()) {
            // Set in the environment: the helper honours it unconditionally, so
            // a bad value here is an unusable chain, not a fallback.
            return usablePackageDir(new File(env.trim()));
        }
        File script = resolveTessellatorScript();
        if (script == null) {
            return null;
        }
        try {
            Path dir = script.toPath().toAbsolutePath().getParent();
            while (dir != null) {
                File usable = usablePackageDir(dir.resolve("node_modules").resolve("occt-import-js").toFile());
                if (usable != null) {
                    return usable;
                }
                dir = dir.getParent();
            }
        } catch (RuntimeException ignored) {
            return null;
        }
        return null;
    }

    /** A directory {@code require()} could load: it exists and has a package.json. */
    private static File usablePackageDir(File dir) {
        try {
            return dir != null && dir.isDirectory() && new File(dir, "package.json").isFile()
                    ? dir
                    : null;
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    /**
     * True when the COMPLETE existing dependency chain is usable here:
     * cadmpeg, Node, the tessellator script and the occt-import-js importer.
     * Every link must be present — SAT is never partially enabled.
     */
    public boolean isAvailable() {
        return enabled
                && resolveCadmpegExecutable() != null
                && resolveNodeExecutable() != null
                && resolveTessellatorScript() != null
                && resolveOcctDependency() != null;
    }

    /**
     * Actionable, path-free reason the engine cannot convert here, or
     * {@code null} when it is disabled (nothing to configure) or usable. The
     * text mentions only property/env names — never this machine's absolute
     * paths — because it is surfaced through the authenticated health API.
     */
    public String getConfigurationIssue() {
        if (!enabled) {
            return null;
        }
        if (resolveTessellatorScript() == null) {
            return "3D conversion unavailable: the SAT (ACIS) tessellator helper was not found. "
                + "It ships with the project at tools/cad/sat/step-to-cadir.cjs; set "
                + "app.cad-convert.sat-tessellator-script (ERP_SAT_TESSELLATOR_SCRIPT) if it "
                + "lives elsewhere.";
        }
        if (resolveNodeExecutable() == null) {
            return "3D conversion unavailable: Node.js was not found on this server, and the SAT "
                + "(ACIS) tessellator runs on it. Install Node.js (or point "
                + "app.cad-convert.sat-node-path / ERP_SAT_NODE_PATH at it). Until then export the "
                + "model as STEP (.step/.stp) and upload the STEP file for a 3D preview.";
        }
        if (resolveCadmpegExecutable() == null) {
            String issue = cadmpeg != null ? cadmpeg.getConfigurationIssue() : null;
            return issue != null
                ? issue
                : "3D conversion unavailable: cadmpeg is not installed on this server. SAT (ACIS) "
                    + "files are decoded by cadmpeg; export the model as STEP (.step/.stp) instead.";
        }
        if (resolveOcctDependency() == null) {
            return "3D conversion unavailable: the OpenCascade importer (occt-import-js) could not be "
                + "found for the SAT tessellator. Install the project's Node dependencies "
                + "(npm install), or point app.cad-convert.sat-occt-module (ERP_SAT_OCCT_MODULE) "
                + "at the occt-import-js package directory. Until then export the model as STEP "
                + "(.step/.stp) and upload the STEP file for a 3D preview.";
        }
        return null;
    }

    @Override
    public CadConversionResult convert(Path sourcePath, String outputBase, Path outputDir, String fileType) {
        if (!isAvailable()) {
            String issue = getConfigurationIssue();
            return CadConversionResult.failed(issue != null
                    ? issue
                    : "SAT (ACIS) conversion is disabled (app.cad-convert.sat-enabled=false).");
        }
        if (sourcePath == null || !Files.isRegularFile(sourcePath)) {
            return CadConversionResult.failed("the source CAD file is not available for conversion.");
        }

        File cadmpegExe = resolveCadmpegExecutable();
        File nodeExe = resolveNodeExecutable();
        File script = resolveTessellatorScript();

        Path step = outputDir.resolve(outputBase + STEP_SUFFIX);
        Path cadir = outputDir.resolve(outputBase + CADIR_SUFFIX);
        Path glb = outputDir.resolve(outputBase + GLB_SUFFIX);

        try {
            Files.createDirectories(outputDir);

            // ── 1. cadmpeg: ACIS SAT (B-rep) → neutral STEP ──────────────────
            List<String> cadmpegCommand = List.of(
                    cadmpegExe.getAbsolutePath(),
                    "convert",
                    sourcePath.toAbsolutePath().toString(),
                    "-o",
                    step.toAbsolutePath().toString(),
                    "--allow-errors",
                    "--force");
            ProcessOutcome decode = run(cadmpegCommand, outputDir, timeoutSeconds, "cadmpeg", null);
            if (decode.timedOut) {
                return CadConversionResult.failed(
                        "SAT conversion timed out after " + timeoutSeconds + "s (cadmpeg ACIS decode).");
            }
            if (!Files.isRegularFile(step) || Files.size(step) == 0) {
                log.info("cadmpeg produced no STEP for SAT (exit {}, {} chars of output)",
                        decode.exitCode, decode.output.length());
                return CadConversionResult.failed(
                        "The CAD engine could not decode this ACIS SAT file (cadmpeg exit code "
                                + decode.exitCode + "). " + summarize(decode.output));
            }

            // ── 2. Node + occt-import-js: STEP → CADIR tessellations ─────────
            List<String> nodeCommand = new ArrayList<>();
            nodeCommand.add(nodeExe.getAbsolutePath());
            nodeCommand.add(script.getAbsolutePath());
            nodeCommand.add(step.toAbsolutePath().toString());
            nodeCommand.add(cadir.toAbsolutePath().toString());
            ProcessOutcome tessellate = run(nodeCommand, outputDir, timeoutSeconds, "sat-tessellator",
                    resolveOcctModule());
            if (tessellate.timedOut) {
                return CadConversionResult.failed(
                        "SAT conversion timed out after " + timeoutSeconds + "s (OpenCascade tessellation).");
            }
            if (!Files.isRegularFile(cadir) || Files.size(cadir) == 0) {
                log.info("the SAT tessellator produced no CADIR (exit {}, {} chars of output)",
                        tessellate.exitCode, tessellate.output.length());
                return CadConversionResult.failed(
                        "The OpenCascade tessellator could not produce geometry from the decoded SAT "
                                + "model (exit code " + tessellate.exitCode + "). "
                                + summarize(tessellate.output));
            }

            // ── 3. CADIR → GLB (the shared, existing builder) ────────────────
            CadirToGlbBuilder.Result built = CadirToGlbBuilder.build(cadir, glb, SAT_TYPE);
            if (!built.success()) {
                return CadConversionResult.failed(built.error());
            }

            log.info("SAT conversion succeeded: {} mesh(es), {} vertices, {} triangles",
                    built.meshes(), built.vertices(), built.triangles());
            return CadConversionResult.success(glb.toAbsolutePath().toString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return CadConversionResult.failed("SAT conversion was interrupted.");
        } catch (Exception e) {
            log.warn("SAT conversion failed", e);
            return CadConversionResult.failed(
                    "The SAT conversion engine could not be executed: " + e.getClass().getSimpleName() + ".");
        }
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    private static final class ProcessOutcome {
        final int exitCode;
        final boolean timedOut;
        final StringBuilder output;

        ProcessOutcome(int exitCode, boolean timedOut, StringBuilder output) {
            this.exitCode = exitCode;
            this.timedOut = timedOut;
            this.output = output;
        }
    }

    /**
     * Run a child process with a hard timeout, capturing its output for
     * diagnostics. {@code occtModule}, when non-null, is exported to the child as
     * {@code OCCT_IMPORT_JS_MODULE} so a packaged deployment can point the
     * tessellator at its occt-import-js package.
     */
    private ProcessOutcome run(List<String> command, Path workDir, long timeout, String label, File occtModule)
            throws IOException, InterruptedException {
        ProcessBuilder pb = new ProcessBuilder(command)
                .directory(workDir.toFile())
                .redirectErrorStream(true);
        if (occtModule != null) {
            pb.environment().put("OCCT_IMPORT_JS_MODULE", occtModule.getAbsolutePath());
        }
        Process process = pb.start();
        StringBuilder output = new StringBuilder();
        Thread drain = new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (output.length() < MAX_CAPTURED_OUTPUT) {
                        output.append(line).append('\n');
                    }
                }
            } catch (Exception ignored) {
                // Output capture is diagnostic only.
            }
        }, label + "-output");
        drain.setDaemon(true);
        drain.start();

        try {
            boolean finished = process.waitFor(timeout, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                process.waitFor(5, TimeUnit.SECONDS);
                return new ProcessOutcome(-1, true, output);
            }
            drain.join(2000);
            return new ProcessOutcome(process.exitValue(), false, output);
        } finally {
            if (process.isAlive()) {
                process.destroyForcibly();
            }
        }
    }

    private String getConfiguredNodePath() {
        return configuredNodePath == null ? "" : configuredNodePath.trim();
    }

    private String getConfiguredScript() {
        return configuredScript == null ? "" : configuredScript.trim();
    }

    private String getConfiguredOcctModule() {
        return configuredOcctModule == null ? "" : configuredOcctModule.trim();
    }

    private static String nodeName() {
        boolean windows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
        return windows ? "node.exe" : "node";
    }

    /** True when the value is a command name (no directories), so PATH applies. */
    private static boolean isBareCommand(String value) {
        return !value.contains("/")
                && !value.contains("\\")
                && !value.matches("^[A-Za-z]:.*");
    }

    /** PATH lookup that tolerates unusable PATH entries. */
    private static File findOnPath(String command) {
        String pathEnv = System.getenv("PATH");
        if (pathEnv == null) {
            return null;
        }
        for (String dir : pathEnv.split(Pattern.quote(File.pathSeparator))) {
            if (dir.isBlank()) {
                continue;
            }
            try {
                File candidate = Path.of(dir, command).toFile();
                if (candidate.isFile()) {
                    return candidate;
                }
            } catch (RuntimeException ignored) {
                // Invalid PATH entry — skip it and keep looking.
            }
        }
        return null;
    }

    /** A short, user-safe line distilled from a child process's output. */
    private static String summarize(StringBuilder output) {
        String text = output.toString();
        StringBuilder sb = new StringBuilder();
        for (String line : text.split("\\R")) {
            String trimmed = line.strip();
            if (!trimmed.isEmpty()) {
                if (sb.length() > 0) {
                    sb.append("; ");
                }
                sb.append(trimmed);
            }
            if (sb.length() > 300) {
                break;
            }
        }
        if (sb.length() == 0) {
            return "The file may not contain transferable geometry.";
        }
        String summary = sb.toString();
        return summary.length() > 300 ? summary.substring(0, 300) : summary;
    }
}
