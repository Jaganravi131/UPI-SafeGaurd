package com.upisafeguard.core.web;

import com.upisafeguard.core.persistence.FraudReportRepository;
import com.upisafeguard.core.persistence.PaymentTransaction;
import com.upisafeguard.core.persistence.PaymentTransactionRepository;
import com.upisafeguard.core.persistence.UpiProfile;
import com.upisafeguard.core.persistence.UpiProfileRepository;
import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.UserRepository;
import com.upisafeguard.core.persistence.Wallet;
import com.upisafeguard.core.persistence.WalletRepository;
import com.upisafeguard.core.payment.PaymentCommand;
import com.upisafeguard.core.payment.PaymentCommandService;
import com.upisafeguard.core.payment.PaymentResult;
import com.upisafeguard.core.payment.PaymentStatus;
import com.upisafeguard.core.risk.AssessmentTokenService;
import com.upisafeguard.core.risk.InvalidAssessmentTokenException;
import com.upisafeguard.core.risk.RiskAssessmentRequest;
import com.upisafeguard.core.risk.RiskAssessmentResponse;
import com.upisafeguard.core.risk.RiskServiceClient;
import com.upisafeguard.core.risk.RiskServiceUnavailableException;
import com.upisafeguard.core.web.dto.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/transactions")
public class TransactionController {

    private final PaymentCommandService paymentCommandService;
    private final AssessmentTokenService assessmentTokenService;
    private final RiskServiceClient riskServiceClient;
    private final PaymentTransactionRepository transactionRepository;
    private final WalletRepository walletRepository;
    private final UserRepository userRepository;
    private final FraudReportRepository fraudReportRepository;
    private final UpiProfileRepository upiProfileRepository;
    private final AuthSupport authSupport;

    @Autowired
    public TransactionController(
            PaymentCommandService paymentCommandService,
            AssessmentTokenService assessmentTokenService,
            RiskServiceClient riskServiceClient,
            PaymentTransactionRepository transactionRepository,
            WalletRepository walletRepository,
            UserRepository userRepository,
            FraudReportRepository fraudReportRepository,
            UpiProfileRepository upiProfileRepository,
            AuthSupport authSupport) {
        this.paymentCommandService = paymentCommandService;
        this.assessmentTokenService = assessmentTokenService;
        this.riskServiceClient = riskServiceClient;
        this.transactionRepository = transactionRepository;
        this.walletRepository = walletRepository;
        this.userRepository = userRepository;
        this.fraudReportRepository = fraudReportRepository;
        this.upiProfileRepository = upiProfileRepository;
        this.authSupport = authSupport;
    }

    /**
     * Port of the Python /assess-risk route: flat request, profiles built
     * server-side, ML assessment via the ai-service (with a transparent local
     * heuristic when it is unreachable), and a single-use risk token so
     * /create cannot be called without an assessment.
     */
    @PostMapping("/assess-risk")
    public ResponseEntity<Map<String, Object>> assessRisk(
            @Valid @RequestBody TransactionAssessRequest request,
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        String tokenUser = authSupport.requireUserId(authHeader);
        UUID userId = UUID.fromString(tokenUser);
        User user = userRepository.findById(userId).orElse(null);
        double amount = request.getAmount();

        Map<String, Object> userProfile = buildUserProfile(user);
        Map<String, Object> recipientProfile = buildRecipientProfile(request.getRecipientUpi());
        Map<String, Object> transactionData = buildTransactionData(userId, request);

        RiskAssessmentResponse ml;
        try {
            ml = riskServiceClient.assess(new RiskAssessmentRequest(transactionData, userProfile, recipientProfile));
        } catch (RiskServiceUnavailableException e) {
            ml = null;
        }

        Map<String, Object> body = new LinkedHashMap<>();
        String recommendedAction;
        if (ml != null) {
            body.put("risk_level", ml.risk_level());
            body.put("ensemble_score", ml.risk_score());
            body.put("recommended_action", ml.recommended_action());
            body.put("risk_factors", ml.risk_factors());
            body.put("require_guardian_approval", ml.require_guardian_approval());
            body.put("transaction_id", ml.transaction_id());
            body.put("model_versions", ml.model_versions());
            recommendedAction = ml.recommended_action();
        } else {
            Map<String, Object> heuristic = heuristicAssessment(amount, request, userProfile, recipientProfile);
            body.putAll(heuristic);
            recommendedAction = (String) heuristic.get("recommended_action");
        }

        // Issue the single-use risk token (same mechanism /api/v1/risk/assess uses).
        AssessmentTokenService.IssuedAssessment issued = assessmentTokenService.issue(
                new RiskAssessmentRequest(transactionData, userProfile, recipientProfile),
                ml != null ? ml : syntheticResponse(body));
        body.put("risk_token", issued.token());
        body.put("risk_token_expires_at", issued.expiresAt().toString());
        body.put("is_new_recipient", transactionData.get("is_new_recipient"));

        return ResponseEntity.ok(body);
    }

