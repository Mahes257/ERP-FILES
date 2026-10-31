package com.vishatech.erp.controller;
import com.vishatech.erp.dto.ConversionResult;

import com.vishatech.erp.dto.ApiResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import com.vishatech.erp.dto.CostWorkoutAttachment;
import com.vishatech.erp.dto.CostWorkoutItemResponse;
import com.vishatech.erp.dto.CostWorkoutNextNumberResponse;
import com.vishatech.erp.dto.CostWorkoutRequest;
import com.vishatech.erp.dto.CostWorkoutResponse;
import com.vishatech.erp.dto.CostWorkoutTimelineResponse;
import com.vishatech.erp.dto.CprActionDtos;
import com.vishatech.erp.service.CostWorkoutService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Cost Workout HTTP surface: thin routing + authorization only; every rule
 * (cost aggregation, totals, workflow, numbering) lives in
 * {@link CostWorkoutService}, matching the Purchase / Production controllers.
 *
 * Class-level CPR_VIEW covers reads; mutations carry the narrowest CPR
 * authority for their operation.
 */
@RestController
@RequestMapping("/cost-workouts")
@PreAuthorize("hasAuthority('CPR_VIEW')")
public class CostWorkoutController {

    private final CostWorkoutService costWorkoutService;

    public CostWorkoutController(CostWorkoutService costWorkoutService) {
        this.costWorkoutService = costWorkoutService;
    }

    @GetMapping
    public Page<CostWorkoutResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String cprRef,
            @RequestParam(required = false) String customer,
            @RequestParam(required = false) String company,
            @RequestParam(required = false) String preparedBy,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return costWorkoutService.list(page, size, search, sort, status, cprRef, customer,
                company, preparedBy, dateFrom, dateTo);
    }

    @PreAuthorize("hasAuthority('CPR_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<CostWorkoutResponse>> create(@Valid @RequestBody CostWorkoutRequest request,
                                                                   @RequestParam(defaultValue = "false") boolean draft) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(costWorkoutService.create(request, draft)));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats() {
        return ResponseEntity.ok(ApiResponse.ok(costWorkoutService.stats()));
    }

    @GetMapping("/dashboard")
    public ResponseEntity<ApiResponse<Map<String, Object>>> dashboard() {
        return ResponseEntity.ok(ApiResponse.ok(costWorkoutService.stats()));
    }

    @GetMapping("/next-number")
    public ResponseEntity<ApiResponse<CostWorkoutNextNumberResponse>> nextNumber() {
        return ResponseEntity.ok(ApiResponse.ok(costWorkoutService.getNextNumber()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<CostWorkoutResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(costWorkoutService.get(id)));
    }

    @GetMapping("/{id}/items")
    public ResponseEntity<List<CostWorkoutItemResponse>> items(@PathVariable Long id) {
        return ResponseEntity.ok(costWorkoutService.getItems(id));
    }

    @GetMapping("/{id}/timeline")
    public ResponseEntity<List<CostWorkoutTimelineResponse>> timeline(@PathVariable Long id) {
        return ResponseEntity.ok(costWorkoutService.getTimeline(id));
    }

    @GetMapping("/{id}/attachments")
    public ResponseEntity<List<CostWorkoutAttachment>> attachments(@PathVariable Long id) {
        return ResponseEntity.ok(costWorkoutService.getAttachments(id));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<CostWorkoutResponse>> update(@PathVariable Long id,
                                                                   @Valid @RequestBody CostWorkoutRequest request,
                                                                   @RequestParam(defaultValue = "false") boolean draft) {
        // draft=true → autosave / Save-Draft: in-place persistence, NO revision.
        return ResponseEntity.ok(ApiResponse.ok(costWorkoutService.update(id, request, draft)));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        costWorkoutService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Cost Workout moved to trash"));
    }

    @PreAuthorize("hasAuthority('CPR_DELETE')")
    @DeleteMapping("/{id}/permanent")
    public ResponseEntity<ApiResponse<Void>> permanentDelete(@PathVariable Long id) {
        costWorkoutService.permanentDelete(id);
        return ResponseEntity.ok(ApiResponse.ok("Cost Workout permanently deleted"));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PostMapping("/{id}/restore")
    public ResponseEntity<ApiResponse<CostWorkoutResponse>> restore(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(costWorkoutService.restore(id)));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PostMapping("/{id}/archive")
    public ResponseEntity<ApiResponse<CostWorkoutResponse>> archive(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(costWorkoutService.archive(id)));
    }

    @PreAuthorize("hasAuthority('CPR_CREATE')")
    @PostMapping("/{id}/convert-to-quotation")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToQuotation(@PathVariable Long id) {
        return ResponseEntity.ok(new ApiResponse<>(true, "Cost Workout converted to quotation",
                costWorkoutService.convertToQuotation(id)));
    }

    @PreAuthorize("hasAuthority('CPR_CREATE')")
    @PostMapping("/{id}/convert-to-profit-workout")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToProfitWorkout(@PathVariable Long id) {
        return ResponseEntity.ok(new ApiResponse<>(true, "Cost Workout converted to profit workout",
                costWorkoutService.convertToProfitWorkout(id)));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PostMapping("/{id}/submit")
    public ResponseEntity<ApiResponse<CostWorkoutResponse>> submit(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(costWorkoutService.submit(id)));
    }

    @PreAuthorize("hasAuthority('CPR_APPROVE')")
    @PostMapping("/{id}/approve")
    public ResponseEntity<ApiResponse<CostWorkoutResponse>> approve(@PathVariable Long id,
                                                                     @RequestBody(required = false) CprActionDtos.Remarks body) {
        String remarks = body == null ? null : body.remarks();
        return ResponseEntity.ok(ApiResponse.ok(costWorkoutService.approve(id, remarks)));
    }

    @PreAuthorize("hasAuthority('CPR_APPROVE')")
    @PostMapping("/{id}/reject")
    public ResponseEntity<ApiResponse<CostWorkoutResponse>> reject(@PathVariable Long id,
                                                                   @RequestBody(required = false) CprActionDtos.Remarks body) {
        String remarks = body == null ? null : body.remarks();
        return ResponseEntity.ok(ApiResponse.ok(costWorkoutService.reject(id, remarks)));
    }

    @PreAuthorize("hasAuthority('CPR_CREATE')")
    @PostMapping("/{id}/duplicate")
    public ResponseEntity<ApiResponse<CostWorkoutResponse>> duplicate(@PathVariable Long id) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(costWorkoutService.duplicate(id)));
    }

    @GetMapping("/custom-categories")
    public ResponseEntity<ApiResponse<List<String>>> customCategories() {
        return ResponseEntity.ok(ApiResponse.ok(costWorkoutService.getCustomCategories()));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PostMapping("/custom-categories")
    public ResponseEntity<ApiResponse<Void>> saveCustomCategories(@RequestBody CprActionDtos.CustomCategories body) {
        costWorkoutService.saveCustomCategories(body == null ? List.of() : body.categories());
        return ResponseEntity.ok(ApiResponse.ok("Custom categories saved"));
    }

    @GetMapping("/custom-units")
    public ResponseEntity<ApiResponse<List<String>>> customUnits() {
        return ResponseEntity.ok(ApiResponse.ok(costWorkoutService.getCustomUnits()));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PostMapping("/custom-units")
    public ResponseEntity<ApiResponse<Void>> saveCustomUnits(@RequestBody CprActionDtos.CustomUnits body) {
        costWorkoutService.saveCustomUnits(body == null ? List.of() : body.units());
        return ResponseEntity.ok(ApiResponse.ok("Custom units saved"));
    }
}
