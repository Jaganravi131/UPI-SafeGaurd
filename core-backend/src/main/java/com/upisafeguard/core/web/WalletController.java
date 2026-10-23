package com.upisafeguard.core.web;

import com.upisafeguard.core.events.EventPublisherConfig;
import com.upisafeguard.core.events.EventTopics;
import com.upisafeguard.core.persistence.PaymentTransaction;
import com.upisafeguard.core.persistence.PaymentTransactionRepository;
import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.UserRepository;
import com.upisafeguard.core.persistence.Wallet;
import com.upisafeguard.core.persistence.WalletRepository;
import com.upisafeguard.core.wallet.WalletMoneyService;
import com.upisafeguard.core.wallet.WalletMoneyService.TopUpResult;
import com.upisafeguard.core.wallet.WalletMoneyService.TransferResult;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Wallet endpoints. Response shapes mirror the FastAPI contract in
 * backend/app/api/routes/wallet.py exactly — the frontend is built against it.
 */
@RestController
@RequestMapping("/api/v1/wallet")
public class WalletController {

    private final WalletMoneyService walletMoneyService;
    private final PaymentTransactionRepository transactionRepository;
    private final UserRepository userRepository;
    private final WalletRepository walletRepository;
    private final AuthSupport authSupport;
    private final com.upisafeguard.core.events.DomainEventPublisher events;
    private final com.upisafeguard.core.services.RateLimitService rateLimitService;

    @Autowired
    public WalletController(
            WalletMoneyService walletMoneyService,
            PaymentTransactionRepository transactionRepository,
            UserRepository userRepository,
            WalletRepository walletRepository,
            AuthSupport authSupport,
            com.upisafeguard.core.events.DomainEventPublisher events,
            com.upisafeguard.core.services.RateLimitService rateLimitService) {
        this.walletMoneyService = walletMoneyService;
        this.transactionRepository = transactionRepository;
        this.userRepository = userRepository;
        this.walletRepository = walletRepository;
        this.authSupport = authSupport;
        this.events = events;
        this.rateLimitService = rateLimitService;
    }

    @GetMapping("/balance/{userId}")
    public ResponseEntity<?> getBalance(
            @PathVariable String userId,
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        String tokenUser = authSupport.requireUserId(authHeader);
        User user = walletMoneyService.getUserOr404(userId);
        authSupport.assertOwner(tokenUser, user.getId().toString());
        Wallet wallet = walletMoneyService.ensureWallet(user);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("balance", wallet.getBalance());
        body.put("currency", wallet.getCurrency());
        body.put("daily_spent", wallet.getDailySpent());
        body.put("daily_limit", wallet.getDailyLimit());
        return ResponseEntity.ok(body);
    }

    @GetMapping("/info/{userId}")
    public ResponseEntity<?> getWalletInfo(
            @PathVariable String userId,
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        String tokenUser = authSupport.requireUserId(authHeader);
        User user = walletMoneyService.getUserOr404(userId);
        authSupport.assertOwner(tokenUser, user.getId().toString());
        Wallet wallet = walletMoneyService.ensureWallet(user);

        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("id", user.getId().toString());
        profile.put("full_name", user.getFullName());
        profile.put("email", user.getEmail());
        profile.put("phone_number", user.getPhoneNumber());
        profile.put("upi_id", user.getUpiId());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("wallet_id", wallet.getId().toString());
        body.put("user", profile);
        body.put("upi_id", user.getUpiId());
        body.put("balance", wallet.getBalance());
        body.put("currency", wallet.getCurrency());
        body.put("daily_spent", wallet.getDailySpent());
        body.put("daily_limit", wallet.getDailyLimit());
        body.put("is_sandbox", true);
        return ResponseEntity.ok(body);
    }

