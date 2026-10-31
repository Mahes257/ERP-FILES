package com.vishatech.erp.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.service.GridConfigService;
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
 * Grid column configuration store — the shared persistence backend for the
 * ERP's editable / manageable / resizable grids.
 *
 * Every Sales & Marketing grid configuration (column order, labels, types,
 * visibility, widths and custom column definitions) is stored as a JSON
 * document keyed by a grid key (e.g. "sales.items.invoice") in the dedicated
 * grid_configs MySQL table — the same architecture the CPR item grid already
 * uses per document (Cpr.itemColumnsJson). Values are JSON, so adding a custom
 * column never triggers a dynamic ALTER TABLE. localStorage is never the source
 * of truth.
 *
 *   GET    /settings/grid-configs/{key} → stored JSON config (null when unset)
 *   PUT    /settings/grid-configs/{key} → save JSON config (authenticated user)
 *   DELETE /settings/grid-configs/{key} → reset to defaults (remove stored row)
 *
 * The configuration is keyed by grid (not by user), so every user of a module
 * sees the same managed columns — matching how the module's other shared
 * settings behave.
 *
 * Thin HTTP layer: persistence and validation live in
 * {@link GridConfigService}; failures flow through the shared
 * GlobalExceptionHandler. Authorization is authentication-only, matching how
 * the modules' grids are shared rather than ADMIN-gated.
 */
@RestController
@RequestMapping("/settings/grid-configs")
@PreAuthorize("isAuthenticated()")
public class GridConfigController {

    private final GridConfigService gridConfigService;

    public GridConfigController(GridConfigService gridConfigService) {
        this.gridConfigService = gridConfigService;
    }

    @GetMapping("/{key:.+}")
    public ResponseEntity<ApiResponse<JsonNode>> get(@PathVariable String key) {
        return ResponseEntity.ok(ApiResponse.ok(gridConfigService.read(key)));
    }

    @PutMapping("/{key:.+}")
    public ResponseEntity<ApiResponse<JsonNode>> put(@PathVariable String key,
                                                     @RequestBody JsonNode config) {
        return ResponseEntity.ok(ApiResponse.ok(gridConfigService.write(key, config)));
    }

    @DeleteMapping("/{key:.+}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable String key) {
        gridConfigService.reset(key);
        return ResponseEntity.ok(ApiResponse.ok("reset"));
    }
}
