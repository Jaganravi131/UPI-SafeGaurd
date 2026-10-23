package com.upisafeguard.core.web;

import com.upisafeguard.core.persistence.FraudReport;
import com.upisafeguard.core.persistence.FraudReportRepository;
import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/fraud")
public class FraudController {

    private final FraudReportRepository fraudReportRepository;
    private final UserRepository userRepository;
    private final com.upisafeguard.core.events.DomainEventPublisher events;
    private final com.upisafeguard.core.services.RateLimitService rateLimitService;

    @Autowired
    public FraudController(
            FraudReportRepository fraudReportRepository,
            UserRepository userRepository,
            com.upisafeguard.core.events.DomainEventPublisher events,
            com.upisafeguard.core.services.RateLimitService rateLimitService) {
        this.fraudReportRepository = fraudReportRepository;
        this.userRepository = userRepository;
        this.events = events;
        this.rateLimitService = rateLimitService;
    }

    @PostMapping("/analyze")
    public ResponseEntity<FraudAnalysisResponse> analyzeTransaction(@Valid @RequestBody FraudAnalysisRequest request) {
        // In real implementation, would call ML service
        // For now, return mock response
        return ResponseEntity.ok(new FraudAnalysisResponse(
                "low", 0.15, "proceed", false,
                List.of("Transaction appears normal"),
                List.of("Verify recipient details before sending")
        ));
    }

    @PostMapping("/report")
    public ResponseEntity<FraudReportResponse> submitFraudReport(@Valid @RequestBody FraudReportRequest request) {
        // Find reporter user
        Optional<User> reporterOpt = userRepository.findByPhoneNumber(request.getReporterPhone());
        if (reporterOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(new FraudReportResponse(false, "Reporter not found", null));
        }

        User reporter = reporterOpt.get();
        rateLimitService.fraudReport(reporter.getId().toString());
        FraudReport report = new FraudReport();
        report.setReporter(reporter);
        report.setScammerUpi(request.getScammerUpi());
        report.setScamType(request.getScamType());
        report.setDescription(request.getDescription());
        report.setAmountLost(request.getAmountLost());
        // Convert list to JSON string
        String evidenceUrlsJson = "[]";
        try {
            evidenceUrlsJson = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(request.getEvidenceUrls());
        } catch (Exception e) {
            // ignore
        }
        report.setEvidenceUrls(evidenceUrlsJson);
        report.setStatus("submitted");

        fraudReportRepository.save(report);

        events.publish("upi.fraud.flagged", reporter.getId().toString(),
                com.upisafeguard.core.events.EventPublisherConfig.envelope("FRAUD_REPORTED", java.util.Map.of(
                        "user_id", reporter.getId().toString(),
                        "report_id", report.getId().toString(),
                        "scammer_upi", String.valueOf(request.getScammerUpi()),
                        "scam_type", String.valueOf(request.getScamType()),
                        "amount_lost", request.getAmountLost() == null ? "0"
                                : request.getAmountLost().toPlainString())));

        return ResponseEntity.ok(new FraudReportResponse(true, "Fraud report submitted", report.getId().toString()));
    }

    @GetMapping("/trending")
    public ResponseEntity<TrendingScamsResponse> getTrendingScams() {
        // Return trending scam types
        return ResponseEntity.ok(new TrendingScamsResponse(List.of(
                new ScamTrend("OTP Scam", 45, "Scammer asks for OTP"),
                new ScamTrend("Fake Support", 32, "Fake customer support"),
                new ScamTrend("QR Code Scam", 28, "Malicious QR codes")
        )));
    }

    @GetMapping("/stats")
    public ResponseEntity<CommunityStatsResponse> getCommunityStats() {
        // Return community stats
        return ResponseEntity.ok(new CommunityStatsResponse(
                1250, 4500000.0, 3200, 85.5
        ));
    }

    // DTOs
    public static class FraudAnalysisRequest {
        private String userId;
        private String recipientUpi;
        private BigDecimal amount;
        private String recipientName;
        private boolean isVerified;
        private int trustScore;
        private String note;

