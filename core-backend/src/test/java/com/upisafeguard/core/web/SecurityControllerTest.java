package com.upisafeguard.core.web;

import static org.mockito.ArgumentMatchers.any;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.upisafeguard.core.payment.PaymentStatus;
import com.upisafeguard.core.persistence.FraudReportRepository;
import com.upisafeguard.core.persistence.PaymentTransaction;
import com.upisafeguard.core.persistence.PaymentTransactionRepository;
import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.UserRepository;
import com.upisafeguard.core.risk.RiskAssessmentResponse;
import com.upisafeguard.core.risk.RiskServiceClient;
import com.upisafeguard.core.security.SecurityShield;

/** HTTP contract tests for /api/v1/security/* — bars against routes/security.py. */
class SecurityControllerTest {

    private static final UUID USER_ID = UUID.fromString("12345678-1234-1234-1234-123456789abc");
    private static final String USER_ID_STR = USER_ID.toString();

    private RiskServiceClient riskServiceClient;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        riskServiceClient = Mockito.mock(RiskServiceClient.class);
        Mockito.when(riskServiceClient.assess(any())).thenReturn(new RiskAssessmentResponseFixture().get(0.05));

        UserRepository users = Mockito.mock(UserRepository.class);
        PaymentTransactionRepository transactions = Mockito.mock(PaymentTransactionRepository.class);
        FraudReportRepository fraudReports = Mockito.mock(FraudReportRepository.class);
        Mockito.when(fraudReports.countByScammerUpiEqualsIgnoreCase(any(String.class))).thenReturn(0L);
        Mockito.when(fraudReports.findTop3ByScammerUpiEqualsIgnoreCaseOrderByCreatedAtDesc(any(String.class)))
                .thenReturn(List.of());

        User user = new User();
        user.setId(USER_ID);
        user.setEmail("jaganravi131@gmail.com");
        user.setFullName("JAGAN BABU");
        user.setSecurityScore(BigDecimal.valueOf(85));
        user.setCreatedAt(Instant.now().minusSeconds(180L * 24 * 3600));
        Mockito.when(users.findById(USER_ID)).thenReturn(Optional.of(user));

        PaymentTransaction completed = new PaymentTransaction(
                USER_ID, "merchant@upi", BigDecimal.valueOf(2000), "key-1",
                PaymentStatus.COMPLETED, "ok", List.of(), List.of());
        Mockito.when(transactions.findByUserIdAndStatus(USER_ID_STR, "COMPLETED"))
                .thenReturn(List.of(completed));

