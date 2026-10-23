package com.upisafeguard.core.security;

/** Port of the SecurityShield ThreatType enum (app/ml/security_shield.py). */
public enum ThreatType {
    SCREEN_RECORDING("screen_recording"),
    SCREEN_SHARING("screen_sharing"),
    OVERLAY("overlay"),
    ROOTED_DEVICE("rooted_device"),
    BLOCKLIST_MATCH("blocklist_match"),
    SCAM_KEYWORDS("scam_keywords"),
    NEW_ACCOUNT("new_account"),
    HIGH_AMOUNT("high_amount"),
    ANOMALOUS_BEHAVIOR("anomalous_behavior"),
    COMMUNITY_REPORTS("community_reports"),
    SUSPICIOUS_NAME("suspicious_name");

    private final String value;

    ThreatType(String value) {
        this.value = value;
    }

    /** Wire value used by the API response (threats: [<value>]). */
    public String value() {
        return value;
    }
}
