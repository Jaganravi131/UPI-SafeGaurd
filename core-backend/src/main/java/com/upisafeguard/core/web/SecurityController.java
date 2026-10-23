package com.upisafeguard.core.web;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.upisafeguard.core.persistence.PaymentTransaction;
import com.upisafeguard.core.persistence.PaymentTransactionRepository;
import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.UserRepository;
import com.upisafeguard.core.risk.RiskServiceClient;
import com.upisafeguard.core.payment.PaymentStatus;
import com.upisafeguard.core.security.RiskLevel;
import com.upisafeguard.core.security.SecurityShield;
import com.upisafeguard.core.security.ShieldAnalysis;
import com.upisafeguard.core.security.ShieldLayerResult;

/**
 * Security Shield API — port of backend/app/api/routes/security.py with the
 * identical AnalyzeResponse contract (snake_case keys, layer summaries,
 * risk labels/colors/icons, education payloads).
 */
@RestController
@RequestMapping("/api/v1/security")
public class SecurityController {

    private final SecurityShield shield;
    private final UserRepository userRepository;
    private final PaymentTransactionRepository transactionRepository;

    @Autowired
    public SecurityController(SecurityShield shield, UserRepository userRepository,
                              PaymentTransactionRepository transactionRepository) {
        this.shield = shield;
        this.userRepository = userRepository;
        this.transactionRepository = transactionRepository;
    }

    @PostMapping("/analyze")
    public ResponseEntity<?> analyze(@RequestBody AnalyzeRequest request) {
        try {
            Map<String, Boolean> envData = new LinkedHashMap<>();
            if (request.environment != null) {
                envData.put("screen_recording", bool(request.environment.screen_recording));
                envData.put("screen_sharing", bool(request.environment.screen_sharing));
                envData.put("overlay_detected", bool(request.environment.overlay_detected));
                envData.put("device_rooted", bool(request.environment.device_rooted));
            }

            // User profile: DB stats when user_id provided, else request data or defaults
            Map<String, Object> profileData = null;
            if (request.user_id != null && !request.user_id.isBlank()) {
                User user = findUser(request.user_id);
                if (user != null) {
                    List<PaymentTransaction> completed =
                            transactionRepository.findByUserIdAndStatus(user.getId().toString(), PaymentStatus.COMPLETED.name());
                    List<Double> amounts = completed.stream().map(t -> t.getAmount().doubleValue()).toList();

                    Map<String, Object> profile = new LinkedHashMap<>();
                    profile.put("avg_transaction_amount", amounts.isEmpty() ? 0.0
                            : amounts.stream().mapToDouble(Double::doubleValue).average().orElse(0));
                    profile.put("max_transaction_amount", amounts.isEmpty() ? 0.0
                            : amounts.stream().mapToDouble(Double::doubleValue).max().orElse(0));
                    profile.put("transaction_count", amounts.size());
                    profile.put("account_age_days", user.getCreatedAt() == null ? 0
                            : ChronoUnit.DAYS.between(user.getCreatedAt(), Instant.now()));
                    profile.put("security_score", user.getSecurityScore() == null
                            || user.getSecurityScore().signum() == 0 ? 50 : user.getSecurityScore().intValue());
                    profileData = profile;
                }
            }
            if (profileData == null) {
                UserProfile profile = request.user_profile != null ? request.user_profile : new UserProfile();
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("avg_transaction_amount", profile.avg_transaction_amount);
                data.put("max_transaction_amount", profile.max_transaction_amount);
                data.put("transaction_count", profile.transaction_count);
                data.put("account_age_days", profile.account_age_days);
                data.put("security_score", profile.security_score);
                profileData = data;
            }

            ShieldAnalysis result = shield.analyzeTransaction(
                    request.upi_id,
                    request.amount,
                    request.user_id == null ? "anonymous" : request.user_id,
                    envData,
                    profileData);

            // Format layer results for the response (+ visualization summary)
            List<Map<String, Object>> layerResponses = new ArrayList<>();
            List<Map<String, Object>> layerSummary = new ArrayList<>();
            for (ShieldLayerResult layer : result.layerResults) {
                layerResponses.add(orderedRow(
                        "layer_name", layer.layerName,
                        "passed", layer.passed,
                        "risk_score", layer.riskScore,
                        "reasons", layer.reasons,
                        "threats", layer.threats.stream().map(t -> t.value()).toList()));

                String label = layer.layerName.split(" \\(")[0];
                layerSummary.add(orderedRow(
                        "name", label,
                        "passed", layer.passed,
                        "score", Math.round(layer.riskScore),
                        "status", layer.riskScore > 70 ? "danger" : layer.riskScore > 40 ? "warning" : "safe",
                        "icon", layer.passed ? "🛡️" : layer.riskScore < 70 ? "⚠️" : "🚫"));
            }

            Map<String, String> config = RISK_CONFIG.getOrDefault(result.riskLevel, RISK_CONFIG.get(RiskLevel.CAUTION));
            String scamLabel = result.scamTypeDetected == null ? null : SCAM_LABELS.get(result.scamTypeDetected);

            Map<String, Object> body = orderedRow(
                    "transaction_id", result.transactionId,
                    "timestamp", result.timestamp.toString(),
                    "risk_level", result.riskLevel.value(),
                    "risk_level_label", config.get("label"),
                    "final_score", round1(result.finalScore),
                    "is_blocked", result.blocked,
                    "can_proceed", result.canProceed,
                    "risk_color", config.get("color"),
                    "risk_icon", config.get("icon"),
                    "layer_results", layerResponses,
                    "primary_reason", result.primaryReason,
                    "all_reasons", result.allReasons,
                    "safety_tips", result.safetyTips,
                    "scam_type_detected", result.scamTypeDetected,
                    "scam_type_label", scamLabel,
                    "education_link", result.educationLink,
                    "layer_summary", layerSummary);
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            throw new ApiRequestException(HttpStatus.INTERNAL_SERVER_ERROR, "Security analysis failed: " + e.getMessage());
        }
    }

