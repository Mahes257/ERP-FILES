package com.vishatech.erp.service.production;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.dto.production.ProductionMachineDTO;
import com.vishatech.erp.dto.production.ProductionMachineRequest;
import com.vishatech.erp.dto.production.ProductionStatusMasterDTO;
import com.vishatech.erp.dto.production.ProductionStatusMasterRequest;
import com.vishatech.erp.dto.production.ProductionWorkCenterDTO;
import com.vishatech.erp.dto.production.ProductionWorkCenterRequest;
import com.vishatech.erp.entity.AppSetting;
import com.vishatech.erp.entity.production.ProductionMachine;
import com.vishatech.erp.entity.production.ProductionStatusMaster;
import com.vishatech.erp.entity.production.ProductionWorkCenter;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.DuplicateResourceException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.AppSettingRepository;
import com.vishatech.erp.repository.production.ProductionMachineRepository;
import com.vishatech.erp.repository.production.ProductionStatusMasterRepository;
import com.vishatech.erp.repository.production.ProductionWorkCenterRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Master data behind Production → Settings.
 *
 * <p>Machines, work centers and status masters used to live only in the browser
 * (localStorage / seed arrays), so the configuration was lost on another
 * device and the Machine Utilization report could not read real master data.
 * Each list is now a MySQL table owned by this service:
 *
 * <pre>
 *   Machines      → production_machines        (Machine Shop / Machine Utilization)
 *   Work Centers  → production_work_centers    (shop floor areas)
 *   Status Masters→ production_status_masters   (status vocabulary)
 *   Parameters    → app_settings (production.param.*)  (existing generic key/value table)
 * </pre>
 *
 * <p>Production Parameters deliberately reuse the existing generic
 * {@code app_settings} table rather than adding a second settings system: they
 * are a flat set of scalar values, and the frontend already merges the stored
 * values over its own defaults.
 */
@Service
public class ProductionSettingsService {

    /** app_settings prefix that keeps Production parameters apart from other settings. */
    private static final String PARAM_PREFIX = "production.param.";

    /**
     * The Users &amp; Roles register, kept as one JSON document in the same
     * {@code app_settings} table.
     *
     * <p>These are Production master-data records — operators, supervisors,
     * inspectors — not ERP login accounts: the {@code users} table belongs to
     * authentication and a Production user has no password. They are stored
     * server-side (instead of the browser's localStorage) so that the Users &amp;
     * Roles screen and Access Management read ONE list, on every device, and a
     * created user survives a page refresh and a backend restart.
     */
    private static final String USERS_KEY = "production.users";
    private static final String USER_ID_PREFIX = "USR-";
    private static final int USERS_DOCUMENT_VERSION = 1;
    private static final List<String> USER_STATUSES = List.of("Active", "Inactive");

    /**
     * Notification preferences, one {@code app_settings} row per toggle.
     *
     * <p>Same table and same flat key scheme as Production Parameters — a
     * preference is a scalar, so a second settings store would be unnecessary.
     * The prefix keeps them out of the Parameters screen, which only reads
     * {@code production.param.*}.
     *
     * <p>Every key below is answered by a real Production workflow transition
     * (see {@link ProductionNotificationPublisher}); a toggle that controlled
     * nothing would be a lie in the UI, so there are none.
     */
    private static final String NOTIF_PREFIX = "production.notif.";

    /**
     * Factory defaults for the notification preferences, in display order.
     *
     * <p>Approval-stage and failure events are ON because someone has to act on
     * them. Ordinary progress events (started, completed, packing/dispatch
     * pending) default ON as well so a fresh install behaves like a monitoring
     * feed; they can be switched off individually.
     */
    public static final Map<String, Boolean> NOTIFICATION_DEFAULTS;

