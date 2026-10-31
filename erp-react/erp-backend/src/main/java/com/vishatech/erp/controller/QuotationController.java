package com.vishatech.erp.controller;
import com.vishatech.erp.dto.ConversionResult;
import com.vishatech.erp.dto.ConversionReferenceRequest;
import org.springframework.security.access.prepost.PreAuthorize;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.BulkRequest;
import com.vishatech.erp.dto.QuotationNextNumberResponse;
import com.vishatech.erp.dto.QuotationRemarkRequest;
import com.vishatech.erp.dto.QuotationRemarkResponse;
import com.vishatech.erp.dto.QuotationRequest;
import com.vishatech.erp.dto.QuotationResponse;
import com.vishatech.erp.dto.SalesAttachmentResponse;
import com.vishatech.erp.dto.SalesHistoryResponse;
import com.vishatech.erp.dto.SalesTimelineResponse;
import com.vishatech.erp.dto.StatusRequest;
import com.vishatech.erp.service.QuotationService;
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
import org.springframework.security.access.prepost.PreAuthorize;

@RestController
@RequestMapping("/quotations")
@PreAuthorize("hasAuthority('SALES_VIEW')")
public class QuotationController {

    private final QuotationService quotationService;

    public QuotationController(QuotationService quotationService) {
        this.quotationService = quotationService;
    }

