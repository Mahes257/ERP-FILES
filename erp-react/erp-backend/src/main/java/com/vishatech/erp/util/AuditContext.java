package com.vishatech.erp.util;

import com.vishatech.erp.entity.User;
import com.vishatech.erp.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Resolves the authenticated user and request context (IP, device) so that
 * audit-trail / timeline records can store who did what, from where.
 */
@Component
public class AuditContext {

    private final UserRepository userRepository;

    public AuditContext(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /** Current authenticated principal (null for anonymous/system calls). */
    public User currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getName())) {
            return null;
        }
        return userRepository.findByEmail(auth.getName()).orElse(null);
    }

    public Long currentUserId() {
        User user = currentUser();
        return user == null ? null : user.getId();
    }

    public String currentUserName() {
        User user = currentUser();
        if (user != null && user.getFullName() != null && !user.getFullName().isBlank()) {
            return user.getFullName();
        }
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getName() != null && !"anonymousUser".equals(auth.getName())) {
            return auth.getName();
        }
        return "System";
    }

    public String currentUserRole() {
        User user = currentUser();
        return user == null || user.getRole() == null ? null : user.getRole().name();
    }

    /** Client IP, honoring the X-Forwarded-For header when behind a proxy. */
    public String ipAddress() {
        HttpServletRequest request = request();
        if (request == null) {
            return null;
        }
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    /** Raw User-Agent header (browser/device fingerprint). */
    public String deviceInfo() {
        HttpServletRequest request = request();
        return request == null ? null : request.getHeader("User-Agent");
    }

    private HttpServletRequest request() {
        ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        return attrs == null ? null : attrs.getRequest();
    }
}
