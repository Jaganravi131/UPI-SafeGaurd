package com.upisafeguard.core.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.upisafeguard.core.persistence.FraudReport;
import com.upisafeguard.core.persistence.FraudReportRepository;
import com.upisafeguard.core.risk.RiskAssessmentRequest;
import com.upisafeguard.core.risk.RiskAssessmentResponse;
import com.upisafeguard.core.risk.RiskServiceClient;

/**
 * 7-LAYER SECURITY SHIELD — 1:1 port of backend/app/ml/security_shield.py.
 *
 * Every transaction passes through ALL layers sequentially.
 * If ANY layer fails → Transaction blocked or warned.
 *
 * Layer 1: Environment Shield (Kill Switch)
 * Layer 2: Input Sanitization Shield
 * Layer 3: Hard Rules Shield (Cannot be bypassed)
 * Layer 4: Verification Shield (UPI Verification)
 * Layer 5: ML Intelligence Shield (ai-service over HTTP, heuristic fallback)
 * Layer 6: Community Intelligence Shield (fraud_reports table)
 * Layer 7: Decision & Explanation Shield
 */
@Component
public class SecurityShield {

    private static final Logger log = LoggerFactory.getLogger(SecurityShield.class);

    // ==================== BLOCKLISTS ====================
    static final Set<String> HARD_BLOCKLIST_UPIS = Set.of(
            "lottery.winner@scam",
            "kyc.update@fake",
            "cbi.officer@fraud",
            "customer.care@fake",
            "refund.process@scam");

    static final Map<String, List<String>> SCAM_KEYWORDS = new LinkedHashMap<>() {{
        put("critical", List.of("lottery", "winner", "prize", "jackpot", "cbi", "arrest", "police", "customs"));
        put("high", List.of("kyc", "blocked", "suspended", "verify", "update", "urgent", "official", "support", "helpdesk"));
        put("medium", List.of("refund", "cashback", "bonus", "offer", "free", "gift"));
    }};

    static final List<Pattern> SUSPICIOUS_NAME_PATTERNS = List.of(
            Pattern.compile("lucky\\s*winner"),
            Pattern.compile("lottery"),
            Pattern.compile("prize"),
            Pattern.compile("customer\\s*care"),
            Pattern.compile("kyc\\s*update"),
            Pattern.compile("official\\s*support"),
            Pattern.compile("bank\\s*refund"));

    static final Pattern TRIPLE_DIGITS = Pattern.compile("\\d{3,}");
    static final Pattern BANK_SPOOFING = Pattern.compile("(sbi|hdfc|icici|axis|bank)\\.(official|support|care|help)");
    static final Pattern DANGEROUS_CHARS = Pattern.compile("[<>\"';{}()]");
    static final Set<Double> LIMIT_HUGGING_AMOUNTS = Set.of(9999.0, 19999.0, 49999.0, 99999.0);
    static final List<String> VALID_HANDLES = List.of("ybl", "okaxis", "paytm", "icici", "sbi", "hdfc", "apl", "ibl", "axl", "upi");

    /** scam_type → (keywords, education link) — iteration order decides detection priority. */
    static final Map<String, ScamTypeConfig> SCAM_TYPE_MAPPING = new LinkedHashMap<>() {{
        put("lottery", new ScamTypeConfig("LOTTERY SCAM", List.of("lottery", "winner", "prize", "jackpot"), "/education/lottery-scam"));
        put("kyc_fraud", new ScamTypeConfig("KYC/VERIFICATION FRAUD", List.of("kyc", "update", "blocked", "verify"), "/education/kyc-scam"));
        put("digital_arrest", new ScamTypeConfig("DIGITAL ARREST SCAM", List.of("cbi", "police", "arrest", "customs"), "/education/digital-arrest"));
        put("refund_scam", new ScamTypeConfig("FAKE REFUND SCAM", List.of("refund", "cashback", "return"), "/education/refund-scam"));
        put("fake_support", new ScamTypeConfig("FAKE CUSTOMER SUPPORT", List.of("support", "helpdesk", "customer.care"), "/education/fake-support"));
    }};

