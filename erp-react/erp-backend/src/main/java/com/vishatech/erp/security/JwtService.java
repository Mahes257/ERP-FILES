package com.vishatech.erp.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import io.jsonwebtoken.security.WeakKeyException;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

/**
 * JWT signing/validation (JJWT 0.12).
 *
 * SECURITY PROPERTIES:
 *  - signing algorithm is always HS256 via an HMAC key of at least 256 bits
 *  - tokens are parsed with {@code verifyWith(key)} — this rejects unsigned
 *    ("none") tokens, tokens with a different algorithm, and invalid
 *    signatures
 *  - the payload is minimal: subject (email), issued-at, expiration. No
 *    passwords, roles, or business data live in the token.
 *  - the secret has no default; startup fails fast if it is missing or weak.
 *  - this class NEVER logs tokens.
 */
@Service
public class JwtService {

    private final SecretKey signingKey;
    private final long expirationMs;

    public JwtService(@Value("${app.jwt.secret}") String secret,
                      @Value("${app.jwt.expiration-ms}") long expirationMs) {
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException(
                    "app.jwt.secret is not configured. Run setup.bat once (Windows) to create "
                            + "erp-backend/.env, or set ERP_JWT_SECRET (generate with: openssl rand -base64 64). "
                            + "Refusing to start with an empty secret.");
        }
        try {
            this.signingKey = Keys.hmacShaKeyFor(Decoders.BASE64.decode(secret));
        } catch (WeakKeyException | IllegalArgumentException e) {
            throw new IllegalStateException(
                    "app.jwt.secret is not a valid Base64 HMAC key of at least 256 bits. "
                            + "Generate one with: openssl rand -base64 64", e);
        }
        this.expirationMs = expirationMs;
    }

    public String generateToken(UserDetails userDetails) {
        return Jwts.builder()
                .subject(userDetails.getUsername())
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expirationMs))
                .signWith(signingKey)
                .compact();
    }

    /** Subject (email) of a validly signed token. Throws on invalid tokens. */
    public String extractUsername(String token) {
        return parseClaims(token).getSubject();
    }

    /**
     * True when the token's subject matches the given user and it has not
     * expired. Signature/format validity is enforced by {@link #parseClaims}.
     * Account state (enabled/locked) is checked by the JWT filter against the
     * freshly-loaded UserDetails, not by this method.
     */
    public boolean isValid(String token, UserDetails userDetails) {
        Claims claims = parseClaims(token);
        String username = claims.getSubject();
        return username != null
                && !username.isBlank()
                && username.equals(userDetails.getUsername())
                && claims.getExpiration() != null
                && claims.getExpiration().after(new Date());
    }

    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
