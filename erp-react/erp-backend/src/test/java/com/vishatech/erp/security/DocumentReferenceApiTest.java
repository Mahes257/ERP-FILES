package com.vishatech.erp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.DocumentRepositoryEntry;
import com.vishatech.erp.repository.DocumentRepositoryEntryRepository;
import com.vishatech.erp.service.FileStorageService;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * "Upload Document → Inside ERP" — filing a document that the repository ALREADY
 * stores into another repository context.
 *
 * The flow's whole point is that the stored file is REUSED: no upload of the
 * same bytes, no second copy on disk, and no change to the source document.
 * These tests pin exactly that, plus the cases the dialog has to report clearly
 * (a document with nothing to reuse, a document in the trash, an unknown id,
 * and an unauthenticated call).
 */
// Registration budget raised for THIS class only, exactly like the rest of the
// security suite (see AuthSecurityTests / SalesSettingsApiTest). The MockMvc
// client IP is a single bucket shared by every class that runs in the same
// Spring context, and this class registers four users, so with the production
// default (5 registrations per IP per hour) one further registration — here or
// in any class that joins this context later — left the last test to run with
// an order-dependent 429 instead of its real assertion. Pinning the budget in
// the class keeps the limiter's real behaviour intact (RateLimitTests still
// proves the 429 with its own low limits) while making this class independent
// of execution order.
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class DocumentReferenceApiTest extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private FileStorageService fileStorageService;

    @Autowired
    private DocumentRepositoryEntryRepository documents;

    private String register(String email, String name) throws Exception {
        MvcResult result = mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "fullName", name,
                                "email", email,
                                "password", "password123"))))
                .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("token").asText();
    }

    /** Uploads a real file through the existing repository upload endpoint. */
    private JsonNode upload(String token, String fileName, byte[] bytes) throws Exception {
        MvcResult result = mockMvc.perform(multipart("/documents/upload")
                        .file(new MockMultipartFile("file", fileName, "application/pdf", bytes))
                        .param("module", "Quotation")
                        .param("recordNumber", "QTN-2026-000042")
                        .param("customerName", "Apex Industries")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).path("data");
    }

    @Test
    void referenceEndpointRequiresAuthentication() throws Exception {
        mockMvc.perform(post("/documents/1/reference")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"module\":\"Sales\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void referencingAnExistingDocumentReusesItsStoredFile() throws Exception {
        String token = register("inside-erp@example.com", "Inside Erp");
        byte[] bytes = "%PDF-1.4 inside-erp fixture".getBytes(StandardCharsets.UTF_8);
        JsonNode source = upload(token, "inside-erp-source.pdf", bytes);
        long sourceId = source.path("id").asLong();
        String sourceFilePath = source.path("filePath").asText();
        String sourceVisibility = source.path("visibility").asText();
        assertThat(sourceFilePath).isNotBlank();

        // Files actually on disk — the reuse must not add one.
        int filesBefore = fileStorageService.listRootFiles().size();

        MvcResult created = mockMvc.perform(post("/documents/" + sourceId + "/reference")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"module\":\"Sales\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").isNumber())
                .andExpect(jsonPath("$.data.module").value("Sales"))
                // the SAME stored file, its type and its size
                .andExpect(jsonPath("$.data.filePath").value(sourceFilePath))
                .andExpect(jsonPath("$.data.fileType").value("application/pdf"))
                .andExpect(jsonPath("$.data.fileSize").value(bytes.length))
                // the source's own nature and access scope are kept
                .andExpect(jsonPath("$.data.status").value("uploaded"))
                .andExpect(jsonPath("$.data.visibility").value(sourceVisibility))
                // origin stays readable, and is recorded for the flow itself
                .andExpect(jsonPath("$.data.documentName").value("inside-erp-source.pdf"))
                .andExpect(jsonPath("$.data.recordNumber").value("QTN-2026-000042"))
                .andExpect(jsonPath("$.data.customerName").value("Apex Industries"))
                .andExpect(jsonPath("$.data.metadata").value(containsString("referencedDocumentId")))
                .andReturn();
        long referenceId = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();
        assertThat(referenceId).isNotEqualTo(sourceId);

        // The provenance marker is really persisted (read back from the DB, not
        // from the response that created it).
        DocumentRepositoryEntry persistedReference = documents.findById(referenceId).orElseThrow();
        assertThat(persistedReference.getMetadata())
                .contains("\"referencedDocumentId\":" + sourceId);
        assertThat(persistedReference.getFilePath()).isEqualTo(sourceFilePath);

        // No second copy of the physical file was written.
        assertThat(fileStorageService.listRootFiles().size()).isEqualTo(filesBefore);

        // The new entry serves the real bytes of the referenced file.
        mockMvc.perform(get("/documents/" + referenceId + "/file").param("mode", "attachment")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", containsString("inside-erp-source.pdf")))
                .andExpect(content().bytes(bytes));

        // The source document itself is untouched (same file, same status).
        mockMvc.perform(get("/documents/" + sourceId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.filePath").value(sourceFilePath))
                .andExpect(jsonPath("$.data.status").value("uploaded"));

        // The reference is audited as such.
        mockMvc.perform(get("/documents/" + referenceId + "/audit")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[*].action", org.hamcrest.Matchers.hasItem("REFERENCED")));

        // Filing the same document into the same context twice is refused, so a
        // repeated click cannot pile up duplicate rows.
        mockMvc.perform(post("/documents/" + sourceId + "/reference")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"module\":\"Sales\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("already in the repository")));
        assertThat(fileStorageService.listRootFiles().size()).isEqualTo(filesBefore);

        // A blank module falls back to the source document's own module — which
        // already holds this file as an ACTIVE document, so it is the same
        // duplicate: refused with the entry that holds it, still no new row.
        mockMvc.perform(post("/documents/" + sourceId + "/reference")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("already in the repository")))
                .andExpect(jsonPath("$.message", containsString("QTN-2026-000042")));
        assertThat(fileStorageService.listRootFiles().size()).isEqualTo(filesBefore);
    }

    /**
     * The duplicate rule is keyed on the STORED FILE and the target context, not
     * on the document name or on a previous reference: a context that already
     * holds the file as an active document refuses a second entry for it, and a
     * context that holds it only as an ARCHIVED document does not — filing it
     * back into the active list is precisely what the selection is for.
     */
    @Test
    void archivedRowDoesNotBlockFilingTheSameFileIntoItsContext() throws Exception {
        String token = register("inside-erp-archived@example.com", "Inside Erp Archived");
        byte[] bytes = "%PDF-1.4 archived fixture".getBytes(StandardCharsets.UTF_8);
        JsonNode source = upload(token, "inside-erp-archived.pdf", bytes);
        long sourceId = source.path("id").asLong();
        String sourceFilePath = source.path("filePath").asText();
        int filesBefore = fileStorageService.listRootFiles().size();

        // The source context holds the file, but only as an archived document.
        DocumentRepositoryEntry row = documents.findById(sourceId).orElseThrow();
        row.setStatus("archived");
        documents.save(row);

        MvcResult created = mockMvc.perform(post("/documents/" + sourceId + "/reference")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"module\":\"Quotation\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.module").value("Quotation"))
                .andExpect(jsonPath("$.data.filePath").value(sourceFilePath))
                .andReturn();
        long referenceId = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        // The new entry is an ACTIVE row for the same stored file...
        assertThat(documents.findById(referenceId).orElseThrow().getStatus()).isEqualTo("uploaded");
        // ...the archived document behind it is untouched...
        assertThat(documents.findById(sourceId).orElseThrow().getStatus()).isEqualTo("archived");
        // ...and the physical file was reused, not written again.
        assertThat(fileStorageService.listRootFiles().size()).isEqualTo(filesBefore);

        // Now that an ACTIVE row holds the file in that context, the same
        // selection is a duplicate again.
        mockMvc.perform(post("/documents/" + sourceId + "/reference")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"module\":\"Quotation\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("already in the repository")));
    }

    /**
     * What the selection dialog lists: the Sales modules' files that a selection
     * may actually reuse — archived documents included (their file is still
     * there and filing it back in is a real action), records with no stored file
     * and trashed rows excluded.
     */
    @Test
    void selectionPoolOffersStoredFilesIncludingArchivedOnes() throws Exception {
        String token = register("inside-erp-pool@example.com", "Inside Erp Pool");
        JsonNode live = upload(token, "pool-live.pdf",
                "%PDF-1.4 pool live".getBytes(StandardCharsets.UTF_8));
        JsonNode archived = upload(token, "pool-archived.pdf",
                "%PDF-1.4 pool archived".getBytes(StandardCharsets.UTF_8));
        long archivedId = archived.path("id").asLong();
        DocumentRepositoryEntry archivedRow = documents.findById(archivedId).orElseThrow();
        archivedRow.setStatus("archived");
        documents.save(archivedRow);

        // A record document whose file was never generated has nothing to reuse.
        mockMvc.perform(post("/documents")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "documentName", "pool-fileless.pdf",
                                "documentType", "Quotation",
                                "module", "Quotation"))))
                .andExpect(status().isCreated());

        List<String> reusable = listedNames(token, "reusable", "true", "scope", "sales", "size", "200");
        assertThat(reusable).contains("pool-live.pdf", "pool-archived.pdf");
        assertThat(reusable).doesNotContain("pool-fileless.pdf");
        // The page's own listing still hides the archived row: the wider pool is
        // only what the selection dialog asks for.
        assertThat(listedNames(token, "scope", "sales", "size", "200"))
                .contains("pool-live.pdf")
                .doesNotContain("pool-archived.pdf");
        assertThat(live.path("id").asLong()).isPositive();
    }

    /** Document names of a paged listing, for the pool assertions above. */
    private List<String> listedNames(String token, String... params) throws Exception {
        var request = get("/documents").header("Authorization", "Bearer " + token);
        for (int i = 0; i + 1 < params.length; i += 2) {
            request = request.param(params[i], params[i + 1]);
        }
        MvcResult result = mockMvc.perform(request).andExpect(status().isOk()).andReturn();
        List<String> names = new java.util.ArrayList<>();
        for (JsonNode row : objectMapper.readTree(result.getResponse().getContentAsString()).path("content")) {
            names.add(row.path("documentName").asText());
        }
        return names;
    }

    @Test
    void referenceRejectsSourcesThatHaveNothingToReuse() throws Exception {
        String token = register("inside-erp-refuse@example.com", "Inside Erp Refuse");

        // A record document whose PDF was never generated stores "metadata-only".
        MvcResult metadataOnly = mockMvc.perform(post("/documents")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "documentName", "Record Document",
                                "documentType", "Quotation",
                                "module", "Quotation"))))
                .andExpect(status().isCreated())
                .andReturn();
        long metadataOnlyId = objectMapper.readTree(metadataOnly.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        mockMvc.perform(post("/documents/" + metadataOnlyId + "/reference")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"module\":\"Sales\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("no stored file")));

        // A document in the trash is not offered as a source either. The trash
        // state is set up directly (DELETE stays ADMIN/uploader-only, and this
        // fixture exists to exercise the guard, not the lifecycle action).
        JsonNode source = upload(token, "inside-erp-trashed.pdf",
                "%PDF-1.4 trashed fixture".getBytes(StandardCharsets.UTF_8));
        long sourceId = source.path("id").asLong();
        DocumentRepositoryEntry trashed = documents.findById(sourceId).orElseThrow();
        trashed.setStatus("deleted");
        documents.save(trashed);
        mockMvc.perform(post("/documents/" + sourceId + "/reference")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"module\":\"Sales\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("trash")));

        // An unknown source is a clean 404, not a silent success.
        mockMvc.perform(post("/documents/99999999/reference")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"module\":\"Sales\"}"))
                .andExpect(status().isNotFound());
    }
}
