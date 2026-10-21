package com.upisafeguard.core.web;

import com.upisafeguard.core.persistence.Wallet;
import com.upisafeguard.core.persistence.WalletRepository;
import com.upisafeguard.core.persistence.UserRepository;
import com.upisafeguard.core.persistence.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/wallet")
public class WalletController {

    private final WalletRepository walletRepository;
    private final UserRepository userRepository;

    @Autowired
    public WalletController(WalletRepository walletRepository, UserRepository userRepository) {
        this.walletRepository = walletRepository;
        this.userRepository = userRepository;
    }

    @GetMapping("/balance/{userId}")
    public ResponseEntity<?> getBalance(@PathVariable String userId) {
        try {
            UUID uuid = UUID.fromString(userId);
            Optional<Wallet> walletOpt = walletRepository.findByUserId(uuid.toString());

            if (walletOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            Wallet wallet = walletOpt.get();
            return ResponseEntity.ok(new BalanceResponse(wallet.getBalance()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body("Invalid user ID format");
        }
    }

    @GetMapping("/info/{userId}")
    public ResponseEntity<?> getWalletInfo(@PathVariable String userId) {
        try {
            UUID uuid = UUID.fromString(userId);
            Optional<Wallet> walletOpt = walletRepository.findByUserId(uuid.toString());

            if (walletOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            Wallet wallet = walletOpt.get();
            return ResponseEntity.ok(new WalletInfoResponse(
                    wallet.getBalance(),
                    wallet.getDailyLimit(),
                    wallet.getDailySpent(),
                    wallet.getCurrency()
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body("Invalid user ID format");
        }
    }

    @PostMapping("/transfer/{userId}")
    public ResponseEntity<?> transfer(
            @PathVariable String userId,
            @RequestBody TransferRequest request) {
        try {
            UUID uuid = UUID.fromString(userId);
            Optional<Wallet> walletOpt = walletRepository.findByUserId(uuid.toString());

            if (walletOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            Wallet wallet = walletOpt.get();
            BigDecimal amount = request.getAmount();

            if (amount.compareTo(BigDecimal.ZERO) <= 0) {
                return ResponseEntity.badRequest().body("Amount must be positive");
            }

            if (wallet.getBalance().compareTo(amount) < 0) {
                return ResponseEntity.badRequest().body("Insufficient balance");
            }

            // Check daily limit
            BigDecimal newDailySpent = wallet.getDailySpent().add(amount);
            if (newDailySpent.compareTo(wallet.getDailyLimit()) > 0) {
                return ResponseEntity.badRequest().body("Daily limit exceeded");
            }

            wallet.debit(amount);
            wallet.setDailySpent(newDailySpent);
            walletRepository.save(wallet);

            return ResponseEntity.ok(new TransferResponse(
                    wallet.getBalance(),
                    "Transfer successful"
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body("Invalid user ID format");
        }
    }

    // DTOs
    public static class BalanceResponse {
        private BigDecimal balance;

        public BalanceResponse(BigDecimal balance) {
            this.balance = balance;
        }

        public BigDecimal getBalance() { return balance; }
    }

    public static class WalletInfoResponse {
        private BigDecimal balance;
        private BigDecimal dailyLimit;
        private BigDecimal dailySpent;
        private String currency;

        public WalletInfoResponse(BigDecimal balance, BigDecimal dailyLimit, BigDecimal dailySpent, String currency) {
            this.balance = balance;
            this.dailyLimit = dailyLimit;
            this.dailySpent = dailySpent;
            this.currency = currency;
        }

        public BigDecimal getBalance() { return balance; }
        public BigDecimal getDailyLimit() { return dailyLimit; }
        public BigDecimal getDailySpent() { return dailySpent; }
        public String getCurrency() { return currency; }
    }

    public static class TransferRequest {
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

    public static class TransferResponse {
        private BigDecimal remainingBalance;
        private String message;

        public TransferResponse(BigDecimal remainingBalance, String message) {
            this.remainingBalance = remainingBalance;
            this.message = message;
        }

        public BigDecimal getRemainingBalance() { return remainingBalance; }
        public String getMessage() { return message; }
    }
}