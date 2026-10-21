package com.upisafeguard.core.risk;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.Map;

public record RiskAssessmentResponse(
        @JsonProperty("service_version")
        String service_version,
        @JsonProperty("engine_version")
        String engine_version,
        @JsonProperty("transaction_id")
        String transaction_id,
        @JsonProperty("risk_level")
        String risk_level,
        @JsonProperty("risk_score")
        double risk_score,
        @JsonProperty("recommended_action")
        String recommended_action,
        @JsonProperty("require_guardian_approval")
        boolean require_guardian_approval,
        @JsonProperty("risk_factors")
        List<String> risk_factors,
        double confidence,
        @JsonProperty("model_score")
        double model_score,
        @JsonProperty("rules_applied")
        List<String> rules_applied,
        @JsonProperty("model_versions")
        Map<String, String> model_versions,
        Map<String, Object> details,
        @JsonProperty("assessment_token")
        String assessment_token,
        @JsonProperty("assessment_expires_at")
        String assessment_expires_at
) {
}
