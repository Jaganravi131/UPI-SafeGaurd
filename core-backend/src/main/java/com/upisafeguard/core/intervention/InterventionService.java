package com.upisafeguard.core.intervention;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.upisafeguard.core.cache.CacheService;

/**
 * In-memory port of backend/app/services/ai_intervention_service.py — the AI
 * agentic intervention engine: risk thresholds, reason identification,
 * contextual warnings, verification challenges and resolution rules. All
 * response payloads mirror the FastAPI shapes exactly (snake_case, same keys).
 */
@Component
public class InterventionService {

    // ── Level thresholds (risk_score is a 0..1 float) ────────────────────
    public static final double THRESHOLD_NONE = 0.30;
    public static final double THRESHOLD_ADVISORY = 0.50;
    public static final double THRESHOLD_WARNING = 0.70;
    public static final double THRESHOLD_BLOCKING = 0.90;

    private static final Map<String, String> EDUCATIONAL_TIPS = Map.of(
            "fake_merchant",
            "🎓 Real customer care will NEVER ask for your PIN, OTP, or UPI PIN. Banks already have your account details!",
            "lottery_scam",
            "🎓 You cannot win a lottery you never entered. Prize announcements asking for fees are always scams!",
            "investment_scam",
            "🎓 Returns above 15% are unrealistic. If it sounds too good to be true, it definitely is!",
            "call_scam",
            "🎓 Making payments while on call with strangers is the #1 fraud pattern. Hang up first, think later!",
            "known_scammer",
            "🎓 This UPI ID has been reported by multiple victims. There's a 99% chance this is a scam.",
            "new_recipient_high",
            "🎓 Large first-time transfers are high-risk. Consider sending a small test amount first.");

    private static final Map<String, String> SCAM_EXAMPLES = Map.of(
            "call_active",
            "Recent case: A victim lost ₹2.5 lakh while on a call with someone posing as a bank official who kept them distracted.",
            "known_scammer",
            "This UPI ID was involved in 23 fraud reports totaling ₹8.4 lakh stolen from victims.",
            "high_amount_new",
            "Common pattern: Scammers request large amounts claiming urgency. 78% of frauds involve amounts > ₹10,000.");

    /** intervention_id → serialised intervention. Redis hash when the cache
     * driver is redis (visible across replicas), memory-local otherwise. */
    private static final String ACTIVE_KEY = "upi:interventions:active";

    private final CacheService cache;
    private final ObjectMapper mapper;

    public InterventionService(CacheService cache, ObjectMapper mapper) {
        this.cache = cache;
        this.mapper = mapper;
    }

    public boolean isKnownIntervention(String interventionId) {
        return cache.hget(ACTIVE_KEY, interventionId).isPresent();
    }

    public int activeCount() {
        return cache.hgetall(ACTIVE_KEY).size();
    }

    // ── Level determination ──────────────────────────────────────────────

    public String determineInterventionLevel(double riskScore) {
        if (riskScore < THRESHOLD_NONE) {
            return "none";
        } else if (riskScore < THRESHOLD_ADVISORY) {
            return "advisory";
        } else if (riskScore < THRESHOLD_WARNING) {
            return "warning";
        } else if (riskScore < THRESHOLD_BLOCKING) {
            return "blocking";
        }
        return "critical";
    }

    // ── Reason identification ────────────────────────────────────────────

    public List<String> identifyReasons(Map<String, Object> riskFactors, Map<String, Object> transactionData) {
        List<String> reasons = new ArrayList<>();

        if (truthy(riskFactors.get("is_known_scammer"))) {
            reasons.add("known_scammer");
        }
        if (number(riskFactors.get("network_fraud_score")) > 0.5) {
            reasons.add("network_fraud");
        }
        if (truthy(transactionData.get("call_active"))) {
            reasons.add("call_active");
        }
        if (number(riskFactors.get("stress_score")) > 0.6) {
            reasons.add("stress_detected");
        }
        if (number(riskFactors.get("behavioral_anomaly_score")) > 0.5) {
            reasons.add("behavioral_anomaly");
        }
        if (truthy(transactionData.get("is_new_recipient")) && number(transactionData.get("amount")) > 5000) {
            reasons.add("new_recipient");
        }
        if (number(transactionData.get("amount")) > 10000) {
            reasons.add("high_amount");
        }
        if (truthy(riskFactors.get("unusual_time"))) {
            reasons.add("unusual_time");
        }
        if (truthy(riskFactors.get("velocity_breach"))) {
            reasons.add("velocity_breach");
        }
        if (number(riskFactors.get("pattern_match_score")) > 0.6) {
            reasons.add("pattern_match");
        }

        return reasons.isEmpty() ? List.of("behavioral_anomaly") : reasons;
    }

