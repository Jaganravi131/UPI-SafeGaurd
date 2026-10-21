package com.upisafeguard.core.persistence;

import com.upisafeguard.core.payment.PaymentStatus;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(
        name = "payment_transactions",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_payment_user_idempotency",
                columnNames = {"user_id", "idempotency_key"}
        )
)
public class PaymentTransaction {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private String userId;

    @Column(name = "recipient_upi", nullable = false, updatable = false)
    private String recipientUpi;

    @Column(nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal amount;

    @Column(name = "idempotency_key", nullable = false, updatable = false)
    private String idempotencyKey;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PaymentStatus status;

    @Column(nullable = false)
    private String reason;

    @Column(name = "recipient_name", length = 100)
    private String recipientName;

    @Column(length = 255)
    private String purpose;

    @Column(name = "risk_level", length = 10)
    private String riskLevel;

    @Column(name = "completed_at")
    private Instant completedAt;

    @ElementCollection
    @CollectionTable(name = "payment_risk_factors", joinColumns = @JoinColumn(name = "transaction_id"))
    private List<String> riskFactors;

    @ElementCollection
    @CollectionTable(name = "payment_model_versions", joinColumns = @JoinColumn(name = "transaction_id"))
    private List<String> modelVersions;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected PaymentTransaction() {
    }

    public PaymentTransaction(
            UUID userId,
            String recipientUpi,
            BigDecimal amount,
            String idempotencyKey,
            PaymentStatus status,
            String reason
    ) {
        this.userId = userId != null ? userId.toString() : null;
        this.recipientUpi = recipientUpi;
        this.amount = amount;
        this.idempotencyKey = idempotencyKey;
        this.status = status;
        this.reason = reason;
        this.riskFactors = null;
        this.modelVersions = null;
    }

    public PaymentTransaction(
            UUID userId,
            String recipientUpi,
            BigDecimal amount,
            String idempotencyKey,
            PaymentStatus status,
            String reason,
            List<String> riskFactors,
            List<String> modelVersions
    ) {
        this.userId = userId != null ? userId.toString() : null;
        this.recipientUpi = recipientUpi;
        this.amount = amount;
        this.idempotencyKey = idempotencyKey;
        this.status = status;
        this.reason = reason;
        this.riskFactors = riskFactors;
        this.modelVersions = modelVersions;
    }

    public UUID getId() { return id; }
    public String getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId != null ? userId.toString() : null; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getRecipientUpi() { return recipientUpi; }
    public void setRecipientUpi(String recipientUpi) { this.recipientUpi = recipientUpi; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getIdempotencyKey() { return idempotencyKey; }
    public void setIdempotencyKey(String idempotencyKey) { this.idempotencyKey = idempotencyKey; }
    public PaymentStatus getStatus() { return status; }
    public void setStatus(PaymentStatus status) { this.status = status; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public String getRecipientName() { return recipientName; }
    public void setRecipientName(String recipientName) { this.recipientName = recipientName; }
    public String getPurpose() { return purpose; }
    public void setPurpose(String purpose) { this.purpose = purpose; }
    public String getRiskLevel() { return riskLevel; }
    public void setRiskLevel(String riskLevel) { this.riskLevel = riskLevel; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }
    public List<String> getRiskFactors() { return riskFactors; }
    public void setRiskFactors(List<String> riskFactors) { this.riskFactors = riskFactors; }
    public List<String> getModelVersions() { return modelVersions; }
    public void setModelVersions(List<String> modelVersions) { this.modelVersions = modelVersions; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}