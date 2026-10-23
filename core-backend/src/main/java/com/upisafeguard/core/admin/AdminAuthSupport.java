package com.upisafeguard.core.admin;

import java.time.Instant;
import java.util.Date;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCrypt;
import org.springframework.stereotype.Component;

import com.upisafeguard.core.config.JwtConfig;
import com.upisafeguard.core.persistence.Admin;
import com.upisafeguard.core.persistence.AdminRepository;
import com.upisafeguard.core.web.ApiRequestException;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;

/**
 * Admin JWT issuing/validation + role guards. Port of the helpers in
 * backend/app/api/routes/admin_auth.py:
 *
 * - tokens signed with the SAME secret the FastAPI backend uses
 *   (JWT_SECRET_KEY), claim {@code type=}, 12 hour expiry
 * - bearer guards return the FastAPI status/detail pairs verbatim:
 *   401 "Not authenticated" / "Invalid or expired token" / "Admin not found" /
 *   403 "Admin account is deactivated" / "Insufficient permissions"
 */
@Component
public class AdminAuthSupport {

    public static final Set<String> ALL_ROLES = Set.of("super_admin", "admin", "analyst", "support");

    private static final long TWELVE_HOURS_MS = 12L * 60 * 60 * 1000;

    private final JwtConfig jwtConfig;
    private final AdminRepository adminRepository;

    public AdminAuthSupport(JwtConfig jwtConfig, AdminRepository adminRepository) {
        this.jwtConfig = jwtConfig;
        this.adminRepository = adminRepository;
    }

    /** 12 h token with {@code type: admin} claim, mirroring create_admin_token(). */
    public String createToken(Admin admin) {
        return Jwts.builder()
                .setSubject(admin.getId().toString())
                .claim("email", admin.getEmail())
                .claim("type", "admin")
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + TWELVE_HOURS_MS))
                .signWith(jwtConfig.getSigningKey(), io.jsonwebtoken.SignatureAlgorithm.HS256)
                .compact();
    }

    /** Returns the parsed claims when the token is a valid admin token, else empty. */
    public java.util.Optional<Claims> decode(String authHeader) {
        String token = bearerToken(authHeader);
        if (token == null) {
            throw new ApiRequestException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(jwtConfig.getSigningKey())
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            if (!"admin".equals(claims.get("type", String.class))) {
                return java.util.Optional.empty();
            }
            return java.util.Optional.of(claims);
        } catch (Exception unknownClaims) {
            return java.util.Optional.empty();
        }
    }

    /** Any authenticated, active admin (get_current_admin parity). Throws FastAPI-status errors. */
    public Admin requireAdmin(String authHeader) {
        String adminId = decode(authHeader)
                .map(claims -> claims.getSubject())
                .orElseThrow(() -> new ApiRequestException(HttpStatus.UNAUTHORIZED, "Invalid or expired token"));
        Admin admin = adminRepository.findById(parseId(adminId))
                .orElseThrow(() -> new ApiRequestException(HttpStatus.UNAUTHORIZED, "Admin not found"));
        if (!Boolean.TRUE.equals(admin.getIsActive())) {
            throw new ApiRequestException(HttpStatus.FORBIDDEN, "Admin account is deactivated");
        }
        return admin;
    }

    /** Authenticated admin holding one of {@code allowedRoles} (require_role parity). */
    public Admin requireRole(String authHeader, Set<String> allowedRoles) {
        Admin admin = requireAdmin(authHeader);
        if (!allowedRoles.contains(admin.getRole())) {
            throw new ApiRequestException(HttpStatus.FORBIDDEN, "Insufficient permissions");
        }
        return admin;
    }

    /** User/front-end tokens must NOT pass admin guards: no {@code type=admin} claim. */
    public boolean isAdminToken(String authHeader) {
        return decode(authHeader).isPresent();
    }

    public static boolean verifyPassword(String plain, String bcryptHash) {
        try {
            return BCrypt.checkpw(plain, bcryptHash);
        } catch (IllegalArgumentException wrongFormat) {
            return false;
        }
    }

    public static String hashPassword(String plain) {
        return BCrypt.hashpw(plain, BCrypt.gensalt());
    }

    private static String bearerToken(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new ApiRequestException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        String token = authHeader.substring("Bearer ".length()).trim();
        return token.isEmpty() ? null : token;
    }

    private static java.util.UUID parseId(String value) {
        try {
            return java.util.UUID.fromString(value);
        } catch (IllegalArgumentException ex) {
            throw new ApiRequestException(HttpStatus.UNAUTHORIZED, "Invalid token payload");
        }
    }

    /** AdminResponse field order/keys match the Pydantic schema. */
    public static java.util.Map<String, Object> toResponse(Admin admin) {
        java.util.LinkedHashMap<String, Object> row = new java.util.LinkedHashMap<>();
        row.put("id", String.valueOf(admin.getId()));
        row.put("email", admin.getEmail());
        row.put("username", admin.getUsername());
        row.put("full_name", admin.getFullName());
        row.put("role", admin.getRole());
        row.put("is_active", Boolean.TRUE.equals(admin.getIsActive()));
        row.put("last_login", admin.getLastLogin() == null ? null : admin.getLastLogin().toString());
        row.put("created_at", admin.getCreatedAt() == null ? null : admin.getCreatedAt().toString());
        return row;
    }

    /** Guard helper for "token must not be stale" checks in tests. */
    public static boolean expiryInFuture(java.util.Optional<Claims> claims) {
        Date exp = claims.map(c -> c.getExpiration()).orElse(null);
        return exp != null && exp.getTime() > System.currentTimeMillis() && exp.getTime()
                <= Instant.now().plusMillis(TWELVE_HOURS_MS + 60_000).toEpochMilli();
    }
}
