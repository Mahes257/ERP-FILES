package com.vishatech.erp.cad;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Auto-detection of the SAT (ACIS) engine's COMPLETE dependency chain:
 * cadmpeg → Node.js → the STEP→CADIR helper → occt-import-js.
 *
 * <p>Contract under test:
 * <ul>
 *   <li>SAT is available only when EVERY link of the existing chain is usable —
 *       never partially enabled;</li>
 *   <li>a missing link reports the precise, path-free reason through
 *       {@code getConfigurationIssue()} (the text surfaced by the health API);</li>
 *   <li>the occt-import-js check mirrors the helper's own resolution order
 *       (configured package dir → OCCT_IMPORT_JS_MODULE env → Node's walk-up
 *       from the script's directory), so "detected" means "will load at convert
 *       time";</li>
 *   <li>a disabled engine is simply off — no configuration complaint.</li>
 * </ul>
 *
 * <p>Plain unit tests: no Spring context, no database, no real engine — the
 * configured paths point at controlled temp files/dirs.
 */
class SatAcisConversionEngineTests {

    @TempDir
    Path temp;

    // ------------------------------------------------------------- fixtures

    private Path writeFile(Path parent, String name, String content) throws Exception {
        Files.createDirectories(parent);
        Path file = parent.resolve(name);
        Files.writeString(file, content);
        return file;
    }

    private Path executable(String name) throws Exception {
        return writeFile(temp.resolve("bin"), name, "stub");
    }

    /** A cadmpeg whose configured path is resolved purely from configuration. */
    private CadmpegConversionEngine cadmpegWithPath(String configuredPath) {
        CadmpegConversionEngine cadmpeg = new CadmpegConversionEngine();
        ReflectionTestUtils.setField(cadmpeg, "enabled", true);
        ReflectionTestUtils.setField(cadmpeg, "configuredPath",
                configuredPath == null ? "" : configuredPath);
        return cadmpeg;
    }

    private void configure(SatAcisConversionEngine sat, boolean enabled,
                           String nodePath, String script, String occtModule) {
        ReflectionTestUtils.setField(sat, "enabled", enabled);
        ReflectionTestUtils.setField(sat, "configuredNodePath", nodePath == null ? "" : nodePath);
        ReflectionTestUtils.setField(sat, "configuredScript", script == null ? "" : script);
        ReflectionTestUtils.setField(sat, "configuredOcctModule", occtModule == null ? "" : occtModule);
    }

    /** A usable occt-import-js package directory (package.json = require()-able). */
    private Path occtPackage(String dirName) throws Exception {
        Path pkg = temp.resolve(dirName).resolve("occt-import-js");
        writeFile(pkg, "package.json", "{\"name\":\"occt-import-js\",\"main\":\"index.js\"}");
        return pkg;
    }

    // --------------------------------------------------- complete chain (A)

    @Test
    void theCompleteDependencyChainIsDetectedAsAvailable() throws Exception {
        Path cadmpegExe = executable("cadmpeg.exe");
        Path nodeExe = executable("node.exe");
        Path script = writeFile(temp.resolve("tools"), "step-to-cadir.cjs", "// stub");
        Path occt = occtPackage("occt-ok");

        CadmpegConversionEngine cadmpeg = cadmpegWithPath(cadmpegExe.toString());
        SatAcisConversionEngine sat = new SatAcisConversionEngine(cadmpeg);
        configure(sat, true, nodeExe.toString(), script.toString(), occt.toString());

        assertThat(sat.resolveCadmpegExecutable()).isNotNull();
        assertThat(sat.resolveNodeExecutable()).isNotNull();
        assertThat(sat.resolveTessellatorScript()).isNotNull();
        assertThat(sat.resolveOcctDependency()).isEqualTo(occt.toFile());
        assertThat(sat.isAvailable()).isTrue();
        assertThat(sat.getConfigurationIssue()).isNull();
        assertThat(sat.supports("sat")).isTrue();
    }

    // ------------------------------------------------- missing links (B, C)

    @Test
    void satIsNeverAvailableWhileTheOcctImporterIsMissing() throws Exception {
        Path cadmpegExe = executable("cadmpeg.exe");
        Path nodeExe = executable("node.exe");
        Path script = writeFile(temp.resolve("tools"), "step-to-cadir.cjs", "// stub");
        // A directory that exists but is NOT a loadable package (no package.json).
        Path emptyDir = Files.createDirectories(temp.resolve("half-installed"));

        SatAcisConversionEngine sat = new SatAcisConversionEngine(cadmpegWithPath(cadmpegExe.toString()));
        configure(sat, true, nodeExe.toString(), script.toString(), emptyDir.toString());

        assertThat(sat.resolveOcctDependency()).isNull();
        assertThat(sat.isAvailable()).as("SAT must not be partially enabled").isFalse();
        assertThat(sat.getConfigurationIssue())
                .contains("occt-import-js")
                .contains("ERP_SAT_OCCT_MODULE");
    }

    @Test
    void satIsUnavailableWhenNodeIsMissingEvenIfEveryOtherLinkIsPresent() throws Exception {
        Path cadmpegExe = executable("cadmpeg.exe");
        Path script = writeFile(temp.resolve("tools"), "step-to-cadir.cjs", "// stub");
        Path occt = occtPackage("occt-node-case");
        String missingNode = temp.resolve("missing").resolve("node.exe").toString();

        SatAcisConversionEngine sat = new SatAcisConversionEngine(cadmpegWithPath(cadmpegExe.toString()));
        configure(sat, true, missingNode, script.toString(), occt.toString());

        assertThat(sat.resolveNodeExecutable()).isNull();
        assertThat(sat.resolveCadmpegExecutable()).isNotNull();
        assertThat(sat.isAvailable()).isFalse();
        assertThat(sat.getConfigurationIssue())
                .contains("Node.js")
                .contains("ERP_SAT_NODE_PATH");
    }

    @Test
    void satIsUnavailableWhenCadmpegIsMissing() throws Exception {
        Path nodeExe = executable("node.exe");
        Path script = writeFile(temp.resolve("tools"), "step-to-cadir.cjs", "// stub");
        Path occt = occtPackage("occt-cadmpeg-case");
        String missingCadmpeg = temp.resolve("missing").resolve("cadmpeg.exe").toString();

        SatAcisConversionEngine sat = new SatAcisConversionEngine(cadmpegWithPath(missingCadmpeg));
        configure(sat, true, nodeExe.toString(), script.toString(), occt.toString());

        assertThat(sat.resolveCadmpegExecutable()).isNull();
        assertThat(sat.isAvailable()).isFalse();
        assertThat(sat.getConfigurationIssue()).contains("cadmpeg");
    }

    @Test
    void satIsUnavailableWhileTheTessellatorHelperIsMissing() throws Exception {
        Path cadmpegExe = executable("cadmpeg.exe");
        Path nodeExe = executable("node.exe");
        Path occt = occtPackage("occt-script-case");

        SatAcisConversionEngine sat = new SatAcisConversionEngine(cadmpegWithPath(cadmpegExe.toString()));
        configure(sat, true, nodeExe.toString(),
                temp.resolve("missing").resolve("step-to-cadir.cjs").toString(), occt.toString());

        assertThat(sat.resolveTessellatorScript()).isNull();
        assertThat(sat.isAvailable()).isFalse();
        assertThat(sat.getConfigurationIssue()).contains("step-to-cadir.cjs");
    }

    @Test
    void aDisabledSatEngineIsSimplyOffAndComplainsAboutNothing() {
        SatAcisConversionEngine sat =
                new SatAcisConversionEngine(cadmpegWithPath(temp.resolve("nope").toString()));
        configure(sat, false, null, null, null);

        assertThat(sat.supports("sat")).isFalse();
        assertThat(sat.isAvailable()).isFalse();
        // Disabled means "nothing to configure" — no stale actionable message.
        assertThat(sat.getConfigurationIssue()).isNull();
    }

    // -------------------------------------- occt resolution mirrors the helper

    @Test
    void theOcctDependencyWalksUpFromTheScriptExactlyLikeNodeDoes() throws Exception {
        assumeTrue(System.getenv("OCCT_IMPORT_JS_MODULE") == null
                        || System.getenv("OCCT_IMPORT_JS_MODULE").isBlank(),
                "OCCT_IMPORT_JS_MODULE overrides node_modules resolution");
        Path cadmpegExe = executable("cadmpeg.exe");
        Path nodeExe = executable("node.exe");
        Path script = writeFile(temp.resolve("deep").resolve("tools"), "step-to-cadir.cjs", "// stub");
        Path occt = occtPackage("node_modules");

        SatAcisConversionEngine sat = new SatAcisConversionEngine(cadmpegWithPath(cadmpegExe.toString()));
        configure(sat, true, nodeExe.toString(), script.toString(), "");

        // No configured module: the package is found the same way require()
        // would find it — walking up from the script's own directory.
        assertThat(sat.resolveOcctDependency()).isEqualTo(occt.toFile());
        assertThat(sat.isAvailable()).isTrue();
    }

    @Test
    void aConfiguredOcctPackageMustCarryAPackageJsonToCountAsLoadable() throws Exception {
        Path dir = Files.createDirectories(temp.resolve("not-a-package"));
        SatAcisConversionEngine sat =
                new SatAcisConversionEngine(cadmpegWithPath(executable("cadmpeg.exe").toString()));
        configure(sat, true, executable("node.exe").toString(),
                writeFile(temp.resolve("tools"), "step-to-cadir.cjs", "// stub").toString(),
                dir.toString());

        assertThat(sat.resolveOcctDependency()).isNull();
    }
}
