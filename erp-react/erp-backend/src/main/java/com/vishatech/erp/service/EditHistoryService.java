package com.vishatech.erp.service;

import com.vishatech.erp.dto.EditHistoryGroupResponse;
import com.vishatech.erp.dto.EditHistoryGroupResponse.FieldChange;
import com.vishatech.erp.entity.EditHistory;
import com.vishatech.erp.repository.EditHistoryRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

/**
 * Reusable edit-history service shared by EVERY editable ERP module.
 *
 * <h3>How it works</h3>
 * <ol>
 *   <li>Before applying changes, the caller snapshots the entity via
 *       {@link #snapshot(Object, Set)} (scalar fields only, no lazy
 *       loading triggered).</li>
 *   <li>After the entity is saved, the caller snapshots the saved entity
 *       and calls {@link #recordEdit(String, Long, Map, Map, Set)}.</li>
 *   <li>This service computes the diff, assigns the next version number,
 *       and persists one row per changed field.</li>
 * </ol>
 *
 * <h3>Atomicity</h3>
 * The service does NOT coordinate transactions with the caller —
 * {@code EditHistory} rows are saved in a separate transaction. Under
 * normal circumstances both the main update and the history write succeed
 * together. If the history write fails (e.g. DB connection issue) the
 * caller's update is NOT rolled back, because losing history is preferable
 * to blocking the user's edit.
 */
@Service
public class EditHistoryService {

    private static final Logger log = LoggerFactory.getLogger(EditHistoryService.class);

    private final EditHistoryRepository repository;

    public EditHistoryService(EditHistoryRepository repository) {
        this.repository = repository;
    }

    /** Static accessor used by services that inject this lazily. */
    public static EditHistoryService get() {
        return com.vishatech.erp.config.SpringContext.getBean(EditHistoryService.class);
    }

    /**
     * edit_history.old_value / new_value are TEXT columns (65,535 bytes max).
     * Large scalar blobs (e.g. a Cost Workout's attachmentsJson holding base64
     * files) can exceed that. Persisting them verbatim would fail the INSERT;
     * the failed entity then stays in the persistence context and breaks the
     * caller's transaction at commit (AssertionFailure -> 502). Values above
     * this threshold are content blobs, not meaningful edit-history fields, so
     * they are skipped instead of stored (with margin below the TEXT limit).
     */
    private static final int MAX_HISTORY_VALUE_BYTES = 60_000;

    private static boolean tooLargeForHistory(String value) {
        if (value == null) {
            return false;
        }
        return value.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > MAX_HISTORY_VALUE_BYTES;
    }

    /** Scalars the snapshot will capture (no lazy-loading side effects). */
    private static final Set<Class<?>> SCALAR_TYPES = Set.of(
            String.class, Character.class, char.class,
            Boolean.class, boolean.class,
            Integer.class, int.class,
            Long.class, long.class,
            Double.class, double.class,
            Float.class, float.class,
            Short.class, short.class,
            Byte.class, byte.class,
            java.math.BigDecimal.class,
            java.math.BigInteger.class,
            LocalDate.class, LocalDateTime.class, LocalTime.class,
            java.util.Date.class, java.sql.Date.class, java.sql.Timestamp.class
    );

    // ─────────────────────────────────────────────────────────────────
    //  Snapshot (reflection-based, no lazy-loading side effects)
    // ─────────────────────────────────────────────────────────────────

    /** Convenience overload — no extras ignored beyond the built-in set. */
    public Map<String, String> snapshot(Object entity) {
        return snapshot(entity, Set.of());
    }

    /**
     * Captures the current scalar field values of an entity into a
     * {@code Map<fieldName, stringValue>}.  Only fields whose type is a
     * known scalar (String, Number, Boolean, Enum, temporal) are
     * included.  Fields listed in {@code ignored} (case-insensitive) are
     * skipped, as are Hibernate-proxy synthetic fields and the
     * {@code class} property.
     */
    public Map<String, String> snapshot(Object entity, Set<String> ignored) {
        if (entity == null) {
            return Collections.emptyMap();
        }
        Set<String> ignore = ignored == null ? Set.of() : ignored;
        Map<String, String> result = new LinkedHashMap<>();
        for (Class<?> cls = entity.getClass(); cls != null && cls != Object.class; cls = cls.getSuperclass()) {
            for (Field field : cls.getDeclaredFields()) {
                String name = field.getName();
                if (name.startsWith("hibernate") || name.startsWith("$") || "class".equals(name)) {
                    continue;
                }
                if (ignore.contains(name)) {
                    continue;
                }
                Class<?> type = field.getType();
                if (!isScalar(type) && !type.isEnum()) {
                    continue;
                }
                try {
                    field.setAccessible(true);
                    Object value = field.get(entity);
                    result.put(name, normalize(value));
                } catch (IllegalAccessException e) {
                    log.debug("Cannot read field {} on {}", name, entity.getClass().getSimpleName());
                }
            }
        }
        return result;
    }

