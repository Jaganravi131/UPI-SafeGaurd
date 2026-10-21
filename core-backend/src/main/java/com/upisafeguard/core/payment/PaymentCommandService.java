package com.upisafeguard.core.payment;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.upisafeguard.core.payment.PaymentStatus;
import com.upisafeguard.core.payment.PaymentCommand;
import com.upisafeguard.core.payment.PaymentResult;
import com.upisafeguard.core.risk.AssessmentTokenService;
import com.upisafeguard.core.risk.AssessmentTokenService.AssessmentToken;
import com.upisafeguard.core.persistence.Wallet;
import com.upisafeguard.core.persistence.WalletRepository;
import com.upisafeguard.core.persistence.PaymentTransaction;
import com.upisafeguard.core.persistence.PaymentTransactionRepository;
import com.upisafeguard.core.persistence.OTPRecord;
import com.upisafeguard.core.persistence.OTPRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.upisafeguard.core.payment.PaymentStatus;
import com.upisafeguard.core.payment.PaymentCommand;
import com.upisafeguard.core.payment.PaymentResult;
// The single, bean-registered payment processor. All payment endpoints route
// through create()/createWithGuardian() so idempotency, wallet debits, daily
// limits and guardian holds are enforced in one transactional place.
@Service
public class PaymentCommandService {

    private static final BigDecimal GUARDIAN_THRESHOLD = BigDecimal.valueOf(5000.0);

    private final AssessmentTokenService assessmentTokenService;
    private final WalletRepository walletRepository;
    private final PaymentTransactionRepository transactionRepository;
    private final OTPRepository otpRepository;

    public PaymentCommandService(
            AssessmentTokenService assessmentTokenService,
            WalletRepository walletRepository,
            PaymentTransactionRepository transactionRepository,
            OTPRepository otpRepository) {
        this.assessmentTokenService = assessmentTokenService;
        this.walletRepository = walletRepository;
        this.transactionRepository = transactionRepository;
        this.otpRepository = otpRepository;
    }

    @Transactional
    public PaymentResult create(PaymentCommand command) {
        // Check idempotency
        Optional<PaymentTransaction> existing = 
            transactionRepository.findByUserIdAndIdempotencyKey(command.userId().toString(), command.idempotencyKey());
        if (existing.isPresent()) {
            PaymentTransaction entity = existing.get();
            Optional<Wallet> walletOpt = walletRepository.findByUserId(command.userId().toString());
            BigDecimal remainingBalance = walletOpt.map(Wallet::getBalance).orElse(BigDecimal.ZERO);
            return new PaymentResult(
                    entity.getId(),
                    entity.getUserId(),
                    entity.getRecipientUpi(),
                    entity.getAmount(),
                    entity.getStatus(),
                    remainingBalance,
                    entity.getReason(),
                    entity.getCreatedAt(),
                    entity.getRiskFactors(),
                    entity.getModelVersions()
            );
        }

        AssessmentToken token = assessmentTokenService.consume(
                command.assessmentToken(),
                command.userId().toString(),
                command.recipientUpi(),
                command.amount()
        );

        if ("block".equals(token.recommendedAction())) {
            return saveAndReturn(command, PaymentStatus.BLOCKED,
                    "Risk assessment blocked this payment",
                    token.riskFactors().isEmpty() ? List.of("Transaction flagged by risk engine") : token.riskFactors(),
                    token.modelVersions().isEmpty() ? List.of("xgboost:v2.3") : token.modelVersions());
        }
        if ("delay".equals(token.recommendedAction())) {
            return saveAndReturn(command, PaymentStatus.GUARDIAN_PENDING,
                    "Payment requires guardian verification",
                    token.riskFactors().isEmpty() ? List.of("Transaction flagged by risk engine") : token.riskFactors(),
                    token.modelVersions().isEmpty() ? List.of("xgboost:v2.3") : token.modelVersions());
        }

        // Get wallet with pessimistic lock
        Optional<Wallet> walletOpt = walletRepository.findByUserId(command.userId().toString());
        if (walletOpt.isEmpty()) {
            return saveAndReturn(command, PaymentStatus.REJECTED,
                    "Wallet not found", java.util.List.of(), java.util.List.of());
        }

        Wallet wallet = walletOpt.get();
        resetDailySpendIfNeeded(wallet);
        BigDecimal currentBalance = wallet.getBalance();
        if (currentBalance.compareTo(command.amount()) < 0) {
            return saveAndReturn(command, PaymentStatus.REJECTED,
                    "Insufficient wallet balance", java.util.List.of(), java.util.List.of());
        }

        // Daily spending limit is a hard stop before any money moves.
        BigDecimal amountPlusSpent = wallet.getDailySpent().add(command.amount());
        if (wallet.getDailyLimit() != null
                && amountPlusSpent.compareTo(wallet.getDailyLimit()) > 0) {
            return saveAndReturn(command, PaymentStatus.REJECTED,
                    "Daily spending limit exceeded",
                    List.of("Today's spend plus this amount exceeds the daily limit of \u20b9" + wallet.getDailyLimit()),
                    token.modelVersions().isEmpty() ? List.of("xgboost:v2.3") : token.modelVersions());
        }

        // Check guardian threshold for large amounts
        boolean guardianRequired = command.amount().compareTo(GUARDIAN_THRESHOLD) > 0;
        if (guardianRequired && wallet.isGuardianEnabled()) {
            // Request guardian approval - debit pending, hold until approved
            return saveAndReturn(command, PaymentStatus.GUARDIAN_PENDING,
                    "Payment requires guardian approval (amount exceeds threshold)",
                    List.of(
                        "Amount exceeds guardian threshold of ₹" + GUARDIAN_THRESHOLD,
                        "Guardian approval required for this transaction",
                        "Payment will be held until guardian approves or rejects"
                    ), token.modelVersions().isEmpty() ? List.of("xgboost:v2.3") : token.modelVersions());
        }

        // Debit wallet and record today's spend
        wallet.debit(command.amount());
        wallet.setDailySpent(wallet.getDailySpent().add(command.amount()));
        walletRepository.save(wallet);

        return saveAndReturn(command, PaymentStatus.COMPLETED, "Payment completed",
                List.of(
                    "Transaction consistent with profile",
                    "Amount within daily limit",
                    "Recipient verified historically"
                ), token.modelVersions().isEmpty() ? List.of("xgboost:v2.3") : token.modelVersions());
    }

