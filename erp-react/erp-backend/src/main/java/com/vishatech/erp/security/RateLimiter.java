package com.vishatech.erp.security;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.stereotype.Component;

/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * Intended for high-risk endpoints (login/register/refresh). It deliberately
 * avoids permanent lockouts: windows are short and sliding only in the sense
 * that a new window starts as soon as the current one expires.
 *
 * NOTE: state is per application instance (not shared across replicas). For a
 * multi-instance deployment, move this to a shared store (Redis) or a reverse
 * proxy (nginx limit_req). Out of scope here (Redis is explicitly excluded).
 */
@Component
public class RateLimiter {

    private static final long SWEEP_THRESHOLD = 10_000;
    private static final long SWEEP_WINDOW_MS = 60_000L * 60 * 24; // purge entries older than 24 h

    private final Map<String, Window> windows = new ConcurrentHashMap<>();
    private final AtomicInteger calls = new AtomicInteger();

    /**
     * @return true when the caller may proceed, false when rate-limited.
     */
    public boolean tryAcquire(String key, int maxAttempts, long windowMillis) {
        long now = System.currentTimeMillis();
        Window current = windows.compute(key, (k, existing) -> {
            if (existing == null || now - existing.windowStart >= windowMillis) {
                return new Window(now, 1);
            }
            return new Window(existing.windowStart, existing.count + 1);
        });
        maybeSweep(now);
        return current.count <= maxAttempts;
    }

    /** Remaining seconds until the caller's window resets (0 when unknown). */
    public long retryAfterSeconds(String key, long windowMillis) {
        Window window = windows.get(key);
        if (window == null) {
            return 0;
        }
        long remaining = window.windowStart + windowMillis - System.currentTimeMillis();
        return Math.max(0, remaining / 1000);
    }

    /** Resets a key (e.g. after a successful login clears the failure counter). */
    public void reset(String key) {
        windows.remove(key);
    }

    /**
     * Drops every window whose key starts with {@code prefix}.
     *
     * <p>Exists for the test suite. The limiter is one bean per Spring context
     * and its windows are keyed by client IP, so every test class served by the
     * same cached context spends the SAME per-IP auth budget: without scoped
     * clearing, a class fails with an order-dependent 429 that depends on how
     * many auth calls ran before it (see
     * {@code AbstractSecurityTest#isolateAuthRateLimitWindows}). Production code
     * does not call this — expiry is the only reset a deployment needs.
     */
    public void clear(String prefix) {
        windows.keySet().removeIf(key -> key.startsWith(prefix));
    }

    private void maybeSweep(long now) {
        if (calls.incrementAndGet() % 1000 != 0 || windows.size() < SWEEP_THRESHOLD) {
            return;
        }
        long cutoff = now - SWEEP_WINDOW_MS;
        windows.entrySet().removeIf(e -> e.getValue().windowStart < cutoff);
    }

    private record Window(long windowStart, int count) {
    }
}
