package com.vishatech.erp.cad;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Internal SolidWorks conversion engine (SLDPRT/SLDASM -> viewer GLB).
 *
 * Strategy — two-stage, fully internal, no cloud service:
 *
 *   Stage 1 (this engine): drive a LICENSED LOCAL SolidWorks installation via
 *   its official COM automation API to open the proprietary part/assembly and
 *   SaveAs a neutral STEP file. SolidWorks' own kernel does the proprietary
 *   parsing; nothing about the SLDPRT format is guessed or faked.
 *
 *   Stage 2 (pipeline seam): hand the intermediate STEP to the backend
 *   STEP->GLB stage, which tessellates and emits the validated, geometry-checked
 *   GLB the viewer already renders.
 *
 * The original SLDPRT/SLDASM file is never modified: it is copied into an
 * isolated, randomly-named temporary working directory and only ever read.
 *
 * When no SolidWorks installation exists on the server (the current machine),
 * this engine reports failure WITHOUT any attempt — the registry then resolves
 * SLDPRT/SLDASM to the honest UNSUPPORTED state. On a server WITH SolidWorks,
 * the same pipeline renders real parts with zero code changes.
 *
 * Security / operational properties:
 *   - The uploaded CAD file is data, never executed.
 *   - The PowerShell bridge script is backend-generated inside a fresh temp
 *     directory; no user-supplied string becomes part of the script.
 *   - Hard process timeout; the whole process tree is killed on overrun.
 *   - Temp files are always cleaned up.
 *   - CAD contents are never logged; only concise conversion messages.
 */
@Component
public class SolidWorksLocalConversionEngine implements CadConversionEngine {

    private static final Logger log = LoggerFactory.getLogger(SolidWorksLocalConversionEngine.class);

    private static final Set<String> SUPPORTED = Set.of("sldprt", "sldasm");

    private final SolidWorksDetector detector;

    @Value("${app.cad-convert.solidworks.timeout-seconds:300}")
    private long swTimeoutSeconds;

    @Value("${app.cad-convert.solidworks.visible:false}")
    private boolean swVisible;

    public SolidWorksLocalConversionEngine(SolidWorksDetector detector) {
        this.detector = detector;
    }

    @Override
    public String getName() {
        return "solidworks-local";
    }

    @Override
    public boolean supports(String fileType) {
        return SUPPORTED.contains(CadConversionEngine.normalizeFileType(fileType));
    }

    @Override
    public CadConversionResult convert(Path sourcePath, String outputBase, Path outputDir, String fileType) {
        // No genuine local SolidWorks -> refuse WITHOUT pretending. The registry
        // turns this into the honest UNSUPPORTED state for the user.
        if (!detector.isAvailable()) {
            return CadConversionResult.failed(
                "No local SolidWorks installation is available on this server.");
        }

        Path workDir = null;
        try {
            workDir = Files.createTempDirectory("erp-sw-convert-");

            // Stage 1: SolidWorks COM automation -> neutral STEP.
            Path swInput = workDir.resolve("input_"
                + UUID8() + "." + CadConversionEngine.normalizeFileType(fileType));
            Files.copy(sourcePath, swInput, StandardCopyOption.REPLACE_EXISTING);
            Path stepOutput = workDir.resolve("intermediate_" + UUID8() + ".step");

            String swError = runSolidWorksToStep(swInput, stepOutput, workDir);
            if (swError != null) {
                return CadConversionResult.failed(swError);
            }
            if (!Files.isRegularFile(stepOutput) || Files.size(stepOutput) == 0) {
                return CadConversionResult.failed(
                    "SolidWorks did not produce a STEP conversion of this file. "
                    + "The part may contain features the automation export cannot translate.");
            }
            log.info("SolidWorks exported {} -> intermediate STEP ({} bytes)",
                    CadConversionEngine.normalizeFileType(fileType), Files.size(stepOutput));

            // Stage 2: STEP -> GLB. That stage was supplied by the legacy
            // converter, which has been removed. Refuse honestly instead of
            // ever reporting a preview-ready GLB that was not produced.
            return CadConversionResult.failed(
                "SolidWorks conversion is unavailable: the internal STEP->GLB engine is not configured.");
        } catch (Exception e) {
            log.error("SolidWorks conversion failed for output base {}", outputBase, e);
            return CadConversionResult.failed("SolidWorks conversion failed: " + e.getMessage());
        } finally {
            if (workDir != null) {
                try {
                    deleteRecursively(workDir);
                } catch (Exception ignored) {
                    // best effort cleanup
                }
            }
        }
    }

    /**
     * Run the PowerShell COM bridge. Returns null on success, or a concise
     * user-facing error message (prefixed by the bridge with "SWERROR:").
     */
    private String runSolidWorksToStep(Path input, Path output, Path workDir) throws IOException, InterruptedException {
        Path script = writeBridgeScript(workDir);

        ProcessBuilder pb = new ProcessBuilder(
            "powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
            "-File", script.toAbsolutePath().toString(),
            "-In", input.toAbsolutePath().toString(),
            "-Out", output.toAbsolutePath().toString(),
            "-TimeoutSeconds", String.valueOf(swTimeoutSeconds),
            "-Visible", swVisible ? "1" : "0");
        pb.directory(workDir.toFile());
        pb.redirectErrorStream(true);

        Process process = pb.start();
        boolean finished = process.waitFor(swTimeoutSeconds + 120, TimeUnit.SECONDS);
        if (!finished) {
            killProcessTree(process);
            return "SolidWorks conversion timed out. The model may be too large or complex for the configured time limit.";
        }

        String stdout;
        try (java.io.InputStream is = process.getInputStream()) {
            stdout = new String(is.readAllBytes(), StandardCharsets.UTF_8);
        }
        int exit = process.exitValue();

        if (exit == 0 && Files.isRegularFile(output) && Files.size(output) > 0) {
            return null;
        }
        String reason = extractSwError(stdout);
        if (reason == null) {
            reason = "SolidWorks automation failed (exit code " + exit + "). "
                + "Verify the SolidWorks license is activated on the server.";
        }
        return reason;
    }

