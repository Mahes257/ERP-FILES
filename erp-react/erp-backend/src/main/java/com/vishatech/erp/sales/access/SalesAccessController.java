package com.vishatech.erp.sales.access;

import com.fasterxml.jackson.databind.JsonNode;
import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.sales.access.SalesAccessService.CurrentUserView;
import com.vishatech.erp.sales.access.SalesAccessService.ScopeView;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Sales Access Management API.
 *
 * <pre>
 *   GET    /sales/access/me                    → the caller's effective permissions
 *   GET    /sales/access/options               → roles, users, catalog, defaults   (ADMIN)
 *   GET    /sales/access/scope/{type}/{key}    → one scope's configuration         (ADMIN)
 *   PUT    /sales/access/scope/{type}/{key}    → save one scope's permissions      (ADMIN)
 *   DELETE /sales/access/scope/{type}/{key}    → reset one scope to its defaults   (ADMIN)
 * </pre>
 *
 * Only an administrator — the project's ADMIN role, not a hardcoded account — may
 * read or change another scope, exactly as in Marketing Access Management. Every
 * write is validated against the area catalog and audited; a user can never
 * modify their own permissions because the whole management surface is
 * ADMIN-only.
 */
@RestController
@RequestMapping("/sales/access")
@PreAuthorize("isAuthenticated()")
public class SalesAccessController {

    private final SalesAccessService accessService;

    public SalesAccessController(SalesAccessService accessService) {
        this.accessService = accessService;
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<CurrentUserView>> me() {
        return ResponseEntity.ok(ApiResponse.ok(accessService.currentUser()));
    }

    @GetMapping("/options")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> options() {
        return ResponseEntity.ok(ApiResponse.ok(accessService.options()));
    }

    @GetMapping("/scope/{scopeType}/{scopeKey}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<ScopeView>> scope(@PathVariable String scopeType,
                                                        @PathVariable String scopeKey) {
        return ResponseEntity.ok(ApiResponse.ok(accessService.scope(scopeType, scopeKey)));
    }

    @PutMapping("/scope/{scopeType}/{scopeKey}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<ScopeView>> save(@PathVariable String scopeType,
                                                       @PathVariable String scopeKey,
                                                       @RequestBody(required = false) JsonNode body) {
        JsonNode permissions = body != null && body.has("permissions")
                ? body.get("permissions")
                : body;
        return ResponseEntity.ok(ApiResponse.ok(accessService.save(scopeType, scopeKey, permissions)));
    }

    @DeleteMapping("/scope/{scopeType}/{scopeKey}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<ScopeView>> reset(@PathVariable String scopeType,
                                                        @PathVariable String scopeKey) {
        return ResponseEntity.ok(ApiResponse.ok(accessService.reset(scopeType, scopeKey)));
    }
}
