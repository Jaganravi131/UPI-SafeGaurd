package com.upisafeguard.core.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
import com.upisafeguard.core.persistence.Admin;
import com.upisafeguard.core.persistence.AdminRepository;
import com.upisafeguard.core.persistence.FraudReportRepository;
import com.upisafeguard.core.persistence.PaymentTransactionRepository;
import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.UserRepository;
import com.upisafeguard.core.persistence.WalletRepository;

/**
 * RBAC contract tests on /api/v1/admin/* — mirrors the dependency wiring in
 * backend/app/api/routes/admin.py (read = any admin; user mutations =
 * super_admin/admin; wallet-admin listings = any admin).
 */
class AdminControllerRbacTest {

    private static final UUID ANALYST_ID = UUID.fromString("8f1a2b3c-1111-4222-8333-444455556666");
    private static final UUID MANAGER_ID = UUID.fromString("8f1a2b3c-9999-4222-8333-444455556666");
    private static final UUID USER_ID = UUID.fromString("12345678-1234-1234-1234-123456789abc");
    private static final String SECRET = "test-secret-value-for-admin-suite";

    private AdminRepository adminRepository;
    private Admin adminAnalyst;
    private Admin adminManager;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        UserRepository users = Mockito.mock(UserRepository.class);
        WalletRepository wallets = Mockito.mock(WalletRepository.class);
        FraudReportRepository fraudReports = Mockito.mock(FraudReportRepository.class);
        PaymentTransactionRepository txns = Mockito.mock(PaymentTransactionRepository.class);
        adminRepository = Mockito.mock(AdminRepository.class);

        JwtConfig jwtConfig = new JwtConfig();
        ReflectionTestUtils.setField(jwtConfig, "secret", SECRET);
        AdminAuthSupport auth = new AdminAuthSupport(jwtConfig, adminRepository);

        adminAnalyst = new Admin();
        adminAnalyst.setId(ANALYST_ID);
        adminAnalyst.setEmail("analyst@upisafeguard.com");
        adminAnalyst.setUsername("analyst");
        adminAnalyst.setPasswordHash("bcrypt");
        adminAnalyst.setFullName("Analyst");
        adminAnalyst.setRole("analyst");
        adminAnalyst.setIsActive(true);

        adminManager = new Admin();
        adminManager.setId(MANAGER_ID);
        adminManager.setEmail("manager@upisafeguard.com");
        adminManager.setUsername("manager");
        adminManager.setPasswordHash("bcrypt");
        adminManager.setFullName("Manager");
        adminManager.setRole("admin");
        adminManager.setIsActive(true);
        Mockito.when(adminRepository.findById(ANALYST_ID)).thenReturn(Optional.of(adminAnalyst));
        Mockito.when(adminRepository.findById(MANAGER_ID)).thenReturn(Optional.of(adminManager));

        User user = new User();
        user.setId(USER_ID);
        Mockito.when(users.findById(USER_ID)).thenReturn(Optional.of(user));
        Mockito.when(users.count()).thenReturn(1L);
        Mockito.when(wallets.count()).thenReturn(1L);
        Mockito.when(txns.count()).thenReturn(0L);
        Mockito.when(fraudReports.count()).thenReturn(0L);
        Mockito.when(users.save(anyUser())).thenAnswer(inv -> inv.getArgument(0));

        mockMvc = MockMvcBuilders.standaloneSetup(
                        new AdminController(users, wallets, fraudReports, txns, auth),
                        new WalletController(
                                Mockito.mock(com.upisafeguard.core.wallet.WalletMoneyService.class),
                                txns, users, wallets,
                                Mockito.mock(AuthSupport.class), auth,
                                Mockito.mock(com.upisafeguard.core.events.DomainEventPublisher.class),
                                Mockito.mock(com.upisafeguard.core.services.RateLimitService.class)))
                .setControllerAdvice(new ApiExceptionHandler())
                .build();
    }

    private static User anyUser() {
        return org.mockito.ArgumentMatchers.any(User.class);
    }

    private String tokenFor(String role) {
        Admin record = "analyst".equals(role) ? adminAnalyst : adminManager;
        return "Bearer " + new AdminAuthSupport(jwt(), adminRepository).createToken(record);
    }

    private JwtConfig jwt() {
        JwtConfig jwtConfig = new JwtConfig();
        ReflectionTestUtils.setField(jwtConfig, "secret", SECRET);
        return jwtConfig;
    }

    @Test
    void unauthenticatedRequestsGet401NotAuthenticated() throws Exception {
        mockMvc.perform(get("/api/v1/admin/dashboard/overview"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Not authenticated"));
    }

    @Test
    void regularUserTokensCannotAccessAdminEndpoints() throws Exception {
        // signed by the same key but without the type=admin claim → invalid admin token
        JwtConfig jwtConfig = jwt();
        String userToken = jwtConfig.generateToken("u-1", "user@x.com");
        mockMvc.perform(get("/api/v1/admin/dashboard/overview")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + userToken))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Invalid or expired token"));
    }

    @Test
    void readEndpointsAcceptAnyAdminRole() throws Exception {
        String analyst = tokenFor("analyst");
        mockMvc.perform(get("/api/v1/admin/dashboard/overview").header(HttpHeaders.AUTHORIZATION, analyst))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/admin/users").header(HttpHeaders.AUTHORIZATION, analyst))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/admin/fraud-reports").header(HttpHeaders.AUTHORIZATION, analyst))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/admin/transactions/flagged").header(HttpHeaders.AUTHORIZATION, analyst))
                .andExpect(status().isOk());
    }

    @Test
    void userMutationsRequireSuperAdminOrAdmin() throws Exception {
        String analyst = tokenFor("analyst");
        String manager = tokenFor("admin");

        // analyst denied with the FastAPI detail
        mockMvc.perform(put("/api/v1/admin/users/" + USER_ID + "/security-score")
                        .header(HttpHeaders.AUTHORIZATION, analyst)
                        .param("security_score", "92"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("Insufficient permissions"));

        // admin role allowed
        mockMvc.perform(put("/api/v1/admin/users/" + USER_ID + "/security-score")
                        .header(HttpHeaders.AUTHORIZATION, manager)
                        .param("security_score", "92"))
                .andExpect(status().isOk());

        mockMvc.perform(put("/api/v1/admin/users/" + USER_ID + "/status")
                        .header(HttpHeaders.AUTHORIZATION, manager)
                        .param("is_active", "false"))
                .andExpect(status().isOk());
    }

    @Test
    void walletAdminListingsRequireAnAdminToken() throws Exception {
        mockMvc.perform(get("/api/v1/wallet/admin/search").param("q", "jagan"))
                .andExpect(status().isUnauthorized());

        JwtConfig jwtConfig = jwt();
        String userToken = jwtConfig.generateToken("u-1", "user@x.com");
        mockMvc.perform(get("/api/v1/wallet/admin/search").param("q", "jagan")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + userToken))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Invalid or expired token"));
    }
}