        // Getters and setters
        public String getUserId() { return userId; }
        public void setUserId(String userId) { this.userId = userId; }
        public String getRecipientUpi() { return recipientUpi; }
        public void setRecipientUpi(String recipientUpi) { this.recipientUpi = recipientUpi; }
        public BigDecimal getAmount() { return amount; }
        public void setAmount(BigDecimal amount) { this.amount = amount; }
        public String getRecipientName() { return recipientName; }
        public void setRecipientName(String recipientName) { this.recipientName = recipientName; }
        public boolean isVerified() { return isVerified; }
        public void setVerified(boolean verified) { isVerified = verified; }
        public int getTrustScore() { return trustScore; }
        public void setTrustScore(int trustScore) { this.trustScore = trustScore; }
        public String getNote() { return note; }
        public void setNote(String note) { this.note = note; }
    }

    public static class FraudAnalysisResponse {
        private String riskLevel;
        private double riskScore;
        private String recommendedAction;
        private boolean requireGuardianApproval;
        private List<String> riskFactors;
        private List<String> safetyTips;

        public FraudAnalysisResponse(String riskLevel, double riskScore, String recommendedAction,
                                     boolean requireGuardianApproval, List<String> riskFactors,
                                     List<String> safetyTips) {
            this.riskLevel = riskLevel;
            this.riskScore = riskScore;
            this.recommendedAction = recommendedAction;
            this.requireGuardianApproval = requireGuardianApproval;
            this.riskFactors = riskFactors;
            this.safetyTips = safetyTips;
        }

        public String getRiskLevel() { return riskLevel; }
        public double getRiskScore() { return riskScore; }
        public String getRecommendedAction() { return recommendedAction; }
        public boolean isRequireGuardianApproval() { return requireGuardianApproval; }
        public List<String> getRiskFactors() { return riskFactors; }
        public List<String> getSafetyTips() { return safetyTips; }
    }

    public static class FraudReportRequest {
        private String reporterPhone;
        private String scammerUpi;
        private String scamType;
        private String description;
        private BigDecimal amountLost;
        private boolean hasEvidence;
        private List<String> evidenceUrls;

        // Getters and setters
        public String getReporterPhone() { return reporterPhone; }
        public void setReporterPhone(String reporterPhone) { this.reporterPhone = reporterPhone; }
        public String getScammerUpi() { return scammerUpi; }
        public void setScammerUpi(String scammerUpi) { this.scammerUpi = scammerUpi; }
        public String getScamType() { return scamType; }
        public void setScamType(String scamType) { this.scamType = scamType; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public BigDecimal getAmountLost() { return amountLost; }
        public void setAmountLost(BigDecimal amountLost) { this.amountLost = amountLost; }
        public boolean isHasEvidence() { return hasEvidence; }
        public void setHasEvidence(boolean hasEvidence) { this.hasEvidence = hasEvidence; }
        public List<String> getEvidenceUrls() { return evidenceUrls; }
        public void setEvidenceUrls(List<String> evidenceUrls) { this.evidenceUrls = evidenceUrls; }
    }

    public static class FraudReportResponse {
        private boolean success;
        private String message;
        private String reportId;

        public FraudReportResponse(boolean success, String message, String reportId) {
            this.success = success;
            this.message = message;
            this.reportId = reportId;
        }

        public boolean isSuccess() { return success; }
        public String getMessage() { return message; }
        public String getReportId() { return reportId; }
    }

    public static class TrendingScamsResponse {
        private List<ScamTrend> scams;

        public TrendingScamsResponse(List<ScamTrend> scams) {
            this.scams = scams;
        }

        public List<ScamTrend> getScams() { return scams; }
    }

    public static class ScamTrend {
        private String type;
        private int count;
        private String description;

        public ScamTrend(String type, int count, String description) {
            this.type = type;
            this.count = count;
            this.description = description;
        }

        public String getType() { return type; }
        public int getCount() { return count; }
        public String getDescription() { return description; }
    }

    public static class CommunityStatsResponse {
        private int totalReports;
        private double totalAmountSaved;
        private int activeUsers;
        private double safetyScore;

        public CommunityStatsResponse(int totalReports, double totalAmountSaved, int activeUsers, double safetyScore) {
            this.totalReports = totalReports;
            this.totalAmountSaved = totalAmountSaved;
            this.activeUsers = activeUsers;
            this.safetyScore = safetyScore;
        }

        public int getTotalReports() { return totalReports; }
        public double getTotalAmountSaved() { return totalAmountSaved; }
        public int getActiveUsers() { return activeUsers; }
        public double getSafetyScore() { return safetyScore; }
    }
}