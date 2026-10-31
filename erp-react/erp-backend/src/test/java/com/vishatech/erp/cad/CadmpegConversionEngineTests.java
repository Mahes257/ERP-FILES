package com.vishatech.erp.cad;

import com.vishatech.cadworker.GlbOutputValidator;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * cadmpeg engine behaviour, tested without cadmpeg being installed on the build
 * machine (it is an external Windows binary — see the deployment doc):
 *
 *  1. Capability: cadmpeg claims the SolidWorks family only.
 *  2. Availability: a missing binary is reported as UNAVAILABLE with an
 *     actionable, path-free reason, and a conversion attempt FAILS — it is never
 *     reported as a success.
 *  3. Invocation: the command is the reference pipeline's argument array
 *     (never a shell string).
 *  4. Full plumbing, end to end: a compiled stub "engine" is pointed at as the
 *     cadmpeg executable; it receives the expected arguments, writes a CADIR
 *     where {@code -o} says, and the engine turns that into a GLB that passes
 *     the worker's own output validator. This proves everything except cadmpeg's
 *     internal decoding, which can only be proven with the real binary.
 */
class CadmpegConversionEngineTests {

    private CadmpegConversionEngine engine(String configuredPath) {
        CadmpegConversionEngine engine = new CadmpegConversionEngine();
        ReflectionTestUtils.setField(engine, "enabled", true);
        ReflectionTestUtils.setField(engine, "configuredPath", configuredPath);
        ReflectionTestUtils.setField(engine, "timeoutSeconds", 60L);
        return engine;
    }

    @Test
    void claimsOnlyTheSolidWorksFamily() {
        CadmpegConversionEngine engine = engine("");
        assertThat(engine.getName()).isEqualTo("cadmpeg");
        assertThat(engine.supports("sldprt")).isTrue();
        assertThat(engine.supports("SLDASM")).isTrue();
        assertThat(engine.supports(".sldprt")).isTrue();
        // Not cadmpeg's job in this architecture: STEP/IGES use OCCT in the
        // browser, SAT has its own (separate) tessellator, browser formats need
        // no backend conversion at all.
        assertThat(engine.supports("sat")).isFalse();
        assertThat(engine.supports("step")).isFalse();
        assertThat(engine.supports("glb")).isFalse();
        assertThat(engine.supports(null)).isFalse();

        CadmpegConversionEngine disabled = engine("");
        ReflectionTestUtils.setField(disabled, "enabled", false);
        assertThat(disabled.supports("sldprt")).isFalse();
    }

    @Test
    void missingBinaryIsUnavailableWithAnActionableReason(@TempDir Path dir) throws Exception {
        CadmpegConversionEngine engine = engine(dir.resolve("not-installed-cadmpeg.exe").toString());
        assertThat(engine.resolveExecutable()).isNull();

        String issue = engine.getConfigurationIssue();
        assertThat(issue)
                .contains("3D conversion unavailable")
                .contains("ERP_CADMPEG_PATH")
                // Never leaks an absolute server path or an internal path.
                .doesNotContain(dir.toString());

        Path input = dir.resolve("source.sldprt");
        Files.write(input, new byte[]{(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0});
        CadConversionResult result = engine.convert(input, "preview", dir, "sldprt");

        assertThat(result.isSuccess())
                .as("a missing engine must never be reported as a successful conversion")
                .isFalse();
        assertThat(result.getError()).contains("ERP_CADMPEG_PATH");
        assertThat(Files.exists(dir.resolve("preview.glb"))).isFalse();
    }

    @Test
    void missingSourceFileIsRefusedEvenWhenTheEngineExists(@TempDir Path dir) throws Exception {
        // Fake an available executable so the failure must come from the input check.
        File fake = findAnyExistingExecutable();
        Assumptions.assumeTrue(fake != null, "no executable available to point the engine at");
        CadmpegConversionEngine engine = engine(fake.getAbsolutePath());

        CadConversionResult result = engine.convert(dir.resolve("absent.sldprt"), "preview", dir, "sldprt");

        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getError()).contains("source");
    }

    @Test
    void usesTheReferenceArgumentArrayNeverAShellString(@TempDir Path dir) {
        File exe = new File(dir.toFile(), "cadmpeg.exe");
        Path input = dir.resolve("source.sldprt");
        Path cadir = dir.resolve("preview.cadir.json");

        List<String> command = engine("").buildCommand(exe, input, cadir);

        assertThat(command).containsExactly(
                exe.getAbsolutePath(),
                "convert",
                input.toAbsolutePath().toString(),
                "-o",
                cadir.toAbsolutePath().toString(),
                "--allow-errors",
                "--force");
        // One argument per element: a file name can never be interpreted by a shell.
        assertThat(command).allSatisfy(part -> assertThat(part).doesNotContain("&&", "|", ";"));
    }