    static {
        Map<String, Boolean> defaults = new LinkedHashMap<>();
        // Work orders
        defaults.put("workOrderPendingApproval", true);
        defaults.put("workOrderAdminApprovalPending", true);
        defaults.put("workOrderApproved", true);
        defaults.put("workOrderRejected", true);
        defaults.put("workOrderReleased", false);
        defaults.put("workOrderStarted", true);
        defaults.put("workOrderOnHold", true);
        defaults.put("workOrderSentToQuality", true);
        defaults.put("workOrderCompleted", true);
        defaults.put("workOrderFailed", true);
        defaults.put("workOrderCancelled", true);
        // Technical verification
        defaults.put("technicalVerificationPending", true);
        defaults.put("technicalVerificationApproved", true);
        defaults.put("technicalVerificationRejected", true);
        // Drawings
        defaults.put("drawingPendingApproval", true);
        defaults.put("drawingApproved", true);
        defaults.put("drawingRejected", true);
        // Models
        defaults.put("modelPendingApproval", true);
        defaults.put("modelApproved", true);
        defaults.put("modelRejected", true);
        // Quality inspection
        defaults.put("qualityInspectionPending", true);
        defaults.put("qualityInspectionPassed", true);
        defaults.put("qualityInspectionFailed", true);
        defaults.put("qualityInspectionOnHold", true);
        // Packing
        defaults.put("packingPending", false);
        defaults.put("packingCompleted", true);
        // Dispatch
        defaults.put("dispatchPending", false);
        defaults.put("dispatchCompleted", true);
        NOTIFICATION_DEFAULTS = java.util.Collections.unmodifiableMap(defaults);
    }

    private static final String MACHINE_STATUSES = "Available|Running|Maintenance|Inactive";
    private static final String WORK_CENTER_STATUSES = "Active|Inactive";

    private final ProductionMachineRepository machineRepository;
    private final ProductionWorkCenterRepository workCenterRepository;
    private final ProductionStatusMasterRepository statusRepository;
    private final AppSettingRepository appSettingRepository;
    private final ObjectMapper objectMapper;

    public ProductionSettingsService(
            ProductionMachineRepository machineRepository,
            ProductionWorkCenterRepository workCenterRepository,
            ProductionStatusMasterRepository statusRepository,
            AppSettingRepository appSettingRepository,
            ObjectMapper objectMapper) {
        this.machineRepository = machineRepository;
        this.workCenterRepository = workCenterRepository;
        this.statusRepository = statusRepository;
        this.appSettingRepository = appSettingRepository;
        this.objectMapper = objectMapper;
    }

    // ==================================================================
    // Machines
    // ==================================================================

    @Transactional(readOnly = true)
    public List<ProductionMachineDTO> listMachines(String department) {
        List<ProductionMachine> rows = (department == null || department.isBlank())
                ? machineRepository.findAllByOrderByMachineCodeAsc()
                : machineRepository.findByDepartmentOrderByMachineCodeAsc(department);
        return rows.stream().map(ProductionSettingsService::toMachineDTO).toList();
    }

    @Transactional
    public ProductionMachineDTO createMachine(ProductionMachineRequest request) {
        String code = requireText(request.id(), "Machine ID");
        if (machineRepository.existsByMachineCode(code)) {
            throw new DuplicateResourceException("Machine " + code + " already exists.");
        }
        ProductionMachine machine = new ProductionMachine();
        machine.setMachineCode(code);
        applyMachine(machine, request);
        return toMachineDTO(machineRepository.save(machine));
    }

    @Transactional
    public ProductionMachineDTO updateMachine(String code, ProductionMachineRequest request) {
        ProductionMachine machine = machineRepository.findByMachineCode(code)
                .orElseThrow(() -> new ResourceNotFoundException("Machine " + code + " not found."));

        // The machine ID is editable. A rename must not collide with another row.
        String nextCode = requireText(request.id(), "Machine ID");
        if (!nextCode.equalsIgnoreCase(code) && machineRepository.existsByMachineCode(nextCode)) {
            throw new DuplicateResourceException("Machine " + nextCode + " already exists.");
        }
        machine.setMachineCode(nextCode);
        applyMachine(machine, request);
        return toMachineDTO(machineRepository.save(machine));
    }

    @Transactional
    public void deleteMachine(String code) {
        ProductionMachine machine = machineRepository.findByMachineCode(code)
                .orElseThrow(() -> new ResourceNotFoundException("Machine " + code + " not found."));
        machineRepository.delete(machine);
    }

