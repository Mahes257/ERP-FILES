package com.vishatech.erp.production;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.DocumentRepositoryEntry;
import com.vishatech.erp.repository.DocumentRepositoryEntryRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.service.FileStorageService;
import com.vishatech.erp.service.production.ProductionAttachmentService;
import java.util.List;
import com.vishatech.erp.security.CustomUserDetailsService;
import com.vishatech.erp.security.JwtService;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * P5 — the Production attachment endpoints keep their contract after the migration onto the
 * Sales-owned {@code AttachmentStorePort}.
 *
 * <p>The port replaced the entity, the repository and the DTO the controllers used to
 * return, so the risk is not business logic but the <b>wire format</b>: the JSON these
 * endpoints hand the React app must be the same object as before. These tests therefore go
 * through the real HTTP endpoints on a real database — upload, list, delete, delete again —
 * and assert the payload key by key, plus the two pieces of 404/authorization behaviour the
 * migration could have disturbed.
 *
 * <p><b>One measured nuance, stated rather than hidden.</b> The old
 * {@code SalesAttachmentResponse} carried an {@code uploadedBy} component that Production's
 * flow never populated, and production configuration drops nulls
 * ({@code spring.jackson.default-property-inclusion=non_null}), so that key was absent from
 * every Production attachment payload. The published {@code AttachmentRef} simply does not
 * declare it. In this test profile — which does not set {@code non_null} — the difference is
 * visible (the old DTO serialised {@code "uploadedBy":null}); the assertion below therefore
 * accepts "absent or null" for that key instead of pretending the two environments are the
 * same. No field a client ever read carries a value.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ProductionAttachmentContractIntegrationTests extends AbstractSecurityTest {

    /** Long, effectively unique: the attachment table has no foreign key to the order. */
    private static long moduleId() {
        return 9_100_000_000L + (System.nanoTime() % 1_000_000L);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private CustomUserDetailsService userDetailsService;

    @Autowired
    private ProductionAttachmentService attachmentService;

    @Autowired
    private DocumentRepositoryEntryRepository documentRepository;

    @Autowired
    private FileStorageService fileStorageService;

    private String adminToken() {
        return jwtService.generateToken(userDetailsService.loadUserByUsername("admin@vishaktech.com"));
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    @Test
    void uploadingListingAndDeletingAnAttachmentKeepsTheSamePayload() throws Exception {
        long orderId = moduleId();
        byte[] content = "P5 attachment contract".getBytes(StandardCharsets.UTF_8);
        MockMultipartFile file = new MockMultipartFile(
                "file", "p5-contract.txt", "text/plain", content);

        MvcResult upload = mockMvc.perform(multipart("/production-orders/" + orderId + "/attachments")
                        .file(file)
                        .header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode created = json(upload).path("data");
        assertThat(created.fieldNames()).toIterable().contains(
                "id", "name", "contentType", "size", "url", "uploadedAt");
        assertThat(created.path("name").asText()).isEqualTo("p5-contract.txt");
        assertThat(created.path("contentType").asText()).isEqualTo("text/plain");
        assertThat(created.path("size").asLong()).isEqualTo(content.length);
        assertThat(created.path("url").asText()).startsWith("http://localhost:8080/v1/files/");
        assertThat(created.path("url").asText().substring("http://localhost:8080/v1/files/".length()))
                .as("the url points at a real stored file name")
                .isNotBlank();
        assertThat(created.path("uploadedAt").asText()).isNotBlank();
        // The one key that used to exist as a null: absent or null, never a value.
        assertThat(created.path("uploadedBy").isMissingNode() || created.path("uploadedBy").isNull())
                .as("uploadedBy may be absent or null, but must never carry a value")
                .isTrue();
        Long attachmentId = created.path("id").asLong();
        assertThat(attachmentId).isNotNull();
        String url = created.path("url").asText();

        // ------------------------------------------------------------------ list
        MvcResult list = mockMvc.perform(get("/production-orders/" + orderId + "/attachments")
                        .header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode listed = json(list);
        assertThat(listed.isArray()).as("the endpoint returns a bare array, as before").isTrue();
        assertThat(listed).hasSize(1);
        JsonNode row = listed.get(0);
        assertThat(row.fieldNames()).toIterable().contains(
                "id", "name", "contentType", "size", "url", "uploadedAt");
        assertThat(row.path("id").asLong()).isEqualTo(attachmentId);
        assertThat(row.path("name").asText()).isEqualTo("p5-contract.txt");
        assertThat(row.path("url").asText()).isEqualTo(url);

        // Another record's attachment list is unaffected (moduleType/moduleId addressing).
        JsonNode other = json(mockMvc.perform(get("/production-orders/" + (orderId + 1) + "/attachments")
                        .header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(other).isEmpty();

        // ------------------------------------------------------------------ delete
        // Deleting through the WRONG record id must not remove anything (the 404 branch).
        mockMvc.perform(delete("/production-orders/" + (orderId + 1) + "/attachments/" + attachmentId)
                        .header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isNotFound());

        assertThat(json(mockMvc.perform(get("/production-orders/" + orderId + "/attachments")
                        .header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isOk())
                .andReturn())).hasSize(1);

        // Deleting through the right record id succeeds and really removes the row.
        mockMvc.perform(delete("/production-orders/" + orderId + "/attachments/" + attachmentId)
                        .header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isOk());

        assertThat(json(mockMvc.perform(get("/production-orders/" + orderId + "/attachments")
                        .header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isOk())
                .andReturn())).isEmpty();

        // A second delete of the same id is the same 404 as before the port.
        mockMvc.perform(delete("/production-orders/" + orderId + "/attachments/" + attachmentId)
                        .header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isNotFound());
    }

    @Test
    void theAttachmentEndpointsStayBehindAuthenticationAndAuthority() throws Exception {
        long orderId = moduleId();

        mockMvc.perform(get("/production-orders/" + orderId + "/attachments"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(multipart("/production-orders/" + orderId + "/attachments")
                        .file(new MockMultipartFile("file", "p5-contract.txt", "text/plain",
                                "x".getBytes(StandardCharsets.UTF_8))))
                .andExpect(status().isUnauthorized());
    }

    // ==================================================================
    // Documents → Inside ERP archive
    //
    // Every Production attachment upload must leave an INDEPENDENT copy in the
    // shared document repository, filed under the module spelling whose folder
    // the Documents explorer shows for that Production area — and that copy must
    // survive the original attachment being deleted or replaced. These tests own
    // both halves of that claim: they go through the real endpoints and then look
    // at the row and at the file ON DISK, not at the response.
    // ==================================================================

    /** The archived rows filed under one Production record, oldest first. */
    private List<DocumentRepositoryEntry> archived(String module, long recordId) {
        return documentRepository.findByModuleIgnoreCaseAndRelatedRecordId(module, recordId)
                .stream()
                .sorted(java.util.Comparator.comparing(DocumentRepositoryEntry::getId))
                .toList();
    }

    /**
     * The stored file name behind an attachment response's url — the file the
     * ORIGINAL attachment serves. The archived copy must never be that file.
     */
    private static String attachmentStoredName(JsonNode attachment) {
        String url = attachment.path("url").asText();
        return url.substring(url.lastIndexOf('/') + 1);
    }

    @Test
    void uploadingAnAttachmentFilesAnIndependentCopyInTheDocumentsRepository() throws Exception {
        long orderId = moduleId();
        String token = adminToken();
        byte[] content = "P8 archived attachment".getBytes(StandardCharsets.UTF_8);

        MvcResult upload = mockMvc.perform(multipart("/production-orders/" + orderId + "/attachments")
                        .file(new MockMultipartFile("file", "p8-archive.txt", "text/plain", content))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode attachment = json(upload).path("data");
        String attachmentFile = attachmentStoredName(attachment);

        // The manifest of the archived document: the Production module spelling
        // whose folder the explorer shows, the record it belongs to, the file's
        // own name/type/size, who uploaded it and when.
        assertThat(archived("Production Order", orderId))
                .as("one archived copy per uploaded attachment")
                .hasSize(1);
        DocumentRepositoryEntry copy = archived("Production Order", orderId).get(0);
        assertThat(copy.getDocumentName()).isEqualTo("p8-archive.txt");
        assertThat(copy.getStatus()).isEqualTo("uploaded");
        assertThat(copy.getFileSize()).isEqualTo(content.length);
        assertThat(copy.getFilePath()).as("the copy carries its own stored file name").isNotBlank();
        assertThat(copy.getUploadedBy()).isNotBlank();
        assertThat(copy.getCreatedAt()).isNotNull();

        // INDEPENDENT: a second physical file, not the attachment's stored file,
        // written to the same persistent upload store the rest of the ERP uses.
        assertThat(copy.getFilePath())
                .as("the repository must store its own file, never point at the attachment's")
                .isNotEqualTo(attachmentFile);
        assertThat(fileStorageService.existsOnDisk(copy.getFilePath()))
                .as("the archived copy is stored on disk, not just described by a row")
                .isTrue();
        assertThat(fileStorageService.existsOnDisk(attachmentFile))
                .as("the original attachment keeps working")
                .isTrue();

        // Discoverable through the existing Documents listing the explorer reads,
        // filtered by the same module — i.e. it is IN the Production Orders folder.
        JsonNode listed = json(mockMvc.perform(get("/documents")
                        .param("module", "Production Order")
                        .param("size", "200")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(listed.path("content").findValuesAsText("id"))
                .as("the archived copy is listed by the Documents module")
                .contains(String.valueOf(copy.getId()));

        // ... and OPENABLE through the same file endpoint the Documents explorer's
        // Preview / Download use, serving the archived bytes themselves.
        MvcResult served = mockMvc.perform(get("/documents/" + copy.getId() + "/file")
                        .param("mode", "inline")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(served.getResponse().getContentAsByteArray())
                .as("the archived copy serves the uploaded bytes, independently of the attachment")
                .isEqualTo(content);
    }

    @Test
    void theArchivedCopyOutlivesDeletingAndReplacingTheOriginalAttachment() throws Exception {
        long orderId = moduleId();
        String token = adminToken();
        byte[] first = "first revision".getBytes(StandardCharsets.UTF_8);
        byte[] second = "replacement revision".getBytes(StandardCharsets.UTF_8);

        MvcResult firstUpload = mockMvc.perform(multipart("/production-orders/" + orderId + "/attachments")
                        .file(new MockMultipartFile("file", "p8-keep.txt", "text/plain", first))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())
                .andReturn();
        Long firstAttachmentId = json(firstUpload).path("data").path("id").asLong();
        DocumentRepositoryEntry firstCopy = archived("Production Order", orderId).get(0);
        Long firstCopyId = firstCopy.getId();
        String firstCopyFile = firstCopy.getFilePath();
        assertThat(fileStorageService.existsOnDisk(firstCopyFile)).isTrue();

        // ---- the operator removes the attachment from the Production record ----
        mockMvc.perform(delete("/production-orders/" + orderId + "/attachments/" + firstAttachmentId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        assertThat(archived("Production Order", orderId))
                .as("deleting the attachment must never remove the archived document")
                .hasSize(1);
        assertThat(documentRepository.findById(firstCopyId))
                .as("the archived document row survives the attachment's deletion")
                .isPresent();
        assertThat(fileStorageService.existsOnDisk(firstCopyFile))
                .as("the archived FILE survives the attachment's deletion")
                .isTrue();

        // ---- and a replacement upload must not touch it either ----
        mockMvc.perform(multipart("/production-orders/" + orderId + "/attachments")
                        .file(new MockMultipartFile("file", "p8-keep.txt", "text/plain", second))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated());

        List<DocumentRepositoryEntry> afterReplacement = archived("Production Order", orderId);
        assertThat(afterReplacement).as("the replacement gets its own archived copy").hasSize(2);
        DocumentRepositoryEntry survivor = afterReplacement.stream()
                .filter(row -> row.getId().equals(firstCopyId))
                .findFirst()
                .orElseThrow();
        assertThat(survivor.getFilePath())
                .as("replacing the original attachment must not replace the archived copy")
                .isEqualTo(firstCopyFile);
        assertThat(survivor.getFileSize()).isEqualTo(first.length);
        assertThat(fileStorageService.existsOnDisk(firstCopyFile))
                .as("the first revision is still on disk after the replacement")
                .isTrue();
    }

    @Test
    void aWorkOrderItemsAttachmentIsArchivedAgainstTheOrderThatOwnsIt() {
        long orderId = moduleId();
        long itemId = orderId + 7;

        attachmentService.addAttachment("PRODUCTION_ORDER_ITEM", itemId,
                new MockMultipartFile("file", "p8-item.txt", "text/plain",
                        "item attachment".getBytes(StandardCharsets.UTF_8)),
                orderId);

        // Filed against the Work Order (the record "Open Related Record" resolves),
        // not against the item id, which no record route could open.
        assertThat(archived("Production Order", orderId)).hasSize(1);
        assertThat(archived("Production Order", itemId)).isEmpty();
        DocumentRepositoryEntry copy = archived("Production Order", orderId).get(0);
        assertThat(copy.getDocumentName()).isEqualTo("p8-item.txt");
        assertThat(copy.getRelatedRecordId()).isEqualTo(orderId);
        assertThat(fileStorageService.existsOnDisk(copy.getFilePath())).isTrue();
    }
}
