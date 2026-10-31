package com.vishatech.erp.service;

import com.vishatech.erp.dto.MarketingDashboardAnalyticsResponse.ActivityItem;
import com.vishatech.erp.dto.MarketingDashboardAnalyticsResponse.ActiveTrip;
import com.vishatech.erp.dto.MarketingDashboardAnalyticsResponse.ExpenseCategory;
import com.vishatech.erp.dto.MarketingDashboardAnalyticsResponse.ExpensesCategoryBreakdown;
import com.vishatech.erp.dto.MarketingDashboardAnalyticsResponse.KpiChange;
import com.vishatech.erp.dto.MarketingDashboardAnalyticsResponse.MoneyKpi;
import com.vishatech.erp.dto.MarketingDashboardAnalyticsResponse.SparklinePoint;
import com.vishatech.erp.dto.MarketingDashboardAnalyticsResponse.Summary;
import com.vishatech.erp.dto.MarketingDashboardAnalyticsResponse.TopPlant;
import com.vishatech.erp.dto.MarketingDashboardAnalyticsResponse.TrendPoint;
import com.vishatech.erp.dto.MarketingDashboardAnalyticsResponse.VisitStatusItem;
import com.vishatech.erp.entity.MarketingExpense;
import com.vishatech.erp.entity.MarketingExpenseTrip;
import com.vishatech.erp.entity.MarketingTravelPlan;
import com.vishatech.erp.entity.MarketingVisit;
import com.vishatech.erp.entity.QuestionnaireForm;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.repository.MarketingExpenseRepository;
import com.vishatech.erp.repository.MarketingExpenseTripRepository;
import com.vishatech.erp.repository.MarketingTravelPlanRepository;
import com.vishatech.erp.repository.MarketingVisitRepository;
import com.vishatech.erp.repository.QuestionnaireFormRepository;
import com.vishatech.erp.util.AuditContext;
import jakarta.persistence.criteria.Predicate;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Marketing Dashboard analytics — every number is computed live from the real
 * marketing data (visits, Q Forms, travel plans and expense trips), scoped to
 * the current user (ADMIN/MANAGER see everything, marketers only their own),
 * and filtered by the optional date range / status / marketer / plant params.
 */
@Service
@Transactional(readOnly = true)
public class MarketingDashboardAnalyticsService {

    private static final DateTimeFormatter SPARKLINE_LABEL = DateTimeFormatter.ofPattern("dd MMM");
    private static final int DEFAULT_RANGE_DAYS = 30;

    private final MarketingVisitRepository visitRepository;
    private final QuestionnaireFormRepository qFormRepository;
    private final MarketingTravelPlanRepository travelPlanRepository;
    private final MarketingExpenseTripRepository expenseTripRepository;
    private final MarketingExpenseRepository expenseRepository;
    private final AuditContext auditContext;

    public MarketingDashboardAnalyticsService(
            MarketingVisitRepository visitRepository,
            QuestionnaireFormRepository qFormRepository,
            MarketingTravelPlanRepository travelPlanRepository,
            MarketingExpenseTripRepository expenseTripRepository,
            MarketingExpenseRepository expenseRepository,
            AuditContext auditContext) {
        this.visitRepository = visitRepository;
        this.qFormRepository = qFormRepository;
        this.travelPlanRepository = travelPlanRepository;
        this.expenseTripRepository = expenseTripRepository;
        this.expenseRepository = expenseRepository;
        this.auditContext = auditContext;
    }

    // ============================== Summary ==============================

