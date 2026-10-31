package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.TechnicalVerificationDocumentResponse;
import com.vishatech.erp.dto.TechnicalVerificationConversionResponse;
import com.vishatech.erp.dto.TechnicalVerificationRequest;
import com.vishatech.erp.dto.TechnicalVerificationResponse;
import com.vishatech.erp.dto.CprActionDtos;
import com.vishatech.erp.service.CprTechnicalVerificationService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/cpr-technical-verifications")
@PreAuthorize("hasAuthority('CPR_VIEW')")
public class CprTechnicalVerificationController {

    private final CprTechnicalVerificationService tvService;

    public CprTechnicalVerificationController(CprTechnicalVerificationService tvService) {
        this.tvService = tvService;
    }

    @GetMapping
    public Page<TechnicalVerificationResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String division,
            @RequestParam(required = false) String sort) {
        return tvService.list(page, size, search, status, division, sort);
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats(
            @RequestParam(required = false) String division) {
        return ResponseEntity.ok(ApiResponse.ok(tvService.stats(division)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<TechnicalVerificationResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(tvService.get(id)));
    }

    @GetMapping("/by-cpr/{cprId}")
    public ResponseEntity<ApiResponse<TechnicalVerificationResponse>> getByCprId(@PathVariable Long cprId) {
        return ResponseEntity.ok(ApiResponse.ok(tvService.getByCprId(cprId)));
    }

    /**
     * GET /cpr-technical-verifications/by-cpr/{cprId}/items
     * Returns one item-level Technical Verification record for EVERY item of the
     * given CPR, auto-creating any missing rows (carrying forward each CPR item
     * into Technical Verification). Used when opening Technical Verification for
     * a CPR so all items appear without a manual dropdown selection.
     */
    @GetMapping("/by-cpr/{cprId}/items")
    public ResponseEntity<ApiResponse<List<TechnicalVerificationResponse>>> listItemsByCpr(
            @PathVariable Long cprId,
            @RequestParam(required = false) String division) {
        return ResponseEntity.ok(ApiResponse.ok(tvService.listItemsByCpr(cprId, division)));
    }

    @PreAuthorize("hasAuthority('CPR_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<TechnicalVerificationResponse>> create(
            @Valid @RequestBody TechnicalVerificationRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(tvService.create(request)));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<TechnicalVerificationResponse>> update(
            @PathVariable Long id,
            @Valid @RequestBody TechnicalVerificationRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(tvService.update(id, request)));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PatchMapping("/{id}/status")
    public ResponseEntity<ApiResponse<TechnicalVerificationResponse>> updateStatus(
            @PathVariable Long id,
            @RequestBody CprActionDtos.StatusUpdate body) {
        return ResponseEntity.ok(ApiResponse.ok(
                tvService.updateStatus(id, body.status(), body.remarks())));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PatchMapping("/{id}/division")
    public ResponseEntity<ApiResponse<TechnicalVerificationResponse>> updateDivision(
            @PathVariable Long id,
            @RequestBody CprActionDtos.DivisionUpdate body) {
        return ResponseEntity.ok(ApiResponse.ok(tvService.updateDivision(id, body.division())));
    }

    @PreAuthorize("hasAuthority('CPR_CREATE')")
    @PostMapping("/{id}/forward-to-cost-workout")
    public ResponseEntity<ApiResponse<TechnicalVerificationResponse>> forwardToCostWorkout(
            @PathVariable Long id,
            @RequestBody CprActionDtos.CostWorkoutLink body) {
        return ResponseEntity.ok(ApiResponse.ok(
                tvService.forwardToCostWorkout(id, body.costWorkoutId())));
    }

    /**
     * Convert the ONE CPR item behind this verification row into a new Cost Workout.
     *
     * The body carries nothing: the service reads the real CPR item and CPR header
     * itself, so a frontend cannot assemble (or corrupt) the destination payload.
     */
    @PreAuthorize("hasAuthority('CPR_CREATE')")
    @PostMapping("/{id}/convert-to-cost-workout")
    public ResponseEntity<ApiResponse<TechnicalVerificationConversionResponse>> convertToCostWorkout(
            @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(tvService.convertItemToCostWorkout(id)));
    }

    /** Convert the ONE CPR item behind this verification row into a new Purchase Requisition. */
    @PreAuthorize("hasAuthority('CPR_CREATE')")
    @PostMapping("/{id}/convert-to-purchase-requisition")
    public ResponseEntity<ApiResponse<TechnicalVerificationConversionResponse>> convertToPurchaseRequisition(
            @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(tvService.convertItemToPurchaseRequisition(id)));
    }

    @PreAuthorize("hasAuthority('CPR_DELETE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        tvService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Technical Verification deleted"));
    }

    // ============================== Documents ==============================

    @GetMapping("/{id}/documents")
    public ResponseEntity<List<TechnicalVerificationDocumentResponse>> getDocuments(
            @PathVariable Long id,
            @RequestParam(required = false) String forRole) {
        return ResponseEntity.ok(tvService.getDocuments(id, forRole));
    }

    @PreAuthorize("hasAuthority('CPR_CREATE')")
    @PostMapping("/{id}/documents")
    public ResponseEntity<ApiResponse<TechnicalVerificationDocumentResponse>> addDocument(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "visibility", defaultValue = "TEAM_ONLY") String visibility) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(tvService.addDocument(id, file, visibility)));
    }

    @PreAuthorize("hasAuthority('CPR_CREATE')")
    @PostMapping("/{id}/documents/{documentId}/send-to-cost-workout")
    public ResponseEntity<ApiResponse<TechnicalVerificationDocumentResponse>> sendToCostWorkout(
            @PathVariable Long id,
            @PathVariable Long documentId,
            @RequestBody CprActionDtos.CostWorkoutLink body) {
        return ResponseEntity.ok(ApiResponse.ok(
                tvService.sendToCostWorkout(id, documentId, body.costWorkoutId())));
    }

    @PreAuthorize("hasAuthority('CPR_EDIT')")
    @PatchMapping("/{id}/documents/{documentId}/visibility")
    public ResponseEntity<ApiResponse<Void>> updateDocumentVisibility(
            @PathVariable Long id,
            @PathVariable Long documentId,
            @RequestBody CprActionDtos.Visibility body) {
        tvService.updateDocumentVisibility(id, documentId, body.visibility());
        return ResponseEntity.ok(ApiResponse.ok("Visibility updated"));
    }

    @PreAuthorize("hasAuthority('CPR_DELETE')")
    @DeleteMapping("/{id}/documents/{documentId}")
    public ResponseEntity<ApiResponse<Void>> deleteDocument(
            @PathVariable Long id,
            @PathVariable Long documentId) {
        tvService.deleteDocument(id, documentId);
        return ResponseEntity.ok(ApiResponse.ok("Document deleted"));
    }

    // ============================== File Existence Check ==============================

    @GetMapping("/check-file")
    public ResponseEntity<ApiResponse<Map<String, Object>>> checkFileExists(
            @RequestParam Long cprId,
            @RequestParam String drawingNumber) {
        return ResponseEntity.ok(ApiResponse.ok(tvService.checkFileExists(cprId, drawingNumber)));
    }

    @GetMapping("/cpr-items/{cprId}")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getCprItems(
            @PathVariable Long cprId) {
        return ResponseEntity.ok(ApiResponse.ok(tvService.getCprItems(cprId)));
    }
}