    /** Information about all 7 security layers (GET /security/layers parity). */
    @GetMapping("/layers")
    public ResponseEntity<?> getLayers() {
        List<Map<String, Object>> layers = new ArrayList<>();
        layers.add(orderedRow(
                "number", 1,
                "name", "Environment Shield",
                "aka", "The Kill Switch",
                "description", "Detects screen recording, sharing, overlay attacks",
                "protects_against", List.of("AnyDesk scams", "TeamViewer fraud", "Clickjacking"),
                "can_block", true));
        layers.add(orderedRow(
                "number", 2,
                "name", "Input Sanitization",
                "description", "Validates and sanitizes UPI ID format",
                "protects_against", List.of("Injection attacks", "Invalid inputs"),
                "can_block", true));
        layers.add(orderedRow(
                "number", 3,
                "name", "Hard Rules Shield",
                "description", "Deterministic rules that cannot be bypassed",
                "protects_against", List.of("Known scam patterns", "Blocklisted UPIs", "Suspicious keywords"),
                "can_block", true));
        layers.add(orderedRow(
                "number", 4,
                "name", "Verification Shield",
                "description", "Real UPI verification with account holder name",
                "protects_against", List.of("Fake UPIs", "Impersonation"),
                "can_block", false));
        layers.add(orderedRow(
                "number", 5,
                "name", "ML Intelligence Shield",
                "description", "5 ML models for fraud detection",
                "models", List.of("XGBoost", "LSTM", "Isolation Forest", "GNN", "Sensor"),
                "protects_against", List.of("Unknown patterns", "Behavioral anomalies", "Fraud networks"),
                "can_block", false));
        layers.add(orderedRow(
                "number", 6,
                "name", "Community Intelligence",
                "description", "Crowdsourced fraud reports from users",
                "protects_against", List.of("Newly identified scammers", "Emerging fraud patterns"),
                "can_block", true));
        layers.add(orderedRow(
                "number", 7,
                "name", "Decision & Explanation",
                "description", "Final risk calculation and user explanation",
                "output", List.of("Risk level", "Specific reasons", "Safety tips", "Education links"),
                "can_block", false));

        Map<String, Object> body = orderedRow(
                "total_layers", 7,
                "layers", layers,
                "usp", "Even if one layer fails, others catch the fraud. Defense in depth.");
        return ResponseEntity.ok(body);
    }

