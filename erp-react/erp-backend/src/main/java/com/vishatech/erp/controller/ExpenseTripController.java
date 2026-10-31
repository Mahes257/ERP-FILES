package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.ExpenseTripListResponse;
import com.vishatech.erp.dto.ExpenseTripRequest;
import com.vishatech.erp.dto.ExpenseTripResponse;
import com.vishatech.erp.entity.MarketingExpenseAttachment;
import com.vishatech.erp.repository.MarketingExpenseAttachmentRepository;
import com.vishatech.erp.service.ExpenseTripService;
import com.vishatech.erp.service.FileStorageService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.security.access.prepost.PreAuthorize;

@RestController
@RequestMapping("/marketing/expenses")
@PreAuthorize("isAuthenticated()")
public class ExpenseTripController {

    private final ExpenseTripService expenseTripService;
    private final FileStorageService fileStorageService;
    private final MarketingExpenseAttachmentRepository attachmentRepository;

    public ExpenseTripController(ExpenseTripService expenseTripService, FileStorageService fileStorageService, MarketingExpenseAttachmentRepository attachmentRepository) {
        this.expenseTripService = expenseTripService;
        this.fileStorageService = fileStorageService;
        this.attachmentRepository = attachmentRepository;
    }

    // ---- Trip CRUD ----
    @PostMapping
    public ResponseEntity<ApiResponse<ExpenseTripResponse>> create(@Valid @RequestBody ExpenseTripRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(expenseTripService.create(request)));
    }

    @GetMapping
    public Page<ExpenseTripListResponse> list(
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search, @RequestParam(required = false) String sort,
            @RequestParam(required = false) String status, @RequestParam(required = false) String approvalStatus,
            @RequestParam(required = false) String marketer, @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return expenseTripService.list(page, size, search, sort, status, approvalStatus, marketer, dateFrom, dateTo);
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ExpenseTripResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(expenseTripService.get(id)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<ExpenseTripResponse>> update(@PathVariable Long id, @Valid @RequestBody ExpenseTripRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(expenseTripService.update(id, request)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        expenseTripService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Trip deleted"));
    }

    // ---- Trip actions ----
    @PostMapping("/{id}/start")
    public ResponseEntity<ApiResponse<ExpenseTripResponse>> startTrip(@PathVariable Long id, @RequestBody(required = false) ExpenseTripRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(expenseTripService.startTrip(id, request)));
    }

    @PostMapping("/{id}/end")
    public ResponseEntity<ApiResponse<ExpenseTripResponse>> endTrip(@PathVariable Long id, @RequestBody(required = false) ExpenseTripRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(expenseTripService.endTrip(id, request)));
    }

    @PostMapping("/{id}/submit")
    public ResponseEntity<ApiResponse<ExpenseTripResponse>> submit(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(expenseTripService.submit(id)));
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<ApiResponse<ExpenseTripResponse>> approve(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(expenseTripService.approve(id)));
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<ApiResponse<ExpenseTripResponse>> reject(@PathVariable Long id, @Valid @RequestBody ExpenseTripRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(expenseTripService.reject(id, request)));
    }

    @PostMapping("/{id}/correction")
    public ResponseEntity<ApiResponse<ExpenseTripResponse>> requestCorrection(@PathVariable Long id, @Valid @RequestBody ExpenseTripRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(expenseTripService.requestCorrection(id, request)));
    }

    // ---- Expense CRUD ----
    @PostMapping("/{tripId}/expenses")
    public ResponseEntity<ApiResponse<ExpenseTripResponse>> addExpense(@PathVariable Long tripId, @Valid @RequestBody ExpenseTripRequest.ExpenseDto dto) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(expenseTripService.addExpense(tripId, dto)));
    }

    @PutMapping("/{tripId}/expenses/{expenseId}")
    public ResponseEntity<ApiResponse<ExpenseTripResponse>> updateExpense(@PathVariable Long tripId, @PathVariable Long expenseId, @Valid @RequestBody ExpenseTripRequest.ExpenseDto dto) {
        return ResponseEntity.ok(ApiResponse.ok(expenseTripService.updateExpense(tripId, expenseId, dto)));
    }

    @DeleteMapping("/{tripId}/expenses/{expenseId}")
    public ResponseEntity<ApiResponse<ExpenseTripResponse>> deleteExpense(@PathVariable Long tripId, @PathVariable Long expenseId) {
        return ResponseEntity.ok(ApiResponse.ok(expenseTripService.deleteExpense(tripId, expenseId)));
    }

    // ---- Bill upload ----
    @PostMapping("/{tripId}/expenses/{expenseId}/bill")
    public ResponseEntity<ApiResponse<MarketingExpenseAttachment>> uploadBill(
            @PathVariable Long tripId, @PathVariable Long expenseId, @RequestPart("file") MultipartFile file) {
        String storedName = fileStorageService.store(file);
        MarketingExpenseAttachment att = new MarketingExpenseAttachment();
        att.setExpenseId(expenseId);
        att.setTripId(tripId);
        att.setName(file.getOriginalFilename());
        att.setStoredName(storedName);
        att.setContentType(file.getContentType());
        att.setSize(file.getSize());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(attachmentRepository.save(att)));
    }

    @DeleteMapping("/{tripId}/bills/{attachmentId}")
    public ResponseEntity<ApiResponse<Void>> deleteBill(@PathVariable Long tripId, @PathVariable Long attachmentId) {
        attachmentRepository.deleteById(attachmentId);
        return ResponseEntity.ok(ApiResponse.ok("Bill deleted"));
    }

    // ---- Summary Dashboard ----
    @GetMapping("/summary")
    public ResponseEntity<ApiResponse<ExpenseTripService.ExpenseSummary>> getSummary(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String marketer) {
        return ResponseEntity.ok(ApiResponse.ok(expenseTripService.getSummary(dateFrom, dateTo, marketer)));
    }
}
