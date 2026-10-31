package com.vishatech.erp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.vishatech.erp.service.FileStorageService;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
class FileSecurityTests extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private CustomUserDetailsService userDetailsService;

    @Autowired
    private FileStorageService fileStorageService;

    private String adminToken() {
        return jwtService.generateToken(userDetailsService.loadUserByUsername("admin@vishaktech.com"));
    }

    @Test
    void fileDownloadWithoutAuthReturns401() throws Exception {
        mockMvc.perform(get("/files/whatever.txt")).andExpect(status().isUnauthorized());
    }

    @Test
    void storageEndpointWithoutAuthReturns401() throws Exception {
        mockMvc.perform(get("/files/storage")).andExpect(status().isUnauthorized());
    }

    @Test
    void storageEndpointWithAuthReturns200() throws Exception {
        mockMvc.perform(get("/files/storage").header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isOk());
    }

    @Test
    void storedFileDownloadableByAuthenticatedUser() throws Exception {
        MockMultipartFile upload = new MockMultipartFile(
                "file", "report.pdf", "application/pdf", "%PDF-1.4 test".getBytes(StandardCharsets.UTF_8));
        String storedName = fileStorageService.store(upload);
        assertThat(storedName).matches("[0-9a-f]{32}\\.pdf");

        MvcResult result = mockMvc.perform(get("/files/" + storedName)
                        .header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andReturn();
        assertThat(result.getResponse().getContentAsString()).contains("test");
    }

    @Test
    void pathTraversalFilenameRejected() throws Exception {
        mockMvc.perform(get("/files/../../etc/passwd")
                        .header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void encodedPathTraversalRejected() throws Exception {
        mockMvc.perform(get("/files/..%2F..%2Fetc%2Fpasswd")
                        .header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void nonUuidFilenameRejected() throws Exception {
        mockMvc.perform(get("/files/secret-document.pdf")
                        .header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void nonexistentStoredFileReturns404() throws Exception {
        mockMvc.perform(get("/files/" + "0123456789abcdef0123456789abcdef.pdf")
                        .header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isNotFound());
    }

    @Test
    void storedNameValidationRejectsTraversalAndNonUuid() {
        assertThat(fileStorageService.isSafeStoredName("../evil.pdf")).isFalse();
        assertThat(fileStorageService.isSafeStoredName("evil.pdf")).isFalse();
        assertThat(fileStorageService.isSafeStoredName("a/b.pdf")).isFalse();
        assertThat(fileStorageService.isSafeStoredName("0123456789abcdef0123456789abcdef")).isTrue();
        assertThat(fileStorageService.isSafeStoredName("0123456789abcdef0123456789abcdef.pdf")).isTrue();
        // Format check only — executable extensions are additionally rejected
        // at upload time by the allowlist (see FileStorageSecurityTests).
        assertThat(fileStorageService.isSafeStoredName("0123456789abcdef0123456789abcdef.exe")).isTrue();
    }
}