    /** Educational content about a specific scam type (GET /security/scam-education/{type}). */
    @GetMapping("/scam-education/{scamType}")
    public ResponseEntity<?> getScamEducation(@PathVariable String scamType) {
        Map<String, Object> content = EDUCATION_CONTENT.get(scamType);
        if (content == null) {
            throw new ApiRequestException(HttpStatus.NOT_FOUND, "Education content not found for: " + scamType);
        }
        return ResponseEntity.ok(content);
    }

    // ── Response tables (routes/security.py) ─────────────────────────────

    private static final Map<RiskLevel, Map<String, String>> RISK_CONFIG = buildRiskConfig();
    private static final Map<String, String> SCAM_LABELS = buildScamLabels();
    private static final Map<String, Map<String, Object>> EDUCATION_CONTENT = buildEducation();

    private static Map<RiskLevel, Map<String, String>> buildRiskConfig() {
        Map<RiskLevel, Map<String, String>> config = new LinkedHashMap<>();
        config.put(RiskLevel.SAFE, Map.of("label", "Safe to Pay", "color", "green", "icon", "✓"));
        config.put(RiskLevel.CAUTION, Map.of("label", "Proceed with Caution", "color", "yellow", "icon", "⚠️"));
        config.put(RiskLevel.RISKY, Map.of("label", "High Risk - Verify First", "color", "orange", "icon", "⚠️"));
        config.put(RiskLevel.DANGEROUS, Map.of("label", "Do Not Pay", "color", "red", "icon", "🚫"));
        config.put(RiskLevel.BLOCKED, Map.of("label", "BLOCKED", "color", "red", "icon", "🚫"));
        return config;
    }

    private static Map<String, String> buildScamLabels() {
        Map<String, String> labels = new LinkedHashMap<>();
        labels.put("lottery", "Lottery/Prize Scam");
        labels.put("kyc_fraud", "KYC Verification Fraud");
        labels.put("digital_arrest", "Digital Arrest Scam");
        labels.put("refund_scam", "Fake Refund Scam");
        labels.put("fake_support", "Fake Customer Support");
        return labels;
    }