    public Summary summary(String from, String to, String marketer, String plant,
                           String visitStatus, String qFormStatus, String tripStatus, String expenseStatus) {
        LocalDate[] range = range(from, to);
        LocalDate f = range[0];
        LocalDate t = range[1];
        long lenDays = f.until(t).getDays() + 1;
        LocalDate pf = f.minusDays(lenDays);
        LocalDate pt = f.minusDays(1);

        List<MarketingVisit> curVisits = visits(f, t, marketer, plant, visitStatus);
        List<MarketingVisit> prevVisits = visits(pf, pt, marketer, plant, visitStatus);

        long totalVisits = curVisits.size();
        long prevTotalVisits = prevVisits.size();
        long plantsVisited = countDistinctPlants(curVisits);
        long prevPlantsVisited = countDistinctPlants(prevVisits);

        long qForms = qForms(f, t, marketer, plant, qFormStatus).size();
        long prevQForms = qForms(pf, pt, marketer, plant, qFormStatus).size();

        List<MarketingExpenseTrip> curTrips = trips(f, t, marketer, tripStatus);
        List<MarketingExpenseTrip> prevTrips = trips(pf, pt, marketer, tripStatus);
        long travelTrips = curTrips.size();
        long prevTravelTrips = prevTrips.size();

        BigDecimal expenses = expenseTotal(f, t, marketer, expenseStatus);
        BigDecimal prevExpenses = expenseTotal(pf, pt, marketer, expenseStatus);

        List<MarketingVisit> last7Visits = visits(t.minusDays(6), t, marketer, plant, visitStatus);
        List<QuestionnaireForm> last7QForms = qForms(t.minusDays(6), t, marketer, plant, qFormStatus);

        List<SparklinePoint> visitsSparkline = new ArrayList<>();
        List<SparklinePoint> plantsSparkline = new ArrayList<>();
        List<SparklinePoint> qFormsSparkline = new ArrayList<>();
        List<SparklinePoint> tripsSparkline = new ArrayList<>();
        List<SparklinePoint> expensesSparkline = new ArrayList<>();
        List<MarketingExpense> last7Expenses = expenses(t.minusDays(6), t, marketer, expenseStatus);
        for (int i = 6; i >= 0; i--) {
            LocalDate day = t.minusDays(i);
            String label = day.format(SPARKLINE_LABEL);
            long dayVisits = last7Visits.stream().filter(v -> day.equals(v.getScheduleDate())).count();
            visitsSparkline.add(new SparklinePoint(label, dayVisits));
            plantsSparkline.add(new SparklinePoint(label,
                    last7Visits.stream().filter(v -> day.equals(v.getScheduleDate()))
                            .map(MarketingVisit::getCompanyName)
                            .filter(name -> name != null && !name.isBlank()).distinct().count()));
            qFormsSparkline.add(new SparklinePoint(label,
                    last7QForms.stream().filter(x -> day.equals(x.getDateOfVisit())).count()));
            tripsSparkline.add(new SparklinePoint(label,
                    trips(day, day, marketer, tripStatus).size()));
            expensesSparkline.add(new SparklinePoint(label,
                    last7Expenses.stream().filter(e -> day.equals(e.getExpenseDate()))
                            .map(e -> e.getAmount() == null ? BigDecimal.ZERO : e.getAmount())
                            .reduce(BigDecimal.ZERO, BigDecimal::add).longValue()));
        }

        return new Summary(
                new KpiChange(totalVisits, prevTotalVisits, pct(totalVisits, prevTotalVisits)),
                new KpiChange(plantsVisited, prevPlantsVisited, pct(plantsVisited, prevPlantsVisited)),
                new KpiChange(qForms, prevQForms, pct(qForms, prevQForms)),
                new KpiChange(travelTrips, prevTravelTrips, pct(travelTrips, prevTravelTrips)),
                new MoneyKpi(expenses, prevExpenses, pct(expenses, prevExpenses)),
                visitsSparkline, plantsSparkline, qFormsSparkline, tripsSparkline, expensesSparkline);
    }

    // ============================== Visits trend ==============================

    public List<TrendPoint> visitsTrend(String from, String to, String marketer, String plant, String visitStatus) {
        LocalDate[] range = range(from, to);
        LocalDate f = range[0];
        LocalDate t = range[1];
        List<MarketingVisit> all = visits(f, t, marketer, plant, visitStatus);

        Map<LocalDate, Long> planned = new LinkedHashMap<>();
        Map<LocalDate, Long> actual = new LinkedHashMap<>();
        Map<LocalDate, Long> completed = new LinkedHashMap<>();
        for (MarketingVisit v : all) {
            bump(planned, v.getScheduleDate());
            if (v.getEntryDateTime() != null) {
                bump(actual, v.getEntryDateTime().toLocalDate());
            }
            LocalDate completedDate = v.getExitDateTime() != null
                    ? v.getExitDateTime().toLocalDate()
                    : ("Completed".equals(v.getVisitStatus()) ? v.getScheduleDate() : null);
            if (completedDate != null) {
                bump(completed, completedDate);
            }
        }

        List<TrendPoint> points = new ArrayList<>();
        LocalDate day = f;
        while (!day.isAfter(t)) {
            points.add(new TrendPoint(day.format(SPARKLINE_LABEL),
                    planned.getOrDefault(day, 0L),
                    actual.getOrDefault(day, 0L),
                    completed.getOrDefault(day, 0L)));
            day = day.plusDays(1);
        }
        return points;
    }

