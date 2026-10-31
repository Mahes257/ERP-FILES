package com.vishatech.erp.service;

import com.vishatech.erp.dto.AuthResponse;
import com.vishatech.erp.entity.RefreshToken;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.repository.RefreshTokenRepository;
import com.vishatech.erp.repository.UserRepository;
import com.vishatech.erp.security.CustomUserDetailsService;
import com.vishatech.erp.security.JwtService;
import com.vishatech.erp.security.SecurityAuditLogger;
import com.vishatech.erp.util.AuditContext;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

/**
 * Refresh-token lifecycle: issue, rotate (with reuse detection), revoke.
 *
 * SECURITY:
 *  - raw tokens are 256-bit random values returned to the client exactly once
 *  - only SHA-256 hashes are persisted
 *  - every refresh ROTATES: the presented token is revoked and a new one is
 *    issued in the same family
 *  - presenting an already-revoked token is treated as theft and revokes the
 *    whole family
 *  - logout revokes the presented token
 */
@Service
public class RefreshTokenService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final RefreshTokenRepository refreshTokenRepository;
    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final CustomUserDetailsService userDetailsService;
    private final SecurityAuditLogger auditLogger;
    private final AuditContext auditContext;
    private final long refreshExpirationMs;

    public RefreshTokenService(RefreshTokenRepository refreshTokenRepository,
                               UserRepository userRepository,
                               JwtService jwtService,
                               CustomUserDetailsService userDetailsService,
                               SecurityAuditLogger auditLogger,
                               AuditContext auditContext,
                               @Value("${app.jwt.refresh-expiration-ms}") long refreshExpirationMs) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.userRepository = userRepository;
        this.jwtService = jwtService;
        this.userDetailsService = userDetailsService;
        this.auditLogger = auditLogger;
        this.auditContext = auditContext;
        this.refreshExpirationMs = refreshExpirationMs;
    }

    /**
     * Issues a fresh access token + refresh token for the given user.
     *
     * NOTE: deliberately not annotated @Transactional — every repository call
     * commits on its own so that reuse-detection revocations survive the
     * BadCredentialsException thrown afterwards (a rollback would undo the
     * very protection we are trying to apply).
     */
    public AuthResponse issue(User user) {
        String raw = generateRawToken();
        RefreshToken token = new RefreshToken();
        token.setUserId(user.getId());
        token.setTokenHash(hash(raw));
        token.setFamilyId(UUID.randomUUID().toString());
        token.setExpiresAt(Instant.now().plusMillis(refreshExpirationMs));
        token.setCreatedAt(Instant.now());
        refreshTokenRepository.save(token);
        cleanupOldTokens();
        auditLogger.refreshIssued(user.getEmail(), auditContext.ipAddress());
        return buildResponse(user, raw);
    }

    /**
     * Validates + rotates the presented refresh token.
     *
     * @throws BadCredentialsException (→ 401) for unknown, expired, revoked, or
     *         reused tokens. Reuse revokes the entire family.
     */
    public AuthResponse rotate(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new BadCredentialsException("Invalid refresh token");
        }
        RefreshToken stored = refreshTokenRepository.findByTokenHash(hash(rawToken))
                .orElseThrow(() -> new BadCredentialsException("Invalid refresh token"));
        String ip = auditContext.ipAddress();

        if (stored.getRevokedAt() != null) {
            // An already-used/revoked token presented again → likely theft.
            revokeFamily(stored.getFamilyId(), "REUSE");
            User owner = userRepository.findById(stored.getUserId()).orElse(null);
            auditLogger.refreshReuseDetected(owner == null ? null : owner.getEmail(), ip);
            throw new BadCredentialsException("Invalid refresh token");
        }
        if (stored.getExpiresAt().isBefore(Instant.now())) {
            stored.setRevokedAt(Instant.now());
            stored.setRevokedReason("EXPIRED");
            refreshTokenRepository.save(stored);
            auditLogger.refreshInvalid(ip, "EXPIRED");
            throw new BadCredentialsException("Invalid refresh token");
        }

        User user = userRepository.findById(stored.getUserId())
                .orElseThrow(() -> new BadCredentialsException("Invalid refresh token"));
        if (!user.isEnabled() || user.isLocked()) {
            stored.setRevokedAt(Instant.now());
            stored.setRevokedReason("ACCOUNT_DISABLED");
            refreshTokenRepository.save(stored);
            auditLogger.refreshInvalid(ip, "ACCOUNT_DISABLED");
            throw new BadCredentialsException("Invalid refresh token");
        }

        // Rotate: revoke the presented token, issue a new one in the same family.
        stored.setRevokedAt(Instant.now());
        stored.setRevokedReason("ROTATED");
        refreshTokenRepository.save(stored);

        String newRaw = generateRawToken();
        RefreshToken next = new RefreshToken();
        next.setUserId(user.getId());
        next.setTokenHash(hash(newRaw));
        next.setFamilyId(stored.getFamilyId());
        next.setExpiresAt(Instant.now().plusMillis(refreshExpirationMs));
        next.setCreatedAt(Instant.now());
        refreshTokenRepository.save(next);
        auditLogger.refreshIssued(user.getEmail(), ip);
        return buildResponse(user, newRaw);
    }

    /** Revokes the presented refresh token (logout). */
    public void revoke(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return;
        }
        RefreshToken stored = refreshTokenRepository.findByTokenHash(hash(rawToken)).orElse(null);
        if (stored == null || stored.getRevokedAt() != null) {
            return;
        }
        stored.setRevokedAt(Instant.now());
        stored.setRevokedReason("LOGOUT");
        refreshTokenRepository.save(stored);
        User owner = userRepository.findById(stored.getUserId()).orElse(null);
        auditLogger.refreshRevoked(owner == null ? null : owner.getEmail(),
                auditContext.ipAddress(), "LOGOUT");
    }

    /** Revokes every active token belonging to a user (e.g. account disabled). */
    public void revokeAllForUser(Long userId, String reason) {
        List<RefreshToken> tokens = refreshTokenRepository.findByUserId(userId);
        for (RefreshToken token : tokens) {
            if (token.getRevokedAt() == null) {
                token.setRevokedAt(Instant.now());
                token.setRevokedReason(reason);
                refreshTokenRepository.save(token);
            }
        }
    }

    private void revokeFamily(String familyId, String reason) {
        for (RefreshToken token : refreshTokenRepository.findByFamilyId(familyId)) {
            if (token.getRevokedAt() == null) {
                token.setRevokedAt(Instant.now());
                token.setRevokedReason(reason);
                refreshTokenRepository.save(token);
            }
        }
    }

    private AuthResponse buildResponse(User user, String rawRefreshToken) {
        UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());
        String accessToken = jwtService.generateToken(userDetails);
        return new AuthResponse(accessToken, "Bearer", user.getEmail(), user.getFullName(),
                user.getRole().name(), rawRefreshToken);
    }

    private void cleanupOldTokens() {
        Instant cutoff = Instant.now().minusSeconds(30L * 24 * 60 * 60); // 30 days
        refreshTokenRepository.deleteByRevokedAtBefore(cutoff);
        refreshTokenRepository.deleteByExpiresAtBefore(cutoff);
    }

    private String generateRawToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hash(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(rawToken.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
