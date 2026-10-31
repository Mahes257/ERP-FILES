package com.vishatech.erp.controller.production;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.service.production.ProductionReportService;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Production → Reports.
 *
 * <pre>
 *   GET /production/reports/production-summary      ?dateFrom &amp;dateTo &amp;department &amp;status
 *   GET /production/reports/department-efficiency   ?dateFrom &amp;dateTo &amp;department &amp;status
 *   GET /production/reports/delay-analysis          ?dateFrom &amp;dateTo &amp;department &amp;status
 *   GET /production/reports/material-consumption    ?department
 *   GET /production/reports/machine-utilization     ?department
 * </pre>
 *
 * <p>Each endpoint answers one report with its rows and its summary, calculated
 * in {@link ProductionReportService} from the persisted Production tables. The
 * screens no longer calculate report figures in the browser.
 */
@RestController
@RequestMapping("/production/reports")
@PreAuthorize("hasAuthority('PRODUCTION_VIEW')")
public class ProductionReportController {

    private final ProductionReportService service;

    public ProductionReportController(ProductionReportService service) {
        this.service = service;
    }

    @GetMapping("/production-summary")
    public ResponseEntity<ApiResponse<Map<String, Object>>> productionSummary(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String status) {
        return ResponseEntity.ok(ApiResponse.ok(
                service.productionSummary(filters(dateFrom, dateTo, department, status))));
    }

    @GetMapping("/department-efficiency")
    public ResponseEntity<ApiResponse<Map<String, Object>>> departmentEfficiency(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String status) {
        return ResponseEntity.ok(ApiResponse.ok(
                service.departmentEfficiency(filters(dateFrom, dateTo, department, status))));
    }

    @GetMapping("/delay-analysis")
    public ResponseEntity<ApiResponse<Map<String, Object>>> delayAnalysis(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String status) {
        return ResponseEntity.ok(ApiResponse.ok(
                service.delayAnalysis(filters(dateFrom, dateTo, department, status))));
    }

    @GetMapping("/material-consumption")
    public ResponseEntity<ApiResponse<Map<String, Object>>> materialConsumption(
            @RequestParam(required = false) String department) {
        return ResponseEntity.ok(ApiResponse.ok(
                service.materialConsumption(filters(null, null, department, null))));
    }

    @GetMapping("/machine-utilization")
    public ResponseEntity<ApiResponse<Map<String, Object>>> machineUtilization(
            @RequestParam(required = false) String department) {
        return ResponseEntity.ok(ApiResponse.ok(service.machineUtilization(department)));
    }

    private static ProductionReportService.Filters filters(
            String dateFrom, String dateTo, String department, String status) {
        return ProductionReportService.Filters.of(dateFrom, dateTo, department, status);
    }
}
