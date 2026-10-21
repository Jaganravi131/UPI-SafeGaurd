package com.upisafeguard.core.persistence;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "fraud_reports")
public class FraudReport {

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reporter_id", nullable = true)
    private User reporter;

    @Column(name = "scammer_upi", length = 100, nullable = false)
    private String scammerUpi;

    @Column(name = "scam_type", length = 50, nullable = false)
    private String scamType;

    @Column(name = "amount_lost", precision = 12, scale = 2)
    private BigDecimal amountLost;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "incident_date")
    private Instant incidentDate;

    @Column(name = "scammer_phone", length = 15)
    private String scammerPhone;

    @Column(name = "verification_score")
    private Double verificationScore = 0.0;

    @Column(name = "status", length = 20)
    private String status = "pending";

    @Column(name = "evidence_urls", columnDefinition = "JSONB")
    private String evidenceUrls = "[]";

    @Column(name = "users_protected")
    private Integer usersProtected = 0;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;

    // Getters and Setters
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public User getReporter() { return reporter; }
    public void setReporter(User reporter) { this.reporter = reporter; }

    public String getScammerUpi() { return scammerUpi; }
    public void setScammerUpi(String scammerUpi) { this.scammerUpi = scammerUpi; }

    public String getScamType() { return scamType; }
    public void setScamType(String scamType) { this.scamType = scamType; }

    public BigDecimal getAmountLost() { return amountLost; }
    public void setAmountLost(BigDecimal amountLost) { this.amountLost = amountLost; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public Instant getIncidentDate() { return incidentDate; }
    public void setIncidentDate(Instant incidentDate) { this.incidentDate = incidentDate; }

    public String getScammerPhone() { return scammerPhone; }
    public void setScammerPhone(String scammerPhone) { this.scammerPhone = scammerPhone; }

    public Double getVerificationScore() { return verificationScore; }
    public void setVerificationScore(Double verificationScore) { this.verificationScore = verificationScore; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getEvidenceUrls() { return evidenceUrls; }
    public void setEvidenceUrls(String evidenceUrls) { this.evidenceUrls = evidenceUrls; }

    public Integer getUsersProtected() { return usersProtected; }
    public void setUsersProtected(Integer usersProtected) { this.usersProtected = usersProtected; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}