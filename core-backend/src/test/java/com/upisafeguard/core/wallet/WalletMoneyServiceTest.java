package com.upisafeguard.core.wallet;

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
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

import org.springframework.http.HttpStatus;

import com.upisafeguard.core.persistence.PaymentTransaction;
import com.upisafeguard.core.persistence.PaymentTransactionRepository;
import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.UserRepository;
import com.upisafeguard.core.persistence.Wallet;
import com.upisafeguard.core.persistence.WalletRepository;
import com.upisafeguard.core.web.ApiRequestException;

@ExtendWith(MockitoExtension.class)
class WalletMoneyServiceTest {

    private static final UUID SENDER_ID = UUID.fromString("550e8400-e29b-41d4-a716-446655440000");
    private static final UUID RECEIVER_ID = UUID.fromString("550e8400-e29b-41d4-a716-446655440001");

    private final WalletRepository walletRepository = mock(WalletRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final PaymentTransactionRepository transactionRepository = mock(PaymentTransactionRepository.class);
    private final WalletMoneyService service = new WalletMoneyService(
            walletRepository, userRepository, transactionRepository);

    private User user(UUID id, String upiId, String phone, String name) {
        User user = new User();
        user.setId(id);
        user.setUpiId(upiId);
        user.setPhoneNumber(phone);
        user.setFullName(name);
        return user;
    }

    private void stubSaves() {
        when(walletRepository.save(any(Wallet.class))).thenAnswer(inv -> inv.getArgument(0));
        when(transactionRepository.save(any(PaymentTransaction.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    // ── Top-up ───────────────────────────────────────────────────────────────

    @Test
    void topUpCreditsWalletAndWritesSandboxLedger() {
        stubSaves();
        User sender = user(SENDER_ID, "sender@upisafeguard", "+919000000001", "Sender User");
        Wallet wallet = new Wallet(SENDER_ID, BigDecimal.valueOf(1000));
        when(walletRepository.findByUserId(SENDER_ID.toString())).thenReturn(Optional.of(wallet));

        WalletMoneyService.TopUpResult result = service.topUp(sender, BigDecimal.valueOf(500), "smoke");

        assertThat(result.balance()).isEqualByComparingTo(BigDecimal.valueOf(1500));
        assertThat(result.ledger().recipientUpi()).isEqualTo("topup@upisafeguard");
        assertThat(result.ledger().recipientName()).isEqualTo("Add Money (Sandbox Bank)");
        assertThat(result.ledger().status()).isEqualTo("completed");
    }

    @Test
    void topUpRejectsMoreThanCap() {
        User sender = user(SENDER_ID, "sender@upisafeguard", "+919000000001", "Sender User");

        assertThatThrownBy(() -> service.topUp(sender, BigDecimal.valueOf(20000), null))
                .isInstanceOfSatisfying(ApiRequestException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.getMessage()).contains("capped at Rs.10,000.00");
                });
    }

    @Test
    void topUpCreatedWalletForWalletlessUser() {
        stubSaves();
        User sender = user(SENDER_ID, "sender@upisafeguard", "+919000000001", "Sender User");
        when(walletRepository.findByUserId(SENDER_ID.toString())).thenReturn(Optional.empty());

        WalletMoneyService.TopUpResult result = service.topUp(sender, BigDecimal.valueOf(100), null);

        assertThat(result.balance()).isEqualByComparingTo(BigDecimal.valueOf(100));
        // Provision save + balance-apply save
        verify(walletRepository, times(2)).save(any(Wallet.class));
    }

    // ── Transfer ─────────────────────────────────────────────────────────────

    @Test
    void transferDebitsSenderCreditsReceiverAndLedgersBothSides() {
        stubSaves();
        User sender = user(SENDER_ID, "sender@upisafeguard", "+919000000001", "Sender User");
        User receiver = user(RECEIVER_ID, "receiver@upisafeguard", "+919000000002", "Receiver User");

        Wallet senderWallet = new Wallet(SENDER_ID, BigDecimal.valueOf(1000));
        Wallet receiverWallet = new Wallet(RECEIVER_ID, BigDecimal.valueOf(0));
        when(walletRepository.findByUserId(SENDER_ID.toString())).thenReturn(Optional.of(senderWallet));
        when(walletRepository.findByUserId(RECEIVER_ID.toString())).thenReturn(Optional.of(receiverWallet));
        when(userRepository.findByUpiId("receiver@upisafeguard")).thenReturn(Optional.of(receiver));

        WalletMoneyService.TransferResult result =
                service.transfer(sender, "receiver@upisafeguard", BigDecimal.valueOf(300), "p2p");

        assertThat(result.balance()).isEqualByComparingTo(BigDecimal.valueOf(700));
        assertThat(result.recipientName()).isEqualTo("Receiver User");
        assertThat(receiverWallet.getBalance()).isEqualByComparingTo(BigDecimal.valueOf(300));
        // Two ledger rows: sender debit + receiver credit
        verify(transactionRepository, times(2)).save(any(PaymentTransaction.class));
    }

    @Test
    void transferRejectsUnknownRecipient() {
        when(userRepository.findByUpiId("ghost@upi")).thenReturn(Optional.empty());
        User sender = user(SENDER_ID, "sender@upisafeguard", "+919000000001", "Sender User");

        assertThatThrownBy(() -> service.transfer(sender, "ghost@upi", BigDecimal.valueOf(100), null))
                .isInstanceOfSatisfying(ApiRequestException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
                    assertThat(e.getMessage()).contains("No UPI SafeGuard user found");
                });
    }

    @Test
    void transferRejectsSelfPayment() {
        User sender = user(SENDER_ID, "sender@upisafeguard", "+919000000001", "Sender User");
        when(userRepository.findByUpiId("sender@upisafeguard")).thenReturn(Optional.of(sender));

        assertThatThrownBy(() -> service.transfer(sender, "sender@upisafeguard", BigDecimal.valueOf(100), null))
                .isInstanceOfSatisfying(ApiRequestException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.getMessage()).isEqualTo("Cannot pay yourself");
                });
    }

