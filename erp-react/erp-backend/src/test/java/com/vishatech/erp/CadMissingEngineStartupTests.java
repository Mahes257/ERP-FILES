package com.vishatech.erp;

import static org.assertj.core.api.Assertions.assertThat;

import com.vishatech.erp.cad.CadConversionProvider;
import com.vishatech.erp.cad.ConversionProviderRegistry;
import com.vishatech.erp.entity.production.Model;
import com.vishatech.erp.entity.production.ModelConversionStatus;
import com.vishatech.erp.repository.CadConversionJobRepository;
import com.vishatech.erp.repository.production.ModelRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.service.cad.CadConversionJobService;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * The CRITICAL startup contract for a physical server that has NONE of the
 * optional CAD engines: the Spring Boot ERP must START, run normally, and
 * report honest capability gaps — never crash, never fake availability.
 *
 * <p>The context is booted with cadmpeg and SAT switched off (what a server
 * without them looks like). A passing test class IS the proof that the
 * application starts: Spring would fail the context otherwise.
 *
 * <pre>
 *   cadmpeg disabled/missing  → SLDPRT/SLDASM unavailable (honest message)
 *   SAT chain broken/missing  → SAT unavailable (honest message)
 *   FreeCAD not installed     → freecad entry says so; STEP slot unchanged
 *   SolidWorks not installed  → solidworks entry says so
 *   browser formats           → still DIRECT_BROWSER (no engine required)
 *   submit with no engine     → refused BEFORE any job row exists
 * </pre>
 */
@SpringBootTest(properties = {
        "app.cad-convert.cadmpeg-enabled=false",
        "app.cad-convert.sat-enabled=false"
})
class CadMissingEngineStartupTests extends AbstractSecurityTest {

    @Autowired
    private CadConversionJobService service;

    @Autowired
    private ConversionProviderRegistry registry;

    @Autowired
    private ModelRepository models;

    @Autowired
    private CadConversionJobRepository jobs;

    @SuppressWarnings("unchecked")
    private static Map<String, Object> entry(Map<String, Object> health, String key) {
        return (Map<String, Object>) health.get(key);
    }

    @Test
    void theErpStartsAndReportsHonestGapsWhenOptionalEnginesAreMissing() {
        // Reaching this assertion at all proves the context started with both
        // engines switched off (Step: application must not fail when engines
        // are missing).
        Map<String, Object> health = service.health();

        assertThat(health.get("pipelineEnabled")).isEqualTo(Boolean.TRUE);

        // Per-format matrix: every server-converted format is honestly unavailable.
        Map<String, Object> engines = entry(health, "engines");
        assertThat(engines).containsKeys("sldprt", "sldasm", "sat");
        for (String type : List.of("sldprt", "sldasm", "sat")) {
            Map<String, Object> e = entry(engines, type);
            assertThat(e.get("available")).as("%s available", type).isEqualTo(Boolean.FALSE);
            assertThat((String) e.get("message"))
                    .as("%s must explain why", type)
                    .isNotBlank();
        }

        // Per-engine detection detail: disabled engines say so; FreeCAD and
        // SolidWorks (never installed on this machine) say so.
        Map<String, Object> cadmpeg = entry(health, "cadmpeg");
        assertThat(cadmpeg.get("enabled")).isEqualTo(Boolean.FALSE);
        assertThat(cadmpeg.get("available")).isEqualTo(Boolean.FALSE);

        Map<String, Object> sat = entry(health, "sat");
        assertThat(sat.get("enabled")).isEqualTo(Boolean.FALSE);
        assertThat(sat.get("available")).isEqualTo(Boolean.FALSE);
        assertThat(entry(sat, "dependencies"))
                .containsKeys("cadmpeg", "node", "tessellatorScript", "occtImportJs");

        Map<String, Object> freecad = entry(health, "freecad");
        assertThat(freecad).containsKeys("enabled", "installed", "available", "message");
        Map<String, Object> solidworks = entry(health, "solidworks");
        assertThat(solidworks).containsKeys("installed", "available", "message");
        // No absolute paths anywhere in the response — booleans, names, messages.
        assertThat(health.toString()).doesNotContain(":\\Users\\");

        // Provider resolution matches the same reality.
        for (String ft : List.of("sldprt", "sldasm")) {
            ConversionProviderRegistry.ProviderResolution res = registry.resolve(ft);
            assertThat(res.available).as("%s resolvable", ft).isFalse();
            assertThat(res.unavailableMessage)
                    .as("%s reason", ft)
                    .isEqualTo(ConversionProviderRegistry.SLD_UNSUPPORTED_MESSAGE);
        }
        ConversionProviderRegistry.ProviderResolution satRes = registry.resolve("sat");
        assertThat(satRes.available).isFalse();
        assertThat(satRes.unavailableMessage)
                .isEqualTo(ConversionProviderRegistry.SAT_UNSUPPORTED_MESSAGE);

        // Formats that never needed an engine keep working exactly as before.
        for (String ft : List.of("glb", "gltf", "stl", "obj")) {
            ConversionProviderRegistry.ProviderResolution res = registry.resolve(ft);
            assertThat(res.provider).as("%s provider", ft)
                    .isEqualTo(CadConversionProvider.DIRECT_BROWSER);
            assertThat(res.available).as("%s available", ft).isTrue();
        }
        // STEP keeps the exact pre-existing slot (browser OCCT WASM is
        // client-side and independent of these server engines).
        assertThat(registry.resolve("step").provider)
                .isEqualTo(CadConversionProvider.OPEN_CASCADE);
    }

    @Test
    void submittingAFormatWithNoEngineRefusesBeforeAnyJobRowExists() throws Exception {
        Path sld = Files.createTempFile("missing-engine", ".sldprt");
        Files.write(sld, new byte[]{(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0});
        Model model = Model.builder()
                .modelNumber("CAD-NOENG-" + UUID.randomUUID().toString().substring(0, 8))
                .workOrderId("WO-CAD-NOENG")
                .fileName("no-engine.sldprt")
                .fileType(".sldprt")
                .fileSize(4L)
                .filePath(sld.toString())
                .fileChecksum(UUID.randomUUID().toString().replace("-", ""))
                .build();
        model = models.save(model);
        try {
            CadConversionJobService.SubmitResult result = service.submit(model.getId());

            // Refused — never a fake queued job that could never run.
            assertThat(result.accepted()).isFalse();
            assertThat(result.status()).isEqualTo(ModelConversionStatus.UNSUPPORTED);
            assertThat(result.message()).containsIgnoringCase("unavailable");
            assertThat(jobs.countByModelId(model.getId())).isZero();
            // The model projection carries the same honest answer.
            Model reloaded = models.findById(model.getId()).orElseThrow();
            assertThat(reloaded.getConversionStatus()).isEqualTo(ModelConversionStatus.UNSUPPORTED);
        } finally {
            Files.deleteIfExists(sld);
        }
    }
}
