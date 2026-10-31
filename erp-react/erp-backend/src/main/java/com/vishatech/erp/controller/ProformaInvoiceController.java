package com.vishatech.erp.controller;
import com.vishatech.erp.dto.ConversionResult;
import org.springframework.security.access.prepost.PreAuthorize;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.BulkRequest;
import com.vishatech.erp.dto.DeliveryChallanRequest;
import com.vishatech.erp.dto.DeliveryChallanResponse;
import com.vishatech.erp.dto.ProformaInvoiceNextNumberResponse;
import com.vishatech.erp.dto.ProformaInvoiceRequest;
import com.vishatech.erp.dto.ProformaInvoiceResponse;
import com.vishatech.erp.dto.SalesAttachmentResponse;
import com.vishatech.erp.dto.SalesHistoryResponse;
import com.vishatech.erp.dto.SalesTimelineResponse;
import com.vishatech.erp.dto.StatusRequest;
import com.vishatech.erp.service.ProformaInvoiceService;
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
@RequestMapping("/proforma-invoices")
@PreAuthorize("hasAuthority('SALES_VIEW')")
public class ProformaInvoiceController {

    private final ProformaInvoiceService proformaInvoiceService;

    public ProformaInvoiceController(ProformaInvoiceService proformaInvoiceService) {
        this.proformaInvoiceService = proformaInvoiceService;
    }

    @GetMapping
    public Page<ProformaInvoiceResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String client,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) BigDecimal minAmount,
            @RequestParam(required = false) BigDecimal maxAmount) {
        return proformaInvoiceService.list(page, size, search, sort, status, client,
                dateFrom, dateTo, minAmount, maxAmount);
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<ProformaInvoiceResponse>> create(@Valid @RequestBody ProformaInvoiceRequest request,
                                                                       @RequestParam(defaultValue = "false") boolean draft) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(proformaInvoiceService.create(request, draft)));
    }

    @GetMapping("/next-number")
    public ResponseEntity<ApiResponse<ProformaInvoiceNextNumberResponse>> nextNumber() {
        return ResponseEntity.ok(ApiResponse.ok(proformaInvoiceService.getNextNumber()));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats() {
        return ResponseEntity.ok(ApiResponse.ok(proformaInvoiceService.stats()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ProformaInvoiceResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(proformaInvoiceService.get(id)));
    }

    @PreAuthorize("hasAuthority('SALES_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<ProformaInvoiceResponse>> update(@PathVariable Long id,
                                                                       @Valid @RequestBody ProformaInvoiceRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(proformaInvoiceService.update(id, request)));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        proformaInvoiceService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Proforma invoice moved to trash"));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PatchMapping("/archive/{id}")
    public ResponseEntity<ApiResponse<ProformaInvoiceResponse>> archive(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(proformaInvoiceService.archive(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PatchMapping("/restore/{id}")
    public ResponseEntity<ApiResponse<ProformaInvoiceResponse>> restore(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(proformaInvoiceService.restore(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/status")
    public ResponseEntity<ApiResponse<ProformaInvoiceResponse>> changeStatus(@PathVariable Long id,
                                                                             @RequestBody StatusRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(proformaInvoiceService.changeStatus(id, request.status())));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/send")
    public ResponseEntity<ApiResponse<ProformaInvoiceResponse>> send(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(proformaInvoiceService.send(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-invoice")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToInvoice(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(proformaInvoiceService.convertToInvoice(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-sales-order")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToSalesOrder(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(proformaInvoiceService.convertToSalesOrder(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/generate-delivery-challan")
    public ResponseEntity<ApiResponse<ConversionResult>> generateDeliveryChallan(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(proformaInvoiceService.generateDeliveryChallan(id)));
    }

    /**
     * Actions-menu conversion that goes through the Delivery Challan FORM: the
     * reviewed (and possibly edited) challan is submitted here, persisted through
     * the existing Delivery Challan service, and the source Proforma Invoice is
     * marked converted — all in one transaction. The one-click
     * {@code generate-delivery-challan} endpoint above stays untouched for the
     * API-driven path.
     */
    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/delivery-challans")
    public ResponseEntity<ApiResponse<DeliveryChallanResponse>> createDeliveryChallan(
            @PathVariable Long id,
            @RequestBody DeliveryChallanRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(proformaInvoiceService.createDeliveryChallan(id, request)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-credit-note")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToCreditNote(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(proformaInvoiceService.convertToCreditNote(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-payment-receipt")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToPaymentReceipt(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(proformaInvoiceService.convertToPaymentReceipt(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/duplicate")
    public ResponseEntity<ApiResponse<ProformaInvoiceResponse>> duplicate(@PathVariable Long id) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(proformaInvoiceService.duplicate(id)));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @PostMapping("/bulk-delete")
    public ResponseEntity<ApiResponse<Void>> bulkDelete(@Valid @RequestBody BulkRequest request) {
        int count = proformaInvoiceService.bulkDelete(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Deleted " + count + " proforma invoice(s)"));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @PostMapping("/bulk-permanent-delete")
    public ResponseEntity<ApiResponse<Void>> bulkPermanentDelete(@Valid @RequestBody BulkRequest request) {
        int count = proformaInvoiceService.bulkPermanentDelete(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Permanently deleted " + count + " proforma invoice(s)"));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/bulk-archive")
    public ResponseEntity<ApiResponse<Void>> bulkArchive(@Valid @RequestBody BulkRequest request) {
        int count = proformaInvoiceService.bulkArchive(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Archived " + count + " proforma invoice(s)"));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/bulk-restore")
    public ResponseEntity<ApiResponse<Void>> bulkRestore(@Valid @RequestBody BulkRequest request) {
        int count = proformaInvoiceService.bulkRestore(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Restored " + count + " proforma invoice(s)"));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/export")
    public ResponseEntity<?> export(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String client,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) BigDecimal minAmount,
            @RequestParam(required = false) BigDecimal maxAmount) {
        List<ProformaInvoiceResponse> pis = proformaInvoiceService.export(search, status, client,
                dateFrom, dateTo, minAmount, maxAmount);
        byte[] bytes = proformaInvoiceService.buildCsv(pis).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"proforma-invoices.csv\"")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(bytes);
    }

    @GetMapping("/{id}/timeline")
    public ResponseEntity<List<SalesTimelineResponse>> timeline(@PathVariable Long id) {
        return ResponseEntity.ok(proformaInvoiceService.getTimeline(id));
    }

    @GetMapping("/{id}/history")
    public ResponseEntity<List<SalesHistoryResponse>> history(@PathVariable Long id) {
        return ResponseEntity.ok(proformaInvoiceService.getHistory(id));
    }

    @GetMapping("/{id}/attachments")
    public ResponseEntity<List<SalesAttachmentResponse>> attachments(@PathVariable Long id) {
        return ResponseEntity.ok(proformaInvoiceService.getAttachments(id));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/attachments")
    public ResponseEntity<ApiResponse<SalesAttachmentResponse>> addAttachment(@PathVariable Long id,
                                                                              @RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(proformaInvoiceService.addAttachment(id, file)));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @DeleteMapping("/{id}/attachments/{attachmentId}")
    public ResponseEntity<ApiResponse<Void>> deleteAttachment(@PathVariable Long id,
                                                              @PathVariable Long attachmentId) {
        proformaInvoiceService.deleteAttachment(id, attachmentId);
        return ResponseEntity.ok(ApiResponse.ok("Attachment deleted"));
    }
}
