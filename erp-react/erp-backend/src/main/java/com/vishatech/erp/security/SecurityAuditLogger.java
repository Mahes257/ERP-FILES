package com.vishatech.erp.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Central, safe security-event logger.
 *
 * Every security-relevant event (login success/failure, JWT rejection, access
 * denial, role changes, refresh-token anomalies) is written here so incidents
 * can be investigated from one place.
 *
 * SAFETY RULES (enforced by convention):
 *  - NEVER log passwords, JWT tokens, refresh tokens, or secrets.
 *  - Never log the full Authorization header or token payload.
 *  - The {@code tokenId} parameters below are truncated/short hashes only,
 *    never the token itself.
 */
@Component
public class SecurityAuditLogger {

    private static final Logger LOG = LoggerFactory.getLogger("SECURITY");

    public void loginSuccess(String email, String ip) {
        LOG.info("LOGIN_SUCCESS email={} ip={}", maskEmail(email), maskIp(ip));
    }

    public void loginFailure(String email, String ip, String reason) {
        LOG.warn("LOGIN_FAILURE email={} ip={} reason={}", maskEmail(email), maskIp(ip), safe(reason));
    }

    public void loginBlocked(String email, String ip) {
        LOG.warn("LOGIN_RATE_LIMITED email={} ip={}", maskEmail(email), maskIp(ip));
    }

    public void registerBlocked(String ip) {
        LOG.warn("REGISTER_RATE_LIMITED ip={}", maskIp(ip));
    }

    /** Category: MISSING, MALFORMED, EXPIRED, BAD_SIGNATURE, USER_DISABLED, USER_NOT_FOUND. */
    public void jwtRejected(String category, String subject, String ip, String uri) {
        LOG.warn("JWT_REJECTED category={} subject={} ip={} uri={}",
                safe(category), maskEmail(subject), maskIp(ip), safe(uri));
    }

    public void accessDenied(String principal, String ip, String uri) {
        LOG.warn("ACCESS_DENIED principal={} ip={} uri={}", maskEmail(principal), maskIp(ip), safe(uri));
    }

    public void unauthenticatedAccess(String ip, String uri) {
        LOG.info("UNAUTHENTICATED_ACCESS ip={} uri={}", maskIp(ip), safe(uri));
    }

    public void roleChanged(String actorEmail, String targetEmail, String fromRole, String toRole, String ip) {
        LOG.info("ROLE_CHANGED actor={} target={} from={} to={} ip={}",
                maskEmail(actorEmail), maskEmail(targetEmail), safe(fromRole), safe(toRole), maskIp(ip));
    }

    public void userDisabled(String actorEmail, String targetEmail, String ip) {
        LOG.info("USER_DISABLED actor={} target={} ip={}", maskEmail(actorEmail), maskEmail(targetEmail), maskIp(ip));
    }

    public void refreshIssued(String email, String ip) {
        LOG.info("REFRESH_ISSUED email={} ip={}", maskEmail(email), maskIp(ip));
    }

    public void refreshRevoked(String email, String ip, String reason) {
        LOG.info("REFRESH_REVOKED email={} ip={} reason={}", maskEmail(email), maskIp(ip), safe(reason));
    }

    /** A rotated refresh token was used again — possible theft; the family is revoked. */
    public void refreshReuseDetected(String email, String ip) {
        LOG.warn("REFRESH_REUSE_DETECTED email={} ip={} — refresh-token family revoked", maskEmail(email), maskIp(ip));
    }

    public void refreshInvalid(String ip, String reason) {
        LOG.warn("REFRESH_INVALID ip={} reason={}", maskIp(ip), safe(reason));
    }

    public void suspicious(String ip, String detail) {
        LOG.warn("SUSPICIOUS_ACCESS ip={} detail={}", maskIp(ip), safe(detail));
    }

    /** Local-development auto-login issued a real session for a configured user. */
    public void localAutoLoginIssued(String email, String ip) {
        LOG.info("LOCAL_AUTO_LOGIN_ISSUED email={} ip={}", maskEmail(email), maskIp(ip));
    }

    /** A local auto-login attempt was refused (non-loopback, proxied, or unusable account). */
    public void localAutoLoginRejected(String ip, String reason) {
        LOG.warn("LOCAL_AUTO_LOGIN_REJECTED ip={} reason={}", maskIp(ip), safe(reason));
    }

    /**
     * Masks an email for logging: keeps the first character of the local
     * part and the domain, replaces the rest with asterisks.
     * "admin@vishaktech.com" → "a***@vishaktech.com"
     */
    private static String maskEmail(String email) {
        if (email == null) {
            return "null";
        }
        String v = email.trim();
        if (v.isEmpty()) {
            return "empty";
        }
        int at = v.indexOf('@');
        if (at <= 0) {
            return safe(v);
        }
        String local = v.substring(0, at);
        String domain = v.substring(at);
        if (local.length() <= 1) {
            return local.charAt(0) + "***" + domain;
        }
        return local.charAt(0) + "***" + domain;
    }

    /**
     * Masks an IP address for logging: keeps the first two octets, replaces
     * the rest with asterisks.
     * "192.168.1.100" → "192.168.*.*"
     * "10.0.0.1" → "10.0.*.*"
     */
    private static String maskIp(String ip) {
        if (ip == null) {
            return "null";
        }
        String v = ip.trim();
        if (v.isEmpty()) {
            return "empty";
        }
        // IPv4: mask last two octets
        int dot1 = v.indexOf('.');
        int dot2 = dot1 >= 0 ? v.indexOf('.', dot1 + 1) : -1;
        if (dot1 >= 0 && dot2 >= 0) {
            return v.substring(0, dot2) + ".*.*";
        }
        // IPv6 or unusual format: keep first 4 chars only
        if (v.length() > 4) {
            return v.substring(0, 4) + "***";
        }
        return v;
    }

    private static String safe(String value) {
        if (value == null) {
            return "null";
        }
        String v = value.trim();
        if (v.isEmpty()) {
            return "empty";
        }
        // Never let embedded newlines/control chars pollute the log line.
        return v.replaceAll("[\\r\\n\\t]+", " ").substring(0, Math.min(v.length(), 256));
    }
}
