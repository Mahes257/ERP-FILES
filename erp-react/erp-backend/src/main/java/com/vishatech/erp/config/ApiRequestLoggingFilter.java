package com.vishatech.erp.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Logs every HTTP request/response with a correlation ID.
 *
 * <p>This filter is the single request logger for the application: exactly
 * ONE line is emitted per request, after the response is written, so no
 * framework or custom component has to add its own per-request line:
 *
 * <pre>
 * [API] GET /v1/purchase/orders -> 200
 * [API] POST /v1/purchase/orders -> 201
 * [API] GET /v1/purchase/orders/999999 -> 404
 * [API] POST /v1/purchase/orders -> 500
 * </pre>
 *
 * <p>The level follows the response so failures are easy to spot without
 * duplicating the entry: INFO for 1xx/2xx/3xx, WARN for 4xx and ERROR for
 * 5xx. The exception itself is still logged by the application's existing
 * error handling with its full stack trace.
 *
 * <p>The correlation ID is either accepted from the incoming
 * {@code X-Request-Id} header (if it looks like a safe UUID or short token)
 * or generated fresh.  It is placed in SLF4J MDC so every log line emitted
 * during the request carries it, and returned in the response header so the
 * caller can correlate its own logs.
 *
 * <p>PII policy: the request URI and method are logged; email addresses,
 * passwords, tokens, and other secrets are never logged by this filter.
 * Only method, path and status reach the console (duration at DEBUG only).
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class ApiRequestLoggingFilter extends OncePerRequestFilter {

    private static final Logger LOG = LoggerFactory.getLogger(ApiRequestLoggingFilter.class);

    /** MDC key used by logback-spring.xml and every log line. */
    public static final String MDC_CORRELATION_ID = "correlationId";

    /** Response header the client can read to correlate its own logs. */
    public static final String RESPONSE_HEADER = "X-Request-Id";

    /** Max length of an accepted incoming request id. */
    private static final int MAX_INCOMING_ID_LENGTH = 128;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String correlationId = resolveCorrelationId(request);
        MDC.put(MDC_CORRELATION_ID, correlationId);
        response.setHeader(RESPONSE_HEADER, correlationId);

        long start = System.currentTimeMillis();
        try {
            filterChain.doFilter(request, response);
        } finally {
            long elapsed = System.currentTimeMillis() - start;
            logRequest(request.getMethod(), sanitizeUri(request.getRequestURI()),
                    response.getStatus(), elapsed);
            MDC.remove(MDC_CORRELATION_ID);
        }
    }

    /**
     * Emits the single, canonical API log line for a completed request.
     *
     * @param status     the HTTP status the response was committed with
     * @param elapsedMs  wall-clock time spent inside the filter chain; the
     *                   duration is emitted only at DEBUG level and never in
     *                   the normal {@code [API] ... -> STATUS} terminal line
     */
    private static void logRequest(String method, String uri, int status, long elapsedMs) {
        if (LOG.isDebugEnabled()) {
            LOG.debug("[API] {} {} -> {} ({}ms)", method, uri, status, elapsedMs);
        }
        String message = "[API] {} {} -> {}";
        if (status >= 500) {
            LOG.error(message, method, uri, status);
        } else if (status >= 400) {
            LOG.warn(message, method, uri, status);
        } else {
            LOG.info(message, method, uri, status);
        }
    }

    /**
     * Accepts a safe incoming request id or generates a new one.
     * Incoming values are accepted only if they are non-blank, at most
     * {@value #MAX_INCOMING_ID_LENGTH} characters, and contain only
     * alphanumeric characters, hyphens, or underscores.
     */
    private String resolveCorrelationId(HttpServletRequest request) {
        String incoming = request.getHeader(RESPONSE_HEADER);
        if (incoming != null && !incoming.isBlank()
                && incoming.length() <= MAX_INCOMING_ID_LENGTH
                && incoming.matches("[a-zA-Z0-9\\-_]+")) {
            return incoming;
        }
        return UUID.randomUUID().toString();
    }

    /**
     * Strips query parameters and truncates to a safe length so log lines
     * stay compact and never contain secrets that may appear in query strings.
     */
    private String sanitizeUri(String uri) {
        if (uri == null) {
            return "/";
        }
        int q = uri.indexOf('?');
        String path = q >= 0 ? uri.substring(0, q) : uri;
        return path.length() > 200 ? path.substring(0, 200) + "…" : path;
    }
}
