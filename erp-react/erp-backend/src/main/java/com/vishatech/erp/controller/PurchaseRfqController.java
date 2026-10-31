package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.service.PurchaseRfqEvaluationService;
import com.vishatech.erp.service.PurchaseRfqService;
import com.vishatech.erp.service.PurchaseSupportService;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Comparator;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/purchase")
public class PurchaseRfqController {

    private final PurchaseRfqService service;
    private final PurchaseSupportService support;
    private final PurchaseRfqEvaluationService evaluationService;

    public PurchaseRfqController(PurchaseRfqService service, PurchaseSupportService support,
                                 PurchaseRfqEvaluationService evaluationService) {
        this.service = service;
        this.support = support;
        this.evaluationService = evaluationService;
    }

    /* ==================================================================
       EVALUATION WORKFLOW PERSISTENCE
       Technical Evaluation, Final Negotiation, Supplier Selection and
       Selection Approval all read and write the same persisted
       evaluation document per RFQ; negotiation rounds are additionally
       queryable per RFQ.
       ================================================================== */

    @GetMapping("/rfqs/evaluation-records")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public List<Map<String, Object>> evaluationRecords() {
        return evaluationService.listRecords();
    }

    @GetMapping("/rfqs/{id}/evaluation-record")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<Map<String, Object>> evaluationRecord(@PathVariable String id) {
        Map<String, Object> record = evaluationService.getRecord(id);
        if (record == null) return ResponseEntity.noContent().build();
        return ResponseEntity.ok(record);
    }

    @PutMapping("/rfqs/{id}/evaluation-record")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public Map<String, Object> saveEvaluationRecord(@PathVariable String id,
                                                    @RequestBody Map<String, Object> body) {
        return evaluationService.saveRecord(id, body);
    }

    @GetMapping("/rfqs/{id}/negotiations")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public List<Map<String, Object>> negotiations(@PathVariable String id) {
        return evaluationService.negotiations(id);
    }

    @GetMapping("/rfqs")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public Page<Map<String, Object>> list(@RequestParam(defaultValue = "0") int page,
                                          @RequestParam(defaultValue = "10") int size,
                                          @RequestParam(required = false) String search,
                                          @RequestParam(required = false) String status,
                                          @RequestParam(required = false) String sort) {
        boolean descending = sort == null || sort.isBlank() || sort.startsWith("-");
        String field = sort == null || sort.isBlank() ? "createdAt" : (descending ? sort.substring(1) : sort);
        Comparator<Map<String, Object>> comparator = Comparator.comparing(
                row -> String.valueOf(row.getOrDefault(field, "")), String.CASE_INSENSITIVE_ORDER);
        List<Map<String, Object>> all = service.list().stream()
                .filter(rfq -> matches(rfq, search, status))
                .sorted(descending ? comparator.reversed() : comparator)
                .collect(Collectors.toList());
        int from = Math.min(Math.max(page, 0) * Math.max(size, 1), all.size());
        int to = Math.min(from + Math.max(size, 1), all.size());
        return new PageImpl<>(all.subList(from, to), PageRequest.of(Math.max(page, 0), Math.max(size, 1)), all.size());
    }

    private boolean matches(Map<String, Object> rfq, String search, String status) {
        if (status != null && !status.isBlank() && !"All".equalsIgnoreCase(status)
                && !status.equalsIgnoreCase(String.valueOf(rfq.get("status")))) return false;
        if (search == null || search.isBlank()) return true;
        String query = search.toLowerCase(Locale.ROOT);
        return List.of("rfqNo", "title", "department", "project", "requester", "buyer")
                .stream()
                .map(field -> String.valueOf(rfq.getOrDefault(field, "")).toLowerCase(Locale.ROOT))
                .anyMatch(value -> value.contains(query));
    }

    @PostMapping("/rfqs")
    @PreAuthorize("hasAuthority('PURCHASE_CREATE')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> create(@RequestBody Map<String, Object> request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(service.create(request)));
    }

    @GetMapping("/rfqs/{id}")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> get(@PathVariable String id) {
        return ResponseEntity.ok(ApiResponse.ok(service.getResponse(id)));
    }

    @GetMapping("/rfqs/stats")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats() {
        return ResponseEntity.ok(ApiResponse.ok(service.stats()));
    }

