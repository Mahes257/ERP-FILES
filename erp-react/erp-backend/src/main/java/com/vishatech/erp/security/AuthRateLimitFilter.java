package com.vishatech.erp.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.dto.ApiResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * IP-level rate limiting for the high-risk authentication endpoints.
 * Returns 429 + Retry-After without ever blocking permanently.
 *
 * Email+IP-level login limiting is enforced separately inside AuthService
 * (it needs the parsed request body).
 */
@Component
public class AuthRateLimitFilter extends OncePerRequestFilter {

    private final RateLimiter rateLimiter;
    private final ObjectMapper objectMapper;
    private final SecurityAuditLogger auditLogger;

    private final int loginMaxPerIp;
    private final long loginWindowMs;
    private final int registerMaxPerIp;
    private final long registerWindowMs;
    private final int refreshMaxPerIp;
    private final long refreshWindowMs;

    public AuthRateLimitFilter(RateLimiter rateLimiter,
                               ObjectMapper objectMapper,
                               SecurityAuditLogger auditLogger,
                               @Value("${app.rate-limit.login.max-per-ip:20}") int loginMaxPerIp,
                               @Value("${app.rate-limit.login.window-minutes:15}") long loginWindowMinutes,
                               @Value("${app.rate-limit.register.max-per-ip:5}") int registerMaxPerIp,
                               @Value("${app.rate-limit.register.window-minutes:60}") long registerWindowMinutes,
                               @Value("${app.rate-limit.refresh.max-per-ip:60}") int refreshMaxPerIp,
                               @Value("${app.rate-limit.refresh.window-minutes:15}") long refreshWindowMinutes) {
        this.rateLimiter = rateLimiter;
        this.objectMapper = objectMapper;
        this.auditLogger = auditLogger;
        this.loginMaxPerIp = loginMaxPerIp;
        this.loginWindowMs = loginWindowMinutes * 60_000L;
        this.registerMaxPerIp = registerMaxPerIp;
        this.registerWindowMs = registerWindowMinutes * 60_000L;
        this.refreshMaxPerIp = refreshMaxPerIp;
        this.refreshWindowMs = refreshWindowMinutes * 60_000L;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!"POST".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String path = request.getRequestURI();
        // Strip the servlet context path (/v1) — compare against auth routes.
        String context = request.getContextPath();
        if (context != null && !context.isEmpty() && path.startsWith(context)) {
            path = path.substring(context.length());
        }
        return !("/auth/login".equals(path)
                || "/auth/register".equals(path)
                || "/auth/refresh".equals(path));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String ip = clientIp(request);
        String path = request.getRequestURI();
        String action = path.endsWith("/login") ? "login" : path.endsWith("/register") ? "register" : "refresh";
        String key = "auth:" + action + ":" + ip;

        int max;
        long windowMs;
        switch (action) {
            case "register" -> {
                max = registerMaxPerIp;
                windowMs = registerWindowMs;
            }
            case "refresh" -> {
                max = refreshMaxPerIp;
                windowMs = refreshWindowMs;
            }
            default -> {
                max = loginMaxPerIp;
                windowMs = loginWindowMs;
            }
        }

        if (!rateLimiter.tryAcquire(key, max, windowMs)) {
            long retryAfter = rateLimiter.retryAfterSeconds(key, windowMs);
            if (action.equals("login")) {
                auditLogger.loginBlocked(null, ip);
            } else {
                auditLogger.registerBlocked(ip);
            }
            response.setStatus(429); // HttpServletResponse.SC_TOO_MANY_REQUESTS
            response.setHeader("Retry-After", String.valueOf(Math.max(1, retryAfter)));
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write(objectMapper.writeValueAsString(
                    ApiResponse.error("Too many attempts. Please try again later.")));
            return;
        }

        filterChain.doFilter(request, response);
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
