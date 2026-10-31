package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.ConversionResult;
import org.springframework.security.access.prepost.PreAuthorize;
import com.vishatech.erp.dto.CprActionDtos;
import com.vishatech.erp.dto.ProfitWorkoutAttachment;
import com.vishatech.erp.dto.ProfitWorkoutItemResponse;
import com.vishatech.erp.dto.ProfitWorkoutNextNumberResponse;
import com.vishatech.erp.dto.ProfitWorkoutRequest;
import com.vishatech.erp.dto.ProfitWorkoutResponse;
import com.vishatech.erp.dto.ProfitWorkoutTimelineResponse;
import com.vishatech.erp.service.ProfitWorkoutService;
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
 * Profit Workout HTTP surface: thin routing + authorization only; every rule
 * (cost/revenue references, margin and total calculations, workflow,
 * numbering) lives in {@link ProfitWorkoutService}, matching the Purchase /
 * Production controllers.
 *
 * Class-level CPR_VIEW covers reads; mutations carry the narrowest CPR
 * authority for their operation.
 */
@RestController
@RequestMapping("/profit-workouts")
@PreAuthorize("hasAuthority('CPR_VIEW')")
public class ProfitWorkoutController {

    private final ProfitWorkoutService profitWorkoutService;

    public ProfitWorkoutController(ProfitWorkoutService profitWorkoutService) {
        this.profitWorkoutService = profitWorkoutService;
    }

    @GetMapping
    public Page<ProfitWorkoutResponse> list(
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
        return profitWorkoutService.list(page, size, search, sort, status, cprRef, customer,
                company, preparedBy, dateFrom, dateTo);
    }

    @PreAuthorize("hasAuthority('CPR_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<ProfitWorkoutResponse>> create(@Valid @RequestBody ProfitWorkoutRequest request,
                                                                   @RequestParam(defaultValue = "false") boolean draft) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(profitWorkoutService.create(request, draft)));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats() {
        return ResponseEntity.ok(ApiResponse.ok(profitWorkoutService.stats()));
    }

    @GetMapping("/dashboard")
    public ResponseEntity<ApiResponse<Map<String, Object>>> dashboard() {
        return ResponseEntity.ok(ApiResponse.ok(profitWorkoutService.stats()));
    }

    @GetMapping("/next-number")
    public ResponseEntity<ApiResponse<ProfitWorkoutNextNumberResponse>> nextNumber() {
        return ResponseEntity.ok(ApiResponse.ok(profitWorkoutService.getNextNumber()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ProfitWorkoutResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(profitWorkoutService.get(id)));
    }

    @GetMapping("/{id}/items")
    public ResponseEntity<List<ProfitWorkoutItemResponse>> items(@PathVariable Long id) {
        return ResponseEntity.ok(profitWorkoutService.getItems(id));
    }

    @GetMapping("/{id}/timeline")
    public ResponseEntity<List<ProfitWorkoutTimelineResponse>> timeline(@PathVariable Long id) {
        return ResponseEntity.ok(profitWorkoutService.getTimeline(id));
    }

    @GetMapping("/{id}/attachments")
    public ResponseEntity<List<ProfitWorkoutAttachment>> attachments(@PathVariable Long id) {
        return ResponseEntity.ok(profitWorkoutService.getAttachments(id));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<ProfitWorkoutResponse>> update(@PathVariable Long id,
                                                                   @Valid @RequestBody ProfitWorkoutRequest request,
                                                                   @RequestParam(defaultValue = "false") boolean draft) {
        // draft=true → autosave / Save-Draft: in-place persistence, NO revision.
        return ResponseEntity.ok(ApiResponse.ok(profitWorkoutService.update(id, request, draft)));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        profitWorkoutService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Profit Workout moved to trash"));
    }

    @PreAuthorize("hasAuthority('CPR_DELETE')")
    @DeleteMapping("/{id}/permanent")
    public ResponseEntity<ApiResponse<Void>> permanentDelete(@PathVariable Long id) {
        profitWorkoutService.permanentDelete(id);
        return ResponseEntity.ok(ApiResponse.ok("Profit Workout permanently deleted"));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PostMapping("/{id}/restore")
    public ResponseEntity<ApiResponse<ProfitWorkoutResponse>> restore(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(profitWorkoutService.restore(id)));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PostMapping("/{id}/archive")
    public ResponseEntity<ApiResponse<ProfitWorkoutResponse>> archive(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(profitWorkoutService.archive(id)));
    }

    @PreAuthorize("hasAuthority('CPR_CREATE')")
    @PostMapping("/{id}/convert-to-quotation")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToQuotation(@PathVariable Long id) {
        return ResponseEntity.ok(new ApiResponse<>(true, "Profit Workout converted to quotation",
                profitWorkoutService.convertToQuotation(id)));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PostMapping("/{id}/submit")
    public ResponseEntity<ApiResponse<ProfitWorkoutResponse>> submit(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(profitWorkoutService.submit(id)));
    }

    @PreAuthorize("hasAuthority('CPR_APPROVE')")
    @PostMapping("/{id}/approve")
    public ResponseEntity<ApiResponse<ProfitWorkoutResponse>> approve(@PathVariable Long id,
                                                                     @RequestBody(required = false) CprActionDtos.Remarks body) {
        String remarks = body == null ? null : body.remarks();
        return ResponseEntity.ok(ApiResponse.ok(profitWorkoutService.approve(id, remarks)));
    }

    @PreAuthorize("hasAuthority('CPR_APPROVE')")
    @PostMapping("/{id}/reject")
    public ResponseEntity<ApiResponse<ProfitWorkoutResponse>> reject(@PathVariable Long id,
                                                                   @RequestBody(required = false) CprActionDtos.Remarks body) {
        String remarks = body == null ? null : body.remarks();
        return ResponseEntity.ok(ApiResponse.ok(profitWorkoutService.reject(id, remarks)));
    }

    @PreAuthorize("hasAuthority('CPR_CREATE')")
    @PostMapping("/{id}/duplicate")
    public ResponseEntity<ApiResponse<ProfitWorkoutResponse>> duplicate(@PathVariable Long id) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(profitWorkoutService.duplicate(id)));
    }

    @GetMapping("/custom-categories")
    public ResponseEntity<ApiResponse<List<String>>> customCategories() {
        return ResponseEntity.ok(ApiResponse.ok(profitWorkoutService.getCustomCategories()));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PostMapping("/custom-categories")
    public ResponseEntity<ApiResponse<Void>> saveCustomCategories(@RequestBody CprActionDtos.CustomCategories body) {
        profitWorkoutService.saveCustomCategories(body == null ? List.of() : body.categories());
        return ResponseEntity.ok(ApiResponse.ok("Custom categories saved"));
    }

    @GetMapping("/custom-units")
    public ResponseEntity<ApiResponse<List<String>>> customUnits() {
        return ResponseEntity.ok(ApiResponse.ok(profitWorkoutService.getCustomUnits()));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PostMapping("/custom-units")
    public ResponseEntity<ApiResponse<Void>> saveCustomUnits(@RequestBody CprActionDtos.CustomUnits body) {
        profitWorkoutService.saveCustomUnits(body == null ? List.of() : body.units());
        return ResponseEntity.ok(ApiResponse.ok("Custom units saved"));
    }
}