    @Test
    void transferRejectsInsufficientBalance() {
        User sender = user(SENDER_ID, "sender@upisafeguard", "+919000000001", "Sender User");
        User receiver = user(RECEIVER_ID, "receiver@upisafeguard", "+919000000002", "Receiver User");

        Wallet senderWallet = new Wallet(SENDER_ID, BigDecimal.valueOf(50));
        when(walletRepository.findByUserId(eq(SENDER_ID.toString()))).thenReturn(Optional.of(senderWallet));
        when(userRepository.findByUpiId("receiver@upisafeguard")).thenReturn(Optional.of(receiver));

        assertThatThrownBy(() ->
                service.transfer(sender, "receiver@upisafeguard", BigDecimal.valueOf(100), null))
                .isInstanceOfSatisfying(ApiRequestException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.getMessage()).contains("Insufficient wallet balance. Available: Rs.50.00");
                });
    }

    @Test
    void transferRespectsDailyLimit() {
        User sender = user(SENDER_ID, "sender@upisafeguard", "+919000000001", "Sender User");
        User receiver = user(RECEIVER_ID, "receiver@upisafeguard", "+919000000002", "Receiver User");

        Wallet senderWallet = new Wallet(SENDER_ID, BigDecimal.valueOf(100000));
        senderWallet.setDailySpent(BigDecimal.valueOf(99900));
        when(walletRepository.findByUserId(SENDER_ID.toString())).thenReturn(Optional.of(senderWallet));
        when(userRepository.findByUpiId("receiver@upisafeguard")).thenReturn(Optional.of(receiver));

        // dailyLimit defaults to 1,00,000 → 99900+200 exceeds it
        assertThatThrownBy(() ->
                service.transfer(sender, "receiver@upisafeguard", BigDecimal.valueOf(200), null))
                .isInstanceOfSatisfying(ApiRequestException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.getMessage()).isEqualTo("Daily limit exceeded");
                });
        assertThat(senderWallet.getBalance()).isEqualByComparingTo(BigDecimal.valueOf(100000));
    }

    // ── User lookup ──────────────────────────────────────────────────────────

    @Test
    void getUserOr404RejectsMalformedUserId() {
        assertThatThrownBy(() -> service.getUserOr404("not-a-uuid"))
                .isInstanceOfSatisfying(ApiRequestException.class,
                        e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void getUserOr404ReturnsNotFoundForMissingUser() {
        when(userRepository.findById(SENDER_ID)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.getUserOr404(SENDER_ID.toString()))
                .isInstanceOfSatisfying(ApiRequestException.class,
                        e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));
    }
}