    record ScamTypeConfig(String title, List<String> keywords, String education) {
    }

    private final RiskServiceClient riskServiceClient;
    private final FraudReportRepository fraudReportRepository;

    public SecurityShield(RiskServiceClient riskServiceClient, FraudReportRepository fraudReportRepository) {
        this.riskServiceClient = riskServiceClient;
        this.fraudReportRepository = fraudReportRepository;
    }

    // ==================== Main entry point ====================
    public ShieldAnalysis analyzeTransaction(String upiId, double amount, String userId,
                                             Map<String, Boolean> environmentData, Map<String, Object> userProfile) {
        String transactionId = md5Hex(upiId + amount + LocalDateTime.now()).substring(0, 16);

        List<ShieldLayerResult> allResults = new ArrayList<>();
        List<String> allReasons = new ArrayList<>();
        boolean isBlocked = false;

        // ============ LAYER 1: Environment Shield ============
        ShieldLayerResult layer1 = layer1Environment(environmentData == null ? Map.of() : environmentData);
        allResults.add(layer1);
        allReasons.addAll(layer1.reasons);
        if (!layer1.passed) {
            isBlocked = true;
        }

        // ============ LAYER 2: Input Sanitization ============
        Sanitized layer2 = layer2Sanitization(upiId);
        allResults.add(layer2.result);
        allReasons.addAll(layer2.result.reasons);
        if (!layer2.result.passed) {
            isBlocked = true;
        }

        // ============ LAYER 3: Hard Rules Shield ============
        ShieldLayerResult layer3 = layer3HardRules(layer2.sanitized, amount);
        allResults.add(layer3);
        allReasons.addAll(layer3.reasons);
        if (!layer3.passed) {
            isBlocked = true;
        }

        // ============ LAYERS 4-6: (parallel in Python) ============
        ShieldLayerResult layer4 = layer4Verification(layer2.sanitized);
        allResults.add(layer4);
        allReasons.addAll(layer4.reasons);

        ShieldLayerResult layer5 = layer5MlAnalysis(layer2.sanitized, amount, userProfile, layer3.data, layer4);
        allResults.add(layer5);
        allReasons.addAll(layer5.reasons);

        ShieldLayerResult layer6 = layer6Community(layer2.sanitized);
        allResults.add(layer6);
        allReasons.addAll(layer6.reasons);
        // report_count read like the Python layer does from layer data
        if (intData(layer6.data, "report_count") >= 10) {
            isBlocked = true;
        }

        // ============ LAYER 7: Decision & Explanation ============
        ShieldLayerResult finalResult = layer7Decision(allResults, isBlocked);
        allResults.add(finalResult);

        // Final score: MAX of critical layers (not average) so high-risk detections aren't diluted
        double maxCriticalScore = Math.max(layer3.riskScore, Math.max(layer5.riskScore, layer6.riskScore));
        double avgScore = allResults.stream().mapToDouble(r -> r.riskScore).average().orElse(0);
        double totalScore = Math.min(Math.max(maxCriticalScore, avgScore * 1.5), 100);

        String scamType = stringData(layer3.data, "scam_type");
        if (scamType != null) {
            totalScore = Math.max(totalScore, 60);
        }

        RiskLevel riskLevel = calculateRiskLevel(totalScore, isBlocked);
        List<String> safetyTips = generateSafetyTips(scamType);

        String educationLink = scamType != null && SCAM_TYPE_MAPPING.containsKey(scamType)
                ? SCAM_TYPE_MAPPING.get(scamType).education()
                : null;

        return new ShieldAnalysis(
                transactionId,
                LocalDateTime.now(),
                riskLevel,
                totalScore,
                isBlocked,
                !isBlocked && (riskLevel == RiskLevel.SAFE || riskLevel == RiskLevel.CAUTION),
                allResults,
                allReasons.isEmpty() ? "Transaction analyzed" : allReasons.get(0),
                allReasons,
                safetyTips,
                scamType,
                educationLink);
    }

