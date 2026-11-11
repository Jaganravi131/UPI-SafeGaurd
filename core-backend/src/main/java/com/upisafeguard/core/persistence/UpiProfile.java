package com.upisafeguard.core.persistence;

import jakarta.persistence.*;
import java.util.UUID;

/**
 * UPI ID trust profile — mirrors the Python `upi_profiles` table
 * (backend/app/db/models.py UPIProfile) so assess-risk reads the same
 * trust/report data the FastAPI ML pipeline sees.
 */
@Entity
@Table(name = "upi_profiles")
public class UpiProfile {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "upi_id", length = 100, unique = true, nullable = false)
    private String upiId;

    /** personal | merchant | business */
    @Column(name = "account_type", length = 20)
    private String accountType = "personal";

    @Column(name = "verified_name", length = 100)
    private String verifiedName;

    @Column(name = "account_age_days")
    private Integer accountAgeDays;

    @Column(name = "trust_score")
    private Double trustScore = 50.0;

    @Column(name = "graph_network_score")
    private Double graphNetworkScore = 50.0;

    @Column(name = "transaction_pattern_score")
    private Double transactionPatternScore = 50.0;

    @Column(name = "report_count")
    private Integer reportCount = 0;

    @Column(name = "total_amount_reported")
    private java.math.BigDecimal totalAmountReported = java.math.BigDecimal.ZERO;

    @Column(name = "connected_accounts")
    private Integer connectedAccounts = 0;

    @Column(name = "flagged_connections")
    private Integer flaggedConnections = 0;

    public UUID getId() { return id; }
    public String getUpiId() { return upiId; }
    public void setUpiId(String upiId) { this.upiId = upiId; }
    public String getAccountType() { return accountType; }
    public void setAccountType(String accountType) { this.accountType = accountType; }
    public String getVerifiedName() { return verifiedName; }
    public void setVerifiedName(String verifiedName) { this.verifiedName = verifiedName; }
    public Integer getAccountAgeDays() { return accountAgeDays; }
    public void setAccountAgeDays(Integer accountAgeDays) { this.accountAgeDays = accountAgeDays; }
    public Double getTrustScore() { return trustScore; }
    public void setTrustScore(Double trustScore) { this.trustScore = trustScore; }
    public Double getGraphNetworkScore() { return graphNetworkScore; }
    public void setGraphNetworkScore(Double graphNetworkScore) { this.graphNetworkScore = graphNetworkScore; }
    public Double getTransactionPatternScore() { return transactionPatternScore; }
    public void setTransactionPatternScore(Double transactionPatternScore) { this.transactionPatternScore = transactionPatternScore; }
    public Integer getReportCount() { return reportCount; }
    public void setReportCount(Integer reportCount) { this.reportCount = reportCount; }
    public java.math.BigDecimal getTotalAmountReported() { return totalAmountReported; }
    public void setTotalAmountReported(java.math.BigDecimal totalAmountReported) { this.totalAmountReported = totalAmountReported; }
    public Integer getConnectedAccounts() { return connectedAccounts; }
    public void setConnectedAccounts(Integer connectedAccounts) { this.connectedAccounts = connectedAccounts; }
    public Integer getFlaggedConnections() { return flaggedConnections; }
    public void setFlaggedConnections(Integer flaggedConnections) { this.flaggedConnections = flaggedConnections; }
}
