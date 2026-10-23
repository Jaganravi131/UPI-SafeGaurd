package com.upisafeguard.core.security;

import java.time.LocalDateTime;
import java.util.List;

/** Complete security analysis result — mirrors security_shield.SecurityAnalysis. */
public class ShieldAnalysis {

    public final String transactionId;
    public final LocalDateTime timestamp;

    // Final Decision (Rule-Based, NOT AI)
    public final RiskLevel riskLevel;
    public final double finalScore;
    public final boolean blocked;
    public final boolean canProceed;

    // Layer Results
    public final List<ShieldLayerResult> layerResults;

    // Explanation (for user)
    public final String primaryReason;
    public final List<String> allReasons;
    public final List<String> safetyTips;
    public final String scamTypeDetected;

    // Education link
    public final String educationLink;

    public ShieldAnalysis(String transactionId, LocalDateTime timestamp, RiskLevel riskLevel, double finalScore,
                          boolean blocked, boolean canProceed, List<ShieldLayerResult> layerResults,
                          String primaryReason, List<String> allReasons, List<String> safetyTips,
                          String scamTypeDetected, String educationLink) {
        this.transactionId = transactionId;
        this.timestamp = timestamp;
        this.riskLevel = riskLevel;
        this.finalScore = finalScore;
        this.blocked = blocked;
        this.canProceed = canProceed;
        this.layerResults = layerResults;
        this.primaryReason = primaryReason;
        this.allReasons = allReasons;
        this.safetyTips = safetyTips;
        this.scamTypeDetected = scamTypeDetected;
        this.educationLink = educationLink;
    }
}
