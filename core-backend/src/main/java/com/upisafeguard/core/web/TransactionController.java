package com.upisafeguard.core.web;

import com.upisafeguard.core.persistence.PaymentTransaction;
import com.upisafeguard.core.persistence.PaymentTransactionRepository;
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
import java.util.HexFormat;
import java.util.List;
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

    @Autowired
    public TransactionController(
            PaymentCommandService paymentCommandService,
            AssessmentTokenService assessmentTokenService,
            RiskServiceClient riskServiceClient,
            PaymentTransactionRepository transactionRepository,
            WalletRepository walletRepository,
            UserRepository userRepository) {
        this.paymentCommandService = paymentCommandService;
        this.assessmentTokenService = assessmentTokenService;
        this.riskServiceClient = riskServiceClient;
        this.transactionRepository = transactionRepository;
        this.walletRepository = walletRepository;
        this.userRepository = userRepository;
    }

    @PostMapping("/assess-risk")
    public ResponseEntity<RiskAssessmentResponse> assessRisk(@Valid @RequestBody RiskAssessmentRequest request) {
        RiskAssessmentResponse response = riskServiceClient.assess(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/create")
    public ResponseEntity<PaymentResultDTO> createPayment(@Valid @RequestBody CreatePaymentRequest request) {
        try {
            UUID userId = UUID.fromString(request.getUserId());

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
            return ResponseEntity.status(403)
                    .body(new PaymentResultDTO(false, e.getMessage(), null));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(new PaymentResultDTO(false, e.getMessage(), null));
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
        private Object data;

        public PaymentResultDTO(boolean success, String message, Object data) {
            this.success = success;
            this.message = message;
            this.data = data;
        }

        public boolean isSuccess() { return success; }
        public String getMessage() { return message; }
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