    // ── Agent message & reasoning ────────────────────────────────────────

    public String[] generateAgentMessage(String level, List<String> reasons, double amount, String recipient) {
        String message;
        String reasoning;

        if (reasons.contains("known_scammer")) {
            message = "🚨 STOP! This UPI ID (" + recipient + ") has been reported as a scammer by multiple users.";
            reasoning = "Pattern match against community fraud database found multiple verified reports.";
        } else if (reasons.contains("call_active")) {
            message = "⚠️ I notice you're on a call. Making payments while speaking to strangers is very risky!";
            reasoning = "Active phone call detected during transaction. 78% of UPI frauds involve call-based social engineering.";
        } else if (reasons.contains("stress_detected")) {
            message = "🧘 Take a deep breath. I detected signs of stress or urgency. Scammers often create panic.";
            reasoning = "Device sensors indicate elevated stress patterns. Coerced transactions show similar signatures.";
        } else if (reasons.contains("network_fraud")) {
            message = "🔍 This recipient is connected to a network flagged for suspicious activity.";
            reasoning = "Graph neural network analysis shows connections to flagged fraud nodes.";
        } else if (reasons.contains("high_amount") && reasons.contains("new_recipient")) {
            message = "💰 You're sending ₹" + formatAmount(amount) + " to someone you've never paid before. Are you sure?";
            reasoning = "First transaction to new recipient with amount 3x above user's typical pattern.";
        } else if ("advisory".equals(level)) {
            message = "📋 Quick check: Please confirm this transaction is something you intended.";
            reasoning = "Low-medium risk indicators detected. Soft confirmation recommended.";
        } else {
            message = "⚡ This transaction has some risk indicators. Let me help you verify it's safe.";
            reasoning = "Aggregated risk score of " + reasons.size() + " factors suggests verification needed.";
        }

        return new String[]{message, reasoning};
    }

    // ── Actions ──────────────────────────────────────────────────────────

    public List<Map<String, Object>> generateActions(String level, List<String> reasons) {
        List<Map<String, Object>> actions = new ArrayList<>();

        if (!"none".equals(level)) {
            actions.add(action("show_warning", 1, "Display risk warning to user"));
        }
        if ("warning".equals(level) || "blocking".equals(level) || "critical".equals(level)) {
            actions.add(action("require_verification", 2, "User must complete verification challenge"));
        }
        if ("blocking".equals(level) || "critical".equals(level)) {
            actions.add(action("block_transaction", 3, "Transaction blocked pending verification"));
        }
        if ("critical".equals(level) || reasons.contains("known_scammer")) {
            actions.add(action("notify_guardian", 4, "Alert guardian/family member about high-risk transaction"));
        }
        actions.add(action("educational_tip", 5, "Show relevant fraud awareness tip"));

        return actions;
    }

    // ── Verification challenges ──────────────────────────────────────────

