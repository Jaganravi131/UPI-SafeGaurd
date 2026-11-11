package com.upisafeguard.core.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.HttpHeaders;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.upisafeguard.core.config.JwtConfig;
import com.upisafeguard.core.persistence.AssessmentTokenRepository;
import com.upisafeguard.core.persistence.FraudReportRepository;
import com.upisafeguard.core.persistence.PaymentTransactionRepository;
import com.upisafeguard.core.persistence.UpiProfileRepository;
import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.UserRepository;
import com.upisafeguard.core.persistence.WalletRepository;
import com.upisafeguard.core.risk.AssessmentTokenService;
import com.upisafeguard.core.risk.RiskServiceClient;
import com.upisafeguard.core.risk.RiskServiceUnavailableException;

/**
 * Contract tests for the flat /transactions/assess-risk port (Python
 * transaction.py): snake_case binding, server-side profiles, heuristic
 * fallback when the ai-service is down, and single-use risk token issuance.
 */
class TransactionAssessRiskControllerTest {

    private static final String SECRET = "test-secret-value-for-admin-suite";
    private static final String USER_ID = "550e8400-e29b-41d4-a716-446655440000";

    private UserRepository users;
    private RiskServiceClient riskClient;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        users = Mockito.mock(UserRepository.class);
        WalletRepository wallets = Mockito.mock(WalletRepository.class);
        PaymentTransactionRepository txns = Mockito.mock(PaymentTransactionRepository.class);
        FraudReportRepository fraudReports = Mockito.mock(FraudReportRepository.class);
        UpiProfileRepository upiProfiles = Mockito.mock(UpiProfileRepository.class);
        riskClient = Mockito.mock(RiskServiceClient.class);
        AssessmentTokenRepository tokenRepo = Mockito.mock(AssessmentTokenRepository.class);

        User user = new User();
        user.setId(UUID.fromString(USER_ID));
        user.setPhoneNumber("+919999000111");
        user.setFullName("Smoke Test");
        user.setEmail("smoke@test.com");
        user.setSecurityScore(BigDecimal.valueOf(50.0));
        Mockito.when(users.findById(UUID.fromString(USER_ID))).thenReturn(Optional.of(user));

        JwtConfig jwtConfig = new JwtConfig();
        ReflectionTestUtils.setField(jwtConfig, "secret", SECRET);
        ReflectionTestUtils.setField(jwtConfig, "expiryHours", 24);
        AuthSupport authSupport = new AuthSupport(jwtConfig);
        String token = jwtConfig.generateToken(USER_ID, "smoke@test.com");

        mockMvc = MockMvcBuilders.standaloneSetup(new TransactionController(
                        Mockito.mock(com.upisafeguard.core.payment.PaymentCommandService.class),
                        new AssessmentTokenService(tokenRepo),
                        riskClient,
                        txns, wallets, users, fraudReports, upiProfiles,
                        authSupport))
                .setControllerAdvice(new ApiExceptionHandler())
                .build();
    }

    @Test
    void assessRiskFallsBackToHeuristicWhenAiServiceDown() throws Exception {
        Mockito.when(riskClient.assess(Mockito.any())).thenThrow(
                new RiskServiceUnavailableException("AI risk service is unavailable"));

        mockMvc.perform(post("/api/v1/transactions/assess-risk")
                        .header(HttpHeaders.AUTHORIZATION, bearer())
                        .contentType("application/json")
                        .content("{\"recipient_upi\":\"stranger@upi\",\"amount\":15000,\"call_active\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.risk_level").isNotEmpty())
                .andExpect(jsonPath("$.ensemble_score").isNumber())
                .andExpect(jsonPath("$.recommended_action").isNotEmpty())
                .andExpect(jsonPath("$.risk_factors").isNotEmpty())
                .andExpect(jsonPath("$.risk_token").isNotEmpty())
                .andExpect(jsonPath("$.risk_token_expires_at").isNotEmpty())
                .andExpect(jsonPath("$.transaction_id").isNotEmpty())
                .andExpect(jsonPath("$.is_new_recipient").value(true));
    }

    @Test
    void assessRiskReturnsMlShapeWhenAiServiceUp() throws Exception {
        Mockito.when(riskClient.assess(Mockito.any())).thenReturn(new com.upisafeguard.core.risk.RiskAssessmentResponse(
                "1.0", "1.0", "tx-1", "high", 0.8, "review", true,
                java.util.List.of("Large amount"), 0.9, 0.8,
                java.util.List.of(), java.util.Map.of("xgb", "v1"), java.util.Map.of(), null, null));

        mockMvc.perform(post("/api/v1/transactions/assess-risk")
                        .header(HttpHeaders.AUTHORIZATION, bearer())
                        .contentType("application/json")
                        .content("{\"recipient_upi\":\"merchant@upi\",\"amount\":2000}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.risk_level").value("high"))
                .andExpect(jsonPath("$.ensemble_score").value(0.8))
                .andExpect(jsonPath("$.recommended_action").value("review"))
                .andExpect(jsonPath("$.risk_token").isNotEmpty());
    }

    @Test
    void assessRiskRequiresAuth() throws Exception {
        mockMvc.perform(post("/api/v1/transactions/assess-risk")
                        .contentType("application/json")
                        .content("{\"recipient_upi\":\"a@upi\",\"amount\":100}"))
                .andExpect(status().isUnauthorized());
    }

    private String bearer() {
        JwtConfig jwtConfig = new JwtConfig();
        ReflectionTestUtils.setField(jwtConfig, "secret", SECRET);
        ReflectionTestUtils.setField(jwtConfig, "expiryHours", 24);
        return "Bearer " + jwtConfig.generateToken(USER_ID, "smoke@test.com");
    }
}
