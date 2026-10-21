package com.upisafeguard.core.persistence;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "wallets")
public class Wallet {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "user_id", nullable = false, unique = true, updatable = false)
    private String userId;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal balance = BigDecimal.ZERO;

    @Column(name = "daily_limit", nullable = false, precision = 12, scale = 2)
    private BigDecimal dailyLimit = BigDecimal.valueOf(100000.0);

    @Column(name = "daily_spent", nullable = false, precision = 12, scale = 2)
    private BigDecimal dailySpent = BigDecimal.ZERO;

    @Column(name = "guardian_enabled")
    private Boolean guardianEnabled = false;

    @Column(nullable = false, length = 3)
    private String currency = "INR";

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;

    @Version
    private long version;

    protected Wallet() {
    }

    public Wallet(UUID userId, BigDecimal balance) {
        this.userId = userId != null ? userId.toString() : null;
        this.balance = balance;
    }

    @PrePersist
    void initializeIdAndTimestamp() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public UUID getId() { return id; }
    public String getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId != null ? userId.toString() : null; }
    public void setUserId(String userId) { this.userId = userId; }
    public BigDecimal getBalance() { return balance; }
    public void setBalance(BigDecimal balance) { this.balance = balance; }
    public BigDecimal getDailyLimit() { return dailyLimit; }
    public void setDailyLimit(BigDecimal dailyLimit) { this.dailyLimit = dailyLimit; }
    public BigDecimal getDailySpent() { return dailySpent; }
    public void setDailySpent(BigDecimal dailySpent) { this.dailySpent = dailySpent; }
    public Boolean isGuardianEnabled() { return guardianEnabled; }
    public void setGuardianEnabled(Boolean guardianEnabled) { this.guardianEnabled = guardianEnabled; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public long getVersion() { return version; }

    public void debit(BigDecimal amount) {
        if (amount.signum() <= 0 || balance.compareTo(amount) < 0) {
            throw new IllegalArgumentException("Wallet balance is insufficient");
        }
        balance = balance.subtract(amount);
    }
}