package com.vishatech.erp.controller;
import com.vishatech.erp.dto.ConversionResult;

import com.vishatech.erp.dto.ApiResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import com.vishatech.erp.dto.BulkRequest;
import com.vishatech.erp.dto.SalesAttachmentResponse;
import com.vishatech.erp.dto.SalesHistoryResponse;
import com.vishatech.erp.dto.SalesOrderEActionListResponse;
import com.vishatech.erp.dto.SalesOrderEActionRequest;
import com.vishatech.erp.dto.SalesOrderNextNumberResponse;
import com.vishatech.erp.dto.SalesOrderOptionResponse;
import com.vishatech.erp.dto.SalesOrderRequest;
import com.vishatech.erp.dto.SalesOrderResponse;
import com.vishatech.erp.dto.SalesTimelineResponse;
import com.vishatech.erp.dto.StatusRequest;
import com.vishatech.erp.dto.RecordRevisionResponse;
import com.vishatech.erp.dto.EditHistoryGroupResponse;
import com.vishatech.erp.service.SalesOrderService;
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
@RequestMapping("/sales-orders")
@PreAuthorize("hasAuthority('SALES_VIEW')")
public class SalesOrderController {

    private final SalesOrderService salesOrderService;

    public SalesOrderController(SalesOrderService salesOrderService) {
        this.salesOrderService = salesOrderService;
    }

    @GetMapping
    public Page<SalesOrderResponse> list(
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
        return salesOrderService.list(page, size, search, sort, status, client, salesExecutive,
                dateFrom, dateTo, minAmount, maxAmount);
    }

