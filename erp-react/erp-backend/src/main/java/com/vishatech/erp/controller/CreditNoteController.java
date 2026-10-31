package com.vishatech.erp.controller;
import com.vishatech.erp.dto.ConversionResult;

import com.vishatech.erp.dto.ApiResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import com.vishatech.erp.dto.BulkRequest;
import com.vishatech.erp.dto.CreditNoteNextNumberResponse;
import com.vishatech.erp.dto.CreditNoteRequest;
import com.vishatech.erp.dto.CreditNoteResponse;
import com.vishatech.erp.dto.SalesAttachmentResponse;
import com.vishatech.erp.dto.SalesHistoryResponse;
import com.vishatech.erp.dto.SalesTimelineResponse;
import com.vishatech.erp.dto.StatusRequest;
import com.vishatech.erp.service.CreditNoteService;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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
@RequestMapping("/credit-notes")
// Same shape as the other Sales Execution controllers: class-level SALES_VIEW for
// the reads, and the narrowest existing Sales authority on every mutation (this
// controller used to rely on authentication alone, so any signed-in user could
// create, edit, delete or export credit notes).
@PreAuthorize("hasAuthority('SALES_VIEW')")
public class CreditNoteController {

    private final CreditNoteService creditNoteService;

    public CreditNoteController(CreditNoteService creditNoteService) {
        this.creditNoteService = creditNoteService;
    }

    @GetMapping
    public Page<CreditNoteResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String client,
            @RequestParam(required = false) String reason,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) BigDecimal minAmount,
            @RequestParam(required = false) BigDecimal maxAmount) {
        return creditNoteService.list(page, size, search, sort, status, client, reason,
                dateFrom, dateTo, minAmount, maxAmount);
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<CreditNoteResponse>> create(@Valid @RequestBody CreditNoteRequest request,
                                                                  @RequestParam(defaultValue = "false") boolean draft) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(creditNoteService.create(request, draft)));
    }

    @GetMapping("/next-number")
    public ResponseEntity<ApiResponse<CreditNoteNextNumberResponse>> nextNumber() {
        return ResponseEntity.ok(ApiResponse.ok(creditNoteService.getNextNumber()));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats() {
        return ResponseEntity.ok(ApiResponse.ok(creditNoteService.stats()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<CreditNoteResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(creditNoteService.get(id)));
    }

    @PreAuthorize("hasAuthority('SALES_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<CreditNoteResponse>> update(@PathVariable Long id,
                                                                  @Valid @RequestBody CreditNoteRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(creditNoteService.update(id, request)));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        creditNoteService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Credit note moved to trash"));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-payment-receipt")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToPaymentReceipt(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(creditNoteService.convertToPaymentReceipt(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PatchMapping("/archive/{id}")
    public ResponseEntity<ApiResponse<CreditNoteResponse>> archive(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(creditNoteService.archive(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PatchMapping("/restore/{id}")
    public ResponseEntity<ApiResponse<CreditNoteResponse>> restore(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(creditNoteService.restore(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/status")
    public ResponseEntity<ApiResponse<CreditNoteResponse>> changeStatus(@PathVariable Long id,
                                                                        @RequestBody StatusRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(creditNoteService.changeStatus(id, request.status())));
    }

    @PreAuthorize("hasAuthority('SALES_APPROVE')")
    @PostMapping("/{id}/approve")
    public ResponseEntity<ApiResponse<CreditNoteResponse>> approve(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(creditNoteService.approve(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/issue")
    public ResponseEntity<ApiResponse<CreditNoteResponse>> issue(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(creditNoteService.issue(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/duplicate")
    public ResponseEntity<ApiResponse<CreditNoteResponse>> duplicate(@PathVariable Long id) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(creditNoteService.duplicate(id)));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @PostMapping("/bulk-delete")
    public ResponseEntity<ApiResponse<Void>> bulkDelete(@Valid @RequestBody BulkRequest request) {
        int count = creditNoteService.bulkDelete(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Deleted " + count + " credit note(s)"));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @PostMapping("/bulk-permanent-delete")
    public ResponseEntity<ApiResponse<Void>> bulkPermanentDelete(@Valid @RequestBody BulkRequest request) {
        int count = creditNoteService.bulkPermanentDelete(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Permanently deleted " + count + " credit note(s)"));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/bulk-archive")
    public ResponseEntity<ApiResponse<Void>> bulkArchive(@Valid @RequestBody BulkRequest request) {
        int count = creditNoteService.bulkArchive(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Archived " + count + " credit note(s)"));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/bulk-restore")
    public ResponseEntity<ApiResponse<Void>> bulkRestore(@Valid @RequestBody BulkRequest request) {
        int count = creditNoteService.bulkRestore(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Restored " + count + " credit note(s)"));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/export")
    public ResponseEntity<?> export(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String client,
            @RequestParam(required = false) String reason,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) BigDecimal minAmount,
            @RequestParam(required = false) BigDecimal maxAmount) {
        List<CreditNoteResponse> cns = creditNoteService.export(search, status, client, reason,
                dateFrom, dateTo, minAmount, maxAmount);
        byte[] bytes = creditNoteService.buildCsv(cns).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"credit-notes.csv\"")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(bytes);
    }

    @GetMapping("/{id}/timeline")
    public ResponseEntity<List<SalesTimelineResponse>> timeline(@PathVariable Long id) {
        return ResponseEntity.ok(creditNoteService.getTimeline(id));
    }

    @GetMapping("/{id}/history")
    public ResponseEntity<List<SalesHistoryResponse>> history(@PathVariable Long id) {
        return ResponseEntity.ok(creditNoteService.getHistory(id));
    }

    @GetMapping("/{id}/attachments")
    public ResponseEntity<List<SalesAttachmentResponse>> attachments(@PathVariable Long id) {
        return ResponseEntity.ok(creditNoteService.getAttachments(id));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/attachments")
    public ResponseEntity<ApiResponse<SalesAttachmentResponse>> addAttachment(@PathVariable Long id,
                                                                              @RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(creditNoteService.addAttachment(id, file)));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @DeleteMapping("/{id}/attachments/{attachmentId}")
    public ResponseEntity<ApiResponse<Void>> deleteAttachment(@PathVariable Long id,
                                                              @PathVariable Long attachmentId) {
        creditNoteService.deleteAttachment(id, attachmentId);
        return ResponseEntity.ok(ApiResponse.ok("Attachment deleted"));
    }
}
