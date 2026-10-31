package com.vishatech.erp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
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
 * Documents module API verification for the migrated SOURCE implementation:
 * endpoint authorization, create + read-back persistence, the lifecycle
 * actions (visibility / archive / restore), the audit trail, the per-record
 * listing, the stats endpoint and the ADMIN-only document settings.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class DocumentsApiTest extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private CustomUserDetailsService userDetailsService;

    /** Only ADMIN holds DOCUMENT_DELETE, so the trash fixture needs the seeded admin. */
    private String adminToken() {
        return jwtService.generateToken(userDetailsService.loadUserByUsername("admin@vishaktech.com"));
    }

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

    @Test
    void documentEndpointsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/documents")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/documents/stats")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/documents/by-record")
                        .param("module", "Quotation").param("relatedRecordId", "1"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/documents/reconcile")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/settings/documents")).andExpect(status().isUnauthorized());
    }

    @Test
    void documentLifecyclePersistsAndAudits() throws Exception {
        String token = register("docs-user@example.com", "Docs User");

        MvcResult created = mockMvc.perform(post("/documents")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "documentName", "Test Certificate",
                                "documentType", "Certificate",
                                "module", "Documents",
                                "recordNumber", "DOC-TEST-1",
                                "visibility", "TEAM_ONLY",
                                "description", "verification fixture"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.documentName").value("Test Certificate"))
                .andExpect(jsonPath("$.data.status").value("uploaded"))
                .andReturn();

        long id = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        // Read-back through the detail endpoint.
        mockMvc.perform(get("/documents/" + id)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.recordNumber").value("DOC-TEST-1"));

        // The creation event is persisted in the audit trail.
        mockMvc.perform(get("/documents/" + id + "/audit")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[*].action", org.hamcrest.Matchers.hasItem("CREATED")));

        // Visibility change is audited.
        mockMvc.perform(patch("/documents/" + id + "/visibility")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"visibility\":\"BOTH\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.visibility").value("BOTH"));

        // Archive -> restore round-trip.
        mockMvc.perform(patch("/documents/archive/" + id)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("archived"));
        // A metadata-only document returns to "generated" once restored.
        mockMvc.perform(patch("/documents/restore/" + id)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("generated"));

        // The audit trail now records the full lifecycle.
        mockMvc.perform(get("/documents/" + id + "/audit")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[*].action")
                        .value(org.hamcrest.Matchers.hasItems(
                                "CREATED", "VISIBILITY_CHANGED", "ARCHIVED", "RESTORED")));

        // Per-record listing and stats.
        mockMvc.perform(get("/documents/by-record")
                        .header("Authorization", "Bearer " + token)
                        .param("module", "Documents").param("relatedRecordId", "999001"))
                .andExpect(status().isOk());
        mockMvc.perform(get("/documents/stats")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").isNumber());
    }

    @Test
    void metadataEditRequiresDocumentEditAuthority() throws Exception {
        String token = register("docs-viewer@example.com", "Docs Viewer");

        MvcResult created = mockMvc.perform(post("/documents")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "documentName", "Edit Guard",
                                "documentType", "Certificate",
                                "module", "Documents",
                                "visibility", "TEAM_ONLY"))))
                .andReturn();
        long id = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        // A plain USER holds DOCUMENT_VIEW/CREATE but not DOCUMENT_EDIT.
        mockMvc.perform(put("/documents/" + id)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "documentName", "Edit Guard 2",
                                "documentType", "Certificate",
                                "module", "Documents",
                                "visibility", "TEAM_ONLY"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void regeneratingANonGeneratedTypeIsRejected() throws Exception {
        String token = register("docs-regen@example.com", "Docs Regen");

        MvcResult created = mockMvc.perform(post("/documents")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "documentName", "No Generator",
                                "documentType", "Certificate",
                                "module", "Documents",
                                "visibility", "TEAM_ONLY",
                                "relatedRecordId", 123))))
                .andReturn();
        long id = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        mockMvc.perform(post("/documents/" + id + "/regenerate")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());
    }

    @Test
    void maintenanceJobsAreGuarded() throws Exception {
        // Neither maintenance job is reachable without a session.
        mockMvc.perform(post("/documents/migrate-cpo-terminology"))
                .andExpect(status().isUnauthorized());

        String token = register("docs-maint@example.com", "Docs Maintenance");

        // Renumbering sales orders to the canonical CPO wording is ADMIN-only,
        // so a plain USER is refused before the job body runs.
        mockMvc.perform(post("/documents/migrate-cpo-terminology")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    @Test
    void visibilityChangeValidatesItsTypedBody() throws Exception {
        String token = register("docs-visibility@example.com", "Docs Visibility");

        MvcResult created = mockMvc.perform(post("/documents")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "documentName", "Visibility Fixture",
                                "documentType", "Certificate",
                                "module", "Documents",
                                "visibility", "TEAM_ONLY"))))
                .andReturn();
        long id = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        // A missing or blank value is a validation error, not a silent no-op.
        mockMvc.perform(patch("/documents/" + id + "/visibility")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(patch("/documents/" + id + "/visibility")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"visibility\":\"  \"}"))
                .andExpect(status().isBadRequest());
        // An unknown value is still refused by the service's enum check.
        mockMvc.perform(patch("/documents/" + id + "/visibility")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"visibility\":\"NOT_A_VISIBILITY\"}"))
                .andExpect(status().isBadRequest());
        // The supported value persists exactly as before the typed-body change.
        mockMvc.perform(patch("/documents/" + id + "/visibility")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"visibility\":\"BOTH\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.visibility").value("BOTH"));
    }

    /**
     * The Sales Documents page is scoped on the backend, not in the browser:
     * `scope=sales` must return — and count — only Sales-owned modules, the
     * unscoped listing must keep returning the whole shared repository, and an
     * unknown scope must be refused instead of silently widening the result.
     */
    @Test
    void salesScopeExcludesOtherErpModules() throws Exception {
        String token = register("docs-scope@example.com", "Docs Scope");
        createDocument(token, "Scope Sales Fixture", "Quotation");
        createDocument(token, "Scope Production Fixture", "Work Order");

        // Unscoped: the shared repository, unchanged.
        assertThat(listedModules(token, "size", "200"))
                .contains("Quotation", "Work Order");

        // Scoped: Sales modules only — search/filters/pagination share the query.
        assertThat(listedModules(token, "scope", "sales", "size", "200"))
                .contains("Quotation")
                .doesNotContain("Work Order")
                .doesNotContain("Documents");
        assertThat(listedModules(token, "scope", "sales", "search", "Scope Production Fixture"))
                .isEmpty();
        assertThat(listedModules(token, "scope", "sales", "search", "Scope Sales Fixture"))
                .containsExactly("Quotation");

        // The KPI counters describe the same Sales-only dataset.
        JsonNode all = stats(token, null);
        JsonNode sales = stats(token, "sales");
        assertThat(sales.path("byModule").has("Quotation")).isTrue();
        assertThat(sales.path("byModule").has("Work Order")).isFalse();
        assertThat(sales.path("total").asLong()).isLessThan(all.path("total").asLong());

        // An unknown scope is a validation error, never a silent ignore.
        mockMvc.perform(get("/documents").param("scope", "production")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/documents/stats").param("scope", "production")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());
    }

    /**
     * The scoped listing shows the ACTIVE repository: a trashed (soft deleted)
     * row and an archived row leave the working list — the two states the page
     * keeps behind its Status filter — while the unscoped listing keeps
     * returning the whole shared repository, and the Sales counters describe
     * exactly the rows that are listed instead of pretending the terminal states
     * never existed.
     */
    @Test
    void salesScopeListsActiveDocumentsOnly() throws Exception {
        String token = adminToken();

        createDocument(token, "Active Scope Fixture", "Quotation");
        long archivedId = createDocumentReturningId(token, "Archived Scope Fixture", "Quotation");
        long trashedId = createDocumentReturningId(token, "Trashed Scope Fixture", "Quotation");

        mockMvc.perform(patch("/documents/archive/" + archivedId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("archived"));
        mockMvc.perform(delete("/documents/" + trashedId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        // Unscoped: the shared repository is unchanged — trashed rows included.
        assertThat(listedNames(token, "size", "200"))
                .contains("Active Scope Fixture", "Archived Scope Fixture", "Trashed Scope Fixture");

        // Scoped: only the active row is listed.
        assertThat(listedNames(token, "scope", "sales", "size", "200"))
                .contains("Active Scope Fixture")
                .doesNotContain("Archived Scope Fixture", "Trashed Scope Fixture");

        // Both terminal states stay one Status filter away (and restorable).
        assertThat(listedNames(token, "scope", "sales", "status", "deleted", "size", "200"))
                .contains("Trashed Scope Fixture")
                .doesNotContain("Active Scope Fixture");
        assertThat(listedNames(token, "scope", "sales", "status", "archived", "size", "200"))
                .contains("Archived Scope Fixture")
                .doesNotContain("Active Scope Fixture");

        // The scoped counters describe the listed rows…
        JsonNode sales = stats(token, "sales");
        assertThat(listedNames(token, "scope", "sales", "size", "500"))
                .hasSize((int) sales.path("total").asLong());
        // …and still report the trashed and archived rows.
        assertThat(sales.path("deleted").asLong()).isGreaterThanOrEqualTo(1);
        assertThat(sales.path("archived").asLong()).isGreaterThanOrEqualTo(1);
    }

    /** Create a repository fixture and return its id. */
    private long createDocumentReturningId(String token, String name, String module) throws Exception {
        MvcResult result = mockMvc.perform(post("/documents")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "documentName", name,
                                "documentType", "Certificate",
                                "module", module,
                                "visibility", "TEAM_ONLY"))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("id").asLong();
    }

    /** Document-name column of every row the paged listing returns. */
    private List<String> listedNames(String token, String... params) throws Exception {
        var request = get("/documents").header("Authorization", "Bearer " + token);
        for (int i = 0; i + 1 < params.length; i += 2) {
            request = request.param(params[i], params[i + 1]);
        }
        MvcResult result = mockMvc.perform(request).andExpect(status().isOk()).andReturn();
        List<String> names = new ArrayList<>();
        for (JsonNode row : objectMapper.readTree(result.getResponse().getContentAsString()).path("content")) {
            names.add(row.path("documentName").asText());
        }
        return names;
    }

    private void createDocument(String token, String name, String module) throws Exception {
        mockMvc.perform(post("/documents")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "documentName", name,
                                "documentType", "Certificate",
                                "module", module,
                                "visibility", "TEAM_ONLY"))))
                .andExpect(status().isCreated());
    }

    /** Module column of every row the paged listing returns. */
    private List<String> listedModules(String token, String... params) throws Exception {
        var request = get("/documents").header("Authorization", "Bearer " + token);
        for (int i = 0; i + 1 < params.length; i += 2) {
            request = request.param(params[i], params[i + 1]);
        }
        MvcResult result = mockMvc.perform(request).andExpect(status().isOk()).andReturn();
        List<String> modules = new ArrayList<>();
        for (JsonNode row : objectMapper.readTree(result.getResponse().getContentAsString()).path("content")) {
            modules.add(row.path("module").asText());
        }
        return modules;
    }

    private JsonNode stats(String token, String scope) throws Exception {
        var request = get("/documents/stats").header("Authorization", "Bearer " + token);
        if (scope != null) request = request.param("scope", scope);
        MvcResult result = mockMvc.perform(request).andExpect(status().isOk()).andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).path("data");
    }

    /**
     * The Documents page's two roots, in the exact request shapes the browser
     * sends (page 0, size 200, newest-first): the Local Doc folder
     * ({@code module=Local Doc}) and the Inside ERP root ({@code scope=sales}).
     *
     * <p>Regression guard for the reported failure, whose shape was "any listing
     * that returns a row" — the count-only endpoints kept working while every
     * rows-returning read failed. The assertions are therefore about the rows: the
     * existing page envelope, every column the table renders, on <em>every</em>
     * returned row, the requested newest-first order, and the
     * upload → list → download round trip on the very row that was uploaded.
     */
    @Test
    void pageRootListingsReturnFullyHydratedPagedRows() throws Exception {
        String token = register("docs-roots@example.com", "Docs Roots");

        uploadReturningId(token, "local-root-first.pdf");
        long second = uploadReturningId(token, "local-root-second.pdf");

        MvcResult listing = mockMvc.perform(get("/documents")
                        .param("module", "Local Doc")
                        .param("page", "0")
                        .param("size", "200")
                        .param("sort", "createdAt:desc")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                // the existing page envelope, unchanged
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.number").value(0))
                .andExpect(jsonPath("$.size").value(200))
                .andExpect(jsonPath("$.totalElements").isNumber())
                .andExpect(jsonPath("$.totalPages").isNumber())
                .andExpect(jsonPath("$.numberOfElements").isNumber())
                .andExpect(jsonPath("$.first").value(true))
                .andExpect(jsonPath("$.empty").value(false))
                .andReturn();

        JsonNode page = objectMapper.readTree(listing.getResponse().getContentAsString());
        assertThat(page.path("numberOfElements").asInt()).isEqualTo(page.path("content").size());
        assertThat(page.path("content").size()).isGreaterThan(1);

        // Every returned row is fully hydrated — the failure was a row, not a count.
        List<String> localDocNames = new ArrayList<>();
        List<java.time.LocalDateTime> createdAts = new ArrayList<>();
        for (JsonNode row : page.path("content")) {
            assertThat(row.path("id").asLong()).isPositive();
            assertThat(row.path("documentName").asText()).isNotBlank();
            assertThat(row.path("documentType").asText()).isNotBlank();
            assertThat(row.path("module").asText()).isEqualTo("Local Doc");
            assertThat(row.path("visibility").asText()).isNotBlank();
            assertThat(row.path("status").asText()).isNotBlank();
            assertThat(row.path("createdAt").asText()).isNotBlank();
            assertThat(row.path("filePath").asText()).isNotBlank();
            assertThat(row.path("fileSize").asLong()).isPositive();
            assertThat(row.path("versionNumber").asInt()).isPositive();
            assertThat(row.path("canView").isBoolean()).isTrue();
            assertThat(row.path("canDownload").isBoolean()).isTrue();
            assertThat(row.path("canEdit").isBoolean()).isTrue();
            assertThat(row.path("canDelete").isBoolean()).isTrue();
            localDocNames.add(row.path("documentName").asText());
            createdAts.add(java.time.LocalDateTime.parse(row.path("createdAt").asText()));
        }

        // Both uploaded files are listed, newest first, as the page asked for.
        assertThat(localDocNames).contains("local-root-first.pdf", "local-root-second.pdf");
        for (int i = 1; i < createdAts.size(); i++) {
            assertThat(createdAts.get(i)).isBeforeOrEqualTo(createdAts.get(i - 1));
        }

        // The listed row serves its stored file: upload → list → download.
        mockMvc.perform(get("/documents/" + second + "/file").param("mode", "attachment")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition",
                        org.hamcrest.Matchers.containsString("local-root-second.pdf")));
    }

    /**
     * {@code scope=sales} is the Inside ERP root: it lists the Sales-owned modules
     * and keeps excluding the other ERP areas <em>and</em> the page's own Local Doc
     * uploads, so a document is never shown under both roots.
     */
    @Test
    void salesScopeRootListingExcludesLocalAndOtherErpModules() throws Exception {
        String token = register("docs-scope-root@example.com", "Docs Scope Root");
        createDocument(token, "Scope Root Sales Fixture", "Lead");
        createDocument(token, "Scope Root Other Fixture", "Work Order");
        uploadReturningId(token, "local-root-excluded.pdf");

        MvcResult listing = mockMvc.perform(get("/documents")
                        .param("scope", "sales")
                        .param("page", "0")
                        .param("size", "200")
                        .param("sort", "createdAt:desc")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.number").value(0))
                .andExpect(jsonPath("$.size").value(200))
                .andExpect(jsonPath("$.totalElements").isNumber())
                .andExpect(jsonPath("$.numberOfElements").isNumber())
                .andExpect(jsonPath("$.last").isBoolean())
                .andReturn();

        List<String> modules = new ArrayList<>();
        JsonNode page = objectMapper.readTree(listing.getResponse().getContentAsString());
        for (JsonNode row : page.path("content")) {
            assertThat(row.path("id").asLong()).isPositive();
            assertThat(row.path("module").asText()).isNotBlank();
            assertThat(row.path("documentName").asText()).isNotBlank();
            assertThat(row.path("createdAt").asText()).isNotBlank();
            modules.add(row.path("module").asText());
        }
        assertThat(modules).contains("Lead");
        assertThat(modules).doesNotContain("Work Order", "Local Doc");
    }

    /** Upload one real file into the Local Doc root (the page's own upload) and return its id. */
    private long uploadReturningId(String token, String fileName) throws Exception {
        MvcResult result = mockMvc.perform(multipart("/documents/upload")
                        .file(new MockMultipartFile("file", fileName, "application/pdf",
                                ("%PDF-1.4 " + fileName).getBytes(StandardCharsets.UTF_8)))
                        .param("module", "Local Doc")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())
                .andReturn();
        long id = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("id").asLong();
        assertThat(id).isPositive();
        return id;
    }

    @Test
    void documentSettingsAreAdminOnly() throws Exception {
        String token = register("docs-settings@example.com", "Docs Settings");

        // A plain USER has no SETTINGS_MANAGE authority.
        mockMvc.perform(get("/settings/documents")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    /**
     * The repository listing clamps {@code page} and {@code size} exactly like the
     * Sales listing services do.
     *
     * <p>Both query parameters are user-supplied, and the endpoint used to pass
     * them straight to {@code PageRequest.of}: a negative page or a non-positive
     * size made Spring throw {@code IllegalArgumentException} ("Page index must not
     * be less than zero" / "Page size must not be less than one"), which the shared
     * handler surfaced as a 500 — a bad request parameter reported as a server
     * fault. An oversized {@code size} was accepted verbatim, letting one request
     * hydrate the whole repository before the in-process visibility filter ran.
     *
     * <p>Every case here is a request the page can actually send, and each one
     * asserts the clamped envelope the client sees rather than just the status.
     */
    @Test
    void repositoryListingClampsPageAndSizeInsteadOfFailing() throws Exception {
        String token = register("docs-paging@example.com", "Docs Paging");
        uploadReturningId(token, "paging-fixture.pdf");

        // An oversized page size is capped at the listing ceiling (200).
        mockMvc.perform(get("/documents")
                        .param("page", "0")
                        .param("size", "500")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(200))
                .andExpect(jsonPath("$.number").value(0))
                .andExpect(jsonPath("$.content").isArray());

        // A non-positive size becomes 1 instead of a 500.
        mockMvc.perform(get("/documents")
                        .param("page", "0")
                        .param("size", "0")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(1));

        mockMvc.perform(get("/documents")
                        .param("page", "0")
                        .param("size", "-5")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(1));

        // A negative page becomes 0 instead of a 500.
        mockMvc.perform(get("/documents")
                        .param("page", "-1")
                        .param("size", "10")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.number").value(0))
                .andExpect(jsonPath("$.size").value(10))
                .andExpect(jsonPath("$.first").value(true));

        // The clamped listing still returns the real rows, so the clamp is not
        // silently serving an empty page.
        MvcResult listing = mockMvc.perform(get("/documents")
                        .param("page", "-1")
                        .param("size", "500")
                        .param("module", "Local Doc")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(200))
                .andExpect(jsonPath("$.number").value(0))
                .andReturn();
        assertThat(objectMapper.readTree(listing.getResponse().getContentAsString())
                .path("content").size()).isPositive();
    }
}