    public List<Map<String, Object>> generateChallenges(String level, List<String> reasons, String recipient, double amount) {
        List<Map<String, Object>> challenges = new ArrayList<>();

        if ("advisory".equals(level)) {
            challenges.add(challenge("simple_confirm",
                    "Are you sure you want to send ₹" + formatAmount(amount) + " to " + recipient + "?",
                    List.of("Yes, I'm sure", "No, cancel this"),
                    "Yes, I'm sure", 30, 5));
        } else if ("warning".equals(level)) {
            challenges.add(challenge("risk_acknowledge",
                    "I understand this transaction has fraud indicators and I want to proceed at my own risk.",
                    List.of("I understand and accept", "Let me reconsider"),
                    "I understand and accept", 45, 10));
            if (reasons.contains("call_active")) {
                challenges.add(challenge("wait_period",
                        "Please end your phone call and wait 60 seconds before proceeding. This cooling period helps prevent impulsive fraud decisions.",
                        null, null, 60, 15));
            }
        } else if ("blocking".equals(level) || "critical".equals(level)) {
            challenges.add(challenge("security_question",
                    "Which of these is a sign of UPI fraud?",
                    List.of(
                            "Someone asking for OTP over phone",
                            "Making payment at a known shop",
                            "Receiving money from family",
                            "Paying electricity bill"),
                    "Someone asking for OTP over phone", 60, 20));
            if ("critical".equals(level)) {
                challenges.add(challenge("guardian_approval",
                        "This transaction requires approval from your guardian. A notification has been sent.",
                        null, null, 300, 25));
            }
        }

        return challenges;
    }

    // ── Educational content ──────────────────────────────────────────────

    public String[] getEducationalContent(List<String> reasons) {
        if (reasons.contains("known_scammer")) {
            return new String[]{EDUCATIONAL_TIPS.get("known_scammer"), SCAM_EXAMPLES.get("known_scammer")};
        }
        if (reasons.contains("call_active")) {
            return new String[]{EDUCATIONAL_TIPS.get("call_scam"), SCAM_EXAMPLES.get("call_active")};
        }
        if (reasons.contains("new_recipient") && reasons.contains("high_amount")) {
            return new String[]{EDUCATIONAL_TIPS.get("new_recipient_high"), SCAM_EXAMPLES.get("high_amount_new")};
        }
        if (reasons.contains("stress_detected")) {
            return new String[]{"🎓 Scammers create urgency and panic. If someone is rushing you, that's a red flag!", null};
        }
        return new String[]{null, null};
    }

    // ── Main entry points ────────────────────────────────────────────────

    /** Decision whether intervention is needed. Returns null when not. */
    public Map<String, Object> analyzeAndIntervene(
            String transactionId, String userId, double riskScore,
            Map<String, Object> riskFactors, Map<String, Object> transactionData) {

        String level = determineInterventionLevel(riskScore);
        if ("none".equals(level)) {
            return null;
        }

        List<String> reasons = identifyReasons(riskFactors, transactionData);

        double amount = transactionData.get("amount") instanceof Number n ? n.doubleValue() : number(transactionData.get("amount"));
        String recipient = transactionData.get("recipient_upi") != null
                ? String.valueOf(transactionData.get("recipient_upi"))
                : "Unknown";
        String[] message = generateAgentMessage(level, reasons, amount, recipient);
        List<Map<String, Object>> actions = generateActions(level, reasons);
        List<Map<String, Object>> challenges = generateChallenges(level, reasons, recipient, amount);
        String[] education = getEducationalContent(reasons);

        Map<String, Object> intervention = new LinkedHashMap<>();
        intervention.put("intervention_id", UUID.randomUUID().toString());
        intervention.put("transaction_id", transactionId);
        intervention.put("user_id", userId);
        intervention.put("timestamp", Instant.now().toString());
        intervention.put("risk_score", riskScore);
        intervention.put("intervention_level", level);
        intervention.put("reasons", reasons);
        intervention.put("agent_message", message[0]);
        intervention.put("agent_reasoning", message[1]);
        intervention.put("confidence", Math.min(0.95, riskScore + 0.1));
        intervention.put("actions", actions);
        intervention.put("challenges", challenges);
        intervention.put("requires_user_action",
                "warning".equals(level) || "blocking".equals(level) || "critical".equals(level));
        intervention.put("can_override", !"critical".equals(level));
        intervention.put("override_requires_guardian", "blocking".equals(level));
        intervention.put("auto_decline_after_seconds", "critical".equals(level) ? 300 : null);
        intervention.put("educational_tip", education[0]);
        intervention.put("scam_example", education[1]);

        store(intervention);
        return intervention;
    }

    public Map<String, Object> resolveIntervention(
            String interventionId, Map<String, String> userResponses, boolean guardianApproved) {
        Map<String, Object> intervention = takeStored(interventionId);
        if (intervention == null) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("success", false);
            error.put("error", "Intervention not found");
            return error;
        }

