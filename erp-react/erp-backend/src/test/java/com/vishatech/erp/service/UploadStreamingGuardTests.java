package com.vishatech.erp.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

/**
 * Regression guard for the upload memory contract.
 *
 * <p>Every upload path must hand bytes to storage in a stream. Copying a whole
 * {@code MultipartFile} into the heap doubles the memory a large upload costs
 * (the container has already spooled it to disk), so this test fails if such a
 * read reappears anywhere in the service layer.
 *
 * <p>The one allowed exception is reading a child process's output in the CAD
 * toolchain, which is text produced by a converter, not an upload.
 */
class UploadStreamingGuardTests {

    private static final Path SOURCE_ROOT = Paths.get("src/main/java");

    /** CAD engines read converter stdout (not uploads) with readAllBytes(). */
    private static final Set<String> PROCESS_OUTPUT_READERS = Set.of(
            "FreeCadConversionEngine.java",
            "SolidWorksDetector.java",
            "SolidWorksLocalConversionEngine.java");

    @Test
    void noUploadIsReadIntoMemory() throws IOException {
        Assumptions.assumeTrue(Files.isDirectory(SOURCE_ROOT),
                "run from the erp-backend module directory");

        List<String> offenders = new ArrayList<>();
        try (Stream<Path> files = Files.walk(SOURCE_ROOT)) {
            for (Path file : files.filter(p -> p.toString().endsWith(".java")).toList()) {
                String source = Files.readString(file, StandardCharsets.UTF_8);
                String fileName = file.getFileName().toString();

                if (source.contains(".getBytes()")) {
                    offenders.add(file + " reads a payload into a byte array (.getBytes())");
                }
                if (!PROCESS_OUTPUT_READERS.contains(fileName) && source.contains("readAllBytes()")) {
                    offenders.add(file + " buffers a whole stream in memory (readAllBytes())");
                }
            }
        }

        assertThat(offenders)
                .as("upload paths must stream bytes through util/UploadStreams, never buffer a whole file")
                .isEmpty();
    }
}
