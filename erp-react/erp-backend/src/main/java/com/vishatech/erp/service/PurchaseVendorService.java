package com.vishatech.erp.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.PurchaseGrn;
import com.vishatech.erp.entity.PurchaseOrder;
import com.vishatech.erp.entity.PurchaseVendor;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.PurchaseGrnRepository;
import com.vishatech.erp.repository.PurchaseOrderRepository;
import com.vishatech.erp.repository.PurchaseVendorRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PurchaseVendorService {

    /** Matches the canonical V-<digits> vendor-code sequence (V-0001). */
    private static final Pattern VENDOR_CODE_SEQUENCE = Pattern.compile("V-(\\d+)");

    /* Order stages that never represent committed spend. */
    private static final Set<String> VOID_ORDER_STATUSES = Set.of("Draft", "Pending Approval", "Cancelled");

    /* Order stages that represent committed spend (mirrors the frontend's
       committedOrders() predicate in utils/supplierPerformance.js). */
    private static final Set<String> COMMITTED_ORDER_STATUSES = Set.of(
            "Approved", "Released", "Supplier Acknowledged", "In Progress",
            "Partially Delivered", "Completed", "Closed");

    private final ObjectMapper mapper = new ObjectMapper();

    private final PurchaseVendorRepository vendors;

    /* Read-only transaction sources used only by the performance board. */
    private final PurchaseOrderRepository orders;
    private final PurchaseGrnRepository grns;

    public PurchaseVendorService(PurchaseVendorRepository vendors,
                                 PurchaseOrderRepository orders,
                                 PurchaseGrnRepository grns) {
        this.vendors = vendors;
        this.orders = orders;
        this.grns = grns;
    }

    @Transactional(readOnly = true)
    public Page<Map<String, Object>> list(int page, int size, String search, String status,
                                          String category, String state, String sort) {
        String normalizedSearch = search == null ? "" : search.trim().toLowerCase();
        List<Map<String, Object>> records = vendors.findAll().stream()
                /* Deleted / Archived tabs are sent as status="Deleted"/
                   "Archived" by the frontend, but they correspond to the
                   record_state column, NOT the status column. Active tabs
                   (Pending Approval / Approved / Blocked) live under
                   record_state=active. "All" on a non-lifecycle view
                   includes only active records. */
                .filter(vendor -> {
                    if ("All".equalsIgnoreCase(status) || status == null || status.isBlank()) {
                        return "active".equalsIgnoreCase(vendor.getRecordState());
                    }
                    if ("Deleted".equalsIgnoreCase(status)) {
                        return "deleted".equalsIgnoreCase(vendor.getRecordState());
                    }
                    if ("Archived".equalsIgnoreCase(status)) {
                        return "archived".equalsIgnoreCase(vendor.getRecordState());
                    }
                    // Active lifecycle statuses: Pending Approval, Approved, Blocked
                    return "active".equalsIgnoreCase(vendor.getRecordState())
                            && status.equalsIgnoreCase(vendor.getStatus());
                })
                .filter(vendor -> "All".equalsIgnoreCase(category) || category == null || category.isBlank()
                        || category.equalsIgnoreCase(vendor.getCategory()))
                .filter(vendor -> "All".equalsIgnoreCase(state) || state == null || state.isBlank()
                        || state.equalsIgnoreCase(vendor.getState()))
                .filter(vendor -> normalizedSearch.isBlank()
                        || contains(vendor.getName(), normalizedSearch)
                        || contains(vendor.getVendorCode(), normalizedSearch)
                        || contains(vendor.getCity(), normalizedSearch)
                        || contains(vendor.getCategory(), normalizedSearch)
                        || contains(vendor.getState(), normalizedSearch)
                        || contains(vendor.getEmail(), normalizedSearch)
                        || contains(vendor.getGstin(), normalizedSearch))
                .map(this::toResponse)
                .collect(Collectors.toCollection(ArrayList::new));

        /* Order the WHOLE result (not just the page) by the requested column
           before paginating — the list used to ignore `sort` entirely, so
           every sortable header was a no-op. */
        applySort(records, sort);

        int safeSize = Math.max(size, 1);
        int safePage = Math.max(page, 0);
        int from = Math.min(safePage * safeSize, records.size());
        int to = Math.min(from + safeSize, records.size());
        return new PageImpl<>(records.subList(from, to), PageRequest.of(safePage, safeSize), records.size());
    }

    @Transactional(readOnly = true)
    public Map<String, Object> stats() {
        long pending = vendors.countByRecordStateAndStatus("active", "Pending Approval");
        long approved = vendors.countByRecordStateAndStatus("active", "Approved");
        long rejected = vendors.countByRecordStateAndStatus("active", "Rejected");
        long blocked = vendors.countByRecordStateAndStatus("active", "Blocked");
        long archived = vendors.countByRecordState("archived");
        long deleted = vendors.countByRecordState("deleted");

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", pending + approved + blocked + archived + deleted);
        result.put("pending", pending);
        result.put("approved", approved);
        result.put("rejected", rejected);
        result.put("blocked", blocked);
        result.put("archived", archived);
        result.put("deleted", deleted);
        result.put("totalSpend", BigDecimal.ZERO);
        result.put("avgRating", averageRating());
        return result;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> get(String id) {
        return toResponse(resolve(id));
    }

    @Transactional
    public Map<String, Object> create(Map<String, Object> body) {
        PurchaseVendor vendor = new PurchaseVendor();
        apply(vendor, body, true);
        return toResponse(vendors.save(vendor));
    }

    @Transactional
    public Map<String, Object> update(String id, Map<String, Object> body) {
        PurchaseVendor vendor = resolve(id);
        apply(vendor, body, false);
        return toResponse(vendors.save(vendor));
    }

    @Transactional
    public void delete(String id) {
        PurchaseVendor vendor = resolve(id);
        vendor.setRecordState("deleted");
        vendors.save(vendor);
    }

    @Transactional
    public Map<String, Object> setStatus(String id, String status) {
        PurchaseVendor vendor = resolve(id);
        if (status == null || status.isBlank()) {
            throw new BadRequestException("Vendor status is required");
        }
        vendor.setStatus(status);
        return toResponse(vendors.save(vendor));
    }

    @Transactional
    public Map<String, Object> archive(String id) {
        PurchaseVendor vendor = resolve(id);
        vendor.setRecordState("archived");
        return toResponse(vendors.save(vendor));
    }

    @Transactional
    public Map<String, Object> restore(String id) {
        PurchaseVendor vendor = resolve(id);
        vendor.setRecordState("active");
        return toResponse(vendors.save(vendor));
    }

    @Transactional
    public Map<String, Object> duplicate(String id) {
        PurchaseVendor source = resolve(id);
        PurchaseVendor copy = new PurchaseVendor();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("vendorCode", source.getVendorCode() + "-COPY");
        body.put("name", source.getName() + " (Copy)");
        body.put("category", source.getCategory());
        body.put("city", source.getCity());
        body.put("state", source.getState());
        body.put("email", source.getEmail());
        body.put("phone", source.getPhone());
        body.put("status", "Pending Approval");
        apply(copy, body, true);
        return toResponse(vendors.save(copy));
    }

    /**
     * Performance board rows for the ACTIVE supplier list.
     *
     * <p>This is the data source for the Vendor Performance page, which
     * ranks suppliers on rating / on-time delivery / lead time / order
     * volume. The vendor master alone only stores the stored rating and
     * lead time, so the transaction aggregates the board reads — committed
     * order count, committed spend and the on-time delivery rate — are
     * derived here from the real Purchase Order and GRN records (mirroring
     * the mock's withEffectiveMetrics). A supplier with no transaction
     * history legitimately reports 0 for them, which the page renders as
     * its zero/empty state instead of NaN.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> performance() {
        List<PurchaseOrder> allOrders = orders.findAll();
        List<PurchaseGrn> allGrns = grns.findAll();

        return vendors.findAll().stream()
                .filter(vendor -> "active".equalsIgnoreCase(vendor.getRecordState()))
                .map(vendor -> {
                    Map<String, Object> row = new LinkedHashMap<>(toResponse(vendor));
                    List<PurchaseOrder> committed = allOrders.stream()
                            .filter(order -> sameVendor(order.getVendor(), vendor.getName()))
                            .filter(PurchaseVendorService::isCommittedOrder)
                            .toList();
                    BigDecimal spend = committed.stream()
                            .map(PurchaseOrder::getAmount)
                            .filter(Objects::nonNull)
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    row.put("orders", committed.size());
                    row.put("spend", spend);
                    row.put("onTimeDelivery", onTimeDeliveryRate(committed, allGrns, vendor.getName()));
                    return row;
                })
                .toList();
    }

    /** Orders that represent real committed spend (approved, not voided). */
    private static boolean isCommittedOrder(PurchaseOrder order) {
        String status = order.getStatus() == null ? "" : order.getStatus();
        if (VOID_ORDER_STATUSES.contains(status)) return false;
        if ("Approved".equalsIgnoreCase(order.getApprovalStatus())) return true;
        /* Legacy records without an explicit approvalStatus that reached a
           released-stage status count as committed. */
        return COMMITTED_ORDER_STATUSES.contains(status);
    }

    /**
     * On-time delivery percentage: posted GRN receipt dates measured
     * against the promised date of the committed PO they belong to.
     * Returns 0 when the supplier has no receipts (the page's documented
     * zero/empty state) — never NaN/undefined.
     */
    private static int onTimeDeliveryRate(List<PurchaseOrder> committed,
                                          List<PurchaseGrn> allGrns,
                                          String vendorName) {
        Map<String, LocalDate> promisedByPo = new HashMap<>();
        for (PurchaseOrder order : committed) {
            if (order.getPoNo() == null || order.getPoNo().isBlank()) continue;
            LocalDate promised = firstDate(order.getExpectedDate(), order.getDeliveryDate());
            if (promised != null) promisedByPo.put(order.getPoNo(), promised);
        }
        if (promisedByPo.isEmpty()) return 0;

        int total = 0;
        int onTime = 0;
        for (PurchaseGrn grn : allGrns) {
            if (!sameVendor(grn.getSupplier(), vendorName)) continue;
            if ("Expected".equalsIgnoreCase(grn.getStatus())) continue;
            LocalDate received = grn.getReceiptDate();
            LocalDate promised = promisedByPo.get(grn.getPoNo());
            if (received == null || promised == null) continue;
            total += 1;
            if (!received.isAfter(promised)) onTime += 1;
        }
        return total == 0 ? 0 : (int) Math.round((onTime * 100.0) / total);
    }

    /** First parseable date among the candidates (yyyy-MM-dd prefix), else null. */
    private static LocalDate firstDate(String... values) {
        for (String value : values) {
            if (value == null || value.isBlank()) continue;
            String trimmed = value.trim();
            String datePart = trimmed.length() > 10 ? trimmed.substring(0, 10) : trimmed;
            try {
                return LocalDate.parse(datePart);
            } catch (DateTimeParseException ignored) {
                // try the next candidate
            }
        }
        return null;
    }

    /** Mirrors the frontend's sameVendor(): trimmed, case-insensitive, tolerant of partial names. */
    private static boolean sameVendor(String candidate, String vendorName) {
        String got = normalizeVendorText(candidate);
        String want = normalizeVendorText(vendorName);
        if (got.isEmpty() || want.isEmpty()) return false;
        return got.equals(want) || got.contains(want) || want.contains(got);
    }

    private static String normalizeVendorText(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> activity(String id) {
        resolve(id);
        return Map.of("entries", List.of());
    }

    /** Resolves a vendor by numeric PK or by its unique vendor code. */
    private PurchaseVendor resolve(String reference) {
        if (reference == null || reference.isBlank()) {
            throw new ResourceNotFoundException("Vendor not found");
        }
        String trimmed = reference.trim();
        // Try numeric PK first
        try {
            Long pk = Long.valueOf(trimmed);
            return vendors.findById(pk).orElseThrow(() ->
                    new ResourceNotFoundException("Vendor not found: " + trimmed));
        } catch (NumberFormatException ignored) {
            // Not numeric — fall through to vendor-code lookup
        }
        // Lookup by unique vendor code (V-0001)
        return vendors.findByVendorCode(trimmed)
                .orElseThrow(() -> new ResourceNotFoundException("Vendor not found: " + trimmed));
    }

    private BigDecimal averageRating() {
        List<PurchaseVendor> active = vendors.findAll().stream()
                .filter(vendor -> "active".equalsIgnoreCase(vendor.getRecordState()))
                .filter(vendor -> vendor.getRating() != null)
                .toList();
        if (active.isEmpty()) {
            return BigDecimal.ZERO;
        }
        BigDecimal total = active.stream().map(PurchaseVendor::getRating).reduce(BigDecimal.ZERO, BigDecimal::add);
        return total.divide(BigDecimal.valueOf(active.size()), 1, java.math.RoundingMode.HALF_UP);
    }

    private Map<String, Object> toResponse(PurchaseVendor vendor) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", vendor.getId());
        result.put("id2", vendor.getVendorCode());
        result.put("vendorCode", vendor.getVendorCode());
        result.put("name", vendor.getName());
        result.put("registrationDate", vendor.getRegistrationDate());
        result.put("category", vendor.getCategory());
        result.put("city", vendor.getCity());
        result.put("state", vendor.getState());
        result.put("email", vendor.getEmail());
        result.put("phone", vendor.getPhone());
        result.put("website", vendor.getWebsite());
        result.put("gstin", vendor.getGstin());
        result.put("address", vendor.getAddress());
        result.put("notes", vendor.getNotes());
        result.put("latitude", vendor.getLatitude());
        result.put("longitude", vendor.getLongitude());
        result.put("formattedAddress", vendor.getFormattedAddress());
        result.put("googleMapsUrl", vendor.getGoogleMapsUrl());
        result.put("status", vendor.getStatus());
        result.put("rating", vendor.getRating());
        /* Created Date column + the list's default -createdAt ordering. */
        result.put("createdAt", vendor.getCreatedAt());
        result.put("paymentTerms", vendor.getPaymentTerms());
        result.put("currency", vendor.getCurrency());
        result.put("leadTimeDays", vendor.getLeadTimeDays());
        result.put("recordState", vendor.getRecordState());
        /* Fields the Supplier Master UI reads — previously dropped, which
           left the detail page blank for data the user had entered. */
        result.put("active", Boolean.TRUE.equals(vendor.getActive()));
        result.put("formattedAddress", vendor.getFormattedAddress());
        result.put("googleMapsUrl", vendor.getGoogleMapsUrl());
        result.put("legalName", vendor.getLegalName());
        result.put("legalType", vendor.getLegalType());
        result.put("cin", vendor.getCin());
        result.put("incorporationDate", vendor.getIncorporationDate());
        result.put("msmeRegNo", vendor.getMsmeRegNo());
        result.put("msmeType", vendor.getMsmeType());
        result.put("tan", vendor.getTan());
        result.put("creditLimit", parseMap(vendor.getCreditLimitJson()));
        result.put("addresses", parseList(vendor.getAddressesJson()));
        result.put("contacts", parseList(vendor.getContactsJson()));
        result.put("categories", parseList(vendor.getCategoriesJson()));
        return result;
    }

    private void apply(PurchaseVendor vendor, Map<String, Object> body, boolean create) {
        String name = text(body, "name");
        if (create && name.isBlank()) {
            throw new BadRequestException("Vendor name is required");
        }
        if (!name.isBlank()) vendor.setName(name);
        /* Vendor code is ALWAYS generated server-side on create from the
           highest existing V-<n> sequence (max+1, gap-safe, zero-padded —
           mirrors the ERP numbering used by every other master). A client-
           supplied code is treated as a display draft only, never trusted,
           so concurrent registrations can never collide on the UNIQUE
           vendor_code column. */
        if (create) {
            vendor.setVendorCode(nextVendorCode());
        } else {
            String code = text(body, "vendorCode");
            if (!code.isBlank()) vendor.setVendorCode(code);
        }
        if (body.containsKey("category")) vendor.setCategory(text(body, "category"));
        if (body.containsKey("city")) vendor.setCity(text(body, "city"));
        if (body.containsKey("state")) vendor.setState(text(body, "state"));
        if (body.containsKey("email")) vendor.setEmail(text(body, "email"));
        if (body.containsKey("phone")) vendor.setPhone(text(body, "phone"));
        if (body.containsKey("website")) vendor.setWebsite(text(body, "website"));
        if (body.containsKey("gstin")) vendor.setGstin(text(body, "gstin"));
        if (body.containsKey("address")) vendor.setAddress(text(body, "address"));
        if (body.containsKey("notes")) vendor.setNotes(text(body, "notes"));
        if (body.containsKey("status")) vendor.setStatus(text(body, "status"));
        if (body.containsKey("paymentTerms")) vendor.setPaymentTerms(text(body, "paymentTerms"));
        if (body.containsKey("currency")) vendor.setCurrency(text(body, "currency"));
        if (body.containsKey("leadTimeDays")) vendor.setLeadTimeDays(integer(body, "leadTimeDays"));
        if (body.containsKey("registrationDate")) vendor.setRegistrationDate(dateTime(body, "registrationDate"));
        if (body.containsKey("active")) vendor.setActive(booleanValue(body.get("active")));
        if (body.containsKey("latitude")) vendor.setLatitude(dbl(body.get("latitude")));
        if (body.containsKey("longitude")) vendor.setLongitude(dbl(body.get("longitude")));
        if (body.containsKey("formattedAddress")) vendor.setFormattedAddress(text(body, "formattedAddress"));
        if (body.containsKey("googleMapsUrl")) vendor.setGoogleMapsUrl(text(body, "googleMapsUrl"));
        /* ── Supplier Master extension fields ── */
        if (body.containsKey("legalName")) vendor.setLegalName(text(body, "legalName"));
        if (body.containsKey("legalType")) vendor.setLegalType(text(body, "legalType"));
        if (body.containsKey("cin")) vendor.setCin(text(body, "cin"));
        if (body.containsKey("incorporationDate")) vendor.setIncorporationDate(text(body, "incorporationDate"));
        if (body.containsKey("msmeRegNo")) vendor.setMsmeRegNo(text(body, "msmeRegNo"));
        if (body.containsKey("msmeType")) vendor.setMsmeType(text(body, "msmeType"));
        if (body.containsKey("tan")) vendor.setTan(text(body, "tan"));
        if (body.containsKey("creditLimit")) {
            Object credit = body.get("creditLimit");
            vendor.setCreditLimitJson(credit == null ? null : json(credit));
        }
        if (body.containsKey("addresses")) vendor.setAddressesJson(json(blockList(body.get("addresses"))));
        if (body.containsKey("contacts")) vendor.setContactsJson(json(blockList(body.get("contacts"))));
        if (body.containsKey("categories")) vendor.setCategoriesJson(json(blockList(body.get("categories"))));
        /* contracts / bankDetails have no dedicated columns in the
           purchase_vendors schema — they are intentionally not persisted
           until a migration adds them. */
    }

    private String json(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception ex) {
            throw new BadRequestException("Invalid vendor payload");
        }
    }

    private List<Object> parseList(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        try {
            return mapper.readValue(raw, new TypeReference<List<Object>>() { });
        } catch (Exception ex) {
            return List.of();
        }
    }

    private Map<String, Object> parseMap(String raw) {
        if (raw == null || raw.isBlank()) return Map.of();
        try {
            return mapper.readValue(raw, new TypeReference<Map<String, Object>>() { });
        } catch (Exception ex) {
            return Map.of();
        }
    }

    /** Next vendor code: max existing V-<n> + 1, zero-padded to 4 (V-0001). */
    private String nextVendorCode() {
        int max = 0;
        for (PurchaseVendor existing : vendors.findAll()) {
            Matcher matcher = VENDOR_CODE_SEQUENCE.matcher(
                    existing.getVendorCode() == null ? "" : existing.getVendorCode());
            if (matcher.matches()) {
                max = Math.max(max, Integer.parseInt(matcher.group(1)));
            }
        }
        return String.format("V-%04d", max + 1);
    }

    /** Normalises the JSON blocks (addresses / contacts / categories)
     *  into a nullable-free list safe for JSON serialisation. */
    private static List<Object> blockList(Object value) {
        if (!(value instanceof List<?> list)) return List.of();
        return list.stream().map(item -> item == null ? "" : item).toList();
    }

    private static LocalDateTime dateTime(Map<String, Object> body, String key) {
        String value = text(body, key);
        if (value.isBlank()) return null;
        try {
            return LocalDate.parse(value).atStartOfDay();
        } catch (DateTimeParseException ex) {
            throw new BadRequestException("Invalid vendor field: " + key);
        }
    }

    private static Boolean booleanValue(Object value) {
        if (value == null) return null;
        if (value instanceof Boolean b) return b;
        return Boolean.parseBoolean(String.valueOf(value));
    }

    private static Double dbl(Object value) {
        if (value == null || String.valueOf(value).isBlank()) return null;
        try {
            return Double.valueOf(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private static BigDecimal decimal(Object value) {
        if (value == null || String.valueOf(value).isBlank()) return null;
        try {
            return new BigDecimal(String.valueOf(value));
        } catch (NumberFormatException ex) {
            throw new BadRequestException("Invalid numeric vendor field");
        }
    }

    private static String text(Map<String, Object> body, String key) {
        Object value = body == null ? null : body.get(key);
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static Integer integer(Map<String, Object> body, String key) {
        String value = text(body, key);
        if (value.isBlank()) return null;
        try {
            return Integer.valueOf(value);
        } catch (NumberFormatException ex) {
            throw new BadRequestException("Invalid vendor field: " + key);
        }
    }

    private static boolean contains(String value, String search) {
        return value != null && value.toLowerCase().contains(search);
    }

    /**
     * Applies the list sort requested by the UI. The token is the column key,
     * dash-prefixed for descending (e.g. {@code -createdAt}); an absent or
     * unknown column leaves the natural order untouched.
     */
    private static void applySort(List<Map<String, Object>> records, String sort) {
        if (sort == null || sort.isBlank() || "null".equalsIgnoreCase(sort)) return;
        String token = sort.trim();
        boolean descending = token.startsWith("-");
        String field = (descending ? token.substring(1) : token).trim();
        if (field.isEmpty()) return;
        records.sort((a, b) -> {
            int cmp = compareValues(a.get(field), b.get(field));
            return descending ? -cmp : cmp;
        });
    }

    /** Numeric compare when both values are numbers, else case-insensitive text. */
    private static int compareValues(Object a, Object b) {
        if (a instanceof Number && b instanceof Number) {
            return Double.compare(((Number) a).doubleValue(), ((Number) b).doubleValue());
        }
        String left = a == null ? "" : String.valueOf(a);
        String right = b == null ? "" : String.valueOf(b);
        return left.compareToIgnoreCase(right);
    }
}
