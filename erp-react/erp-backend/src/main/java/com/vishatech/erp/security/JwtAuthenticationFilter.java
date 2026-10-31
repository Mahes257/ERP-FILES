package com.vishatech.erp.security;

import com.vishatech.erp.util.AuditContext;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.MalformedJwtException;
import io.jsonwebtoken.UnsupportedJwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Authenticates requests carrying a Bearer JWT.
 *
 * Failure handling (all safe, server-side only):
 *  - missing header        → request continues unauthenticated (401 for
 *                            protected endpoints via the entry point)
 *  - expired token         → logged EXPIRED, stays unauthenticated
 *  - malformed/unsupported → logged MALFORMED, stays unauthenticated
 *  - bad signature         → logged BAD_SIGNATURE, stays unauthenticated
 *  - user deleted/disabled → logged USER_NOT_FOUND / USER_DISABLED, stays
 *                            unauthenticated (disabled users cannot use
 *                            previously-issued tokens)
 *
 * The token itself is NEVER logged and never exposed to the client.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final CustomUserDetailsService userDetailsService;
    private final SecurityAuditLogger auditLogger;
    private final AuditContext auditContext;

    public JwtAuthenticationFilter(JwtService jwtService,
                                   CustomUserDetailsService userDetailsService,
                                   SecurityAuditLogger auditLogger,
                                   AuditContext auditContext) {
        this.jwtService = jwtService;
        this.userDetailsService = userDetailsService;
        this.auditLogger = auditLogger;
        this.auditContext = auditContext;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            // No token — leave the request unauthenticated; the authorization
            // rules decide whether this is allowed (public) or rejected (401).
            filterChain.doFilter(request, response);
            return;
        }
        String token = header.substring(7);
        if (token.isBlank()) {
            auditLogger.jwtRejected("MISSING", null, auditContext.ipAddress(), request.getRequestURI());
            filterChain.doFilter(request, response);
            return;
        }

        try {
            String email = jwtService.extractUsername(token);
            if (email == null || email.isBlank()) {
                auditLogger.jwtRejected("MALFORMED", null, auditContext.ipAddress(), request.getRequestURI());
                filterChain.doFilter(request, response);
                return;
            }
            if (SecurityContextHolder.getContext().getAuthentication() == null) {
                UserDetails userDetails = userDetailsService.loadUserByUsername(email);
                // Account-state enforcement: a still-valid token must NOT keep a
                // disabled/locked/expired account authenticated.
                if (!userDetails.isEnabled()) {
                    auditLogger.jwtRejected("USER_DISABLED", email, auditContext.ipAddress(), request.getRequestURI());
                    filterChain.doFilter(request, response);
                    return;
                }
                if (!userDetails.isAccountNonLocked()) {
                    auditLogger.jwtRejected("USER_LOCKED", email, auditContext.ipAddress(), request.getRequestURI());
                    filterChain.doFilter(request, response);
                    return;
                }
                if (!userDetails.isAccountNonExpired() || !userDetails.isCredentialsNonExpired()) {
                    auditLogger.jwtRejected("ACCOUNT_EXPIRED", email, auditContext.ipAddress(), request.getRequestURI());
                    filterChain.doFilter(request, response);
                    return;
                }
                if (jwtService.isValid(token, userDetails)) {
                    UsernamePasswordAuthenticationToken authToken =
                            new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
                    authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(authToken);
                } else {
                    // Signature/format valid but the subject does not match the
                    // loaded user (expired tokens throw before this point).
                    auditLogger.jwtRejected("SUBJECT_MISMATCH", email, auditContext.ipAddress(), request.getRequestURI());
                }
            }
        } catch (ExpiredJwtException e) {
            auditLogger.jwtRejected("EXPIRED", safeSubject(e.getClaims() == null ? null : e.getClaims().getSubject()),
                    auditContext.ipAddress(), request.getRequestURI());
        } catch (UnsupportedJwtException e) {
            auditLogger.jwtRejected("UNSUPPORTED_ALGORITHM", null, auditContext.ipAddress(), request.getRequestURI());
        } catch (MalformedJwtException e) {
            auditLogger.jwtRejected("MALFORMED", null, auditContext.ipAddress(), request.getRequestURI());
        } catch (io.jsonwebtoken.security.SecurityException e) {
            // Includes SignatureException (invalid signature / tampered token).
            auditLogger.jwtRejected("BAD_SIGNATURE", null, auditContext.ipAddress(), request.getRequestURI());
        } catch (UsernameNotFoundException e) {
            auditLogger.jwtRejected("USER_NOT_FOUND", null, auditContext.ipAddress(), request.getRequestURI());
        } catch (DisabledException e) {
            auditLogger.jwtRejected("USER_DISABLED", null, auditContext.ipAddress(), request.getRequestURI());
        } catch (JwtException e) {
            auditLogger.jwtRejected("INVALID", null, auditContext.ipAddress(), request.getRequestURI());
        }
        // Any failure above leaves the request unauthenticated — an invalid
        // JWT is never converted into an authenticated principal.
        filterChain.doFilter(request, response);
    }

    private String safeSubject(String subject) {
        return subject == null || subject.isBlank() ? null : subject;
    }
}
