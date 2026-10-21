package com.upisafeguard.core.payment;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public class PaymentResult {

    private final UUID transactionId;
    private final String userId;
    private final String recipientUpi;
    private final BigDecimal amount;
    private final PaymentStatus status;
    private final BigDecimal remainingBalance;
    private final String reason;
    private final Instant createdAt;
    private final List<String> riskFactors;
    private final List<String> modelVersions;

    public PaymentResult(
            UUID transactionId,
            String userId,
            String recipientUpi,
            BigDecimal amount,
            PaymentStatus status,
            BigDecimal remainingBalance,
            String reason,
            Instant createdAt) {
        this(transactionId, userId, recipientUpi, amount, status, remainingBalance, reason, createdAt, java.util.List.of(), java.util.List.of());
    }

    public PaymentResult(
            UUID transactionId,
            String userId,
            String recipientUpi,
            BigDecimal amount,
            PaymentStatus status,
            BigDecimal remainingBalance,
            String reason,
            Instant createdAt,
            List<String> riskFactors,
            List<String> modelVersions) {
        this.transactionId = transactionId;
        this.userId = userId;
        this.recipientUpi = recipientUpi;
        this.amount = amount;
        this.status = status;
        this.remainingBalance = remainingBalance;
        this.reason = reason;
        this.createdAt = createdAt;
        this.riskFactors = riskFactors != null ? riskFactors : java.util.List.of();
        this.modelVersions = modelVersions != null ? modelVersions : java.util.List.of();
    }

    public UUID getTransactionId() { return transactionId; }
    public String getUserId() { return userId; }
    public String getRecipientUpi() { return recipientUpi; }
    public BigDecimal getAmount() { return amount; }
    public PaymentStatus getStatus() { return status; }
    public BigDecimal getRemainingBalance() { return remainingBalance; }
    public String getReason() { return reason; }
    public Instant getCreatedAt() { return createdAt; }
    public List<String> getRiskFactors() { return riskFactors; }
    public List<String> getModelVersions() { return modelVersions; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        PaymentResult that = (PaymentResult) o;
        return Objects.equals(transactionId, that.transactionId)
                && Objects.equals(userId, that.userId)
                && Objects.equals(recipientUpi, that.recipientUpi)
                && Objects.equals(amount, that.amount)
                && status == that.status
                && Objects.equals(remainingBalance, that.remainingBalance)
                && Objects.equals(reason, that.reason)
                && Objects.equals(createdAt, that.createdAt)
                && Objects.equals(riskFactors, that.riskFactors)
                && Objects.equals(modelVersions, that.modelVersions);
    }

    @Override
    public int hashCode() {
        return Objects.hash(transactionId, userId, recipientUpi, amount, status,
                remainingBalance, reason, createdAt, riskFactors, modelVersions);
    }

    @Override
    public String toString() {
        return "PaymentResult{" +
                "transactionId=" + transactionId +
                ", userId='" + userId + '\'' +
                ", recipientUpi='" + recipientUpi + '\'' +
                ", amount=" + amount +
                ", status=" + status +
                ", remainingBalance=" + remainingBalance +
                ", reason='" + reason + '\'' +
                ", createdAt=" + createdAt +
                ", riskFactors=" + riskFactors +
                ", modelVersions=" + modelVersions +
                '}';
    }
}