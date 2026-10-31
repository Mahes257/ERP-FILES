package com.vishatech.erp.service;

import com.vishatech.erp.dto.MarketingDashboardResponse;
import com.vishatech.erp.entity.*;
import com.vishatech.erp.repository.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import com.vishatech.erp.util.AuditContext;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Predicate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class MarketingDashboardService {

    private final MarketingVisitRepository visitRepository;
    private final MarketingFollowUpRepository followUpRepository;
    private final MarketingLeadRepository leadRepository;
    private final QuestionnaireFormRepository qFormRepository;
    private final MarketingTravelPlanRepository travelPlanRepository;
    private final MarketingTravelPlanStopRepository travelPlanStopRepository;
    private final MarketingExpenseTripRepository expenseTripRepository;
    private final MarketingExpenseRepository expenseRepository;
    private final AuditContext auditContext;

    public MarketingDashboardService(
            MarketingVisitRepository visitRepository,
            MarketingFollowUpRepository followUpRepository,
            MarketingLeadRepository leadRepository,
            QuestionnaireFormRepository qFormRepository,
            MarketingTravelPlanRepository travelPlanRepository,
            MarketingTravelPlanStopRepository travelPlanStopRepository,
            MarketingExpenseTripRepository expenseTripRepository,
            MarketingExpenseRepository expenseRepository,
            AuditContext auditContext) {
        this.visitRepository = visitRepository;
        this.followUpRepository = followUpRepository;
        this.leadRepository = leadRepository;
        this.qFormRepository = qFormRepository;
        this.travelPlanRepository = travelPlanRepository;
        this.travelPlanStopRepository = travelPlanStopRepository;
        this.expenseTripRepository = expenseTripRepository;
        this.expenseRepository = expenseRepository;
        this.auditContext = auditContext;
    }

    public MarketingDashboardResponse getDashboard() {
        LocalDate today = LocalDate.now();

        // ---- Offline Marketing KPIs ----
        long totalVisits = visitRepository.countByDeletedFalse();
        long todayVisits = visitRepository.countByDeletedFalseAndScheduleDate(today);
        long upcomingVisits = visitRepository.countByDeletedFalseAndScheduleDateAfter(today);
        long pendingFollowUps = followUpRepository.countByStatus("Pending");
        // Overdue = due date passed and still open (Pending or Overdue), matching the
        // existing "overdue" follow-up workflow used elsewhere in the module.
        long overdueFollowUps = followUpRepository.countByStatusInAndFollowupDateBefore(
                List.of("Pending", "Overdue"), today);
        long completedVisits = visitRepository.countByDeletedFalseAndVisitStatus("Completed");
        long totalLeads = leadRepository.count();
        long handoverPending = visitRepository.countByHandoverReady();

        var offlineMarketing = new MarketingDashboardResponse.OfflineMarketingKpis(
                totalVisits, todayVisits, upcomingVisits, pendingFollowUps, overdueFollowUps,
                completedVisits, totalLeads, handoverPending);

        // ---- Q Form KPIs ----
        // Q Forms are soft-deleted (project convention), so all counts must
        // exclude deleted rows — matching the module's list/search behaviour.
        long qfTotal = qFormRepository.countByDeletedFalse();
        long qfNotPrepared = qFormRepository.countByDeletedFalseAndStatus("Not Prepared");
        long qfDraft = qFormRepository.countByDeletedFalseAndStatus("Draft");
        long qfSubmitted = qFormRepository.countByDeletedFalseAndStatus("Filled & Submitted");

        var qForms = new MarketingDashboardResponse.QFormKpis(qfTotal, qfNotPrepared, qfDraft, qfSubmitted);

        // ---- Travel Plan KPIs ----
        // A registry is a private record (TravelPlanService enforces that per
        // record), so its tallies here follow the same rule: ADMIN/MANAGER get the
        // company-wide counts above, everyone else only their own registries — the
        // board, and the "awaiting approval" pending action below, can then never
        // advertise a registry the caller cannot open. Every branch keeps the
        // exact filter set of the query it replaces (same status field, same
        // soft-delete rule); only ownership is added.
        List<MarketingTravelPlan> scopedTravelPlans = ownTravelPlansIfScoped();
        boolean travelPlansAreScoped = scopedTravelPlans != null;
        long tpTotal = travelPlansAreScoped
                ? countTravelPlans(scopedTravelPlans, plan -> !plan.isDeleted())
                : travelPlanRepository.countByDeletedFalse();
        long tpPendingApproval = travelPlansAreScoped
                ? countTravelPlans(scopedTravelPlans,
                        plan -> "Pending Approval".equals(plan.getApprovalStatus()))
                : travelPlanRepository.countByApprovalStatus("Pending Approval");
        long tpApproved = travelPlansAreScoped
                ? countTravelPlans(scopedTravelPlans, plan -> "Approved".equals(plan.getApprovalStatus()))
                : travelPlanRepository.countByApprovalStatus("Approved");
        long tpActive = travelPlansAreScoped
                ? countTravelPlans(scopedTravelPlans,
                        plan -> !plan.isDeleted() && "Active".equals(plan.getStatus()))
                : travelPlanRepository.countByStatus("Active");
        long tpCompleted = travelPlansAreScoped
                ? countTravelPlans(scopedTravelPlans,
                        plan -> !plan.isDeleted() && "Completed".equals(plan.getStatus()))
                : travelPlanRepository.countByStatus("Completed");
        long tpCancelled = travelPlansAreScoped
                ? countTravelPlans(scopedTravelPlans,
                        plan -> !plan.isDeleted() && "Cancelled".equals(plan.getStatus()))
                : travelPlanRepository.countByStatus("Cancelled");

        var travelPlans = new MarketingDashboardResponse.TravelPlanKpis(
                tpTotal, tpPendingApproval, tpApproved, tpActive, tpCompleted, tpCancelled);

        // ---- Expense KPIs ----
        long exActive = expenseTripRepository.countByStatus("Active");
        long exPendingSubmission = countPendingSubmission();
        // Only the literal "Pending Approval" state is counted — 'Submitted'
        // is not pending approval.
        long exPendingApproval = expenseTripRepository.countByApprovalStatus("Pending Approval");
        long exApproved = expenseTripRepository.countByApprovalStatus("Approved");
        long exRejected = expenseTripRepository.countByApprovalStatus("Rejected");
        BigDecimal exTotal = safeSum(expenseRepository.sumAllExpenses());
        BigDecimal exWithBill = safeSum(expenseRepository.sumWithBillExpenses());
        BigDecimal exWithoutBill = safeSum(expenseRepository.sumWithoutBillExpenses());

        var expenses = new MarketingDashboardResponse.ExpenseKpis(
                exActive, exPendingSubmission, exPendingApproval, exApproved, exRejected,
                exTotal, exWithBill, exWithoutBill);

        // ---- Pending Actions ----
        List<MarketingDashboardResponse.PendingAction> pendingActions = new ArrayList<>();
        if (pendingFollowUps > 0) pendingActions.add(new MarketingDashboardResponse.PendingAction(
                "Offline Marketing", "Follow-ups", "Follow-ups pending", pendingFollowUps, "", "/marketing"));
        if (overdueFollowUps > 0) pendingActions.add(new MarketingDashboardResponse.PendingAction(
                "Offline Marketing", "Overdue", "Overdue follow-ups", overdueFollowUps, "overdue", "/marketing"));
        if (qfNotPrepared > 0) pendingActions.add(new MarketingDashboardResponse.PendingAction(
                "Q Forms", "Not Prepared", "Q Forms not prepared", qfNotPrepared, "Not Prepared", "/marketing/q-forms"));
        if (qfDraft > 0) pendingActions.add(new MarketingDashboardResponse.PendingAction(
                "Q Forms", "Draft", "Q Forms in draft", qfDraft, "Draft", "/marketing/q-forms"));
        if (tpPendingApproval > 0) pendingActions.add(new MarketingDashboardResponse.PendingAction(
                "Travel Plans", "Approval", "Travel plans awaiting approval", tpPendingApproval, "Pending Approval", "/marketing/travel-planners"));
        if (exPendingSubmission > 0) pendingActions.add(new MarketingDashboardResponse.PendingAction(
                "Expenses", "Submission", "Expense reports pending submission", exPendingSubmission, "pending-submission", "/marketing/expenses"));
        if (exPendingApproval > 0) pendingActions.add(new MarketingDashboardResponse.PendingAction(
                "Expenses", "Approval", "Expense reports awaiting approval", exPendingApproval, "Pending Approval", "/marketing/expenses"));

        // ---- Alerts ----
        List<MarketingDashboardResponse.AlertItem> alerts = new ArrayList<>();
        if (overdueFollowUps > 0) alerts.add(new MarketingDashboardResponse.AlertItem(
                "Offline Marketing", "warning", overdueFollowUps + " overdue follow-up(s) require attention", "/marketing", "overdue"));
        if (exRejected > 0) alerts.add(new MarketingDashboardResponse.AlertItem(
                "Expenses", "danger", exRejected + " expense report(s) rejected", "/marketing/expenses", "Rejected"));
        if (tpActive > 0) alerts.add(new MarketingDashboardResponse.AlertItem(
                "Travel Plans", "info", tpActive + " active trip(s) in progress", "/marketing/travel-planners", "Active"));

        return new MarketingDashboardResponse(
                offlineMarketing, qForms, travelPlans, expenses, pendingActions, alerts);
    }

    /**
     * The caller's own registries, or {@code null} when the caller may see every
     * registry (ADMIN/MANAGER) so the existing company-wide count queries stand.
     * A caller whose identity cannot be resolved owns none — never everyone's.
     */
    private List<MarketingTravelPlan> ownTravelPlansIfScoped() {
        User caller = auditContext.currentUser();
        if (caller != null
                && (caller.getRole() == UserRole.ADMIN || caller.getRole() == UserRole.MANAGER)) {
            return null;
        }
        return caller == null
                ? List.of()
                : travelPlanRepository.findByMarketerUserIdOrderByCreatedAtDesc(caller.getId());
    }

    private static long countTravelPlans(List<MarketingTravelPlan> plans,
                                         Predicate<MarketingTravelPlan> filter) {
        return plans.stream().filter(filter).count();
    }

    private long countPendingSubmission() {
        long completed = expenseTripRepository.countByStatus("Completed");
        long submitted = expenseTripRepository.countByApprovalStatus("Submitted");
        long approved = expenseTripRepository.countByApprovalStatus("Approved");
        long rejected = expenseTripRepository.countByApprovalStatus("Rejected");
        return Math.max(0, completed - submitted - approved - rejected);
    }

    private BigDecimal safeSum(BigDecimal val) {
        return val != null ? val : BigDecimal.ZERO;
    }
}