    // ============================== Visit status ==============================

    public List<VisitStatusItem> visitStatus(String from, String to, String marketer, String plant) {
        List<MarketingVisit> all = visits(from, to, marketer, plant, null);
        long completed = 0;
        long ongoing = 0;
        long upcoming = 0;
        long cancelled = 0;
        long other = 0;
        for (MarketingVisit v : all) {
            String s = v.getVisitStatus() == null ? "" : v.getVisitStatus();
            switch (s) {
                case "Completed" -> completed++;
                case "In Progress" -> ongoing++;
                case "Planned", "Scheduled" -> upcoming++;
                case "Cancelled" -> cancelled++;
                default -> other++;
            }
        }
        List<VisitStatusItem> items = new ArrayList<>();
        if (completed > 0) items.add(new VisitStatusItem("Completed", completed));
        if (ongoing > 0) items.add(new VisitStatusItem("Ongoing", ongoing));
        if (upcoming > 0) items.add(new VisitStatusItem("Upcoming", upcoming));
        if (cancelled > 0) items.add(new VisitStatusItem("Cancelled", cancelled));
        if (other > 0) items.add(new VisitStatusItem("Other", other));
        return items;
    }

    // ============================== Recent activities ==============================

    public List<ActivityItem> recentActivities(String from, String to, String marketer, String plant) {
        LocalDate[] range = range(from, to);
        LocalDate f = range[0];
        LocalDate t = range[1];

        List<ActivityItem> activities = new ArrayList<>();
        for (MarketingVisit v : visits(f, t, marketer, plant, null)) {
            String where = firstNonBlank(v.getCompanyName(), v.getLocation(), "Marketing Visit");
            if (inRange(v.getCreatedAt(), f, t)) {
                activities.add(new ActivityItem("visit", "New Marketing Visit",
                        "Visit at " + where,
                        v.getCreatedAt(), "/marketing", "today"));
            }
            if (v.getQFormSubmittedAt() != null && v.getQFormSubmittedAt().toLocalDate().compareTo(f) >= 0
                    && v.getQFormSubmittedAt().toLocalDate().compareTo(t) <= 0) {
                activities.add(new ActivityItem("qform", "Q Form Submitted",
                        "Q Form completed for " + where,
                        v.getQFormSubmittedAt(), "/marketing/q-forms", "Filled & Submitted"));
            }
        }
        for (MarketingTravelPlan p : travelPlans(f, t, marketer)) {
            activities.add(new ActivityItem("travel", "Travel Plan Created",
                    (firstNonBlank(p.getStartingLocation(), "Start") + " → " + firstNonBlank(p.getEndingLocation(), "End"))
                            + (p.getMarketer() == null ? "" : " · " + p.getMarketer()),
                    p.getCreatedAt(), "/marketing/travel-planners", ""));
        }
        for (MarketingExpenseTrip trip : trips(f, t, marketer, null)) {
            activities.add(new ActivityItem("expense", "Expense Trip Created",
                    (firstNonBlank(trip.getDestination(), trip.getStartLocation(), "New trip")) + " · " + trip.getMarketer(),
                    trip.getCreatedAt(), "/marketing/expenses", ""));
            if (trip.getTripOnDateTime() != null && inRange(trip.getTripOnDateTime(), f, t)) {
                activities.add(new ActivityItem("expense", "Expense Trip Started",
                        "Trip ON at " + firstNonBlank(trip.getTripOnLocation(), trip.getStartLocation(), "location"),
                        trip.getTripOnDateTime(), "/marketing/expenses", "Active"));
            }
            if ("Submitted".equals(trip.getApprovalStatus()) && inRange(trip.getUpdatedAt(), f, t)) {
                activities.add(new ActivityItem("expense", "Expense Report Submitted",
                        "Expense report awaiting approval · " + trip.getMarketer(),
                        trip.getUpdatedAt(), "/marketing/expenses", "Submitted"));
            }
        }
        activities.sort(Comparator.comparing(ActivityItem::timestamp, Comparator.nullsLast(Comparator.reverseOrder())));
        return activities;
    }

    // ============================== Top plants ==============================

