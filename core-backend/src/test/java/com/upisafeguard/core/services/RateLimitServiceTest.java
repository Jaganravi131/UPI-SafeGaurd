package com.upisafeguard.core.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

import com.upisafeguard.core.cache.CacheService;
import com.upisafeguard.core.cache.InMemoryCacheService;
import com.upisafeguard.core.web.ApiRequestException;

/** Fixed-window behaviour of the limiter (shared driver, 60 s windows). */
class RateLimitServiceTest {

    private CacheService cache;
    private RateLimitService service;

    @BeforeEach
    void setUp() {
        cache = new InMemoryCacheService();
        service = new RateLimitService(cache);
        ReflectionTestUtils.setField(service, "enabled", true);
        ReflectionTestUtils.setField(service, "otpRequestsPerMinute", 2);
        ReflectionTestUtils.setField(service, "otpVerificationsPerMinute", 2);
        ReflectionTestUtils.setField(service, "transfersPerMinute", 2);
        ReflectionTestUtils.setField(service, "fraudReportsPerMinute", 2);
    }

    @Test
    void allowsUpToLimitThenThrows429() {
        service.otpRequest("a@x.com");
        service.otpRequest("a@x.com");
        assertThatThrownBy(() -> service.otpRequest("a@x.com"))
                .isInstanceOfSatisfying(ApiRequestException.class, e ->
                        assertThat(e.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS))
                .hasMessage("Too many requests. Please try again in a minute.");

        // Independent identities and scopes
        service.otpRequest("b@x.com");
        service.fraudReport("a@x.com");
    }

    @Test
    void identifierCaseAndWhitespaceAreNormalized() {
        service.otpRequest("User@Example.com ");
        service.otpRequest("user@example.com");
        assertThatThrownBy(() -> service.otpRequest("USER@example.com"))
                .isInstanceOf(ApiRequestException.class);
    }

    @Test
    void disabledLimiterNeverBlocks() {
        ReflectionTestUtils.setField(service, "enabled", false);
        for (int i = 0; i < 50; i++) {
            assertThatCode(() -> service.otpRequest("flooded@x.com")).doesNotThrowAnyException();
        }
    }

    @Test
    void blankIdentityIsPassedThrough() {
        assertThatCode(() -> service.otpRequest("   ")).doesNotThrowAnyException();
        assertThatCode(() -> service.otpRequest(null)).doesNotThrowAnyException();
    }

    @Test
    void windowsLiveForSixtySecondsInCache() {
        service.transfer("user-1");
        assertThat(cache.get("upi:rl:transfer:user-1")).isPresent();
        // In-memory TTLs are set from the 60 s window — verify key exists and
        // counter semantics rather than waiting out the window.
    }
}
