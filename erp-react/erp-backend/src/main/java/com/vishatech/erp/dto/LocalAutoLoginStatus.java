package com.vishatech.erp.dto;

/**
 * Answer to {@code GET /auth/local-auto-login/status}.
 *
 * <p>{@code enabled} is only true when the feature is configured on the server
 * AND the caller is a local, non-proxied request — an external client always
 * sees {@code false}.
 */
public record LocalAutoLoginStatus(boolean enabled) {
}
