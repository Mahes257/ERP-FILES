package com.vishatech.erp.service;

import com.vishatech.erp.dto.SalesContractExtractionResult;
import com.vishatech.erp.dto.SalesContractExtractionResult.FieldResult;
import com.vishatech.erp.exception.BadRequestException;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.hwpf.HWPFDocument;
import org.apache.poi.hwpf.extractor.WordExtractor;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Sales Contract bulk-upload extraction.
 *
 * Reads the text out of an uploaded contract document (PDF, DOC, DOCX, XLS,
 * XLSX, CSV/TXT) and extracts ONLY the four fields the ERP needs from an
 * existing contract:
 *
 *   1. Customer Name   2. Contract Number   3. Contract Date   4. Validity
 *
 * The extraction is deliberately targeted — every other field in the document
 * is ignored. Documents are treated strictly as untrusted input: they are
 * parsed with passive readers (PDFBox / Apache POI) and never executed. File
 * type is re-validated on the backend before anything is read. Scanned images
 * (JPG/JPEG/PNG) carry no readable text (no OCR is installed), so every field is
 * reported as "notDetected" and the user fills the review note manually.
 *
 * <h2>Two entry points, one behaviour</h2>
 * {@link #extract(MultipartFile[])} (the direct, in-memory path used by the
 * Sales Contract bulk-upload API before it became asynchronous) and
 * {@link #extractFile(String, java.nio.file.Path)} (the path the background job
 * uses) share every rule: the same validation, the same accepted types and the
 * same four-field extractor. The file variant streams the document instead of
 * holding a {@code byte[]} of it, and reads spreadsheet workbooks in read-only
 * mode, so a queued document never inflates the JVM heap.
 */
@Service
public class SalesContractExtractionService {

    // Matches the frontend bulk-upload picker exactly — keep in sync with
    // ACCEPTED_TYPES in src/utils/bulkUpload.js.
    private static final Set<String> ACCEPTED_EXT = Set.of(
            "pdf", "doc", "docx", "xls", "xlsx", "csv", "jpg", "jpeg", "png");

    private static final int MAX_TEXT_CHARS = 400_000;
    private static final int TEXT_PREVIEW_CHARS = 1_200;
    private static final int MAX_FIELD_VALUE_CHARS = 160;
    /** Bounded read for plain-text/CSV documents read from disk (worker path). */
    private static final int MAX_TEXT_INPUT_BYTES = 2_000_000;

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    public List<SalesContractExtractionResult> extract(MultipartFile[] files) throws IOException {
        List<SalesContractExtractionResult> results = new ArrayList<>();
        for (MultipartFile file : files == null ? new MultipartFile[0] : files) {
            results.add(extractOne(file));
        }
        return results;
    }

