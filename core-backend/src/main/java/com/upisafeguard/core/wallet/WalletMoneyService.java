package com.upisafeguard.core.wallet;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.upisafeguard.core.web.ApiRequestException;
import com.upisafeguard.core.payment.PaymentStatus;
import com.upisafeguard.core.persistence.PaymentTransaction;
import com.upisafeguard.core.persistence.PaymentTransactionRepository;
import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.UserRepository;
import com.upisafeguard.core.persistence.Wallet;
import com.upisafeguard.core.persistence.WalletRepository;

/**
 * Sandbox banking for the wallet endpoints: Add-Money top-ups with a per
 * transaction cap, and wallet-to-wallet transfers between UPI SafeGuard users
 * with a ledger entry on both sides (debit for sender, credit for receiver),
 * mirroring the established FastAPI contract the frontend is built against.
 */
@Service
public class WalletMoneyService {

    /** Per top-up cap so the demo sandbox stays sane. */
    public static final BigDecimal SANDBOX_TOPUP_MAX = new BigDecimal("10000.00");

    private static final String TOPUP_UPI = "topup@upisafeguard";
    private static final String TOPUP_NAME = "Add Money (Sandbox Bank)";

    private final WalletRepository walletRepository;
    private final UserRepository userRepository;
    private final PaymentTransactionRepository transactionRepository;

    public WalletMoneyService(
            WalletRepository walletRepository,
            UserRepository userRepository,
            PaymentTransactionRepository transactionRepository) {
        this.walletRepository = walletRepository;
        this.userRepository = userRepository;
        this.transactionRepository = transactionRepository;
    }

    // ── Results ──────────────────────────────────────────────────────────────

    public record LedgerEntry(
            UUID transactionId,
            String recipientUpi,
            String recipientName,
            BigDecimal amount,
            String purpose,
            String status,
            Instant createdAt) {
    }

    public record TopUpResult(LedgerEntry ledger, BigDecimal balance, String currency) {
    }

    public record TransferResult(
            LedgerEntry ledger,
            BigDecimal balance,
            String currency,
            String recipientName) {
    }

    // ── Lookups ──────────────────────────────────────────────────────────────

    public User getUserOr404(String userId) {
        UUID uuid;
        try {
            uuid = UUID.fromString(userId);
        } catch (IllegalArgumentException e) {
            throw new ApiRequestException(HttpStatus.BAD_REQUEST, "Invalid user id");
        }
        return userRepository.findById(uuid)
                .orElseThrow(() -> new ApiRequestException(HttpStatus.NOT_FOUND, "User not found"));
    }

    /** Lazily provision a wallet for users that registered before wallets existed. */
    public Wallet ensureWallet(User user) {
        return walletRepository.findByUserId(user.getId().toString())
                .orElseGet(() -> walletRepository.save(new Wallet(user.getId(), BigDecimal.ZERO)));
    }

    // ── Add Money ────────────────────────────────────────────────────────────

    @Transactional
    public TopUpResult topUp(User user, BigDecimal amount, String note) {
        if (amount == null || amount.signum() <= 0) {
            throw new ApiRequestException(HttpStatus.BAD_REQUEST, "Amount must be positive");
        }
        if (amount.compareTo(SANDBOX_TOPUP_MAX) > 0) {
            throw new ApiRequestException(HttpStatus.BAD_REQUEST,
                    "Sandbox top-up capped at Rs.10,000.00 per transaction");
        }

        Wallet wallet = ensureWallet(user);
        wallet.setBalance(wallet.getBalance().add(amount));
        walletRepository.save(wallet);

        PaymentTransaction ledger = ledger(
                user.getId(),
                TOPUP_UPI,
                TOPUP_NAME,
                amount,
                (note == null || note.isBlank()) ? "Sandbox top-up" : note);
        transactionRepository.save(ledger);

        return new TopUpResult(
                toLedger(ledger),
                wallet.getBalance(),
                wallet.getCurrency());
    }