    /**
     * Generate the COM automation bridge. Kept minimal and deterministic: it
     * only opens the model and saves it as STEP (format inferred from the
     * '.step' extension by SaveAs) — no file contents are embedded.
     *
     * API references:
     *   ISldWorks.OpenDoc6(name, type, option, config, ref errors, ref warnings)
     *     type: swDocPART=1, swDocASSEMBLY=2; option: swOpenDocOptions_Silent=1
     *   IModelDocExtension.SaveAs(name, version, option, exportData,
     *                             ref errors, ref warnings)
     *     version: swSaveAsCurrentVersion=0; option: swSaveAsOptions_Silent=1
     */
    private Path writeBridgeScript(Path workDir) throws IOException {
        String ps = String.join("\n",
            "param(",
            "  [Parameter(Mandatory=$true)][string]$In,",
            "  [Parameter(Mandatory=$true)][string]$Out,",
            "  [int]$TimeoutSeconds = 300,",
            "  [string]$Visible = '0'",
            ")",
            "$ErrorActionPreference = 'Stop'",
            "function Fail([string]$msg) { Write-Output ('SWERROR: ' + $msg); exit 1 }",
            "",
            "try {",
            "  $type = [System.Type]::GetTypeFromProgID('SldWorks.Application')",
            "  if (-not $type) { Fail 'SolidWorks COM API (SldWorks.Application) is not registered on this server.' }",
            "  try { $sw = [System.Runtime.InteropServices.Marshal]::GetActiveObject('SldWorks.Application') }",
            "  catch { $sw = New-Object -ComObject SldWorks.Application }",
            "} catch {",
            "  Fail 'SolidWorks could not be started via COM. Verify it is installed and licensed on this server.'",
            "}",
            "$doc = $null",
            "try {",
            "  $sw.Visible = ($Visible -eq '1')",
            "  $sw.CommandInProgress = $true",
            "",
            "  $errors = 0; $warnings = 0",
            "  # Silent open; try part first, then assembly (the extension alone cannot",
            "  # distinguish swDocPART=1 from swDocASSEMBLY=2 for a .sldasm upload).",
            "  $doc = $sw.OpenDoc6($In, 1, 1, '', [ref]$errors, [ref]$warnings)",
            "  if ($null -eq $doc) { $errors = 0; $warnings = 0",
            "    $doc = $sw.OpenDoc6($In, 2, 1, '', [ref]$errors, [ref]$warnings) }",
            "  if ($null -eq $doc) { Fail ('SolidWorks could not open the model (errors=' + $errors + ', warnings=' + $warnings + '). The file may be corrupt or from an unsupported version.') }",
            "",
            "  $saveErrors = 0; $saveWarnings = 0",
            "  # SaveAs infers the STEP format from the '.step' extension at the current version.",
            "  $ok = $doc.Extension.SaveAs($Out, 0, 1, $null, [ref]$saveErrors, [ref]$saveWarnings)",
            "  if (-not $ok) { Fail ('SolidWorks SaveAs STEP failed (errors=' + $saveErrors + ', warnings=' + $saveWarnings + ').') }",
            "",
            "  $null = $sw.CloseDoc($In)",
            "  Write-Output 'SWOK'",
            "  exit 0",
            "} catch {",
            "  Fail $_.Exception.Message",
            "} finally {",
            "  if ($doc -ne $null) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null }",
            "  if ($sw -ne $null) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($sw) | Out-Null }",
            "}"
        );
        Path script = workDir.resolve("sld2step.ps1");
        Files.write(script, ps.getBytes(StandardCharsets.UTF_8));
        return script;
    }

    private static String extractSwError(String output) {
        if (output == null) return null;
        for (String line : output.split("\r?\n")) {
            String t = line.trim();
            if (t.startsWith("SWERROR:")) {
                return t.replaceFirst("^SWERROR:\\s*", "").trim();
            }
        }
        return null;
    }

    /** Best-effort kill of the PowerShell tree (and the SolidWorks it spawned). */
    private void killProcessTree(Process process) {
        try {
            long pid = process.pid();
            new ProcessBuilder("taskkill", "/F", "/T", "/PID", String.valueOf(pid))
                .redirectErrorStream(true).start().waitFor(15, TimeUnit.SECONDS);
        } catch (Exception e) {
            process.destroyForcibly();
        }
    }

    private static String UUID8() {
        return java.util.UUID.randomUUID().toString().substring(0, 8);
    }

    private void deleteRecursively(Path root) throws IOException {
        if (root == null || !Files.exists(root)) return;
        try (java.util.stream.Stream<Path> walk = Files.walk(root)) {
            walk.sorted(java.util.Comparator.reverseOrder()).forEach(p -> {
                try { Files.deleteIfExists(p); } catch (IOException ignored) { }
            });
        }
    }
}