    // ==================== LAYER 1: Environment Shield (Kill Switch) ====================
    private ShieldLayerResult layer1Environment(Map<String, Boolean> envData) {
        List<String> reasons = new ArrayList<>();
        List<ThreatType> threats = new ArrayList<>();
        double riskScore = 0;
        boolean passed = true;

        if (Boolean.TRUE.equals(envData.get("screen_recording"))) {
            reasons.add("🚨 Screen recording detected - payments blocked for your safety");
            threats.add(ThreatType.SCREEN_RECORDING);
            riskScore = 100;
            passed = false;
        }
        if (Boolean.TRUE.equals(envData.get("screen_sharing"))) {
            reasons.add("🚨 Screen sharing app active (AnyDesk/TeamViewer) - this is how scammers steal money");
            threats.add(ThreatType.SCREEN_SHARING);
            riskScore = 100;
            passed = false;
        }
        if (Boolean.TRUE.equals(envData.get("overlay_detected"))) {
            reasons.add("⚠️ Another app is drawing over the screen - potential clickjacking attack");
            threats.add(ThreatType.OVERLAY);
            riskScore = 80;
            passed = false;
        }
        if (Boolean.TRUE.equals(envData.get("device_rooted"))) {
            reasons.add("⚠️ Device security may be compromised (rooted/jailbroken)");
            threats.add(ThreatType.ROOTED_DEVICE);
            riskScore = Math.max(riskScore, 30);
        }

        Map<String, Object> data = new HashMap<>();
        data.put("environment_safe", passed);
        return new ShieldLayerResult("Environment Shield (Kill Switch)", passed, riskScore, reasons, threats, data);
    }

    // ==================== LAYER 2: Input Sanitization ====================
    private record Sanitized(String sanitized, ShieldLayerResult result) {
    }

    private Sanitized layer2Sanitization(String upiId) {
        List<String> reasons = new ArrayList<>();
        double riskScore = 0;
        boolean passed = true;

        if (upiId == null || upiId.length() < 3) {
            reasons.add("❌ Invalid UPI ID format");
            return new Sanitized("", new ShieldLayerResult("Input Sanitization", false, 100, reasons, List.of(), new HashMap<>()));
        }

        String sanitized = upiId.strip().toLowerCase(Locale.ROOT);

        if (!sanitized.contains("@")) {
            reasons.add("❌ Invalid UPI format - must contain @");
            passed = false;
            riskScore = 100;
        }

        String original = sanitized;
        sanitized = DANGEROUS_CHARS.matcher(sanitized).replaceAll("");
        if (!sanitized.equals(original)) {
            reasons.add("⚠️ Suspicious characters removed from UPI ID");
            riskScore = Math.max(riskScore, 20);
        }

        if (sanitized.length() > 50) {
            sanitized = sanitized.substring(0, 50);
            reasons.add("⚠️ UPI ID was too long - truncated");
            riskScore = Math.max(riskScore, 10);
        }

        if (sanitized.contains("@")) {
            String handle = sanitized.substring(sanitized.lastIndexOf("@") + 1);
            if (!VALID_HANDLES.contains(handle) && handle.length() > 10) {
                reasons.add("⚠️ Unusual bank handle: @" + handle);
                riskScore = Math.max(riskScore, 15);
            }
        }

        Map<String, Object> data = new HashMap<>();
        data.put("sanitized_upi", sanitized);
        data.put("original_upi", upiId);
        return new Sanitized(sanitized, new ShieldLayerResult("Input Sanitization", passed, riskScore, reasons, List.of(), data));
    }

