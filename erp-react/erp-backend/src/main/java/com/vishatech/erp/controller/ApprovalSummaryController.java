package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.service.ApprovalQueueService;
import com.vishatech.erp.service.ApprovalSummaryService;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.prepost.PreAuthorize;

@RestController
@RequestMapping("/approvals")
@PreAuthorize("isAuthenticated()")
public class ApprovalSummaryController {

    private final ApprovalSummaryService approvalSummaryService;
    private final ApprovalQueueService approvalQueueService;

    public ApprovalSummaryController(ApprovalSummaryService approvalSummaryService,
                                     ApprovalQueueService approvalQueueService) {
        this.approvalSummaryService = approvalSummaryService;
        this.approvalQueueService = approvalQueueService;
    }

    /**
     * Lightweight pending-approval summary for the sidebar: per-module counts,
     * parent totals (Customer Purchase Request, Sales Execution) and the global
     * total. Backend/database is the source of truth.
     */
    @GetMapping("/summary")
    public ResponseEntity<ApiResponse<Map<String, Object>>> summary() {
        return ResponseEntity.ok(ApiResponse.ok(approvalSummaryService.summary()));
    }

    /**
     * The records behind those counts: every genuine, still-actionable pending
     * approval for the signed-in user, with the module, document reference and
     * frontend route needed by the dedicated Pending Approvals page. Read-only —
     * listing an approval never approves or rejects it, and Purchase /
     * Production queues keep their existing approval-authority gates.
     */
    @GetMapping("/pending")
    public ResponseEntity<ApiResponse<Map<String, Object>>> pending() {
        return ResponseEntity.ok(ApiResponse.ok(approvalQueueService.pending()));
    }
}