    /** Python get_user_profile port (defaults included when the user row is missing). */
    private Map<String, Object> buildUserProfile(User user) {
        Map<String, Object> profile = new LinkedHashMap<>();
        if (user == null) {
            profile.put("id", "unknown");
            profile.put("avg_transaction_amount", 0);
            profile.put("max_transaction_amount", 0);
            profile.put("total_transactions", 0);
            profile.put("security_score", 50);
            profile.put("digital_literacy", "beginner");
            profile.put("guardian_enabled", false);
            profile.put("typical_hours", defaultHours());
            return profile;
        }

        List<PaymentTransaction> completed = transactionRepository.findByUserIdAndStatus(
                user.getId().toString(), com.upisafeguard.core.payment.PaymentStatus.COMPLETED);
        List<Double> amounts = completed.stream()
                .map(t -> t.getAmount() == null ? 0.0 : t.getAmount().doubleValue())
                .toList();

        List<Integer> typicalHours = new java.util.ArrayList<>();
        for (PaymentTransaction t : completed) {
            if (t.getCreatedAt() != null) {
                int hour = LocalDateTime.ofInstant(t.getCreatedAt(), java.time.ZoneOffset.UTC).getHour();
                if (!typicalHours.contains(hour)) {
                    typicalHours.add(hour);
                }
            }
        }
        if (typicalHours.isEmpty()) {
            typicalHours = defaultHours();
        }
        typicalHours.sort(Integer::compareTo);

        profile.put("id", user.getId().toString());
        profile.put("avg_transaction_amount",
                amounts.isEmpty() ? 0.0 : amounts.stream().mapToDouble(Double::doubleValue).average().orElse(0));
        profile.put("max_transaction_amount", amounts.isEmpty() ? 0.0 : amounts.stream().mapToDouble(Double::doubleValue).max().orElse(0));
        profile.put("total_transactions", completed.size());
        profile.put("security_score", user.getSecurityScore() == null ? 50.0 : user.getSecurityScore().doubleValue());
        profile.put("digital_literacy", user.getDigitalLiteracy() == null ? "intermediate" : user.getDigitalLiteracy().name().toLowerCase());
        profile.put("guardian_enabled", user.getGuardianEnabled() != null && user.getGuardianEnabled());
        profile.put("guardian_threshold", user.getGuardianThreshold() == null ? 5000.0 : user.getGuardianThreshold().doubleValue());
        profile.put("typical_hours", typicalHours);
        profile.put("age", user.getDateOfBirth() == null ? 30
                : (int) (java.time.Duration.between(user.getDateOfBirth(), Instant.now()).toDays() / 365));
        profile.put("is_vulnerable", user.getDigitalLiteracy() == User.DigitalLiteracy.BEGINNER);
        return profile;
    }

