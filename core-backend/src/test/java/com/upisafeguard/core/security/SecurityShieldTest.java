package com.upisafeguard.core.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import com.upisafeguard.core.persistence.FraudReport;
import com.upisafeguard.core.persistence.FraudReportRepository;
import com.upisafeguard.core.risk.RiskAssessmentResponse;
import com.upisafeguard.core.risk.RiskServiceClient;
import com.upisafeguard.core.risk.RiskServiceUnavailableException;

/** Layer-by-layer tests against the app/ml/security_shield.py contract. */
class SecurityShieldTest {

    private static final String RISK_SERVICE_FALLBACK_ON = "anonymous-user";

    private RiskServiceClient riskServiceClient;
    private FraudReportRepository fraudReports;
    private SecurityShield shield;

    @BeforeEach
    void setUp() {
        riskServiceClient = Mockito.mock(RiskServiceClient.class);
        fraudReports = Mockito.mock(FraudReportRepository.class);
        shield = new SecurityShield(riskServiceClient, fraudReports);

        // Default: ML says safe, no community reports
        lenient().when(riskServiceClient.assess(any())).thenReturn(assessment(0.05));
        lenient().when(fraudReports.countByScammerUpiEqualsIgnoreCase(any())).thenReturn(0L);
        lenient().when(fraudReports.findTop3ByScammerUpiEqualsIgnoreCaseOrderByCreatedAtDesc(any()))
                .thenReturn(List.of());
    }

    private static RiskAssessmentResponse assessment(double score) {
        return new RiskAssessmentResponse(
                "risk-service-v1", "engine-v1", "tx-1", score > 0.7 ? "critical" : score > 0.4 ? "medium" : "low",
                score, score > 0.7 ? "block" : "proceed", score > 0.7, List.of(), 0.9, score, List.of(),
                Map.of("primary_model", "xgboost-paysim-v1"), Map.of(), null, null);
    }

    private ShieldLayerResult layer(String name, ShieldAnalysis analysis) {
        return analysis.layerResults.stream()
                .filter(r -> r.layerName.equals(name))
                .findFirst()
                .orElseThrow();
    }

    @Test
    void cleanTransactionPassesAllLayersAndCanProceed() {
        ShieldAnalysis analysis = shield.analyzeTransaction("jaganravi@ybl", 500, RISK_SERVICE_FALLBACK_ON,
                Map.of(), Map.of());

        assertThat(analysis.blocked).isFalse();
        assertThat(analysis.canProceed).isTrue();
        assertThat(analysis.riskLevel).isEqualTo(RiskLevel.SAFE);
        assertThat(analysis.scamTypeDetected).isNull();
        assertThat(analysis.educationLink).isNull();

        // 8 layer results in the exact Python order
        assertThat(analysis.layerResults.stream().map(r -> r.layerName)).containsExactly(
                "Environment Shield (Kill Switch)",
                "Input Sanitization",
                "Hard Rules Shield",
                "Verification Shield",
                "ML Intelligence Shield",
                "Community Intelligence",
                "Final Decision");

        assertThat(layer("Environment Shield (Kill Switch)", analysis).passed).isTrue();
        assertThat(layer("Input Sanitization", analysis).passed).isTrue();
        assertThat(layer("Hard Rules Shield", analysis).passed).isTrue();
        assertThat(layer("Community Intelligence", analysis).reasons)
                .containsExactly("✅ No community reports against this UPI");
        // primary_reason is the FIRST reason seen overall (just like Python), which
        // for a clean payment is the verification layer's account-name message
        assertThat(analysis.primaryReason).startsWith("✅ Account verified:");
        // Base tips (2) without a scam type
        assertThat(analysis.safetyTips).hasSize(2)
                .contains("Never share OTP, PIN, or password with anyone");
    }

    @Test
    void environmentKillSwitchBlocksRecordingSharingAndFlagsOverlay() {
        ShieldAnalysis recording = shield.analyzeTransaction("friend@ybl", 500, "u1",
                Map.of("screen_recording", true), Map.of());
        assertThat(recording.blocked).isTrue();
        assertThat(recording.riskLevel).isEqualTo(RiskLevel.BLOCKED);
        assertThat(recording.canProceed).isFalse();
        assertThat(layer("Environment Shield (Kill Switch)", recording).threats)
                .extracting(t -> t.value()).containsExactly("screen_recording");
        assertThat(layer("Environment Shield (Kill Switch)", recording).riskScore).isEqualTo(100);

        ShieldAnalysis sharing = shield.analyzeTransaction("friend@ybl", 500, "u1",
                Map.of("screen_sharing", true), Map.of());
        assertThat(layer("Environment Shield (Kill Switch)", sharing).reasons.get(0))
                .startsWith("🚨 Screen sharing app active");

        // overlay → blocked flag but lower security score than recording
        ShieldAnalysis overlay = shield.analyzeTransaction("friend@ybl", 500, "u1",
                Map.of("overlay_detected", true), Map.of());
        assertThat(layer("Environment Shield (Kill Switch)", overlay).riskScore).isEqualTo(80);
        assertThat(overlay.blocked).isTrue();

        // rooted alone adds risk without blocking
        ShieldAnalysis rooted = shield.analyzeTransaction("friend@ybl", 500, "u1",
                Map.of("device_rooted", true), Map.of());
        assertThat(rooted.blocked).isFalse();
        assertThat(layer("Environment Shield (Kill Switch)", rooted).riskScore).isEqualTo(30);
    }