    public List<TopPlant> topPlants(String from, String to, String marketer, String plant, String qFormStatus,
                                    int limit) {
        LocalDate[] range = range(from, to);
        LocalDate f = range[0];
        LocalDate t = range[1];
        List<MarketingVisit> all = visits(f, t, marketer, plant, null);

        Map<String, Long> visitCount = new LinkedHashMap<>();
        Map<String, Long> qFormCount = new LinkedHashMap<>();
        Map<Long, String> visitCompanies = new LinkedHashMap<>();
        for (MarketingVisit v : all) {
            String name = v.getCompanyName();
            if (name == null || name.isBlank()) {
                continue;
            }
            visitCompanies.put(v.getId(), name);
            visitCount.merge(name, 1L, Long::sum);
        }
        for (QuestionnaireForm form : qForms(f, t, marketer, null, qFormStatus)) {
            String company = visitCompanies.get(form.getVisitId());
            if (company != null) {
                qFormCount.merge(company, 1L, Long::sum);
            }
        }

        List<TopPlant> rows = new ArrayList<>();
        for (Map.Entry<String, Long> e : visitCount.entrySet()) {
            long visits = e.getValue();
            long qFormsCnt = qFormCount.getOrDefault(e.getKey(), 0L);
            int completion = visits == 0 ? 0
                    : (int) Math.min(100, Math.round(qFormsCnt * 100.0 / visits));
            rows.add(new TopPlant(e.getKey(), visits, qFormsCnt, completion));
        }
        rows.sort(Comparator.comparingLong(TopPlant::visits).reversed());
        return rows.subList(0, Math.min(limit, rows.size()));
    }

    // ============================== Expenses by category ==============================

    public ExpensesCategoryBreakdown expensesByCategory(String from, String to, String marketer, String expenseStatus) {
        LocalDate[] range = range(from, to);
        LocalDate f = range[0];
        LocalDate t = range[1];

        List<MarketingExpense> expenses = expenses(f, t, marketer, expenseStatus);
        BigDecimal withBill = BigDecimal.ZERO;
        BigDecimal withoutBill = BigDecimal.ZERO;
        Map<String, Long> counts = new LinkedHashMap<>();
        Map<String, BigDecimal> amounts = new LinkedHashMap<>();
        List<String> order = List.of("Travel", "Stay", "Food", "Other");
        for (String cat : order) {
            counts.put(cat, 0L);
            amounts.put(cat, BigDecimal.ZERO);
        }
        BigDecimal total = BigDecimal.ZERO;
        for (MarketingExpense e : expenses) {
            BigDecimal amt = e.getAmount() == null ? BigDecimal.ZERO : e.getAmount();
            total = total.add(amt);
            if ("WITH BILL".equals(e.getBillStatus())) {
                withBill = withBill.add(amt);
            } else {
                withoutBill = withoutBill.add(amt);
            }
            String cat = categoryOf(e.getExpenseType());
            counts.put(cat, counts.getOrDefault(cat, 0L) + 1);
            amounts.put(cat, amounts.getOrDefault(cat, BigDecimal.ZERO).add(amt));
        }
        List<ExpenseCategory> categories = new ArrayList<>();
        for (String cat : order) {
            if (counts.getOrDefault(cat, 0L) > 0) {
                categories.add(new ExpenseCategory(cat, counts.get(cat), amounts.get(cat)));
            }
        }
        return new ExpensesCategoryBreakdown(total, withBill, withoutBill, categories);
    }

    // ============================== Active trips ==============================

    public List<ActiveTrip> activeTrips(String from, String to, String marketer) {
        List<MarketingExpenseTrip> active = expenseTripRepository.findByStatusOrderByCreatedAtDesc("Active");
        LocalDate[] range = range(from, to);
        LocalDate f = range[0];
        LocalDate t = range[1];

        List<ActiveTrip> rows = new ArrayList<>();
        for (MarketingExpenseTrip trip : active) {
            if (trip.isDeleted() || !canSeeTrip(trip, marketer, f, t)) {
                continue;
            }
            rows.add(new ActiveTrip(
                    tripNo(trip.getId(), trip.getCreatedAt()),
                    trip.getMarketer(),
                    firstNonBlank(trip.getTripOnLocation(), trip.getStartLocation(), "—"),
                    firstNonBlank(trip.getDestination(), "—"),
                    trip.getStatus(),
                    trip.getStartDate()));
        }
        return rows.subList(0, Math.min(10, rows.size()));
    }

    // ============================== Data fetchers ==============================

    private List<MarketingVisit> visits(String from, String to, String marketer, String plant, String visitStatus) {
        LocalDate[] range = range(from, to);
        return visits(range[0], range[1], marketer, plant, visitStatus);
    }

    private List<MarketingVisit> visits(LocalDate from, LocalDate to, String marketer, String plant, String visitStatus) {
        return visitRepository.findAll(visitSpec(from, to, marketer, plant, visitStatus));
    }