    @GetMapping("/quotations/stats")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> quotationStats() {
        return ResponseEntity.ok(ApiResponse.ok(service.quotationStats()));
    }

    @PutMapping("/rfqs/{id}")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> update(@PathVariable Long id, @RequestBody Map<String, Object> request) {
        return ResponseEntity.ok(ApiResponse.ok(service.update(id, request)));
    }

    @DeleteMapping("/rfqs/{id}")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("RFQ deleted"));
    }

    @GetMapping("/rfqs/dashboard")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> dashboard() {
        return ResponseEntity.ok(ApiResponse.ok(service.dashboard()));
    }

    @GetMapping("/rfqs/cost-estimates")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> costEstimates() {
        return ResponseEntity.ok(ApiResponse.ok(service.costEstimates()));
    }

    @GetMapping("/rfqs/{id}/print-preview")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> printPreview(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.getResponse(id)));
    }

    @PostMapping("/rfqs/{id}/print-log")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Void>> printLog(@PathVariable Long id) {
        service.logPrint(id);
        return ResponseEntity.ok(ApiResponse.ok("RFQ print logged"));
    }

    @PostMapping("/rfqs/{id}/duplicate")
    @PreAuthorize("hasAuthority('PURCHASE_CREATE')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> duplicate(@PathVariable Long id) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(service.duplicate(id)));
    }

    @PostMapping("/rfqs/{id}/comments")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Void>> comment(@PathVariable Long id, @RequestBody Map<String, Object> request) {
        service.comment(id, request == null ? "" : String.valueOf(request.getOrDefault("text", "")));
        return ResponseEntity.ok(ApiResponse.ok("RFQ comment added"));
    }

    @PostMapping("/rfqs/{id}/submit-review")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> submit(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> request) {
        return ResponseEntity.ok(ApiResponse.ok(service.transition(id, "Pending Approval", note(request))));
    }

    @PostMapping("/rfqs/{id}/approve")
    @PreAuthorize("hasAuthority('PURCHASE_APPROVE')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> approve(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> request) {
        return ResponseEntity.ok(ApiResponse.ok(service.transition(id, "Approved", note(request))));
    }

    @PostMapping("/rfqs/{id}/reject")
    @PreAuthorize("hasAuthority('PURCHASE_APPROVE')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> reject(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> request) {
        return ResponseEntity.ok(ApiResponse.ok(service.transition(id, "Cancelled", note(request))));
    }

    @PostMapping("/rfqs/{id}/send")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> send(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.transition(id, "Sent", "")));
    }

    @PostMapping("/rfqs/{id}/evaluate")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> evaluate(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> request) {
        return ResponseEntity.ok(ApiResponse.ok(service.transition(id, "Evaluation", note(request))));
    }

    @PostMapping("/rfqs/{id}/award")
    @PreAuthorize("hasAuthority('PURCHASE_APPROVE')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> award(@PathVariable Long id, @RequestBody Map<String, Object> request) {
        return ResponseEntity.ok(ApiResponse.ok(service.award(id, String.valueOf(request.get("vendor")), note(request))));
    }

    @PostMapping("/rfqs/{id}/close")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> close(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.transition(id, "Closed", "")));
    }

    @PostMapping("/rfqs/{id}/cancel")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> cancel(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> request) {
        return ResponseEntity.ok(ApiResponse.ok(service.transition(id, "Cancelled", note(request))));
    }

    @GetMapping("/rfqs/{id}/timeline")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<List<PurchaseSupportService.PurchaseActivityEntry>>> timeline(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(support.activity(PurchaseSupportService.DOC_RFQ, service.get(id).getId())));
    }

    @GetMapping("/rfqs/{id}/audit")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<List<PurchaseSupportService.PurchaseActivityEntry>>> audit(@PathVariable Long id) {
        return timeline(id);
    }

    @GetMapping("/rfqs/{id}/comparison")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> comparison(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.comparison(id)));
    }

    @GetMapping("/quotations")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> quotations(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String rfqNo,
            @RequestParam(required = false) String sort) {
        /* Same list contract as /rfqs. The Quotations page drives its status
           tabs, search box and sortable column headers from these params, so
           ignoring them left every tab showing the unfiltered feed. */
        List<Map<String, Object>> all = service.listQuotations(rfqNo).stream()
                .filter(quote -> matchesQuotation(quote, search, status))
                .collect(Collectors.toList());
        if (sort != null && !sort.isBlank()) {
            boolean descending = sort.startsWith("-");
            String field = descending ? sort.substring(1) : sort;
            if (QUOTATION_SORT_FIELDS.contains(field)) {
                Comparator<Map<String, Object>> comparator = quotationComparator(field);
                all.sort(descending ? comparator.reversed() : comparator);
            }
        }
        int pageSize = Math.max(size, 1);
        int index = Math.max(page, 0);
        int from = Math.min(index * pageSize, all.size());
        int to = Math.min(from + pageSize, all.size());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("data", all.subList(from, to));
        payload.put("total", all.size());
        payload.put("page", index + 1);
        payload.put("pageSize", pageSize);
        payload.put("totalPages", Math.max(1, (int) Math.ceil(all.size() / (double) pageSize)));
        return ResponseEntity.ok(ApiResponse.ok(payload));
    }

    /** Fields the Quotations list is allowed to filter/sort on. */
    private static final List<String> QUOTATION_SORT_FIELDS = List.of(
            "quotationNo", "rfqNo", "vendor", "submittedOn", "total", "currency",
            "delivery", "validUntil", "leadTime", "paymentTerms", "score", "status");
    private static final List<String> QUOTATION_NUMERIC_FIELDS = List.of("total", "score", "delivery", "leadTime");

    private boolean matchesQuotation(Map<String, Object> quote, String search, String status) {
        if (status != null && !status.isBlank() && !"All".equalsIgnoreCase(status)
                && !status.equalsIgnoreCase(String.valueOf(quote.get("status")))) return false;
        if (search == null || search.isBlank()) return true;
        String query = search.toLowerCase(Locale.ROOT);
        return List.of("quotationNo", "rfqNo", "vendor")
                .stream()
                .map(field -> String.valueOf(quote.getOrDefault(field, "")).toLowerCase(Locale.ROOT))
                .anyMatch(value -> value.contains(query));
    }

    private Comparator<Map<String, Object>> quotationComparator(String field) {
        boolean numeric = QUOTATION_NUMERIC_FIELDS.contains(field);
        return (a, b) -> numeric
                ? quotationNumber(a.get(field)).compareTo(quotationNumber(b.get(field)))
                : String.valueOf(a.getOrDefault(field, ""))
                        .compareToIgnoreCase(String.valueOf(b.getOrDefault(field, "")));
    }

    private BigDecimal quotationNumber(Object value) {
        if (value instanceof BigDecimal decimal) return decimal;
        if (value instanceof Number number) return BigDecimal.valueOf(number.doubleValue());
        try {
            return new BigDecimal(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return BigDecimal.ZERO;
        }
    }

    @PostMapping("/quotations")
    @PreAuthorize("hasAuthority('PURCHASE_CREATE')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> quotation(@RequestBody Map<String, Object> request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(service.addQuotation(request)));
    }

    @GetMapping("/quotations/{id}")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> quotation(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.quotation(id)));
    }

    @DeleteMapping("/quotations/{id}")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Void>> deleteQuotation(@PathVariable Long id) {
        service.deleteQuotation(id);
        return ResponseEntity.ok(ApiResponse.ok("Quotation deleted"));
    }

    @GetMapping("/rfqs/{id}/attachments")
    @PreAuthorize("hasAuthority('PURCHASE_VIEW')")
    public ResponseEntity<ApiResponse<List<PurchaseSupportService.PurchaseAttachmentPayload>>> attachments(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(support.attachments(PurchaseSupportService.DOC_RFQ, service.get(id).getId())));
    }

    @PostMapping("/rfqs/{id}/attachments")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<PurchaseSupportService.PurchaseAttachmentPayload>> upload(
            @PathVariable Long id, @RequestPart("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(service.uploadAttachment(id, file)));
    }

    @DeleteMapping("/rfqs/{id}/attachments/{attachmentId}")
    @PreAuthorize("hasAuthority('PURCHASE_EDIT')")
    public ResponseEntity<ApiResponse<Void>> deleteAttachment(
            @PathVariable Long id, @PathVariable Long attachmentId) {
        service.deleteAttachment(id, attachmentId);
        return ResponseEntity.ok(ApiResponse.ok("Attachment deleted"));
    }

    private String note(Map<String, Object> request) {
        return request == null ? "" : String.valueOf(request.getOrDefault("note", request.getOrDefault("remarks", "")));
    }
}