    private static List<Integer> defaultHours() {
        List<Integer> hours = new java.util.ArrayList<>();
        for (int h = 8; h < 22; h++) {
            hours.add(h);
        }
        return hours;
    }

    /** Python get_recipient_profile port (UPIProfile table + defaults for unknown recipients). */
    private Map<String, Object> buildRecipientProfile(String upiId) {
        Map<String, Object> profile = new LinkedHashMap<>();
        Optional<UpiProfile> stored = upiProfileRepository.findByUpiId(upiId);
        if (stored.isPresent()) {
            UpiProfile p = stored.get();
            profile.put("upi_id", p.getUpiId());
            profile.put("trust_score", p.getTrustScore() == null ? 50.0 : p.getTrustScore());
            profile.put("report_count", p.getReportCount() == null ? 0 : p.getReportCount());
            profile.put("account_age_days", p.getAccountAgeDays() == null ? 30 : p.getAccountAgeDays());
            profile.put("total_transactions", 0);
            profile.put("account_type", p.getAccountType() == null ? "personal" : p.getAccountType());
        } else {
            profile.put("upi_id", upiId);
            profile.put("trust_score", 50);
            profile.put("report_count", 0);
            profile.put("account_age_days", 0);
            profile.put("total_transactions", 0);
            profile.put("account_type", "unknown");
        }
        // Live report count always wins over the (possibly stale) stored profile.
        profile.put("report_count", fraudReportRepository.countByScammerUpiEqualsIgnoreCase(upiId));
        return profile;
    }

    /** Python assess-risk lines 195-232: derived new-recipient flag + recent-stats + pipeline keys. */
    private Map<String, Object> buildTransactionData(UUID userId, TransactionAssessRequest request) {
        LocalDateTime now = LocalDateTime.now(java.time.ZoneOffset.UTC);
        Page<PaymentTransaction> recentPage = transactionRepository.findByUserIdOrderByCreatedAtDesc(
                userId.toString(), PageRequest.of(0, 200));
        List<PaymentTransaction> recent = recentPage == null ? List.of() : recentPage.getContent();
        List<PaymentTransaction> lastDay = recent.stream()
                .filter(t -> t.getCreatedAt() != null
                        && t.getCreatedAt().isAfter(Instant.now().minus(java.time.Duration.ofDays(1))))
                .toList();
        boolean isNewRecipient = request.getIsNewRecipient() != null ? request.getIsNewRecipient()
                : recent.stream().noneMatch(t ->
                        request.getRecipientUpi().equalsIgnoreCase(t.getRecipientUpi()));

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("transaction_id", UUID.randomUUID().toString());
        data.put("recipient_upi", request.getRecipientUpi());
        data.put("amount", request.getAmount());
        data.put("purpose", request.getPurpose());
        data.put("is_new_recipient", isNewRecipient);
        data.put("hour_of_day", now.getHour());
        data.put("day_of_week", now.getDayOfWeek().getValue() - 1); // Python weekday(): Monday=0
        data.put("transactions_last_hour",
                lastDay.stream().filter(t -> t.getCreatedAt().isAfter(Instant.now().minus(java.time.Duration.ofHours(1)))).count());
        data.put("transactions_last_day", lastDay.size());
        data.put("call_active", request.getCallActive() != null && request.getCallActive());
        if (request.getNote() != null) {
            data.put("note", request.getNote());
        }
        return data;
    }