    // ── Wallet-to-wallet transfer ────────────────────────────────────────────

    @Transactional
    public TransferResult transfer(User user, String recipientUpi, BigDecimal amount, String note) {
        if (amount == null || amount.signum() <= 0) {
            throw new ApiRequestException(HttpStatus.BAD_REQUEST, "Amount must be positive");
        }

        User recipient = userRepository.findByUpiId(recipientUpi)
                .orElseThrow(() -> new ApiRequestException(HttpStatus.NOT_FOUND,
                        "No UPI SafeGuard user found for that UPI ID. Add Money first or use another handle."));
        if (recipient.getId().equals(user.getId())) {
            throw new ApiRequestException(HttpStatus.BAD_REQUEST, "Cannot pay yourself");
        }

        Wallet senderWallet = ensureWallet(user);
        if (senderWallet.getBalance().compareTo(amount) < 0) {
            throw new ApiRequestException(HttpStatus.BAD_REQUEST,
                    "Insufficient wallet balance. Available: Rs." + senderWallet.getBalance().setScale(2));
        }

        BigDecimal newDailySpent = senderWallet.getDailySpent().add(amount);
        if (senderWallet.getDailyLimit() != null
                && newDailySpent.compareTo(senderWallet.getDailyLimit()) > 0) {
            throw new ApiRequestException(HttpStatus.BAD_REQUEST, "Daily limit exceeded");
        }

        // Debit sender, credit receiver — one atomic transaction
        senderWallet.debit(amount);
        senderWallet.setDailySpent(newDailySpent);
        walletRepository.save(senderWallet);

        Wallet recipientWallet = ensureWallet(recipient);
        recipientWallet.setBalance(recipientWallet.getBalance().add(amount));
        walletRepository.save(recipientWallet);

        // Sender ledger: debit row pointing at the receiver's UPI
        PaymentTransaction debitLedger = ledger(
                user.getId(),
                recipientUpi,
                recipient.getFullName(),
                amount,
                (note == null || note.isBlank()) ? "UPI transfer" : note);
        transactionRepository.save(debitLedger);

        // Receiver ledger: credit row pointing back at the sender so their
        // history shows the incoming payment as a credit
        String senderUpi = (user.getUpiId() == null || user.getUpiId().isBlank())
                ? "sender:" + user.getPhoneNumber()
                : user.getUpiId();
        PaymentTransaction creditLedger = ledger(
                recipient.getId(),
                senderUpi,
                user.getFullName(),
                amount,
                (note == null || note.isBlank())
                        ? "Transfer received"
                        : "Transfer received \u2014 " + note);
        transactionRepository.save(creditLedger);

        return new TransferResult(
                toLedger(debitLedger),
                senderWallet.getBalance(),
                senderWallet.getCurrency(),
                recipient.getFullName());
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private PaymentTransaction ledger(UUID ownerUserId, String recipientUpi, String recipientName,
            BigDecimal amount, String purpose) {
        PaymentTransaction txn = new PaymentTransaction(
                ownerUserId,
                recipientUpi,
                amount,
                // Ledger rows have no client idempotency key; a unique marker keeps
                // the (user_id, key) unique constraint satisfied per row.
                "ledger-" + UUID.randomUUID(),
                PaymentStatus.COMPLETED,
                "Wallet ledger entry");
        txn.setRecipientName(recipientName);
        txn.setPurpose(purpose);
        txn.setRiskLevel("LOW");
        txn.setCompletedAt(Instant.now());
        return txn;
    }

    private LedgerEntry toLedger(PaymentTransaction txn) {
        return new LedgerEntry(
                txn.getId(),
                txn.getRecipientUpi(),
                txn.getRecipientName(),
                txn.getAmount(),
                txn.getPurpose(),
                txn.getStatus() == null ? "pending" : txn.getStatus().name().toLowerCase(),
                txn.getCreatedAt());
    }
}
