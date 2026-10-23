package com.upisafeguard.core.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.upisafeguard.core.admin.AdminAuthSupport;
import com.upisafeguard.core.config.JwtConfig;
import com.upisafeguard.core.persistence.ActivityLogRepository;
import com.upisafeguard.core.persistence.Admin;
import com.upisafeguard.core.persistence.AdminRepository;

/**
 * HTTP contract tests for /api/v1/admin/auth/* â€” mirror
 * backend/app/api/routes/admin_auth.py (incl. exact {detail} bodies).
 */
class AdminAuthControllerTest {

    private static final UUID ADMIN_ID = UUID.fromString("8f1a2b3c-1111-4222-8333-444455556666");

    private AdminRepository adminRepository;
    private ActivityLogRepository activityLogRepository;
    private Admin admin;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        adminRepository = Mockito.mock(AdminRepository.class);
        activityLogRepository = Mockito.mock(ActivityLogRepository.class);

        JwtConfig jwtConfig = new JwtConfig();
        ReflectionTestUtils.setField(jwtConfig, "secret", "test-secret-value-for-admin-suite");
        AdminAuthSupport support = new AdminAuthSupport(jwtConfig, adminRepository);

        admin = new Admin();
        admin.setId(ADMIN_ID);
        admin.setEmail("admin@upisafeguard.com");
        admin.setUsername("admin");
        admin.setPasswordHash(AdminAuthSupport.hashPassword("admin_secret_pass"));
        admin.setFullName("Demo Admin");
        admin.setRole("super_admin");
        admin.setIsActive(true);

        when(adminRepository.findById(ADMIN_ID)).thenReturn(Optional.of(admin));
        Mockito.when(adminRepository.findByEmailIgnoreCase(Mockito.anyString()))
                .thenAnswer(inv -> "admin@upisafeguard.com".equals(((String) inv.getArgument(0)).toLowerCase())
                        ? Optional.of(admin) : Optional.empty());

        mockMvc = MockMvcBuilders.standaloneSetup(new AdminAuthController(
                        adminRepository, activityLogRepository, support, /* demoAdminEnabled */ true,
                        /* adminDefaultPassword */ "admin_secret_pass"))
                .setControllerAdvice(new ApiExceptionHandler())
                .build();
    }

    @Test
    void loginIssuesBearerTokenWithAdminShape() throws Exception {
        mockMvc.perform(post("/api/v1/admin/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"admin@upisafeguard.com\",\"password\":\"admin_secret_pass\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token_type").value("bearer"))
                .andExpect(jsonPath("$.access_token").isNotEmpty())
                .andExpect(jsonPath("$.admin.id").value(ADMIN_ID.toString()))
                .andExpect(jsonPath("$.admin.role").value("super_admin"))
                .andExpect(jsonPath("$.admin.full_name").value("Demo Admin"))
                .andExpect(jsonPath("$.admin.is_active").value(true));

        // activity log + last-login persistence happened
        verify(adminRepository).save(any(Admin.class));
        verify(activityLogRepository).save(any(com.upisafeguard.core.persistence.ActivityLog.class));
    }

    @Test
    void loginRejectsWrongPasswordWithEmailParity() throws Exception {
        mockMvc.perform(post("/api/v1/admin/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"admin@upisafeguard.com\",\"password\":\"wrong-password\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Invalid email or password"));

        mockMvc.perform(post("/api/v1/admin/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nobody@upisafeguard.com\",\"password\":\"whatever\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Invalid email or password"));
    }

    @Test
    void deactivatedAdminsAreForbidden() throws Exception {
        admin.setIsActive(false);
        mockMvc.perform(post("/api/v1/admin/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"admin@upisafeguard.com\",\"password\":\"admin_secret_pass\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("Admin account is deactivated"));
    }

    @Test
    void meRequiresAdminTokenAndEchoesIdentity() throws Exception {
        Mockito.when(adminRepository.findById(ADMIN_ID)).thenReturn(Optional.of(admin));
        String token = new AdminAuthSupport(jwt(), adminRepository).createToken(admin);

        mockMvc.perform(get("/api/v1/admin/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("admin@upisafeguard.com"));

        mockMvc.perform(get("/api/v1/admin/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Not authenticated"));
    }

    @Test
    void logoutRequiresAdminAndReturnsMessage() throws Exception {
        String token = new AdminAuthSupport(jwt(), adminRepository).createToken(admin);
        mockMvc.perform(post("/api/v1/admin/auth/logout").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Logged out successfully"));
        verify(activityLogRepository).save(any(com.upisafeguard.core.persistence.ActivityLog.class));
    }

    @Test
    void createFirstAdminOnlyWhenEmpty() throws Exception {
        Mockito.when(adminRepository.count()).thenReturn(0L);
        Mockito.when(adminRepository.save(any(Admin.class))).thenAnswer(inv -> {
            Admin saved = inv.getArgument(0);
            saved.setId(ADMIN_ID);
            return saved;
        });

        mockMvc.perform(post("/api/v1/admin/auth/create-first-admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"owner@upisafeguard.com","username":"owner",
                                 "password":"owner-secret-1","full_name":"Owner"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("super_admin"))
                .andExpect(jsonPath("$.email").value("owner@upisafeguard.com"));

        // second creation attempt â†’ 400 with the FastAPI detail
        Mockito.when(adminRepository.count()).thenReturn(1L);
        mockMvc.perform(post("/api/v1/admin/auth/create-first-admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"second@upisafeguard.com","username":"two",
                                 "password":"owner-secret-1","full_name":"Second"}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail")
                        .value("Admin already exists. Use admin panel to create more admins."));
    }

    @Test
    void demoLoginCreatesDemoSuperAdminOnDemand() throws Exception {
        Mockito.when(adminRepository.count()).thenReturn(0L);
        Mockito.when(adminRepository.save(any(Admin.class))).thenAnswer(inv -> inv.getArgument(0));

        mockMvc.perform(post("/api/v1/admin/auth/demo-login"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token_type").value("bearer"))
                .andExpect(jsonPath("$.admin.email").value("admin@upisafeguard.com"))
                .andExpect(jsonPath("$.admin.role").value("super_admin"));
    }

    private JwtConfig jwt() {
        JwtConfig jwtConfig = new JwtConfig();
        ReflectionTestUtils.setField(jwtConfig, "secret", "test-secret-value-for-admin-suite");
        return jwtConfig;
    }
}
