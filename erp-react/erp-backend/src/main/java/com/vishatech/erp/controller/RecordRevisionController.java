package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.RecordRevisionResponse;
import com.vishatech.erp.service.RecordRevisionService;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * Exposes the full-state revision snapshots recorded for CRM records
 * (Customer / Lead / Follow-up) on every edit.  The master row keeps its id;
 * each edit appends an immutable snapshot to the record_revisions table.
 */
@RestController
@RequestMapping("/record-revisions")
@PreAuthorize("hasAuthority('DOCUMENT_VIEW')")
public class RecordRevisionController {

    private final RecordRevisionService recordRevisionService;

    public RecordRevisionController(RecordRevisionService recordRevisionService) {
        this.recordRevisionService = recordRevisionService;
    }

    /** Returns every saved version of a record, oldest first. */
    @GetMapping("/{moduleType}/{recordId}")
    public ResponseEntity<ApiResponse<List<RecordRevisionResponse>>> getRevisions(
            @PathVariable String moduleType, @PathVariable Long recordId) {
        return ResponseEntity.ok(ApiResponse.ok(recordRevisionService.list(moduleType, recordId)));
    }
}
