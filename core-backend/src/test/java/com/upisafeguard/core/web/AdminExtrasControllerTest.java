package com.upisafeguard.core.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.upisafeguard.core.admin.AdminAuthSupport;
import com.upisafeguard.core.config.JwtConfig;
import com.upisafeguard.core.persistence.ActivityLog;
import com.upisafeguard.core.persistence.ActivityLogRepository;
import com.upisafeguard.core.persistence.Admin;
import com.upisafeguard.core.persistence.AdminRepository;
import com.upisafeguard.core.persistence.FraudReport;
import com.upisafeguard.core.persistence.FraudReportRepository;
import com.upisafeguard.core.persistence.PaymentTransactionRepository;
import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.UserRepository;
import com.upisafeguard.core.persistence.WalletRepository;

/**
 * Contract tests for the admin-extras wave: analytics, ML admin, activity logs,
 * admins listing, exports, and system management (port of admin.py lines 127-1388).
 */
class AdminExtrasControllerTest {

    private static final UUID ANALYST_ID = UUID.fromString("7f1a2b3c-9999-4222-8333-444455556666");
    private static final UUID MANAGER_ID = UUID.fromString("8f1a2b3c-9999-4222-8333-444455556666");
    private static final UUID SUPER_ID = UUID.fromString("9f1a2b3c-9999-4222-8333-444455556666");
    private static final String SECRET = "test-secret-value-for-admin-suite";

    private AdminRepository adminRepository;
    private ActivityLogRepository activityLogs;
    private UserRepository users;
    private FraudReportRepository fraudReports;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        users = Mockito.mock(UserRepository.class);
        WalletRepository wallets = Mockito.mock(WalletRepository.class);
        fraudReports = Mockito.mock(FraudReportRepository.class);
        PaymentTransactionRepository txns = Mockito.mock(PaymentTransactionRepository.class);
        activityLogs = Mockito.mock(ActivityLogRepository.class);
        adminRepository = Mockito.mock(AdminRepository.class);

        Admin analyst = admin(ANALYST_ID, "analyst@upisafeguard.com", "analyst");
        Admin manager = admin(MANAGER_ID, "manager@upisafeguard.com", "admin");
        Admin superAdmin = admin(SUPER_ID, "admin@upisafeguard.com", "super_admin");
        Mockito.when(adminRepository.findById(ANALYST_ID)).thenReturn(Optional.of(analyst));
        Mockito.when(adminRepository.findById(MANAGER_ID)).thenReturn(Optional.of(manager));
        Mockito.when(adminRepository.findById(SUPER_ID)).thenReturn(Optional.of(superAdmin));
        Mockito.when(adminRepository.findAllByOrderByCreatedAtDesc()).thenReturn(List.of(superAdmin, manager, analyst));
        Mockito.when(adminRepository.findAllById(Mockito.any())).thenReturn(List.of(manager, analyst, superAdmin));

        Mockito.when(users.count()).thenReturn(1L);
        Mockito.when(wallets.count()).thenReturn(1L);
        Mockito.when(txns.count()).thenReturn(0L);
        Mockito.when(fraudReports.count()).thenReturn(0L);
        Mockito.when(txns.countByRiskLevelAndCreatedAtGreaterThanEqual(Mockito.anyString(), Mockito.any()))
                .thenReturn(3L);
        Mockito.when(activityLogs.findAllByOrderByCreatedAtDesc(Mockito.any(Pageable.class))).thenReturn(
                new PageImpl<>(List.of(logEntry(MANAGER_ID)), PageRequest.of(0, 50), 1));

