package com.vishatech.erp.sales.access;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.vishatech.erp.entity.AppSetting;
import com.vishatech.erp.entity.SettingsAuditLog;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.AppSettingRepository;
import com.vishatech.erp.repository.SettingsAuditLogRepository;
import com.vishatech.erp.repository.UserRepository;
import com.vishatech.erp.sales.access.SalesAccessPolicy.Requirement;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sales Access Management — the ONE place that answers "may this user use this
 * Sales area, for this action?".
 *
 * <h2>Persistence</h2>
 * Configurations reuse the same {@code app_settings} key/value store and the
 * same {@code settings_audit_log} table as the Marketing access feature, one row
 * per scope:
 * <pre>
 *   sales_access.ROLE.ADMIN   → role-wide configuration
 *   sales_access.USER.42      → one user's own configuration
 * </pre>
 * A row per scope means saving one user's permissions can never overwrite
 * another user's, a Sales configuration can never overwrite a Marketing one, and
 * no schema change or migration is required. Each save/reset writes the previous
 * and the new value plus the acting administrator to the audit log. No
 * permission is ever read from client input: the effective set is derived
 * server-side from the authenticated principal.
 *
 * <h2>Resolution</h2>
 * For every area, the most specific configuration wins:
 * <ol>
 *   <li>the user's own configuration for that area, else</li>
 *   <li>the configuration of the user's role for that area, else</li>
 *   <li>the documented default for that role ({@link SalesAccessPolicy}).</li>
 * </ol>
 * A stored configuration that cannot be parsed fails closed for the whole
 * scope: no Sales request is allowed and the caller receives a clear 403,
 * instead of silently falling back to the default.
 */
@Service("salesAccess")
public class SalesAccessService {

    private static final Logger log = LoggerFactory.getLogger(SalesAccessService.class);

    static final String KEY_PREFIX = "sales_access.";
    static final String SCOPE_ROLE = "ROLE";
    static final String SCOPE_USER = "USER";
    private static final int DOCUMENT_VERSION = 1;

    private final AppSettingRepository appSettingRepository;
    private final SettingsAuditLogRepository auditRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    public SalesAccessService(AppSettingRepository appSettingRepository,
                              SettingsAuditLogRepository auditRepository,
                              UserRepository userRepository,
                              ObjectMapper objectMapper) {
        this.appSettingRepository = appSettingRepository;
        this.auditRepository = auditRepository;
        this.userRepository = userRepository;
        this.objectMapper = objectMapper;
    }

    // ── Enforcement ───────────────────────────────────────────────────────

