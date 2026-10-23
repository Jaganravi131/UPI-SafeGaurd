package com.upisafeguard.core.cache;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Redis driver — selected with {@code APP_CACHE_DRIVER=redis}. Gives the app
 * shared, TTL-governed state across replicas: rate-limit windows, the active
 * intervention registry, and (later) cache-aside lookups.
 *
 * Value shapes and key patterns are identical to the in-memory driver so both
 * drivers are interchangeable (see docs/system-design.md, Redis keyspace).
 */
@Component
@ConditionalOnProperty(name = "app.cache.driver", havingValue = "redis")
public class RedisCacheService implements CacheService {

    private final StringRedisTemplate redis;

    public RedisCacheService(StringRedisTemplate redis) {
        this.redis = redis;
    }

    @Override
    public long increment(String key, Duration ttl) {
        Long count = redis.opsForValue().increment(key);
        if (count != null && count == 1) {
            redis.expire(key, ttl);
        }
        return count == null ? 0 : count;
    }

    @Override
    public Optional<String> get(String key) {
        return Optional.ofNullable(redis.opsForValue().get(key));
    }

    @Override
    public void put(String key, String value, Duration ttl) {
        if (ttl != null) {
            redis.opsForValue().set(key, value, ttl);
        } else {
            redis.opsForValue().set(key, value);
        }
    }

    @Override
    public void delete(String key) {
        redis.delete(key);
    }

    @Override
    public void hput(String key, String field, String value) {
        redis.opsForHash().put(key, field, value);
    }

    @Override
    public Optional<String> hget(String key, String field) {
        Object value = redis.opsForHash().get(key, field);
        return Optional.ofNullable(value == null ? null : String.valueOf(value));
    }

    @Override
    public void hdelete(String key, String field) {
        redis.opsForHash().delete(key, field);
    }

    @Override
    public Map<String, String> hgetall(String key) {
        Map<Object, Object> entries = redis.opsForHash().entries(key);
        if (entries == null || entries.isEmpty()) {
            return Map.of();
        }
        Map<String, String> snapshot = new java.util.LinkedHashMap<>();
        for (Map.Entry<Object, Object> entry : entries.entrySet()) {
            snapshot.put(String.valueOf(entry.getKey()), String.valueOf(entry.getValue()));
        }
        return Map.copyOf(snapshot);
    }
}
