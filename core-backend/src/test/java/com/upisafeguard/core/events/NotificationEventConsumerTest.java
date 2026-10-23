package com.upisafeguard.core.events;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.LinkedHashMap;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.upisafeguard.core.persistence.Notification;
import com.upisafeguard.core.persistence.NotificationRepository;
import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.UserRepository;

/**
 * Event → notification fanout contract. Runs against the real consumer (no
 * Kafka): the listener method receives serialised message strings exactly
 * like the container would deliver.
 */
class NotificationEventConsumerTest {

    private static final String USER_ID = "12345678-1234-1234-1234-123456789abc";

    private UserRepository userRepository;
    private NotificationRepository notificationRepository;
    private NotificationEventConsumer consumer;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        notificationRepository = mock(NotificationRepository.class);
        when(userRepository.findById(UUID.fromString(USER_ID))).thenReturn(Optional.of(new User()));
        consumer = new NotificationEventConsumer(userRepository, notificationRepository, mapper);
    }

    private String json(String eventType, String... keyValues) {
        LinkedHashMap<String, Object> fields = new LinkedHashMap<>();
        for (int i = 0; i + 1 < keyValues.length; i += 2) {
            fields.put(keyValues[i], keyValues[i + 1]);
        }
        try {
            return mapper.writeValueAsString(EventPublisherConfig.envelope(eventType, fields));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    @Test
    void transactionCompletedCreatesPaymentNotification() {
        consumer.onDomainEvent(json("TRANSACTION_COMPLETED",
                "user_id", USER_ID,
                "kind", "transfer",
                "transaction_id", "tx-1",
                "amount", "500.00",
                "recipient_upi", "someone@upi",
                "recipient_name", "Someone"));

        Notification saved = savedNotification();
        assertThat(saved.getType()).isEqualTo("transaction");
        assertThat(saved.getTitle()).isEqualTo("Payment successful");
        assertThat(saved.getMessage()).contains("500.00", "Someone");
        assertThat(saved.getUser()).isNotNull();
        assertThat(saved.getData()).contains("tx-1");
    }

    @Test
    void fraudReportedCreatesSecurityNotification() {
        consumer.onDomainEvent(json("FRAUD_REPORTED",
                "user_id", USER_ID,
                "report_id", "r-1",
                "scammer_upi", "scam@upi",
                "scam_type", "lottery"));

        Notification saved = savedNotification();
        assertThat(saved.getType()).isEqualTo("security");
        assertThat(saved.getTitle()).isEqualTo("Fraud report received");
        assertThat(saved.getMessage()).contains("scam@upi");
    }

    @Test
    void interventionRaisedCreatesSecurityNotification() {
        consumer.onDomainEvent(json("INTERVENTION_RAISED",
                "user_id", USER_ID,
                "intervention_id", "i-1",
                "intervention_level", "critical"));

        Notification saved = savedNotification();
        assertThat(saved.getType()).isEqualTo("security");
        assertThat(saved.getMessage()).contains("critical");
    }

    @Test
    void unknownUserCreatesNoNotification() {
        consumer.onDomainEvent(json("TRANSACTION_COMPLETED", "user_id", "not-a-uuid", "kind", "transfer"));
        verify(notificationRepository, never()).save(any(Notification.class));
    }

    @Test
    void malformedOrEmptyInputNeverCrashTheListener() {
        assertThatCode(() -> {
            consumer.onDomainEvent("not json at all");
            consumer.onDomainEvent(null);
            consumer.onDomainEvent("");
        }).doesNotThrowAnyException();
        verify(notificationRepository, never()).save(any(Notification.class));
    }

    private Notification savedNotification() {
        ArgumentCaptor<Notification> captor = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRepository).save(captor.capture());
        return captor.getValue();
    }
}
