package com.vishatech.erp.calendar.service;

import com.vishatech.erp.calendar.dto.CalendarEntriesResponse;
import com.vishatech.erp.calendar.dto.CalendarEntry;
import com.vishatech.erp.calendar.port.CalendarSourcePort;
import com.vishatech.erp.exception.BadRequestException;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read-only aggregation for {@code GET /calendar/entries}.
 *
 * <p><b>What it does.</b> Validates the requested range, reads every module's
 * {@link CalendarSourcePort} the caller is allowed to see, drops anything that
 * is not a usable entry, merges and sorts the result. It holds no SQL, no
 * entity, no repository and no transaction of its own: each module reads its own
 * tables and hands back calendar-owned records, exactly like the ERP dashboard's
 * aggregation service.
 *
 * <p><b>What it deliberately does not do.</b> It never writes, never creates a
 * Calendar persistence row, never changes a source record's status and never
 * derives a business state (such as "overdue") that the owning module does not
 * already define. Entries are read-only projections.
 *
 * <p><b>Failure isolation.</b> A module adapter that throws does not fail the
 * request: the other modules' entries are still returned and the failing source
 * is reported in {@code unavailableSources}, so the UI can be honest about what
 * is missing instead of showing an empty calendar.
 *
 * <p><b>Range cap.</b> The range is capped at {@value #MAX_RANGE_DAYS} inclusive
 * days. The Calendar only ever shows a month grid (42 days), a week or a day, so
 * a wider request is a caller bug rather than a legitimate one, and the cap
 * keeps a typo like a ten-year range from turning into a full-table scan.
 */
@Service
@Transactional(readOnly = true)
public class CalendarAggregationService {

    private static final Logger log = LoggerFactory.getLogger(CalendarAggregationService.class);

    /** Largest supported inclusive range: a six-week month grid plus margin. */
    public static final int MAX_RANGE_DAYS = 92;

    /**
     * Display order: date, then all-day entries before timed ones, then time,
     * then title, then the stable id so the output is deterministic.
     */
    private static final Comparator<CalendarEntry> ENTRY_ORDER =
            Comparator.comparing(CalendarEntry::date)
                    .thenComparing(entry -> entry.startTime() == null ? "" : entry.startTime())
                    .thenComparing(entry -> entry.title() == null ? "" : entry.title())
                    .thenComparing(CalendarEntry::id);

    private final List<CalendarSourcePort> sourcePorts;

    public CalendarAggregationService(List<CalendarSourcePort> sourcePorts) {
        this.sourcePorts = sourcePorts;
    }

    /** The merged, sorted, read-only entries for one validated range. */
    public CalendarEntriesResponse entries(LocalDate from, LocalDate to) {
        validateRange(from, to);

        Set<String> authorities = callerAuthorities();
        List<String> sources = new ArrayList<>();
        List<String> unavailable = new ArrayList<>();
        List<CalendarEntry> entries = new ArrayList<>();

        sourcePorts.stream()
                .sorted(Comparator.comparing(CalendarSourcePort::source))
                .forEach(port -> {
                    // A module the caller cannot view is not read at all - it is
                    // never queried and then filtered, so no record is loaded
                    // into memory for a user who may not see it.
                    if (!authorities.contains(port.requiredAuthority())) {
                        return;
                    }
                    sources.add(port.source());
                    try {
                        entries.addAll(port.entriesBetween(from, to));
                    } catch (RuntimeException ex) {
                        // One module failing must not blank the whole calendar.
                        log.warn("Calendar source '{}' failed for {}..{}: {}",
                                port.source(), from, to, ex.toString());
                        unavailable.add(port.source());
                    }
                });

        List<CalendarEntry> usable = entries.stream()
                .filter(entry -> entry != null && entry.id() != null && !entry.id().isBlank())
                .filter(entry -> entry.date() != null)
                // Defensive: an adapter must already honour the range, and a
                // stray entry is dropped rather than shown on a day the caller
                // did not ask for.
                .filter(entry -> !entry.date().isBefore(from) && !entry.date().isAfter(to))
                .sorted(ENTRY_ORDER)
                .toList();

        return new CalendarEntriesResponse(from, to, List.copyOf(sources), List.copyOf(unavailable), usable);
    }

    /** Shared validation so the controller stays a thin mapping layer. */
    public static void validateRange(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new BadRequestException("Both 'from' and 'to' dates are required (YYYY-MM-DD).");
        }
        if (from.isAfter(to)) {
            throw new BadRequestException("'from' must be on or before 'to'.");
        }
        long days = ChronoUnit.DAYS.between(from, to) + 1;
        if (days > MAX_RANGE_DAYS) {
            throw new BadRequestException("The date range must not exceed " + MAX_RANGE_DAYS + " days.");
        }
    }

    /** Authorities of the authenticated caller; empty when unauthenticated. */
    private static Set<String> callerAuthorities() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return Set.of();
        }
        return authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.toSet());
    }
}