        SecurityShield shield = new SecurityShield(riskServiceClient, fraudReports);
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new SecurityController(shield, users, transactions))
                .setControllerAdvice(new ApiExceptionHandler())
                .build();
    }

    /** Helper so each test with an overridden risk score gets a fresh record. */
    private static final class RiskAssessmentResponseFixture {
        RiskAssessmentResponse get(double score) {
            return new RiskAssessmentResponse(
                    "risk-service-v1", "engine-v1", "tx-1", "low", score, "proceed", false,
                    List.of("Recipient limited history", "Amount within daily limit"), 0.9, score,
                    List.of(), Map.of("primary_model", "xgboost-paysim-v1"),
                    Map.of("transaction", Map.of("amount", score)), null, null);
        }
    }

    @Test
    void analyzeCleanTransactionReturnsFullFastAPIShape() throws Exception {
        mockMvc.perform(post("/api/v1/security/analyze")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"upi_id\":\"jaganravi131@ybl\",\"amount\":500}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.transaction_id").isNotEmpty())
                .andExpect(jsonPath("$.timestamp").isNotEmpty())
                .andExpect(jsonPath("$.risk_level").value("safe"))
                .andExpect(jsonPath("$.risk_level_label").value("Safe to Pay"))
                .andExpect(jsonPath("$.risk_color").value("green"))
                .andExpect(jsonPath("$.risk_icon").value("✓"))
                .andExpect(jsonPath("$.is_blocked").value(false))
                .andExpect(jsonPath("$.can_proceed").value(true))
                .andExpect(jsonPath("$.layer_results").isArray())
                .andExpect(jsonPath("$.layer_results.length()").value(7))
                .andExpect(jsonPath("$.layer_results[0].layer_name").value("Environment Shield (Kill Switch)"))
                .andExpect(jsonPath("$.layer_summary").isArray())
                .andExpect(jsonPath("$.layer_summary.length()").value(7))
                .andExpect(jsonPath("$.layer_summary[0].name").value("Environment Shield"))
                .andExpect(jsonPath("$.layer_summary[0].status").value("safe"))
                .andExpect(jsonPath("$.layer_summary[0].icon").value("🛡️"))
                .andExpect(jsonPath("$.all_reasons").isArray())
                .andExpect(jsonPath("$.safety_tips.length()").value(2))
                .andExpect(jsonPath("$.scam_type_detected").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.scam_type_label").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.education_link").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void analyzeDetectsBlockedRecordingEnvironment() throws Exception {
        mockMvc.perform(post("/api/v1/security/analyze")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"upi_id\":\"friend@ybl\",\"amount\":500,"
                                + "\"environment\":{\"screen_recording\":true}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.risk_level").value("blocked"))
                .andExpect(jsonPath("$.risk_level_label").value("BLOCKED"))
                .andExpect(jsonPath("$.is_blocked").value(true))
                .andExpect(jsonPath("$.can_proceed").value(false))
                .andExpect(jsonPath("$.layer_summary[0].passed").value(false))
                .andExpect(jsonPath("$.all_reasons[0]")
                        .value("🚨 Screen recording detected - payments blocked for your safety"));
    }

    @Test
    void analyzeCarriesScamTypeDetailsForBlocklistedUpi() throws Exception {
        mockMvc.perform(post("/api/v1/security/analyze")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"upi_id\":\"lottery.winner@scam\",\"amount\":500}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.is_blocked").value(true))
                .andExpect(jsonPath("$.scam_type_detected").value("lottery"))
                .andExpect(jsonPath("$.scam_type_label").value("Lottery/Prize Scam"))
                .andExpect(jsonPath("$.education_link").value("/education/lottery-scam"))
                .andExpect(jsonPath("$.safety_tips[0]").value("💡 You can't win a lottery you never entered"));
    }

    @Test
    void analyzeBuildsUserProfileFromDatabaseWhenUserIdGiven() throws Exception {
        Mockito.when(riskServiceClient.assess(any())).thenReturn(new RiskAssessmentResponseFixture().get(0.15));

        mockMvc.perform(post("/api/v1/security/analyze")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"upi_id\":\"merchant@upi\",\"amount\":5000,\"user_id\":\"" + USER_ID_STR + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.risk_level").exists())
                .andExpect(jsonPath("$.can_proceed").value(true));

        // the DB-built profile (avg ₹2000, 1 completed txn, 85 score) reached the risk service
        Mockito.verify(riskServiceClient).assess(org.mockito.ArgumentMatchers.argThat(req ->
                Integer.valueOf(85).equals(((Number) req.userProfile().get("security_score")).intValue())
                        && Integer.valueOf(1).equals(((Number) req.userProfile().get("transaction_count")).intValue())));

        // unknown user_id falls back silently (no 500)
        mockMvc.perform(post("/api/v1/security/analyze")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"upi_id\":\"merchant@upi\",\"amount\":5000,"
                                + "\"user_id\":\"00000000-0000-0000-0000-000000000000\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void malformedRequestsSurfaceAsFastAPIStyleDetailError() throws Exception {
        // missing `amount` → NPE inside the analysis → the route's 500 guard
        mockMvc.perform(post("/api/v1/security/analyze")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"upi_id\":\"friend@ybl\"}"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.startsWith("Security analysis failed:")));
    }

    @Test
    void layersEndpointEnumeratesTheSevenShields() throws Exception {
        mockMvc.perform(get("/api/v1/security/layers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total_layers").value(7))
                .andExpect(jsonPath("$.usp").value("Even if one layer fails, others catch the fraud. Defense in depth."))
                .andExpect(jsonPath("$.layers.length()").value(7))
                .andExpect(jsonPath("$.layers[0].name").value("Environment Shield"))
                .andExpect(jsonPath("$.layers[0].can_block").value(true))
                .andExpect(jsonPath("$.layers[4].models.length()").value(5))
                .andExpect(jsonPath("$.layers[6].name").value("Decision & Explanation"));
    }

    @Test
    void scamEducationContentServesPerTypeAnd404s() throws Exception {
        mockMvc.perform(get("/api/v1/security/scam-education/digital_arrest"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Digital Arrest Scam"))
                .andExpect(jsonPath("$.important").exists());

        mockMvc.perform(get("/api/v1/security/scam-education/unknown_kind"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail")
                        .value("Education content not found for: unknown_kind"));
    }
}
