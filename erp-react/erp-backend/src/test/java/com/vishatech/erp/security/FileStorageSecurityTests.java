package com.vishatech.erp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.service.FileStorageService;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.Resource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest
@TestPropertySource(properties = {
        "spring.servlet.multipart.max-file-size=1KB",
        "app.upload.dir=${java.io.tmpdir}/erp-test-uploads"
})
class FileStorageSecurityTests extends AbstractSecurityTest {

    @Autowired
    private FileStorageService fileStorageService;

    @TempDir
    java.nio.file.Path tempDir;

    private MockMultipartFile file(String name, byte[] content) {
        return new MockMultipartFile("file", name, "application/octet-stream", content);
    }

    @Test
    void executableExtensionRejected() {
        assertThatThrownBy(() -> fileStorageService.store(
                file("malware.exe", "MZ...".getBytes(StandardCharsets.UTF_8))))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void scriptAndHtmlExtensionsRejected() {
        assertThatThrownBy(() -> fileStorageService.store(
                file("page.html", "<script>".getBytes(StandardCharsets.UTF_8))))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> fileStorageService.store(
                file("script.js", "alert(1)".getBytes(StandardCharsets.UTF_8))))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> fileStorageService.store(
                file("shell.sh", "#!/bin/sh".getBytes(StandardCharsets.UTF_8))))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> fileStorageService.store(
                file("bad.jsp", "<%".getBytes(StandardCharsets.UTF_8))))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void noExtensionRejected() {
        assertThatThrownBy(() -> fileStorageService.store(
                file("noextension", "data".getBytes(StandardCharsets.UTF_8))))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void allowedPdfStoredAndLoadable() {
        String stored = fileStorageService.store(file("contract.pdf", "%PDF-1.4".getBytes(StandardCharsets.UTF_8)));
        assertThat(stored).matches("[0-9a-f]{32}\\.pdf");
        Resource resource = fileStorageService.loadAsResource(stored);
        assertThat(resource.exists()).isTrue();
    }

    @Test
    void pathTraversalFilenameIsNeutralized() {
        // The path components are stripped; only the (safe) extension survives.
        String stored = fileStorageService.store(
                file("../../etc/passwd.pdf", "data".getBytes(StandardCharsets.UTF_8)));
        assertThat(stored).matches("[0-9a-f]{32}\\.pdf");
        assertThat(stored).doesNotContain("..").doesNotContain("/");
    }

    @Test
    void oversizedFileRejected() {
        byte[] big = new byte[2048]; // > 1KB test limit
        assertThatThrownBy(() -> fileStorageService.store(file("big.pdf", big)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void emptyFileRejected() {
        assertThatThrownBy(() -> fileStorageService.store(file("empty.pdf", new byte[0])))
                .isInstanceOf(BadRequestException.class);
    }
}
