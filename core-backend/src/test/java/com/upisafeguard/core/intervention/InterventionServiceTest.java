package com.upisafeguard.core.intervention;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.upisafeguard.core.cache.InMemoryCacheService;

/**
 * 1:1 contract tests against the Python agent algorithm in
 * backend/app/services/ai_intervention_service.py.
 */
class InterventionServiceTest {

    private final InterventionService service = new InterventionService(
            new InMemoryCacheService(), new ObjectMapper());

    @Test
    void levelBoundariesMatchPythonThresholds() {
        assertThat(service.determineInterventionLevel(0.29)).isEqualTo("none");
        assertThat(service.determineInterventionLevel(0.30)).isEqualTo("advisory");
        assertThat(service.determineInterventionLevel(0.49)).isEqualTo("advisory");
        assertThat(service.determineInterventionLevel(0.50)).isEqualTo("warning");
        assertThat(service.determineInterventionLevel(0.69)).isEqualTo("warning");
        assertThat(service.determineInterventionLevel(0.70)).isEqualTo("blocking");
        assertThat(service.determineInterventionLevel(0.89)).isEqualTo("blocking");
        assertThat(service.determineInterventionLevel(0.90)).isEqualTo("critical");
        assertThat(service.determineInterventionLevel(1.00)).isEqualTo("critical");
    }

    @Test
    void reasonIdentificationPriorityAndFallback() {
        Map<String, Object> riskFactors = new HashMap<>();
        Map<String, Object> txn = new HashMap<>();
        txn.put("amount", 0);

        // Empty factors → single behavioral_anomaly fallback
        assertThat(service.identifyReasons(riskFactors, txn))
                .containsExactly("behavioral_anomaly");

        // All-detector branches
        riskFactors.put("is_known_scammer", true);
        riskFactors.put("network_fraud_score", 0.7);
        txn.put("call_active", true);
        riskFactors.put("stress_score", 0.7);
        riskFactors.put("behavioral_anomaly_score", 0.6);
        txn.put("is_new_recipient", true);
        riskFactors.put("unusual_time", true);
        riskFactors.put("velocity_breach", true);
        riskFactors.put("pattern_match_score", 0.7);
        txn.put("amount", 11000);

        assertThat(service.identifyReasons(riskFactors, txn)).containsExactly(
                "known_scammer", "network_fraud", "call_active", "stress_detected",
                "behavioral_anomaly", "new_recipient", "high_amount", "unusual_time",
                "velocity_breach", "pattern_match");
    }

    @Test
    void lowRiskCheckProducesNoIntervention() {
        Map<String, Object> intervention = service.analyzeAndIntervene(
                "txn-1", "user-1", 0.1, Map.of(), Map.of("amount", 500));
        assertThat(intervention).isNull();
        assertThat(service.activeCount()).isEqualTo(0);
    }

    @Test
    void criticalKnownScammerInterventionShape() {
        Map<String, Object> riskFactors = Map.of("is_known_scammer", true);
        Map<String, Object> txn = Map.of("amount", 9000.0, "recipient_upi", "bad@upi");
        Map<String, Object> intervention = service.analyzeAndIntervene(
                "txn-2", "user-1", 0.95, riskFactors, txn);

        assertThat(intervention).isNotNull();
        assertThat(intervention.get("intervention_level")).isEqualTo("critical");
        assertThat((String) intervention.get("agent_message")).contains("STOP!", "bad@upi");
        assertThat(intervention.get("reasons").toString()).contains("known_scammer");
        // actions: nonelevel warning→verification→block→guardian→tip, no show_warning skipped
        List<Map<String, Object>> actions = asMaps(intervention.get("actions"));
        assertThat(actions).extracting(a -> a.get("action_type"))
                .containsExactly("show_warning", "require_verification",
                        "block_transaction", "notify_guardian", "educational_tip");
        List<Map<String, Object>> challenges = asMaps(intervention.get("challenges"));
        assertThat(challenges).extracting(c -> c.get("type"))
                .containsExactly("security_question", "guardian_approval");
        assertThat(intervention.get("requires_user_action")).isEqualTo(true);
        assertThat(intervention.get("can_override")).isEqualTo(false);
        assertThat(intervention.get("override_requires_guardian")).isEqualTo(false);
        assertThat(intervention.get("auto_decline_after_seconds")).isEqualTo(300);
        assertThat((String) intervention.get("educational_tip")).contains("99% chance");
        // active registry + per-user lookup
        assertThat(service.activeCount()).isEqualTo(1);
        assertThat(service.activeForUser("user-1")).hasSize(1);
        assertThat(service.activeForUser("someone-else")).isEmpty();
    }

    @Test
    void blockingLevelRequiresOverrideGuardian() {
        Map<String, Object> intervention = service.analyzeAndIntervene(
                "txn-3", "user-2", 0.8, Map.of(), Map.of("amount", 500));
        assertThat(intervention.get("intervention_level")).isEqualTo("blocking");
        assertThat(intervention.get("override_requires_guardian")).isEqualTo(true);
        assertThat(intervention.get("can_override")).isEqualTo(true);
        assertThat(intervention.get("auto_decline_after_seconds")).isNull();
    }