    /**
     * Resolve the Work Center a machine belongs to against the persisted work
     * center master (Settings → Work Centers).
     *
     * The machine master and the work center master used to be unrelated: the
     * field was free text, so a machine could claim a work center that does not
     * exist, and nothing could tell that the shop-floor area it pointed at had
     * been renamed or removed. The value is now resolved against the master and
     * stored as the canonical work center id, so the reference is always
     * resolvable.
     *
     * A blank value stays blank (a machine need not belong to a work center).
     * The id is preferred; a work center name or location is still accepted and
     * normalised to its id, so records written when the field was free text keep
     * saving instead of failing validation.
     *
     * @throws BadRequestException when the value matches no configured work center
     */
    private String resolveWorkCenterReference(String workCenter) {
        String raw = trimToNull(workCenter);
        if (raw == null) {
            return null;
        }
        List<ProductionWorkCenter> centers = workCenterRepository.findAllByOrderByWorkCenterCodeAsc();
        for (ProductionWorkCenter center : centers) {
            if (raw.equalsIgnoreCase(trimToNull(center.getWorkCenterCode()))) {
                return center.getWorkCenterCode();
            }
        }
        for (ProductionWorkCenter center : centers) {
            if (raw.equalsIgnoreCase(trimToNull(center.getName()))) {
                return center.getWorkCenterCode();
            }
        }
        List<ProductionWorkCenter> byLocation = centers.stream()
                .filter(center -> raw.equalsIgnoreCase(trimToNull(center.getLocation())))
                .toList();
        if (byLocation.size() == 1) {
            return byLocation.get(0).getWorkCenterCode();
        }
        throw new BadRequestException("Unknown Work Center '" + raw
                + "'. Choose a work center from Settings → Work Centers.");
    }

    private void applyMachine(ProductionMachine machine, ProductionMachineRequest request) {
        machine.setName(requireText(request.name(), "Machine Name"));
        machine.setMachineType(requireText(request.type(), "Machine Type"));
        machine.setDepartment(requireText(request.department(), "Department"));
        machine.setWorkCenter(resolveWorkCenterReference(request.workCenter()));
        machine.setStatus(requireOneOf(request.status(), MACHINE_STATUSES, "Machine Status", "Available"));
        machine.setAvailableHours(nonNegative(request.availableHours(), "Available Hours"));
        machine.setRunningHours(nonNegative(request.runningHours(), "Running Hours"));
        machine.setIdleHours(nonNegative(request.idleHours(), "Idle Hours"));
        machine.setMaintenanceHours(nonNegative(request.maintenanceHours(), "Maintenance Hours"));
        machine.setDescription(trimToNull(request.description()));
    }

    private static ProductionMachineDTO toMachineDTO(ProductionMachine machine) {
        return new ProductionMachineDTO(
                machine.getMachineCode(),
                machine.getId(),
                machine.getName(),
                machine.getMachineType(),
                machine.getDepartment(),
                machine.getWorkCenter(),
                machine.getStatus(),
                machine.getAvailableHours(),
                machine.getRunningHours(),
                machine.getIdleHours(),
                machine.getMaintenanceHours(),
                machine.getDescription());
    }

    // ==================================================================
    // Work centers
    // ==================================================================

    @Transactional(readOnly = true)
    public List<ProductionWorkCenterDTO> listWorkCenters(String department) {
        List<ProductionWorkCenter> rows = workCenterRepository.findAllByOrderByWorkCenterCodeAsc();
        if (department != null && !department.isBlank()) {
            rows = rows.stream().filter(wc -> department.equals(wc.getDepartment())).toList();
        }
        return rows.stream().map(ProductionSettingsService::toWorkCenterDTO).toList();
    }

    @Transactional
    public ProductionWorkCenterDTO createWorkCenter(ProductionWorkCenterRequest request) {
        String code = requireText(request.id(), "Work Center ID");
        if (workCenterRepository.existsByWorkCenterCode(code)) {
            throw new DuplicateResourceException("Work center " + code + " already exists.");
        }
        ProductionWorkCenter workCenter = new ProductionWorkCenter();
        workCenter.setWorkCenterCode(code);
        applyWorkCenter(workCenter, request);
        return toWorkCenterDTO(workCenterRepository.save(workCenter));
    }