    /**
     * Local fallback when the ai-service is unreachable — Python falls back to
     * its local risk engine; Spring uses the same transparent band rules.
     */
    private Map<String, Object> heuristicAssessment(double amount, TransactionAssessRequest request,
                                                    Map<String, Object> userProfile,
                                                    Map<String, Object> recipientProfile) {
        List<String> factors = new java.util.ArrayList<>();
        double score = 0.1;
        boolean isNewRecipient = Boolean.TRUE.equals(toBool(request.getIsNewRecipient()));

        if (amount >= 50000) {
            score += 0.3;
            factors.add("Very large amount (₹" + String.format(java.util.Locale.US, "%,.0f", amount) + ")");
        } else if (amount >= 10000) {
            score += 0.2;
            factors.add("Large amount (₹" + String.format(java.util.Locale.US, "%,.0f", amount) + ")");
        }
        if (isNewRecipient) {
            score += 0.15;
            factors.add("First payment to this recipient");
        }
        if (Boolean.TRUE.equals(toBool(request.getCallActive()))) {
            score += 0.25;
            factors.add("Transaction requested while on a call — social-engineering risk");
        }
        Object reports = recipientProfile.get("report_count");
        int reportCount = reports instanceof Number n ? n.intValue() : 0;
        if (reportCount >= 5) {
            score += 0.25;
            factors.add("Recipient has " + reportCount + " community fraud reports");
        } else if (reportCount >= 1) {
            score += 0.1;
            factors.add("Recipient has " + reportCount + " fraud report(s)");
        }
        int hour = LocalDateTime.now(java.time.ZoneOffset.UTC).getHour();
        if (hour >= 22 || hour <= 6) {
            score += 0.1;
            factors.add("Late-night transaction (" + hour + ":00)");
        }
        if (factors.isEmpty()) {
            factors.add("No major fraud indicators detected");
        }
        score = Math.min(score, 0.95);

        String level = score < 0.25 ? "low" : score < 0.5 ? "medium" : score < 0.75 ? "high" : "critical";
        String action = switch (level) {
            case "low", "medium" -> "allow";
            case "high" -> "review";
            default -> "block";
        };

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("risk_level", level);
        body.put("ensemble_score", score);
        body.put("recommended_action", action);
        body.put("risk_factors", factors);
        body.put("require_guardian_approval", "high".equals(level) || "critical".equals(level));
        body.put("transaction_id", UUID.randomUUID().toString());
        body.put("engine", "local-heuristic-fallback");
        return body;
    }

    private static Boolean toBool(Object value) {
        return value instanceof Boolean b ? b : null;
    }

    private static RiskAssessmentResponse syntheticResponse(Map<String, Object> heuristic) {
        return new RiskAssessmentResponse(
                "local", "heuristic", (String) heuristic.get("transaction_id"),
                (String) heuristic.get("risk_level"),
                heuristic.get("ensemble_score") instanceof Number n ? n.doubleValue() : 0.0,
                (String) heuristic.get("recommended_action"),
                Boolean.TRUE.equals(heuristic.get("require_guardian_approval")),
                heuristic.get("risk_factors") instanceof List<?> l ? (List<String>) l : List.of(),
                1.0, 0.0, List.of(), Map.of(), Map.of(), null, null);
    }

