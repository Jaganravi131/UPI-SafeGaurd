package com.upisafeguard.core.cache;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.Map;

import org.junit.jupiter.api.Test;

/**
 * The in-memory driver is the reference semantics of {@link CacheService} —
 * the Redis driver must expose identical behaviour (see docs/system-design.md).
 */
class InMemoryCacheServiceTest {

    private final InMemoryCacheService cache = new InMemoryCacheService();

    @Test
    void incrementCountsAndResetsWhenWindowExpires() throws InterruptedException {
        assertThat(cache.increment("rl:test:a", Duration.ofMillis(60))).isEqualTo(1);
        assertThat(cache.increment("rl:test:a", Duration.ofMillis(60))).isEqualTo(2);
        assertThat(cache.increment("rl:test:b", Duration.ofMillis(60))).isEqualTo(1);

        Thread.sleep(80); // both windows expired now
        assertThat(cache.increment("rl:test:a", Duration.ofMillis(60))).isEqualTo(1);

        // Independent counters per key
        assertThat(cache.increment("rl:test:b", Duration.ofMillis(60))).isEqualTo(1);
    }

    @Test
    void getPutDeleteWithTtl() {
        cache.put("k:v", "value", Duration.ofSeconds(10));
        assertThat(cache.get("k:v")).contains("value");

        cache.delete("k:v");
        assertThat(cache.get("k:v")).isEmpty();

        Long.parseLong("0"); // sanity: no side effects
    }

    @Test
    void expiredKeysAreNotVisible() throws InterruptedException {
        cache.put("k:ttl", "old", Duration.ofMillis(30));
        Thread.sleep(50);
        assertThat(cache.get("k:ttl")).isEmpty();
        assertThat(cache.get("k:missing")).isEmpty();
    }

    @Test
    void hashOperationsRoundTrip() {
        cache.hput("h:map", "f1", "one");
        cache.hput("h:map", "f2", "two");

        assertThat(cache.hget("h:map", "f1")).contains("one");
        assertThat(cache.hget("h:map", "missing")).isEmpty();
        assertThat(cache.hget("h:missing", "f1")).isEmpty();

        Map<String, String> all = cache.hgetall("h:map");
        assertThat(all).containsExactlyInAnyOrderEntriesOf(Map.of("f1", "one", "f2", "two"));

        cache.hdelete("h:map", "f1");
        assertThat(cache.hgetall("h:map")).containsOnlyKeys("f2");

        // Deleting a field of a missing hash is a safe no-op
        cache.hdelete("h:missing", "f1");
    }

    @Test
    void incrementTtlDoesNotApplyToExistingAliveValue() {
        cache.put("counter:mixed", "5", Duration.ofSeconds(10));
        assertThat(cache.increment("counter:mixed", Duration.ofSeconds(10))).isEqualTo(6);
        assertThat(cache.get("counter:mixed")).contains("6");
    }
}
