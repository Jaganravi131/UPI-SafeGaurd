package com.upisafeguard.core.cache;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Default driver: plain in-memory KV + hash maps with lazy expiry.
 *
 * Selected when {@code app.cache.driver=memory} (the default), so tests and
 * single-node deployments need no Redis and the app behaves like the Python
 * reference backend. State that must survive process restarts already lives
 * in PostgreSQL (see docs/system-design.md for the driver trade-offs).
 */
@Component
@ConditionalOnProperty(name = "app.cache.driver", havingValue = "memory", matchIfMissing = true)
public class InMemoryCacheService implements CacheService {

    private record Entry(String value, long expiresAtMillis) {
        boolean alive() {
            return expiresAtMillis <= 0 || expiresAtMillis > System.currentTimeMillis();
        }
    }

    private final ConcurrentHashMap<String, Entry> kv = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, ConcurrentHashMap<String, String>> hashes = new ConcurrentHashMap<>();

    @Override
    public long increment(String key, Duration ttl) {
        // compute() is atomic per key under ConcurrentHashMap — safe counter.
        Entry result = kv.compute(key, (ignored, current) -> {
            if (current != null && current.alive()) {
                long next = Long.parseLong(current.value()) + 1;
                return new Entry(String.valueOf(next), current.expiresAtMillis());
            }
            long expiresAt = System.currentTimeMillis() + windowMillis(ttl);
            return new Entry("1", expiresAt);
        });
        return Long.parseLong(result.value());
    }

    @Override
    public Optional<String> get(String key) {
        Entry entry = kv.get(key);
        if (entry == null || !entry.alive()) {
            kv.remove(key);
            return Optional.empty();
        }
        return Optional.of(entry.value());
    }

    @Override
    public void put(String key, String value, Duration ttl) {
        long expiresAt = System.currentTimeMillis() + windowMillis(ttl);
        kv.put(key, new Entry(value, expiresAt));
    }

    /** Null-safe window length in ms (0 ⇒ non-expiring). */
    private static long windowMillis(Duration ttl) {
        return ttl == null ? 0 : ttl.toMillis();
    }

    @Override
    public void delete(String key) {
        kv.remove(key);
    }

    @Override
    public void hput(String key, String field, String value) {
        hashes.computeIfAbsent(key, ignored -> new ConcurrentHashMap<>()).put(field, value);
    }

    @Override
    public Optional<String> hget(String key, String field) {
        ConcurrentHashMap<String, String> fields = hashes.get(key);
        return Optional.ofNullable(fields == null ? null : fields.get(field));
    }

    @Override
    public void hdelete(String key, String field) {
        ConcurrentHashMap<String, String> fields = hashes.get(key);
        if (fields != null) {
            fields.remove(field);
        }
    }

    @Override
    public Map<String, String> hgetall(String key) {
        ConcurrentHashMap<String, String> fields = hashes.get(key);
        return fields == null ? Map.of() : Map.copyOf(fields);
    }
}
