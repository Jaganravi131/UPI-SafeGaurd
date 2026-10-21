package com.upisafeguard.core.payment;

import java.math.BigDecimal;
import java.util.UUID;

public record PaymentCommand(
        UUID userId,
        String recipientUpi,
        BigDecimal amount,
        String assessmentToken,
        String idempotencyKey
) {
}