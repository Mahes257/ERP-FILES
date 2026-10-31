package com.vishatech.erp.controller.production;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.production.CreateProductionEntryRequest;
import com.vishatech.erp.dto.production.ProductionEntryDTO;
import com.vishatech.erp.service.production.ProductionEntryService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST controller for Production Stage Entries.
 */
@RestController
@RequestMapping("/production-entries")
@PreAuthorize("hasAuthority('PRODUCTION_VIEW')")
public class ProductionEntryController {

    private final ProductionEntryService entryService;

    public ProductionEntryController(ProductionEntryService entryService) {
        this.entryService = entryService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<ProductionEntryDTO>>> getAllEntries() {
        List<ProductionEntryDTO> entries = entryService.getAllEntries();
        return ResponseEntity.ok(ApiResponse.ok(entries));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> saveEntry(
            @Valid @RequestBody CreateProductionEntryRequest request) {
        ProductionEntryDTO entry = entryService.saveEntry(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(
            ApiResponse.ok("Production entry saved.", entry)
        );
    }

    @GetMapping("/order/{workOrderId}")
    public ResponseEntity<ApiResponse<List<ProductionEntryDTO>>> getEntriesForOrder(
            @PathVariable String workOrderId) {
        List<ProductionEntryDTO> entries = entryService.getEntriesForOrder(workOrderId);
        return ResponseEntity.ok(ApiResponse.ok(entries));
    }

    @GetMapping("/order/{workOrderId}/item/{itemId}")
    public ResponseEntity<ApiResponse<List<ProductionEntryDTO>>> getEntriesForItem(
            @PathVariable String workOrderId, @PathVariable String itemId) {
        List<ProductionEntryDTO> entries = entryService.getEntriesForItem(workOrderId, itemId);
        return ResponseEntity.ok(ApiResponse.ok(entries));
    }

    @GetMapping("/order/{workOrderId}/stage/{stage}")
    public ResponseEntity<ApiResponse<ProductionEntryDTO>> getEntry(
            @PathVariable String workOrderId, @PathVariable String stage,
            @RequestParam(required = false) String itemId) {
        ProductionEntryDTO entry = entryService.getEntry(workOrderId, stage, itemId);
        return ResponseEntity.ok(ApiResponse.ok(entry));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_DELETE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteEntry(@PathVariable Long id) {
        entryService.deleteEntry(id);
        return ResponseEntity.ok(ApiResponse.ok("Entry deleted.", null));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_DELETE')")
    @DeleteMapping("/order/{workOrderId}")
    public ResponseEntity<ApiResponse<Void>> deleteEntriesForOrder(@PathVariable String workOrderId) {
        entryService.deleteEntriesForOrder(workOrderId);
        return ResponseEntity.ok(ApiResponse.ok("All entries deleted for order.", null));
    }
}