    private Specification<MarketingVisit> visitSpec(LocalDate from, LocalDate to, String marketer,
                                                    String plant, String visitStatus) {
        return (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            ps.add(cb.isFalse(root.get("deleted")));
            ps.add(cb.between(root.get("scheduleDate"), from, to));
            Long owner = scopeOwnerId();
            if (owner != null) {
                ps.add(cb.equal(root.get("marketerUserId"), owner));
            } else if (hasText(marketer)) {
                ps.add(cb.equal(root.get("marketer"), marketer));
            }
            if (hasText(plant)) {
                ps.add(cb.like(cb.lower(root.get("companyName")), "%" + plant.toLowerCase() + "%"));
            }
            if (hasText(visitStatus)) {
                ps.add(cb.equal(root.get("visitStatus"), visitStatus));
            }
            return cb.and(ps.toArray(new Predicate[0]));
        };
    }

    private List<QuestionnaireForm> qForms(LocalDate from, LocalDate to, String marketer, String plant, String qFormStatus) {
        Specification<QuestionnaireForm> spec = (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            ps.add(cb.between(root.get("dateOfVisit"), from, to));
            Long owner = scopeOwnerId();
            if (owner != null) {
                ps.add(cb.equal(root.get("marketerUserId"), owner));
            } else if (hasText(marketer)) {
                ps.add(cb.equal(root.get("marketer"), marketer));
            }
            if (hasText(plant)) {
                ps.add(cb.like(cb.lower(root.get("plantName")), "%" + plant.toLowerCase() + "%"));
            }
            if (hasText(qFormStatus)) {
                ps.add(cb.equal(root.get("status"), qFormStatus));
            }
            return cb.and(ps.toArray(new Predicate[0]));
        };
        return qFormRepository.findAll(spec);
    }

    private List<MarketingTravelPlan> travelPlans(LocalDate from, LocalDate to, String marketer) {
        Specification<MarketingTravelPlan> spec = (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            ps.add(cb.isFalse(root.get("deleted")));
            ps.add(cb.between(root.get("createdAt"), from.atStartOfDay(), to.plusDays(1).atStartOfDay()));
            Long owner = scopeOwnerId();
            if (owner != null) {
                ps.add(cb.equal(root.get("marketerUserId"), owner));
            } else if (hasText(marketer)) {
                ps.add(cb.equal(root.get("marketer"), marketer));
            }
            return cb.and(ps.toArray(new Predicate[0]));
        };
        return travelPlanRepository.findAll(spec);
    }

    private List<MarketingExpenseTrip> trips(LocalDate from, LocalDate to, String marketer, String tripStatus) {
        Specification<MarketingExpenseTrip> spec = (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            ps.add(cb.isFalse(root.get("deleted")));
            ps.add(cb.or(
                    cb.between(root.get("startDate"), from, to),
                    cb.between(root.get("createdAt"), from.atStartOfDay(), to.plusDays(1).atStartOfDay())));
            Long owner = scopeOwnerId();
            if (owner != null) {
                ps.add(cb.equal(root.get("marketerUserId"), owner));
            } else if (hasText(marketer)) {
                ps.add(cb.equal(root.get("marketer"), marketer));
            }
            if (hasText(tripStatus)) {
                ps.add(cb.equal(root.get("status"), tripStatus));
            }
            return cb.and(ps.toArray(new Predicate[0]));
        };
        return expenseTripRepository.findAll(spec);
    }

    private List<MarketingExpense> expenses(LocalDate from, LocalDate to, String marketer, String expenseStatus) {
        List<MarketingExpenseTrip> scopedTrips = scopedTripIds(marketer);
        List<Long> ids = scopedTrips.stream().map(MarketingExpenseTrip::getId).toList();
        if (ids.isEmpty()) {
            return List.of();
        }
        List<MarketingExpense> all = expenseRepository.findByTripIdIn(ids);
        List<MarketingExpense> matched = new ArrayList<>();
        for (MarketingExpense e : all) {
            if (e.getExpenseDate() == null
                    || e.getExpenseDate().isBefore(from)
                    || e.getExpenseDate().isAfter(to)) {
                continue;
            }
            if (hasText(expenseStatus) && !expenseStatus.equalsIgnoreCase(e.getBillStatus())) {
                continue;
            }
            matched.add(e);
        }
        return matched;
    }

