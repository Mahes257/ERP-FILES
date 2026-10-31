package com.vishatech.erp.pdf;

import com.vishatech.erp.pdf.DocumentView.Field;
import java.beans.Introspector;
import java.beans.PropertyDescriptor;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The shared HTML toolkit every generated document is assembled from.
 *
 * <p><b>Why this is its own type.</b> The letterhead, the printable CSS, the
 * escaping, the date format and the "Complete Record Details" reflection were
 * private methods of {@code service.PdfGenerationService}. Modules that own a
 * document now build its content where the content belongs (see
 * {@link DocumentView}) while the presentation stays shared — which is only
 * possible if the presentation is reachable from both sides. The bodies moved
 * here <em>verbatim</em>: not one byte of the produced HTML changed with the
 * move, and {@code PdfGenerationService} calls them through static imports, so
 * its fifteen other document builders were untouched.
 *
 * <p>Nothing here knows about a module, an entity or a repository: the reflection
 * in {@link #recordRows(Object, Set)} is driven by the record that is handed in,
 * which keeps "no entered detail is ever missing from a document" working for a
 * field someone adds to an entity tomorrow.
 */
public final class DocumentHtml {

    private static final Logger LOG = LoggerFactory.getLogger(DocumentHtml.class);

    /** The single date format every generated document prints. */
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd MMM yyyy");

    /**
     * Properties that are never part of what the user typed on a creation page:
     * primary keys, audit columns and the workflow/link flags the ERP maintains
     * itself. Everything else on the entity is reproduced in the document.
     */
    private static final Set<String> INTERNAL_FIELDS = Set.of(
            "id", "class", "createdAt", "updatedAt", "archivedAt", "deletedAt",
            "revision", "revisionOf", "latestRevision", "revisionDate",
            "convertedToSo", "convertedToPi", "convertedToInvoice", "convertedToCn",
            "convertedToPr", "convertedToSc", "convertedToDc",
            "deletedBy", "archivedBy",
            // Embedded image payloads (data URLs) — not part of a printed document.
            "originalImages", "thumbnails",
            "hibernateLazyInitializer", "handler");

    private DocumentHtml() {
    }

    // ==================== The document shell ====================

    /** The letterhead: doctype, printable CSS, title, reference and date. */
    public static String hdr(String title, String number, String date) {
        return "<!DOCTYPE html><html xmlns='http://www.w3.org/1999/xhtml'><head><meta charset='UTF-8'/>" +
                "<style>" +
                "@page{size:A4;margin:15mm 15mm 20mm 15mm;" +
                "@bottom-left{content:'VISHak TECH';font-size:8px;color:#999;font-family:Helvetica,Arial,sans-serif;}" +
                "@bottom-right{content:'Generated ' attr(data-date);font-size:8px;color:#999;font-family:Helvetica,Arial,sans-serif;}" +
                "@bottom-center{content:'Page ' counter(page) ' of ' counter(pages);font-size:9px;color:#666;font-family:Helvetica,Arial,sans-serif;}}" +
                "body{font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#222;margin:0;padding:0;}" +
                "h1{font-size:18px;color:#1a237e;margin:0 0 4px 0;page-break-after:avoid;}" +
                "h2{font-size:13px;color:#333;margin:10px 0 4px 0;border-bottom:1px solid #ccc;padding-bottom:3px;page-break-after:avoid;page-break-before:always;}" +
                "h2:first-of-type{page-break-before:auto;}" +
                "p{margin:4px 0 8px 0;line-height:1.4;page-break-inside:avoid;}" +
                "table{width:100%;border-collapse:collapse;margin:6px 0 12px 0;}" +
                "thead{display:table-header-group;}" +
                "tfoot{display:none;}" +
                "th{background:#e8eaf6;text-align:left;padding:5px 8px;border:1px solid #ccc;font-size:10px;page-break-inside:avoid;page-break-after:avoid;}" +
                "td{padding:5px 8px;border:1px solid #ccc;font-size:10px;word-wrap:break-word;overflow-wrap:break-word;}" +
                "tr{page-break-inside:auto;}" +
                ".hdr{display:flex;justify-content:space-between;border-bottom:2px solid #1a237e;padding-bottom:8px;margin-bottom:12px;page-break-after:avoid;}" +
                ".meta{font-size:10px;color:#555;}" +
                ".tot td{font-weight:bold;background:#f5f5f5;}" +
                ".section{page-break-inside:avoid;}" +
                "hr{border:none;border-top:1px solid #ddd;margin:8px 0;page-break-after:avoid;}" +
                "</style></head><body data-date='" + esc(date) + "'>" +
                "<div class='hdr'><div><h1>" + esc(title) + "</h1><div class='meta'>Vishak Tech</div></div>" +
                "<div style='text-align:right'><strong>" + esc(number) + "</strong><br/><span class='meta'>" + esc(date) + "</span></div></div>";
    }

    /** The end of the document. */
    public static String ftr() {
        return "</body></html>";
    }

    /** HTML-escape a value, treating null as empty. */
    public static String esc(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    /**
     * A key/value block from label/value pairs.
     *
     * <p>The row shape the builders have always used; rows without a value are
     * skipped, so a partly filled record never prints an empty line. Every
     * document builder uses this for its curated summary section.
     */
    public static String info(String[][] rows) {
        List<Field> fields = new ArrayList<>();
        if (rows != null) {
            for (String[] row : rows) {
                if (row != null && row.length >= 2) {
                    fields.add(new Field(row[0], row[1]));
                }
            }
        }
        return infoTable(fields);
    }

    /** The same rendered block, from an already-built {@link DocumentView} row list. */
    public static String infoTable(List<Field> rows) {
        StringBuilder sb = new StringBuilder("<table>");
        if (rows != null) {
            for (Field r : rows) {
                if (r != null && r.value() != null && !r.value().isBlank()) {
                    sb.append("<tr><td style='width:140px;font-weight:bold;'>").append(esc(r.label()))
                            .append("</td><td>").append(esc(r.value())).append("</td></tr>");
                }
            }
        }
        return sb.append("</table>").toString();
    }

    // ==================== Complete record details ====================

    /** The label of every row in a builder's summary array. */
    public static Set<String> labels(String[][] rows) {
        Set<String> set = new HashSet<>();
        if (rows != null) {
            for (String[] r : rows) {
                if (r.length > 0 && r[0] != null) {
                    set.add(r[0]);
                }
            }
        }
        return set;
    }

    /** The same, from a document's summary section. */
    public static Set<String> labels(List<Field> rows) {
        Set<String> set = new HashSet<>();
        if (rows != null) {
            for (Field r : rows) {
                if (r != null && r.label() != null) {
                    set.add(r.label());
                }
            }
        }
        return set;
    }

    /**
     * Render every remaining user-entered field of a record as a readable
     * key/value block.
     *
     * <p>The module-specific sections above each show a curated summary; this
     * section guarantees the document encloses the complete record as captured
     * on the module's creation page, so no entered detail is ever missing from
     * a downloaded or previewed PDF. Fields already shown above (matched by
     * label) and ERP-internal columns are skipped.
     */
    public static String recordDetails(Object entity, Set<String> alreadyShown) {
        return detailsSection(recordRows(entity, alreadyShown));
    }

    /**
     * The rows {@link #recordDetails(Object, Set)} would print, as data.
     *
     * <p>Needed because a module may build its document's content itself (see
     * {@link DocumentView}) while the record it is built from stays inside the
     * module: the reflection runs against the real record, so a property added to
     * the entity appears in the document without anyone maintaining a list.
     *
     * @return the humanised label/value rows, in property order; empty when the
     *         record is null, has no remaining user-entered field, or cannot be
     *         read (which is logged, never thrown — a document must not fail
     *         because one field could not be introspected)
     */
    public static List<Field> recordRows(Object entity, Set<String> alreadyShown) {
        if (entity == null) {
            return List.of();
        }
        List<Field> rows = new ArrayList<>();
        try {
            for (PropertyDescriptor pd : Introspector.getBeanInfo(entity.getClass()).getPropertyDescriptors()) {
                String name = pd.getName();
                if (INTERNAL_FIELDS.contains(name)) {
                    continue;
                }
                if (alreadyShown != null && alreadyShown.contains(humanize(name))) {
                    continue;
                }
                Method getter = pd.getReadMethod();
                if (getter == null) {
                    continue;
                }
                // Skip relationships/collections up front: they are either
                // rendered in their own section or are not document content,
                // and touching them could trigger lazy loading.
                Class<?> returnType = getter.getReturnType();
                if (returnType.isArray()
                        || Collection.class.isAssignableFrom(returnType)
                        || Map.class.isAssignableFrom(returnType)
                        || returnType.getName().startsWith("com.vishatech.erp.entity")) {
                    continue;
                }
                Object value;
                try {
                    value = getter.invoke(entity);
                } catch (Exception readError) {
                    continue;
                }
                String text = displayValue(value);
                if ("soNo".equals(name) && text != null && text.startsWith("SO-")) {
                    text = "CPO-" + text.substring(3);
                }
                if (text != null && !text.isBlank()) {
                    rows.add(new Field(humanize(name), text));
                }
            }
        } catch (Exception e) {
            LOG.warn("Could not read complete details for {}: {}",
                    entity.getClass().getSimpleName(), e.getMessage());
            return List.of();
        }
        return rows;
    }

    /** The rendered "Complete Record Details" section, or "" when there is none. */
    public static String detailsSection(List<Field> rows) {
        if (rows == null || rows.isEmpty()) {
            return "";
        }
        return "<h2>Complete Record Details</h2>" + infoTable(rows);
    }

    /** Human-readable rendering of a single field value, or null to omit it. */
    public static String displayValue(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof String s) {
            String t = s.trim();
            if (t.isEmpty() || t.startsWith("data:") || t.startsWith("http") && t.length() > 300) {
                return null;
            }
            return t.length() > 10000 ? t.substring(0, 5000) + " ..." : t;
        }
        if (value instanceof BigDecimal bd) {
            return bd.stripTrailingZeros().toPlainString();
        }
        if (value instanceof Enum<?> e) {
            return e.name().replace('_', ' ');
        }
        if (value instanceof LocalDateTime dtv) {
            return dtv.format(DATE);
        }
        if (value instanceof LocalDate d) {
            return d.format(DATE);
        }
        if (value instanceof Instant instant) {
            return LocalDateTime.ofInstant(instant, ZoneId.systemDefault()).format(DATE);
        }
        if (value instanceof Boolean b) {
            return b ? "Yes" : "No";
        }
        if (value instanceof Number n) {
            return String.valueOf(n);
        }
        return String.valueOf(value);
    }

    /** "clientName" -> "Client Name", "gstin" -> "Gstin", "poNo" -> "Po No". */
    public static String humanize(String name) {
        String spaced = name.replaceAll("([a-z0-9])([A-Z])", "$1 $2")
                .replaceAll("([A-Z]+)([A-Z][a-z])", "$1 $2");
        return Character.toUpperCase(spaced.charAt(0)) + spaced.substring(1);
    }

    /** A date as every document prints it, or "-" when absent. */
    public static String dt(LocalDateTime d) {
        return d != null ? d.format(DATE) : "-";
    }

    /** The same for a date-only value. */
    public static String dt(LocalDate d) {
        return d != null ? d.format(DATE) : "-";
    }

    // ==================== Rendering ====================

    /**
     * Render a module-published {@link DocumentView} to document HTML: the shared
     * letterhead and footer around the module's own content.
     *
     * <p>This is the whole rendering contract — heading, reference, date, curated
     * summary, complete record details — which is why a module never has to know a
     * line of CSS to have its records printed.
     */
    public static String render(DocumentView view) {
        String html = hdr(view.title(), view.reference(), dt(view.createdOn()));
        html += infoTable(view.summary());
        html += detailsSection(view.details());
        return html + ftr();
    }
}