        mockMvc = MockMvcBuilders.standaloneSetup(
                        new AdminController(users, wallets, fraudReports, txns, activityLogs, adminRepository, auth()))
                .setControllerAdvice(new ApiExceptionHandler())
                .build();
    }

    private static Admin admin(UUID id, String email, String role) {
        Admin record = new Admin();
        record.setId(id);
        record.setEmail(email);
        record.setUsername(email.split("@")[0]);
        record.setPasswordHash("bcrypt");
        record.setFullName("Name");
        record.setRole(role);
        record.setIsActive(true);
        return record;
    }

    private static ActivityLog logEntry(UUID adminId) {
        ActivityLog entry = new ActivityLog();
        entry.setId(UUID.fromString("aa1a2b3c-9999-4222-8333-444455556666"));
        entry.setAdminId(adminId);
        entry.setAction("restart_service");
        entry.setEntityType("service");
        entry.setDetails("{}");
        entry.setCreatedAt(Instant.parse("2026-11-10T10:00:00Z"));
        return entry;
    }

    private String tokenFor(String role) {
        Admin record = switch (role) {
            case "analyst" -> admin(ANALYST_ID, "analyst@upisafeguard.com", role);
            case "admin" -> admin(MANAGER_ID, "manager@upisafeguard.com", role);
            default -> admin(SUPER_ID, "admin@upisafeguard.com", role);
        };
        return "Bearer " + auth().createToken(record);
    }

    private AdminAuthSupport auth() {
        JwtConfig jwtConfig = new JwtConfig();
        ReflectionTestUtils.setField(jwtConfig, "secret", SECRET);
        return new AdminAuthSupport(jwtConfig, adminRepository);
    }

    // ============ Analytics ============

    @Test
    void riskDistributionMatchesPythonContract() throws Exception {
        mockMvc.perform(get("/api/v1/admin/analytics/risk-distribution")
                        .header(HttpHeaders.AUTHORIZATION, tokenFor("analyst")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.period_days").value(7))
                .andExpect(jsonPath("$.distribution.low").value(3))
                .andExpect(jsonPath("$.distribution.medium").value(3))
                .andExpect(jsonPath("$.distribution.high").value(3))
                .andExpect(jsonPath("$.distribution.critical").value(3))
                .andExpect(jsonPath("$.trend.length()").value(7))
                .andExpect(jsonPath("$.trend[0].date").isNotEmpty())
                .andExpect(jsonPath("$.trend[0].low").value(100))
                .andExpect(jsonPath("$.trend[6].critical").value(1));
    }

    @Test
    void fraudTypesMatchesPythonContract() throws Exception {
        Mockito.when(fraudReports.aggregateByScamType()).thenReturn(List.of(new FraudReportRepository.FraudTypeCount() {
            @Override public String getScamType() { return "phishing"; }
            @Override public long getReportCount() { return 4; }
            @Override public BigDecimal getTotalAmount() { return BigDecimal.valueOf(12500); }
        }));

        mockMvc.perform(get("/api/v1/admin/analytics/fraud-types")
                        .header(HttpHeaders.AUTHORIZATION, tokenFor("analyst")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fraud_types[0].type").value("phishing"))
                .andExpect(jsonPath("$.fraud_types[0].count").value(4))
                .andExpect(jsonPath("$.fraud_types[0].total_amount").value(12500.0))
                .andExpect(jsonPath("$.total_reports").value(4))
                .andExpect(jsonPath("$.total_amount_lost").value(12500.0));
    }

    // ============ ML admin ============

    @Test
    void mlPerformanceUsesArtifactLessFallback() throws Exception {
        mockMvc.perform(get("/api/v1/admin/ml/performance")
                        .header(HttpHeaders.AUTHORIZATION, tokenFor("analyst")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.models.xgboost.version").value("1.0-heuristic"))
                .andExpect(jsonPath("$.models.xgboost.accuracy").value(94.2))
                .andExpect(jsonPath("$.models.xgboost.roc_auc").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.models.lstm.accuracy").value(89.5))
                .andExpect(jsonPath("$.models.isolation_forest.is_fitted").value(false))
                .andExpect(jsonPath("$.models.gnn.has_graph").value(false))
                .andExpect(jsonPath("$.models.sensor.version").value("1.0-rule-based"))
                .andExpect(jsonPath("$.ensemble.total_latency_ms").value(195))
                .andExpect(jsonPath("$.ensemble.models_trained").value(0))
                .andExpect(jsonPath("$.ensemble.models_total").value(5));
    }

    @Test
    void mlModelsListsFiveCatalogueEntries() throws Exception {
        mockMvc.perform(get("/api/v1/admin/ml/models")
                        .header(HttpHeaders.AUTHORIZATION, tokenFor("analyst")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.models.length()").value(5))
                .andExpect(jsonPath("$.models[0].id").value("xgb"))
                .andExpect(jsonPath("$.models[0].status").value("active"))
                .andExpect(jsonPath("$.models[0].accuracy").value(94.2))
                .andExpect(jsonPath("$.models[4].id").value("sensor"))
                .andExpect(jsonPath("$.models[4].latency_ms").value(22))
                .andExpect(jsonPath("$.models[4].version").value("1.0-heuristic"));
    }

    @Test
    void retrainFollowsPythonBranches() throws Exception {
        String manager = tokenFor("admin");
        mockMvc.perform(post("/api/v1/admin/ml/models/sensor/retrain")
                        .header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("skipped"))
                .andExpect(jsonPath("$.message").value("Sensor model is rule-based and does not require retraining"));
        mockMvc.perform(post("/api/v1/admin/ml/models/xgb/retrain")
                        .header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("queued"))
                .andExpect(jsonPath("$.message").value("Retraining started for model 'xgb'"))
                .andExpect(jsonPath("$.estimated_time_minutes").value(15));
        mockMvc.perform(post("/api/v1/admin/ml/models/nope/retrain")
                        .header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Model 'nope' not found"));
    }

    @Test
    void modelStatusValidatesPatternAndId() throws Exception {
        String manager = tokenFor("admin");
        mockMvc.perform(put("/api/v1/admin/ml/models/xgb/status?status=active")
                        .header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Model 'xgb' set to active"))
                .andExpect(jsonPath("$.status").value("active"));
        mockMvc.perform(put("/api/v1/admin/ml/models/xgb/status?status=bogus")
                        .header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.detail").value("Input should be 'active' or 'inactive'"));
        mockMvc.perform(put("/api/v1/admin/ml/models/ghost/status?status=active")
                        .header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Model 'ghost' not found"));
    }

    @Test
    void modelConfigWeightsRoundTrip() throws Exception {
        String manager = tokenFor("admin");
        mockMvc.perform(get("/api/v1/admin/ml/models/config")
                        .header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.weights.xgb").value(0.3))
                .andExpect(jsonPath("$.weights.sensor").value(0.1));
        mockMvc.perform(put("/api/v1/admin/ml/models/xgb/config?weight=0.5")
                        .header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.old_weight").value(0.3))
                .andExpect(jsonPath("$.new_weight").value(0.5))
                .andExpect(jsonPath("$.all_weights.xgb").value(0.5))
                .andExpect(jsonPath("$.message").value("Model 'xgb' weight updated from 0.3 to 0.5"));
        mockMvc.perform(put("/api/v1/admin/ml/models/xgb/config?weight=1.5")
                        .header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.detail").value("Input should be less than or equal to 1"));
        mockMvc.perform(put("/api/v1/admin/ml/models/ghost/config?weight=0.5")
                        .header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Model 'ghost' not found"));
    }

    // ============ Activity logs / admins ============

    @Test
    void activityLogsResolveAdminEmails() throws Exception {
        mockMvc.perform(get("/api/v1/admin/activity-logs")
                        .header(HttpHeaders.AUTHORIZATION, tokenFor("admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.logs[0].id").value("aa1a2b3c-9999-4222-8333-444455556666"))
                .andExpect(jsonPath("$.logs[0].admin_email").value("manager@upisafeguard.com"))
                .andExpect(jsonPath("$.logs[0].admin_id").value(MANAGER_ID.toString()))
                .andExpect(jsonPath("$.logs[0].action").value("restart_service"))
                .andExpect(jsonPath("$.logs[0].details").value("{}"))
                .andExpect(jsonPath("$.logs[0].timestamp").value("2026-11-10T10:00:00Z"))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.page_size").value(50));
        mockMvc.perform(get("/api/v1/admin/activity-logs")
                        .header(HttpHeaders.AUTHORIZATION, tokenFor("analyst")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("Insufficient permissions"));
    }

    @Test
    void adminsListingIsSuperAdminOnly() throws Exception {
        mockMvc.perform(get("/api/v1/admin/admins")
                        .header(HttpHeaders.AUTHORIZATION, tokenFor("super_admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.admins.length()").value(3))
                .andExpect(jsonPath("$.admins[0].email").value("admin@upisafeguard.com"))
                .andExpect(jsonPath("$.admins[0].role").value("super_admin"))
                .andExpect(jsonPath("$.admins[0].is_active").value(true))
                .andExpect(jsonPath("$.admins[0].last_login").value(org.hamcrest.Matchers.nullValue()));
        mockMvc.perform(get("/api/v1/admin/admins")
                        .header(HttpHeaders.AUTHORIZATION, tokenFor("admin")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("Insufficient permissions"));
    }

    // ============ System ============

    @Test
    void systemHealthReturnsPythonShape() throws Exception {
        mockMvc.perform(get("/api/v1/admin/system/health")
                        .header(HttpHeaders.AUTHORIZATION, tokenFor("analyst")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("healthy"))
                .andExpect(jsonPath("$.metrics.length()").value(6))
                .andExpect(jsonPath("$.metrics[3].name").value("API Latency"))
                .andExpect(jsonPath("$.metrics[4].name").value("ML Models"))
                .andExpect(jsonPath("$.metrics[4].value").value(0))
                .andExpect(jsonPath("$.services.length()").value(3))
                .andExpect(jsonPath("$.services[2].status").value("stopped"))
                .andExpect(jsonPath("$.components.ml_models.status").value("degraded"))
                .andExpect(jsonPath("$.components.database.status").value("healthy"))
                .andExpect(jsonPath("$.last_check").isNotEmpty());
    }

    @Test
    void systemLogsMapActivityLevels() throws Exception {
        mockMvc.perform(get("/api/v1/admin/system/logs")
                        .header(HttpHeaders.AUTHORIZATION, tokenFor("analyst")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.logs[0].level").value("info"))
                .andExpect(jsonPath("$.logs[0].service").value("service"))
                .andExpect(jsonPath("$.logs[0].message").value("restart_service: {}"))
                .andExpect(jsonPath("$.total").value(1));
        mockMvc.perform(get("/api/v1/admin/system/logs?level=bogus")
                        .header(HttpHeaders.AUTHORIZATION, tokenFor("analyst")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.detail").value("Input should be 'info', 'warning' or 'error'"));
    }

    @Test
    void serviceRestartFollowsPythonBranches() throws Exception {
        String superAdmin = tokenFor("super_admin");
        mockMvc.perform(post("/api/v1/admin/system/services/ml_inference/restart")
                        .header(HttpHeaders.AUTHORIZATION, superAdmin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Service 'ml_inference' restarted successfully"))
                .andExpect(jsonPath("$.status").value("running"));
        Mockito.verify(activityLogs).save(Mockito.argThat(entry ->
                "restart_service".equals(entry.getAction()) && "service".equals(entry.getEntityType())));
        Mockito.verify(activityLogs).save(Mockito.argThat(entry ->
                entry.getDetails().contains("\"service\": \"ml_inference\"")));
        Mockito.clearInvocations(activityLogs);
        mockMvc.perform(post("/api/v1/admin/system/services/database/restart")
                        .header(HttpHeaders.AUTHORIZATION, superAdmin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Database connections refreshed"));
        mockMvc.perform(post("/api/v1/admin/system/services/fastapi_backend/restart")
                        .header(HttpHeaders.AUTHORIZATION, superAdmin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Service 'fastapi_backend' cannot be restarted via API"));
        mockMvc.perform(post("/api/v1/admin/system/services/hyperion/restart")
                        .header(HttpHeaders.AUTHORIZATION, superAdmin))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Service 'hyperion' not found"));
        mockMvc.perform(post("/api/v1/admin/system/services/ml_inference/restart")
                        .header(HttpHeaders.AUTHORIZATION, tokenFor("admin")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("Insufficient permissions"));
    }

    // ============ Exports ============

    @Test
    void usersExportCsvHasPythonColumnsAndHeaders() throws Exception {
        User user = new User();
        user.setId(UUID.fromString("12345678-1234-1234-1234-123456789abc"));
        user.setPhoneNumber("+919876543210");
        user.setFullName("JAGAN BABU");
        user.setEmail("jaganravi131@gmail.com");
        user.setUpiId("jagan@upi");
        user.setSecurityScore(BigDecimal.valueOf(50.0));
        user.setDigitalLiteracy(User.DigitalLiteracy.INTERMEDIATE);
        user.setGuardianEnabled(false);
        user.setIsActive(true);
        user.setCreatedAt(Instant.parse("2026-11-10T10:00:00Z"));
        Mockito.when(users.findAllByOrderByCreatedAtDesc()).thenReturn(List.of(user));

        mockMvc.perform(get("/api/v1/admin/users/export?format=csv")
                        .header(HttpHeaders.AUTHORIZATION, tokenFor("admin")))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("text/csv"))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=users_export.csv"))
                .andExpect(content().string(org.hamcrest.Matchers.containsString(
                        "id,phone_number,full_name,email,upi_id,security_score,digital_literacy,guardian_enabled,is_active,created_at")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("+919876543210")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("intermediate")));

        mockMvc.perform(get("/api/v1/admin/users/export?format=json")
                        .header(HttpHeaders.AUTHORIZATION, tokenFor("admin")))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=users_export.json"))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("\"digital_literacy\" : \"intermediate\"")));

        mockMvc.perform(get("/api/v1/admin/users/export?format=yaml")
                        .header(HttpHeaders.AUTHORIZATION, tokenFor("admin")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.detail").value("Input should be 'csv' or 'json'"));
        mockMvc.perform(get("/api/v1/admin/users/export?format=csv")
                        .header(HttpHeaders.AUTHORIZATION, tokenFor("analyst")))
                .andExpect(status().isForbidden());
    }

    @Test
    void fraudReportsExportSupportsStatusFilter() throws Exception {
        FraudReport report = new FraudReport();
        report.setId(UUID.fromString("bb1a2b3c-9999-4222-8333-444455556666"));
        report.setScammerUpi("scammer@upi");
        report.setScamType("phishing, fake KYC");
        report.setAmountLost(BigDecimal.valueOf(1500));
        report.setDescription("Fake KYC request");
        report.setStatus("pending");
        report.setVerificationScore(0.0);
        report.setCreatedAt(Instant.parse("2026-11-10T10:00:00Z"));
        Mockito.when(fraudReports.findAllByOrderByCreatedAtDesc()).thenReturn(List.of(report));

        mockMvc.perform(get("/api/v1/admin/fraud-reports/export?format=csv")
                        .header(HttpHeaders.AUTHORIZATION, tokenFor("admin")))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("text/csv"))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=fraud_reports_export.csv"))
                .andExpect(content().string(org.hamcrest.Matchers.containsString(
                        "id,scammer_upi,scam_type,amount_lost,description,status,verification_score,created_at")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString(
                        "\"phishing, fake KYC\"")));

        mockMvc.perform(get("/api/v1/admin/fraud-reports/export?format=csv&status=verified")
                        .header(HttpHeaders.AUTHORIZATION, tokenFor("admin")))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString(
                        "scammer@upi"))));

        mockMvc.perform(get("/api/v1/admin/fraud-reports/export?format=json")
                        .header(HttpHeaders.AUTHORIZATION, tokenFor("admin")))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=fraud_reports_export.json"))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("\"verification_score\" : 0.0")));
    }
}
