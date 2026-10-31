package com.vishatech.erp.controller.production;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.production.AcknowledgementDTO;
import com.vishatech.erp.service.production.AcknowledgementService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * REST controller for Acknowledgement records.
 */
@RestController
@RequestMapping("/acknowledgements")
@PreAuthorize("hasAuthority('PRODUCTION_VIEW')")
public class AcknowledgementController {

    private final AcknowledgementService acknowledgementService;

    public AcknowledgementController(AcknowledgementService acknowledgementService) {
        this.acknowledgementService = acknowledgementService;
    }

    /**
     * POST /api/acknowledgements
     * Save (create or update) an acknowledgement record.
     */
    @PostMapping
    public ResponseEntity<ApiResponse<AcknowledgementDTO>> saveAcknowledgement(
            @RequestBody AcknowledgementDTO request) {
        AcknowledgementDTO result = acknowledgementService.saveAcknowledgement(request);
        return ResponseEntity.ok(ApiResponse.ok("Acknowledgement saved.", result));
    }

    /**
     * GET /api/acknowledgements/work-order/{workOrderId}
     * Get acknowledgement for a specific Work Order.
     */
    @GetMapping("/work-order/{workOrderId}")
    public ResponseEntity<ApiResponse<AcknowledgementDTO>> getAcknowledgement(
            @PathVariable String workOrderId) {
        AcknowledgementDTO result = acknowledgementService.getAcknowledgement(workOrderId);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    /**
     * DELETE /api/acknowledgements/work-order/{workOrderId}
     * Delete acknowledgement for a specific Work Order.
     */
    @DeleteMapping("/work-order/{workOrderId}")
    public ResponseEntity<ApiResponse<Void>> deleteAcknowledgementsForOrder(
            @PathVariable String workOrderId) {
        acknowledgementService.deleteAcknowledgementsForOrder(workOrderId);
        return ResponseEntity.ok(ApiResponse.ok("Acknowledgements deleted.", null));
    }
}