    /**
     * The multipart entry point (no longer used by the API — the endpoint stages
     * the batch and runs this on a background job). It stages the upload to a
     * temporary file and delegates to {@link #extractFile(String, Path)}, so the
     * document is streamed by every format handler instead of being copied into a
     * {@code byte[]} the size of the upload.
     */
    private SalesContractExtractionResult extractOne(MultipartFile file) throws IOException {
        String name = requireSupported(file.getOriginalFilename(), file.getSize());
        Path staged = Files.createTempFile("sc-extract-", ".upload");
        try {
            try (InputStream in = file.getInputStream()) {
                Files.copy(in, staged, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
            return extractFile(name, staged);
        } finally {
            Files.deleteIfExists(staged);
        }
    }

    /**
     * Extracts from a document already on disk — the background worker's entry
     * point.
     *
     * <p>Same rules as {@link #extractOne} (shared validation, shared field
     * extractor), but the document is streamed instead of copied into a
     * {@code byte[]} and spreadsheets are opened read-only, so a document waiting
     * in the job queue never inflates the JVM heap.
     */
    public SalesContractExtractionResult extractFile(String originalName, Path file) throws IOException {
        String name = requireSupported(originalName, Files.size(file));
        String ext = extensionOf(name);
        return result(name, extractTextFromPath(file, ext), ext);
    }

    /**
     * The single validation both entry points and the submission path use, so a
     * document can never be accepted in one place and rejected in another.
     *
     * @return the display name to report for the document
     * @throws BadRequestException for an unsupported type or an empty document
     */
    public String requireSupported(String originalName, long sizeBytes) {
        String name = originalName == null || originalName.isBlank() ? "document" : originalName;
        String ext = extensionOf(name);
        if (!ACCEPTED_EXT.contains(ext)) {
            throw new BadRequestException(
                    "Unsupported file type \"" + ext + "\" for " + name
                            + " — use PDF, DOC, DOCX, XLS, XLSX, CSV, JPG, JPEG or PNG");
        }
        if (sizeBytes <= 0) {
            throw new BadRequestException("File \"" + name + "\" is empty");
        }
        return name;
    }

    /** Shared tail: raw text -> the four fields (+ preview) for both entry points. */
    private SalesContractExtractionResult result(String name, String rawText, String ext) {
        String text = rawText == null ? "" : rawText;
        // CSV puts labels and values in separate rows (header + data rows) —
        // rewrite into "label: value" lines so the same targeted extractor
        // applies to every document type.
        if (ext.equals("csv")) text = mapCsvRows(text);
        if (text.length() > MAX_TEXT_CHARS) text = text.substring(0, MAX_TEXT_CHARS);
        String normalized = normalize(text);

        FieldResult customerName = extractCustomerName(normalized);
        FieldResult scNo = extractContractNumber(normalized);
        FieldResult contractDate = extractContractDate(normalized);
        FieldResult validity = extractValidity(normalized);

        String preview = normalized.length() > TEXT_PREVIEW_CHARS
                ? normalized.substring(0, TEXT_PREVIEW_CHARS) : normalized;
        return new SalesContractExtractionResult(name, preview, customerName, scNo, contractDate, validity);
    }

    private String extensionOf(String name) {
        int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    // ------------------------------------------------------------------
    // Text extraction from disk (background worker path)
    // ------------------------------------------------------------------

    /**
     * Streams the document instead of loading it whole. Text-bearing types are
     * read with the same readers as the in-memory path; unreadable or spoofed
     * documents yield empty text (every field reported "notDetected") exactly as
     * they do on the synchronous path.
     */
    private String extractTextFromPath(Path path, String ext) {
        try {
            switch (ext) {
                case "pdf":
                    try (InputStream in = Files.newInputStream(path);
                         PDDocument doc = PDDocument.load(in)) {
                        return new PDFTextStripper().getText(doc);
                    } catch (IOException e) {
                        return "";
                    }
                case "doc":
                    try (HWPFDocument doc = new HWPFDocument(Files.newInputStream(path));
                         WordExtractor extractor = new WordExtractor(doc)) {
                        return extractor.getText();
                    } catch (Exception e) {
                        return "";
                    }
                case "docx":
                    try (XWPFDocument doc = new XWPFDocument(Files.newInputStream(path))) {
                        return docxText(doc);
                    } catch (Exception e) {
                        return "";
                    }
                case "xls":
                case "xlsx":
                    return sheetTextFromPath(path);
                case "jpg":
                case "jpeg":
                case "png":
                    return "";
                default:
                    return plainText(readBounded(path, MAX_TEXT_INPUT_BYTES));
            }
        } catch (IOException e) {
            return "";
        }
    }

    /** Spreadsheet text via read-only workbook access (POI keeps it off-heap). */
    private String sheetTextFromPath(Path path) {
        DataFormatter fmt = new DataFormatter();
        try (Workbook wb = WorkbookFactory.create(path.toFile(), null, true)) {
            StringBuilder sb = new StringBuilder();
            for (int s = 0; s < wb.getNumberOfSheets(); s++) {
                Sheet sheet = wb.getSheetAt(s);
                if (sheet == null) continue;
                for (Row row : sheet) {
                    if (row == null) continue;
                    for (Cell cell : row) {
                        String v = fmt.formatCellValue(cell).trim();
                        if (!v.isEmpty()) sb.append(v).append('\t');
                    }
                    sb.append('\n');
                    if (row.getRowNum() > 400) break;
                }
            }
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    /** Reads at most {@code maxBytes} so a huge text/CSV file cannot fill the heap. */
    private byte[] readBounded(Path path, int maxBytes) throws IOException {
        try (InputStream in = Files.newInputStream(path)) {
            return in.readNBytes(maxBytes);
        }
    }

    // ------------------------------------------------------------------
    // Text extraction (passive readers only — documents are never executed)
    // ------------------------------------------------------------------

    private String extractText(byte[] bytes, String ext) throws IOException {
        switch (ext) {
            case "pdf":
                return pdfText(bytes);
            case "doc":
                return docText(bytes);
            case "docx":
                return docxText(bytes);
            case "xls":
            case "xlsx":
                return sheetText(bytes, ext);
            case "jpg":
            case "jpeg":
            case "png":
                // No OCR is installed — images carry no extractable text. Every
                // field is reported "notDetected" and the user fills the review
                // note manually (never fabricated).
                return "";
            default:
                return plainText(bytes);
        }
    }

    private String pdfText(byte[] bytes) throws IOException {
        try (PDDocument doc = PDDocument.load(new ByteArrayInputStream(bytes))) {
            return new PDFTextStripper().getText(doc);
        } catch (IOException e) {
            // Not a readable PDF (e.g. scanned or spoofed) — empty text keeps
            // the file in the review queue as "not detected" instead of failing.
            return "";
        }
    }

    private String docText(byte[] bytes) {
        try (HWPFDocument doc = new HWPFDocument(new ByteArrayInputStream(bytes));
             WordExtractor extractor = new WordExtractor(doc)) {
            return extractor.getText();
        } catch (Exception e) {
            return "";
        }
    }

    private String docxText(byte[] bytes) {
        try (XWPFDocument doc = new XWPFDocument(new ByteArrayInputStream(bytes))) {
            return docxText(doc);
        } catch (Exception e) {
            return "";
        }
    }

    /** Shared DOCX text reader so both entry points report identical text. */
    private String docxText(XWPFDocument doc) {
        StringBuilder sb = new StringBuilder();
        doc.getParagraphs().forEach(p -> sb.append(p.getText()).append('\n'));
        for (XWPFTable table : doc.getTables()) {
            table.getRows().forEach(row -> {
                row.getTableCells().forEach(cell -> {
                    String cellText = cell.getText().replace('\n', ' ');
                    if (!cellText.isBlank()) sb.append(cellText).append('\t');
                });
                sb.append('\n');
            });
        }
        return sb.toString();
    }

    private String sheetText(byte[] bytes, String ext) {
        DataFormatter fmt = new DataFormatter();
        try (Workbook wb = ext.equals("xlsx") ? new XSSFWorkbook(new ByteArrayInputStream(bytes))
                : new HSSFWorkbook(new ByteArrayInputStream(bytes))) {
            StringBuilder sb = new StringBuilder();
            for (int s = 0; s < wb.getNumberOfSheets(); s++) {
                Sheet sheet = wb.getSheetAt(s);
                if (sheet == null) continue;
                for (Row row : sheet) {
                    if (row == null) continue;
                    for (Cell cell : row) {
                        String v = fmt.formatCellValue(cell).trim();
                        if (!v.isEmpty()) sb.append(v).append('\t');
                    }
                    sb.append('\n');
                    // Contracts are header-first — 400 rows is far beyond any
                    // realistic contract sheet and keeps memory bounded.
                    if (row.getRowNum() > 400) break;
                }
            }
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private String plainText(byte[] bytes) {
        String utf8 = new String(bytes, StandardCharsets.UTF_8);
        if (utf8.contains("\uFFFD")) {
            utf8 = new String(bytes, StandardCharsets.ISO_8859_1);
        }
        return utf8;
    }

    /**
     * Rebuilds a CSV's header/data rows into "header: value" lines so the
     * label-driven extractor can find the four fields. Handles quoted values
     * containing commas; skips rows with no headers.
     */
    private String mapCsvRows(String raw) {
        if (raw == null || raw.isBlank()) return raw;
        String[] lines = raw.split("\n");
        if (lines.length < 2) return raw;
        String[] headers = splitCsv(lines[0]);
        StringBuilder out = new StringBuilder();
        for (int i = 1; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.isEmpty()) continue;
            String[] values = splitCsv(line);
            for (int c = 0; c < headers.length && c < values.length; c++) {
                if (!headers[c].isBlank() && !values[c].isBlank()) {
                    out.append(headers[c]).append(": ").append(values[c]).append('\n');
                }
            }
        }
        return out.length() > 0 ? out.toString() : raw;
    }

    private String[] splitCsv(String line) {
        List<String> parts = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (ch == '"') {
                if (inQuotes && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    cur.append('"');
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch == ',' && !inQuotes) {
                parts.add(cur.toString().trim());
                cur.setLength(0);
            } else {
                cur.append(ch);
            }
        }
        parts.add(cur.toString().trim());
        return parts.toArray(new String[0]);
    }

    // ------------------------------------------------------------------
    // Normalization
    // ------------------------------------------------------------------

    private String normalize(String raw) {
        if (raw == null) return "";
        String t = raw.replace("\r\n", "\n").replace('\r', '\n');
        t = t.replace("\t", "  ");
        // Collapse runs of spaces (but keep line structure) and drop
        // control chars / page markers.
        t = t.replaceAll("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]", "");
        t = t.replaceAll(" +", " ");
        t = t.replaceAll("\\n{3,}", "\n\n");
        return t.trim();
    }

    // ------------------------------------------------------------------
    // Targeted field extractors — exactly four fields, nothing else
    // ------------------------------------------------------------------

    // Label lists (longest first so "customer name" wins over "customer").
    private static final String CUSTOMER_LABELS =
            "name of the customer|customer\\s*name|customer\\s*details|client\\s*name|party\\s*name|"
                    + "bill\\s*to|sold\\s*to|billed\\s*to|purchaser|buyer|customer|client|party|m\\s*/?\\s*s\\.?|messrs";

    private static final String SC_NO_LABELS =
            "sales\\s*contract\\s*(?:no|number|#|id)|contract\\s*(?:no|number|#|id|ref)|"
                    + "agreement\\s*(?:no|number|#|id)|contract\\s*reference|sc\\s*(?:no|number|#)|"
                    + "reference\\s*(?:no|number|#)";

    private static final String CONTRACT_DATE_LABELS =
            "contract\\s*date|agreement\\s*date|sc\\s*date|date\\s*of\\s*contract|effective\\s*date|"
                    + "commencement\\s*date|start\\s*date|signed\\s*on|dated?|date(?=\\s*[:#\\-])";

    private static final String VALIDITY_LABELS =
            "validity\\s*period|valid\\s*from|valid\\s*till|valid\\s*until|valid\\s*up\\s*to|valid\\s*through|"
                    + "validity\\s*date|validity|valid\\s*upto|expiry\\s*date|expires?\\s*on|expiration\\s*date|"
                    + "expires?|termination\\s*date|end\\s*date|valid\\s*for";

    /** Words that end a customer-name value (next field on the same line). */
    private static final Pattern CUSTOMER_BOUNDARY = Pattern.compile(
            "(?i)\\b(contract\\s*(?:no|number|#)|agreement\\s*(?:no|number|#)|sc\\s*(?:no|number|#)|"
                    + "contract\\s*date|agreement\\s*date|validity|valid\\s*till|valid\\s*until|gstin|gst\\s*no|"
                    + "pan\\s*no|phone|mobile|tel\\.?|email|e\\s*mail|contact\\s*(?:person|no|number)|address|"
                    + "street|road|nagar|colony|layout|phase|floor|tower|near|opp\\.?|pin\\s*code|pincode)\\b");

    private static final Pattern DATE_TOKEN = Pattern.compile(
            "(?i)(\\d{1,4}[\\-/.]\\d{1,2}[\\-/.]\\d{2,4})"
                    + "|(\\d{1,2}\\s+[a-z]{3,9}\\s+\\d{2,4})"
                    + "|([a-z]{3,9}\\s+\\d{1,2},?\\s+\\d{2,4})");

    private static final List<DateTimeFormatter> DATE_FORMATTERS = List.of(
            DateTimeFormatter.ofPattern("dd/MM/yyyy"),
            DateTimeFormatter.ofPattern("dd-MM-yyyy"),
            DateTimeFormatter.ofPattern("yyyy-MM-dd"),
            DateTimeFormatter.ofPattern("yyyy/MM/dd"),
            DateTimeFormatter.ofPattern("dd.MM.yyyy"),
            DateTimeFormatter.ofPattern("dd-MMM-yyyy"),
            DateTimeFormatter.ofPattern("d MMM yyyy"),
            DateTimeFormatter.ofPattern("dd MMM yyyy"),
            DateTimeFormatter.ofPattern("d MMMM yyyy"),
            DateTimeFormatter.ofPattern("dd MMMM yyyy"),
            DateTimeFormatter.ofPattern("MMM dd, yyyy"),
            DateTimeFormatter.ofPattern("MMM d, yyyy"),
            DateTimeFormatter.ofPattern("dd/MM/yy"),
            DateTimeFormatter.ofPattern("dd-MM-yy"));

    private FieldResult extractCustomerName(String text) {
        String value = labelValue(text, CUSTOMER_LABELS, true);
        if (value == null) return FieldResult.notDetected();

        value = value.replaceAll("(?i)^(m\\s*/?\\s*s\\.?|messrs\\.?|the)\\s+", "").trim();
        // Cut at the first clearly-following field so a single-line layout like
        // "Customer ABC Industries  Contract No: SC-2026-001" never bleeds over.
        Matcher b = CUSTOMER_BOUNDARY.matcher(value);
        if (b.find()) value = value.substring(0, b.start());
        value = value.replaceAll("^[\\s:.#\\-]+|[\\s:;.,]+$", "").trim();
        value = value.replaceAll("\\s{2,}", " ");
        if (value.length() > MAX_FIELD_VALUE_CHARS) value = value.substring(0, MAX_FIELD_VALUE_CHARS).trim();

        if (value.isEmpty()) return FieldResult.notDetected();
        if (looksLikeFiller(value)) return FieldResult.notDetected();
        if (!value.matches(".*[A-Za-z].*")) return FieldResult.notDetected();
        // Generic "customer/client/party" labels can bleed into the next column
        // ("Customer Satisfaction: 90%") — guard against obvious non-names.
        if (value.matches(".*\\d+%$") || value.matches("(?i)^(satisfaction|feedback|id|code|type|category|segment|no|number|date|address)\\b.*")) {
            return FieldResult.needsReview(value);
        }
        if (value.matches(".*\\b(contract|agreement|sales|purchase)\\b.*") && value.split("\\s+").length < 3) {
            return FieldResult.needsReview(value);
        }
        // Two or more words → confident; a single short token → needs review.
        boolean confident = value.split("\\s+").length >= 2 && value.length() >= 5;
        return confident ? FieldResult.extracted(value) : FieldResult.needsReview(value);
    }

    /** Same-line field boundary for contract-number values. */
    private static final Pattern SC_NO_BOUNDARY = Pattern.compile(
            "(?i)\\b(contract\\s*date|agreement\\s*date|date|validity|valid\\s*(?:till|until|up\\s*to|from)|gstin|gst\\s*no|pan\\s*no|phone|mobile|email|address|payment\\s*terms)\\b");

    private FieldResult extractContractNumber(String text) {
        String value = labelValue(text, SC_NO_LABELS, true);
        if (value == null) return FieldResult.notDetected();

        value = value.replaceAll("(?i)^(no|number|#|ref)\\s*[:.]?\\s*", "").trim();
        Matcher b = SC_NO_BOUNDARY.matcher(value);
        if (b.find()) value = value.substring(0, b.start());
        Matcher token = Pattern.compile("[A-Za-z0-9][A-Za-z0-9/\\-._ ]{2,40}").matcher(value);
        if (token.find()) value = token.group().trim();
        value = value.replaceAll("[\\s:;.,]+$", "").replaceAll("\\s+", "-").toUpperCase(Locale.ROOT);
        if (value.length() > 40) value = value.substring(0, 40);

        if (value.isEmpty()) return FieldResult.notDetected();
        // Must look like a contract number: alphanumerics with at least one digit
        // and at least 4 characters ("SC-2026-000145", "145/2026-27", "CTR-112").
        if (!value.matches("^[A-Z0-9/\\-.]{4,40}$") || !value.matches(".*\\d.*")) {
            return FieldResult.needsReview(value);
        }
        return FieldResult.extracted(value);
    }

    private FieldResult extractContractDate(String text) {
        String value = labelValue(text, CONTRACT_DATE_LABELS, true);
        if (value == null) return FieldResult.notDetected();

        LocalDate d = firstDate(value);
        if (d != null) return FieldResult.extracted(d.toString());
        // Label found but nothing parseable — flag for the reviewer.
        return FieldResult.needsReview(value.length() > 80 ? value.substring(0, 80) : value);
    }

    private FieldResult extractValidity(String text) {
        String value = labelValue(text, VALIDITY_LABELS, true);
        if (value == null) return FieldResult.notDetected();

        // Validity is usually a range ("12 Aug 2026 - 11 Aug 2027") or a single
        // end date. The ERP stores a single "valid until" date, so the LAST date
        // in the range is the one the form needs.
        LocalDate last = lastDate(value);
        if (last != null) return FieldResult.extracted(last.toString());
        return FieldResult.needsReview(value.length() > 80 ? value.substring(0, 80) : value);
    }

    // ------------------------------------------------------------------
    // Shared label/value helpers
    // ------------------------------------------------------------------

    /**
     * Finds "Label: value" (or "Label value") occurrences for one of the given
     * labels and returns the value on the same line, extended to the next
     * non-empty line when the label ends the line (common in forms where the
     * value sits under the label).
     */
    private String labelValue(String text, String labels, boolean allowNextLine) {
        if (text.isEmpty()) return null;
        Pattern p = Pattern.compile("(?im)^\\s*(" + labels + ")\\s*[:#\\-]?\\s*(.*)$");
        Matcher m = p.matcher(text);
        while (m.find()) {
            String label = m.group(1);
            String value = m.group(2).trim();
            if (value.isEmpty() && allowNextLine) {
                // Value on the following non-empty line.
                String rest = text.substring(m.end());
                String[] lines = rest.split("\\n", 3);
                for (String line : lines) {
                    String candidate = line.trim();
                    if (candidate.isEmpty() || candidate.startsWith("___") || candidate.matches("[-_=]{4,}")) {
                        continue;
                    }
                    value = candidate;
                    break;
                }
            }
            if (value.isEmpty()) continue;
            // Skip lines that are actually the next label (or a table header).
            if (Pattern.compile("(?i)^\\s*(" + labels + ")\\b").matcher(value).find()) continue;
            if (value.matches("(?i)^(name|no|number|date|address|phone|email|details|party|client)\\b.*")
                    && value.split("\\s+").length <= 3) {
                continue;
            }
            return value;
        }
        return null;
    }

    private boolean looksLikeFiller(String value) {
        String v = value.toLowerCase(Locale.ROOT).trim();
        return v.isEmpty()
                || v.matches("(n/?a|n/?d|-+|=+|_+|none|nil|tbd|tba|xxx+)")
                || v.matches("(?i)^(please fill|enter|your|na|not available|not applicable|same as above).*");
    }

    /** First parseable date in a value string (used for contract date). */
    private LocalDate firstDate(String value) {
        Matcher m = DATE_TOKEN.matcher(value);
        while (m.find()) {
            LocalDate d = parseDate(m.group());
            if (d != null) return d;
        }
        return null;
    }

    /** Last parseable date in a value string (used for the validity end date). */
    private LocalDate lastDate(String value) {
        Matcher m = DATE_TOKEN.matcher(value);
        LocalDate last = null;
        while (m.find()) {
            LocalDate d = parseDate(m.group());
            if (d != null) last = d;
        }
        return last;
    }

    private LocalDate parseDate(String token) {
        if (token == null) return null;
        String t = token.trim().replaceAll("\\s+", " ");
        for (DateTimeFormatter f : DATE_FORMATTERS) {
            try {
                return LocalDate.parse(t, f.withLocale(Locale.ENGLISH));
            } catch (DateTimeParseException ignored) {
                // try next format
            }
        }
        return null;
    }
}