    /**
     * GET /sales-orders/options — lightweight CPO feed for pickers and filters
     * (id, CPO number, customer, order date, item count). Clients that only
     * need to choose a CPO read this instead of walking every page of the full
     * Sales Order records (which include items, attachments, timeline and
     * history).
     *
     * @param search optional free-text match on CPO number / customer / refs
     */
    @GetMapping("/options")
    public ResponseEntity<ApiResponse<List<SalesOrderOptionResponse>>> options(
            @RequestParam(required = false) String search) {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.listOptions(search)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping
    public ResponseEntity<ApiResponse<SalesOrderResponse>> create(@Valid @RequestBody SalesOrderRequest request,
                                                                  @RequestParam(defaultValue = "false") boolean draft) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(salesOrderService.create(request, draft)));
    }

    @GetMapping("/next-number")
    public ResponseEntity<ApiResponse<SalesOrderNextNumberResponse>> nextNumber() {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.getNextNumber()));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats() {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.stats()));
    }

    /**
     * E-Action / Participation rows across ALL Customer Purchase Orders — the
     * standalone E-Actions view inside the Customer Purchase Orders page. Reads
     * the same {@code sales_order_e_actions} rows the CPO form writes.
     */
    @GetMapping("/e-actions")
    public Page<SalesOrderEActionListResponse> listEActions(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String cpoNo,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String participantTeam,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return salesOrderService.listEActions(page, size, search, cpoNo, status, participantTeam, dateFrom, dateTo);
    }

    /** Filter options for the E-Actions view, read from the stored rows. */
    @GetMapping("/e-actions/options")
    public ResponseEntity<ApiResponse<Map<String, Object>>> eActionOptions() {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.eActionFilterOptions()));
    }

    /** Real per-status counts for the E-Actions summary cards. */
    @GetMapping("/e-actions/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> eActionStats() {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.eActionStats()));
    }

    /** One E-Action with its CPO context — the E-Action view/overview page. */
    @GetMapping("/e-actions/{actionId}")
    public ResponseEntity<ApiResponse<SalesOrderEActionListResponse>> getEAction(@PathVariable Long actionId) {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.getEAction(actionId)));
    }

    /**
     * Immutable revision snapshots of one E-Action. Served under the same
     * SALES_VIEW authority as the E-Action itself (the generic
     * /record-revisions endpoint is DOCUMENT_VIEW), and scoped by the row's own
     * id so one action can never return another's history.
     */
    @GetMapping("/e-actions/{actionId}/revisions")
    public ResponseEntity<ApiResponse<List<RecordRevisionResponse>>> getEActionRevisions(@PathVariable Long actionId) {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.eActionRevisions(actionId)));
    }

    /** Field-level edit history of one E-Action (same authority and scoping). */
    @GetMapping("/e-actions/{actionId}/history")
    public ResponseEntity<ApiResponse<List<EditHistoryGroupResponse>>> getEActionHistory(@PathVariable Long actionId) {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.eActionEditHistory(actionId)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/e-actions")
    public ResponseEntity<ApiResponse<SalesOrderEActionListResponse>> createEAction(
            @PathVariable Long id, @RequestBody SalesOrderEActionRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(salesOrderService.createEAction(id, request)));
    }

    /**
     * Create one E-Action addressed by the payload itself — an EXISTING CPO
     * ({@code salesOrderId}) or, when the order is not one of the CPO records in
     * this system, a manually entered CPO reference ({@code cpoReference}).
     * No Customer Purchase Order record is created for a typed reference.
     */
    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/e-actions")
    public ResponseEntity<ApiResponse<SalesOrderEActionListResponse>> createEActionStandalone(
            @RequestBody SalesOrderEActionRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(salesOrderService.createEAction(request)));
    }

    @PreAuthorize("hasAuthority('SALES_EDIT')")
    @PutMapping("/{id}/e-actions/{actionId}")
    public ResponseEntity<ApiResponse<SalesOrderEActionListResponse>> updateEAction(
            @PathVariable Long id, @PathVariable Long actionId, @RequestBody SalesOrderEActionRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.updateEAction(id, actionId, request)));
    }

    /**
     * Update one E-Action by its own id — the edit path for a row whose CPO is a
     * manually entered reference (no Customer Purchase Order holds such a row).
     */
    @PreAuthorize("hasAuthority('SALES_EDIT')")
    @PutMapping("/e-actions/{actionId}")
    public ResponseEntity<ApiResponse<SalesOrderEActionListResponse>> updateEActionStandalone(
            @PathVariable Long actionId, @RequestBody SalesOrderEActionRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.updateEAction(actionId, request)));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @DeleteMapping("/{id}/e-actions/{actionId}")
    public ResponseEntity<ApiResponse<Void>> deleteEAction(@PathVariable Long id, @PathVariable Long actionId) {
        salesOrderService.deleteEAction(id, actionId);
        return ResponseEntity.ok(ApiResponse.ok("E-Action deleted"));
    }

    /** Delete one E-Action by its own id (a row raised against a manual reference). */
    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @DeleteMapping("/e-actions/{actionId}")
    public ResponseEntity<ApiResponse<Void>> deleteEActionStandalone(@PathVariable Long actionId) {
        salesOrderService.deleteEAction(actionId);
        return ResponseEntity.ok(ApiResponse.ok("E-Action deleted"));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<SalesOrderResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.get(id)));
    }

    @PreAuthorize("hasAuthority('SALES_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<SalesOrderResponse>> update(@PathVariable Long id,
                                                                  @Valid @RequestBody SalesOrderRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.update(id, request)));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        salesOrderService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Sales order moved to trash"));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PatchMapping("/archive/{id}")
    public ResponseEntity<ApiResponse<SalesOrderResponse>> archive(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.archive(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PatchMapping("/restore/{id}")
    public ResponseEntity<ApiResponse<SalesOrderResponse>> restore(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.restore(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/status")
    public ResponseEntity<ApiResponse<SalesOrderResponse>> changeStatus(@PathVariable Long id,
                                                                       @RequestBody StatusRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.changeStatus(id, request.status())));
    }

    @PreAuthorize("hasAuthority('SALES_APPROVE')")
    @PostMapping("/{id}/approve")
    public ResponseEntity<ApiResponse<SalesOrderResponse>> approve(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.approve(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/cancel")
    public ResponseEntity<ApiResponse<SalesOrderResponse>> cancel(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.cancel(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/generate-delivery-challan")
    public ResponseEntity<ApiResponse<SalesOrderResponse>> generateDeliveryChallan(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.generateDeliveryChallan(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-proforma")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToProforma(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.convertToProforma(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-invoice")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToInvoice(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.convertToInvoice(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-credit-note")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToCreditNote(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.convertToCreditNote(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/convert-payment-receipt")
    public ResponseEntity<ApiResponse<ConversionResult>> convertToPaymentReceipt(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(salesOrderService.convertToPaymentReceipt(id)));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/duplicate")
    public ResponseEntity<ApiResponse<SalesOrderResponse>> duplicate(@PathVariable Long id) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(salesOrderService.duplicate(id)));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @PostMapping("/bulk-delete")
    public ResponseEntity<ApiResponse<Void>> bulkDelete(@Valid @RequestBody BulkRequest request) {
        int count = salesOrderService.bulkDelete(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Deleted " + count + " sales order(s)"));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @PostMapping("/bulk-permanent-delete")
    public ResponseEntity<ApiResponse<Void>> bulkPermanentDelete(@Valid @RequestBody BulkRequest request) {
        int count = salesOrderService.bulkPermanentDelete(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Permanently deleted " + count + " sales order(s)"));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/bulk-archive")
    public ResponseEntity<ApiResponse<Void>> bulkArchive(@Valid @RequestBody BulkRequest request) {
        int count = salesOrderService.bulkArchive(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Archived " + count + " sales order(s)"));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/bulk-restore")
    public ResponseEntity<ApiResponse<Void>> bulkRestore(@Valid @RequestBody BulkRequest request) {
        int count = salesOrderService.bulkRestore(request.ids());
        return ResponseEntity.ok(ApiResponse.ok("Restored " + count + " sales order(s)"));
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
        List<SalesOrderResponse> orders = salesOrderService.export(search, status, client, salesExecutive,
                dateFrom, dateTo, minAmount, maxAmount);
        byte[] bytes = salesOrderService.buildCsv(orders).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"sales-orders.csv\"")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(bytes);
    }

    @GetMapping("/{id}/timeline")
    public ResponseEntity<List<SalesTimelineResponse>> timeline(@PathVariable Long id) {
        return ResponseEntity.ok(salesOrderService.getTimeline(id));
    }

    @GetMapping("/{id}/history")
    public ResponseEntity<List<SalesHistoryResponse>> history(@PathVariable Long id) {
        return ResponseEntity.ok(salesOrderService.getHistory(id));
    }

    @GetMapping("/{id}/attachments")
    public ResponseEntity<List<SalesAttachmentResponse>> attachments(@PathVariable Long id) {
        return ResponseEntity.ok(salesOrderService.getAttachments(id));
    }

    @PreAuthorize("hasAuthority('SALES_CREATE')")
    @PostMapping("/{id}/attachments")
    public ResponseEntity<ApiResponse<SalesAttachmentResponse>> addAttachment(@PathVariable Long id,
                                                                              @RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(salesOrderService.addAttachment(id, file)));
    }

    @PreAuthorize("hasAuthority('SALES_DELETE')")
    @DeleteMapping("/{id}/attachments/{attachmentId}")
    public ResponseEntity<ApiResponse<Void>> deleteAttachment(@PathVariable Long id,
                                                              @PathVariable Long attachmentId) {
        salesOrderService.deleteAttachment(id, attachmentId);
        return ResponseEntity.ok(ApiResponse.ok("Attachment deleted"));
    }
}
