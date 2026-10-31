package com.vishatech.erp.controller;
import com.vishatech.erp.dto.ConversionResult;

import com.vishatech.erp.dto.ApiResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import com.vishatech.erp.dto.BulkRequest;
import com.vishatech.erp.dto.SalesAttachmentResponse;
import com.vishatech.erp.dto.ProcessingJobResponse;
import com.vishatech.erp.dto.SalesContractNextNumberResponse;
import com.vishatech.erp.dto.SalesContractRequest;
import com.vishatech.erp.dto.SalesContractResponse;
import com.vishatech.erp.dto.SalesHistoryResponse;
import com.vishatech.erp.dto.SalesTimelineResponse;
import com.vishatech.erp.dto.StatusRequest;
import com.vishatech.erp.entity.ProcessingJob;
import com.vishatech.erp.service.SalesContractBulkExtractionService;
import com.vishatech.erp.service.SalesContractService;
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
@RequestMapping("/sales-contracts")
@PreAuthorize("hasAuthority('SALES_VIEW')")
public class SalesContractController {

    private final SalesContractService salesContractService;
    private final SalesContractBulkExtractionService bulkExtractionService;

    public SalesContractController(SalesContractService salesContractService,
                                   SalesContractBulkExtractionService bulkExtractionService) {
        this.salesContractService = salesContractService;
        this.bulkExtractionService = bulkExtractionService;
    }

