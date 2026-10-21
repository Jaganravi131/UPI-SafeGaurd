package com.upisafeguard.core.config;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

import javax.crypto.SecretKey;
import java.util.Date;

@Configuration
public class JwtConfig {

    @Value("${jwt.secret:upi-safeguard-secret-key-change-in-production}")
    private String secret;

    @Value("${jwt.expiry-hours:24}")
    private int expiryHours;

    private SecretKey key;

    public SecretKey getSigningKey() {
        if (key == null) {
            key = Keys.hmacShaKeyFor(secret.getBytes());
        }
        return key;
    }

    public String generateToken(String userId, String email) {
        SecretKey key = getSigningKey();
        Date now = new Date();
        Date expiry = new Date(System.currentTimeMillis() + expiryHours * 60 * 60 * 1000L);

        return Jwts.builder()
                .setSubject(userId)
                .claim("email", email)
                .setIssuedAt(now)
                .setExpiration(expiry)
                .signWith(key, SignatureAlgorithm.HS256)
                .compact();
    }

    public String extractUserId(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload()
                .getSubject();
    }

    public boolean validateToken(String token) {
        try {
            Jwts.parser()
                    .verifyWith(getSigningKey())
                    .build()
                    .parseSignedClaims(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}