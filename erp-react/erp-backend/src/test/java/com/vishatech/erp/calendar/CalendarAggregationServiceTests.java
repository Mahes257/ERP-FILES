package com.vishatech.erp.calendar;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.vishatech.erp.calendar.dto.CalendarEntriesResponse;
import com.vishatech.erp.calendar.dto.CalendarEntry;
import com.vishatech.erp.calendar.port.CalendarSourcePort;
import com.vishatech.erp.calendar.service.CalendarAggregationService;
import com.vishatech.erp.exception.BadRequestException;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * The aggregation rules that do not need a database: range validation, module
 * permission filtering, deterministic ordering, out-of-range rejection and
 * per-module failure isolation.
 *
 * <p>These are the behaviours an adapter must be able to rely on, tested with
 * stub ports so a failure points at the aggregation itself rather than at a
 * module's SQL.
 */
class CalendarAggregationServiceTests {

    private static final LocalDate FROM = LocalDate.of(2026, 10, 1);
    private static final LocalDate TO = LocalDate.of(2026, 10, 31);

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void rejectsMissingInvertedAndOversizedRanges() {
        CalendarAggregationService service = new CalendarAggregationService(List.of());

        assertThatThrownBy(() -> service.entries(null, TO))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("required");
        assertThatThrownBy(() -> service.entries(FROM, null))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("required");
        assertThatThrownBy(() -> service.entries(TO, FROM))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("on or before");
        assertThatThrownBy(() -> service.entries(FROM, FROM.plusDays(
                CalendarAggregationService.MAX_RANGE_DAYS)))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("must not exceed");
    }

    @Test
    void acceptsARangeExactlyAtTheCap() {
        authenticate("MARKETING_VIEW");
        CalendarAggregationService service = new CalendarAggregationService(List.of(
                stub("marketing", "MARKETING_VIEW", List.of())));

        CalendarEntriesResponse response = service.entries(
                FROM, FROM.plusDays(CalendarAggregationService.MAX_RANGE_DAYS - 1L));

        assertThat(response.entries()).isEmpty();
        assertThat(response.sources()).containsExactly("marketing");
    }

    @Test
    void readsOnlyModulesTheCallerMayViewAndReportsThem() {
        authenticate("CRM_VIEW");
        CalendarSourcePort crm = stub("crm", "CRM_VIEW", List.of(entry("crm:1", TO)));
        CalendarSourcePort marketing = stub("marketing", "MARKETING_VIEW", List.of(entry("marketing:1", TO)));
        CalendarAggregationService service = new CalendarAggregationService(List.of(marketing, crm));

        CalendarEntriesResponse response = service.entries(FROM, TO);

        assertThat(response.sources()).containsExactly("crm");
        assertThat(response.entries()).extracting(CalendarEntry::id).containsExactly("crm:1");
    }

    @Test
    void unauthenticatedCallerReadsNoModule() {
        CalendarAggregationService service = new CalendarAggregationService(List.of(
                stub("crm", "CRM_VIEW", List.of(entry("crm:1", TO)))));

        CalendarEntriesResponse response = service.entries(FROM, TO);

        assertThat(response.sources()).isEmpty();
        assertThat(response.entries()).isEmpty();
    }

    @Test
    void ordersByDateThenAllDayBeforeTimedThenTitle() {
        authenticate("CRM_VIEW");
        CalendarSourcePort crm = stub("crm", "CRM_VIEW", List.of(
                timed("crm:late-time", TO, "14:00", "Zeta"),
                entry("crm:later-day", TO.plusDays(1), "Alpha"),
                entry("crm:all-day", TO, "All day"),
                timed("crm:early-time", TO, "09:00", "Beta")));
        CalendarAggregationService service = new CalendarAggregationService(List.of(crm));

        List<String> ids = service.entries(FROM, TO.plusDays(2)).entries()
                .stream().map(CalendarEntry::id).toList();

        assertThat(ids).containsExactly(
                "crm:all-day", "crm:early-time", "crm:late-time", "crm:later-day");
    }

    @Test
    void dropsEntriesOutsideTheRequestedRange() {
        authenticate("CRM_VIEW");
        CalendarSourcePort crm = stub("crm", "CRM_VIEW", List.of(
                entry("crm:inside", FROM),
                entry("crm:before", FROM.minusDays(1)),
                entry("crm:after", TO.plusDays(1))));
        CalendarAggregationService service = new CalendarAggregationService(List.of(crm));

        assertThat(service.entries(FROM, TO).entries())
                .extracting(CalendarEntry::id)
                .containsExactly("crm:inside");
    }

    @Test
    void oneFailingModuleDoesNotBlankTheRest() {
        authenticate("CRM_VIEW", "MARKETING_VIEW");
        CalendarSourcePort broken = new CalendarSourcePort() {
            @Override
            public String source() {
                return "marketing";
            }

            @Override
            public String requiredAuthority() {
                return "MARKETING_VIEW";
            }

            @Override
            public List<CalendarEntry> entriesBetween(LocalDate from, LocalDate to) {
                throw new IllegalStateException("marketing unavailable");
            }
        };
        CalendarSourcePort crm = stub("crm", "CRM_VIEW", List.of(entry("crm:1", TO)));
        CalendarAggregationService service = new CalendarAggregationService(List.of(broken, crm));

        CalendarEntriesResponse response = service.entries(FROM, TO);

        assertThat(response.entries()).extracting(CalendarEntry::id).containsExactly("crm:1");
        assertThat(response.sources()).containsExactly("crm", "marketing");
        assertThat(response.unavailableSources()).containsExactly("marketing");
    }

    private static void authenticate(String... authorities) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        "calendar-test@example.com",
                        null,
                        java.util.Arrays.stream(authorities)
                                .map(SimpleGrantedAuthority::new)
                                .toList()));
    }

    private static CalendarSourcePort stub(String source, String authority, List<CalendarEntry> entries) {
        return new CalendarSourcePort() {
            @Override
            public String source() {
                return source;
            }

            @Override
            public String requiredAuthority() {
                return authority;
            }

            @Override
            public List<CalendarEntry> entriesBetween(LocalDate from, LocalDate to) {
                return entries;
            }
        };
    }

    private static CalendarEntry entry(String id, LocalDate date) {
        return entry(id, date, id);
    }

    private static CalendarEntry entry(String id, LocalDate date, String title) {
        return new CalendarEntry(id, "crm", "FollowUp", 1L, title, date,
                null, null, true, "Open", "crm", "/followups/1", true);
    }

    private static CalendarEntry timed(String id, LocalDate date, String start, String title) {
        return new CalendarEntry(id, "crm", "FollowUp", 2L, title, date,
                start, null, false, "Open", "crm", "/followups/2", true);
    }
}