    @Transactional
    public ProductionWorkCenterDTO updateWorkCenter(String code, ProductionWorkCenterRequest request) {
        ProductionWorkCenter workCenter = workCenterRepository.findByWorkCenterCode(code)
                .orElseThrow(() -> new ResourceNotFoundException("Work center " + code + " not found."));

        String nextCode = requireText(request.id(), "Work Center ID");
        if (!nextCode.equalsIgnoreCase(code) && workCenterRepository.existsByWorkCenterCode(nextCode)) {
            throw new DuplicateResourceException("Work center " + nextCode + " already exists.");
        }
        workCenter.setWorkCenterCode(nextCode);
        applyWorkCenter(workCenter, request);
        return toWorkCenterDTO(workCenterRepository.save(workCenter));
    }

    @Transactional
    public void deleteWorkCenter(String code) {
        ProductionWorkCenter workCenter = workCenterRepository.findByWorkCenterCode(code)
                .orElseThrow(() -> new ResourceNotFoundException("Work center " + code + " not found."));
        workCenterRepository.delete(workCenter);
    }

    private void applyWorkCenter(ProductionWorkCenter workCenter, ProductionWorkCenterRequest request) {
        workCenter.setName(requireText(request.name(), "Work Center Name"));
        workCenter.setDepartment(requireText(request.department(), "Department"));
        workCenter.setLocation(requireText(request.location(), "Location"));
        workCenter.setSupervisor(trimToNull(request.supervisor()));
        workCenter.setStatus(requireOneOf(request.status(), WORK_CENTER_STATUSES, "Status", "Active"));
        workCenter.setDescription(trimToNull(request.description()));
    }

    private static ProductionWorkCenterDTO toWorkCenterDTO(ProductionWorkCenter workCenter) {
        return new ProductionWorkCenterDTO(
                workCenter.getWorkCenterCode(),
                workCenter.getId(),
                workCenter.getName(),
                workCenter.getDepartment(),
                workCenter.getLocation(),
                workCenter.getSupervisor(),
                workCenter.getStatus(),
                workCenter.getDescription());
    }

    // ==================================================================
    // Status masters
    // ==================================================================

    @Transactional(readOnly = true)
    public List<ProductionStatusMasterDTO> listStatuses(String category) {
        List<ProductionStatusMaster> rows = (category == null || category.isBlank())
                ? statusRepository.findAllByOrderByCategoryAscDisplayOrderAscStatusNameAsc()
                : statusRepository.findByCategoryOrderByDisplayOrderAscStatusNameAsc(category);
        return rows.stream().map(ProductionSettingsService::toStatusDTO).toList();
    }

    @Transactional
    public ProductionStatusMasterDTO createStatus(ProductionStatusMasterRequest request) {
        String name = requireText(request.name(), "Status Name");
        String category = requireText(request.category(), "Category");
        if (statusRepository.existsByStatusNameAndCategory(name, category)) {
            throw new DuplicateResourceException(
                    "Status " + name + " already exists in " + category + ".");
        }
        ProductionStatusMaster status = new ProductionStatusMaster();
        status.setStatusName(name);
        status.setCategory(category);
        status.setDescription(trimToNull(request.description()));
        status.setActive(request.active() == null || request.active());
        status.setDisplayOrder(request.displayOrder() != null
                ? request.displayOrder()
                : nextDisplayOrder(category));
        return toStatusDTO(statusRepository.save(status));
    }

    @Transactional
    public ProductionStatusMasterDTO updateStatus(Long id, ProductionStatusMasterRequest request) {
        ProductionStatusMaster status = statusRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Status " + id + " not found."));

        String name = requireText(request.name(), "Status Name");
        String category = requireText(request.category(), "Category");
        if (statusRepository.existsByStatusNameAndCategoryAndIdNot(name, category, id)) {
            throw new DuplicateResourceException(
                    "Status " + name + " already exists in " + category + ".");
        }
        status.setStatusName(name);
        status.setCategory(category);
        status.setDescription(trimToNull(request.description()));
        if (request.active() != null) status.setActive(request.active());
        if (request.displayOrder() != null) status.setDisplayOrder(request.displayOrder());
        return toStatusDTO(statusRepository.save(status));
    }

    @Transactional
    public void deleteStatus(Long id) {
        ProductionStatusMaster status = statusRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Status " + id + " not found."));
        statusRepository.delete(status);
    }

    private int nextDisplayOrder(String category) {
        return (int) statusRepository.countByCategory(category) + 1;
    }

