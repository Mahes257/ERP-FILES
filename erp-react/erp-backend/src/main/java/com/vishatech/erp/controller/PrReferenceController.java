package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.PrReferenceRequest;
import com.vishatech.erp.dto.PrReferenceResponse;
import com.vishatech.erp.service.PrReferenceService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Reference PR No catalog.
 *
 * Backs the Quotation form's "Reference PR No" dropdown, which now serves BOTH
 * origins of a PR number: the ones carried by real CPR rows and the ones created
 * directly from a Quotation ("+ Add New Reference PR No.").
 */
@RestController
@RequestMapping("/pr-references")
// Catalog reads (the Quotation form's Reference PR No dropdown) follow the same
// class-level SALES_VIEW rule as every other Sales Execution controller; the two
// endpoints that register a PR number carry their own SALES_CREATE guard.
@PreAuthorize("hasAuthority('SALES_VIEW')")
public class PrReferenceController {

    private final PrReferenceService prReferenceService;

    public PrReferenceController(PrReferenceService prReferenceService) {
        this.prReferenceService = prReferenceService;
    }

    /**
     * Merged autocomplete (CPR-carried + directly registered), capped at 20.
     * An absent/blank filter yields an empty selection — the query is a filter,
     * so a missing one must not surface as a server error.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<List<PrReferenceResponse>>> search(
            @RequestParam(required = false) String q) {
        return ResponseEntity.ok(ApiResponse.ok(prReferenceService.search(q)));
    }

    /**
     * Exact lookup, so the form can classify a typed value as CPR / Direct / new.
     * No value resolves to no match (same shape as {@code /by-reference-pr}).
     */
    @GetMapping("/lookup")
    public ResponseEntity<ApiResponse<PrReferenceResponse>> lookup(
            @RequestParam(required = false) String referencePrNo) {
        return ResponseEntity.ok(ApiResponse.ok(prReferenceService.find(referencePrNo).orElse(null)));
    }

    /** Register a PR No directly — no CPR is created. */
    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<PrReferenceResponse>> create(
            @Valid @RequestBody PrReferenceRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(prReferenceService.create(request)));
    }

    /**
     * Convenience path used by the form's type-and-continue flow: registers the
     * PR No when it is new, returns the existing one when it already exists
     * (never duplicates, never fails for an existing PR No).
     */
    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/resolve")
    public ResponseEntity<ApiResponse<PrReferenceResponse>> resolve(
            @Valid @RequestBody PrReferenceRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(prReferenceService.resolveResponse(
                request.referencePrNo(), request.clientId(), request.clientName())));
    }

    /** The PR No is part of the URL for a direct open from other screens. */
    @GetMapping("/by-reference-pr/{referencePrNo}")
    public ResponseEntity<ApiResponse<PrReferenceResponse>> byReferencePrNo(
            @PathVariable String referencePrNo) {
        return ResponseEntity.ok(ApiResponse.ok(
                prReferenceService.find(referencePrNo).orElse(null)));
    }
}
