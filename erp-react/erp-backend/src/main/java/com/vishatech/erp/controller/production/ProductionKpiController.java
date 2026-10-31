package com.vishatech.erp.controller.production;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.production.PagedResponse;
import com.vishatech.erp.service.production.ProductionKpiService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;

import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * Production KPI endpoints — the data behind the Production KPI screens.
 *
 * The KPI screens used to download whole production tables (orders, quality,
 * packing, dispatch and up to four 500-row shop-floor lists) and then filter,
 * count and page them in the browser. Both endpoints here answer the same
 * questions in the database:
 *
 *   GET /production-kpi/{module}/kpi/{kpiKey}  one bounded page of the rows
 *                                              behind a KPI (search + status
 *                                              filter + page/size applied in
 *                                              SQL, with totalElements)
 *   GET /production-kpi/{module}/counts        every KPI counter for a module
 *
 * `module` is one of orders | dashboard | quality | packing | dispatch |
 * casting | fabrication | assembly | machineShop; `kpiKey` is the card/tab key
 * on that screen (draft, prodApproval, approved, pending, inTransit, …).
 */
@RestController
@RequestMapping("/production-kpi")
@PreAuthorize("hasAuthority('PRODUCTION_VIEW')")
public class ProductionKpiController {

    private final ProductionKpiService service;

    public ProductionKpiController(ProductionKpiService service) {
        this.service = service;
    }

    /** One page of the records behind one KPI card. */
    @GetMapping("/{module}/kpi/{kpiKey}")
    public ResponseEntity<ApiResponse<PagedResponse<Map<String, Object>>>> kpiPage(
            @PathVariable String module,
            @PathVariable String kpiKey,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size) {
        return ResponseEntity.ok(ApiResponse.ok(
                service.kpiPage(module, kpiKey, search, status, page, size)));
    }

    /** Database counters for the module's KPI cards / tabs. */
    @GetMapping("/{module}/counts")
    public ResponseEntity<ApiResponse<Map<String, Object>>> counts(@PathVariable String module) {
        return ResponseEntity.ok(ApiResponse.ok(service.counts(module)));
    }
}
