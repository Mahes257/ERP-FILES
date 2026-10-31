package com.vishatech.erp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.controller.CreditNoteController;
import com.vishatech.erp.controller.DeliveryChallanController;
import com.vishatech.erp.controller.InvoiceController;
import com.vishatech.erp.controller.PaymentReceiptController;
import com.vishatech.erp.controller.ProformaInvoiceController;
import com.vishatech.erp.controller.QuotationController;
import com.vishatech.erp.controller.SalesContractController;
import com.vishatech.erp.controller.SalesOrderController;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;

/**
 * Locks the authority contract of the eight Sales document controllers' bulk
 * endpoints.
 *
 * <p><b>The defect this guards against.</b> The Sales document chain gates
 * <em>deleting</em> a record with {@code SALES_DELETE} on the single-record
 * endpoint ({@code DELETE /{id}}), but the bulk endpoints used to be annotated
 * with {@code SALES_CREATE}. A {@code USER} holds {@code SALES_CREATE} and does
 * not hold {@code SALES_DELETE} (see {@code RolePermissions}), so the bulk route
 * was a wider grant than the single-record route: one request to
 * {@code /bulk-permanent-delete} hard-deleted records that the same user could
 * not delete one at a time — bypassing the authority the UI already relied on
 * ({@code SalesExecApiTest} pins the single-record 403 for exactly this reason).
 *
 * <p><b>Why a reflective contract test rather than eight HTTP assertions.</b>
 * The invariant is "these endpoint names always carry this authority", and it has
 * to hold for eight controllers and sixteen endpoints that a future controller
 * can silently be added to. Reading the annotations back off the real handler
 * methods makes the check cover every endpoint that exists <em>and</em> fail if
 * one is ever added with the wrong authority. The expected set is compared with
 * what reflection actually found, so a renamed mapping or a controller that
 * stopped being scanned fails the test instead of making it vacuous.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class SalesDocumentAuthorityContractTests extends AbstractSecurityTest {

    /** The eight Sales document controllers that expose the bulk endpoint family. */
    private static final List<Class<?>> SALES_DOCUMENT_CONTROLLERS = List.of(
            SalesOrderController.class,
            QuotationController.class,
            SalesContractController.class,
            InvoiceController.class,
            DeliveryChallanController.class,
            ProformaInvoiceController.class,
            CreditNoteController.class,
            PaymentReceiptController.class);

    /** Endpoint suffixes that DESTROY data, and therefore require SALES_DELETE. */
    private static final List<String> DESTRUCTIVE_BULK_PATHS =
            List.of("/bulk-delete", "/bulk-permanent-delete");

    /** Endpoint suffixes that only move a record between states. */
    private static final List<String> NON_DESTRUCTIVE_BULK_PATHS =
            List.of("/bulk-archive", "/bulk-restore");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private CustomUserDetailsService userDetailsService;

    /**
     * Every bulk endpoint that removes data — {@code /bulk-delete} and
     * {@code /bulk-permanent-delete} — requires {@code SALES_DELETE}, the same
     * authority its single-record {@code DELETE /{id}} counterpart requires.
     */
    @Test
    void destructiveBulkEndpointsRequireSalesDelete() {
        Map<String, String> found = new LinkedHashMap<>();

        for (Class<?> controller : SALES_DOCUMENT_CONTROLLERS) {
            for (Method method : controller.getDeclaredMethods()) {
                String path = mappedPath(method);
                if (path == null || !DESTRUCTIVE_BULK_PATHS.contains(path)) {
                    continue;
                }
                found.put(controller.getSimpleName() + " " + path, authorityOf(controller, method));
            }
        }

        // Non-vacuity: eight controllers × two endpoints. A controller that
        // stopped being scanned, or a renamed mapping, shrinks this set and fails
        // here rather than passing quietly.
        assertThat(found)
                .as("every Sales document controller exposes both destructive bulk endpoints")
                .hasSize(SALES_DOCUMENT_CONTROLLERS.size() * DESTRUCTIVE_BULK_PATHS.size());

        assertThat(found)
                .as("destructive bulk endpoints must not be reachable with SALES_CREATE alone")
                .allSatisfy((endpoint, authority) -> assertThat(authority)
                        .as("%s must require SALES_DELETE", endpoint)
                        .isEqualTo("hasAuthority('SALES_DELETE')"));
    }

    /**
     * …and the single-record delete endpoint of the same controllers keeps the
     * authority the bulk endpoints now match, so the two can never drift apart
     * again in either direction.
     */
    @Test
    void singleRecordDeleteKeepsTheSameAuthority() {
        List<String> found = new ArrayList<>();

        for (Class<?> controller : SALES_DOCUMENT_CONTROLLERS) {
            boolean hasSingleRecordDelete = false;
            for (Method method : controller.getDeclaredMethods()) {
                if (method.getAnnotation(DeleteMapping.class) == null) {
                    continue;
                }
                hasSingleRecordDelete = true;
                assertThat(authorityOf(controller, method))
                        .as("%s.%s must require SALES_DELETE",
                                controller.getSimpleName(), method.getName())
                        .isEqualTo("hasAuthority('SALES_DELETE')");
            }
            if (hasSingleRecordDelete) {
                found.add(controller.getSimpleName());
            }
        }

        assertThat(found).hasSize(SALES_DOCUMENT_CONTROLLERS.size());
    }

    /**
     * The non-destructive bulk endpoints are deliberately left on
     * {@code SALES_CREATE} — archiving and restoring are state changes, not
     * deletions — and that choice is pinned here so a future change to them is a
     * visible decision rather than an accident.
     */
    @Test
    void stateChangeBulkEndpointsStayOnSalesCreate() {
        Map<String, String> found = new LinkedHashMap<>();

        for (Class<?> controller : SALES_DOCUMENT_CONTROLLERS) {
            for (Method method : controller.getDeclaredMethods()) {
                String path = mappedPath(method);
                if (path == null || !NON_DESTRUCTIVE_BULK_PATHS.contains(path)) {
                    continue;
                }
                found.put(controller.getSimpleName() + " " + path, authorityOf(controller, method));
            }
        }

        assertThat(found).hasSize(SALES_DOCUMENT_CONTROLLERS.size() * NON_DESTRUCTIVE_BULK_PATHS.size());
        assertThat(found).allSatisfy((endpoint, authority) -> assertThat(authority)
                .as("%s is a state change and stays on SALES_CREATE", endpoint)
                .isEqualTo("hasAuthority('SALES_CREATE')"));
    }

    /**
     * End-to-end proof that the reflective assertion describes the running
     * application: a plain {@code USER} (who holds {@code SALES_CREATE} but not
     * {@code SALES_DELETE}) is refused by both destructive bulk endpoints, while
     * an ADMIN reaches the handler and is rejected only by request validation.
     */
    @Test
    void aPlainUserIsRefusedByBothDestructiveBulkEndpoints() throws Exception {
        // Both tokens are minted from the seeded users rather than by registering
        // new ones. Registration is per-IP rate limited and the limiter's state is
        // per application context, which several security test classes share — so a
        // registration here would spend a budget those classes also draw on and
        // make their outcome depend on this suite's ordering. The seeded USER
        // ("kavya") is also the exact role this guard is about.
        String userToken = jwtService.generateToken(
                userDetailsService.loadUserByUsername("kavya@vishaktech.com"));
        String adminToken = jwtService.generateToken(
                userDetailsService.loadUserByUsername("admin@vishaktech.com"));

        String body = objectMapper.writeValueAsString(Map.of("ids", List.of(1L)));

        for (String path : DESTRUCTIVE_BULK_PATHS) {
            // A plain USER holds SALES_CREATE, so before the fix these returned
            // 200/404 rather than 403 — the whole point of the guard.
            mockMvc.perform(post("/sales-orders" + path)
                            .header("Authorization", "Bearer " + userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isForbidden());

            // The same request from an ADMIN passes authorization, so the 403
            // above is the authority check and not a routing or payload artefact.
            mockMvc.perform(post("/sales-orders" + path)
                            .header("Authorization", "Bearer " + adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isNotFound());
        }

        // An empty selection is a validation failure (`@NotEmpty` on the ids) and
        // is reported as a 400 to a caller who cleared the authority check: Spring
        // MVC runs the body's `@Valid` before the method-security interceptor, so
        // the malformed request never reaches it. An unauthorised caller is refused
        // one step earlier — the Sales Access Management gate is a servlet
        // HandlerInterceptor and runs before argument resolution — so that caller
        // gets 403 rather than 400. Neither refusal touches any data, and the 403
        // assertions above are about a WELL-FORMED destructive request, which is
        // the case that matters.
        String emptyBody = objectMapper.writeValueAsString(Map.of("ids", List.of()));
        mockMvc.perform(post("/sales-orders/bulk-delete")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(emptyBody))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/sales-orders/bulk-delete")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(emptyBody))
                .andExpect(status().isForbidden());
    }

    // ── reflection helpers ───────────────────────────────────────────────

    /** The single mapping path of a handler, or {@code null} if it is not a handler. */
    private static String mappedPath(Method method) {
        PostMapping post = method.getAnnotation(PostMapping.class);
        if (post != null && post.value().length == 1) {
            return post.value()[0];
        }
        PatchMapping patch = method.getAnnotation(PatchMapping.class);
        if (patch != null && patch.value().length == 1) {
            return patch.value()[0];
        }
        DeleteMapping delete = method.getAnnotation(DeleteMapping.class);
        if (delete != null && delete.value().length == 1) {
            return delete.value()[0];
        }
        return null;
    }

    /**
     * The authority a handler is guarded by: its own {@code @PreAuthorize} when it
     * has one, otherwise the controller-level expression it inherits.
     */
    private static String authorityOf(Class<?> controller, Method method) {
        PreAuthorize own = method.getAnnotation(PreAuthorize.class);
        if (own != null) {
            return own.value();
        }
        PreAuthorize classLevel = controller.getAnnotation(PreAuthorize.class);
        assertThat(classLevel)
                .as("%s.%s has neither a method- nor a class-level @PreAuthorize",
                        controller.getSimpleName(), method.getName())
                .isNotNull();
        return classLevel.value();
    }

}
