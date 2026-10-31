package com.vishatech.erp.util;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Simple in-memory TTL-based cache for master/reference data.
 *
 * <p>This cache avoids repeated database reads for stable master data (UOMs,
 * currencies, departments, etc.) that change infrequently. It uses a
 * ConcurrentHashMap for thread safety and has no external dependencies.
 *
 * <p>Cache can be disabled entirely via {@code app.cache.enabled=false}.
 *
 * <p>Each cached entry stores:
 * <ul>
 *   <li>The data object</li>
 *   <li>The timestamp when it was written</li>
 * </ul>
 *
 * <p>Eviction:
 * <ul>
 *   <li>TTL-based: entries are evicted after the configured TTL</li>
 *   <li>Explicit invalidation: call {@link #evict(String)} after create/update/delete</li>
 *   <li>Full clear: call {@link #clear()} to evict all entries</li>
 * </ul>
 */
@Component
public class MasterDataCache {

    private static final Logger log = LoggerFactory.getLogger(MasterDataCache.class);

    private final boolean enabled;
    private final long ttlMillis;

    /** key → cached entry */
    private final Map<String, CacheEntry<Object>> cache = new ConcurrentHashMap<>();

    public MasterDataCache(
            @Value("${app.cache.enabled:true}") boolean enabled,
            @Value("${app.cache.masters.ttl-minutes:60}") long ttlMinutes) {
        this.enabled = enabled;
        this.ttlMillis = ttlMinutes * 60_000;
        log.info("MasterDataCache initialized: enabled={}, ttlMinutes={}", enabled, ttlMinutes);
    }

    /**
     * Get a cached value, or null if absent/expired.
     *
     * @param key the cache key (e.g. the master key)
     * @return the cached value, or null
     */
    @SuppressWarnings("unchecked")
    public <T> T get(String key) {
        if (!enabled) return null;

        CacheEntry<Object> entry = cache.get(key);
        if (entry == null) {
            return null;
        }
        if (System.currentTimeMillis() - entry.writtenAt > ttlMillis) {
            cache.remove(key);
            return null;
        }
        return (T) entry.data;
    }

    /**
     * Store a value in the cache.
     *
     * @param key  the cache key
     * @param data the data to cache
     */
    public void put(String key, Object data) {
        if (!enabled) return;
        cache.put(key, new CacheEntry<Object>(data));
    }

    /**
     * Evict a single cache key. Call this after create/update/delete.
     *
     * @param key the cache key to evict
     */
    public void evict(String key) {
        cache.remove(key);
    }

    /**
     * Clear the entire cache.
     */
    public void clear() {
        cache.clear();
    }

    /** Returns true if caching is enabled. */
    public boolean isEnabled() {
        return enabled;
    }

    /** Returns the number of entries currently in the cache. */
    public int size() {
        return cache.size();
    }

    private static class CacheEntry<T> {
        final T data;
        final long writtenAt;

        CacheEntry(T data) {
            this.data = data;
            this.writtenAt = System.currentTimeMillis();
        }
    }
}