    @Test
    void warningWithCallActiveAddsWaitPeriodChallenge() {
        Map<String, Object> riskFactors = new HashMap<>();
        riskFactors.put("stress_score", 0.7);
        Map<String, Object> txn = new HashMap<>();
        txn.put("amount", 500);
        txn.put("call_active", true);
        Map<String, Object> intervention = service.analyzeAndIntervene(
                "txn-4", "user-1", 0.55, riskFactors, txn);

        assertThat(intervention.get("intervention_level")).isEqualTo("warning");
        List<Map<String, Object>> challenges = asMaps(intervention.get("challenges"));
        assertThat(challenges).extracting(c -> c.get("type"))
                .containsExactly("risk_acknowledge", "wait_period");
    }

    @Test
    void resolvePassesOnlyWhenAllChallengesAnsweredCorrectly() {
        Map<String, Object> intervention = service.analyzeAndIntervene(
                "txn-5", "user-1", 0.75, Map.of(), Map.of("amount", 500));
        String id = (String) intervention.get("intervention_id");
        List<Map<String, Object>> challenges = asMaps(intervention.get("challenges"));
        String correctAnswer = (String) challenges.get(0).get("correct_answer");
        String challengeId = (String) challenges.get(0).get("id");

        // Wrong answer → blocked, no points
        Map<String, Object> failure = service.resolveIntervention(
                id, Map.of(challengeId, "wrong answer"), false);
        assertThat(failure.get("success")).isEqualTo(true);
        assertThat(failure.get("transaction_allowed")).isEqualTo(false);
        assertThat(failure.get("points_earned")).isEqualTo(0);
        // consumed from the active registry even on failure
        assertThat(service.activeCount()).isEqualTo(0);

        // Re-run with a correct answer on a fresh intervention
        service.analyzeAndIntervene("txn-6", "user-1", 0.75, Map.of(), Map.of("amount", 500));
        Map<String, Object> intervention2 = List.copyOf(service.activeForUser("user-1"))
                .get(0);
        List<Map<String, Object>> challenges2 = asMaps(intervention2.get("challenges"));
        Map<String, Object> success = service.resolveIntervention(
                (String) intervention2.get("intervention_id"),
                Map.of((String) challenges2.get(0).get("id"),
                        (String) challenges2.get(0).get("correct_answer")),
                false);
        assertThat(success.get("transaction_allowed")).isEqualTo(true);
        assertThat((int) success.get("points_earned")).isEqualTo(20);
        assertThat(success.get("intervention_level")).isEqualTo("blocking");
    }

    @Test
    void criticalResolveRequiresGuardianApproval() {
        Map<String, Object> intervention = service.analyzeAndIntervene(
                "txn-7", "user-1", 0.95, Map.of("is_known_scammer", true),
                Map.of("amount", 500));
        String id = (String) intervention.get("intervention_id");
        List<Map<String, Object>> challenges = asMaps(intervention.get("challenges"));

        // Security question answered, but no guardian approval → denied
        Map<String, Object> withoutGuardian = service.resolveIntervention(
                id,
                Map.of((String) challenges.get(0).get("id"), "Someone asking for OTP over phone"),
                false);
        assertThat(withoutGuardian.get("transaction_allowed")).isEqualTo(false);

        // With guardian approval → allowed, points include guardian approval's 25
        service.analyzeAndIntervene("txn-8", "user-1", 0.95, Map.of("is_known_scammer", true),
                Map.of("amount", 500));
        Map<String, Object> fresh = List.copyOf(service.activeForUser("user-1")).get(0);
        List<Map<String, Object>> freshChallenges = asMaps(fresh.get("challenges"));
        Map<String, Object> withGuardian = service.resolveIntervention(
                (String) fresh.get("intervention_id"),
                Map.of((String) freshChallenges.get(0).get("id"), "Someone asking for OTP over phone"),
                true);
        assertThat(withGuardian.get("transaction_allowed")).isEqualTo(true);
        assertThat((int) withGuardian.get("points_earned")).isEqualTo(45);
    }

    @Test
    void resolveUnknownInterventionReturnsError() {
        Map<String, Object> result = service.resolveIntervention("nope", Map.of(), false);
        assertThat(result.get("success")).isEqualTo(false);
        assertThat(result.get("error")).isEqualTo("Intervention not found");
    }

    @Test
    void cancelEarnsTenPointsAndRemovesIntervention() {
        Map<String, Object> intervention = service.analyzeAndIntervene(
                "txn-9", "user-1", 0.75, Map.of(), Map.of("amount", 500));
        String id = (String) intervention.get("intervention_id");

        Map<String, Object> cancelled = service.cancelIntervention(id);
        assertThat(cancelled.get("success")).isEqualTo(true);
        assertThat((int) cancelled.get("points_earned")).isEqualTo(10);
        assertThat(service.activeCount()).isEqualTo(0);

        Map<String, Object> again = service.cancelIntervention(id);
        assertThat(again.get("success")).isEqualTo(false);
        assertThat(again.get("error")).isEqualTo("Intervention not found or already resolved");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> asMaps(Object value) {
        return (List<Map<String, Object>>) value;
    }
}