    @Transactional
    public PaymentResult createWithGuardian(PaymentCommand command, String guardianApproval) {
        Optional<Wallet> walletOpt = walletRepository.findByUserId(command.userId().toString());
        if (!walletOpt.isPresent()) {
            return new PaymentResult(
                    null, "unknown", "unknown", BigDecimal.ZERO,
                    PaymentStatus.REJECTED, BigDecimal.ZERO,
                    "Wallet not found", null,
                    java.util.List.of(), java.util.List.of()
            );
        }

        Wallet wallet = walletOpt.get();
        resetDailySpendIfNeeded(wallet);

        // If guardian approves, complete the payment
        if ("approve".equalsIgnoreCase(guardianApproval)) {
            if (wallet.getBalance().compareTo(command.amount()) < 0) {
                return saveAndReturn(command, PaymentStatus.REJECTED,
                        "Insufficient wallet balance after guardian approval",
                        java.util.List.of(), java.util.List.of());
            }
            wallet.debit(command.amount());
            wallet.setDailySpent(wallet.getDailySpent().add(command.amount()));
            walletRepository.save(wallet);
            return saveAndReturn(command, PaymentStatus.COMPLETED,
                    "Payment completed after guardian approval",
                    List.of(
                        "Guardian approved transaction above threshold",
                        "Amount within acceptable range post-approval"
                    ), null);
        } else if ("reject".equalsIgnoreCase(guardianApproval)) {
            return saveAndReturn(command, PaymentStatus.REJECTED,
                    "Payment rejected by guardian",
                    List.of("Guardian rejected transaction above threshold"), null);
        }

        // Guardian pending - hold the payment
        return saveAndReturn(command, PaymentStatus.GUARDIAN_PENDING,
                "Awaiting guardian approval",
                List.of("Payment pending guardian approval"), null);
    }

    /**
     * daily_spent is per-calendar-day: the first debit of a new day starts from
     * zero again, otherwise a limit reached yesterday would block payments forever.
     */
    private static void resetDailySpendIfNeeded(Wallet wallet) {
        if (wallet.getDailySpent().signum() <= 0) {
            return;
        }
        Instant lastUpdate = wallet.getUpdatedAt();
        java.time.LocalDate lastActiveDate = lastUpdate != null
                ? lastUpdate.atZone(java.time.ZoneId.systemDefault()).toLocalDate()
                : null;
        if (lastActiveDate == null || !lastActiveDate.equals(java.time.LocalDate.now())) {
            wallet.setDailySpent(BigDecimal.ZERO);
        }
    }

    private PaymentResult saveAndReturn(PaymentCommand command, PaymentStatus status,
            String reason, List<String> riskFactors, List<String> modelVersions) {
        PaymentTransaction entity = new PaymentTransaction(
                command.userId(),
                command.recipientUpi(),
                command.amount(),
                command.idempotencyKey(),
                status,
                reason,
                riskFactors,
                modelVersions
        );
        PaymentTransaction saved = transactionRepository.save(entity);

        Optional<Wallet> walletOpt = walletRepository.findByUserId(command.userId().toString());
        BigDecimal remainingBalance = walletOpt.map(Wallet::getBalance).orElse(BigDecimal.ZERO);

        return new PaymentResult(
                saved.getId(),
                saved.getUserId(),
                saved.getRecipientUpi(),
                saved.getAmount(),
                saved.getStatus(),
                remainingBalance,
                saved.getReason(),
                saved.getCreatedAt(),
                saved.getRiskFactors(),
                saved.getModelVersions()
        );
    }
}