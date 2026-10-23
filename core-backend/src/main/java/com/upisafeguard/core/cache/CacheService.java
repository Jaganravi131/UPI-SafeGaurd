package com.upisafeguard.core.cache;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;

/**
 * Minimal coordination primitives shared by the Redis driver and the
 * in-memory fallback driver ({@link InMemoryCacheService}, the default for
 * single-node deployments and tests).
 *
 * Supported patterns (see docs/system-design.md):
 * - Fixed-window rate limiting counters ({@link #increment})
 * - Hash state that must be visible across replicas (active interventions)
 */
public interface CacheService {

    /** Atomic counter: add one and return the new value. A fresh key gets a TTL. */
    long increment(String key, Duration ttl);

    Optional<String> get(String key);

    void put(String key, String value, Duration ttl);

    void delete(String key);

    /** HSET: field inside a hash stored under {@code key}. */
    void hput(String key, String field, String value);

    /** HGET: field inside a hash; empty when the hash or field is missing. */
    Optional<String> hget(String key, String field);

    /** HDEL: remove one field (or no-op when the hash/field is gone). */
    void hdelete(String key, String field);

    /** HGETALL: immutable snapshot of all fields of the hash (empty when absent). */
    Map<String, String> hgetall(String key);
}
