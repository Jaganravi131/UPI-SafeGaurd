package com.upisafeguard.core.web;

import com.upisafeguard.core.config.JwtConfig;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Shared bearer-token wiring for endpoints that match the FastAPI contract:
 * missing/invalid Authorization header → 401, token whose subject does not own
 * the addressed resource → 403.
 */
@Component
public class AuthSupport {

    private final JwtConfig jwtConfig;

    public AuthSupport(JwtConfig jwtConfig) {
        this.jwtConfig = jwtConfig;
    }

    /** Extract the authenticated user id from a "Bearer ..." header. */
    public String requireUserId(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new ApiRequestException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        String token = authHeader.substring("Bearer ".length()).trim();
        if (!jwtConfig.validateToken(token)) {
            throw new ApiRequestException(HttpStatus.UNAUTHORIZED, "Invalid or expired session");
        }
        return jwtConfig.extractUserId(token);
    }

    /** Only the wallet/account owner may act on it. */
    public void assertOwner(String tokenUserId, String pathUserId) {
        if (tokenUserId == null || !tokenUserId.equalsIgnoreCase(pathUserId)) {
            throw new ApiRequestException(HttpStatus.FORBIDDEN, "Not your wallet");
        }
    }
}
