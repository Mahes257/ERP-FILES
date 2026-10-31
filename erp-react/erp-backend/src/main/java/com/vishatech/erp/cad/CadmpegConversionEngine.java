package com.vishatech.erp.cad;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * SLDPRT / SLDASM → GLB conversion through <b>cadmpeg</b>, the engine behind
 * the proven Mech R&amp;D pipeline.
 *
 * <p>cadmpeg decodes the SolidWorks container into CADIR (a JSON intermediate
 * that preserves the tessellation SolidWorks itself computed); this engine then
 * turns that tessellation into a GLB entirely in-process — see
 * {@link CadirToGlbBuilder}. No STEP hop, no re-tessellation, no invented
 * geometry.
 *
 * <pre>
 *   cadmpeg convert &lt;input&gt; -o &lt;output&gt;.cadir.json --allow-errors --force
 *   CADIR → {@link CadirToGlbBuilder} → GLB (validated by the worker)
 * </pre>
 *
 * <p>Invocation is a {@link ProcessBuilder} <b>argument array</b> — never a shell
 * string — so the file name can never become a command. The input is the
 * worker's private staging copy ({@code <temp-root>/<jobId>/input/source.sldprt}),
 * never the original ERP file, which is only ever read.
 *
 * <p>Honesty rules:
 * <ul>
 *   <li>No executable → the engine is <b>unavailable</b> with an actionable
 *       message; conversion is refused, never attempted, never faked.</li>
 *   <li>cadmpeg exits non-zero but wrote a CADIR → that is a <b>normal</b> outcome
 *       for this tool (hence {@code --allow-errors}); the CADIR decides.</li>
 *   <li>Timeouts destroy the process and fail the job; a partial GLB is never
 *       published.</li>
 *   <li>A CADIR without tessellation data fails with the real reason (stream /
 *       body / face counts), because a placeholder preview would be a lie.</li>
 * </ul>
 *
 * <p><b>Platform:</b> the cadmpeg binary used by the reference pipeline is a
 * Windows executable. It is an external runtime dependency — it is not bundled
 * with this repository and is not installed automatically. Configure it with
 * {@code ERP_CADMPEG_PATH} / {@code app.cad-convert.cadmpeg-path}; when left
 * blank the engine looks in cadmpeg's documented location
 * ({@code %USERPROFILE%\.cargo\bin\cadmpeg.exe}) and then on {@code PATH}.
 *
 * <p><b>Auto-detection:</b> availability is re-evaluated from configuration
 * and the filesystem on every lookup (never cached across restarts), so
 * installing or removing cadmpeg only requires restarting the worker — no
 * source change. {@link #getVersion()} additionally proves the binary really
 * executes, for the authenticated health endpoint.
 */
@Component
public class CadmpegConversionEngine implements CadConversionEngine {

    private static final Logger log = LoggerFactory.getLogger(CadmpegConversionEngine.class);

    /** Formats cadmpeg decodes into CADIR. (SAT uses its own tessellator in the reference.) */
    private static final Set<String> SLD_TYPES = Set.of("sldprt", "sldasm");

    private static final String CADIR_SUFFIX = ".cadir.json";
    private static final String GLB_SUFFIX = ".glb";

    /** Cap on captured process output — enough for diagnostics, never unbounded. */
    private static final int MAX_CAPTURED_OUTPUT = 16 * 1024;

    @Value("${app.cad-convert.cadmpeg-enabled:true}")
    private boolean enabled;

    /** Full path, or a bare command name resolved on PATH. Blank = auto-discover. */
    @Value("${app.cad-convert.cadmpeg-path:}")
    private String configuredPath;

    /**
     * Engine-side timeout. MUST stay below the worker's hard timeout
     * (app.cad.worker.timeout-seconds, default 420) so cadmpeg fails first with
     * its own reason instead of being killed by the worker.
     */
    @Value("${app.cad-convert.cadmpeg-timeout-seconds:300}")
    private long timeoutSeconds;

    public boolean isEnabled() {
        return enabled;
    }

    public String getConfiguredPath() {
        return configuredPath == null ? "" : configuredPath.trim();
    }

    public long getTimeoutSeconds() {
        return timeoutSeconds;
    }

    @Override
    public String getName() {
        return "cadmpeg";
    }

    /**
     * Capability check (pure, no probing): cadmpeg is the engine for the
     * SolidWorks family. Availability is reported separately through
     * {@link #resolveExecutable()} / {@link #getConfigurationIssue()} so callers
     * can tell "unsupported format" apart from "binary not installed".
     */
    @Override
    public boolean supports(String fileType) {
        return enabled && SLD_TYPES.contains(CadConversionEngine.normalizeFileType(fileType));
    }

    /**
     * The cadmpeg executable, or {@code null} when it is not installed here.
     * Order: configured path (file, then PATH lookup) → documented default
     * location → PATH.
     */
    public File resolveExecutable() {
        String configured = getConfiguredPath();
        if (!configured.isEmpty()) {
            File direct = new File(configured);
            if (direct.isFile()) {
                return direct;
            }
            // A configured PATH (e.g. C:\tools\cadmpeg.exe) that does not exist
            // means "not installed" — only a bare command name is resolvable on
            // PATH. Joining a path into PATH entries would be nonsense (and, on
            // Windows, an invalid path).
            return isBareCommand(configured) ? findOnPath(configured) : null;
        }

        // Documented location used by the reference pipeline (never hardcoded in
        // code paths that need it to exist — a missing binary is a valid state).
        String home = System.getProperty("user.home");
        if (home != null && !home.isBlank()) {
            File cargoBin = Path.of(home, ".cargo", "bin", executableName()).toFile();
            if (cargoBin.isFile()) {
                return cargoBin;
            }
        }
        return findOnPath(executableName());
    }

    /**
     * Actionable, path-free reason the engine cannot convert here, or
     * {@code null} when it is disabled (nothing to configure) or usable.
     *
     * <p>Deliberately mentions only the property/env names and cadmpeg's
     * documented default location — never this machine's absolute path, because
     * this text is surfaced through the authenticated health API.
     */
    public String getConfigurationIssue() {
        if (!enabled) {
            return null;
        }
        if (resolveExecutable() != null) {
            return null;
        }
        String configured = getConfiguredPath();
        if (!configured.isEmpty()) {
            return "3D conversion unavailable: cadmpeg conversion is enabled but the configured "
                + "executable was not found. Check the app.cad-convert.cadmpeg-path property "
                + "(ERP_CADMPEG_PATH).";
        }
        return "3D conversion unavailable: cadmpeg is not installed on this server. Install cadmpeg "
            + "and place it on PATH (or in %USERPROFILE%\\.cargo\\bin\\cadmpeg.exe), or point "
            + "ERP_CADMPEG_PATH at the executable. Until then SLDPRT/SLDASM cannot be converted — "
            + "export the model as STEP (.step/.stp) and upload the STEP file for a 3D preview.";
    }

    /**
     * File NAME of the resolved executable (never its directory) for the
     * authenticated health endpoint — reporting the actual configured binary
     * rather than the conventional name keeps that status truthful.
     */
    public String getExecutableName() {
        File exe = resolveExecutable();
        return exe == null ? null : exe.getName();
    }

    private volatile boolean versionProbed;
    private volatile String probedVersion;

    /**
     * cadmpeg's self-reported version (e.g. {@code "0.6.0"}), probed ONCE per
     * process by running {@code cadmpeg --version} — a bounded, read-only
     * command that also proves the resolved binary actually executes on this
     * server. Returns {@code null} when no executable is installed or the probe
     * fails/times out. Informational only: engine availability never depends on
     * it, so a working cadmpeg can never be flipped off by a flaky probe.
     */
    public synchronized String getVersion() {
        if (versionProbed) {
            return probedVersion;
        }
        File exe = resolveExecutable();
        if (exe == null) {
            return null; // not installed — no probe to cache
        }
        versionProbed = true;
        probedVersion = probeVersion(exe);
        return probedVersion;
    }

    /** One bounded {@code --version} run; never throws, never hangs. */
    private static String probeVersion(File exe) {
        Process process = null;
        try {
            ProcessBuilder pb = new ProcessBuilder(exe.getAbsolutePath(), "--version")
                    .redirectErrorStream(true);
            final Process started = pb.start();
            process = started;
            StringBuilder output = new StringBuilder();
            Thread drain = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                        started.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (output.length() < 1024) {
                            output.append(line).append('\n');
                        }
                    }
                } catch (Exception ignored) {
                    // Output capture is diagnostic only.
                }
            }, "cadmpeg-version");
            drain.setDaemon(true);
            drain.start();
            if (!process.waitFor(5, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                process.waitFor(2, TimeUnit.SECONDS);
                return null;
            }
            drain.join(1000);
            // Accept only a version-shaped token — never raw engine output.
            java.util.regex.Matcher m = java.util.regex.Pattern
                    .compile("\\d+\\.\\d+(?:\\.\\d+)?(?:[-+][A-Za-z0-9.]+)?")
                    .matcher(output.toString());
            return m.find() ? m.group() : null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        } catch (Exception e) {
            log.debug("cadmpeg --version probe failed: {}", e.toString());
            return null;
        } finally {
            if (process != null && process.isAlive()) {
                process.destroyForcibly();
            }
        }
    }

    private static String executableName() {
        boolean windows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
        return windows ? "cadmpeg.exe" : "cadmpeg";
    }

    /**
     * The binary NAME this engine looks for on this platform ({@code cadmpeg.exe}
     * / {@code cadmpeg}) — reported even when the binary is absent so an operator
     * reading the authenticated health matrix knows exactly what to install. Never
     * an absolute path.
     */
    public String getExpectedExecutableName() {
        return executableName();
    }

    /** True when the value is a command name (no directories), so PATH applies. */
    private static boolean isBareCommand(String value) {
        return !value.contains("/")
                && !value.contains("\\")
                && !value.matches("^[A-Za-z]:.*");
    }

    /**
     * PATH lookup that tolerates unusable PATH entries (a malformed entry must
     * never turn a "not installed" answer into an exception).
     */
    private static File findOnPath(String command) {
        String pathEnv = System.getenv("PATH");
        if (pathEnv == null) {
            return null;
        }
        for (String dir : pathEnv.split(java.util.regex.Pattern.quote(File.pathSeparator))) {
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

    @Override
    public CadConversionResult convert(Path sourcePath, String outputBase, Path outputDir, String fileType) {
        File exe = resolveExecutable();
        if (exe == null) {
            String issue = getConfigurationIssue();
            return CadConversionResult.failed(issue != null
                    ? issue
                    : "cadmpeg is disabled (app.cad-convert.cadmpeg-enabled=false).");
        }
        if (sourcePath == null || !Files.isRegularFile(sourcePath)) {
            return CadConversionResult.failed("the source CAD file is not available for conversion.");
        }

        String ft = CadConversionEngine.normalizeFileType(fileType);
        Path cadir = outputDir.resolve(outputBase + CADIR_SUFFIX);
        Path glb = outputDir.resolve(outputBase + GLB_SUFFIX);

        List<String> command = buildCommand(exe, sourcePath, cadir);
        Process process = null;
        try {
            Files.createDirectories(outputDir);
            // The original file is only ever READ; cadmpeg writes to the job's
            // private output directory.
            ProcessBuilder pb = new ProcessBuilder(command)
                    .directory(outputDir.toFile())
                    .redirectErrorStream(true);
            process = pb.start();

            StringBuilder output = new StringBuilder();
            Thread drain = drain(process, output);

            boolean finished = process.waitFor(timeoutSeconds, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                process.waitFor(5, TimeUnit.SECONDS);
                return CadConversionResult.failed(
                        "CAD conversion timed out after " + timeoutSeconds + "s (cadmpeg).");
            }
            drain.join(2000);

            int exit = process.exitValue();
            if (!Files.isRegularFile(cadir) || Files.size(cadir) == 0) {
                // No CADIR at all: cadmpeg could not decode this file. `--allow-errors`
                // means a non-zero exit is normal, so the reason comes from the output
                // summary, which the worker then path-strips before it reaches a client.
                log.info("cadmpeg produced no CADIR for {} (exit {}, {} chars of output)",
                        ft, exit, output.length());
                return CadConversionResult.failed(
                        "The CAD engine could not decode this ." + ft + " file (cadmpeg exit code "
                                + exit + "). " + summarize(output));
            }

            CadirToGlbBuilder.Result built = CadirToGlbBuilder.build(cadir, glb, ft);
            if (!built.success()) {
                String losses = CadirToGlbBuilder.readFidelityLosses(cadir);
                String reason = losses == null ? built.error() : built.error() + " Converter diagnostics: " + losses;
                log.info("CADIR → GLB produced no geometry for {}: {}", ft, reason);
                return CadConversionResult.failed(reason);
            }

            log.info("cadmpeg conversion succeeded for {} (exit {}): {} mesh(es), {} vertices, {} triangles",
                    ft, exit, built.meshes(), built.vertices(), built.triangles());
            return CadConversionResult.success(glb.toAbsolutePath().toString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return CadConversionResult.failed("CAD conversion was interrupted.");
        } catch (Exception e) {
            log.warn("cadmpeg execution failed", e);
            return CadConversionResult.failed(
                    "The CAD engine could not be executed: " + e.getClass().getSimpleName() + ".");
        } finally {
            if (process != null && process.isAlive()) {
                process.destroyForcibly();
            }
        }
    }

    /**
     * Exactly the reference pipeline's argument array:
     * {@code cadmpeg convert <input> -o <cadir.json> --allow-errors --force}.
     * Package-private so tests can assert the array (and that it is an array).
     */
    List<String> buildCommand(File executable, Path input, Path cadir) {
        return List.of(
                executable.getAbsolutePath(),
                "convert",
                input.toAbsolutePath().toString(),
                "-o",
                cadir.toAbsolutePath().toString(),
                "--allow-errors",
                "--force");
    }

    /**
     * Read the process output on a daemon thread so a chatty engine can never
     * fill the pipe buffer and deadlock the timeout.
     */
    private Thread drain(Process process, StringBuilder sink) {
        Thread t = new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (sink.length() < MAX_CAPTURED_OUTPUT) {
                        sink.append(line).append('\n');
                    }
                }
            } catch (Exception ignored) {
                // Output capture is diagnostic only.
            }
        }, "cadmpeg-output");
        t.setDaemon(true);
        t.start();
        return t;
    }

    /**
     * A short, user-safe line distilled from cadmpeg's output: it reports its own
     * progress counters, which are more useful than a raw dump.
     */
    private static String summarize(StringBuilder output) {
        String text = output.toString();
        StringBuilder sb = new StringBuilder();
        for (String line : text.split("\\R")) {
            String lower = line.toLowerCase(Locale.ROOT);
            if (lower.contains("geometry_transferred") || lower.contains("bodies:")
                    || lower.contains("faces:") || lower.contains("error") || lower.contains("unsupported")) {
                String trimmed = line.strip();
                if (!trimmed.isEmpty()) {
                    if (sb.length() > 0) {
                        sb.append("; ");
                    }
                    sb.append(trimmed);
                }
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
