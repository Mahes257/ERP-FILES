package com.vishatech.erp.service;

import com.vishatech.erp.entity.*;
import com.vishatech.erp.repository.*;
import com.vishatech.erp.util.AuditContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Aggregates marketing activities from multiple existing tables into a unified
 * calendar event format. Does NOT create any new database tables — it reads
 * from: marketing_visits, marketing_follow_ups, questionnaire_forms,
 * marketing_expense_trips, marketing_travel_plans.
 */
@Service
@Transactional(readOnly = true)
public class MarketingCalendarService {

    private final MarketingVisitRepository visitRepository;
    private final MarketingFollowUpRepository followUpRepository;
    private final QuestionnaireFormRepository qFormRepository;
    private final MarketingExpenseTripRepository expenseTripRepository;
    private final MarketingTravelPlanRepository travelPlanRepository;
    private final MarketingVisitActivityRepository activityRepository;
    private final AuditContext auditContext;

    public MarketingCalendarService(
            MarketingVisitRepository visitRepository,
            MarketingFollowUpRepository followUpRepository,
            QuestionnaireFormRepository qFormRepository,
            MarketingExpenseTripRepository expenseTripRepository,
            MarketingTravelPlanRepository travelPlanRepository,
            MarketingVisitActivityRepository activityRepository,
            AuditContext auditContext) {
        this.visitRepository = visitRepository;
        this.followUpRepository = followUpRepository;
        this.qFormRepository = qFormRepository;
        this.expenseTripRepository = expenseTripRepository;
        this.travelPlanRepository = travelPlanRepository;
        this.activityRepository = activityRepository;
        this.auditContext = auditContext;
    }

    /**
     * Return all calendar activities for a given month. Each activity has:
     *   id, type, date, title, subtitle, status, color, linkPath
     *
     * @param year  e.g. 2026
     * @param month 1-12
     */
    public List<CalendarEvent> getActivities(int year, int month) {
        LocalDate start = LocalDate.of(year, month, 1);
        return getActivities(start, start.plusMonths(1).minusDays(1));
    }