    /**
     * True when the current authenticated user holds {@code action} on
     * {@code area}. Used by the Sales interceptor and available to method
     * security as {@code @PreAuthorize("@salesAccess.can('settings','edit')")}.
     */
    public boolean can(String areaKey, String actionKey) {
        SalesAccessArea area = SalesAccessArea.fromKey(areaKey);
        SalesAccessAction action = SalesAccessAction.fromKey(actionKey);
        if (area == null || action == null || !area.supports(action)) {
            return false;
        }
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return false;
        }
        Effective effective = effectiveFor(authentication.getName(), roleOf(authentication));
        return effective.allows(area, action);
    }

    /** Convenience for the request policy. */
    public boolean can(Requirement requirement) {
        return requirement != null && can(requirement.area().key(), requirement.action().key());
    }

    // ── Current user ──────────────────────────────────────────────────────

    /**
     * The signed-in user's effective Sales permissions plus where the
     * configuration came from, so the UI can hide what is not allowed and the
     * administrator can tell a saved configuration from a default.
     */
    @Transactional(readOnly = true)
    public CurrentUserView currentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new BadRequestException("Not authenticated");
        }
        String email = authentication.getName();
        UserRole role = roleOf(authentication);
        User user = email == null ? null : userRepository.findByEmail(email).orElse(null);

        Optional<Map<String, Map<String, Boolean>>> userConfig =
                user == null ? Optional.empty() : readScope(SCOPE_USER, String.valueOf(user.getId()));
        Optional<Map<String, Map<String, Boolean>>> roleConfig =
                readScope(SCOPE_ROLE, role == null ? null : role.name());

        Map<String, Map<String, Boolean>> raw = merge(role, userConfig, roleConfig);
        String source = userConfig.isPresent() ? SCOPE_USER
                : roleConfig.isPresent() ? SCOPE_ROLE
                : "DEFAULT";

        return new CurrentUserView(
                email,
                role == null ? null : role.name(),
                user != null,
                roleConfig.isPresent(),
                userConfig.isPresent(),
                source,
                sanitizeMap(raw, false));
    }

    // ── Administration ────────────────────────────────────────────────────

    /** Everything the Access Management panel needs to render its selectors. */
    @Transactional(readOnly = true)
    public Map<String, Object> options() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("roles", java.util.Arrays.stream(UserRole.values()).map(Enum::name).toList());
        List<Map<String, Object>> users = userRepository.findAll().stream()
                .sorted(Comparator.comparing(User::getFullName, String.CASE_INSENSITIVE_ORDER))
                .map(user -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", String.valueOf(user.getId()));
                    row.put("email", user.getEmail());
                    row.put("fullName", user.getFullName());
                    row.put("role", user.getRole().name());
                    row.put("enabled", user.isEnabled());
                    return row;
                })
                .toList();
        payload.put("users", users);
        payload.put("areas", SalesAccessPolicy.catalog());
        Map<String, Map<String, Map<String, Boolean>>> defaults = new LinkedHashMap<>();
        for (UserRole role : UserRole.values()) {
            defaults.put(role.name(), SalesAccessPolicy.defaults(role));
        }
        payload.put("defaults", defaults);
        payload.put("configuredScopes", configuredScopes());
        return payload;
    }

    /** One scope's saved configuration (or its inherited defaults). */
    @Transactional(readOnly = true)
    public ScopeView scope(String scopeTypeRaw, String scopeKeyRaw) {
        String[] scope = normalizeScope(scopeTypeRaw, scopeKeyRaw);
        Optional<Map<String, Map<String, Boolean>>> saved;
        try {
            saved = readScopeStrict(scope[0], scope[1]);
        } catch (IllegalStateException invalid) {
            log.error("Sales access configuration for {} {} is unreadable: {}",
                    scope[0], scope[1], invalid.getMessage());
            return new ScopeView(scope[0], scope[1], true, SalesAccessPolicy.denyAll(),
                    lastUpdatedBy(scope[0], scope[1]), true);
        }
        Map<String, Map<String, Boolean>> permissions = saved
                .map(config -> sanitizeMap(config, false))
                .orElseGet(() -> inherited(scope[0], scope[1]));
        return new ScopeView(scope[0], scope[1], saved.isPresent(), permissions,
                saved.isPresent() ? lastUpdatedBy(scope[0], scope[1]) : null, true);
    }

    /**
     * Replace one scope's configuration. Only that scope's row is written, so
     * saving user A never rewrites user B (or the role) configuration, and the
     * Marketing rows are untouched.
     */
    @Transactional
    public ScopeView save(String scopeTypeRaw, String scopeKeyRaw, JsonNode permissions) {
        String[] scope = normalizeScope(scopeTypeRaw, scopeKeyRaw);
        Map<String, Map<String, Boolean>> sanitized = sanitize(permissions, true);
        String key = settingKey(scope[0], scope[1]);
        String previous = appSettingRepository.findBySettingKey(key)
                .map(AppSetting::getSettingValue).orElse(null);

        ObjectNode document = objectMapper.createObjectNode();
        document.put("version", DOCUMENT_VERSION);
        document.put("scopeType", scope[0]);
        document.put("scopeKey", scope[1]);
        document.set("permissions", objectMapper.valueToTree(sanitized));
        document.put("updatedAt", LocalDateTime.now().toString());
        document.put("updatedBy", currentUsername());
        String serialized;
        try {
            serialized = objectMapper.writeValueAsString(document);
        } catch (JsonProcessingException exception) {
            throw new BadRequestException("Sales access configuration could not be serialized");
        }

        appSettingRepository.upsert(key, serialized);
        auditRepository.save(new SettingsAuditLog(
                key, "accessManagement", scope[0] + ":" + scope[1], previous, serialized, currentUsername()));
        log.info("Sales access saved for {} {} by {}", scope[0], scope[1], currentUsername());

        return new ScopeView(scope[0], scope[1], true, sanitized, currentUsername(), true);
    }

    /** Remove one scope's configuration so it inherits the role's again. */
    @Transactional
    public ScopeView reset(String scopeTypeRaw, String scopeKeyRaw) {
        String[] scope = normalizeScope(scopeTypeRaw, scopeKeyRaw);
        String key = settingKey(scope[0], scope[1]);
        Optional<AppSetting> existing = appSettingRepository.findBySettingKey(key);
        existing.ifPresent(setting -> {
            auditRepository.save(new SettingsAuditLog(
                    key, "accessManagement", scope[0] + ":" + scope[1],
                    setting.getSettingValue(), null, currentUsername()));
            appSettingRepository.delete(setting);
        });
        log.info("Sales access reset for {} {} by {}", scope[0], scope[1], currentUsername());
        return new ScopeView(scope[0], scope[1], false, inherited(scope[0], scope[1]), null, true);
    }

    /** True when at least one role or user Sales configuration has been saved. */
    @Transactional(readOnly = true)
    public boolean anyScopeConfigured() {
        return !configuredScopes().isEmpty();
    }

    // ── Internals ─────────────────────────────────────────────────────────

    private record Effective(Map<String, Map<String, Boolean>> permissions, boolean invalid) {
        boolean allows(SalesAccessArea area, SalesAccessAction action) {
            if (invalid) {
                return false;
            }
            Map<String, Boolean> actions = permissions.get(area.key());
            return actions != null && Boolean.TRUE.equals(actions.get(action.key()));
        }
    }

    private Effective effectiveFor(String email, UserRole role) {
        try {
            User user = email == null ? null : userRepository.findByEmail(email).orElse(null);
            Optional<Map<String, Map<String, Boolean>>> userConfig =
                    user == null ? Optional.empty() : readScopeStrict(SCOPE_USER, String.valueOf(user.getId()));
            Optional<Map<String, Map<String, Boolean>>> roleConfig =
                    readScopeStrict(SCOPE_ROLE, role == null ? null : role.name());
            return new Effective(merge(role, userConfig, roleConfig), false);
        } catch (IllegalStateException invalidConfiguration) {
            // Fail closed: a configuration that cannot be read never grants access.
            log.error("Sales access configuration is unreadable: {}", invalidConfiguration.getMessage());
            return new Effective(SalesAccessPolicy.denyAll(), true);
        }
    }

    /**
     * Per-area layering: user configuration → role configuration → documented
     * default. A configuration that exists for an area is authoritative for that
     * area (a missing action inside it counts as denied).
     */
    private Map<String, Map<String, Boolean>> merge(UserRole role,
                                                    Optional<Map<String, Map<String, Boolean>>> userConfig,
                                                    Optional<Map<String, Map<String, Boolean>>> roleConfig) {
        Map<String, Map<String, Boolean>> result = new LinkedHashMap<>();
        for (SalesAccessArea area : SalesAccessArea.values()) {
            Map<String, Boolean> source = null;
            if (userConfig.isPresent() && userConfig.get().containsKey(area.key())) {
                source = userConfig.get().get(area.key());
            } else if (roleConfig.isPresent() && roleConfig.get().containsKey(area.key())) {
                source = roleConfig.get().get(area.key());
            }
            Map<String, Boolean> resolved = new LinkedHashMap<>();
            for (SalesAccessAction action : area.actions()) {
                boolean allowed = source != null
                        ? Boolean.TRUE.equals(source.get(action.key()))
                        : SalesAccessPolicy.defaultAllow(role, area, action);
                resolved.put(action.key(), allowed);
            }
            result.put(area.key(), resolved);
        }
        return result;
    }

    /** The effective permissions a scope inherits today (no saved row). */
    private Map<String, Map<String, Boolean>> inherited(String scopeType, String scopeKey) {
        if (SCOPE_USER.equals(scopeType)) {
            User user = userRepository.findById(Long.valueOf(scopeKey))
                    .orElseThrow(() -> new ResourceNotFoundException("User not found: " + scopeKey));
            Optional<Map<String, Map<String, Boolean>>> roleConfig = readScope(SCOPE_ROLE, user.getRole().name());
            return sanitizeMap(merge(user.getRole(), Optional.empty(), roleConfig), false);
        }
        return SalesAccessPolicy.defaults(UserRole.valueOf(scopeKey));
    }

    /**
     * Keep only known areas/actions that the area actually supports. When
     * {@code strict}, an unknown key is rejected instead of dropped: a typo must
     * not silently turn into "no such permission".
     */
    private Map<String, Map<String, Boolean>> sanitize(JsonNode permissions, boolean strict) {
        if (permissions == null || !permissions.isObject()) {
            if (strict) {
                throw new BadRequestException("permissions must be an object of area → action → boolean");
            }
            return SalesAccessPolicy.denyAll();
        }
        Map<String, Map<String, Boolean>> result = new LinkedHashMap<>();
        for (SalesAccessArea area : SalesAccessArea.values()) {
            JsonNode areaNode = permissions.get(area.key());
            Map<String, Boolean> actions = new LinkedHashMap<>();
            for (SalesAccessAction action : area.actions()) {
                JsonNode value = areaNode == null ? null : areaNode.get(action.key());
                if (strict && areaNode != null && value != null && !value.isBoolean()) {
                    throw new BadRequestException(
                            "Permission " + area.key() + "." + action.key() + " must be true or false");
                }
                // Fail closed: an absent permission is OFF.
                actions.put(action.key(), value != null && value.isBoolean() && value.booleanValue());
            }
            result.put(area.key(), actions);
        }
        if (strict) {
            permissions.fieldNames().forEachRemaining(areaKey -> {
                SalesAccessArea area = SalesAccessArea.fromKey(areaKey);
                if (area == null) {
                    throw new BadRequestException("Unknown Sales area: " + areaKey);
                }
                JsonNode areaNode = permissions.get(areaKey);
                areaNode.fieldNames().forEachRemaining(actionKey -> {
                    SalesAccessAction action = SalesAccessAction.fromKey(actionKey);
                    if (action == null || !area.supports(action)) {
                        throw new BadRequestException(
                                "Sales area " + area.key() + " does not support action: " + actionKey);
                    }
                });
            });
        }
        return result;
    }

    private Map<String, Map<String, Boolean>> sanitizeMap(Map<String, Map<String, Boolean>> permissions,
                                                          boolean strict) {
        return sanitize((JsonNode) objectMapper.valueToTree(permissions), strict);
    }

    private Optional<Map<String, Map<String, Boolean>>> readScope(String scopeType, String scopeKey) {
        if (scopeKey == null) {
            return Optional.empty();
        }
        try {
            return readScopeStrict(scopeType, scopeKey);
        } catch (IllegalStateException invalid) {
            log.warn("Ignoring unreadable Sales access configuration {} {}: {}",
                    scopeType, scopeKey, invalid.getMessage());
            return Optional.empty();
        }
    }

    /** @throws IllegalStateException when a stored configuration cannot be read. */
    private Optional<Map<String, Map<String, Boolean>>> readScopeStrict(String scopeType, String scopeKey) {
        if (scopeKey == null) {
            return Optional.empty();
        }
        return appSettingRepository.findBySettingKey(settingKey(scopeType, scopeKey))
                .map(AppSetting::getSettingValue)
                .map(value -> {
                    try {
                        JsonNode document = objectMapper.readTree(value);
                        JsonNode permissions = document == null ? null : document.get("permissions");
                        if (permissions == null || !permissions.isObject()) {
                            throw new IllegalStateException(
                                    "missing permissions object for " + scopeType + ":" + scopeKey);
                        }
                        Map<String, Map<String, Boolean>> parsed = new LinkedHashMap<>();
                        for (SalesAccessArea area : SalesAccessArea.values()) {
                            JsonNode areaNode = permissions.get(area.key());
                            if (areaNode == null || !areaNode.isObject()) {
                                continue;
                            }
                            Map<String, Boolean> actions = new LinkedHashMap<>();
                            for (SalesAccessAction action : area.actions()) {
                                JsonNode actionNode = areaNode.get(action.key());
                                if (actionNode != null && actionNode.isBoolean()) {
                                    actions.put(action.key(), actionNode.booleanValue());
                                }
                            }
                            parsed.put(area.key(), actions);
                        }
                        return parsed;
                    } catch (JsonProcessingException exception) {
                        throw new IllegalStateException(
                                "invalid JSON for " + scopeType + ":" + scopeKey, exception);
                    }
                });
    }

    private List<String> configuredScopes() {
        return appSettingRepository.findAll().stream()
                .map(AppSetting::getSettingKey)
                .filter(key -> key != null && key.startsWith(KEY_PREFIX))
                .map(key -> key.substring(KEY_PREFIX.length()))
                .sorted()
                .toList();
    }

    private String lastUpdatedBy(String scopeType, String scopeKey) {
        return appSettingRepository.findBySettingKey(settingKey(scopeType, scopeKey))
                .map(AppSetting::getSettingValue)
                .map(value -> {
                    try {
                        JsonNode node = objectMapper.readTree(value);
                        return node == null || node.get("updatedBy") == null
                                ? null : node.get("updatedBy").asText();
                    } catch (JsonProcessingException exception) {
                        return null;
                    }
                })
                .orElse(null);
    }

    private String[] normalizeScope(String scopeTypeRaw, String scopeKeyRaw) {
        String scopeType = String.valueOf(scopeTypeRaw == null ? "" : scopeTypeRaw).trim().toUpperCase();
        String scopeKey = String.valueOf(scopeKeyRaw == null ? "" : scopeKeyRaw).trim();
        if (scopeKey.isEmpty()) {
            throw new BadRequestException("A role or user must be selected");
        }
        if (SCOPE_ROLE.equals(scopeType)) {
            try {
                return new String[]{SCOPE_ROLE, UserRole.valueOf(scopeKey.toUpperCase()).name()};
            } catch (IllegalArgumentException exception) {
                throw new BadRequestException("Unknown role: " + scopeKey);
            }
        }
        if (SCOPE_USER.equals(scopeType)) {
            long userId;
            try {
                userId = Long.parseLong(scopeKey);
            } catch (NumberFormatException exception) {
                throw new BadRequestException("Unknown user: " + scopeKey);
            }
            User user = userRepository.findById(userId)
                    .orElseThrow(() -> new ResourceNotFoundException("User not found: " + scopeKey));
            return new String[]{SCOPE_USER, String.valueOf(user.getId())};
        }
        throw new BadRequestException("scopeType must be ROLE or USER");
    }

    private static String settingKey(String scopeType, String scopeKey) {
        return KEY_PREFIX + scopeType + "." + scopeKey;
    }

    private static UserRole roleOf(Authentication authentication) {
        if (authentication == null) {
            return null;
        }
        return authentication.getAuthorities().stream()
                .map(authority -> authority.getAuthority())
                .filter(authority -> authority != null && authority.startsWith("ROLE_"))
                .map(authority -> authority.substring("ROLE_".length()))
                .map(name -> {
                    try {
                        return UserRole.valueOf(name);
                    } catch (IllegalArgumentException exception) {
                        return null;
                    }
                })
                .filter(Objects::nonNull)
                .findFirst()
                .orElse(null);
    }

    private static String currentUsername() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null) {
            return "system";
        }
        String name = authentication.getName();
        return name == null || name.isBlank() ? "system" : name;
    }

    // ── Response records (also the JSON contract the UI reads) ────────────

    /**
     * @param source      USER when the user has an own configuration, ROLE when
     *                    the role has one, DEFAULT when nothing is configured
     * @param permissions effective per-area per-action booleans
     */
    public record CurrentUserView(String email, String role, boolean userExists,
                                  boolean roleConfigured, boolean userConfigured, String source,
                                  Map<String, Map<String, Boolean>> permissions) {
    }

    public record ScopeView(String scopeType, String scopeKey, boolean configured,
                            Map<String, Map<String, Boolean>> permissions,
                            String updatedBy, boolean adminEditable) {
    }
}