    // ==================== LAYER 3: Hard Rules Shield ====================
    private ShieldLayerResult layer3HardRules(String upiId, double amount) {
        List<String> reasons = new ArrayList<>();
        List<ThreatType> threats = new ArrayList<>();
        double riskScore = 0;
        boolean passed = true;
        String scamType = null;
        List<Map.Entry<String, String>> keywordMatches = new ArrayList<>(); // (keyword, severity)

        // RULE 1: Hard blocklist check
        if (HARD_BLOCKLIST_UPIS.contains(upiId)) {
            reasons.add("🚫 This UPI ID is in our fraud blocklist - PAYMENT BLOCKED");
            threats.add(ThreatType.BLOCKLIST_MATCH);
            riskScore = 100;
            passed = false;
        }

        // RULE 2: Keyword analysis (severity order: critical, high, medium)
        String upiLower = upiId == null ? "" : upiId.toLowerCase(Locale.ROOT);
        for (Map.Entry<String, List<String>> severity : SCAM_KEYWORDS.entrySet()) {
            for (String keyword : severity.getValue()) {
                if (upiLower.contains(keyword)) {
                    keywordMatches.add(Map.entry(keyword, severity.getKey()));
                    if ("critical".equals(severity.getKey())) {
                        reasons.add("🔴 SCAM KEYWORD DETECTED: '" + keyword + "' in UPI ID");
                        riskScore += 35;
                        threats.add(ThreatType.SCAM_KEYWORDS);
                    } else if ("high".equals(severity.getKey())) {
                        reasons.add("🟠 Suspicious keyword: '" + keyword + "' often used in scams");
                        riskScore += 20;
                    } else {
                        reasons.add("🟡 Caution: '" + keyword + "' is sometimes used in scam UPIs");
                        riskScore += 10;
                    }
                }
            }
        }

        // RULE 3: Detect scam type (mapping order decides priority)
        for (Map.Entry<String, ScamTypeConfig> entry : SCAM_TYPE_MAPPING.entrySet()) {
            for (String kw : entry.getValue().keywords()) {
                if (upiLower.contains(kw)) {
                    scamType = entry.getKey();
                    break;
                }
            }
            if (scamType != null) {
                break;
            }
        }

        if (scamType != null) {
            String name = SCAM_TYPE_MAPPING.get(scamType).title();
            reasons.add(0, "🚨 " + name + " PATTERN DETECTED");
        }

        // RULE 4: Pattern detection — digits run and bank-name spoofing
        if (TRIPLE_DIGITS.matcher(upiId == null ? "" : upiId).find()) {
            reasons.add("⚠️ UPI contains suspicious number pattern (common in fraud accounts)");
            riskScore += 15;
        }

        if (BANK_SPOOFING.matcher(upiLower).find()) {
            reasons.add("🔴 Bank name spoofing detected - official bank UPIs don't look like this");
            riskScore += 25;
            threats.add(ThreatType.SCAM_KEYWORDS);
        }

        // RULE 5: Amount thresholds
        if (amount > 50000) {
            reasons.add("⚠️ Large transaction (₹" + String.format(Locale.US, "%,.0f", amount) + ") - extra verification recommended");
            riskScore += 15;
            threats.add(ThreatType.HIGH_AMOUNT);
        } else if (amount > 10000) {
            reasons.add("⚠️ Moderate amount (₹" + String.format(Locale.US, "%,.0f", amount) + ") - please verify recipient");
            riskScore += 5;
        }

        // Round numbers just below limits (suspicious)
        if (LIMIT_HUGGING_AMOUNTS.contains(amount)) {
            reasons.add("⚠️ Amount just below transfer limit - common fraud pattern");
            riskScore += 10;
        }

        List<String> matches = keywordMatches.stream()
                .map(e -> e.getKey() + ":" + e.getValue())
                .toList();

        Map<String, Object> data = new HashMap<>();
        data.put("scam_type", scamType);
        data.put("keyword_matches", matches);
        data.put("amount_risk", amount > 10000);
        return new ShieldLayerResult("Hard Rules Shield", passed, Math.min(riskScore, 100), reasons, threats, data);
    }