    private static Map<String, Map<String, Object>> buildEducation() {
        Map<String, Map<String, Object>> education = new LinkedHashMap<>();
        education.put("lottery", orderedRow(
                "title", "Lottery & Prize Scams",
                "summary", "Scammers tell you that you've won a lottery or prize, but you need to pay 'taxes' or 'processing fees' to claim it.",
                "how_it_works", List.of(
                        "You receive a call/message saying you won a lottery (you never entered)",
                        "They ask for 'processing fee' or 'tax' to release your prize",
                        "After you pay, they ask for more fees, or disappear"),
                "warning_signs", List.of(
                        "You can't win a lottery you didn't enter",
                        "Real lotteries never ask for upfront payments",
                        "Prizes don't require 'tax' to be paid via UPI"),
                "what_to_do", List.of(
                        "Never pay to receive a prize",
                        "Block the number immediately",
                        "Report to Cyber Crime helpline: 1930"),
                "real_examples", List.of(
                        "KBC Lottery - Fake calls claiming KBC prize",
                        "Amazon/Flipkart Lucky Draw - No such draws exist")));
        education.put("kyc_fraud", orderedRow(
                "title", "KYC & Verification Fraud",
                "summary", "Scammers pretend to be from your bank and claim your account will be blocked if you don't 'update KYC' immediately.",
                "how_it_works", List.of(
                        "You get an SMS/call saying 'Your account will be blocked in 24 hours'",
                        "They send a link to 'update KYC' which is a phishing site",
                        "Or they ask you to download an app (AnyDesk) to 'help you update'"),
                "warning_signs", List.of(
                        "Banks never threaten to block accounts over phone",
                        "KYC updates happen at bank branches or official apps only",
                        "No one needs remote access to update KYC"),
                "what_to_do", List.of(
                        "Ignore such messages completely",
                        "Visit your bank branch if genuinely concerned",
                        "Never share OTP or download remote access apps")));
        education.put("digital_arrest", orderedRow(
                "title", "Digital Arrest Scam",
                "summary", "Scammers impersonate police/CBI and claim you're involved in a crime. They keep you on video call and demand money to 'clear your name'.",
                "how_it_works", List.of(
                        "You receive a call claiming to be from Police/CBI/Customs",
                        "They say your Aadhaar is linked to crime/money laundering",
                        "They put you on video call and show fake 'arrest warrant'",
                        "They demand money to 'settle the case' and not arrest you"),
                "warning_signs", List.of(
                        "Police NEVER arrest via video call",
                        "No government agency asks for money to 'clear charges'",
                        "Real arrests happen in person, not over phone",
                        "They create panic so you don't think clearly"),
                "what_to_do", List.of(
                        "Hang up immediately - it's 100% a scam",
                        "Call 1930 (Cyber Crime) to report",
                        "Call your local police station to verify (they will confirm it's fake)"),
                "important", "⚠️ This is one of the most dangerous scams. Victims have lost crores. NO MATTER WHAT THEY SAY - HANG UP."));
        education.put("refund_scam", orderedRow(
                "title", "Fake Refund Scam",
                "summary", "Scammers claim you're eligible for a refund but trick you into sending money instead of receiving it.",
                "how_it_works", List.of(
                        "You receive call/SMS about a 'refund' for cancelled order/extra payment",
                        "They ask you to 'enter amount' on UPI app to 'receive' the refund",
                        "What you're actually doing is SENDING money, not receiving",
                        "Or they send a QR code that actually deducts money"),
                "warning_signs", List.of(
                        "Refunds are automatic - you never need to 'approve' them",
                        "You don't need to scan QR code to receive money",
                        "Entering amount and clicking 'Pay' always SENDS money"),
                "what_to_do", List.of(
                        "Never scan QR codes to 'receive' money",
                        "Check your bank statement for actual refunds",
                        "Contact company through official website only")));
        education.put("fake_support", orderedRow(
                "title", "Fake Customer Support",
                "summary", "Scammers create fake customer care numbers that appear in Google search results. When you call, they steal your money.",
                "how_it_works", List.of(
                        "You search 'Amazon/Bank customer care number' on Google",
                        "Scammers pay to show their fake number in top results",
                        "When you call, they pretend to help but ask for remote access",
                        "They use AnyDesk/TeamViewer to access your phone and steal money"),
                "warning_signs", List.of(
                        "Customer care never asks for remote access",
                        "They never ask you to download AnyDesk/TeamViewer",
                        "Official numbers are only on company's official app/website"),
                "what_to_do", List.of(
                        "Never Google for customer care numbers",
                        "Find contact details only from official app/website",
                        "If someone asks for AnyDesk - HANG UP immediately")));
        return education;
    }

    // ── DTOs (schemas in routes/security.py) ─────────────────────────────

    public static class EnvironmentData {
        public Boolean screen_recording = false;
        public Boolean screen_sharing = false;
        public Boolean overlay_detected = false;
        public Boolean device_rooted = false;
    }

    public static class UserProfile {
        public double avg_transaction_amount = 1000;
        public double max_transaction_amount = 10000;
        public int transaction_count = 50;
        public int account_age_days = 180;
        public int security_score = 50;
    }

    public static class AnalyzeRequest {
        public String upi_id;
        public Double amount;
        public String user_id;
        public EnvironmentData environment;
        public UserProfile user_profile;
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private User findUser(String userId) {
        try {
            return userRepository.findById(UUID.fromString(userId.trim())).orElse(null);
        } catch (IllegalArgumentException badUuid) {
            return null;
        }
    }

    private static boolean bool(Boolean value) {
        return Boolean.TRUE.equals(value);
    }

    private static double round1(double value) {
        return BigDecimal.valueOf(value).setScale(1, RoundingMode.HALF_UP).doubleValue();
    }

    /** Ordered map preserving the FastAPI response key order. */
    private static Map<String, Object> orderedRow(Object... keyValues) {
        LinkedHashMap<String, Object> row = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            row.put((String) keyValues[i], keyValues[i + 1]);
        }
        return row;
    }
}
