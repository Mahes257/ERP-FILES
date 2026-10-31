package com.vishatech.erp.marketing.api;

import com.vishatech.erp.calendar.dto.CalendarEntry;
import com.vishatech.erp.calendar.port.CalendarSourcePort;
import com.vishatech.erp.calendar.port.CalendarTimes;
import com.vishatech.erp.security.Permission;
import com.vishatech.erp.service.MarketingCalendarService;
import com.vishatech.erp.service.MarketingCalendarService.CalendarEvent;
import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * Marketing's contribution to {@code GET /calendar/entries}.
 *
 * <p><b>Reuse, not reimplementation.</b> Every entry here comes from
 * {@link MarketingCalendarService} - the exact service behind the existing
 * {@code /marketing/calendar/activities} endpoint - so the same six sources
 * (visits, follow-ups, Q-forms, expense trips, travel plans and visit
 * activities), the same date fields, the same status fallbacks and the same
 * travel-plan ownership filter apply. This adapter only renames the payload into
 * the shared calendar shape and adds the deterministic id/dedupe key.
 *
 * <p><b>Not widened.</b> The service is called with the same authority the
 * Marketing calendar itself requires ({@code MARKETING_VIEW}); the aggregation
 * service only invokes this adapter when the caller holds it.
 */
@Service
public class MarketingCalendarReadAdapter implements CalendarSourcePort {

    static final String SOURCE = "marketing";

    /** Marketing's own date field per activity type - used in the entry id. */
    private static final String DATE_FIELD_VISIT = "scheduleDate";
    private static final String DATE_FIELD_FOLLOW_UP = "followupDate";
    private static final String DATE_FIELD_Q_FORM = "dateOfVisit";
    private static final String DATE_FIELD_TRIP = "startDate";
    private static final String DATE_FIELD_ACTIVITY = "activityDate";

    private final MarketingCalendarService calendarService;

    public MarketingCalendarReadAdapter(MarketingCalendarService calendarService) {
        this.calendarService = calendarService;
    }

    @Override
    public String source() {
        return SOURCE;
    }

    @Override
    public String requiredAuthority() {
        return Permission.MARKETING_VIEW.name();
    }

    @Override
    public List<CalendarEntry> entriesBetween(LocalDate from, LocalDate to) {
        return calendarService.getActivities(from, to).stream()
                .map(this::toEntry)
                .toList();
    }

    private CalendarEntry toEntry(CalendarEvent event) {
        String entityType = entityTypeFor(event.type());
        String dateField = dateFieldFor(event.type());
        String entityKey = event.entityId() != null ? String.valueOf(event.entityId()) : event.id();
        String time = CalendarTimes.normalize(event.time());

        return new CalendarEntry(
                SOURCE + ":" + entityType + ":" + entityKey + ":" + dateField + ":" + event.date(),
                SOURCE,
                entityType,
                event.entityId(),
                event.title() != null && !event.title().isBlank() ? event.title() : "Marketing activity",
                event.date(),
                time,
                // Marketing stores a start time only; no end time is invented.
                null,
                time == null,
                event.status(),
                SOURCE,
                event.linkPath(),
                true);
    }

    /** The concrete Marketing table behind the aggregation's activity type. */
    private static String entityTypeFor(String type) {
        return switch (type == null ? "" : type) {
            case "visit" -> "MarketingVisit";
            case "followup" -> "MarketingFollowUp";
            case "qform" -> "QuestionnaireForm";
            case "expense" -> "MarketingExpenseTrip";
            case "travel_plan" -> "MarketingTravelPlan";
            case "visit_extension", "activity" -> "MarketingVisitActivity";
            default -> "MarketingActivity";
        };
    }

    private static String dateFieldFor(String type) {
        return switch (type == null ? "" : type) {
            case "visit" -> DATE_FIELD_VISIT;
            case "followup" -> DATE_FIELD_FOLLOW_UP;
            case "qform" -> DATE_FIELD_Q_FORM;
            case "expense", "travel_plan" -> DATE_FIELD_TRIP;
            case "visit_extension", "activity" -> DATE_FIELD_ACTIVITY;
            default -> "activityDate";
        };
    }
}