        boolean allPassed = true;
        int points = 0;
        for (Map<String, Object> challenge : castList(intervention.get("challenges"))) {
            String type = (String) challenge.get("type");
            if ("guardian_approval".equals(type)) {
                if (!guardianApproved) {
                    allPassed = false;
                    break;
                }
            } else {
                String correct = (String) challenge.get("correct_answer");
                if (correct != null) {
                    String answer = userResponses == null ? null : userResponses.get((String) challenge.get("id"));
                    if (answer == null || !answer.equals(correct)) {
                        allPassed = false;
                        break;
                    }
                }
            }
            points += challenge.get("points_reward") instanceof Number n ? n.intValue() : 0;
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("transaction_allowed", allPassed);
        result.put("intervention_level", intervention.get("intervention_level"));
        result.put("points_earned", allPassed ? points : 0);
        return result;
    }

    public Map<String, Object> cancelIntervention(String interventionId) {
        if (takeStored(interventionId) != null) {
            Map<String, Object> ok = new LinkedHashMap<>();
            ok.put("success", true);
            ok.put("message", "Intervention cancelled, transaction aborted");
            ok.put("points_earned", 10);
            return ok;
        }
        Map<String, Object> missing = new LinkedHashMap<>();
        missing.put("success", false);
        missing.put("error", "Intervention not found or already resolved");
        return missing;
    }

    public List<Map<String, Object>> activeForUser(String userId) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (String stored : cache.hgetall(ACTIVE_KEY).values()) {
            Map<String, Object> intervention = fromJson(stored);
            if (intervention != null
                    && userId != null && userId.equals(intervention.get("user_id"))) {
                result.add(intervention);
            }
        }
        return result;
    }

    // ── Registry storage helpers ─────────────────────────────────────────

    private void store(Map<String, Object> intervention) {
        String id = String.valueOf(intervention.get("intervention_id"));
        cache.hput(ACTIVE_KEY, id, toJson(intervention));
    }

    /** HGET + HDEL; single-use semantics for resolve/cancel. */
    private Map<String, Object> takeStored(String interventionId) {
        Optional<String> stored = cache.hget(ACTIVE_KEY, interventionId);
        if (stored.isEmpty()) {
            return null;
        }
        cache.hdelete(ACTIVE_KEY, interventionId);
        return fromJson(stored.get());
    }

    private String toJson(Map<String, Object> intervention) {
        try {
            return mapper.writeValueAsString(intervention);
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to serialise intervention", exception);
        }
    }

    private Map<String, Object> fromJson(String stored) {
        try {
            // JSON round-trip can turn any element into Map/List — re-cast lists.
            return mapper.readValue(stored, new TypeReference<LinkedHashMap<String, Object>>() { });
        } catch (Exception exception) {
            return null;
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private Map<String, Object> action(String actionType, int priority, String message) {
        Map<String, Object> action = new LinkedHashMap<>();
        action.put("action_type", actionType);
        action.put("priority", priority);
        action.put("message", message);
        action.put("details", null);
        return action;
    }

    private Map<String, Object> challenge(String type, String question, List<String> options,
                                          String correctAnswer, int timeoutSeconds, int pointsReward) {
        Map<String, Object> challenge = new LinkedHashMap<>();
        challenge.put("id", UUID.randomUUID().toString());
        challenge.put("type", type);
        challenge.put("question", question);
        challenge.put("options", options);
        challenge.put("correct_answer", correctAnswer);
        challenge.put("timeout_seconds", timeoutSeconds);
        challenge.put("points_reward", pointsReward);
        return challenge;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> castList(Object value) {
        return value instanceof List ? (List<Map<String, Object>>) value : List.of();
    }

    private static boolean truthy(Object value) {
        if (value instanceof Boolean b) {
            return b;
        }
        if (value instanceof Number n) {
            return n.doubleValue() != 0.0;
        }
        if (value instanceof String s) {
            return !s.isBlank();
        }
        return false;
    }

    private static double number(Object value) {
        if (value instanceof Number n) {
            return n.doubleValue();
        }
        return 0.0;
    }

    private static String formatAmount(double amount) {
        return BigDecimal.valueOf(amount).setScale(0, RoundingMode.DOWN)
                .toPlainString();
    }
}
