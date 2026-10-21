package com.upisafeguard.core.persistence;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;

@Entity
@Table(name = "contacts")
public class Contact {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "phone", length = 15, unique = true, nullable = false)
    private String phone;

    @Column(name = "name", length = 100, nullable = false)
    private String name;

    @Column(name = "upi_id", length = 100, unique = true)
    private String upiId;

    @Column(name = "bank", length = 100)
    private String bank;

    @Column(name = "is_verified")
    private Boolean isVerified = false;

    @Column(name = "trust_score")
    private Integer trustScore = 50;

    @Column(name = "is_scammer")
    private Boolean isScammer = false;

    @Column(name = "scam_type", length = 50)
    private String scamType;

    @Column(name = "report_count")
    private Integer reportCount = 0;

    @Column(name = "account_age_days")
    private Integer accountAgeDays = 0;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getUpiId() { return upiId; }
    public void setUpiId(String upiId) { this.upiId = upiId; }

    public String getBank() { return bank; }
    public void setBank(String bank) { this.bank = bank; }

    public Boolean getIsVerified() { return isVerified; }
    public void setIsVerified(Boolean isVerified) { this.isVerified = isVerified; }

    public Integer getTrustScore() { return trustScore; }
    public void setTrustScore(Integer trustScore) { this.trustScore = trustScore; }

    public Boolean getIsScammer() { return isScammer; }
    public void setIsScammer(Boolean isScammer) { this.isScammer = isScammer; }

    public String getScamType() { return scamType; }
    public void setScamType(String scamType) { this.scamType = scamType; }

    public Integer getReportCount() { return reportCount; }
    public void setReportCount(Integer reportCount) { this.reportCount = reportCount; }

    public Integer getAccountAgeDays() { return accountAgeDays; }
    public void setAccountAgeDays(Integer accountAgeDays) { this.accountAgeDays = accountAgeDays; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}