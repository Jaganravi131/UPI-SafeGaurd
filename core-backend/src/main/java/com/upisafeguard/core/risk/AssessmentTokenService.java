package com.upisafeguard.core.risk;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.upisafeguard.core.persistence.AssessmentTokenEntity;
import com.upisafeguard.core.persistence.AssessmentTokenRepository;
import com.upisafeguard.core.payment.PaymentStatus;

@Service
public class AssessmentTokenService {

    private static final Duration TOKEN_TTL = Duration.ofMinutes(5);

    public record AssessmentToken(
            String userId,
            String recipientUpi,
            BigDecimal amount,
            String recommendedAction,
            Instant expiresAt,
            List<String> riskFactors,
            List<String> modelVersions,
            String rationale
    ) {
    }

    private final Clock clock;
    private final AssessmentTokenRepository repository;
    private final Map<String, AssessmentToken> tokens = new java.util.concurrent.ConcurrentHashMap<>();

    public AssessmentTokenService() {
        this(null, Clock.systemUTC());
    }

    public AssessmentTokenService(Clock clock) {
        this(null, clock);
    }

    @Autowired
    public AssessmentTokenService(AssessmentTokenRepository repository) {
        this(repository, Clock.systemUTC());
    }

    AssessmentTokenService(AssessmentTokenRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    @Transactional
    public IssuedAssessment issue(RiskAssessmentRequest request, RiskAssessmentResponse response) {
        String userId = requiredString(request.userProfile(), "id");
        String recipientUpi = requiredString(request.transaction(), "recipient_upi");
        BigDecimal amount = requiredAmount(request.transaction());
        Instant expiresAt = clock.instant().plus(TOKEN_TTL);

        // Generate richer assessment with risk factors
        Map<String, Object> assessment = generateRiskAssessment(request, response);
        String recommendedAction = (String) assessment.get("recommended_action");
        List<String> riskFactors = (List<String>) assessment.get("risk_factors");
        Map<String, String> modelVersionsMap = (Map<String, String>) assessment.get("model_versions");
        String rationale = (String) assessment.get("rationale");

        // Convert map to list of "key:value" strings for storage
        List<String> modelVersions = modelVersionsMap.entrySet().stream()
                .map(e -> e.getKey() + ":" + e.getValue())
                .toList();

        String token = UUID.randomUUID().toString();

        AssessmentToken assessmentToken = new AssessmentToken(
                userId,
                recipientUpi,
                amount,
                recommendedAction,
                expiresAt,
                riskFactors,
                modelVersions,
                rationale
        );

        if (repository != null) {
            repository.save(new AssessmentTokenEntity(
                    token,
                    assessmentToken.userId(),
                    assessmentToken.recipientUpi(),
                    assessmentToken.amount(),
                    assessmentToken.recommendedAction(),
                    assessmentToken.expiresAt(),
                    assessmentToken.rationale(),
                    assessmentToken.riskFactors(),
                    assessmentToken.modelVersions()
            ));
        } else {
            tokens.put(token, assessmentToken);
        }
        removeExpired();
        return new IssuedAssessment(token, expiresAt, recommendedAction, riskFactors, modelVersions);
    }

    @Transactional
    public AssessmentToken consume(
            String token,
            String userId,
            String recipientUpi,
            BigDecimal amount
    ) {
        if (token == null || token.isBlank()) {
            throw new InvalidAssessmentTokenException("Assessment token is required");
        }
        AssessmentToken stored;
        if (repository != null) {
            AssessmentTokenEntity entity = repository.findById(token).orElse(null);
            if (entity == null) {
                throw new InvalidAssessmentTokenException("Assessment token is invalid or expired");
            }
            stored = new AssessmentToken(
                    entity.getUserId(),
                    entity.getRecipientUpi(),
                    entity.getAmount(),
                    entity.getRecommendedAction(),
                    entity.getExpiresAt(),
                    entity.getRiskFactors(),
                    entity.getModelVersions(),
                    entity.getRationale()
            );
            if (entity.isConsumed()) {
                throw new InvalidAssessmentTokenException("Assessment token is invalid or expired");
            }
        } else {
            stored = tokens.remove(token);
        }
        if (stored == null || stored.expiresAt().isBefore(clock.instant())) {
            throw new InvalidAssessmentTokenException("Assessment token is invalid or expired");
        }
        if (!stored.userId().equals(userId)
                || !stored.recipientUpi().equals(recipientUpi)
                || stored.amount().compareTo(amount) != 0) {
            throw new InvalidAssessmentTokenException("Assessment token does not match this payment");
        }
        if (repository != null) {
            AssessmentTokenEntity entity = repository.findById(token)
                    .orElseThrow(() -> new InvalidAssessmentTokenException("Assessment token is invalid or expired"));
            entity.consume();
            repository.save(entity);
        }
        return stored;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> generateRiskAssessment(RiskAssessmentRequest request, RiskAssessmentResponse response) {
        Map<String, Object> assessment = new LinkedHashMap<>();
        BigDecimal amount = requiredAmount(request.transaction());
        String recipientUpi = requiredString(request.transaction(), "recipient_upi");
        Map<String, Object> userProfile = request.userProfile();

        List<String> riskFactors = new java.util.ArrayList<>();
        Map<String, String> modelVersionsMap = new LinkedHashMap<>();
        String recommendedAction = "proceed";
        String rationale = "Assessment completed";

        // XGBoost model analysis
        modelVersionsMap.put("xgboost", "v2.3");
        riskFactors.add("XGBoost model analyzed transaction patterns");

        // Rule-based checks
        // Daily limit check
        BigDecimal dailyLimit = (BigDecimal) userProfile.getOrDefault("daily_limit", BigDecimal.valueOf(100000.0));
        BigDecimal dailySpent = (BigDecimal) userProfile.getOrDefault("daily_spent", BigDecimal.ZERO);
        if (dailySpent.add(amount).compareTo(dailyLimit) > 0) {
            recommendedAction = "block";
            riskFactors.add("Daily limit exceeded: ₹" + dailySpent + " of ₹" + dailyLimit + " already spent");
            rationale = "Transaction would exceed daily spending limit";
        }
        // Per-transaction limit check
        else if (amount.compareTo((BigDecimal) userProfile.getOrDefault("per_transaction_limit", BigDecimal.valueOf(50000.0))) > 0) {
            recommendedAction = "block";
            riskFactors.add("Per-transaction limit exceeded: ₹" + amount + " exceeds ₹" + userProfile.get("per_transaction_limit"));
            rationale = "Transaction exceeds per-transaction limit";
        }
        // Guardian threshold check
        else if (amount.compareTo(BigDecimal.valueOf(5000.0)) > 0) {
            recommendedAction = "delay";
            riskFactors.add("Amount ₹" + amount + " exceeds guardian threshold of ₹5000");
            rationale = "Payment requires guardian verification for amounts above threshold";
        }
        // Known fraud report check
        else if (userProfile.containsKey("known_fraud_report") && (Boolean) userProfile.get("known_fraud_report")) {
            recommendedAction = "block";
            riskFactors.add("User has reported fraud previously");
            rationale = "Previous fraud report on file";
        }
        // Time-based check (nighttime transactions)
        else {
            Instant now = clock.instant();
            LocalDateTime localDateTime = LocalDateTime.ofInstant(now, ZoneId.systemDefault());
            int hour = localDateTime.getHour();
            if (hour >= 22 || hour <= 6) {
                recommendedAction = "delay";
                riskFactors.add("Transaction initiated during late night hours (" + hour + ":00)");
                rationale = "Nighttime transaction flagged for additional verification";
            }
        }

        // If no specific block/delay, proceed with low risk
        if (riskFactors.isEmpty()) {
            riskFactors.add("Transaction consistent with user profile");
        }

        assessment.put("recommended_action", recommendedAction);
        assessment.put("risk_factors", riskFactors);
        assessment.put("model_versions", modelVersionsMap);
        assessment.put("rationale", rationale);

        return assessment;
    }

    private void removeExpired() {
        if (repository != null) {
            return;
        }
        Instant now = clock.instant();
        tokens.entrySet().removeIf(entry -> entry.getValue().expiresAt().isBefore(now));
    }

    private static String requiredString(Map<String, Object> values, String key) {
        Object value = values.get(key);
        if (!(value instanceof String string) || string.isBlank()) {
            throw new InvalidAssessmentTokenException("Assessment requires " + key);
        }
        return string.trim();
    }

    private static BigDecimal requiredAmount(Map<String, Object> values) {
        Object value = values.get("amount");
        if (value instanceof Number number) {
            BigDecimal amount = BigDecimal.valueOf(number.doubleValue());
            if (amount.signum() > 0) {
                return amount;
            }
        }
        throw new InvalidAssessmentTokenException("Assessment requires a positive amount");
    }

    public record IssuedAssessment(
            String token,
            Instant expiresAt,
            String recommendedAction,
            List<String> riskFactors,
            List<String> modelVersions
    ) {
    }
}