    @Test
    void blocklistedUpiIsBlockedWithScamEducation() {
        ShieldAnalysis analysis = shield.analyzeTransaction("lottery.winner@scam", 2000, "u1", Map.of(), Map.of());

        assertThat(analysis.blocked).isTrue();
        assertThat(analysis.riskLevel).isEqualTo(RiskLevel.BLOCKED);
        assertThat(analysis.scamTypeDetected).isEqualTo("lottery");
        assertThat(analysis.educationLink).isEqualTo("/education/lottery-scam");
        assertThat(analysis.safetyTips).startsWith("💡 You can't win a lottery you never entered");
        assertThat(analysis.safetyTips).hasSize(5); // scam tips first, padded with base tips
        ShieldLayerResult hardRules = layer("Hard Rules Shield", analysis);
        assertThat(hardRules.passed).isFalse();
        assertThat(hardRules.reasons).contains("🚫 This UPI ID is in our fraud blocklist - PAYMENT BLOCKED");
        assertThat(hardRules.threats).extracting(t -> t.value()).contains("blocklist_match", "scam_keywords");
    }

    @Test
    void scamKeywordUpiRaisesScoreAndDetectsTypeWithoutBlocklist() {
        ShieldAnalysis analysis = shield.analyzeTransaction("lottery@ybl", 2000, "u1", Map.of(), Map.of());

        assertThat(analysis.blocked).isFalse(); // not on the hard blocklist
        assertThat(analysis.scamTypeDetected).isEqualTo("lottery");
        // scam type detected → minimum final score of 60 → RISKY band
        assertThat(analysis.finalScore).isEqualTo(60.0, org.assertj.core.api.Assertions.within(0.5));
        assertThat(analysis.riskLevel).isEqualTo(RiskLevel.RISKY);
        assertThat(analysis.canProceed).isFalse();
        assertThat(analysis.primaryReason).startsWith("🚨 LOTTERY SCAM PATTERN DETECTED");
        assertThat(layer("Hard Rules Shield", analysis).reasons)
                .contains("🔴 SCAM KEYWORD DETECTED: 'lottery' in UPI ID");
    }

    @Test
    void sanitizationStripsInjectionCharsAndFlagsIt() {
        ShieldAnalysis analysis = shield.analyzeTransaction("vishal<>';@ybl", 100, "u1", Map.of(), Map.of());

        ShieldLayerResult sanitizer = layer("Input Sanitization", analysis);
        assertThat(sanitizer.data.get("sanitized_upi")).isEqualTo("vishal@ybl");
        assertThat(sanitizer.reasons).contains("⚠️ Suspicious characters removed from UPI ID");
        assertThat(sanitizer.riskScore).isEqualTo(20);
        // hard rules ran on the sanitized value: no injection junk matched anything
        assertThat(layer("Hard Rules Shield", analysis).passed).isTrue();
    }

    @Test
    void invalidUpiFailsSanitizationAndBlocks() {
        ShieldAnalysis analysis = shield.analyzeTransaction("ab", 100, "u1", Map.of(), Map.of());

        assertThat(analysis.blocked).isTrue();
        assertThat(layer("Input Sanitization", analysis).reasons).containsExactly("❌ Invalid UPI ID format");
    }

    @Test
    void communityReportCountDrivesRiskAndBlocking() {
        when(fraudReports.countByScammerUpiEqualsIgnoreCase("bad@ybl")).thenReturn(12L);
        FraudReport report = new FraudReport();
        report.setScamType("kyc_fraud");
        when(fraudReports.findTop3ByScammerUpiEqualsIgnoreCaseOrderByCreatedAtDesc("bad@ybl"))
                .thenReturn(List.of(report));

        ShieldAnalysis blocked = shield.analyzeTransaction("bad@ybl", 100, "u1", Map.of(), Map.of());
        assertThat(blocked.blocked).isTrue();
        assertThat(blocked.riskLevel).isEqualTo(RiskLevel.BLOCKED);
        assertThat(layer("Community Intelligence", blocked).reasons.get(0))
                .isEqualTo("🚫 BLOCKED: 12 users reported this UPI for kyc_fraud");
        assertThat(layer("Community Intelligence", blocked).riskScore).isEqualTo(100);

        when(fraudReports.countByScammerUpiEqualsIgnoreCase("bad@ybl")).thenReturn(6L);
        ShieldAnalysis high = shield.analyzeTransaction("bad@ybl", 100, "u1", Map.of(), Map.of());
        assertThat(layer("Community Intelligence", high).riskScore).isEqualTo(60);
        assertThat(high.blocked).isFalse(); // 5-9 reports warn but don't block the flow

        when(fraudReports.countByScammerUpiEqualsIgnoreCase("bad@ybl")).thenReturn(1L);
        ShieldAnalysis caution = shield.analyzeTransaction("bad@ybl", 100, "u1", Map.of(), Map.of());
        assertThat(layer("Community Intelligence", caution).riskScore).isEqualTo(30);
    }