    /**
     * The same aggregation over an arbitrary INCLUSIVE day range.
     *
     * <p>Extracted so the ERP-wide calendar feed can reuse this exact mapping
     * without re-implementing it, and so the month endpoint keeps calling the
     * one implementation (its behaviour is unchanged: a month is simply the
     * range from the 1st to the last day). Every rule below is untouched — same
     * repositories, same date fields, same status fallbacks, same travel-plan
     * ownership filter.
     */
    public List<CalendarEvent> getActivities(LocalDate start, LocalDate end) {
        if (start == null || end == null) {
            throw new IllegalArgumentException("A start and end date are required.");
        }
        List<CalendarEvent> events = new ArrayList<>();

        // 1) Visits — use scheduleDate as the calendar date
        List<MarketingVisit> visits = visitRepository.findByScheduleDateBetweenAndDeletedFalse(start, end);
        if (visits == null) visits = Collections.emptyList();
        for (MarketingVisit v : visits) {
            events.add(new CalendarEvent(
                    "visit_" + v.getId(),
                    "visit",
                    v.getScheduleDate(),
                    v.getCompanyName() != null ? v.getCompanyName() : "Visit",
                    v.getMarketer() != null ? v.getMarketer() : "",
                    v.getVisitStatus() != null ? v.getVisitStatus() : "Planned",
                    v.getContactPerson(),
                    v.getLocation(),
                    v.getAppointmentTime(),
                    "/marketing/visits/" + v.getId() + "/edit",
                    v.getId()
            ));
        }

        // 2) Follow-ups — use followupDate as the calendar date
        List<MarketingFollowUp> followUps = followUpRepository.findByFollowupDateBetween(start, end);
        if (followUps == null) followUps = Collections.emptyList();
        for (MarketingFollowUp fu : followUps) {
            String companyName = "";
            // Try to look up the parent visit to get the company name
            if (fu.getVisitId() != null) {
                try {
                    Optional<MarketingVisit> parentVisit = visitRepository.findById(fu.getVisitId());
                    if (parentVisit.isPresent()) {
                        companyName = parentVisit.get().getCompanyName() != null
                                ? parentVisit.get().getCompanyName() : "";
                    }
                } catch (Exception ignored) {}
            }
            events.add(new CalendarEvent(
                    "followup_" + fu.getId(),
                    "followup",
                    fu.getFollowupDate(),
                    !companyName.isEmpty() ? companyName : "Follow-up",
                    fu.getCreatedBy() != null ? fu.getCreatedBy() : "",
                    fu.getStatus() != null ? fu.getStatus() : "Pending",
                    null,
                    null,
                    fu.getTime(),
                    "/marketing",
                    fu.getId()
            ));
        }

        // 3) Q Forms — use dateOfVisit as the calendar date
        List<QuestionnaireForm> qForms = qFormRepository.findByDateOfVisitBetween(start, end);
        if (qForms == null) qForms = Collections.emptyList();
        for (QuestionnaireForm qf : qForms) {
            events.add(new CalendarEvent(
                    "qform_" + qf.getId(),
                    "qform",
                    qf.getDateOfVisit(),
                    qf.getPlantName() != null ? qf.getPlantName() : "Q Form",
                    qf.getMarketer() != null ? qf.getMarketer() : "",
                    qf.getStatus() != null ? qf.getStatus() : "Draft",
                    null,
                    qf.getPlantLocation(),
                    null,
                    "/marketing/q-forms",
                    qf.getId()
            ));
        }

        // 4) Expense Trips — use startDate as the calendar date
        List<MarketingExpenseTrip> expenses = expenseTripRepository.findByStartDateBetween(start, end);
        if (expenses == null) expenses = Collections.emptyList();
        for (MarketingExpenseTrip ex : expenses) {
            String amountStr = "";
            if (ex.getTotalAmount() != null && ex.getTotalAmount().doubleValue() > 0) {
                amountStr = "₹" + String.format("%,.0f", ex.getTotalAmount());
            }
            events.add(new CalendarEvent(
                    "expense_" + ex.getId(),
                    "expense",
                    ex.getStartDate(),
                    ex.getDestination() != null ? ex.getDestination() : "Expense",
                    ex.getMarketer() != null ? ex.getMarketer() : "",
                    ex.getStatus() != null ? ex.getStatus() : "Planned",
                    null,
                    ex.getStartLocation(),
                    ex.getStartTime(),
                    "/marketing/expenses",
                    ex.getId()
            ));
        }

        // 5) Travel Plans — use startDate as the calendar date.
        // A registry is private to the marketer who owns it (TravelPlanService
        // enforces that per record), so this shared month view shows the caller's
        // own registries only — otherwise a coworker's plan title, route and
        // status would leak here. ADMIN/MANAGER still see every registry;
        // anything else, including an unresolved caller, sees none.
        User caller = auditContext.currentUser();
        boolean everyTravelPlan = caller != null
                && (caller.getRole() == UserRole.ADMIN || caller.getRole() == UserRole.MANAGER);
        List<MarketingTravelPlan> travelPlans = travelPlanRepository.findByStartDateBetween(start, end);
        if (travelPlans == null) travelPlans = Collections.emptyList();
        for (MarketingTravelPlan tp : travelPlans) {
            if (!everyTravelPlan
                    && (caller == null || !caller.getId().equals(tp.getMarketerUserId()))) {
                continue;
            }
            events.add(new CalendarEvent(
                    "travelplan_" + tp.getId(),
                    "travel_plan",
                    tp.getStartDate(),
                    tp.getMarketer() != null ? tp.getMarketer() : "Travel Plan",
                    tp.getMarketer() != null ? tp.getMarketer() : "",
                    tp.getStatus() != null ? tp.getStatus() : "Planned",
                    null,
                    tp.getStartingLocation(),
                    null,
                    "/marketing/travel-planners",
                    tp.getId()
            ));
        }

        // 6) Follow-ups & Visit Extensions (from marketing_visit_activities)
        List<MarketingVisitActivity> actList = activityRepository.findByActivityDateBetweenOrderByActivityDateAscIdAsc(start, end);
        if (actList == null) actList = Collections.emptyList();
        for (MarketingVisitActivity act : actList) {
            String type = "followup".equals(act.getActivityType()) ? "followup" : "visit_extension";
            String title = act.getCompanyName() != null ? act.getCompanyName() : ("followup".equals(type) ? "Follow-up" : "Visit Extension");
            events.add(new CalendarEvent(
                    "activity_" + act.getId(),
                    type,
                    act.getActivityDate(),
                    title,
                    act.getAssignedEmployee() != null ? act.getAssignedEmployee() : (act.getCreatedBy() != null ? act.getCreatedBy() : ""),
                    act.getStatus() != null ? act.getStatus() : "Pending",
                    act.getContactName(),
                    null,
                    act.getActivityTime(),
                    "/marketing/follow-ups",
                    act.getId()
            ));
        }

        // Sort by date, then by time
        events.sort((a, b) -> {
            int cmp = a.date().compareTo(b.date());
            if (cmp != 0) return cmp;
            String tA = a.time() != null ? a.time() : "";
            String tB = b.time() != null ? b.time() : "";
            return tA.compareTo(tB);
        });

        return events;
    }

    /**
     * Return today's activities.
     */
    public List<CalendarEvent> getTodaysActivities() {
        LocalDate today = LocalDate.now();
        return getActivities(today.getYear(), today.getMonthValue());
    }

    /**
     * Summary counts by type for a given month (used by sidebar KPIs).
     */
    public Map<String, Long> getMonthSummary(int year, int month) {
        List<CalendarEvent> events = getActivities(year, month);
        return events.stream()
                .collect(Collectors.groupingBy(CalendarEvent::type, Collectors.counting()));
    }

    // ============================== DTO ==============================

    public record CalendarEvent(
            String id,
            String type,
            LocalDate date,
            String title,
            String assignedTo,
            String status,
            String contactPerson,
            String location,
            String time,
            String linkPath,
            Long entityId
    ) {}
}