    private static ProductionStatusMasterDTO toStatusDTO(ProductionStatusMaster status) {
        String key = (status.getCategory() + "-" + status.getStatusName())
                .replaceAll("[^A-Za-z0-9]+", "-")
                .toLowerCase();
        return new ProductionStatusMasterDTO(
                status.getId(),
                key,
                status.getStatusName(),
                status.getCategory(),
                status.getDescription(),
                status.getActive(),
                status.getDisplayOrder());
    }

    // ==================================================================
    // Production parameters
    // ==================================================================

    /**
     * Stored parameter overrides (may be empty).
     *
     * <p>Only the values an operator has actually changed are returned — the
     * defaults for the six configuration selects and the four feature toggles
     * stay in the frontend, which merges these values over them. Values are
     * stored JSON-encoded so a boolean, a number and a string come back as the
     * type they were saved with.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getParameters() {
        Map<String, Object> values = new LinkedHashMap<>();
        appSettingRepository.findAll().stream()
                .filter(setting -> setting.getSettingKey() != null
                        && setting.getSettingKey().startsWith(PARAM_PREFIX))
                .sorted((a, b) -> a.getSettingKey().compareTo(b.getSettingKey()))
                .forEach(setting -> values.put(
                        setting.getSettingKey().substring(PARAM_PREFIX.length()),
                        decode(setting.getSettingValue())));
        return values;
    }

    /**
     * Persist the parameter map as a whole. Keys not present in {@code values}
     * are removed, so "Reset" restores the frontend defaults instead of leaving
     * a stale override behind.
     */
    @Transactional
    public Map<String, Object> saveParameters(Map<String, Object> values) {
        if (values == null || values.isEmpty()) {
            appSettingRepository.deleteAll(appSettingRepository.findAll().stream()
                    .filter(setting -> setting.getSettingKey() != null
                            && setting.getSettingKey().startsWith(PARAM_PREFIX))
                    .toList());
            return new LinkedHashMap<>();
        }

        Map<String, Object> sorted = new TreeMap<>(values);
        List<AppSetting> existing = appSettingRepository.findAll().stream()
                .filter(setting -> setting.getSettingKey() != null
                        && setting.getSettingKey().startsWith(PARAM_PREFIX))
                .toList();

        for (Map.Entry<String, Object> entry : sorted.entrySet()) {
            String key = PARAM_PREFIX + entry.getKey();
            String encoded = encode(entry.getValue());
            AppSetting setting = existing.stream()
                    .filter(s -> key.equals(s.getSettingKey()))
                    .findFirst()
                    .orElseGet(() -> new AppSetting(key, encoded));
            setting.setSettingKey(key);
            setting.setSettingValue(encoded);
            appSettingRepository.save(setting);
        }

        // Drop overrides the caller no longer sends (e.g. after a reset).
        List<AppSetting> stale = existing.stream()
                .filter(s -> !sorted.containsKey(s.getSettingKey().substring(PARAM_PREFIX.length())))
                .toList();
        if (!stale.isEmpty()) appSettingRepository.deleteAll(stale);

        return getParameters();
    }

    // ==================================================================
    // Notification preferences
    // ==================================================================

    /**
     * The saved notification preferences, defaults filled in.
     *
     * <p>Returned as the whole set (never a partial map) so the Settings screen
     * can always render every toggle, including the ones never saved.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getNotificationPreferences() {
        Map<String, Object> stored = readNotificationRows();
        Map<String, Object> result = new LinkedHashMap<>();
        NOTIFICATION_DEFAULTS.forEach((key, fallback) -> {
            Object value = stored.get(key);
            result.put(key, value instanceof Boolean flag ? flag : fallback);
        });
        return result;
    }

    /**
     * Persist the whole preference set.
     *
     * <p>Keys outside {@link #NOTIFICATION_DEFAULTS} are ignored rather than
     * stored: the stored map is echoed to the screen, so an unknown key written
     * by hand would otherwise live forever. A value that is not a boolean is
     * rejected — silently coercing {@code "maybe"} to {@code false} would turn
     * a malformed request into a switched-off alert.
     */
    @Transactional
    public Map<String, Object> saveNotificationPreferences(Map<String, Object> values) {
        if (values == null) {
            throw new BadRequestException("The notification preferences are required.");
        }
        List<AppSetting> existing = notificationRows();
        for (Map.Entry<String, Boolean> entry : NOTIFICATION_DEFAULTS.entrySet()) {
            String key = entry.getKey();
            if (!values.containsKey(key)) {
                continue;
            }
            Object raw = values.get(key);
            boolean enabled;
            if (raw instanceof Boolean flag) {
                enabled = flag;
            } else if (raw instanceof String text && ("true".equalsIgnoreCase(text) || "false".equalsIgnoreCase(text))) {
                enabled = Boolean.parseBoolean(text);
            } else {
                throw new BadRequestException("Notification preference " + key + " must be true or false.");
            }
            appSettingRepository.upsert(NOTIF_PREFIX + key, enabled ? "true" : "false");
        }
        // Rows the caller no longer sends fall back to their documented default;
        // nothing is deleted, so a preference toggled off is never silently lost.
        return getNotificationPreferences();
    }