    @PostMapping("/create")
    public ResponseEntity<?> createPayment(
            @Valid @RequestBody CreatePaymentRequest request,
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        try {
            // Python create uses Depends(get_current_user_id): the payment always
            // belongs to the token's user, never a body-supplied id.
            UUID userId = UUID.fromString(authSupport.requireUserId(authHeader));

            // Derive a stable idempotency key so the same assessment can never
            // be double-submitted (retry / accidental double-tap).
            String idempotencyKey = request.getIdempotencyKey();
            if (idempotencyKey == null || idempotencyKey.isBlank()) {
                idempotencyKey = deriveIdempotencyKey(userId, request.getRecipientUpi(),
                        request.getAmount(), request.getRiskToken());
            }

            PaymentCommand command = new PaymentCommand(
                    userId,
                    request.getRecipientUpi(),
                    request.getAmount(),
                    request.getRiskToken(),
                    idempotencyKey
            );

            PaymentResult result = paymentCommandService.create(command);
            PaymentResultDTO dto = toDto(result);
            if (result.getStatus() == PaymentStatus.BLOCKED
                    || result.getStatus() == PaymentStatus.REJECTED) {
                return ResponseEntity.status(403).body(dto);
            }
            return ResponseEntity.ok(dto);
        } catch (InvalidAssessmentTokenException e) {
            // FastAPI contract: errors render as {"detail": "..."} so the
            // frontend toast reads the real reason.
            return ResponseEntity.status(403)
                    .body(Map.of("detail", e.getMessage() == null ? "Invalid risk token" : e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("detail", e.getMessage() == null ? "Invalid request" : e.getMessage()));
        }
    }

    /**
     * Resolve a payment the risk engine held for guardian approval.
     * "approve" debits the wallet and completes the payment; "reject" discards it.
     */
    @PostMapping("/guardian-decision")
    public ResponseEntity<PaymentResultDTO> guardianDecision(
            @Valid @RequestBody GuardianDecisionRequest request) {
        try {
            UUID userId = UUID.fromString(request.getUserId());
            String idempotencyKey = request.getIdempotencyKey();
            if (idempotencyKey == null || idempotencyKey.isBlank()) {
                idempotencyKey = deriveIdempotencyKey(userId, request.getRecipientUpi(),
                        request.getAmount(), request.getRiskToken());
            }

            PaymentCommand command = new PaymentCommand(
                    userId,
                    request.getRecipientUpi(),
                    request.getAmount(),
                    request.getRiskToken(),
                    idempotencyKey
            );

            PaymentResult result = paymentCommandService.createWithGuardian(command, request.getDecision());
            return ResponseEntity.ok(toDto(result));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(new PaymentResultDTO(false, e.getMessage(), null));
        }
    }

    private static PaymentResultDTO toDto(PaymentResult result) {
        String message = switch (result.getStatus()) {
            case COMPLETED -> "Payment completed";
            case GUARDIAN_PENDING -> "Payment requires guardian approval before it can be sent";
            default -> result.getReason();
        };
        return new PaymentResultDTO(
                result.getStatus() == PaymentStatus.COMPLETED
                        || result.getStatus() == PaymentStatus.GUARDIAN_PENDING,
                message,
                result.getStatus().name().toLowerCase(),
                result.getTransactionId() == null ? null : result.getTransactionId().toString(),
                result.getAmount(),
                result.getRemainingBalance(),
                result
        );
    }

    private static String deriveIdempotencyKey(UUID userId, String recipientUpi, BigDecimal amount, String riskToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            String raw = userId + "|" + recipientUpi + "|" + amount + "|" + riskToken;
            return HexFormat.of().formatHex(digest.digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            // SHA-256 is always available; fall back to the raw composite key.
            return userId + "|" + recipientUpi + "|" + amount + "|" + riskToken;
        }
    }

    @GetMapping("/history")
    public ResponseEntity<TransactionHistoryResponse> getHistory(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String userId) {

        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(pageSize, 1), 100);

        Page<PaymentTransaction> result;
        if (userId != null && !userId.isBlank()) {
            result = transactionRepository.findByUserIdOrderByCreatedAtDesc(
                    userId, PageRequest.of(safePage - 1, safeSize));
        } else {
            result = transactionRepository.findAll(PageRequest.of(safePage - 1, safeSize));
        }

        List<TransactionDTO> transactions = result.getContent().stream()
                .map(TransactionController::toTransactionDTO)
                .toList();

        return ResponseEntity.ok(new TransactionHistoryResponse(
                transactions, safePage, safeSize, result.getTotalElements()));
    }

    private static TransactionDTO toTransactionDTO(PaymentTransaction t) {
        // Blocked / held statuses imply elevated risk for the history view.
        double riskScore = switch (t.getStatus()) {
            case BLOCKED -> 0.9;
            case GUARDIAN_PENDING -> 0.7;
            case REJECTED -> 0.4;
            default -> 0.1;
        };
        return new TransactionDTO(
                t.getId() != null ? t.getId().toString() : null,
                "payment",
                t.getAmount(),
                t.getReason(),
                t.getRecipientUpi(),
                null,
                t.getCreatedAt(),
                t.getStatus() != null ? t.getStatus().name().toLowerCase() : "unknown",
                riskScore,
                "transfer"
        );
    }

