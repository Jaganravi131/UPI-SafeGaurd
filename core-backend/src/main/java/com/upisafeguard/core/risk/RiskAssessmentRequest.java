package com.upisafeguard.core.risk;

import java.util.Map;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

public record RiskAssessmentRequest(
        @NotNull @NotEmpty Map<String, Object> transaction,
        @NotNull @NotEmpty Map<String, Object> userProfile,
        @NotNull @NotEmpty Map<String, Object> recipientProfile
) {
}