    @GetMapping("/transactions/{userId}")
    public ResponseEntity<?> getWalletTransactions(
            @PathVariable String userId,
            @RequestParam(defaultValue = "20") int limit,
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        String tokenUser = authSupport.requireUserId(authHeader);
        User user = walletMoneyService.getUserOr404(userId);
        authSupport.assertOwner(tokenUser, user.getId().toString());

        int safeLimit = Math.min(Math.max(limit, 1), 100);
        Pageable pageable = PageRequest.of(0, safeLimit);
        List<Map<String, Object>> rows = transactionRepository
                .findByUserIdOrderByCreatedAtDesc(user.getId().toString(), pageable)
                .getContent()
                .stream()
                .map(this::transactionRow)
                .toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("transactions", rows);
        return ResponseEntity.ok(body);
    }

    @PostMapping("/transfer/{userId}")
    public ResponseEntity<?> transfer(
            @PathVariable String userId,
            @Valid @RequestBody TransferRequest request,
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        String tokenUser = authSupport.requireUserId(authHeader);
        User user = walletMoneyService.getUserOr404(userId);
        authSupport.assertOwner(tokenUser, user.getId().toString());
        rateLimitService.transfer(user.getId().toString());

        TransferResult result = walletMoneyService.transfer(
                user, request.getRecipientUpi(), request.getAmount(), request.getNote());

        // Fan out the completion event (notifications etc.); fire-and-forget.
        events.publish(EventTopics.TRANSACTION_COMPLETED, user.getId().toString(),
                EventPublisherConfig.envelope("TRANSACTION_COMPLETED", Map.of(
                        "user_id", user.getId().toString(),
                        "kind", "transfer",
                        "transaction_id", result.ledger().transactionId().toString(),
                        "amount", request.getAmount().toPlainString(),
                        "recipient_upi", request.getRecipientUpi(),
                        "recipient_name", result.recipientName() == null ? "" : result.recipientName(),
                        "currency", result.currency())));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("message", "Paid Rs." + request.getAmount().setScale(2) + " to " + result.recipientName());
        body.put("transaction_id", result.ledger().transactionId().toString());
        body.put("balance", result.balance());
        body.put("new_balance", result.balance());
        body.put("currency", result.currency());
        return ResponseEntity.ok(body);
    }

    @PostMapping("/topup/{userId}")
    public ResponseEntity<?> topUp(
            @PathVariable String userId,
            @Valid @RequestBody TopUpRequest request,
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        String tokenUser = authSupport.requireUserId(authHeader);
        User user = walletMoneyService.getUserOr404(userId);
        authSupport.assertOwner(tokenUser, user.getId().toString());
        rateLimitService.transfer(user.getId().toString());

        TopUpResult result = walletMoneyService.topUp(user, request.getAmount(), request.getNote());

        events.publish(EventTopics.TRANSACTION_COMPLETED, user.getId().toString(),
                EventPublisherConfig.envelope("TRANSACTION_COMPLETED", Map.of(
                        "user_id", user.getId().toString(),
                        "kind", "topup",
                        "transaction_id", result.ledger().transactionId().toString(),
                        "amount", request.getAmount().toPlainString(),
                        "currency", result.currency())));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("message", "Added Rs." + request.getAmount().setScale(2) + " to your wallet");
        body.put("transaction_id", result.ledger().transactionId().toString());
        body.put("balance", result.balance());
        body.put("currency", result.currency());
        return ResponseEntity.ok(body);
    }