    // ==================== LAYER 4: Verification Shield ====================
    private ShieldLayerResult layer4Verification(String upiId) {
        List<String> reasons = new ArrayList<>();
        List<ThreatType> threats = new ArrayList<>();
        double riskScore = 0;
        String verifiedName = null;

        // Same fallback the Python shield uses when its Excel contact DB has no
        // entry: derive the account name from the UPI and pattern-check it.
        String namePart = displayName(upiId);
        verifiedName = namePart;

        for (Pattern pattern : SUSPICIOUS_NAME_PATTERNS) {
            if (pattern.matcher(namePart.toLowerCase(Locale.ROOT)).find()) {
                reasons.add("🔴 Suspicious account name: '" + verifiedName + "'");
                riskScore += 25;
                threats.add(ThreatType.SUSPICIOUS_NAME);
                break;
            }
        }

        // ALL CAPS name is suspicious (dead after title-casing, kept for parity)
        if (!namePart.isEmpty() && isUpper(namePart)) {
            reasons.add("⚠️ Account name is ALL CAPS - common in fraud accounts");
            riskScore += 10;
        }

        if (reasons.isEmpty()) {
            reasons.add("✅ Account verified: " + verifiedName);
        }

        Map<String, Object> data = new HashMap<>();
        data.put("verified_name", verifiedName);
        data.put("verification_status", riskScore < 20 ? "verified" : "suspicious");
        return new ShieldLayerResult("Verification Shield", true, Math.min(riskScore, 100), reasons, threats, data);
    }

    // ==================== LAYER 5: ML Intelligence Shield ====================
    private ShieldLayerResult layer5MlAnalysis(String upiId, double amount, Map<String, Object> userProfile,
                                               Map<String, Object> hardRulesData, ShieldLayerResult verification) {
        List<String> reasons = new ArrayList<>();
        List<ThreatType> threats = new ArrayList<>();
        Map<String, Object> mlScores = new LinkedHashMap<>();

        try {
            Map<String, Object> profile = userProfile == null ? Map.of() : userProfile;
            double avg = profile.get("avg_transaction_amount") instanceof Number n ? n.doubleValue() : 1000;
            LocalDateTime now = LocalDateTime.now();

            // Build transaction data for the ai-service risk pipeline (same keys as the Python shield)
            Map<String, Object> transactionData = new LinkedHashMap<>();
            transactionData.put("transaction_id", "shield-" + System.currentTimeMillis() / 1000.0);
            transactionData.put("recipient_upi", upiId);
            transactionData.put("amount", amount);
            transactionData.put("is_new_recipient",
                    !"verified".equals(verification.data.get("verification_status")));
            transactionData.put("hour_of_day", now.getHour());
            transactionData.put("day_of_week", now.getDayOfWeek().getValue() - 1); // Python weekday(): Monday=0
            transactionData.put("oldbalanceOrg", avg * 5);
            transactionData.put("newbalanceOrig", Math.max(avg * 5 - amount, 0));
            transactionData.put("oldbalanceDest", 0);
            transactionData.put("newbalanceDest", amount);

            Map<String, Object> recipientProfile = new LinkedHashMap<>();
            recipientProfile.put("trust_score", 50);
            recipientProfile.put("report_count", 0);
            recipientProfile.put("total_transactions", 0);
            recipientProfile.put("account_type", "unknown");

            RiskAssessmentResponse result = riskServiceClient.assess(
                    new RiskAssessmentRequest(transactionData, profile, recipientProfile));

            // The ai-service returns a single ensemble-style model score (0-1)
            double ensemble = result.risk_score() * 100;
            mlScores.put("primary_model", result.model_score() * 100);
            mlScores.put("versions", result.model_versions());

            double riskScore = Math.min(ensemble, 100);

            List<String> explanations = result.risk_factors();
            if (explanations != null && !explanations.isEmpty()) {
                reasons.addAll(explanations.subList(0, Math.min(3, explanations.size()))); // top 3 explanations
            }

            if (riskScore >= 70) {
                threats.add(ThreatType.ANOMALOUS_BEHAVIOR);
                reasons.add("🔴 Multiple ML models detected fraud patterns");
            } else if (riskScore >= 40) {
                reasons.add("⚠️ Some ML models flagged potential concerns");
            } else {
                reasons.add("✅ ML models found no significant fraud indicators");
            }

            Map<String, Object> data = new HashMap<>();
            data.put("ml_scores", mlScores);
            return new ShieldLayerResult("ML Intelligence Shield", true, riskScore, reasons, threats, data);

        } catch (Exception e) {
            // Fallback to simple heuristic if the risk service is unavailable — never fail the shield
            log.warn("ML inference failed, using fallback: {}", e.getMessage());

            double xgbScore = hardRulesData.get("scam_type") != null ? 75 : 15;
            mlScores.put("xgboost", xgbScore);
            mlScores.put("isolation_forest", 10.0);
            mlScores.put("lstm", 20.0);
            mlScores.put("gnn", 10.0);
            mlScores.put("sensor", 5.0);
            double riskScore = xgbScore * 0.35 + 10 * 0.25 + 20 * 0.15 + 10 * 0.15 + 5 * 0.10;
            reasons.add("⚠️ ML analysis using simplified mode");

            Map<String, Object> data = new HashMap<>();
            data.put("ml_scores", mlScores);
            return new ShieldLayerResult("ML Intelligence Shield", true, Math.min(riskScore, 100), reasons, threats, data);
        }
    }

