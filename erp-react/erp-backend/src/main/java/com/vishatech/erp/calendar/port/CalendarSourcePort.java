package com.vishatech.erp.calendar.port;

import com.vishatech.erp.calendar.dto.CalendarEntry;
import java.time.LocalDate;
import java.util.List;

/**
 * The Calendar's read view of one business module.
 *
 * <p><b>Ownership.</b> This interface is calendar business - it says what the
 * calendar needs, not what a module looks like. The implementation lives inside
 * the module that owns the data (for example
 * {@code com.vishatech.erp.crm.api.CrmCalendarReadAdapter}), so entity and
 * repository classes never leave their module.
 *
 * <p><b>Contract.</b> The signature names only {@link CalendarEntry} and JDK
 * types. An implementation returns entries whose dates fall inside
 * {@code [from, to]} (both inclusive), applies its module's own soft-delete /
 * archive / ownership rules, and skips records without a usable date instead of
 * inventing one.
 *
 * <p><b>Read-only.</b> An implementation must not write, count-audit or
 * otherwise modify the records it reads.
 */
public interface CalendarSourcePort {

    /** Stable module key used in the entry id and the response's source lists. */
    String source();

    /** Authority the caller must hold for this module to be read at all. */
    String requiredAuthority();

    /** Entries dated inside {@code [from, to]}, both inclusive. */
    List<CalendarEntry> entriesBetween(LocalDate from, LocalDate to);
}
