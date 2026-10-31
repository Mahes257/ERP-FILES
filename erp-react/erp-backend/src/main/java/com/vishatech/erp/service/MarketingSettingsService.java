package com.vishatech.erp.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.AppSetting;
import com.vishatech.erp.entity.SettingsAuditLog;
import com.vishatech.erp.repository.AppSettingRepository;
import com.vishatech.erp.repository.SettingsAuditLogRepository;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Marketing Settings — read/write the entire marketing configuration blob.
 *
 * Persisted as a single JSON document under the {@code marketing_settings}
 * key of {@code app_settings}, so the schema stays open: a new settings
 * section is a frontend-only change. Reads are open to authenticated users
 * (every Marketing module loads its configurable defaults); writes are
 * ADMIN-only and are enforced by the controller ({@code SETTINGS_MANAGE})
 * plus {@link #isAdmin()}.
 *
 * Every write appends a {@link SettingsAuditLog} row with the previous and
 * new serialised values, the actor, and a timestamp.
 *
 * Architecture: Controller → Service → Repository, transactions and audit
 * live here — the controller only maps HTTP to service calls.
 */
@Service
public class MarketingSettingsService {

    private static final String SETTING_KEY = "marketing_settings";

    private final AppSettingRepository appSettingRepository;
    private final SettingsAuditLogRepository auditRepository;
    private final ObjectMapper objectMapper;

    public MarketingSettingsService(AppSettingRepository appSettingRepository,
                                    SettingsAuditLogRepository auditRepository,
                                    ObjectMapper objectMapper) {
        this.appSettingRepository = appSettingRepository;
        this.auditRepository = auditRepository;
        this.objectMapper = objectMapper;
    }

    /** Full settings blob — an empty object when never configured. */
    @Transactional(readOnly = true)
    public JsonNode getSettings() {
        return readSettings();
    }

    /**
     * One top-level section. Unknown sections fall back to the full blob so a
     * caller never receives an empty payload for a mistyped section.
     */
    @Transactional(readOnly = true)
    public JsonNode getSection(String section) {
        JsonNode full = readSettings();
        JsonNode sectionNode = full.get(section);
        return sectionNode != null ? sectionNode : full;
    }

    /**
     * Replace the whole blob and record the audit trail (ADMIN only — enforced
     * by the controller).
     *
     * @return the settings that were persisted
     */
    @Transactional
    public JsonNode update(JsonNode settings) {
        if (settings == null || !settings.isObject()) {
            throw new IllegalArgumentException("Marketing settings must be a JSON object");
        }
        JsonNode previous = readSettings();
        String previousStr = previous.isObject() && !previous.isEmpty()
                ? previous.toString() : null;
        try {
            String serialized = objectMapper.writeValueAsString(settings);
            // Atomic upsert — avoids the find-then-insert duplicate-key race.
            appSettingRepository.upsert(SETTING_KEY, serialized);
            auditRepository.save(new SettingsAuditLog(
                    SETTING_KEY, null, null, previousStr, serialized, currentUsername()));
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Marketing settings could not be serialized", exception);
        }
        return settings;
    }

    /** True when the current authenticated user holds the ADMIN role. */
    public boolean isAdmin() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            return false;
        }
        return auth.getAuthorities().stream()
                .anyMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority())
                        || "ADMIN".equals(authority.getAuthority()));
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private JsonNode readSettings() {
        return appSettingRepository.findBySettingKey(SETTING_KEY)
                .map(AppSetting::getSettingValue)
                .map(this::parse)
                .orElseGet(objectMapper::createObjectNode);
    }

    private JsonNode parse(String value) {
        try {
            return objectMapper.readTree(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored Marketing settings are invalid JSON", exception);
        }
    }

    private static String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof String s) {
            return s;
        }
        return auth != null ? auth.getName() : "system";
    }
}