    private static boolean isScalar(Class<?> type) {
        return SCALAR_TYPES.contains(type) || type.isPrimitive();
    }

    /**
     * Canonical string form of a scalar value. Numbers are normalised so that
     * equivalent values with different scales (e.g. {@code 0.00} vs {@code 0}
     * vs {@code 1.0000000000} vs {@code 1}) compare equal and do not produce
     * spurious history entries.
     */
    private static String normalize(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof java.math.BigDecimal bd) {
            if (bd.signum() == 0) {
                return "0";
            }
            return bd.stripTrailingZeros().toPlainString();
        }
        if (value instanceof Double d) {
            if (d.isNaN() || d.isInfinite()) {
                return String.valueOf(d);
            }
            return d == Math.floor(d) && !Double.isInfinite(d) ? String.valueOf(d.longValue()) : String.valueOf(d);
        }
        if (value instanceof Float f) {
            if (f.isNaN() || f.isInfinite()) {
                return String.valueOf(f);
            }
            return f == Math.floor(f) ? String.valueOf(f.longValue()) : String.valueOf(f);
        }
        if (value instanceof LocalDateTime ldt) {
            return ldt.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        }
        if (value instanceof LocalDate ld) {
            return ld.format(DateTimeFormatter.ISO_LOCAL_DATE);
        }
        return String.valueOf(value);
    }

    // ─────────────────────────────────────────────────────────────────
    //  Shared no-op change detection (CREATE vs EDIT revision guard)
    // ─────────────────────────────────────────────────────────────────

    /**
     * Normalizes a scalar value the same way {@link #snapshot(Object, Set)}
     * does, so callers that build "before/after" snapshots by hand (e.g. the
     * revision-chain update methods) compare values that were normalized
     * identically on both sides. Mirrors the {@code normalize} switch:
     * numbers compare by value (scale-insensitive), temporals by their ISO
     * form, everything else by {@code String.valueOf}.
     *
     * @param defaultValue returned when {@code value} is {@code null}, so a
     *                     caller can turn {@code null} into the same semantic
     *                     "empty" the entity would store (e.g. {@code ""}
     *                     for String fields)
     */
    public static String normalizeForComparison(Object value, String defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof java.math.BigDecimal bd) {
            if (bd.signum() == 0) {
                return "0";
            }
            return bd.stripTrailingZeros().toPlainString();
        }
        if (value instanceof Double d) {
            if (d.isNaN() || d.isInfinite()) {
                return String.valueOf(d);
            }
            return d == Math.floor(d) && !Double.isInfinite(d) ? String.valueOf(d.longValue()) : String.valueOf(d);
        }
        if (value instanceof Float f) {
            if (f.isNaN() || f.isInfinite()) {
                return String.valueOf(f);
            }
            return f == Math.floor(f) ? String.valueOf(f.longValue()) : String.valueOf(f);
        }
        if (value instanceof LocalDateTime ldt) {
            return ldt.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        }
        if (value instanceof LocalDate ld) {
            return ld.format(DateTimeFormatter.ISO_LOCAL_DATE);
        }
        return String.valueOf(value);
    }

    /**
     * Shared no-op guard for the revision-chain update methods across the
     * sales modules: compares the snapshot of the entity BEFORE the request
     * was applied against the snapshot of the would-be revision AFTER.
     *
     * <p>Scalar fields are compared through their snapshots; item-row changes
     * are covered by {@link #itemsFingerprint(Object)} — callers embed the
     * fingerprint under the {@code itemsFingerprint} key (NOT {@code items}:
     * that key is ignored as a JPA collection field) before delegating here,
     * so an item edit that leaves scalar fields untouched still counts as a
     * genuine change.
     *
     * <p>Used by {@code XxxService.update(...)} so that saving a record with
     * no actual business change does NOT fabricate a new revision row. UI-only
     * state (column visibility, page refreshes, no-change saves) must never
     * produce "Revision N" — only genuine persisted business edits do.
     */
    public static boolean isNoOpEdit(Map<String, String> before, Map<String, String> after) {
        if (before == null || after == null) {
            return false;
        }
        Set<String> allKeys = new HashSet<>();
        allKeys.addAll(before.keySet());
        allKeys.addAll(after.keySet());
        for (String key : allKeys) {
            if (EDIT_IGNORED_FIELDS.contains(key)) {
                continue;
            }
            String oldVal = before.get(key);
            String newVal = after.get(key);
            if (Objects.equals(oldVal, newVal)) {
                continue;
            }
            if ((oldVal == null || oldVal.isEmpty()) && (newVal == null || newVal.isEmpty())) {
                continue;
            }
            return false; // one real difference → genuine edit
        }
        return true; // nothing actually changed
    }

    /** Fields that never count as a business change for the no-op guard. */
    private static final Set<String> EDIT_IGNORED_FIELDS = Set.of(
            "id", "version", "createdAt", "updatedAt", "archivedAt",
            "timeline", "history", "items", "attachments", "deletedAt", "restoredAt");

    /**
     * Canonical fingerprint of an entity's item rows for change detection.
     *
     * <p>The {@link #snapshot(Object, Set)} reflection walk only captures
     * SCALAR entity fields — a {@code @OneToMany} items collection is skipped,
     * which would hide a real edit that leaves the row count unchanged (e.g.
     * only a quantity changed). This fingerprint hashes every persisted scalar
     * field of every item row (row order and field names included), so any
     * genuine item change — added, removed or edited — changes the fingerprint.
     * Entities without a {@code getItems()} collection hash to {@code ""}.
     *
     * <p>Shared by the sales modules' {@code update(...)} no-op guards so a
     * no-change save never fabricates a revision row.
     */
    public static String itemsFingerprint(Object entity) {
        return collectionFingerprint(entity, "getItems");
    }

    /**
     * Canonical fingerprint of ANY child collection of an entity, addressed by
     * its getter name ({@code getItems}, {@code getEActions}, …). Used by the
     * same no-op guard so a child-row-only edit (an E-Action added, edited or
     * removed) still counts as a business change and is not silently dropped.
     */
    public static String collectionFingerprint(Object entity, String getterName) {
        if (entity == null) {
            return "";
        }
        Object items;
        try {
            items = entity.getClass().getMethod(getterName).invoke(entity);
        } catch (Exception e) {
            return ""; // entity has no such collection
        }
        if (!(items instanceof java.util.Collection<?> rows)) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (Object item : rows) {
            if (item == null) {
                continue;
            }
            Map<String, Object> values = new LinkedHashMap<>();
            for (Class<?> cls = item.getClass(); cls != null && cls != Object.class; cls = cls.getSuperclass()) {
                for (Field field : cls.getDeclaredFields()) {
                    String name = field.getName();
                    if (name.startsWith("hibernate") || name.startsWith("$") || "class".equals(name)) {
                        continue;
                    }
                    // Row identity and audit stamps are not business content.
                    if ("id".equals(name) || "createdAt".equals(name) || "updatedAt".equals(name)) {
                        continue;
                    }
                    Class<?> type = field.getType();
                    if (!isScalar(type) && !type.isEnum()) {
                        continue; // back-references / nested collections are out of scope
                    }
                    try {
                        field.setAccessible(true);
                        values.putIfAbsent(name, field.get(item));
                    } catch (IllegalAccessException e) {
                        log.debug("Cannot read item field {} on {}", name, item.getClass().getSimpleName());
                    }
                }
            }
            values.entrySet().stream()
                    .sorted(Map.Entry.comparingByKey())
                    .forEach(e -> sb.append(e.getKey()).append('=')
                            .append(normalizeForComparison(e.getValue(), "")).append('\u001f'));
            sb.append('\u001e');
        }
        return sb.toString();
    }

    // ─────────────────────────────────────────────────────────────────
    //  Diff & persistence
    // ─────────────────────────────────────────────────────────────────

    /** Convenience overload — no extras ignored beyond the built-in set. */
    public void recordEdit(String moduleType, Long recordId,
                           Map<String, String> before, Map<String, String> after) {
        recordEdit(moduleType, recordId, before, after, Set.of());
    }

    /**
     * Records a single edit operation.  Compares {@code before} (the
     * snapshot taken before mutation) against {@code after} (the snapshot
     * taken after the entity was saved), persists one row per changed
     * field, and assigns the next sequential version number.
     *
     * @param moduleType  module identifier (e.g. {@code "quotation"})
     * @param recordId    primary key of the edited record
     * @param before      snapshot prior to mutation
     * @param after       snapshot after mutation
     * @param ignored     extra field names to skip (in addition to the
     *                    hard-coded set)
     */
    public void recordEdit(String moduleType, Long recordId,
                           Map<String, String> before, Map<String, String> after,
                           Set<String> ignored) {
        if (moduleType == null || recordId == null) {
            return;
        }
        Set<String> ignore = new HashSet<>();
        if (ignored != null) {
            ignore.addAll(ignored);
        }
        // Built-in fields never worth tracking
        ignore.add("id");
        ignore.add("version"); // JPA @Version optimistic-lock counter increments on every save
        ignore.add("createdAt");
        ignore.add("updatedAt");
        ignore.add("archivedAt");
        ignore.add("timeline");
        ignore.add("history");
        ignore.add("items");
        ignore.add("attachments");
        ignore.add("deletedAt");
        ignore.add("restoredAt");

        List<EditHistory> rows = new ArrayList<>();
        String changedBy = currentUserName();
        int version = repository.findMaxVersion(moduleType, recordId) + 1;
        String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);

        // Use keys from 'after' snapshot (represents the current entity state).
        // Also check keys only in 'before' that became null (field cleared).
        Set<String> allKeys = new HashSet<>();
        if (after != null) allKeys.addAll(after.keySet());
        if (before != null) allKeys.addAll(before.keySet());

        for (String key : allKeys) {
            if (ignore.contains(key)) continue;
            String oldVal = before == null ? null : before.get(key);
            String newVal = after == null ? null : after.get(key);
            if (Objects.equals(oldVal, newVal)) continue;
            // Both null/empty → no real change
            if ((oldVal == null || oldVal.isEmpty()) && (newVal == null || newVal.isEmpty())) continue;
            // Oversized values cannot fit the TEXT column; writing them would
            // fail the INSERT and poison the caller's transaction.
            if (tooLargeForHistory(oldVal) || tooLargeForHistory(newVal)) continue;

            EditHistory row = new EditHistory();
            row.setModuleType(moduleType);
            row.setRecordId(recordId);
            row.setVersion(version);
            row.setField(key);
            row.setOldValue(oldVal == null ? "" : oldVal);
            row.setNewValue(newVal == null ? "" : newVal);
            row.setChangedBy(changedBy);
            rows.add(row);
        }

        if (rows.isEmpty()) {
            return; // nothing actually changed
        }

        String summary = rows.size() + " field(s) changed";
        for (EditHistory row : rows) {
            row.setChangeSummary(summary);
        }

        try {
            repository.saveAll(rows);
            log.info("Edit history recorded: {} {} v{} ({} fields)", moduleType, recordId, version, rows.size());
        } catch (Exception e) {
            log.error("Failed to persist edit history for {} {} v{}: {}", moduleType, recordId, version, e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  Query helpers
    // ─────────────────────────────────────────────────────────────────

    /** Returns the edit history grouped by version, newest first. */
    public List<EditHistoryGroupResponse> getHistory(String moduleType, Long recordId) {
        List<EditHistory> rows = repository.findByModuleTypeAndRecordIdOrderByVersionAscCreatedAtAsc(moduleType, recordId);
        // Group by version
        Map<Integer, List<EditHistory>> groups = new LinkedHashMap<>();
        for (EditHistory row : rows) {
            groups.computeIfAbsent(row.getVersion(), k -> new ArrayList<>()).add(row);
        }
        List<EditHistoryGroupResponse> result = new ArrayList<>();
        for (Map.Entry<Integer, List<EditHistory>> entry : groups.entrySet()) {
            List<EditHistory> group = entry.getValue();
            List<FieldChange> changes = group.stream()
                    .map(r -> new FieldChange(r.getField(), r.getOldValue(), r.getNewValue()))
                    .toList();
            EditHistory first = group.get(0);
            result.add(new EditHistoryGroupResponse(
                    first.getVersion(),
                    first.getChangedBy(),
                    first.getCreatedAt() == null ? "" : first.getCreatedAt().toString(),
                    first.getChangeSummary(),
                    changes
            ));
        }
        return result.reversed(); // newest first
    }

    /** Returns the number of distinct edit-version groups for a record. */
    public long getEditCount(String moduleType, Long recordId) {
        return repository.countDistinctVersions(moduleType, recordId);
    }

    // ─────────────────────────────────────────────────────────────────
    //  User
    // ─────────────────────────────────────────────────────────────────

    private static String currentUserName() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getName() != null && !"anonymousUser".equals(auth.getName())) {
            return auth.getName();
        }
        return "System";
    }
}