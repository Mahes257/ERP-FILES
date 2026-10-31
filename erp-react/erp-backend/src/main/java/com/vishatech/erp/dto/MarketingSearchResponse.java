package com.vishatech.erp.dto;

/**
 * Compact autocomplete result for the Marketing search box. Only the fields
 * needed to identify a record in the dropdown are returned — the full record
 * is fetched by id when the user selects a suggestion.
 *
 * <p>For {@code type == "visit"} the id is the visit id and {@code visitNo}
 * is the visit's VST-YYYY-NNN number; {@code leadNo} is the linked lead's
 * number when the visit has one. For {@code type == "lead"} the id is the
 * marketing lead id, {@code leadNo} its L-YYYY-NNN number and
 * {@code openVisitId} points at a linked visit to open in the UI (nullable).
 */
public record MarketingSearchResponse(
        Long id,
        String type,
        String visitNo,
        String leadNo,
        String companyName,
        String contactPerson,
        String location,
        String phone,
        String date,
        Long openVisitId
) {
}
