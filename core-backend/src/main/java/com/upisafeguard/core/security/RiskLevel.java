package com.upisafeguard.core.security;

/** Port of the SecurityShield RiskLevel enum — score bands in comments. */
public enum RiskLevel {
    SAFE("safe"),           // 0-25
    CAUTION("caution"),     // 26-50
    RISKY("risky"),         // 51-75
    DANGEROUS("dangerous"), // 76-100
    BLOCKED("blocked");     // Blocklist match

    private final String value;

    RiskLevel(String value) {
        this.value = value;
    }

    /** Wire value used by the API response. */
    public String value() {
        return value;
    }
}
