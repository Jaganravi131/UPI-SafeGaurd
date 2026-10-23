package com.upisafeguard.core.services;

import java.time.Duration;

import com.upisafeguard.core.cache.CacheService;
import com.upisafeguard.core.web.ApiRequestException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * Distributed fixed-window rate limiting over {@link CacheService}.
 *
 * Works with the in-memory driver (single replica; behaves like the Python
 * backend's per-process limiter) and transparently becomes cluster-wide when
 * {@code APP_CACHE_DRIVER=redis}. Windows are 60 s counters; see
 * docs/system-design.md (Redis keyspace, rate-limit table).
 */
@Service
public class RateLimitService {

    private static final Duration WINDOW = Duration.ofSeconds(60);

    private final CacheService cache;

    @Value("${app.rate-limit.enabled:true}")
    private boolean enabled;

    @Value("${app.rate-limit.otp-requests-per-minute:5}")
    private int otpRequestsPerMinute;

    @Value("${app.rate-limit.otp-verifications-per-minute:10}")
    private int otpVerificationsPerMinute;

    @Value("${app.rate-limit.transfers-per-minute:60}")
    private int transfersPerMinute;

    @Value("${app.rate-limit.fraud-reports-per-minute:10}")
    private int fraudReportsPerMinute;

    public RateLimitService(CacheService cache) {
        this.cache = cache;
    }

    /** Throws FastAPI-compatible 429 when the caller exceeded the window. */
    public void otpRequest(String identifier) {
        tryConsume("otp_request", identifier, otpRequestsPerMinute);
    }

    public void otpVerify(String identifier) {
        tryConsume("otp_verify", identifier, otpVerificationsPerMinute);
    }

    public void transfer(String userId) {
        tryConsume("transfer", userId, transfersPerMinute);
    }

    public void fraudReport(String userId) {
        tryConsume("fraud_report", userId, fraudReportsPerMinute);
    }

    private void tryConsume(String scope, String identity, int limit) {
        if (!enabled) {
            return;
        }
        if (identity == null || identity.isBlank()) {
            return; // nothing to key on — downstream validation rejects
        }
        long hits = cache.increment("upi:rl:" + scope + ":" + identity.trim().toLowerCase(), WINDOW);
        if (hits > limit) {
            throw new ApiRequestException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many requests. Please try again in a minute.");
        }
    }
}
