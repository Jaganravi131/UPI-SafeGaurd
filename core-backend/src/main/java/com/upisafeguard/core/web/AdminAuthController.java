package com.upisafeguard.core.web;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.upisafeguard.core.admin.AdminAuthSupport;
import com.upisafeguard.core.persistence.ActivityLog;
import com.upisafeguard.core.persistence.ActivityLogRepository;
import com.upisafeguard.core.persistence.Admin;
import com.upisafeguard.core.persistence.AdminRepository;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Admin authentication — port of backend/app/api/routes/admin_auth.py with
 * byte-comparable response shapes. Frontend contract (adminAuthAPI):
 * login / logout / me / demo-login / create-first-admin.
 */
@RestController
@RequestMapping("/api/v1/admin/auth")
public class AdminAuthController {

    private static final String DEMO_EMAIL = "admin@upisafeguard.com";

    private final AdminRepository adminRepository;
    private final ActivityLogRepository activityLogRepository;
    private final AdminAuthSupport auth;
    private final boolean demoAdminEnabled;
    private final String adminDefaultPassword;

    @Autowired
    public AdminAuthController(
            AdminRepository adminRepository,
            ActivityLogRepository activityLogRepository,
            AdminAuthSupport auth,
            @Value("${app.expose-demo-admin:true}") boolean demoAdminEnabled,
            @Value("${ADMIN_DEFAULT_PASSWORD:}") String adminDefaultPassword) {
        this.adminRepository = adminRepository;
        this.activityLogRepository = activityLogRepository;
        this.auth = auth;
        this.demoAdminEnabled = demoAdminEnabled;
        this.adminDefaultPassword = adminDefaultPassword;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@org.springframework.web.bind.annotation.RequestBody @jakarta.validation.Valid LoginRequest request) {
        Admin admin = adminRepository.findByEmailIgnoreCase(request.getEmail().trim()).orElse(null);
        if (admin == null || !AdminAuthSupport.verifyPassword(request.getPassword(), admin.getPasswordHash())) {
            throw new ApiRequestException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
        }
        if (!Boolean.TRUE.equals(admin.getIsActive())) {
            throw new ApiRequestException(HttpStatus.FORBIDDEN, "Admin account is deactivated");
        }
        admin.setLastLogin(Instant.now());
        adminRepository.save(admin);
        logActivity(admin.getId(), "login", null, null, null);
        return ResponseEntity.ok(tokenResponse(admin));
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        Admin admin = auth.requireAdmin(authHeader);
        logActivity(admin.getId(), "logout", null, null, null);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", "Logged out successfully");
        return ResponseEntity.ok(body);
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        Admin admin = auth.requireAdmin(authHeader);
        return ResponseEntity.ok(AdminAuthSupport.toResponse(admin));
    }

    @PostMapping("/create-first-admin")
    public ResponseEntity<?> createFirstAdmin(
            @org.springframework.web.bind.annotation.RequestBody @jakarta.validation.Valid CreateAdminRequest request) {
        if (adminRepository.count() > 0) {
            throw new ApiRequestException(HttpStatus.BAD_REQUEST,
                    "Admin already exists. Use admin panel to create more admins.");
        }
        Admin created = insertAdmin(request.getEmail(), request.getUsername(),
                request.getPassword(), request.getFullName(), "super_admin");
        return ResponseEntity.ok(AdminAuthSupport.toResponse(created));
    }

    /** Demo convenience — creates the demo super admin on demand, exactly like the Python route. */
    @PostMapping("/demo-login")
    public ResponseEntity<?> demoLogin() {
        if (!demoAdminEnabled) {
            throw new ApiRequestException(HttpStatus.FORBIDDEN, "Demo admin login is disabled");
        }
        Admin admin = adminRepository.findByEmailIgnoreCase(DEMO_EMAIL).orElse(null);
        if (admin == null) {
            admin = insertAdmin(DEMO_EMAIL, "admin", adminDefaultPassword, "Demo Admin", "super_admin");
        }
        admin.setLastLogin(Instant.now());
        adminRepository.save(admin);
        return ResponseEntity.ok(tokenResponse(admin));
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private Admin insertAdmin(String email, String username, String password, String fullName, String role) {
        Admin admin = new Admin();
        admin.setEmail(email.trim().toLowerCase());
        admin.setUsername(username == null ? "admin" : username.trim());
        admin.setPasswordHash(AdminAuthSupport.hashPassword(password));
        admin.setFullName(fullName == null || fullName.isBlank() ? "Admin" : fullName.trim());
        admin.setRole(role);
        admin.setIsActive(true);
        return adminRepository.save(admin);
    }

    private Map<String, Object> tokenResponse(Admin admin) {
        LinkedHashMap<String, Object> body = new LinkedHashMap<>();
        body.put("access_token", auth.createToken(admin));
        body.put("token_type", "bearer");
        body.put("admin", AdminAuthSupport.toResponse(admin));
        return body;
    }

    private void logActivity(java.util.UUID adminId, String action, String entityType,
                             java.util.UUID entityId, String ip) {
        try {
            ActivityLog entry = new ActivityLog();
            entry.setAdminId(adminId);
            entry.setAction(action);
            entry.setEntityType(entityType);
            entry.setEntityId(entityId);
            entry.setIpAddress(ip);
            activityLogRepository.save(entry);
        } catch (Exception ignored) {
            // audit trail must never break the auth flow
        }
    }

    // ── DTOs (schemas/admin.py: AdminLogin, AdminCreate) ─────────────────

    public static class LoginRequest {
        @NotBlank
        private String email;
        @NotBlank
        @Size(min = 6)
        private String password;

        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }
        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }
    }

    public static class CreateAdminRequest {
        @NotBlank
        @JsonAlias({"email"})
        private String email;
        @NotBlank
        @Size(min = 3, max = 50)
        private String username;
        @NotBlank
        @Size(min = 8)
        private String password;
        @NotBlank
        @Size(min = 2, max = 100)
        @com.fasterxml.jackson.annotation.JsonAlias({"full_name"})
        private String fullName;

        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }
        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }
        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }
        public String getFullName() { return fullName; }
        public void setFullName(String fullName) { this.fullName = fullName; }
    }
}
