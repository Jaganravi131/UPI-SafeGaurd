package com.upisafeguard.core.persistence;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "phone_number", length = 15, unique = true, nullable = false)
    private String phoneNumber;

    @Column(name = "full_name", length = 100, nullable = false)
    private String fullName;

    @Column(name = "email", length = 255, unique = true)
    private String email;

    @Column(name = "date_of_birth")
    private Instant dateOfBirth;

    @Column(name = "preferred_language", length = 20)
    private String preferredLanguage = "en";

    @Enumerated(EnumType.STRING)
    @Column(name = "digital_literacy", length = 20)
    private DigitalLiteracy digitalLiteracy = DigitalLiteracy.INTERMEDIATE;

    @Column(name = "upi_id", length = 100, unique = true)
    private String upiId;

    @Column(name = "pin_hash", length = 255)
    private String pinHash;

    @Column(name = "biometric_enabled")
    private Boolean biometricEnabled = false;

    @Column(name = "safe_word", length = 50)
    private String safeWord;

    @Column(name = "security_score", precision = 5, scale = 2)
    private BigDecimal securityScore = BigDecimal.valueOf(50.0);

    @Column(name = "behavior_score", precision = 5, scale = 2)
    private BigDecimal behaviorScore = BigDecimal.valueOf(50.0);

    @Column(name = "education_score", precision = 5, scale = 2)
    private BigDecimal educationScore = BigDecimal.ZERO;

    @Column(name = "history_score", precision = 5, scale = 2)
    private BigDecimal historyScore = BigDecimal.valueOf(50.0);

    @Column(name = "daily_limit", precision = 12, scale = 2)
    private BigDecimal dailyLimit = BigDecimal.valueOf(100000.0);

    @Column(name = "per_transaction_limit", precision = 12, scale = 2)
    private BigDecimal perTransactionLimit = BigDecimal.valueOf(50000.0);

    @Column(name = "guardian_enabled")
    private Boolean guardianEnabled = false;

    @Column(name = "guardian_threshold", precision = 12, scale = 2)
    private BigDecimal guardianThreshold = BigDecimal.valueOf(5000.0);

    @Column(name = "is_active")
    private Boolean isActive = true;

    @Column(name = "firebase_uid", length = 128, unique = true)
    private String firebaseUid;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "last_login")
    private Instant lastLogin;

    // Getters and Setters
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public Instant getDateOfBirth() { return dateOfBirth; }
    public void setDateOfBirth(Instant dateOfBirth) { this.dateOfBirth = dateOfBirth; }

    public String getPreferredLanguage() { return preferredLanguage; }
    public void setPreferredLanguage(String preferredLanguage) { this.preferredLanguage = preferredLanguage; }

    public DigitalLiteracy getDigitalLiteracy() { return digitalLiteracy; }
    public void setDigitalLiteracy(DigitalLiteracy digitalLiteracy) { this.digitalLiteracy = digitalLiteracy; }

    public String getUpiId() { return upiId; }
    public void setUpiId(String upiId) { this.upiId = upiId; }

    public String getPinHash() { return pinHash; }
    public void setPinHash(String pinHash) { this.pinHash = pinHash; }

    public Boolean getBiometricEnabled() { return biometricEnabled; }
    public void setBiometricEnabled(Boolean biometricEnabled) { this.biometricEnabled = biometricEnabled; }

    public String getSafeWord() { return safeWord; }
    public void setSafeWord(String safeWord) { this.safeWord = safeWord; }

    public BigDecimal getSecurityScore() { return securityScore; }
    public void setSecurityScore(BigDecimal securityScore) { this.securityScore = securityScore; }

    public BigDecimal getBehaviorScore() { return behaviorScore; }
    public void setBehaviorScore(BigDecimal behaviorScore) { this.behaviorScore = behaviorScore; }

    public BigDecimal getEducationScore() { return educationScore; }
    public void setEducationScore(BigDecimal educationScore) { this.educationScore = educationScore; }

    public BigDecimal getHistoryScore() { return historyScore; }
    public void setHistoryScore(BigDecimal historyScore) { this.historyScore = historyScore; }

    public BigDecimal getDailyLimit() { return dailyLimit; }
    public void setDailyLimit(BigDecimal dailyLimit) { this.dailyLimit = dailyLimit; }

    public BigDecimal getPerTransactionLimit() { return perTransactionLimit; }
    public void setPerTransactionLimit(BigDecimal perTransactionLimit) { this.perTransactionLimit = perTransactionLimit; }

    public Boolean getGuardianEnabled() { return guardianEnabled; }
    public void setGuardianEnabled(Boolean guardianEnabled) { this.guardianEnabled = guardianEnabled; }

    public BigDecimal getGuardianThreshold() { return guardianThreshold; }
    public void setGuardianThreshold(BigDecimal guardianThreshold) { this.guardianThreshold = guardianThreshold; }

    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean isActive) { this.isActive = isActive; }

    public String getFirebaseUid() { return firebaseUid; }
    public void setFirebaseUid(String firebaseUid) { this.firebaseUid = firebaseUid; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    public Instant getLastLogin() { return lastLogin; }
    public void setLastLogin(Instant lastLogin) { this.lastLogin = lastLogin; }

    public enum DigitalLiteracy {
        BEGINNER, INTERMEDIATE, ADVANCED
    }
}