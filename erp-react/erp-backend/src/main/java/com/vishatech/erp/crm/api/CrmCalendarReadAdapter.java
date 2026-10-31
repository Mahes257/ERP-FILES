package com.vishatech.erp.crm.api;

import com.vishatech.erp.calendar.dto.CalendarEntry;
import com.vishatech.erp.calendar.port.CalendarSourcePort;
import com.vishatech.erp.calendar.port.CalendarTimes;
import com.vishatech.erp.crm.entity.FollowUp;
import com.vishatech.erp.crm.repository.FollowUpRepository;
import com.vishatech.erp.security.Permission;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Root;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;

/**
 * CRM's contribution to {@code GET /calendar/entries}: follow-ups.
 *
 * <p><b>Sources and date semantics (verified in the entity/service code).</b>
 * <ul>
 *   <li><b>{@code FollowUp.followupDate}</b> - the date the follow-up itself is
 *       scheduled. Its stored {@code time} (free text) is used when it can be
 *       normalised; otherwise the entry is all-day. The record's own
 *       {@code status} is published unchanged.</li>
 *   <li><b>{@code FollowUp.nextFollowupDate}</b> - the next action planned while
 *       the follow-up is still {@code Open}. This reuses the CRM module's own
 *       definition of "open" (case-insensitive {@code open}), the same predicate
 *       behind the dashboard's overdue-follow-up count. For a completed or
 *       rescheduled follow-up the next date is history, not an outstanding
 *       action, so it is not published.</li>
 * </ul>
 *
 * <p><b>Exclusions.</b> Soft-deleted follow-ups ({@code status = Deleted},
 * case-insensitive) and archived ones ({@code archivedAt} set) are never
 * returned. Records with a null date simply produce no entry - no date is
 * fabricated.
 *
 * <p><b>What is NOT derived.</b> Overdue is not computed or written: the entry
 * carries the record's real status, and the Calendar shows the date. The CRM
 * module remains the only place that decides what "overdue" means.
 */
@Service
public class CrmCalendarReadAdapter implements CalendarSourcePort {

    static final String SOURCE = "crm";

    private static final String ENTITY_TYPE = "FollowUp";
    private static final String DELETED_LOWER = "deleted";
    private static final String OPEN_LOWER = "open";

    private static final String DATE_FIELD_FOLLOW_UP = "followupDate";
    private static final String DATE_FIELD_NEXT_FOLLOW_UP = "nextFollowupDate";

    private final FollowUpRepository followUpRepository;

    public CrmCalendarReadAdapter(FollowUpRepository followUpRepository) {
        this.followUpRepository = followUpRepository;
    }

    @Override
    public String source() {
        return SOURCE;
    }

    @Override
    public String requiredAuthority() {
        return Permission.CRM_VIEW.name();
    }

    @Override
    public List<CalendarEntry> entriesBetween(LocalDate from, LocalDate to) {
        List<CalendarEntry> entries = new ArrayList<>();

        // One bounded query per date field for the whole range - never one
        // lookup per record.
        for (FollowUp followUp : followUpRepository.findAll(
                visible().and(datesWithin(DATE_FIELD_FOLLOW_UP, from, to)))) {
            entries.add(scheduledEntry(followUp));
        }

        for (FollowUp followUp : followUpRepository.findAll(
                visible().and(isOpen()).and(datesWithin(DATE_FIELD_NEXT_FOLLOW_UP, from, to)))) {
            entries.add(nextActionEntry(followUp));
        }

        return entries;
    }

    private CalendarEntry scheduledEntry(FollowUp followUp) {
        String time = CalendarTimes.normalize(followUp.getTime());
        return entry(
                followUp,
                DATE_FIELD_FOLLOW_UP,
                followUp.getFollowupDate(),
                time,
                // No end time exists on the record; none is invented.
                null);
    }

    private CalendarEntry nextActionEntry(FollowUp followUp) {
        // The stored `time` belongs to followupDate, not to the next action, so
        // the next-action entry is left all-day rather than borrowing it.
        return entry(followUp, DATE_FIELD_NEXT_FOLLOW_UP, followUp.getNextFollowupDate(), null, null);
    }

    private CalendarEntry entry(FollowUp followUp,
                                String dateField,
                                LocalDate date,
                                String startTime,
                                String endTime) {
        String name = firstNonBlank(
                followUp.getCompanyName(),
                followUp.getLeadName(),
                followUp.getContactPerson());
        String title = name == null ? "Follow-up" : "Follow-up - " + name;

        return new CalendarEntry(
                SOURCE + ":" + ENTITY_TYPE + ":" + followUp.getId() + ":" + dateField + ":" + date,
                SOURCE,
                ENTITY_TYPE,
                followUp.getId(),
                title,
                date,
                startTime,
                endTime,
                startTime == null,
                followUp.getStatus(),
                SOURCE,
                "/followups/" + followUp.getId(),
                true);
    }

    /** Neither deleted nor archived. */
    private static Specification<FollowUp> visible() {
        return (root, query, cb) -> cb.and(
                cb.isNull(root.get("archivedAt")),
                cb.or(
                        cb.isNull(root.get("status")),
                        cb.notEqual(cb.lower(root.<String>get("status")), DELETED_LOWER)));
    }

    /** The CRM module's own "open" definition: case-insensitive. */
    private static Specification<FollowUp> isOpen() {
        return (root, query, cb) -> cb.equal(cb.lower(root.<String>get("status")), OPEN_LOWER);
    }

    /** {@code field BETWEEN from AND to} - both ends inclusive. */
    private static Specification<FollowUp> datesWithin(String field, LocalDate from, LocalDate to) {
        return (root, query, cb) -> between(cb, root, field, from, to);
    }

    private static jakarta.persistence.criteria.Predicate between(CriteriaBuilder cb,
                                                                 Root<FollowUp> root,
                                                                 String field,
                                                                 LocalDate from,
                                                                 LocalDate to) {
        Path<LocalDate> path = root.get(field);
        return cb.and(cb.greaterThanOrEqualTo(path, from), cb.lessThanOrEqualTo(path, to));
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }
}
