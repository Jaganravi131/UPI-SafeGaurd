package com.upisafeguard.core.persistence;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "assessment_tokens")
public class AssessmentTokenEntity {

    @Id
    private String token;

    @Column(name = "user_id", nullable = false, updatable = false)
    private String userId;

    @Column(name = "recipient_upi", nullable = false, updatable = false)
    private String recipientUpi;

    @Column(nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal amount;

    @Column(name = "recommended_action", nullable = false, updatable = false)
    private String recommendedAction;

    @Column(name = "expires_at", nullable = false, updatable = false)
    private Instant expiresAt;

    @Column(name = "rationale")
    private String rationale;

    @ElementCollection
    @CollectionTable(name = "assessment_risk_factors", joinColumns = @JoinColumn(name = "token"))
    @Column(name = "factor")
    private List<String> riskFactors;

    @ElementCollection
    @CollectionTable(name = "assessment_model_versions", joinColumns = @JoinColumn(name = "token"))
    @Column(name = "model_key")
    private List<String> modelVersions;

    @Column(name = "consumed", nullable = false, columnDefinition = "boolean default false")
    private boolean consumed;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;

    @Version
    private long version;

    protected AssessmentTokenEntity() {
    }

    public AssessmentTokenEntity(
            String token,
            String userId,
            String recipientUpi,
            BigDecimal amount,
            String recommendedAction,
            Instant expiresAt,
            String rationale,
            List<String> riskFactors,
            List<String> modelVersions
    ) {
        this.token = token;
        this.userId = userId;
        this.recipientUpi = recipientUpi;
        this.amount = amount;
        this.recommendedAction = recommendedAction;
        this.expiresAt = expiresAt;
        this.rationale = rationale;
        this.riskFactors = riskFactors;
        this.modelVersions = modelVersions;
    }

    @PrePersist
    void initializeTimestamp() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        if (updatedAt == null) {
            updatedAt = Instant.now();
        }
    }

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getRecipientUpi() { return recipientUpi; }
    public void setRecipientUpi(String recipientUpi) { this.recipientUpi = recipientUpi; }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }

    public String getRecommendedAction() { return recommendedAction; }
    public void setRecommendedAction(String recommendedAction) { this.recommendedAction = recommendedAction; }

    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }

    public String getRationale() { return rationale; }
    public void setRationale(String rationale) { this.rationale = rationale; }

    public List<String> getRiskFactors() { return riskFactors; }
    public void setRiskFactors(List<String> riskFactors) { this.riskFactors = riskFactors; }

    public List<String> getModelVersions() { return modelVersions; }
    public void setModelVersions(List<String> modelVersions) { this.modelVersions = modelVersions; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    public long getVersion() { return version; }
    public void setVersion(long version) { this.version = version; }

    public boolean isConsumed() { return consumed; }

    public void consume() {
        if (consumed) {
            throw new IllegalStateException("Assessment token has already been consumed");
        }
        consumed = true;
    }
}