    /**
     * Credit/debit classification for history display. Top-ups are
     * `topup@…` rows; incoming transfers/payments carry an explicit
     * "Transfer received"/"Payment received" purpose marker on the receiver's row.
     */
    private Map<String, Object> transactionRow(PaymentTransaction txn) {
        String purpose = txn.getPurpose() == null ? "" : txn.getPurpose();
        boolean credit = (txn.getRecipientUpi() != null && txn.getRecipientUpi().startsWith("topup@"))
                || purpose.startsWith("Transfer received")
                || purpose.startsWith("Payment received");

        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", txn.getId().toString());
        row.put("recipient_upi", txn.getRecipientUpi());
        row.put("recipient_name", txn.getRecipientName());
        row.put("amount", txn.getAmount());
        row.put("purpose", txn.getPurpose());
        row.put("status", txn.getStatus() == null ? "pending" : txn.getStatus().name().toLowerCase());
        row.put("risk_level", txn.getRiskLevel() == null ? "low" : txn.getRiskLevel().toLowerCase());
        row.put("created_at", txn.getCreatedAt() == null ? null : txn.getCreatedAt().toString());
        row.put("type", credit ? "credit" : "debit");
        return row;
    }

    // ── Admin listings (called by the admin console frontend; absent from
    // the FastAPI reference — first backend to serve these) ────────────────

    /** Search users by name/email/UPI ID/phone for the admin console. */
    @GetMapping("/admin/search")
    public ResponseEntity<?> adminSearch(
            @RequestParam("q") String query,
            @RequestParam(defaultValue = "10") int limit,
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        authSupport.requireUserId(authHeader);
        String safeQuery = query == null ? "" : query.trim();
        int safeLimit = Math.min(Math.max(limit, 1), 50);

        List<Map<String, Object>> users = userRepository
                .searchUsers(safeQuery, PageRequest.of(0, safeLimit))
                .stream()
                .map(user -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", user.getId().toString());
                    row.put("full_name", user.getFullName());
                    row.put("email", user.getEmail());
                    row.put("phone_number", user.getPhoneNumber());
                    row.put("upi_id", user.getUpiId());
                    Wallet wallet = walletRepository.findByUserId(user.getId().toString()).orElse(null);
                    row.put("balance", wallet == null ? null : wallet.getBalance());
                    row.put("is_active", user.getIsActive());
                    return row;
                })
                .toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("users", users);
        body.put("count", users.size());
        return ResponseEntity.ok(body);
    }

    /** All wallet transactions platform-wide, newest first. */
    @GetMapping("/admin/all-transactions")
    public ResponseEntity<?> adminAllTransactions(
            @RequestParam(required = false, name = "limit") Integer limit,
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        authSupport.requireUserId(authHeader);
        int safeLimit = limit == null ? 50 : Math.min(Math.max(limit, 1), 200);

        List<Map<String, Object>> rows = transactionRepository
                .findAllByOrderByCreatedAtDesc(PageRequest.of(0, safeLimit))
                .stream()
                .map(this::adminTransactionRow)
                .toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("transactions", rows);
        body.put("count", rows.size());
        return ResponseEntity.ok(body);
    }

    /** Same shape as {@link #transactionRow} plus the owning user for admin views. */
    private Map<String, Object> adminTransactionRow(PaymentTransaction txn) {
        Map<String, Object> row = transactionRow(txn);
        row.put("user_id", txn.getUserId());
        return row;
    }

    // ── DTOs ─────────────────────────────────────────────────────────────────

    public static class TransferRequest {
        /**
         * Frontend payloads use the FastAPI snake_case key;
         * {@code @JsonAlias} accepts both spellings.
         */
        @com.fasterxml.jackson.annotation.JsonAlias({"recipient_upi"})
        private String recipientUpi;
        private BigDecimal amount;
        private String note;

        public String getRecipientUpi() { return recipientUpi; }

        public void setRecipientUpi(String recipientUpi) { this.recipientUpi = recipientUpi; }
        public BigDecimal getAmount() { return amount; }
        public void setAmount(BigDecimal amount) { this.amount = amount; }
        public String getNote() { return note; }
        public void setNote(String note) { this.note = note; }
    }

    public static class TopUpRequest {
        private BigDecimal amount;
        private String note;

        public BigDecimal getAmount() { return amount; }
        public void setAmount(BigDecimal amount) { this.amount = amount; }
        public String getNote() { return note; }
        public void setNote(String note) { this.note = note; }
    }
}