    /**
     * End-to-end plumbing proof: the engine launches a real process, hands it the
     * expected arguments, reads the CADIR it writes and produces a GLB that the
     * worker's validator accepts. Skipped where a C# compiler is unavailable.
     */
    @Test
    @EnabledOnOs(OS.WINDOWS)
    void runsTheEngineProcessAndConvertsItsCadirToAValidatedGlb(@TempDir Path dir) throws Exception {
        File csc = findCsc();
        Assumptions.assumeTrue(csc != null, "no C# compiler available for the stub engine");

        Path stubSource = dir.resolve("CadmpegStub.cs");
        Files.writeString(stubSource, stubSource());
        Path stubExe = dir.resolve("cadmpeg-stub.exe");
        Process compile = new ProcessBuilder(
                csc.getAbsolutePath(), "/nologo", "/target:exe",
                "/out:" + stubExe.toAbsolutePath(),
                stubSource.toAbsolutePath().toString())
                .redirectErrorStream(true)
                .start();
        String compileOutput = new String(compile.getInputStream().readAllBytes());
        Assumptions.assumeTrue(compile.waitFor() == 0 && Files.exists(stubExe),
                "stub engine compilation failed: " + compileOutput);

        CadmpegConversionEngine engine = engine(stubExe.toAbsolutePath().toString());
        assertThat(engine.resolveExecutable()).isNotNull();
        assertThat(engine.getConfigurationIssue()).isNull();

        Path input = dir.resolve("source.sldprt");   // the stub does not read it
        Files.write(input, new byte[]{(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0});

        CadConversionResult result = engine.convert(input, "preview", dir, "sldprt");

        assertThat(result.isSuccess()).as(result.getError()).isTrue();
        Path glb = Path.of(result.getConvertedFilePath());
        assertThat(glb.getFileName().toString()).isEqualTo("preview.glb");
        assertThat(Files.exists(dir.resolve("preview.cadir.json"))).isTrue();

        GlbOutputValidator.Result validated = new GlbOutputValidator().validate(glb);
        assertThat(validated.valid()).as(validated.reason()).isTrue();
    }

    /** Stub engine: writes the CADIR the converter expects, to the {@code -o} path. */
    private static String stubSource() {
        return """
                using System;
                using System.IO;
                using System.Text;

                class CadmpegStub {
                    static int Main(string[] args) {
                        string outPath = null;
                        for (int i = 0; i < args.Length; i++) {
                            if (args[i] == "-o" && i + 1 < args.Length) {
                                outPath = args[i + 1];
                            }
                        }
                        if (outPath == null) {
                            Console.Error.WriteLine("missing -o");
                            return 2;
                        }
                        string json = "{\\"model\\":{\\"bodies\\":[{}],\\"faces\\":[{}],\\"tessellations\\":["
                            + "{\\"vertices\\":[{\\"x\\":0,\\"y\\":0,\\"z\\":0},{\\"x\\":10,\\"y\\":0,\\"z\\":0},{\\"x\\":0,\\"y\\":10,\\"z\\":0}],"
                            + "\\"normals\\":[{\\"x\\":0,\\"y\\":0,\\"z\\":1},{\\"x\\":0,\\"y\\":0,\\"z\\":1},{\\"x\\":0,\\"y\\":0,\\"z\\":1}],"
                            + "\\"triangles\\":[[0,1,2]]}]}}";
                        File.WriteAllText(outPath, json, new UTF8Encoding(false));
                        Console.WriteLine("geometry_transferred=1 bodies:1 faces:1");
                        return 0;
                    }
                }
                """;
    }

    private static File findCsc() {
        String[] candidates = {
            "C:\\\\Windows\\\\Microsoft.NET\\\\Framework64\\\\v4.0.30319\\\\csc.exe",
            "C:\\\\Windows\\\\Microsoft.NET\\\\Framework\\\\v4.0.30319\\\\csc.exe",
        };
        for (String candidate : candidates) {
            File file = new File(candidate.replace("\\\\", "\\"));
            if (file.isFile()) {
                return file;
            }
        }
        return null;
    }

    private static File findAnyExistingExecutable() {
        String[] candidates = {
            System.getenv("JAVA_HOME") == null ? null : System.getenv("JAVA_HOME") + "/bin/java.exe",
            "C:\\\\Windows\\\\System32\\\\where.exe",
        };
        for (String candidate : candidates) {
            if (candidate == null) {
                continue;
            }
            File file = new File(candidate.replace("\\\\", "\\"));
            if (file.isFile()) {
                return file;
            }
        }
        return null;
    }
}
