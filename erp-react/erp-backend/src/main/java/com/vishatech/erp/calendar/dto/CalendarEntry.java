package com.vishatech.erp.calendar.dto;

import java.time.LocalDate;

/**
 * One read-only Calendar entry derived from a source ERP record.
 *
 * <p><b>What this is.</b> A display/navigation projection only: it carries the
 * reference, date, status and route of a record that already exists in a
 * business module. It is never persisted, never edited through the Calendar and
 * never written back to its source record - {@code readOnly} is always true.
 *
 * <p><b>No invented values.</b> Every field is copied from the source record.
 * {@code date} is the record's own date column; a record without a usable date
 * is not turned into an entry at all. {@code startTime} is present only when the
 * module stores a real time of day, and {@code allDay} is then false; otherwise
 * it is null and the entry is an all-day item.
 *
 * <p><b>Identity.</b> {@code id} is deterministic -
 * {@code <source>:<entityType>:<entityId>:<dateField>:<yyyy-MM-dd>} - so a
 * refresh replaces the same entry instead of duplicating it, and two different
 * date fields on one record (a due date and a follow-up date) stay distinct.
 */
public record CalendarEntry(
        String id,
        /** Owning ERP module key: {@code marketing}, {@code crm}, ... */
        String source,
        /** Source entity type, e.g. {@code MarketingVisit}, {@code FollowUp}. */
        String entityType,
        /** Primary key of the source record. */
        Long entityId,
        String title,
        LocalDate date,
        /** {@code HH:mm} when the source record stores a real time, else null. */
        String startTime,
        /** Only sent when the source record carries an end time, else null. */
        String endTime,
        /** True when the source record has no time of day. */
        boolean allDay,
        /** The record's own business status, unchanged and untranslated. */
        String status,
        /** Existing Calendar category key ({@code marketing}, {@code crm}, ...). */
        String category,
        /** Existing frontend route for the source record, or null when none exists. */
        String linkPath,
        /** Always true - the Calendar may display and navigate, never mutate. */
        boolean readOnly
) {
}