    // ==================== LAYER 6: Community Intelligence ====================
    private ShieldLayerResult layer6Community(String upiId) {
        List<String> reasons = new ArrayList<>();
        List<ThreatType> threats = new ArrayList<>();
        long reportCount = 0;

        long counted = fraudReportRepository.countByScammerUpiEqualsIgnoreCase(upiId);
        if (counted > 0) {
            reportCount = counted;
            List<FraudReport> recent = fraudReportRepository.findTop3ByScammerUpiEqualsIgnoreCaseOrderByCreatedAtDesc(upiId);
            String scamType = "fraud";
            for (FraudReport report : recent) {
                if (report.getScamType() != null && !report.getScamType().isBlank()) {
                    scamType = report.getScamType();
                    break;
                }
            }

            if (reportCount >= 10) {
                reasons.add("🚫 BLOCKED: " + reportCount + " users reported this UPI for " + scamType);
                threats.add(ThreatType.COMMUNITY_REPORTS);
            } else if (reportCount >= 5) {
                reasons.add("🔴 HIGH RISK: " + reportCount + " fraud reports from other users");
                threats.add(ThreatType.COMMUNITY_REPORTS);
            } else {
                reasons.add("⚠️ CAUTION: " + reportCount + " user(s) reported issues with this UPI");
                threats.add(ThreatType.COMMUNITY_REPORTS);
            }
        }

        if (reasons.isEmpty()) {
            reasons.add("✅ No community reports against this UPI");
        }

        Map<String, Object> data = new HashMap<>();
        data.put("report_count", reportCount);
        return new ShieldLayerResult("Community Intelligence", reportCount < 10,
                reportCount >= 10 ? 100 : reportCount >= 5 ? 60 : reportCount >= 1 ? 30 : 0,
                reasons, threats, data);
    }

    // ==================== LAYER 7: Decision & Explanation ====================
    private ShieldLayerResult layer7Decision(List<ShieldLayerResult> allResults, boolean isBlocked) {
        double avgScore = allResults.stream().mapToDouble(r -> r.riskScore).average().orElse(0);

        List<String> reasons = new ArrayList<>();
        if (isBlocked) {
            reasons.add("🚫 PAYMENT BLOCKED - Critical security threat detected");
        } else if (avgScore > 75) {
            reasons.add("🔴 DANGEROUS - We strongly recommend NOT proceeding");
        } else if (avgScore > 50) {
            reasons.add("🟠 RISKY - Please verify the recipient before paying");
        } else if (avgScore > 25) {
            reasons.add("🟡 CAUTION - Double-check recipient details");
        } else {
            reasons.add("🟢 SAFE - Transaction looks secure");
        }

        Map<String, Object> data = new HashMap<>();
        data.put("average_score", avgScore);
        data.put("decision", isBlocked ? "blocked"
                : avgScore > 75 ? "dangerous"
                : avgScore > 50 ? "risky"
                : avgScore > 25 ? "caution" : "safe");
        return new ShieldLayerResult("Final Decision", !isBlocked && avgScore <= 75, avgScore, reasons, List.of(), data);
    }