    @Test
    void mlServiceResponseMapsIntoLayer5() {
        when(riskServiceClient.assess(any())).thenReturn(
                new RiskAssessmentResponse("v1", "v1", "tx-1", "critical", 0.82, "block", true,
                        List.of("Amount far above user average", "Recipient flagged network-wide"),
                        0.9, 0.7, List.of(), Map.of("primary_model", "xgb-v1"), Map.of(), null, null));

        ShieldAnalysis analysis = shield.analyzeTransaction("stranger@axl", 48000, "u1", Map.of(), Map.of());

        ShieldLayerResult ml = layer("ML Intelligence Shield", analysis);
        assertThat(ml.riskScore).isEqualTo(82.0, org.assertj.core.api.Assertions.within(0.001));
        assertThat(ml.threats).extracting(t -> t.value()).containsExactly("anomalous_behavior");
        assertThat(ml.reasons).startsWith(
                "Amount far above user average",
                "Recipient flagged network-wide");
        assertThat(ml.reasons).contains("🔴 Multiple ML models detected fraud patterns");
    }

    @Test
    void mlOutageFallsBackToHeuristicScoresInsteadOfFailing() {
        Mockito.doThrow(new RiskServiceUnavailableException("risk service down"))
                .when(riskServiceClient).assess(any());

        ShieldAnalysis clean = shield.analyzeTransaction("stranger@axl", 1500, "u1", Map.of(), Map.of());

        assertThat(clean.blocked).isFalse();
        ShieldLayerResult ml = layer("ML Intelligence Shield", clean);
        @SuppressWarnings("unchecked")
        Map<String, Object> scores = (Map<String, Object>) ml.data.get("ml_scores");
        assertThat(scores).containsEntry("xgboost", 15.0)
                .containsEntry("isolation_forest", 10.0)
                .containsEntry("lstm", 20.0)
                .containsEntry("sensor", 5.0);
        assertThat(ml.reasons).contains("⚠️ ML analysis using simplified mode");
        // same fallback with a scam-typed UPI jumps the xgb score to 75
        ShieldAnalysis scam = shield.analyzeTransaction("lottery-winner-2024@ybl", 1500, "u1", Map.of(), Map.of());
        assertThat(layer("ML Intelligence Shield", scam).riskScore).isEqualTo(33.75, org.assertj.core.api.Assertions.within(0.001));
    }

    @Test
    void accountNameDerivationMatchesPythonTitleCasing() {
        assertThat(SecurityShield.displayName("jagan.kumar@ybl")).isEqualTo("Jagan Kumar");
        assertThat(SecurityShield.displayName("ram_123khan@sbi")).isEqualTo("Ram 123Khan");

        // suspicious customer-care style names are flagged in the verification layer
        ShieldAnalysis analysis = shield.analyzeTransaction("official.customer.care@paytm", 100, "u1", Map.of(), Map.of());
        ShieldLayerResult verification = layer("Verification Shield", analysis);
        assertThat(verification.reasons.get(0)).startsWith("🔴 Suspicious account name:");
        assertThat(verification.threats).extracting(t -> t.value()).containsExactly("suspicious_name");
        assertThat(verification.riskScore).isEqualTo(25);
    }

    @Test
    void highAndLimitHuggingAmountsAddHardRuleRisk() {
        ShieldAnalysis large = shield.analyzeTransaction("friend@ybl", 60000, "u1", Map.of(), Map.of());
        assertThat(layer("Hard Rules Shield", large).reasons)
                .contains("⚠️ Large transaction (₹60,000) - extra verification recommended");

        ShieldAnalysis limitHug = shield.analyzeTransaction("friend@ybl", 9999, "u1", Map.of(), Map.of());
        assertThat(layer("Hard Rules Shield", limitHug).reasons)
                .contains("⚠️ Amount just below transfer limit - common fraud pattern");
    }

    @Test
    void transactionIdIsSixteenHexChars() {
        ShieldAnalysis analysis = shield.analyzeTransaction("friend@ybl", 500, "u1", Map.of(), Map.of());
        assertThat(analysis.transactionId).hasSize(16).matches("[0-9a-f]{16}");
    }
}