    @GetMapping
    public Page<QuotationResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String client,
            @RequestParam(required = false) String salesPerson,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String validTill,
            @RequestParam(required = false) BigDecimal minAmount,
            @RequestParam(required = false) BigDecimal maxAmount) {
        return quotationService.list(page, size, search, sort, status, client, salesPerson,
                dateFrom, dateTo, validTill, minAmount, maxAmount);
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<QuotationResponse>> create(@Valid @RequestBody QuotationRequest request,
                                                                 @RequestParam(defaultValue = "false") boolean draft) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(quotationService.create(request, draft)));
    }

    @GetMapping("/next-number")
    public ResponseEntity<ApiResponse<QuotationNextNumberResponse>> nextNumber() {
        return ResponseEntity.ok(ApiResponse.ok(quotationService.getNextNumber()));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats() {
        return ResponseEntity.ok(ApiResponse.ok(quotationService.stats()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<QuotationResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(quotationService.get(id)));
    }

    @PreAuthorize("hasAuthority('SALES_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<QuotationResponse>> update(@PathVariable Long id,
                                                                 @Valid @RequestBody QuotationRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(quotationService.update(id, request)));
    }

    // ===== Quotation Overview → Remarks (real MySQL persistence) =====

    @GetMapping("/{id}/remarks")
    public ResponseEntity<ApiResponse<List<QuotationRemarkResponse>>> listRemarks(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(quotationService.listRemarks(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/remarks")
    public ResponseEntity<ApiResponse<QuotationRemarkResponse>> addRemark(
            @PathVariable Long id,
            @Valid @RequestBody QuotationRemarkRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(quotationService.addRemark(id, request)));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @DeleteMapping("/{id}/remarks/{remarkId}")
    public ResponseEntity<ApiResponse<Void>> deleteRemark(@PathVariable Long id,
                                                          @PathVariable Long remarkId) {
        quotationService.deleteRemark(id, remarkId);
        return ResponseEntity.ok(ApiResponse.ok("Remark deleted"));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        quotationService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Quotation moved to trash"));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PatchMapping("/archive/{id}")
    public ResponseEntity<ApiResponse<QuotationResponse>> archive(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(quotationService.archive(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PatchMapping("/restore/{id}")
    public ResponseEntity<ApiResponse<QuotationResponse>> restore(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(quotationService.restore(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/status")
    public ResponseEntity<ApiResponse<QuotationResponse>> changeStatus(@PathVariable Long id,
                                                                       @RequestBody StatusRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(quotationService.changeStatus(id, request.status(), request.remarks())));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/send")
    public ResponseEntity<ApiResponse<QuotationResponse>> send(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(quotationService.send(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-sales-order")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToSalesOrder(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(quotationService.convertToSalesOrder(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-proforma")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToProforma(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(quotationService.convertToProforma(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-invoice")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToInvoice(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(quotationService.convertToInvoice(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-credit-note")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToCreditNote(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(quotationService.convertToCreditNote(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-payment-receipt")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToPaymentReceipt(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(quotationService.convertToPaymentReceipt(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-sales-contract")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToSalesContract(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(quotationService.convertToSalesContract(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-delivery-challan")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToDeliveryChallan(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(quotationService.convertToDeliveryChallan(id)));
    }

    /**
     * Links a downstream document that was created outside the conversion
     * endpoints (the stand-alone Convert Quotation page creates its own Sales
     * Contract) back to this quotation. Records the conversion reference,
     * timeline and audit entry — never the quotation's lifecycle status.
     */
    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/conversion-reference")
    public ResponseEntity<ApiResponse<QuotationResponse>> recordConversion(
            @PathVariable Long id,
            @Valid @RequestBody ConversionReferenceRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(
                quotationService.recordConversion(id, request.target(), request.number())));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/duplicate")
    public ResponseEntity<ApiResponse<QuotationResponse>> duplicate(@PathVariable Long id) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(quotationService.duplicate(id)));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @PostMapping("/bulk-delete")
    public ResponseEntity<ApiResponse<Void>> bulkDelete(@Valid @RequestBody BulkRequest request) {
        int count = quotationService.bulkDelete(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Deleted " + count + " quotation(s)"));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @PostMapping("/bulk-permanent-delete")
    public ResponseEntity<ApiResponse<Void>> bulkPermanentDelete(@Valid @RequestBody BulkRequest request) {
        int count = quotationService.bulkPermanentDelete(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Permanently deleted " + count + " quotation(s)"));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/bulk-archive")
    public ResponseEntity<ApiResponse<Void>> bulkArchive(@Valid @RequestBody BulkRequest request) {
        int count = quotationService.bulkArchive(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Archived " + count + " quotation(s)"));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/bulk-restore")
    public ResponseEntity<ApiResponse<Void>> bulkRestore(@Valid @RequestBody BulkRequest request) {
        int count = quotationService.bulkRestore(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Restored " + count + " quotation(s)"));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/export")
    public ResponseEntity<?> export(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String client,
            @RequestParam(required = false) String salesPerson,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String validTill,
            @RequestParam(required = false) BigDecimal minAmount,
            @RequestParam(required = false) BigDecimal maxAmount) {
        List<QuotationResponse> quotations = quotationService.export(search, status, client, salesPerson,
                dateFrom, dateTo, validTill, minAmount, maxAmount);
        byte[] bytes = quotationService.buildCsv(quotations).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"quotations.csv\"")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(bytes);
    }

    @GetMapping("/{id}/timeline")
    public ResponseEntity<List<SalesTimelineResponse>> timeline(@PathVariable Long id) {
        return ResponseEntity.ok(quotationService.getTimeline(id));
    }

    @GetMapping("/{id}/history")
    public ResponseEntity<List<SalesHistoryResponse>> history(@PathVariable Long id) {
        return ResponseEntity.ok(quotationService.getHistory(id));
    }

    @GetMapping("/{id}/attachments")
    public ResponseEntity<List<SalesAttachmentResponse>> attachments(@PathVariable Long id) {
        return ResponseEntity.ok(quotationService.getAttachments(id));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/attachments")
    public ResponseEntity<ApiResponse<SalesAttachmentResponse>> addAttachment(@PathVariable Long id,
                                                                              @RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(quotationService.addAttachment(id, file)));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @DeleteMapping("/{id}/attachments/{attachmentId}")
    public ResponseEntity<ApiResponse<Void>> deleteAttachment(@PathVariable Long id,
                                                              @PathVariable Long attachmentId) {
        quotationService.deleteAttachment(id, attachmentId);
        return ResponseEntity.ok(ApiResponse.ok("Attachment deleted"));
    }
}
