package com.vishatech.erp.service;

import com.vishatech.erp.dto.DocumentSettingsResponse;
import com.vishatech.erp.entity.AppSetting;
import com.vishatech.erp.entity.DocumentVisibility;
import com.vishatech.erp.entity.SettingsAuditLog;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.repository.AppSettingRepository;
import com.vishatech.erp.repository.SettingsAuditLogRepository;
import java.time.LocalDateTime;
import java.util.Locale;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Default visibility for NEW general documents (Documents → upload / create /
 * generated register paths). Persisted as an {@code app_settings} key so the
 * value survives restarts and is auditable like every other setting.
 *
 * Default when nothing is configured: ADMIN_ONLY (most restrictive).
 * ADMIN-only writes via Settings → Document Settings; reads are open to
 * authenticated users (the value is needed to render upload forms).
 */
@Service
public class DocumentSettingsService {

    private static final String SETTING_KEY = "document_default_visibility";
    private static final DocumentVisibility DEFAULT = DocumentVisibility.ADMIN_ONLY;

    private final AppSettingRepository appSettingRepository;
    private final SettingsAuditLogRepository auditRepository;

    public DocumentSettingsService(AppSettingRepository appSettingRepository,
                                   SettingsAuditLogRepository auditRepository) {
        this.appSettingRepository = appSettingRepository;
        this.auditRepository = auditRepository;
    }

    /** Current default visibility (ADMIN_ONLY when never configured). */
    @Transactional(readOnly = true)
    public DocumentVisibility defaultVisibility() {
        return appSettingRepository.findBySettingKey(SETTING_KEY)
                .map(AppSetting::getSettingValue)
                .map(DocumentSettingsService::parse)
                .orElse(DEFAULT);
    }

    /** Response payload for GET /settings/documents. */
    @Transactional(readOnly = true)
    public DocumentSettingsResponse get() {
        DocumentVisibility value = defaultVisibility();
        String lastUpdated = appSettingRepository.findBySettingKey(SETTING_KEY)
                .map(AppSetting::getUpdatedAt)
                .map(LocalDateTime::toString)
                .orElse(null);
        return new DocumentSettingsResponse(value.name(), lastUpdated);
    }

    /**
     * Change the default visibility (ADMIN only — enforced by the controller).
     * Writes a SettingsAuditLog row with previous/new values.
     */
    @Transactional
    public DocumentSettingsResponse set(String requested) {
        DocumentVisibility next;
        try {
            next = DocumentVisibility.valueOf(requested.trim().toUpperCase(Locale.ROOT));
        } catch (RuntimeException e) {
            throw new BadRequestException("Invalid visibility: " + requested
                    + " (allowed: ADMIN_ONLY, SALES_TEAM_ONLY, ACCOUNTS_TEAM_ONLY, PURCHASE_TEAM_ONLY, TEAM_ONLY, CUSTOMER, BOTH)");
        }
        DocumentVisibility previous = defaultVisibility();
        String previousStr = previous.name();
        // Atomic upsert: a plain find-then-insert races when two concurrent
        // first-writes both observe "absent" and one hits the unique key.
        appSettingRepository.upsert(SETTING_KEY, next.name());
        if (previous != next) {
            auditRepository.save(new SettingsAuditLog(
                    SETTING_KEY, null, "defaultVisibility", previousStr, next.name(), currentUsername()));
        }
        return get();
    }

    /** True when the current authenticated user holds the ADMIN role. */
    public boolean isAdmin() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) return false;
        return auth.getAuthorities().stream()
                .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    /** Lenient parse: unknown stored values fall back to the safe default. */
    static DocumentVisibility parse(String raw) {
        if (raw == null || raw.isBlank()) return DEFAULT;
        try {
            return DocumentVisibility.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return DEFAULT;
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
