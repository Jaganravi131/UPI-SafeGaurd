package com.upisafeguard.core.security;

import java.util.List;
import java.util.Map;

/** Result from a single security layer — mirrors security_shield.LayerResult. */
public class ShieldLayerResult {

    public final String layerName;
    public final boolean passed;
    public final double riskScore; // 0-100
    public final List<String> reasons;
    public final List<ThreatType> threats;
    public final Map<String, Object> data;

    public ShieldLayerResult(String layerName, boolean passed, double riskScore,
                             List<String> reasons, List<ThreatType> threats, Map<String, Object> data) {
        this.layerName = layerName;
        this.passed = passed;
        this.riskScore = riskScore;
        this.reasons = reasons;
        this.threats = threats;
        this.data = data;
    }
}