    @PostMapping("/check-recipient")
    public ResponseEntity<RecipientCheckResponse> checkRecipient(@Valid @RequestBody CheckRecipientRequest request) {
        // Implementation would check recipient
        return ResponseEntity.ok(new RecipientCheckResponse(
                true, "Recipient verified", null, 100, false
        ));
    }

    // DTOs
    public static class CreatePaymentRequest {
        private String userId;
        private String recipientUpi;
        private BigDecimal amount;
        private String purpose;
        private String riskToken;
        private SensorData sensorData;
        private String idempotencyKey;

        public String getUserId() { return userId; }
        public void setUserId(String userId) { this.userId = userId; }
        public String getRecipientUpi() { return recipientUpi; }
        public void setRecipientUpi(String recipientUpi) { this.recipientUpi = recipientUpi; }
        public BigDecimal getAmount() { return amount; }
        public void setAmount(BigDecimal amount) { this.amount = amount; }
        public String getPurpose() { return purpose; }
        public void setPurpose(String purpose) { this.purpose = purpose; }
        public String getRiskToken() { return riskToken; }
        public void setRiskToken(String riskToken) { this.riskToken = riskToken; }
        public SensorData getSensorData() { return sensorData; }
        public void setSensorData(SensorData sensorData) { this.sensorData = sensorData; }
        public String getIdempotencyKey() { return idempotencyKey; }
        public void setIdempotencyKey(String idempotencyKey) { this.idempotencyKey = idempotencyKey; }
    }

    public static class GuardianDecisionRequest {
        private String userId;
        private String recipientUpi;
        private BigDecimal amount;
        private String riskToken;
        private String idempotencyKey;
        private String decision; // "approve" or "reject"

        public String getUserId() { return userId; }
        public void setUserId(String userId) { this.userId = userId; }
        public String getRecipientUpi() { return recipientUpi; }
        public void setRecipientUpi(String recipientUpi) { this.recipientUpi = recipientUpi; }
        public BigDecimal getAmount() { return amount; }
        public void setAmount(BigDecimal amount) { this.amount = amount; }
        public String getRiskToken() { return riskToken; }
        public void setRiskToken(String riskToken) { this.riskToken = riskToken; }
        public String getIdempotencyKey() { return idempotencyKey; }
        public void setIdempotencyKey(String idempotencyKey) { this.idempotencyKey = idempotencyKey; }
        public String getDecision() { return decision; }
        public void setDecision(String decision) { this.decision = decision; }
    }

    public static class SensorData {
        private Gyroscope gyroscope;
        private Accelerometer accelerometer;
        private double touchPressure;
        private double typingSpeed;

        public Gyroscope getGyroscope() { return gyroscope; }
        public void setGyroscope(Gyroscope gyroscope) { this.gyroscope = gyroscope; }
        public Accelerometer getAccelerometer() { return accelerometer; }
        public void setAccelerometer(Accelerometer accelerometer) { this.accelerometer = accelerometer; }
        public double getTouchPressure() { return touchPressure; }
        public void setTouchPressure(double touchPressure) { this.touchPressure = touchPressure; }
        public double getTypingSpeed() { return typingSpeed; }
        public void setTypingSpeed(double typingSpeed) { this.typingSpeed = typingSpeed; }
    }

    public static class Gyroscope {
        private double x, y, z;
        public double getX() { return x; }
        public void setX(double x) { this.x = x; }
        public double getY() { return y; }
        public void setY(double y) { this.y = y; }
        public double getZ() { return z; }
        public void setZ(double z) { this.z = z; }
    }