    /**
     * Whether a notification preference is on. Unknown keys are ON: a workflow
     * event with no toggle must still be delivered.
     */
    @Transactional(readOnly = true)
    public boolean isNotificationEnabled(String preference) {
        if (preference == null || preference.isBlank()) {
            return true;
        }
        Boolean fallback = NOTIFICATION_DEFAULTS.get(preference);
        if (fallback == null) {
            return true;
        }
        Object stored = readNotificationRows().get(preference);
        return stored instanceof Boolean flag ? flag : fallback;
    }

    private List<AppSetting> notificationRows() {
        return appSettingRepository.findAll().stream()
                .filter(setting -> setting.getSettingKey() != null
                        && setting.getSettingKey().startsWith(NOTIF_PREFIX))
                .toList();
    }

    private Map<String, Object> readNotificationRows() {
        Map<String, Object> values = new LinkedHashMap<>();
        for (AppSetting setting : notificationRows()) {
            String key = setting.getSettingKey().substring(NOTIF_PREFIX.length());
            Object decoded = decode(setting.getSettingValue());
            if (decoded instanceof Boolean flag) {
                values.put(key, flag);
            } else if (decoded instanceof String text) {
                if ("true".equalsIgnoreCase(text)) values.put(key, Boolean.TRUE);
                else if ("false".equalsIgnoreCase(text)) values.put(key, Boolean.FALSE);
            }
        }
        return values;
    }

    // ==================================================================
    // Users & Roles (Production master data)
    // ==================================================================