    @GetMapping
    public Page<SalesContractResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String client,
            @RequestParam(required = false) String salesExecutive,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) BigDecimal minAmount,
            @RequestParam(required = false) BigDecimal maxAmount) {
        return salesContractService.list(page, size, search, sort, status, client, salesExecutive,
                dateFrom, dateTo, minAmount, maxAmount);
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<SalesContractResponse>> create(@Valid @RequestBody SalesContractRequest request,
                                                                     @RequestParam(defaultValue = "false") boolean draft) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(salesContractService.create(request, draft)));
    }

    @GetMapping("/next-number")
    public ResponseEntity<ApiResponse<SalesContractNextNumberResponse>> nextNumber() {
        return ResponseEntity.ok(ApiResponse.ok(salesContractService.getNextNumber()));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats() {
        return ResponseEntity.ok(ApiResponse.ok(salesContractService.stats()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<SalesContractResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(salesContractService.get(id)));
    }

    @PreAuthorize("hasAuthority('SALES_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<SalesContractResponse>> update(@PathVariable Long id,
                                                                     @Valid @RequestBody SalesContractRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(salesContractService.update(id, request)));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        salesContractService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Sales contract moved to trash"));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PatchMapping("/archive/{id}")
    public ResponseEntity<ApiResponse<SalesContractResponse>> archive(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(salesContractService.archive(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PatchMapping("/restore/{id}")
    public ResponseEntity<ApiResponse<SalesContractResponse>> restore(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(salesContractService.restore(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/status")
    public ResponseEntity<ApiResponse<SalesContractResponse>> changeStatus(@PathVariable Long id,
                                                                           @RequestBody StatusRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(salesContractService.changeStatus(id, request.status())));
    }

    @PreAuthorize("hasAuthority('SALES_APPROVE')")
    @PostMapping("/{id}/approve")
    public ResponseEntity<ApiResponse<SalesContractResponse>> approve(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(salesContractService.approve(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-sales-order")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToSalesOrder(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(salesContractService.convertToSalesOrder(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-proforma")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToProforma(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(salesContractService.convertToProforma(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-delivery-challan")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToDeliveryChallan(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(salesContractService.convertToDeliveryChallan(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-invoice")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToInvoice(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(salesContractService.convertToInvoice(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-credit-note")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToCreditNote(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(salesContractService.convertToCreditNote(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-payment-receipt")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToPaymentReceipt(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(salesContractService.convertToPaymentReceipt(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/duplicate")
    public ResponseEntity<ApiResponse<SalesContractResponse>> duplicate(@PathVariable Long id) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(salesContractService.duplicate(id)));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @PostMapping("/bulk-delete")
    public ResponseEntity<ApiResponse<Void>> bulkDelete(@Valid @RequestBody BulkRequest request) {
        int count = salesContractService.bulkDelete(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Deleted " + count + " sales contract(s)"));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @PostMapping("/bulk-permanent-delete")
    public ResponseEntity<ApiResponse<Void>> bulkPermanentDelete(@Valid @RequestBody BulkRequest request) {
        int count = salesContractService.bulkPermanentDelete(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Permanently deleted " + count + " sales contract(s)"));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/bulk-archive")
    public ResponseEntity<ApiResponse<Void>> bulkArchive(@Valid @RequestBody BulkRequest request) {
        int count = salesContractService.bulkArchive(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Archived " + count + " sales contract(s)"));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/bulk-restore")
    public ResponseEntity<ApiResponse<Void>> bulkRestore(@Valid @RequestBody BulkRequest request) {
        int count = salesContractService.bulkRestore(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Restored " + count + " sales contract(s)"));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/export")
    public ResponseEntity<?> export(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String client,
            @RequestParam(required = false) String salesExecutive,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) BigDecimal minAmount,
            @RequestParam(required = false) BigDecimal maxAmount) {
        List<SalesContractResponse> contracts = salesContractService.export(search, status, client, salesExecutive,
                dateFrom, dateTo, minAmount, maxAmount);
        byte[] bytes = salesContractService.buildCsv(contracts).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"sales-contracts.csv\"")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(bytes);
    }

    @GetMapping("/{id}/timeline")
    public ResponseEntity<List<SalesTimelineResponse>> timeline(@PathVariable Long id) {
        return ResponseEntity.ok(salesContractService.getTimeline(id));
    }

    @GetMapping("/{id}/history")
    public ResponseEntity<List<SalesHistoryResponse>> history(@PathVariable Long id) {
        return ResponseEntity.ok(salesContractService.getHistory(id));
    }

    @GetMapping("/{id}/attachments")
    public ResponseEntity<List<SalesAttachmentResponse>> attachments(@PathVariable Long id) {
        return ResponseEntity.ok(salesContractService.getAttachments(id));
    }

    /**
     * Attach one document to a Sales Contract.
     *
     * <p>{@code category} is OPTIONAL and names the attachment's own kind — the
     * Upload Documents panel sends {@code E-Sign} for a digitally signed
     * contract document and {@code Scanned Copy} for a scan of the signed or
     * physical contract. An upload without it is stored unlabelled, exactly as
     * before, so existing callers (and every other sales module sharing this
     * attachment store) are unaffected.
     */
    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/attachments")
    public ResponseEntity<ApiResponse<SalesAttachmentResponse>> addAttachment(@PathVariable Long id,
                                                                              @RequestParam("file") MultipartFile file,
                                                                              @RequestParam(value = "category", required = false) String category) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(salesContractService.addAttachment(id, file, category)));
    }

    /**
     * Bulk Upload — Sales Contract extraction (asynchronous).
     *
     * Accepts one or more existing contract documents (PDF, DOC, DOCX, XLS,
     * XLSX, CSV, TXT, JPG, JPEG, PNG) and extracts ONLY customer name, contract
     * number, contract date and validity from each one. Documents are treated as
     * untrusted input: parsed with passive readers, never executed.
     *
     * <p>Parsing is real work — PDFBox/POI over a whole batch, which used to hold
     * an HTTP worker for the duration. The request now validates the batch, has it
     * staged, creates a durable job and returns {@code 202 Accepted} with the job
     * id; the parsing happens on the bounded processing-job pool. Poll
     * {@code GET /sales-contracts/bulk/extract/{jobId}} for the status and, once
     * it reports COMPLETED, the same results this endpoint used to return.
     *
     * <p>Extraction is still review-only: the frontend shows the result, the user
     * confirms/corrects it, and only then the existing Sales Contract create API
     * is called. Staged documents are deleted as soon as the job ends.
     */
    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/bulk/extract")
    public ResponseEntity<ApiResponse<ProcessingJobResponse>> bulkExtract(
            @RequestParam(value = "files", required = false) MultipartFile[] files) throws Exception {
        ProcessingJob job = bulkExtractionService.submit(files);
        return ResponseEntity.accepted()
                .body(ApiResponse.ok("Extraction started.", ProcessingJobResponse.of(job, null)));
    }

    /**
     * Poll the status of a submitted bulk extraction.
     *
     * QUEUED / PROCESSING while the worker runs, COMPLETED with the extracted
     * results, FAILED with a safe reason. Unknown jobs — and jobs belonging to
     * another user — are reported as 404 so job ids cannot be walked.
     */
    @GetMapping("/bulk/extract/{jobId}")
    public ResponseEntity<ApiResponse<ProcessingJobResponse>> bulkExtractStatus(@PathVariable Long jobId) {
        return ResponseEntity.ok(ApiResponse.ok(bulkExtractionService.status(jobId)));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @DeleteMapping("/{id}/attachments/{attachmentId}")
    public ResponseEntity<ApiResponse<Void>> deleteAttachment(@PathVariable Long id,
                                                              @PathVariable Long attachmentId) {
        salesContractService.deleteAttachment(id, attachmentId);
        return ResponseEntity.ok(ApiResponse.ok("Attachment deleted"));
    }
}
