package com.vishatech.erp.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.dto.ApiResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.security.SecurityProperties;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.unit.DataSize;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Rejects an overweight multipart upload from its {@code Content-Length} header,
 * before the servlet container spools a single byte of the body to disk.
 *
 * <p>The container only learns an upload is too large once it has parsed enough
 * of it to cross {@code max-request-size}, by which time the bytes have travelled
 * the network and landed in the spool directory. Checking the declared length
 * up front turns that into an immediate 413: the client gets the same error
 * shape as the global handler, and the server spends no disk, network or worker
 * time on a body it will never accept.
 *
 * <p>Requests without a declared length (chunked transfer encoding) cannot be
 * judged from headers alone; those still fall through to the container limit and
 * the existing {@code MaxUploadSizeExceededException} → 413 handler.
 *
 * <p>The response closes the connection so the container does not swallow the
 * rest of a multi-gigabyte body just to keep a doomed connection alive.
 *
 * <p>Ordered just after the security filter chain, so authentication and
 * authorization still decide first and this gate never becomes an unauthenticated
 * side channel.
 */
@Component
@Order(SecurityProperties.DEFAULT_FILTER_ORDER + 10)
public class UploadSizeGateFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(UploadSizeGateFilter.class);

    private final long maxRequestBytes;
    private final String maxRequestLabel;
    private final ObjectMapper objectMapper;

    public UploadSizeGateFilter(
            @Value("${spring.servlet.multipart.max-request-size:2200MB}") String maxRequestSize,
            ObjectMapper objectMapper) {
        this.maxRequestBytes = DataSize.parse(maxRequestSize).toBytes();
        this.maxRequestLabel = maxRequestSize.trim();
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        if (isMultipart(request)) {
            long declared = request.getContentLengthLong();
            if (declared > maxRequestBytes) {
                reject(request, response, declared);
                return;
            }
        }
        filterChain.doFilter(request, response);
    }

    private boolean isMultipart(HttpServletRequest request) {
        String contentType = request.getContentType();
        return contentType != null && contentType.toLowerCase(Locale.ROOT).startsWith("multipart/");
    }

    private void reject(HttpServletRequest request, HttpServletResponse response, long declared)
            throws IOException {
        long overBy = declared - maxRequestBytes;
        log.warn("Rejected {} {}: declared upload size {} bytes exceeds the {} limit by {} bytes.",
                request.getMethod(), request.getRequestURI(), declared, maxRequestLabel, overBy);
        response.setStatus(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        // Nothing in this body is worth reading to the end.
        response.setHeader(HttpHeaders.CONNECTION, "close");
        objectMapper.writeValue(response.getWriter(), ApiResponse.error(
                "Upload rejected: the request is larger than the server limit of "
                        + maxRequestLabel + ". Upload fewer or smaller files."));
        response.flushBuffer();
    }
}
