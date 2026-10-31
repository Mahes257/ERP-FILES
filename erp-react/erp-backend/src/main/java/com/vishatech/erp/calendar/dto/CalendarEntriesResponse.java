package com.vishatech.erp.calendar.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * The complete {@code GET /calendar/entries} response.
 *
 * <p>{@code sources} lists the modules actually read for this request (the
 * caller holds that module's view authority). {@code unavailableSources} names
 * the modules whose adapter failed on this request - the remaining entries are
 * still returned, so one broken module cannot blank the whole calendar, and the
 * frontend can say which part is missing instead of implying everything loaded.
 *
 * <p>An empty {@code entries} list is a normal, successful result: it means no
 * record in the requested range has a usable date, not that the call failed.
 */
public record CalendarEntriesResponse(
        LocalDate from,
        LocalDate to,
        List<String> sources,
        List<String> unavailableSources,
        List<CalendarEntry> entries
) {
}
