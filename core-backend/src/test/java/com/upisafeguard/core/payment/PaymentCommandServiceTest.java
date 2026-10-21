package com.upisafeguard.core.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

import com.upisafeguard.core.payment.PaymentStatus;
import com.upisafeguard.core.payment.PaymentCommand;
import com.upisafeguard.core.payment.PaymentResult;
import com.upisafeguard.core.risk.AssessmentTokenService;
import com.upisafeguard.core.persistence.Wallet;
import com.upisafeguard.core.persistence.WalletRepository;
import com.upisafeguard.core.persistence.UserRepository;
import com.upisafeguard.core.persistence.PaymentTransaction;
import com.upisafeguard.core.persistence.PaymentTransactionRepository;
import com.upisafeguard.core.persistence.OTPRepository;

@ExtendWith(MockitoExtension.class)
class PaymentCommandServiceTest {

    private static final UUID TEST_USER_ID = UUID.fromString("550e8400-e29b-41d4-a716-446655440000");
    private static final String TEST_USER_ID_STR = "550e8400-e29b-41d4-a716-446655440000";

    @Test
    void completesOnceAndReturnsSameResultForDuplicateCommand() {
        AssessmentTokenService tokenService = mock(AssessmentTokenService.class);
        WalletRepository walletRepository = mock(WalletRepository.class);
        PaymentTransactionRepository transactionRepository = mock(PaymentTransactionRepository.class);
        OTPRepository otpRepository = mock(OTPRepository.class);
        UserRepository userRepository = mock(UserRepository.class);
        PaymentCommandService payments = new PaymentCommandService(tokenService, walletRepository, transactionRepository, otpRepository, userRepository);

        UUID userId = UUID.fromString("550e8400-e29b-41d4-a716-446655440000");
        
        // Use a single wallet object that will be mutated in place
        Wallet wallet = new Wallet(userId, BigDecimal.valueOf(1000));
        when(walletRepository.findByUserId(eq(userId.toString()))).thenReturn(Optional.of(wallet));
        when(walletRepository.save(any(Wallet.class))).thenAnswer(inv -> inv.getArgument(0));
        when(transactionRepository.save(any(PaymentTransaction.class))).thenAnswer(inv -> inv.getArgument(0));
        when(transactionRepository.findByUserIdAndIdempotencyKey(eq(TEST_USER_ID_STR), eq("key-1")))
                .thenReturn(Optional.empty())  // First call - no existing transaction
                .thenReturn(Optional.of(new PaymentTransaction(
                        userId,
                        "merchant@upi",
                        BigDecimal.valueOf(300),
                        "key-1",
                        PaymentStatus.COMPLETED,
                        "Payment completed",
                        List.of("Transaction consistent with profile", "Amount within daily limit", "Recipient verified historically"),
                        List.of("xgboost:v2.3")
                ))); // Second call - duplicate detected

        AssessmentTokenService.AssessmentToken token = new AssessmentTokenService.AssessmentToken(
                "550e8400-e29b-41d4-a716-446655440000", "merchant@upi", BigDecimal.valueOf(300), "proceed", Instant.now().plusSeconds(300), List.of(), List.of(), "test rationale"
        );
        when(tokenService.consume(anyString(), eq(TEST_USER_ID_STR), eq("merchant@upi"), eq(BigDecimal.valueOf(300))))
                .thenReturn(new AssessmentTokenService.AssessmentToken(
                        "550e8400-e29b-41d4-a716-446655440000", "merchant@upi", BigDecimal.valueOf(300), "proceed", Instant.now().plusSeconds(300), List.of(), List.of(), "test rationale"
                ));

        PaymentCommand command = command("test-token", "key-1", 300);
        PaymentResult first = payments.create(command);
        PaymentResult duplicate = payments.create(command);

        assertThat(first.getStatus()).isEqualTo(PaymentStatus.COMPLETED);
        assertThat(first.getRemainingBalance()).isEqualByComparingTo(BigDecimal.valueOf(700));
        assertThat(duplicate).isEqualTo(first);
    }

    @Test
    void blocksWithoutDebitingWallet() {
        AssessmentTokenService tokenService = mock(AssessmentTokenService.class);
        WalletRepository walletRepository = mock(WalletRepository.class);
        PaymentTransactionRepository transactionRepository = mock(PaymentTransactionRepository.class);
        OTPRepository otpRepository = mock(OTPRepository.class);
        UserRepository userRepository = mock(UserRepository.class);
        PaymentCommandService payments = new PaymentCommandService(tokenService, walletRepository, transactionRepository, otpRepository, userRepository);

        UUID userId = UUID.fromString("550e8400-e29b-41d4-a716-446655440000");
        Wallet wallet = new Wallet(userId, BigDecimal.valueOf(1000));
        when(walletRepository.findByUserId(eq(userId.toString()))).thenReturn(Optional.of(wallet));
        when(transactionRepository.save(any(PaymentTransaction.class))).thenAnswer(inv -> inv.getArgument(0));
        when(transactionRepository.findByUserIdAndIdempotencyKey(eq(TEST_USER_ID_STR), eq("key-block"))).thenReturn(Optional.empty());

        AssessmentTokenService.AssessmentToken blockToken = new AssessmentTokenService.AssessmentToken(
                "550e8400-e29b-41d4-a716-446655440000", "merchant@upi", BigDecimal.valueOf(300), "block", Instant.now().plusSeconds(300), List.of(), List.of(), "block rationale"
        );
        when(tokenService.consume(anyString(), eq(TEST_USER_ID_STR), eq("merchant@upi"), eq(BigDecimal.valueOf(300))))
                .thenReturn(new AssessmentTokenService.AssessmentToken(
                        "550e8400-e29b-41d4-a716-446655440000", "merchant@upi", BigDecimal.valueOf(300), "block", Instant.now().plusSeconds(300), List.of(), List.of(), "block rationale"
                ));

        PaymentResult result = payments.create(command("test-token", "key-block", 300));

        assertThat(result.getStatus()).isEqualTo(PaymentStatus.BLOCKED);
        verify(walletRepository).findByUserId(userId.toString());
    }