    // ==================== Helpers ====================
    private static RiskLevel calculateRiskLevel(double score, boolean isBlocked) {
        if (isBlocked) {
            return RiskLevel.BLOCKED;
        } else if (score > 75) {
            return RiskLevel.DANGEROUS;
        } else if (score > 50) {
            return RiskLevel.RISKY;
        } else if (score > 25) {
            return RiskLevel.CAUTION;
        }
        return RiskLevel.SAFE;
    }

    static List<String> generateSafetyTips(String scamType) {
        List<String> baseTips = new ArrayList<>(List.of(
                "Never share OTP, PIN, or password with anyone",
                "Banks never ask you to download apps or share screen"));

        List<String> scamTips = switch (scamType == null ? "" : scamType) {
            case "lottery" -> List.of(
                    "💡 You can't win a lottery you never entered",
                    "💡 Real lotteries never ask for 'processing fees'",
                    "💡 If they say 'pay tax to claim prize' - it's a scam");
            case "kyc_fraud" -> List.of(
                    "💡 Banks update KYC through official branch or app, never via calls",
                    "💡 No bank will block your account for not updating KYC immediately",
                    "💡 Never click links in SMS claiming 'KYC update required'");
            case "digital_arrest" -> List.of(
                    "💡 Police/CBI NEVER arrest via video call",
                    "💡 No government agency asks for money to 'clear your name'",
                    "💡 Call 1930 (Cyber Crime) if someone threatens arrest over phone");
            case "refund_scam" -> List.of(
                    "💡 Real refunds are automatic - you never need to 'approve' them",
                    "💡 If someone asks you to enter amount to 'receive' refund - it's a scam",
                    "💡 Refunds don't require you to scan QR codes");
            case "fake_support" -> List.of(
                    "💡 Real customer support never asks for remote access (AnyDesk/TeamViewer)",
                    "💡 Never call numbers from Google search - scammers pay for top results",
                    "💡 Always use support numbers from official app/website only");
            default -> List.of();
        };

        List<String> tips = new ArrayList<>(scamTips);
        tips.addAll(baseTips);
        return tips.subList(0, Math.min(5, tips.size())); // top 5 tips
    }

    /** Python's `".".join(title-case)` naming: split/@/_, capitalize words. */
    static String displayName(String upiId) {
        String local = upiId == null ? "" : upiId.split("@")[0]
                .replace(".", " ")
                .replace("_", " ");
        StringBuilder titled = new StringBuilder();
        boolean upperNext = true;
        for (char c : local.toCharArray()) {
            if (upperNext && Character.isLetter(c)) {
                titled.append(Character.toUpperCase(c));
                upperNext = false;
            } else {
                titled.append(c);
                if (!Character.isLetter(c)) {
                    upperNext = true; // digits/spaces act as word boundaries like str.title()
                }
            }
        }
        return titled.toString();
    }

    private static boolean isUpper(String value) {
        boolean hasCased = false;
        for (char c : value.toCharArray()) {
            if (Character.isLetter(c)) {
                hasCased = true;
                if (!Character.isUpperCase(c)) {
                    return false;
                }
            }
        }
        return hasCased;
    }

    private static int intData(Map<String, Object> data, String key) {
        return data.get(key) instanceof Number n ? n.intValue() : 0;
    }

    private static String stringData(Map<String, Object> data, String key) {
        Object value = data.get(key);
        return value instanceof String s && !s.isEmpty() ? s : null;
    }

    private static String md5Hex(String input) {
        try {
            byte[] digest = MessageDigest.getInstance("MD5").digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(32);
            for (byte b : digest) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (Exception e) {
            return UUID.randomUUID().toString().replace("-", ""); // unreachable fallback
        }
    }
}
