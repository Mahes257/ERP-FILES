package com.vishatech.erp.cpr.api;

import com.vishatech.erp.calendar.dto.CalendarEntry;
import com.vishatech.erp.calendar.port.CalendarSourcePort;
import com.vishatech.erp.entity.Cpr;
import com.vishatech.erp.entity.CprStatus;
import com.vishatech.erp.repository.CprRepository;
import com.vishatech.erp.security.Permission;
import com.vishatech.erp.service.CprService;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * CPR's contribution to {@code GET /calendar/entries}.
 *
 * <p><b>Published dates (verified in the entity, the form and the service).</b>
 *
 * <ul>
 *   <li><b>{@code Cpr.requiredDate}</b> - the "Required Date" the CPR form marks
 *       required and persists through {@code CprService.parseDate}, which stores a
 *       date-only value at midnight. {@code AddCpr} also refuses a required date
 *       earlier than the CPR's own document date, so this is a forward-looking
 *       commitment rather than a document date.</li>
 *   <li><b>the effective quotation deadline</b> - {@code extendedDeadline} when
 *       it is set, otherwise {@code quotationDeadline}: the module's own
 *       "Effective Quotation Deadline" (an extension deliberately keeps the
 *       original intact). Exactly <b>one</b> deadline entry is published per CPR,
 *       so an extended deadline never appears twice, and a CPR with neither field
 *       populated produces no deadline entry at all - no date is fabricated.</li>
 * </ul>
 *
 * <p><b>Deliberately not published.</b> {@code prDate} is the CPR document date
 * (the form defaults it to today), and {@code submittedAt}, {@code approvalDate},
 * {@code floatedAt}, {@code createdAt}, {@code updatedAt} and {@code revisionDate}
 * record actions that already happened - none of them is a deadline or a
 * scheduled action. {@code CprTechnicalVerification.verificationDate} is written
 * as {@code LocalDate.now()} when verification completes, and its
 * {@code nextReviewDate} has no read-only per-record page (the module exposes a
 * list only), so neither is published.
 *
 * <p><b>Visibility.</b> Only the current row of each revision chain is read -
 * reusing {@link CprService#latestPerChainPredicate} rather than re-implementing
 * the rule - and rows whose stored status is {@code ARCHIVED} or {@code DELETED}
 * are excluded, exactly as {@code CprService}'s list and stats do. Draft CPRs are
 * published when they carry a real date: the module's own list rule treats
 * {@code DRAFT} as an active, visible record (it excludes only archived and
 * deleted rows), and the required date is a genuine customer commitment entered
 * on the form. No "overdue" state is derived anywhere - CPR defines none.
 *
 * <p><b>Converted CPRs.</b> A {@code CONVERTED} CPR has already produced a
 * Quotation, and that quotation's dates are published by the Sales calendar feed;
 * publishing the CPR's quotation deadline as well would draw one business date
 * twice, so the deadline entry is skipped for converted CPRs. The CPR's own
 * required date is still published - it is the customer's requirement, not the
 * quotation's deadline, so it is not a duplicate of anything downstream.
 *
 * <p><b>Read-only.</b> Nothing is written, counted or audited here; every entry
 * links to the CPR module's own view page, where its workflow and permissions
 * apply.
 */
@Service
public class CprCalendarReadAdapter implements CalendarSourcePort {

    static final String SOURCE = "cpr";

    /** The Calendar category key for the CPR area. */
    private static final String CATEGORY = SOURCE;

    /** Source entity type - the CPR entity's own name. */
    private static final String ENTITY_TYPE = "Cpr";

    private static final String FIELD_REQUIRED_DATE = "requiredDate";
    private static final String FIELD_EXTENDED_DEADLINE = "extendedDeadline";
    private static final String FIELD_QUOTATION_DEADLINE = "quotationDeadline";

    /** The date-field name published for the resolved (effective) deadline. */
    private static final String FIELD_EFFECTIVE_DEADLINE = "effectiveDeadline";

    private static final String KIND_REQUIRED = "Required by";
    private static final String KIND_DEADLINE = "Quotation deadline";

    private final CprRepository cprRepository;

    public CprCalendarReadAdapter(CprRepository cprRepository) {
        this.cprRepository = cprRepository;
    }

    @Override
    public String source() {
        return SOURCE;
    }

    @Override
    public String requiredAuthority() {
        return Permission.CPR_VIEW.name();
    }

    @Override
    @Transactional(readOnly = true)
    public List<CalendarEntry> entriesBetween(LocalDate from, LocalDate to) {
        // One entry per source record + date field, keyed by the published id, so
        // a duplicate query row can never draw the same date twice.
        Map<String, CalendarEntry> byId = new LinkedHashMap<>();

        // Two bounded queries for the whole range - never one lookup per record.
        for (Cpr cpr : cprRepository.findAll(visibleWithRequiredDate(from, to))) {
            add(byId, requiredDateEntry(cpr));
        }

        for (Cpr cpr : cprRepository.findAll(withDeadlineInRange(from, to))) {
            add(byId, deadlineEntry(cpr));
        }

        return List.copyOf(byId.values());
    }

    // ------------------------------------------------------------- mappers

    private CalendarEntry requiredDateEntry(Cpr cpr) {
        LocalDateTime required = cpr.getRequiredDate();
        return entry(
                FIELD_REQUIRED_DATE,
                cpr,
                required == null ? null : required.toLocalDate(),
                timeOf(required),
                KIND_REQUIRED);
    }

    private CalendarEntry deadlineEntry(Cpr cpr) {
        return entry(
                FIELD_EFFECTIVE_DEADLINE,
                cpr,
                effectiveDeadline(cpr),
                null,
                KIND_DEADLINE);
    }

    /** The module's own rule: the extension wins, the original is preserved. */
    private static LocalDate effectiveDeadline(Cpr cpr) {
        return cpr.getExtendedDeadline() != null
                ? cpr.getExtendedDeadline()
                : cpr.getQuotationDeadline();
    }

    /**
     * One projection. A null date produces no entry (nothing is fabricated); the
     * id follows the Calendar's identity convention so a refresh replaces the same
     * entry and the required date and the deadline stay distinct.
     */
    private static CalendarEntry entry(String dateField,
                                       Cpr cpr,
                                       LocalDate date,
                                       String startTime,
                                       String kind) {
        if (cpr.getId() == null || date == null) {
            return null;
        }
        return new CalendarEntry(
                SOURCE + ":" + ENTITY_TYPE + ":" + cpr.getId() + ":" + dateField + ":" + date,
                SOURCE,
                ENTITY_TYPE,
                cpr.getId(),
                title(kind, cpr.getPrNo(), cpr.getClientName()),
                date,
                startTime,
                // CPR stores a start only (and in practice not even that); no end
                // time is invented.
                null,
                startTime == null,
                // The record's own stored status, unchanged and untranslated.
                cpr.getStatus() == null ? null : cpr.getStatus().name(),
                CATEGORY,
                "/cprs/" + cpr.getId(),
                true);
    }

    private static void add(Map<String, CalendarEntry> byId, CalendarEntry entry) {
        if (entry != null) {
            byId.putIfAbsent(entry.id(), entry);
        }
    }

    private static String title(String kind, String number, String client) {
        StringBuilder title = new StringBuilder(kind);
        if (number != null && !number.isBlank()) {
            title.append(' ').append(number.trim());
        }
        if (client != null && !client.isBlank()) {
            title.append(" - ").append(client.trim());
        }
        return title.toString();
    }

    /**
     * Midnight is the date-only marker the CPR form writes, so it means "no time
     * of day" and the entry is all-day. A genuinely stored time (which the
     * date-only form cannot produce) is kept instead of being dropped.
     */
    private static String timeOf(LocalDateTime value) {
        if (value == null) {
            return null;
        }
        LocalTime time = value.toLocalTime();
        if (time.equals(LocalTime.MIDNIGHT)) {
            return null;
        }
        return String.format("%02d:%02d", time.getHour(), time.getMinute());
    }

    // -------------------------------------------------------- query rules

    /**
     * The CPR module's own visible-record rule (current revision of its chain,
     * not archived or deleted - see {@code CprService.buildSpecification}) plus the
     * requested range on the stored required date.
     *
     * <p>The range is a half-open window on the stored timestamp, so both end days
     * are inclusive without relying on a 23:59:59 sentinel.
     */
    private static Specification<Cpr> visibleWithRequiredDate(LocalDate from, LocalDate to) {
        LocalDateTime start = from.atStartOfDay();
        LocalDateTime endExclusive = to.plusDays(1).atStartOfDay();
        return visible().and((root, query, cb) -> cb.and(
                cb.isNotNull(root.<LocalDateTime>get(FIELD_REQUIRED_DATE)),
                cb.greaterThanOrEqualTo(root.<LocalDateTime>get(FIELD_REQUIRED_DATE), start),
                cb.lessThan(root.<LocalDateTime>get(FIELD_REQUIRED_DATE), endExclusive)));
    }

    /**
     * The same visible-record rule, restricted to the CPRs whose <b>effective</b>
     * deadline - {@code coalesce(extendedDeadline, quotationDeadline)} - falls in
     * the requested range. Resolving the coalesce in the query is what makes a CPR
     * appear exactly once even when both deadline fields are set.
     *
     * <p>Converted CPRs are skipped: the quotation raised from them is already on
     * the Sales feed, so the same business deadline would otherwise be drawn twice.
     */
    private static Specification<Cpr> withDeadlineInRange(LocalDate from, LocalDate to) {
        return visible().and((root, query, cb) -> cb.and(
                cb.notEqual(root.<CprStatus>get("status"), CprStatus.CONVERTED),
                effectiveDeadlineBetween(cb, root, from, to)));
    }

    /**
     * The coalesced effective deadline, null-guarded, restricted to the range.
     *
     * <p>The guard sits on the coalesce itself rather than on
     * {@code quotationDeadline}: the form allows a Custom extended date that has
     * no base deadline, and that stored extension is a real deadline which must
     * not be skipped.
     */
    private static Predicate effectiveDeadlineBetween(CriteriaBuilder cb,
                                                      Root<Cpr> root,
                                                      LocalDate from,
                                                      LocalDate to) {
        Expression<LocalDate> effective = cb.coalesce(
                root.<LocalDate>get(FIELD_EXTENDED_DEADLINE),
                root.<LocalDate>get(FIELD_QUOTATION_DEADLINE));
        return cb.and(
                cb.isNotNull(effective),
                cb.greaterThanOrEqualTo(effective, from),
                cb.lessThanOrEqualTo(effective, to));
    }

    /**
     * Current revision of the chain and neither archived nor deleted - the rule
     * {@code CprService} applies to its own lists, reused rather than rewritten so
     * the Calendar can never disagree with the CPR module about which row is live.
     */
    private static Specification<Cpr> visible() {
        return (root, query, cb) -> cb.and(
                CprService.latestPerChainPredicate(root, query, cb),
                cb.not(root.<CprStatus>get("status").in(CprStatus.ARCHIVED, CprStatus.DELETED)));
    }
}