    /** Trip rows usable as an ownership scope for expenses (all trips for admin, own trips otherwise). */
    private List<MarketingExpenseTrip> scopedTripIds(String marketer) {
        Long owner = scopeOwnerId();
        if (owner != null) {
            return expenseTripRepository.findByMarketerUserIdOrderByCreatedAtDesc(owner);
        }
        if (hasText(marketer)) {
            return expenseTripRepository.findByMarketerOrderByCreatedAtDesc(marketer);
        }
        return expenseTripRepository.findAll();
    }

    private BigDecimal expenseTotal(LocalDate from, LocalDate to, String marketer, String expenseStatus) {
        BigDecimal total = BigDecimal.ZERO;
        for (MarketingExpense e : expenses(from, to, marketer, expenseStatus)) {
            total = total.add(e.getAmount() == null ? BigDecimal.ZERO : e.getAmount());
        }
        return total;
    }

    private boolean canSeeTrip(MarketingExpenseTrip trip, String marketer, LocalDate from, LocalDate to) {
        Long owner = scopeOwnerId();
        if (owner != null && !owner.equals(trip.getMarketerUserId())) {
            return false;
        }
        if (owner == null && hasText(marketer) && !marketer.equals(trip.getMarketer())) {
            return false;
        }
        if (trip.getStartDate() == null) {
            return trip.getCreatedAt() != null
                    && !trip.getCreatedAt().toLocalDate().isBefore(from)
                    && !trip.getCreatedAt().toLocalDate().isAfter(to);
        }
        return !trip.getStartDate().isBefore(from) && !trip.getStartDate().isAfter(to);
    }

    // ============================== Helpers ==============================

    private String categoryOf(String expenseType) {
        if (expenseType == null) {
            return "Other";
        }
        if (expenseType.contains("Travel") || expenseType.contains("Local Travel")) {
            return "Travel";
        }
        if (expenseType.contains("Stay")) {
            return "Stay";
        }
        if (expenseType.contains("Food")) {
            return "Food";
        }
        return "Other";
    }

    private long countDistinctPlants(List<MarketingVisit> visits) {
        return visits.stream().map(MarketingVisit::getCompanyName)
                .filter(name -> name != null && !name.isBlank())
                .distinct().count();
    }

    private void bump(Map<LocalDate, Long> map, LocalDate key) {
        if (key != null) {
            map.merge(key, 1L, Long::sum);
        }
    }

    private boolean inRange(LocalDateTime when, LocalDate from, LocalDate to) {
        if (when == null) {
            return false;
        }
        LocalDate d = when.toLocalDate();
        return !d.isBefore(from) && !d.isAfter(to);
    }

    private String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                return v;
            }
        }
        return null;
    }

    private boolean hasText(String s) {
        return s != null && !s.isBlank();
    }

    private Long scopeOwnerId() {
        User user = auditContext.currentUser();
        if (user == null) {
            return null;
        }
        if (user.getRole() == UserRole.ADMIN || user.getRole() == UserRole.MANAGER) {
            return null;
        }
        return user.getId();
    }

    private LocalDate[] range(String from, String to) {
        LocalDate f = parse(from);
        LocalDate t = parse(to);
        LocalDate today = LocalDate.now();
        if (f == null && t == null) {
            f = today.minusDays(DEFAULT_RANGE_DAYS - 1);
            t = today;
        } else if (f == null) {
            f = t.minusDays(DEFAULT_RANGE_DAYS - 1);
        } else if (t == null) {
            t = f.plusDays(DEFAULT_RANGE_DAYS - 1);
        }
        if (f.isAfter(t)) {
            LocalDate tmp = f;
            f = t;
            t = tmp;
        }
        return new LocalDate[]{f, t};
    }

    private LocalDate parse(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(s.trim());
        } catch (Exception ex) {
            return null;
        }
    }

    private int pct(long current, long previous) {
        if (previous == 0) {
            return current > 0 ? 100 : 0;
        }
        return (int) Math.round((double) (current - previous) / previous * 100);
    }

    private int pct(BigDecimal current, BigDecimal previous) {
        if (previous == null || previous.signum() == 0) {
            return current.signum() > 0 ? 100 : 0;
        }
        return (int) Math.round(current.subtract(previous)
                .divide(previous, 2, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100)).doubleValue());
    }

    private String tripNo(Long id, java.time.LocalDateTime createdAt) {
        if (id == null) {
            return "ME-";
        }
        int year = createdAt == null ? java.time.Year.now().getValue() : createdAt.getYear();
        return "ME-" + year + "-" + String.format("%04d", id);
    }
}