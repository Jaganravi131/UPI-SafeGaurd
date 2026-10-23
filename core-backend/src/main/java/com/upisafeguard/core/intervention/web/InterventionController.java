package com.upisafeguard.core.intervention.web;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.upisafeguard.core.events.DomainEventPublisher;
import com.upisafeguard.core.events.EventPublisherConfig;
import com.upisafeguard.core.events.EventTopics;
import com.upisafeguard.core.intervention.InterventionService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.annotation.JsonAlias;

/**
 * AI intervention endpoints. Response shapes mirror
 * backend/app/api/routes/intervention.py exactly. The Python WebSocket
 * (/intervention/ws/{user_id}) is intentionally not ported — the REST
 * surface the frontend uses today is complete.
 */
@RestController
@RequestMapping("/api/v1/intervention")
public class InterventionController {

    private static final Map<String, String> LEVEL_DESCRIPTIONS = Map.of(
            "none", "No intervention (safe transaction)",
            "advisory", "Soft warning displayed",
            "warning", "Strong warning + verification required",
            "blocking", "Transaction blocked until verification",
            "critical", "Full block + guardian notification");

    private final InterventionService interventionService;
    private final com.upisafeguard.core.events.DomainEventPublisher events;

    @Autowired
    public InterventionController(InterventionService interventionService, DomainEventPublisher events) {
        this.interventionService = interventionService;
        this.events = events;
    }

    @PostMapping("/check")
    public ResponseEntity<?> check(@Valid @RequestBody CheckRequest request) {
        Map<String, Object> intervention = interventionService.analyzeAndIntervene(
                request.getTransactionId(),
                request.getUserId(),
                request.getRiskScore(),
                request.getRiskFactors(),
                request.getTransactionData());

        if (intervention != null) {
            // Event fanout: alerting/analytics subscribers react asynchronously.
            events.publish(com.upisafeguard.core.events.EventTopics.INTERVENTION_RAISED,
                    request.getUserId(),
                    com.upisafeguard.core.events.EventPublisherConfig.envelope("INTERVENTION_RAISED", java.util.Map.of(
                            "intervention_id", String.valueOf(intervention.get("intervention_id")),
                            "user_id", request.getUserId(),
                            "transaction_id", request.getTransactionId(),
                            "intervention_level", String.valueOf(intervention.get("intervention_level")),
                            "risk_score", request.getRiskScore() == null ? 0.0 : request.getRiskScore())));
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("intervention_required", true);
            body.put("intervention", intervention);
            return ResponseEntity.ok(body);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("intervention_required", false);
        body.put("message", "Transaction can proceed");
        return ResponseEntity.ok(body);
    }

    @PostMapping("/resolve")
    public ResponseEntity<?> resolve(@Valid @RequestBody ResolveRequest request) {
        Map<String, String> responses = new LinkedHashMap<>();
        if (request.getChallengeResponses() != null) {
            for (ChallengeResponseDto response : request.getChallengeResponses()) {
                responses.put(response.getChallengeId(), response.getAnswer());
            }
        }
        return ResponseEntity.ok(interventionService.resolveIntervention(
                request.getInterventionId(),
                responses,
                Boolean.TRUE.equals(request.getGuardianApproved())));
    }

    @GetMapping("/active/{userId}")
    public ResponseEntity<?> active(@PathVariable String userId) {
        List<Map<String, Object>> interventions = interventionService.activeForUser(userId);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("count", interventions.size());
        body.put("interventions", interventions);
        return ResponseEntity.ok(body);
    }

    @DeleteMapping("/cancel/{interventionId}")
    public ResponseEntity<?> cancel(@PathVariable String interventionId) {
        return ResponseEntity.ok(interventionService.cancelIntervention(interventionId));
    }

    @GetMapping("/thresholds")
    public ResponseEntity<?> thresholds() {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("none", 0.30);
        values.put("advisory", 0.50);
        values.put("warning", 0.70);
        values.put("blocking", 0.90);
        values.put("critical", 1.00);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("thresholds", values);
        body.put("levels", LEVEL_DESCRIPTIONS);
        return ResponseEntity.ok(body);
    }

    @GetMapping("/stats")
    public ResponseEntity<?> stats() {
        Map<String, Object> today = new LinkedHashMap<>();
        today.put("total_interventions", 127);
        today.put("advisory", 78);
        today.put("warning", 34);
        today.put("blocking", 12);
        today.put("critical", 3);

        Map<String, Object> outcomes = new LinkedHashMap<>();
        outcomes.put("transactions_blocked", 45);
        outcomes.put("user_proceeded", 67);
        outcomes.put("user_cancelled", 15);
        outcomes.put("frauds_prevented", 12);
        outcomes.put("amount_saved", 425000);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("active_interventions", interventionService.activeCount());
        body.put("today", today);
        body.put("outcomes", outcomes);
        return ResponseEntity.ok(body);
    }

    // ── Request DTOs (FastAPI schemas in intervention.py) ────────────────

    public static class CheckRequest {
        @NotBlank
        @JsonAlias({"transaction_id"})
        private String transactionId;
        @NotBlank
        @JsonAlias({"user_id"})
        private String userId;
        @NotNull
        @JsonAlias({"risk_score"})
        private Double riskScore;
        @JsonAlias({"risk_factors"})
        private Map<String, Object> riskFactors;
        @JsonAlias({"transaction_data"})
        private Map<String, Object> transactionData;

        public String getTransactionId() { return transactionId; }
        public void setTransactionId(String transactionId) { this.transactionId = transactionId; }
        public String getUserId() { return userId; }
        public void setUserId(String userId) { this.userId = userId; }
        public Double getRiskScore() { return riskScore; }
        public void setRiskScore(Double riskScore) { this.riskScore = riskScore; }
        public Map<String, Object> getRiskFactors() { return riskFactors; }
        public void setRiskFactors(Map<String, Object> riskFactors) { this.riskFactors = riskFactors; }
        public Map<String, Object> getTransactionData() { return transactionData; }
        public void setTransactionData(Map<String, Object> transactionData) { this.transactionData = transactionData; }
    }

    public static class ChallengeResponseDto {
        @NotBlank
        @JsonAlias({"challenge_id"})
        private String challengeId;
        private String answer;

        public String getChallengeId() { return challengeId; }
        public void setChallengeId(String challengeId) { this.challengeId = challengeId; }
        public String getAnswer() { return answer; }
        public void setAnswer(String answer) { this.answer = answer; }
    }

    public static class ResolveRequest {
        @NotBlank
        @JsonAlias({"intervention_id"})
        private String interventionId;
        @JsonAlias({"challenge_responses"})
        private List<ChallengeResponseDto> challengeResponses;
        @JsonAlias({"guardian_approved"})
        private Boolean guardianApproved;

        public String getInterventionId() { return interventionId; }
        public void setInterventionId(String interventionId) { this.interventionId = interventionId; }
        public List<ChallengeResponseDto> getChallengeResponses() { return challengeResponses; }
        public void setChallengeResponses(List<ChallengeResponseDto> challengeResponses) {
            this.challengeResponses = challengeResponses;
        }
        public Boolean getGuardianApproved() { return guardianApproved; }
        public void setGuardianApproved(Boolean guardianApproved) { this.guardianApproved = guardianApproved; }
    }
}
