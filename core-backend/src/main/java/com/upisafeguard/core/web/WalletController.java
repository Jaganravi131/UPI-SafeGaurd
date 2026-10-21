package com.upisafeguard.core.web;

import com.upisafeguard.core.persistence.PaymentTransaction;
import com.upisafeguard.core.persistence.PaymentTransactionRepository;
import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.Wallet;
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
    private final AuthSupport authSupport;

    @Autowired
    public WalletController(
            WalletMoneyService walletMoneyService,
            PaymentTransactionRepository transactionRepository,
            AuthSupport authSupport) {
        this.walletMoneyService = walletMoneyService;
        this.transactionRepository = transactionRepository;
        this.authSupport = authSupport;
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

        TransferResult result = walletMoneyService.transfer(
                user, request.getRecipientUpi(), request.getAmount(), request.getNote());

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

        TopUpResult result = walletMoneyService.topUp(user, request.getAmount(), request.getNote());

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
