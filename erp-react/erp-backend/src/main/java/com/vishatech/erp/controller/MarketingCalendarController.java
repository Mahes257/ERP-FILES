package com.vishatech.erp.controller;

import com.vishatech.erp.service.MarketingCalendarService;
import com.vishatech.erp.service.MarketingCalendarService.CalendarEvent;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * Marketing Calendar API — aggregates activities from existing marketing
 * tables into calendar-friendly events. No new database tables are created.
 *
 * GET /marketing/calendar/activities?year=2026&month=8
 * GET /marketing/calendar/today
 * GET /marketing/calendar/summary?year=2026&month=8
 */
@RestController
@RequestMapping("/marketing/calendar")
@PreAuthorize("hasAuthority('MARKETING_VIEW')")
public class MarketingCalendarController {

    private final MarketingCalendarService calendarService;

    public MarketingCalendarController(MarketingCalendarService calendarService) {
        this.calendarService = calendarService;
    }

    /** Get all calendar activities for a given month. */
    @GetMapping("/activities")
    public ResponseEntity<List<CalendarEvent>> getActivities(
            @RequestParam int year,
            @RequestParam int month) {
        return ResponseEntity.ok(calendarService.getActivities(year, month));
    }

    /** Get today's activities. */
    @GetMapping("/today")
    public ResponseEntity<List<CalendarEvent>> getToday() {
        return ResponseEntity.ok(calendarService.getTodaysActivities());
    }

    /** Get summary counts by activity type for a month. */
    @GetMapping("/summary")
    public ResponseEntity<Map<String, Long>> getSummary(
            @RequestParam int year,
            @RequestParam int month) {
        return ResponseEntity.ok(calendarService.getMonthSummary(year, month));
    }
}
