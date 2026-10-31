package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.MarketingCreateLeadRequest;
import com.vishatech.erp.dto.MarketingFollowUpRequest;
import com.vishatech.erp.dto.MarketingFollowUpResponse;
import com.vishatech.erp.dto.MarketingLeadRequest;
import com.vishatech.erp.dto.MarketingLeadResponse;
import com.vishatech.erp.dto.MarketingLinkLeadRequest;
import com.vishatech.erp.dto.MarketingPerformanceResponse;
import com.vishatech.erp.dto.MarketingSearchResponse;
import com.vishatech.erp.dto.MarketingSummaryResponse;
import com.vishatech.erp.dto.MarketingVisitDetailResponse;
import com.vishatech.erp.dto.MarketingVisitRequest;
import com.vishatech.erp.dto.MarketingVisitResponse;
import com.vishatech.erp.dto.VisitChangeHistoryResponse;
import com.vishatech.erp.dto.MarketingDashboardResponse;
import com.vishatech.erp.dto.MarketingDashboardAnalyticsResponse;
import com.vishatech.erp.service.MarketingDashboardAnalyticsService;
import com.vishatech.erp.service.MarketingDashboardService;
import com.vishatech.erp.service.MarketingVisitService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
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
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * Offline Marketing module — one single-page ERP module. Marketing-only: the
 * module's leads are its own standalone records and nothing connects to Sales.
 * All endpoints require authentication (SecurityConfig); record-level access
 * control (marketer sees only own records, ADMIN/MANAGER see everything) is
 * enforced in {@link MarketingVisitService}.
 */
@RestController
@RequestMapping("/marketing")
@PreAuthorize("hasAuthority('MARKETING_VIEW')")
public class MarketingController {

    private final MarketingVisitService marketingVisitService;
    private final MarketingDashboardService dashboardService;
    private final MarketingDashboardAnalyticsService analyticsService;

    public MarketingController(MarketingVisitService marketingVisitService, MarketingDashboardService dashboardService,
                               MarketingDashboardAnalyticsService analyticsService) {
        this.marketingVisitService = marketingVisitService;
        this.dashboardService = dashboardService;
        this.analyticsService = analyticsService;
    }

    // ============================== Visits ==============================