    public static class Accelerometer {
        private double x, y, z;
        public double getX() { return x; }
        public void setX(double x) { this.x = x; }
        public double getY() { return y; }
        public void setY(double y) { this.y = y; }
        public double getZ() { return z; }
        public void setZ(double z) { this.z = z; }
    }

    public static class PaymentResultDTO {
        private boolean success;
        private String message;
        /** Flattened so the frontend reads response.data.status directly (Python parity). */
        private String status;
        private String transactionId;
        private BigDecimal amount;
        private BigDecimal newBalance;
        private Object data;

        public PaymentResultDTO(boolean success, String message, Object data) {
            this(success, message, null, null, null, null, data);
        }

        public PaymentResultDTO(boolean success, String message, String status, String transactionId,
                                BigDecimal amount, BigDecimal newBalance, Object data) {
            this.success = success;
            this.message = message;
            this.status = status;
            this.transactionId = transactionId;
            this.amount = amount;
            this.newBalance = newBalance;
            this.data = data;
        }

        public boolean isSuccess() { return success; }
        public String getMessage() { return message; }
        public String getStatus() { return status; }
        public String getTransactionId() { return transactionId; }
        public BigDecimal getAmount() { return amount; }
        public BigDecimal getNewBalance() { return newBalance; }
        public Object getData() { return data; }
    }

    public static class TransactionHistoryResponse {
        private List<TransactionDTO> transactions;
        private int page;
        private int pageSize;
        private long total;

        public TransactionHistoryResponse(List<TransactionDTO> transactions, int page, int pageSize, long total) {
            this.transactions = transactions;
            this.page = page;
            this.pageSize = pageSize;
            this.total = total;
        }

        public List<TransactionDTO> getTransactions() { return transactions; }
        public int getPage() { return page; }
        public int getPageSize() { return pageSize; }
        public long getTotal() { return total; }
    }

    public static class TransactionDTO {
        private String id;
        private String type;
        private BigDecimal amount;
        private String description;
        private String counterpartyUpi;
        private String counterpartyName;
        private Instant timestamp;
        private String status;
        private double riskScore;
        private String category;

        public TransactionDTO(String id, String type, BigDecimal amount, String description,
                            String counterpartyUpi, String counterpartyName, Instant timestamp,
                            String status, double riskScore, String category) {
            this.id = id;
            this.type = type;
            this.amount = amount;
            this.description = description;
            this.counterpartyUpi = counterpartyUpi;
            this.counterpartyName = counterpartyName;
            this.timestamp = timestamp;
            this.status = status;
            this.riskScore = riskScore;
            this.category = category;
        }

        // Getters
        public String getId() { return id; }
        public String getType() { return type; }
        public BigDecimal getAmount() { return amount; }
        public String getDescription() { return description; }
        public String getCounterpartyUpi() { return counterpartyUpi; }
        public String getCounterpartyName() { return counterpartyName; }
        public Instant getTimestamp() { return timestamp; }
        public String getStatus() { return status; }
        public double getRiskScore() { return riskScore; }
        public String getCategory() { return category; }
    }

    public static class RecipientCheckResponse {
        private boolean verified;
        private String message;
        private String upiId;
        private int trustScore;
        private boolean isScammer;

        public RecipientCheckResponse(boolean verified, String message, String upiId, int trustScore, boolean isScammer) {
            this.verified = verified;
            this.message = message;
            this.upiId = upiId;
            this.trustScore = trustScore;
            this.isScammer = isScammer;
        }

        public boolean isVerified() { return verified; }
        public String getMessage() { return message; }
        public String getUpiId() { return upiId; }
        public int getTrustScore() { return trustScore; }
        public boolean isScammer() { return isScammer; }
    }

    public static class CheckRecipientRequest {
        private String upiId;

        public String getUpiId() { return upiId; }
        public void setUpiId(String upiId) { this.upiId = upiId; }
    }
}
