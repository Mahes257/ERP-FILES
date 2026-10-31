package com.vishatech.erp.service;

import com.vishatech.erp.dto.AuthResponse;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.exception.ForbiddenException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.UserRepository;
import com.vishatech.erp.security.SecurityAuditLogger;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Local-development auto-login.
 *
 * <p>Lets a developer machine open the ERP without typing credentials, while
 * every other environment keeps the normal sign-in flow. It does NOT bypass
 * security: the endpoint is disabled by default, only answers loopback
 * callers, and issues a genuine session (real JWT + rotated refresh token) for
 * an existing database user, through the same {@link RefreshTokenService#issue}
 * path the login endpoint uses. Nothing is fabricated, no role is granted, and
 * {@code .anyRequest().authenticated()} is untouched.
 *
 * <p>Eligibility (all must hold):
 * <ul>
 *   <li>{@code app.local-auto-login.enabled} is {@code true}
 *       (env {@code ERP_LOCAL_AUTO_LOGIN_ENABLED});</li>
 *   <li>{@code app.local-auto-login.user} names an existing account
 *       (env {@code ERP_LOCAL_AUTO_LOGIN_USER});</li>
 *   <li>the socket peer is a loopback address;</li>
 *   <li>the request carries no forwarding/proxy header. A reverse proxy or
 *       tunnel on the same host would otherwise present itself as loopback, so
 *       any such header disqualifies the request.</li>
 * </ul>
 */
@Service
public class LocalAutoLoginService {

    /** Socket peer addresses that mean "this machine". */
    private static final Set<String> LOOPBACK_ADDRESSES =
            Set.of("127.0.0.1", "::1", "0:0:0:0:0:0:0:1", "localhost");

    /**
     * Headers a proxy or tunnel adds. Their presence means the request did not
     * originate on this machine, so the loopback check must not be trusted.
     */
    private static final List<String> PROXY_HEADERS = List.of(
            "Forwarded",
            "X-Forwarded-For",
            "X-Forwarded-Host",
            "X-Forwarded-Proto",
            "X-Forwarded-Port",
            "X-Forwarded-Server",
            "X-Real-IP",
            "X-Client-IP",
            "X-Original-Forwarded-For",
            "X-ProxyUser-Ip",
            "Via",
            "Proxy-Connection");

    private final UserRepository userRepository;
    private final RefreshTokenService refreshTokenService;
    private final SecurityAuditLogger auditLogger;
    private final boolean enabled;
    private final String configuredUserEmail;

    public LocalAutoLoginService(UserRepository userRepository,
                                 RefreshTokenService refreshTokenService,
                                 SecurityAuditLogger auditLogger,
                                 @Value("${app.local-auto-login.enabled:false}") boolean enabled,
                                 @Value("${app.local-auto-login.user:}") String configuredUserEmail) {
        this.userRepository = userRepository;
        this.refreshTokenService = refreshTokenService;
        this.auditLogger = auditLogger;
        this.enabled = enabled;
        this.configuredUserEmail = configuredUserEmail == null
                ? ""
                : configuredUserEmail.trim().toLowerCase(Locale.ROOT);
    }

    /** True only when the feature is switched on AND a user is configured. */
    public boolean isEnabled() {
        return enabled && !configuredUserEmail.isEmpty();
    }

    /**
     * True when this request may use the feature: loopback peer and no proxy
     * header of any kind.
     */
    public boolean isEligibleRequest(HttpServletRequest request) {
        if (request == null) {
            return false;
        }
        for (String header : PROXY_HEADERS) {
            String value = request.getHeader(header);
            if (value != null && !value.isBlank()) {
                return false;
            }
        }
        String remoteAddress = request.getRemoteAddr();
        if (remoteAddress == null) {
            return false;
        }
        String normalized = remoteAddress.trim().toLowerCase(Locale.ROOT);
        // IPv4-mapped IPv6 form (::ffff:127.0.0.1) is still this machine.
        if (normalized.startsWith("::ffff:")) {
            normalized = normalized.substring("::ffff:".length());
        }
        return LOOPBACK_ADDRESSES.contains(normalized);
    }

    /**
     * Issues a real session for the configured user.
     *
     * @throws ResourceNotFoundException when the feature is off, no user is
     *         configured, or the configured account does not exist (nothing is
     *         ever created)
     * @throws ForbiddenException when the caller is not on loopback / arrived
     *         through a proxy, or the account is disabled or locked
     */
    public AuthResponse authenticate(HttpServletRequest request) {
        // Disabled is reported as "not found" so an unconfigured instance
        // reveals nothing about the feature.
        if (!isEnabled()) {
            throw new ResourceNotFoundException("Local auto-login is not enabled");
        }
        String ip = request == null ? null : request.getRemoteAddr();
        if (!isEligibleRequest(request)) {
            auditLogger.localAutoLoginRejected(ip, "NOT_LOOPBACK_OR_PROXIED");
            throw new ForbiddenException("Local auto-login is only available from this machine");
        }
        // Existing account only — a missing user is an error, never a signup.
        User user = userRepository.findByEmail(configuredUserEmail)
                .orElseThrow(() -> {
                    auditLogger.localAutoLoginRejected(ip, "USER_NOT_FOUND");
                    return new ResourceNotFoundException(
                            "Configured local auto-login user does not exist");
                });
        if (!user.isEnabled() || user.isLocked() || user.isAccountExpired() || user.isCredentialsExpired()) {
            auditLogger.localAutoLoginRejected(ip, "ACCOUNT_NOT_USABLE");
            throw new ForbiddenException("Configured local auto-login user cannot sign in");
        }
        // Same issuance path as /auth/login: real signed JWT + rotated refresh
        // token, with the account's own role and permissions.
        AuthResponse response = refreshTokenService.issue(user);
        auditLogger.localAutoLoginIssued(user.getEmail(), ip);
        return response;
    }
}