    @GetMapping("/visits")
    public Page<MarketingVisitResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sort,
            // Single-page view tabs: today / upcoming / pending-followups / overdue / completed / leads / handover
            @RequestParam(required = false) String view,
            @RequestParam(required = false) String marketer,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String appointmentStatus,
            @RequestParam(required = false) String visitStatus,
            @RequestParam(required = false) String qFormStatus,
            @RequestParam(required = false) String leadStatus,
            @RequestParam(required = false) String priority,
            @RequestParam(required = false) String followupStatus,
            @RequestParam(required = false) String outcome,
            @RequestParam(required = false) String location) {
        return marketingVisitService.list(page, size, search, sort, view, marketer, dateFrom, dateTo,
                appointmentStatus, visitStatus, qFormStatus, leadStatus, priority, followupStatus,
                outcome, location);
    }

    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    @PostMapping("/visits")
    public ResponseEntity<ApiResponse<MarketingVisitDetailResponse>> create(
            @Valid @RequestBody MarketingVisitRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(marketingVisitService.create(request)));
    }

    @GetMapping("/visits/{id}")
    public ResponseEntity<ApiResponse<MarketingVisitDetailResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.get(id)));
    }

    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    @PutMapping("/visits/{id}")
    public ResponseEntity<ApiResponse<MarketingVisitDetailResponse>> update(
            @PathVariable Long id, @Valid @RequestBody MarketingVisitRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.update(id, request)));
    }

    @PreAuthorize("hasAuthority('MARKETING_DELETE')")
    @DeleteMapping("/visits/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        marketingVisitService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Visit moved to trash"));
    }

    /** Visit history for the same lead/customer (never overwritten — all visits preserved). */
    @GetMapping("/visits/{id}/history")
    public ResponseEntity<ApiResponse<List<MarketingVisitResponse>>> visitHistory(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.visitHistory(id)));
    }

    @GetMapping("/visits/{id}/change-history")
    public ResponseEntity<ApiResponse<List<VisitChangeHistoryResponse>>> changeHistory(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.getChangeHistory(id)));
    }

    // ============================== Actual visit ==============================

    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    @PostMapping("/visits/{id}/entry")
    public ResponseEntity<ApiResponse<MarketingVisitDetailResponse>> recordEntryPost(
            @PathVariable Long id, @Valid @RequestBody MarketingVisitRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.recordEntry(id, request)));
    }

    @PatchMapping("/visits/{id}/entry")
    public ResponseEntity<ApiResponse<MarketingVisitDetailResponse>> recordEntry(
            @PathVariable Long id, @Valid @RequestBody MarketingVisitRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.recordEntry(id, request)));
    }

    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    @PostMapping("/visits/{id}/exit")
    public ResponseEntity<ApiResponse<MarketingVisitDetailResponse>> recordExitPost(
            @PathVariable Long id, @Valid @RequestBody MarketingVisitRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.recordExit(id, request)));
    }

    @PatchMapping("/visits/{id}/exit")
    public ResponseEntity<ApiResponse<MarketingVisitDetailResponse>> recordExit(
            @PathVariable Long id, @Valid @RequestBody MarketingVisitRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.recordExit(id, request)));
    }

    @PatchMapping("/visits/{id}/status")
    public ResponseEntity<ApiResponse<MarketingVisitDetailResponse>> changeStatus(
            @PathVariable Long id, @Valid @RequestBody MarketingVisitRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.changeStatus(id, request.visitStatus())));
    }

    // ============================== Q Form / Requirement / Discussion / Outcome ==============================

    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    @PostMapping("/visits/{id}/q-form")
    public ResponseEntity<ApiResponse<MarketingVisitDetailResponse>> saveQFormPost(
            @PathVariable Long id, @Valid @RequestBody MarketingVisitRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.saveQForm(id, request)));
    }

    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    @PutMapping("/visits/{id}/qform")
    public ResponseEntity<ApiResponse<MarketingVisitDetailResponse>> saveQForm(
            @PathVariable Long id, @Valid @RequestBody MarketingVisitRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.saveQForm(id, request)));
    }

    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    @PostMapping("/visits/{id}/requirement")
    public ResponseEntity<ApiResponse<MarketingVisitDetailResponse>> saveRequirementPost(
            @PathVariable Long id, @Valid @RequestBody MarketingVisitRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.saveRequirement(id, request)));
    }

    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    @PutMapping("/visits/{id}/requirement")
    public ResponseEntity<ApiResponse<MarketingVisitDetailResponse>> saveRequirement(
            @PathVariable Long id, @Valid @RequestBody MarketingVisitRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.saveRequirement(id, request)));
    }

    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    @PutMapping("/visits/{id}/discussion")
    public ResponseEntity<ApiResponse<MarketingVisitDetailResponse>> saveDiscussion(
            @PathVariable Long id, @Valid @RequestBody MarketingVisitRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.saveDiscussion(id, request)));
    }

    @PatchMapping("/visits/{id}/outcome")
    public ResponseEntity<ApiResponse<MarketingVisitDetailResponse>> setOutcome(
            @PathVariable Long id, @Valid @RequestBody MarketingVisitRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(
                marketingVisitService.setOutcome(id, request.outcome(), request.noLeadReason())));
    }

    // ============================== Marketing lead (standalone) ==============================

    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    @PostMapping("/visits/{id}/lead")
    public ResponseEntity<ApiResponse<MarketingVisitDetailResponse>> createLeadFromVisit(
            @PathVariable Long id, @Valid @RequestBody(required = false) MarketingCreateLeadRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(marketingVisitService.createLead(id, request)));
    }

    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    @PostMapping("/visits/{id}/link-lead")
    public ResponseEntity<ApiResponse<MarketingVisitDetailResponse>> linkLead(
            @PathVariable Long id, @Valid @RequestBody MarketingLinkLeadRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.linkLead(id, request.leadId())));
    }

    @GetMapping("/leads")
    public Page<MarketingLeadResponse> listLeads(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String marketer,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String stage,
            @RequestParam(required = false) String priority,
            @RequestParam(required = false) String location) {
        return marketingVisitService.listLeads(page, size, search, sort, marketer, dateFrom, dateTo,
                status, stage, priority, location);
    }

    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    @PostMapping("/leads")
    public ResponseEntity<ApiResponse<MarketingLeadResponse>> createLead(
            @Valid @RequestBody MarketingLeadRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(marketingVisitService.createLeadStandalone(request)));
    }

    @GetMapping("/leads/{id}")
    public ResponseEntity<ApiResponse<MarketingLeadResponse>> getLead(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.getLead(id)));
    }

    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    @PutMapping("/leads/{id}")
    public ResponseEntity<ApiResponse<MarketingLeadResponse>> updateLead(
            @PathVariable Long id, @RequestBody MarketingLeadRequest request) {
        // No @Valid here: updates are patch-style (all fields optional).
        // "Company name is required" is enforced on create in the service.
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.updateLead(id, request)));
    }

    @GetMapping("/leads/{id}/visits")
    public ResponseEntity<ApiResponse<List<MarketingVisitResponse>>> leadVisits(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.leadVisits(id)));
    }

    @GetMapping("/leads/{id}/follow-ups")
    public ResponseEntity<ApiResponse<List<MarketingFollowUpResponse>>> leadFollowUps(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.leadFollowUps(id)));
    }

    // ============================== Follow-ups ==============================

    @GetMapping("/follow-ups")
    public Page<MarketingFollowUpResponse> listFollowUps(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) Long leadId,
            @RequestParam(required = false) Long visitId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String mode,
            @RequestParam(required = false) String marketer,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return marketingVisitService.listFollowUps(page, size, search, sort, leadId, visitId,
                status, mode, marketer, dateFrom, dateTo);
    }

    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    @PostMapping("/follow-ups")
    public ResponseEntity<ApiResponse<MarketingFollowUpResponse>> createFollowUp(
            @Valid @RequestBody MarketingFollowUpRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(marketingVisitService.createFollowUp(request)));
    }

    @GetMapping("/follow-ups/{id}")
    public ResponseEntity<ApiResponse<MarketingFollowUpResponse>> getFollowUp(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.getFollowUp(id)));
    }

    @PreAuthorize("hasAuthority('MARKETING_EDIT')")
    @PutMapping("/follow-ups/{id}")
    public ResponseEntity<ApiResponse<MarketingFollowUpResponse>> updateFollowUp(
            @PathVariable Long id, @Valid @RequestBody MarketingFollowUpRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.updateFollowUpStandalone(id, request)));
    }

    @PreAuthorize("hasAuthority('MARKETING_DELETE')")
    @DeleteMapping("/follow-ups/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteFollowUp(@PathVariable Long id) {
        marketingVisitService.deleteFollowUp(id);
        return ResponseEntity.ok(ApiResponse.ok("Follow-up deleted"));
    }

    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    @PostMapping("/follow-ups/{id}/complete")
    public ResponseEntity<ApiResponse<MarketingFollowUpResponse>> completeFollowUp(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.completeFollowUp(id)));
    }

    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    @PostMapping("/follow-ups/{id}/reschedule")
    public ResponseEntity<ApiResponse<MarketingFollowUpResponse>> rescheduleFollowUp(
            @PathVariable Long id, @Valid @RequestBody MarketingFollowUpRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.rescheduleFollowUp(id, request)));
    }

    // ============================== Visit-scoped follow-ups (existing UI) ==============================

    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    @PostMapping("/visits/{id}/followups")
    public ResponseEntity<ApiResponse<MarketingVisitDetailResponse>> addFollowUp(
            @PathVariable Long id, @Valid @RequestBody MarketingFollowUpRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(marketingVisitService.addFollowUp(id, request)));
    }

    @PatchMapping("/visits/{id}/followups/{followUpId}")
    public ResponseEntity<ApiResponse<MarketingVisitDetailResponse>> updateVisitFollowUp(
            @PathVariable Long id, @PathVariable Long followUpId,
            @Valid @RequestBody MarketingFollowUpRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.updateFollowUp(id, followUpId, request)));
    }

    // ============================== Sales handover (marketing-internal) ==============================

    @PreAuthorize("hasAuthority('MARKETING_CREATE')")
    @PostMapping("/visits/{id}/handover")
    public ResponseEntity<ApiResponse<MarketingVisitDetailResponse>> handover(
            @PathVariable Long id, @Valid @RequestBody MarketingVisitRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.handover(id, request)));
    }

    // ============================== Autocomplete search ==============================

    /** Lightweight autocomplete over Marketing visits + leads (server-side, limited). */
    @GetMapping("/search")
    public ResponseEntity<ApiResponse<List<MarketingSearchResponse>>> search(
            @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "10") int limit) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.search(q, limit)));
    }

    // ============================== Dashboard ================================

    @GetMapping("/dashboard")
    public ResponseEntity<ApiResponse<MarketingDashboardResponse>> dashboard() {
        return ResponseEntity.ok(ApiResponse.ok(dashboardService.getDashboard()));
    }

    // ============================== Dashboard analytics ================================

    @GetMapping("/dashboard/summary")
    public ResponseEntity<ApiResponse<MarketingDashboardAnalyticsResponse.Summary>> dashboardSummary(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String marketer,
            @RequestParam(required = false) String plant,
            @RequestParam(required = false) String visitStatus,
            @RequestParam(required = false) String qFormStatus,
            @RequestParam(required = false) String tripStatus,
            @RequestParam(required = false) String expenseStatus) {
        return ResponseEntity.ok(ApiResponse.ok(analyticsService.summary(
                dateFrom, dateTo, marketer, plant, visitStatus, qFormStatus, tripStatus, expenseStatus)));
    }

    @GetMapping("/dashboard/visits-trend")
    public ResponseEntity<ApiResponse<List<MarketingDashboardAnalyticsResponse.TrendPoint>>> dashboardVisitsTrend(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String marketer,
            @RequestParam(required = false) String plant,
            @RequestParam(required = false) String visitStatus) {
        return ResponseEntity.ok(ApiResponse.ok(analyticsService.visitsTrend(
                dateFrom, dateTo, marketer, plant, visitStatus)));
    }

    @GetMapping("/dashboard/visit-status")
    public ResponseEntity<ApiResponse<List<MarketingDashboardAnalyticsResponse.VisitStatusItem>>> dashboardVisitStatus(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String marketer,
            @RequestParam(required = false) String plant) {
        return ResponseEntity.ok(ApiResponse.ok(analyticsService.visitStatus(dateFrom, dateTo, marketer, plant)));
    }

    @GetMapping("/dashboard/recent-activities")
    public ResponseEntity<ApiResponse<List<MarketingDashboardAnalyticsResponse.ActivityItem>>> dashboardRecentActivities(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String marketer,
            @RequestParam(required = false) String plant,
            @RequestParam(defaultValue = "8") int limit) {
        List<MarketingDashboardAnalyticsResponse.ActivityItem> all =
                analyticsService.recentActivities(dateFrom, dateTo, marketer, plant);
        return ResponseEntity.ok(ApiResponse.ok(all.subList(0, Math.min(limit, all.size()))));
    }

    @GetMapping("/dashboard/top-plants")
    public ResponseEntity<ApiResponse<List<MarketingDashboardAnalyticsResponse.TopPlant>>> dashboardTopPlants(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String marketer,
            @RequestParam(required = false) String plant,
            @RequestParam(required = false) String qFormStatus,
            @RequestParam(defaultValue = "5") int limit) {
        return ResponseEntity.ok(ApiResponse.ok(analyticsService.topPlants(
                dateFrom, dateTo, marketer, plant, qFormStatus, Math.min(Math.max(limit, 1), 50))));
    }

    @GetMapping("/dashboard/expenses-by-category")
    public ResponseEntity<ApiResponse<MarketingDashboardAnalyticsResponse.ExpensesCategoryBreakdown>> dashboardExpensesByCategory(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String marketer,
            @RequestParam(required = false) String expenseStatus) {
        return ResponseEntity.ok(ApiResponse.ok(analyticsService.expensesByCategory(
                dateFrom, dateTo, marketer, expenseStatus)));
    }

    @GetMapping("/dashboard/active-trips")
    public ResponseEntity<ApiResponse<List<MarketingDashboardAnalyticsResponse.ActiveTrip>>> dashboardActiveTrips(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String marketer) {
        return ResponseEntity.ok(ApiResponse.ok(analyticsService.activeTrips(dateFrom, dateTo, marketer)));
    }

    // ============================== Summary & performance ==============================

    @GetMapping("/summary")
    public ResponseEntity<ApiResponse<MarketingSummaryResponse>> summary() {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.summary()));
    }

    @GetMapping("/performance")
    public ResponseEntity<ApiResponse<MarketingPerformanceResponse>> performance(
            @RequestParam(required = false) String marketer,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return ResponseEntity.ok(ApiResponse.ok(marketingVisitService.performance(marketer, dateFrom, dateTo)));
    }
}
