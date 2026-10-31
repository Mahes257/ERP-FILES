package com.vishatech.erp.controller.production;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.entity.production.QualityInspection;
import com.vishatech.erp.service.production.QualityInspectionService;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;

@RestController
@RequestMapping("/quality-inspections")
@PreAuthorize("hasAuthority('PRODUCTION_VIEW')")
public class QualityInspectionController {

    private final QualityInspectionService service;

    public QualityInspectionController(QualityInspectionService service) {
        this.service = service;
    }

    // ============================== CRUD ==============================

    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String inspectionType,
            @RequestParam(required = false) String productionOrder,
            @RequestParam(required = false) String sort) {
        Page<QualityInspection> p = service.list(page, size, search, status, department, inspectionType, productionOrder, sort);
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("content", service.toResponses(p.getContent()));
        result.put("totalElements", p.getTotalElements());
        result.put("totalPages", p.getTotalPages());
        result.put("number", p.getNumber());
        result.put("size", p.getSize());
        result.put("first", p.isFirst());
        result.put("last", p.isLast());
        result.put("empty", p.isEmpty());
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats(
            @RequestParam(required = false) String productionOrder) {
        return ResponseEntity.ok(ApiResponse.ok(service.stats(productionOrder)));
    }

    @GetMapping("/by-order/{productionOrderId}")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getByOrder(
            @PathVariable String productionOrderId) {
        List<Map<String, Object>> list = service.toResponses(service.getByProductionOrder(productionOrderId));
        return ResponseEntity.ok(ApiResponse.ok(list));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> get(@PathVariable String id) {
        return ResponseEntity.ok(ApiResponse.ok(service.toResponse(service.get(id))));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> create(@RequestBody QualityInspection input) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(service.toResponse(service.create(input))));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> update(
            @PathVariable String id, @RequestBody QualityInspection input) {
        return ResponseEntity.ok(ApiResponse.ok(service.toResponse(service.update(id, input))));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_DELETE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Inspection deleted"));
    }

    // ============================== Status Transitions ==============================

    @PatchMapping("/{id}/status")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateStatus(
            @PathVariable String id, @RequestBody Map<String, String> body) {
        String newStatus = body.get("status");
        String action = body.get("action");
        String remarks = body.get("remarks");
        return ResponseEntity.ok(ApiResponse.ok(service.toResponse(service.updateStatus(id, newStatus, action, remarks))));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/start")
    public ResponseEntity<ApiResponse<Map<String, Object>>> startInspection(@PathVariable String id) {
        return ResponseEntity.ok(ApiResponse.ok(service.toResponse(
            service.updateStatus(id, "In Progress", "Inspection Started", "Inspection started by QC."))));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/pass")
    public ResponseEntity<ApiResponse<Map<String, Object>>> markPassed(@PathVariable String id) {
        return ResponseEntity.ok(ApiResponse.ok(service.toResponse(
            service.updateStatus(id, "Passed", "Inspection Passed", "All checks passed."))));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/fail")
    public ResponseEntity<ApiResponse<Map<String, Object>>> markFailed(@PathVariable String id) {
        return ResponseEntity.ok(ApiResponse.ok(service.toResponse(
            service.updateStatus(id, "Failed", "Inspection Failed", "Checks failed — rework requested."))));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/hold")
    public ResponseEntity<ApiResponse<Map<String, Object>>> putOnHold(@PathVariable String id) {
        return ResponseEntity.ok(ApiResponse.ok(service.toResponse(
            service.updateStatus(id, "Hold", "Inspection On Hold", "Inspection placed on hold."))));
    }

    // ============================== QC Data ==============================

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PutMapping("/{id}/qc-data")
    public ResponseEntity<ApiResponse<Map<String, Object>>> saveQcData(
            @PathVariable String id, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(ApiResponse.ok(service.toResponse(
            service.saveQcData(id,
                body.get("inspectionReport"),
                body.get("dimensionalInspection"),
                body.get("materialTestCertificate"),
                body.get("finalQcInfo")))));
    }

    @PatchMapping("/{id}/checklist")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateChecklist(
            @PathVariable String id, @RequestBody Map<String, Object> body) {
        Integer index = (Integer) body.get("index");
        String result = (String) body.get("result");
        String remarks = (String) body.get("remarks");
        return ResponseEntity.ok(ApiResponse.ok(service.toResponse(
            service.updateChecklistItem(id, index != null ? index : 0, result, remarks))));
    }
}
