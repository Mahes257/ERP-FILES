package com.vishatech.erp.pdf;

import java.time.LocalDateTime;
import java.util.List;

/**
 * A printable document described as data: what the owning module decided the
 * document <em>says</em>, with nothing about how it is rendered.
 *
 * <p><b>Why this type exists.</b> The shared reporting service used to read the
 * production tracker, inspection and packing-list tables itself in order to build
 * their PDFs, which is why {@code service.PdfGenerationService} sat in the
 * {@code outside_does_not_depend_on_production_persistence} allow-list. A module
 * that owns a document can now publish one of these instead: the reading of its
 * own records stays inside the module, while the shared HTML/PDF pipeline
 * ({@link DocumentHtml}, iText, the letterhead, the page footer) stays shared.
 *
 * <p>It carries no entity, repository, DTO or service type of any module — a
 * label, a rendered value and a date are all a document needs — so any module may
 * publish it and the shared renderer may consume it without either side depending
 * on the other's internals.
 *
 * @param title     the document heading printed in the letterhead, e.g.
 *                  {@code "PRODUCTION TRACKER"}
 * @param reference the document's own reference printed beside it, e.g. the CPO
 *                  or packing-list number
 * @param createdOn the date shown under the reference; {@code null} renders as
 *                  {@code "-"}, exactly as a missing date always has
 * @param summary   the curated key/value rows of the document's summary section,
 *                  in the order they must be printed. A row whose value is null or
 *                  blank is not printed — but its <em>label</em> still counts as
 *                  already shown, which is what keeps {@link #details()} free of
 *                  duplicates
 * @param details   the remaining user-entered fields of the record, already
 *                  humanised and in property order; rendered under
 *                  "Complete Record Details" and omitted entirely when empty
 */
public record DocumentView(String title, String reference, LocalDateTime createdOn,
                           List<Field> summary, List<Field> details) {

    public DocumentView {
        summary = summary == null ? List.of() : List.copyOf(summary);
        details = details == null ? List.of() : List.copyOf(details);
    }

    /**
     * One key/value row of a document: the label as it is printed and the value
     * already rendered as text (dates formatted, enums spaced, numbers plain), so
     * the shared renderer only has to escape and lay it out.
     *
     * <p>A {@code null} value is legal and means "this field was left empty" — the
     * row is skipped when printed, exactly as a blank value always was.
     */
    public record Field(String label, String value) {
    }

    /** Convenience factory for a row, so the module code reads like the document. */
    public static Field field(String label, String value) {
        return new Field(label, value);
    }
}