    @Test
    void rejectsInsufficientBalanceWithoutNegativeBalance() {
        AssessmentTokenService tokenService = mock(AssessmentTokenService.class);
        WalletRepository walletRepository = mock(WalletRepository.class);
        PaymentTransactionRepository transactionRepository = mock(PaymentTransactionRepository.class);
        OTPRepository otpRepository = mock(OTPRepository.class);
        UserRepository userRepository = mock(UserRepository.class);
        PaymentCommandService payments = new PaymentCommandService(tokenService, walletRepository, transactionRepository, otpRepository, userRepository);

        UUID userId = UUID.fromString("550e8400-e29b-41d4-a716-446655440000");
        Wallet wallet = new Wallet(userId, BigDecimal.valueOf(100));
        when(walletRepository.findByUserId(eq(userId.toString()))).thenReturn(Optional.of(wallet));
        when(transactionRepository.save(any(PaymentTransaction.class))).thenAnswer(inv -> inv.getArgument(0));
        when(transactionRepository.findByUserIdAndIdempotencyKey(eq(TEST_USER_ID_STR), eq("key-low-balance"))).thenReturn(Optional.empty());

        AssessmentTokenService.AssessmentToken proceedToken = new AssessmentTokenService.AssessmentToken(
                "550e8400-e29b-41d4-a716-446655440000", "merchant@upi", BigDecimal.valueOf(300), "proceed", Instant.now().plusSeconds(300), List.of(), List.of(), "proceed rationale"
        );
        when(tokenService.consume(anyString(), eq(TEST_USER_ID_STR), eq("merchant@upi"), eq(BigDecimal.valueOf(300))))
                .thenReturn(new AssessmentTokenService.AssessmentToken(
                        "550e8400-e29b-41d4-a716-446655440000", "merchant@upi", BigDecimal.valueOf(300), "proceed", Instant.now().plusSeconds(300), List.of(), List.of(), "proceed rationale"
                ));

        String token = "test-token";
        PaymentResult result = payments.create(command(token, "key-low-balance", 300));

        assertThat(result.getStatus()).isEqualTo(PaymentStatus.REJECTED);
        verify(walletRepository, times(2)).findByUserId(userId.toString());
    }

    @Test
    void cannotReuseTokenWithAnotherIdempotencyKey() {
        AssessmentTokenService tokenService = mock(AssessmentTokenService.class);
        WalletRepository walletRepository = mock(WalletRepository.class);
        PaymentTransactionRepository transactionRepository = mock(PaymentTransactionRepository.class);
        OTPRepository otpRepository = mock(OTPRepository.class);
        UserRepository userRepository = mock(UserRepository.class);
        PaymentCommandService payments = new PaymentCommandService(tokenService, walletRepository, transactionRepository, otpRepository, userRepository);

        UUID userId = UUID.fromString("550e8400-e29b-41d4-a716-446655440000");
        Wallet wallet = new Wallet(userId, BigDecimal.valueOf(1000));
        when(walletRepository.findByUserId(eq(userId.toString()))).thenReturn(Optional.of(wallet));
        when(walletRepository.save(any(Wallet.class))).thenAnswer(inv -> inv.getArgument(0));
        when(transactionRepository.save(any(PaymentTransaction.class))).thenAnswer(inv -> inv.getArgument(0));
        when(transactionRepository.findByUserIdAndIdempotencyKey(eq(TEST_USER_ID_STR), eq("key-first"))).thenReturn(Optional.empty());
        when(transactionRepository.findByUserIdAndIdempotencyKey(eq(TEST_USER_ID_STR), eq("key-second"))).thenReturn(Optional.empty());

        // First call to consume succeeds, second call throws exception (token already consumed)
        when(tokenService.consume(anyString(), eq(TEST_USER_ID_STR), eq("merchant@upi"), eq(BigDecimal.valueOf(300))))
                .thenReturn(new AssessmentTokenService.AssessmentToken(
                        "550e8400-e29b-41d4-a716-446655440000", "merchant@upi", BigDecimal.valueOf(300), "proceed", Instant.now().plusSeconds(300), List.of(), List.of(), "proceed rationale"
                ))
                .thenThrow(new com.upisafeguard.core.risk.InvalidAssessmentTokenException("Assessment token is invalid or expired"));

        String token = "test-token";
        payments.create(command(token, "key-first", 300));

        assertThatThrownBy(() -> payments.create(command(token, "key-second", 300)))
                .hasMessageContaining("invalid or expired");
    }

    private static PaymentCommand command(String token, String key, int amount) {
        return new PaymentCommand(
                UUID.fromString("550e8400-e29b-41d4-a716-446655440000"),
                "merchant@upi",
                BigDecimal.valueOf(amount),
                token,
                key
        );
    }
}