    /**
     * The Production user register, oldest first.
     *
     * <p>Shape of one record: {@code id, name, email, role, department, status,
     * lastLogin}. {@code id} is the stable {@code USR-NNN} identity Access
     * Management keys an individual permission configuration on.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> listUsers() {
        return appSettingRepository.findBySettingKey(USERS_KEY)
                .map(AppSetting::getSettingValue)
                .map(this::decodeUsers)
                .orElseGet(List::of);
    }

    /**
     * Replace the whole register.
     *
     * <p>The server owns the identifier: a supplied {@code USR-NNN} is kept
     * (that is what an existing permission row points at), a missing or
     * duplicated one is replaced by the next free {@code USR-NNN}, and the id
     * never changes on a later save. Name and email are required and the email
     * must be unique — two register rows with the same address would make the
     * Access Management dropdown ambiguous.
     */
    @Transactional
    public List<Map<String, Object>> saveUsers(List<Map<String, Object>> incoming) {
        if (incoming == null) {
            throw new BadRequestException("The user list is required");
        }
        List<Map<String, Object>> normalized = new java.util.ArrayList<>();
        java.util.Set<String> ids = new java.util.LinkedHashSet<>();
        java.util.Set<String> emails = new java.util.LinkedHashSet<>();
        int next = nextUserIdSeed(listUsers());

        for (Map<String, Object> entry : incoming) {
            if (entry == null) {
                throw new BadRequestException("A user record cannot be empty");
            }
            String name = requireText(text(entry.get("name")), "User name");
            String email = requireText(text(entry.get("email")), "Email").toLowerCase();
            String role = requireText(text(entry.get("role")), "Role");
            String department = text(entry.get("department"));
            String status = text(entry.get("status"));
            if (status.isEmpty()) {
                status = "Active";
            }
            if (!USER_STATUSES.contains(status)) {
                throw new BadRequestException("User status must be Active or Inactive");
            }
            if (!emails.add(email)) {
                throw new DuplicateResourceException("A Production user with the email " + email + " already exists.");
            }

            String id = text(entry.get("id"));
            if (id.isEmpty() || ids.contains(id)) {
                do {
                    id = USER_ID_PREFIX + String.format("%03d", next++);
                } while (ids.contains(id));
            }
            ids.add(id);

            Map<String, Object> record = new LinkedHashMap<>();
            record.put("id", id);
            record.put("name", name);
            record.put("email", email);
            record.put("role", role);
            record.put("department", department);
            record.put("status", status);
            record.put("lastLogin", text(entry.get("lastLogin")).isEmpty()
                    ? "Never" : text(entry.get("lastLogin")));
            normalized.add(record);
        }

        try {
            Map<String, Object> document = new LinkedHashMap<>();
            document.put("version", USERS_DOCUMENT_VERSION);
            document.put("users", normalized);
            appSettingRepository.upsert(USERS_KEY, objectMapper.writeValueAsString(document));
        } catch (JsonProcessingException exception) {
            throw new BadRequestException("Production users could not be stored");
        }
        return listUsers();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> decodeUsers(String value) {
        try {
            Map<String, Object> document = objectMapper.readValue(value, Map.class);
            Object users = document.get("users");
            if (!(users instanceof List<?> list)) {
                return List.of();
            }
            List<Map<String, Object>> result = new java.util.ArrayList<>();
            for (Object item : list) {
                if (!(item instanceof Map<?, ?> row)) {
                    continue;
                }
                Map<String, Object> record = new LinkedHashMap<>();
                record.put("id", text(row.get("id")));
                record.put("name", text(row.get("name")));
                record.put("email", text(row.get("email")));
                record.put("role", text(row.get("role")));
                record.put("department", text(row.get("department")));
                record.put("status", text(row.get("status")).isEmpty() ? "Active" : text(row.get("status")));
                record.put("lastLogin", text(row.get("lastLogin")).isEmpty() ? "Never" : text(row.get("lastLogin")));
                result.add(record);
            }
            return result;
        } catch (JsonProcessingException | ClassCastException exception) {
            // An unreadable register must not hide the settings page; it reads as empty.
            return List.of();
        }
    }

    /** Highest existing {@code USR-NNN} + 1, so a new record never reuses an id. */
    private static int nextUserIdSeed(List<Map<String, Object>> users) {
        int max = 0;
        for (Map<String, Object> user : users) {
            String id = text(user.get("id"));
            if (!id.startsWith(USER_ID_PREFIX)) {
                continue;
            }
            try {
                max = Math.max(max, Integer.parseInt(id.substring(USER_ID_PREFIX.length())));
            } catch (NumberFormatException ignored) {
                // A hand-edited id does not take part in the sequence.
            }
        }
        return max + 1;
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private String encode(Object value) {
        try {
            String json = objectMapper.writeValueAsString(value);
            if (json.length() > 120) {
                throw new BadRequestException("Production parameter value is too long.");
            }
            return json;
        } catch (JsonProcessingException e) {
            throw new BadRequestException("Production parameter value could not be stored.");
        }
    }

    private Object decode(String stored) {
        if (stored == null || stored.isBlank()) return "";
        try {
            return objectMapper.readValue(stored, Object.class);
        } catch (JsonProcessingException e) {
            // Values written before JSON encoding (or by hand) are returned as-is.
            return stored;
        }
    }

    // ==================================================================
    // Shared validation helpers
    // ==================================================================

    private static String requireText(String value, String label) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isEmpty()) {
            throw new BadRequestException(label + " is required.");
        }
        return trimmed;
    }

    private static String trimToNull(String value) {
        String trimmed = value == null ? "" : value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String requireOneOf(String value, String allowed, String label, String fallback) {
        String candidate = trimToNull(value);
        if (candidate == null) return fallback;
        for (String option : allowed.split("\\|")) {
            if (option.equalsIgnoreCase(candidate)) return option;
        }
        throw new BadRequestException(label + " must be one of: " + allowed.replace('|', ',') + ".");
    }

    private static Integer nonNegative(Integer value, String label) {
        if (value == null) return null;
        if (value < 0) throw new BadRequestException(label + " cannot be negative.");
        return value;
    }
}
