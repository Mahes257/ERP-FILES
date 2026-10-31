package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.EditHistoryGroupResponse;
import com.vishatech.erp.service.EditHistoryService;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.prepost.PreAuthorize;

@RestController
@RequestMapping("/history")
@PreAuthorize("hasAuthority('DOCUMENT_VIEW')")
public class EditHistoryController {

    private final EditHistoryService editHistoryService;

    public EditHistoryController(EditHistoryService editHistoryService) {
        this.editHistoryService = editHistoryService;
    }

    /** Returns the full edit history for a record, grouped by version, newest first. */
    @GetMapping("/{moduleType}/{recordId}")
    public ResponseEntity<ApiResponse<List<EditHistoryGroupResponse>>> getHistory(
            @PathVariable String moduleType, @PathVariable Long recordId) {
        List<EditHistoryGroupResponse> history = editHistoryService.getHistory(moduleType, recordId);
        return ResponseEntity.ok(ApiResponse.ok(history));
    }

    /** Returns the number of times a record has been edited. */
    @GetMapping("/{moduleType}/{recordId}/count")
    public ResponseEntity<ApiResponse<Map<String, Long>>> getEditCount(
            @PathVariable String moduleType, @PathVariable Long recordId) {
        long count = editHistoryService.getEditCount(moduleType, recordId);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("count", count)));
    }
}