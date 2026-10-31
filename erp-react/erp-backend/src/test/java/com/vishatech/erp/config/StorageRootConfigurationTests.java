package com.vishatech.erp.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.stream.Stream;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.core.env.PropertiesPropertySource;
import org.springframework.core.env.StandardEnvironment;

/**
 * Regression guard for the production storage layout.
 *
 * <p>One {@code ERP_UPLOAD_DIR} must move <em>every</em> persistent runtime file
 * onto the same external volume: uploaded documents, CAD model originals,
 * drawing originals, generated CAD previews and processing-job staging. These
 * roots used to be independent, so pointing only {@code app.upload.dir} at a
 * volume left {@code models} and {@code drawings} behind in a
 * working-directory-relative {@code ./uploads/...} that a redeploy could
 * discard — silently splitting production storage across two locations.
 *
 * <p>{@link #storageRootsFollowTheUploadDirectory()} resolves the real
 * placeholders with Spring's own {@link StandardEnvironment} over the shipped
 * {@code application.properties}, and
 * {@link #noStorageRootIsHardcodedToAWorkingDirectoryPath()} fails the build if
 * a root is ever wired back to a standalone {@code ./uploads/...} default.
 */
class StorageRootConfigurationTests {

    private static final Path PROPERTIES =
            Paths.get("src/main/resources/application.properties");

    private static final String UPLOAD_DIR_KEY = "app.upload.dir";

    @Test
    void storageRootsFollowTheUploadDirectory() {
        Map<String, String> overrides = Map.of(UPLOAD_DIR_KEY, "/srv/erp/uploads");

        assertThat(environment(overrides).resolvePlaceholders("${" + UPLOAD_DIR_KEY + "}"))
                .isEqualTo("/srv/erp/uploads");
        assertThat(environment(overrides).resolvePlaceholders("${app.storage.models}"))
                .isEqualTo("/srv/erp/uploads/models");
        assertThat(environment(overrides).resolvePlaceholders("${app.storage.drawings}"))
                .isEqualTo("/srv/erp/uploads/drawings");
        assertThat(environment(overrides).resolvePlaceholders("${app.cad.worker.preview-dir}"))
                .isEqualTo("/srv/erp/uploads/cad-previews");
    }

    @Test
    void eachRootCanBeOverriddenIndependentlyOfTheUploadDirectory() {
        Map<String, String> overrides = new LinkedHashMap<>();
        overrides.put(UPLOAD_DIR_KEY, "/srv/erp/uploads");
        overrides.put("ERP_MODEL_STORAGE_DIR", "/mnt/models");
        overrides.put("ERP_DRAWINGS_STORAGE_DIR", "/mnt/drawings");
        overrides.put("ERP_CAD_WORKER_PREVIEW_DIR", "/mnt/previews");

        StandardEnvironment environment = environment(overrides);

        assertThat(environment.resolvePlaceholders("${app.storage.models}"))
                .isEqualTo("/mnt/models");
        assertThat(environment.resolvePlaceholders("${app.storage.drawings}"))
                .isEqualTo("/mnt/drawings");
        assertThat(environment.resolvePlaceholders("${app.cad.worker.preview-dir}"))
                .isEqualTo("/mnt/previews");
        // The shared root itself is untouched by the per-directory overrides.
        assertThat(environment.resolvePlaceholders("${" + UPLOAD_DIR_KEY + "}"))
                .isEqualTo("/srv/erp/uploads");
    }

    @Test
    void noStorageRootIsHardcodedToAWorkingDirectoryPath() throws IOException {
        Assumptions.assumeTrue(Files.isRegularFile(PROPERTIES),
                "run from the erp-backend module directory");

        List<String> storageKeys = List.of(
                "app.storage.models=",
                "app.storage.drawings=",
                "app.cad.worker.preview-dir=",
                "app.cad.worker.temp-root=");

        for (String key : storageKeys) {
            List<String> values = Files.readAllLines(PROPERTIES, StandardCharsets.UTF_8).stream()
                    .filter(line -> line.startsWith(key))
                    .map(line -> line.substring(key.length()).trim())
                    .toList();
            assertThat(values)
                    .as("%s must be declared exactly once in application.properties", key)
                    .hasSize(1);
        }

        List<String> offenders;
        try (Stream<String> lines = Files.lines(PROPERTIES, StandardCharsets.UTF_8)) {
            offenders = lines
                    .filter(line -> storageKeys.stream().anyMatch(line::startsWith))
                    // A working-directory-relative default is the bug: each root
                    // must derive from app.upload.dir (optionally overridden).
                    .filter(line -> line.contains("./uploads") || line.contains("../uploads"))
                    .toList();
        }

        assertThat(offenders)
                .as("storage roots must follow app.upload.dir, never a working-directory path")
                .isEmpty();
    }

    /**
     * The shipped {@code application.properties} as the lowest-precedence source
     * with the given environment overrides above it — the same shape the
     * application builds at startup from the {@code ERP_*} environment.
     */
    private static StandardEnvironment environment(Map<String, String> overrides) {
        StandardEnvironment environment = new StandardEnvironment();
        Properties properties = new Properties();
        try (InputStream stream = Files.newInputStream(PROPERTIES)) {
            properties.load(stream);
        } catch (IOException e) {
            throw new IllegalStateException("Could not read application.properties", e);
        }
        environment.getPropertySources()
                .addLast(new PropertiesPropertySource("application.properties-under-test", properties));
        environment.getPropertySources()
                .addFirst(new PropertiesPropertySource("overrides", asProperties(overrides)));
        return environment;
    }

    private static Properties asProperties(Map<String, String> values) {
        Properties properties = new Properties();
        properties.putAll(values);
        return properties;
    }
}
