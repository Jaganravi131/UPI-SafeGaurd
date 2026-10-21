package com.upisafeguard.core.risk;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

class AssessmentTokenServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-20T06:00:00Z");
    private static final Clock CLOCK = Clock.fixed(NOW, ZoneOffset.UTC);

    @Test
    void tokenIsBoundToPaymentAndCanOnlyBeConsumedOnce() {
        AssessmentTokenService service = new AssessmentTokenService(CLOCK);
        RiskAssessmentRequest request = request();
        RiskAssessmentResponse response = response();

        AssessmentTokenService.IssuedAssessment issued = service.issue(request, response);

        AssessmentTokenService.AssessmentToken consumed = service.consume(
                issued.token(),
                "user-1",
                "merchant@upi",
                BigDecimal.valueOf(300)
        );

        assertThat(consumed.recommendedAction()).isEqualTo("proceed");
        assertThat(consumed.expiresAt()).isEqualTo(NOW.plusSeconds(300));
        assertThatThrownBy(() -> service.consume(
                issued.token(),
                "user-1",
                "merchant@upi",
                BigDecimal.valueOf(300)
        )).isInstanceOf(InvalidAssessmentTokenException.class);
    }

    @Test
    void tokenCannotBeUsedForAnotherPayment() {
        AssessmentTokenService service = new AssessmentTokenService(CLOCK);
        AssessmentTokenService.IssuedAssessment issued = service.issue(request(), response());

        assertThatThrownBy(() -> service.consume(
                issued.token(),
                "user-1",
                "other@upi",
                BigDecimal.valueOf(300)
        )).isInstanceOf(InvalidAssessmentTokenException.class);
    }

    private static RiskAssessmentRequest request() {
        return new RiskAssessmentRequest(
                Map.of("transaction_id", "tx-1", "recipient_upi", "merchant@upi", "amount", 300),
                Map.of("id", "user-1"),
                Map.of("trust_score", 90)
        );
    }

    private static RiskAssessmentResponse response() {
        return new RiskAssessmentResponse(
                "risk-service-v1",
                "risk-engine-v1",
                "tx-1",
                "low",
                0.12,
                "proceed",
                false,
                List.of("normal profile"),
                0.8,
                0.12,
                List.of(),
                Map.of("primary_model", "xgboost-paysim-v1"),
                Map.of(),
                null,
                null
        );
    }
}
